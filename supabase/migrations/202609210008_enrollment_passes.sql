-- Replace manual daily lists with payment-linked household enrollment and guest passes.
drop function public.save_attendance(jsonb);
drop function public.check_in_meal(uuid,integer,integer);
create table public.flat_enrollments (
 id uuid primary key default gen_random_uuid(),festival_id uuid not null references public.festivals(id),flat_id uuid not null references public.flats(id),
 members jsonb not null check(jsonb_typeof(members)='array' and jsonb_array_length(members) between 1 and 100),
 fixed_rate bigint not null check(fixed_rate>=0),created_by uuid not null references public.society_memberships(user_id),
 unique(festival_id,flat_id)
);
create table public.package_members (
 entry_id uuid primary key references public.finance_entries(id),enrollment_id uuid not null references public.flat_enrollments(id),member_ids jsonb not null check(jsonb_typeof(member_ids)='array')
);
create table public.free_package_members (
 enrollment_id uuid primary key references public.flat_enrollments(id),member_ids jsonb not null check(jsonb_typeof(member_ids)='array')
);
alter table public.free_package_members enable row level security;
revoke all on public.free_package_members from public,anon,authenticated;
create table public.resident_checkins (
 enrollment_id uuid not null references public.flat_enrollments(id),service_id uuid not null references public.meal_services(id),
 attended integer not null check(attended between 0 and 100),version integer not null default 1,
 primary key(enrollment_id,service_id)
);
create table public.guest_bookings (
 id uuid primary key,pass_code uuid not null unique default gen_random_uuid(),service_id uuid not null references public.meal_services(id),flat_id uuid not null references public.flats(id),
 adults integer not null check(adults between 0 and 500),children integer not null check(children between 0 and 500),under_seven integer not null check(under_seven between 0 and 500),
 note text not null default '' check(length(note)<=300),cancelled boolean not null default false,attended integer not null default 0,
 created_by uuid not null references public.society_memberships(user_id),version integer not null default 1,
 check(adults+children+under_seven>0),check(attended between 0 and adults+children+under_seven),check(not cancelled or attended=0)
);
alter table public.flat_enrollments enable row level security;
alter table public.package_members enable row level security;
alter table public.resident_checkins enable row level security;
alter table public.guest_bookings enable row level security;
revoke all on public.flat_enrollments,public.package_members,public.resident_checkins,public.guest_bookings from public,anon,authenticated;
-- All operational reads go through the authorized aggregate, not direct tables.
create function private.fixed_paid(p_enrollment uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select coalesce(sum(case when f.kind='collection' then f.amount else -f.amount end),0)>=e.fixed_rate
 and count(*) filter(where f.kind='collection')>0
 from public.finance_entries f where f.festival_id=e.festival_id and f.flat_id=e.flat_id and f.category='Fixed contribution' and f.status='confirmed' and f.kind in ('collection','refund')) ,false)
 from public.flat_enrollments e where id=p_enrollment;
$$;
create function private.resident_members(p_enrollment uuid,p_service uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(m), '[]') from public.flat_enrollments e
 join public.meal_services s on s.id=p_service and s.festival_id=e.festival_id
 cross join lateral jsonb_array_elements(e.members) m
 where e.id=p_enrollment and private.fixed_paid(e.id) and
 (s.coverage='fixed' or (s.coverage='package' and exists(select 1 from public.package_members pm join public.finance_entries f on f.id=pm.entry_id
 where pm.enrollment_id=e.id and f.status='confirmed' and pm.member_ids ? (m->>'id'))
 or (s.coverage='package' and exists(select 1 from public.free_package_members fp where fp.enrollment_id=e.id and fp.member_ids ? (m->>'id')))));
$$;
-- A receipt and its enrollment are one transaction. Enrollment is reused for split receipts.
create function public.save_flat_payment(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.flat_enrollments;f uuid:=(p_input->>'festival_id')::uuid;flat uuid:=(p_input->>'flat_id')::uuid;
 old_receipt public.finance_entries; receipt uuid;members jsonb:=p_input->'members';ids jsonb:=coalesce(p_input->'member_ids','[]');m jsonb;rate bigint;
begin
 perform private.assert_festival(f);
 if p_input->>'kind' is distinct from 'collection' or coalesce(p_input->>'category','') not in ('Fixed contribution','Meal package') then raise exception 'Choose a fixed contribution or meal-package payment.';end if;
 if exists(select 1 from public.catering_runs where bill_id=(p_input->>'id')::uuid) then raise exception 'Use Catering for this bill.';end if;
 select * into old_receipt from public.finance_entries where id=(p_input->>'id')::uuid;
 if old_receipt.id is not null then
  if old_receipt.flat_id is distinct from flat or old_receipt.festival_id<>f or old_receipt.kind<>'collection' or old_receipt.category<>p_input->>'category' then raise exception 'A linked payment cannot change flat or purpose.';end if;
  if (p_input->>'version')::integer=0 and p_input->>'category'='Meal package' and ids is distinct from (select member_ids from public.package_members where entry_id=old_receipt.id) then raise exception 'Retry changed package attendees. Refresh before editing.';end if;
 end if;
 select * into e from public.flat_enrollments where festival_id=f and flat_id=flat;
 if e.id is null then
  if p_input->>'category'<>'Fixed contribution' then raise exception 'Register the fixed attendees first.';end if;
  if members is null or jsonb_typeof(members)<>'array' or jsonb_array_length(members) not between 1 and 100 then raise exception 'Enter fixed attendees.';end if;
  for m in select value from jsonb_array_elements(members) loop
   if length(btrim(coalesce(m->>'name',''))) not between 2 and 100 or coalesce(m->>'age_group','') not in ('adult','child','under_seven') or m->>'id' is null then raise exception 'Each attendee needs a name, identifier and age group.';end if;
   perform (m->>'id')::uuid;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(members))<>jsonb_array_length(members) then raise exception 'Duplicate attendee.';end if;
  select (rates->>'fixed')::bigint into rate from public.pricing_versions where festival_id=f order by version desc limit 1;
  insert into public.flat_enrollments(festival_id,flat_id,members,fixed_rate,created_by) values(f,flat,members,rate,auth.uid()) returning * into e;
 elsif members is not null and members<>e.members then
  raise exception 'Fixed attendees are already registered. Reuse that list; additions must be guests.';
 end if;
 if p_input->>'category'='Meal package' then
  if jsonb_typeof(ids)<>'array' or jsonb_array_length(ids)=0 or exists(select 1 from jsonb_array_elements_text(ids) i where not exists(select 1 from jsonb_array_elements(e.members) member_row where member_row->>'id'=i)) then raise exception 'Select package members from the fixed attendees.';end if;
  if (select count(distinct value) from jsonb_array_elements_text(ids))<>jsonb_array_length(ids) then raise exception 'Duplicate package attendee.';end if;
 end if;
 if (p_input->>'amount')::bigint=0 then
  if p_input->>'category'<>'Meal package' or old_receipt.id is not null or exists(select 1 from jsonb_array_elements(e.members) child where ids ? (child->>'id') and child->>'age_group'<>'under_seven') then raise exception 'Zero contribution is only for under-seven package members.';end if;
  insert into public.free_package_members(enrollment_id,member_ids) values(e.id,ids) on conflict(enrollment_id) do update set member_ids=(select jsonb_agg(distinct value) from jsonb_array_elements(public.free_package_members.member_ids||excluded.member_ids));
  insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'package.free_registered',e.id,jsonb_build_object('member_ids',ids));
  return e.id;
 end if;
 receipt:=private.save_finance_entry_internal(p_input);
 delete from public.package_members where entry_id=receipt;
 if p_input->>'category'='Meal package' then insert into public.package_members(entry_id,enrollment_id,member_ids) values(receipt,e.id,ids);end if;
 insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'enrollment.payment_saved',e.id,jsonb_build_object('entry_id',receipt,'category',p_input->>'category','member_ids',ids));
 return receipt;
end $$;
-- Protect operationally linked receipts from generic editing.
create or replace function public.save_finance_entry(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_festival((p_input->>'festival_id')::uuid);
 if exists(select 1 from public.catering_runs where bill_id=(p_input->>'id')::uuid) then raise exception 'Edit this bill through Catering quantities.';end if;
 if (p_input->>'kind'='collection' and p_input->>'category' in ('Fixed contribution','Meal package')) or exists(select 1 from public.package_members where entry_id=(p_input->>'id')::uuid) then raise exception 'Use the flat payment form to keep attendees linked.';end if;
 return private.save_finance_entry_internal(p_input);
end $$;
create function public.check_in_residents(p_enrollment uuid,p_service uuid,p_version integer,p_attended integer) returns void language plpgsql security definer set search_path='' as $$
declare e public.flat_enrollments;c public.resident_checkins;n integer;
begin
 select * into e from public.flat_enrollments where id=p_enrollment;perform private.assert_festival(e.festival_id);
 if not exists(select 1 from public.meal_services where id=p_service and festival_id=e.festival_id and coverage<>'not_served') then raise exception 'Wrong meal service.';end if;
 select * into c from public.resident_checkins where enrollment_id=e.id and service_id=p_service;
 if coalesce(c.version,0) is distinct from p_version then raise exception 'Attendance changed. Refresh before checking in.';end if;
 n:=jsonb_array_length(private.resident_members(e.id,p_service));
 if p_attended is null or p_attended<0 or p_attended>n then raise exception 'Admission exceeds eligible attendees. Confirm the fixed payment and selected package payment first.';end if;
 insert into public.resident_checkins(enrollment_id,service_id,attended) values(e.id,p_service,p_attended)
 on conflict(enrollment_id,service_id) do update set attended=excluded.attended,version=public.resident_checkins.version+1;
 insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'residents.checked_in',e.id,jsonb_build_object('service_id',p_service,'before',coalesce(c.attended,0),'after',p_attended));
end $$;
create function public.save_guest_booking(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.meal_services;v public.guest_bookings;v_id uuid:=(p_input->>'id')::uuid;payload jsonb;
begin
 select * into s from public.meal_services where id=(p_input->>'service_id')::uuid;perform private.assert_festival(s.festival_id);
 select * into s from public.meal_services where id=s.id;
 if s.coverage='not_served' or s.guest_rate is null then raise exception 'Configure this meal and its guest rate first.';end if;
 if not exists(select 1 from public.festival_flats where festival_id=s.festival_id and flat_id=(p_input->>'flat_id')::uuid) then raise exception 'Choose a participating flat.';end if;
 payload:=jsonb_build_object('service_id',s.id,'flat_id',(p_input->>'flat_id')::uuid,'adults',(p_input->>'adults')::integer,'children',(p_input->>'children')::integer,'under_seven',(p_input->>'under_seven')::integer,'note',btrim(coalesce(p_input->>'note','')),'cancelled',(p_input->>'cancelled')::boolean);
 select * into v from public.guest_bookings g where g.id=v_id;
 if v.id is not null and (v.created_by<>auth.uid() or v.service_id<>s.id or v.flat_id<>(p_input->>'flat_id')::uuid) then raise exception 'Only the creator can edit this guest booking.';end if;
 if v.id is not null and (p_input->>'version')::integer=0 and v.version=1 and to_jsonb(v)-array['id','pass_code','created_by','version','attended']=payload then return v_id;end if;
 if s.attendance_locked or (s.booking_cutoff is not null and s.booking_cutoff<=now()) then raise exception 'Guest registration is closed for this meal.';end if;
 if v.id is null then
  if (p_input->>'version')::integer is distinct from 0 then raise exception 'Invalid booking version.';end if;
  insert into public.guest_bookings(id,service_id,flat_id,adults,children,under_seven,note,cancelled,created_by) values(v_id,s.id,(payload->>'flat_id')::uuid,(payload->>'adults')::integer,(payload->>'children')::integer,(payload->>'under_seven')::integer,payload->>'note',(payload->>'cancelled')::boolean,auth.uid());
 else
  if v.version is distinct from (p_input->>'version')::integer then raise exception 'Booking changed. Refresh.';end if;
  update public.guest_bookings g set adults=(payload->>'adults')::integer,children=(payload->>'children')::integer,under_seven=(payload->>'under_seven')::integer,note=payload->>'note',cancelled=(payload->>'cancelled')::boolean,version=g.version+1 where g.id=v_id;
 end if;
 insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'guest.saved',v_id,jsonb_build_object('before',to_jsonb(v),'after',payload));return v_id;
end $$;
create function public.check_in_guest(p_id uuid,p_service uuid,p_version integer,p_attended integer) returns void language plpgsql security definer set search_path='' as $$
declare g public.guest_bookings;s public.meal_services;
begin
 select * into s from public.meal_services where id=p_service;perform private.assert_festival(s.festival_id);
 select * into g from public.guest_bookings where id=p_id;
 if g.id is null or g.service_id<>s.id or g.cancelled or s.coverage='not_served' or g.version is distinct from p_version then raise exception 'Pass is cancelled, changed or for a different meal. Refresh.';end if;
 update public.guest_bookings set attended=p_attended,version=version+1 where id=g.id;
 insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'guest.checked_in',g.id,jsonb_build_object('before',g.attended,'after',p_attended));
end $$;
create function public.guest_pass(p_code uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('festival',f.name,'date',s.service_date,'meal',s.meal,'count',g.adults+g.children+g.under_seven,'attended',g.attended,'cancelled',g.cancelled,'code',g.pass_code)
 from public.guest_bookings g join public.meal_services s on s.id=g.service_id join public.festivals f on f.id=s.festival_id where g.pass_code=p_code;
$$;
-- Build roster dynamically: payment reversal changes eligibility without erasing past check-ins.
alter function public.operations_data(uuid) rename to operations_data_base;
alter function public.operations_data_base(uuid) set schema private;
revoke all on function private.operations_data_base(uuid) from public,anon,authenticated;
create function public.operations_data(p_festival uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;roster jsonb;
begin
 r:=private.operations_data_base(p_festival);
 select coalesce(jsonb_agg(x),'[]') into roster from (
 select e.id,s.id service_id,e.flat_id,e.created_by,coalesce(c.version,0) version,
 (select count(*) from jsonb_array_elements(private.resident_members(e.id,s.id)) m where m->>'age_group'='adult') adults,
 (select count(*) from jsonb_array_elements(private.resident_members(e.id,s.id)) m where m->>'age_group'='child') children,
 (select count(*) from jsonb_array_elements(private.resident_members(e.id,s.id)) m where m->>'age_group'='under_seven') under_seven,
 0 guest_adults,0 guest_children,0 guest_under_seven,private.fixed_paid(e.id) confirmed,coalesce(c.attended,0) attended,'' note
 from public.flat_enrollments e join public.meal_services s on s.festival_id=e.festival_id and s.coverage<>'not_served' left join public.resident_checkins c on c.enrollment_id=e.id and c.service_id=s.id where e.festival_id=p_festival
 union all select g.id,g.service_id,g.flat_id,g.created_by,g.version,0,0,0,g.adults,g.children,g.under_seven,not g.cancelled,g.attended,g.note
 from public.guest_bookings g join public.meal_services s on s.id=g.service_id where s.festival_id=p_festival
 ) x;
 return r||jsonb_build_object('attendance',roster,
 'enrollments',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('eligible',private.fixed_paid(e.id))) from public.flat_enrollments e where festival_id=p_festival),'[]'),
 'package_members',coalesce((select jsonb_agg(to_jsonb(p)) from public.package_members p join public.flat_enrollments e on e.id=p.enrollment_id where e.festival_id=p_festival),'[]'),
 'guests',coalesce((select jsonb_agg(to_jsonb(g)) from public.guest_bookings g join public.meal_services s on s.id=g.service_id where s.festival_id=p_festival),'[]'));
end $$;
create or replace function private.guard_meal_changes() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.coverage,new.guest_rate) is distinct from (old.coverage,old.guest_rate) and
 (exists(select 1 from public.flat_enrollments where festival_id=old.festival_id) or exists(select 1 from public.guest_bookings where service_id=old.id) or exists(select 1 from public.catering_runs where service_id=old.id)) then raise exception 'Coverage and guest rate cannot change after enrollment, guest booking or catering. Configure the calendar first.';end if;return new;
end $$;
revoke all on function private.fixed_paid(uuid),private.resident_members(uuid,uuid),public.save_flat_payment(jsonb),public.check_in_residents(uuid,uuid,integer,integer),public.save_guest_booking(jsonb),public.check_in_guest(uuid,uuid,integer,integer),public.operations_data(uuid),public.guest_pass(uuid) from public,anon,authenticated;
grant execute on function public.save_flat_payment(jsonb),public.check_in_residents(uuid,uuid,integer,integer),public.save_guest_booking(jsonb),public.check_in_guest(uuid,uuid,integer,integer),public.operations_data(uuid) to authenticated;
grant execute on function public.guest_pass(uuid) to anon,authenticated;
