alter table public.meal_services add column booking_cutoff timestamptz, add column attendance_locked boolean not null default false;
create table public.meal_attendance (
 id uuid primary key, service_id uuid not null references public.meal_services(id),flat_id uuid not null references public.flats(id),
 created_by uuid not null references public.society_memberships(user_id),version integer not null default 1,
 adults integer not null check(adults between 0 and 500),children integer not null check(children between 0 and 500),under_seven integer not null check(under_seven between 0 and 500),
 guest_adults integer not null check(guest_adults between 0 and 500),guest_children integer not null check(guest_children between 0 and 500),guest_under_seven integer not null check(guest_under_seven between 0 and 500),
 confirmed boolean not null default true,attended integer not null default 0 check(attended>=0),
 note text not null default '' check(length(note)<=300),updated_at timestamptz not null default now(),
 unique(service_id,flat_id),check(attended<=adults+children+under_seven+guest_adults+guest_children+guest_under_seven),check(confirmed or attended=0)
);
create table public.festival_events (
 id uuid primary key,festival_id uuid not null references public.festivals(id),service_date date not null,
 title text not null check(length(btrim(title)) between 2 and 100),
 category text not null check(category in ('Mahila Aarati','Veshbusha','Prasad distribution','Cultural programme','Other')),
 category_other text not null default '' check(length(category_other)<=120),
 version integer not null default 1,registration_closed boolean not null default false,
 check((category='Other' and length(btrim(category_other))>=2) or (category<>'Other' and category_other='')),
 foreign key(festival_id,service_date) references public.festival_days(festival_id,service_date) deferrable initially deferred
);
create table public.event_participants (
 id uuid primary key,event_id uuid not null references public.festival_events(id),flat_id uuid not null references public.flats(id),
 name text not null check(length(btrim(name)) between 2 and 100),
 category text not null check(category in ('Adult','Child','Family / group','Other')),
 category_other text not null default '' check(length(category_other)<=120),
 sequence integer not null check(sequence between 1 and 10000),theme text not null default '' check(length(theme)<=120),
 note text not null default '' check(length(note)<=300),attended boolean not null default false,cancelled boolean not null default false,
 created_by uuid not null references public.society_memberships(user_id),version integer not null default 1,updated_at timestamptz not null default now(),
 check(not(cancelled and attended)),check((category='Other' and length(btrim(category_other))>=2) or (category<>'Other' and category_other=''))
);
create unique index one_active_event_participant on public.event_participants(event_id,flat_id,lower(btrim(name))) where not cancelled;
create table public.catering_runs (
 id uuid primary key,service_id uuid not null unique references public.meal_services(id),vendor_id uuid not null references public.vendors(id),
 ordered integer not null check(ordered between 0 and 100000),served integer not null check(served between 0 and 100000),billed integer not null check(billed between 0 and 100000),
 unit_rate bigint not null check(unit_rate between 0 and 100000000),extras bigint not null check(extras between 0 and 100000000),
 note text not null default '' check(length(note)<=300),bill_id uuid unique references public.finance_entries(id),
 created_by uuid not null references public.society_memberships(user_id),version integer not null default 1,updated_at timestamptz not null default now(),
 check(billed::bigint*unit_rate+extras<=100000000)
);
create table public.catering_allocations (
 catering_id uuid not null references public.catering_runs(id),payment_id uuid not null references public.finance_entries(id),
 amount bigint not null check(amount between 0 and 100000000),version integer not null default 1,
 primary key(catering_id,payment_id)
);
-- Operational rosters are available only to assigned members; catering finances are admin-only.
alter table public.meal_attendance enable row level security;
alter table public.festival_events enable row level security;
alter table public.event_participants enable row level security;
alter table public.catering_runs enable row level security;
alter table public.catering_allocations enable row level security;
create policy attendance_read on public.meal_attendance for select to authenticated using(exists(select 1 from public.meal_services s where s.id=service_id and private.can_read_festival(s.festival_id)));
create policy events_read on public.festival_events for select to authenticated using(private.can_read_festival(festival_id));
create policy participants_read on public.event_participants for select to authenticated using(exists(select 1 from public.festival_events e where e.id=event_id and private.can_read_festival(e.festival_id)));
create policy catering_read on public.catering_runs for select to authenticated using(private.is_admin());
create policy catering_allocations_read on public.catering_allocations for select to authenticated using(private.is_admin());
revoke all on public.meal_attendance,public.festival_events,public.event_participants,public.catering_runs,public.catering_allocations from public,anon,authenticated;
grant select on public.meal_attendance,public.festival_events,public.event_participants,public.catering_runs,public.catering_allocations to authenticated;

create function public.save_attendance(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.meal_services;v public.meal_attendance;v_id uuid:=(p_input->>'id')::uuid;v_flat uuid:=(p_input->>'flat_id')::uuid;payload jsonb;
begin
 select * into s from public.meal_services where id=(p_input->>'service_id')::uuid;
 if not found then raise exception 'Meal service not found.';end if;
 perform private.assert_festival(s.festival_id);
 select * into s from public.meal_services where id=s.id;
 if s.coverage='not_served' then raise exception 'This meal is not served.';end if;
 if not exists(select 1 from public.festival_flats where festival_id=s.festival_id and flat_id=v_flat) then raise exception 'Choose a participating flat.';end if;
 select * into v from public.meal_attendance where id=v_id for update;
 payload:=jsonb_build_object('adults',(p_input->>'adults')::integer,'children',(p_input->>'children')::integer,'under_seven',(p_input->>'under_seven')::integer,'guest_adults',(p_input->>'guest_adults')::integer,'guest_children',(p_input->>'guest_children')::integer,'guest_under_seven',(p_input->>'guest_under_seven')::integer,'confirmed',(p_input->>'confirmed')::boolean,'note',btrim(coalesce(p_input->>'note','')));
 if v.id is not null and (v.service_id<>s.id or v.flat_id<>v_flat or (v.created_by<>auth.uid() and not private.is_admin())) then raise exception 'Only the creator or an admin can edit this roster row.' using errcode='42501';end if;
 if v.id is not null and (p_input->>'version')::integer=0 and v.version=1 and (to_jsonb(v)-array['id','service_id','flat_id','created_by','version','attended','updated_at'])=payload then return v_id;end if;
 if s.attendance_locked or (s.booking_cutoff is not null and s.booking_cutoff<=now()) then raise exception 'Meal list is closed. Ask an admin to reopen it or extend its cutoff.';end if;
 if v.id is not null then
  if v.version is distinct from (p_input->>'version')::integer then raise exception 'Attendance changed. Refresh.';end if;
  update public.meal_attendance set adults=(payload->>'adults')::integer,children=(payload->>'children')::integer,under_seven=(payload->>'under_seven')::integer,guest_adults=(payload->>'guest_adults')::integer,guest_children=(payload->>'guest_children')::integer,guest_under_seven=(payload->>'guest_under_seven')::integer,confirmed=(payload->>'confirmed')::boolean,note=payload->>'note',version=version+1,updated_at=now() where id=v.id;
 else
  if (p_input->>'version')::integer is distinct from 0 then raise exception 'Invalid new row version.';end if;
  insert into public.meal_attendance(id,service_id,flat_id,created_by,adults,children,under_seven,guest_adults,guest_children,guest_under_seven,confirmed,note)
  values(v_id,s.id,v_flat,auth.uid(),(payload->>'adults')::integer,(payload->>'children')::integer,(payload->>'under_seven')::integer,(payload->>'guest_adults')::integer,(payload->>'guest_children')::integer,(payload->>'guest_under_seven')::integer,(payload->>'confirmed')::boolean,payload->>'note');
 end if;
 insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'attendance.saved',v_id,jsonb_build_object('before',to_jsonb(v),'after',payload));return v_id;
end $$;

create function public.check_in_meal(p_id uuid,p_version integer,p_attended integer) returns void language plpgsql security definer set search_path='' as $$
declare v public.meal_attendance;f uuid;
begin
 select * into v from public.meal_attendance where id=p_id;
 select festival_id into f from public.meal_services where id=v.service_id;perform private.assert_festival(f);
 select * into v from public.meal_attendance where id=p_id for update;
 if v.version is distinct from p_version or not v.confirmed then raise exception 'Refresh the confirmed roster before check-in.';end if;
 update public.meal_attendance set attended=p_attended,version=version+1,updated_at=now() where id=p_id;
 insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'attendance.checked_in',p_id,jsonb_build_object('before',v.attended,'after',p_attended));
end $$;

create function public.set_meal_access(p_id uuid,p_version integer,p_locked boolean,p_cutoff timestamptz,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare s public.meal_services;
begin
 select * into s from public.meal_services where id=p_id;perform private.assert_festival(s.festival_id);perform private.assert_admin();
 select * into s from public.meal_services where id=p_id for update;
 if s.version is distinct from p_version or p_locked is null or length(btrim(coalesce(p_reason,''))) not between 3 and 300 then raise exception 'Refresh the service and provide a reason.';end if;
 update public.meal_services set attendance_locked=p_locked,booking_cutoff=p_cutoff,version=version+1 where id=p_id;
 insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'meal.access_changed',p_id,jsonb_build_object('locked',p_locked,'cutoff',p_cutoff,'reason',p_reason));
end $$;

create function public.save_festival_event(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v public.festival_events;v_id uuid:=(p_input->>'id')::uuid;f uuid:=(p_input->>'festival_id')::uuid;payload jsonb;
begin
 perform private.assert_festival(f);perform private.assert_admin();
 payload:=jsonb_build_object('festival_id',f,'service_date',(p_input->>'service_date')::date,'title',btrim(p_input->>'title'),'category',p_input->>'category','category_other',btrim(coalesce(p_input->>'category_other','')),'registration_closed',(p_input->>'registration_closed')::boolean);
 select * into v from public.festival_events where id=v_id for update;
 if v.id is not null then
  if v.festival_id<>f then raise exception 'Wrong festival.';end if;
  if (p_input->>'version')::integer=0 and v.version=1 and to_jsonb(v)-array['id','version']=payload then return v_id;end if;
  if v.version is distinct from (p_input->>'version')::integer then raise exception 'Event changed. Refresh.';end if;
  update public.festival_events set service_date=(payload->>'service_date')::date,title=payload->>'title',category=payload->>'category',category_other=payload->>'category_other',registration_closed=(payload->>'registration_closed')::boolean,version=version+1 where id=v_id;
 else
  if (p_input->>'version')::integer is distinct from 0 then raise exception 'Invalid new event version.';end if;
  insert into public.festival_events(id,festival_id,service_date,title,category,category_other,registration_closed) values(v_id,f,(payload->>'service_date')::date,payload->>'title',payload->>'category',payload->>'category_other',(payload->>'registration_closed')::boolean);
 end if;
 insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'event.saved',v_id,jsonb_build_object('before',to_jsonb(v),'after',payload));return v_id;
end $$;

create function public.save_event_participant(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.festival_events;v public.event_participants;v_id uuid:=(p_input->>'id')::uuid;payload jsonb;
begin
 select * into e from public.festival_events where id=(p_input->>'event_id')::uuid;perform private.assert_festival(e.festival_id);
 select * into e from public.festival_events where id=e.id;
 if not exists(select 1 from public.festival_flats where festival_id=e.festival_id and flat_id=(p_input->>'flat_id')::uuid) then raise exception 'Choose a participating flat.';end if;
 payload:=jsonb_build_object('event_id',e.id,'flat_id',(p_input->>'flat_id')::uuid,'name',btrim(p_input->>'name'),'category',p_input->>'category','category_other',btrim(coalesce(p_input->>'category_other','')),'sequence',(p_input->>'sequence')::integer,'theme',btrim(coalesce(p_input->>'theme','')),'note',btrim(coalesce(p_input->>'note','')),'cancelled',(p_input->>'cancelled')::boolean);
 select * into v from public.event_participants where id=v_id for update;
 if v.id is not null and (v.event_id<>e.id or (v.created_by<>auth.uid() and not private.is_admin())) then raise exception 'Only the creator or an admin can edit this participant.' using errcode='42501';end if;
 if v.id is not null and (p_input->>'version')::integer=0 and v.version=1 and to_jsonb(v)-array['id','created_by','version','updated_at','attended']=payload then return v_id;end if;
 if e.registration_closed then raise exception 'Event registration is closed. Ask an admin to reopen it.';end if;
 if v.id is not null then
  if v.version is distinct from (p_input->>'version')::integer then raise exception 'Participant changed. Refresh.';end if;
  update public.event_participants set flat_id=(payload->>'flat_id')::uuid,name=payload->>'name',category=payload->>'category',category_other=payload->>'category_other',sequence=(payload->>'sequence')::integer,theme=payload->>'theme',note=payload->>'note',cancelled=(payload->>'cancelled')::boolean,version=version+1,updated_at=now() where id=v_id;
 else
  if (p_input->>'version')::integer is distinct from 0 then raise exception 'Invalid new participant version.';end if;
  insert into public.event_participants(id,event_id,flat_id,name,category,category_other,sequence,theme,note,cancelled,created_by) values(v_id,e.id,(payload->>'flat_id')::uuid,payload->>'name',payload->>'category',payload->>'category_other',(payload->>'sequence')::integer,payload->>'theme',payload->>'note',(payload->>'cancelled')::boolean,auth.uid());
 end if;
 insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'participant.saved',v_id,jsonb_build_object('before',to_jsonb(v),'after',payload));return v_id;
end $$;

create function public.check_in_event(p_id uuid,p_version integer,p_attended boolean) returns void language plpgsql security definer set search_path='' as $$
declare v public.event_participants;f uuid;
begin
 select * into v from public.event_participants where id=p_id;select festival_id into f from public.festival_events where id=v.event_id;perform private.assert_festival(f);
 select * into v from public.event_participants where id=p_id for update;
 if v.version is distinct from p_version or v.cancelled then raise exception 'Refresh the active participant before check-in.';end if;
 update public.event_participants set attended=p_attended,version=version+1,updated_at=now() where id=p_id;
 insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'participant.checked_in',p_id,jsonb_build_object('before',v.attended,'after',p_attended));
end $$;
-- Prevent free-form finance edits from disagreeing with catering quantities.
alter function public.save_finance_entry(jsonb) rename to save_finance_entry_internal;
alter function public.save_finance_entry_internal(jsonb) set schema private;
revoke all on function private.save_finance_entry_internal(jsonb) from public,anon,authenticated;
create function public.save_finance_entry(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.catering_runs where bill_id=(p_input->>'id')::uuid) then raise exception 'Edit this bill through Catering quantities.';end if;
 return private.save_finance_entry_internal(p_input);
end $$;
alter function public.review_finance_entry(uuid,integer,text,text) rename to review_finance_entry_internal;
alter function public.review_finance_entry_internal(uuid,integer,text,text) set schema private;
revoke all on function private.review_finance_entry_internal(uuid,integer,text,text) from public,anon,authenticated;
create function public.review_finance_entry(p_id uuid,p_version integer,p_action text,p_reason text default '') returns void language plpgsql security definer set search_path='' as $$
declare f uuid;
begin
 select festival_id into f from public.finance_entries where id=p_id;perform private.assert_festival(f);
 if p_action='unlock' and exists(select 1 from public.catering_allocations where payment_id=p_id and amount>0) then raise exception 'Remove meal allocations before unlocking this payment.';end if;
 if p_action='void' and exists(select 1 from public.catering_runs where bill_id=p_id) then raise exception 'Set the billed total to zero in Catering to void this bill.';end if;
 perform private.review_finance_entry_internal(p_id,p_version,p_action,p_reason);
end $$;

create function public.save_catering(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.meal_services;v public.catering_runs;b public.finance_entries;v_id uuid:=(p_input->>'id')::uuid;
 v_vendor uuid:=(p_input->>'vendor_id')::uuid;total bigint;bill uuid;payload jsonb;
begin
 select * into s from public.meal_services where id=(p_input->>'service_id')::uuid;
 perform private.assert_festival(s.festival_id);perform private.assert_admin();
 select * into s from public.meal_services where id=s.id;
 if s.coverage='not_served' then raise exception 'Choose a served meal.';end if;
 if not exists(select 1 from public.vendors where id=v_vendor and festival_id=s.festival_id) then raise exception 'Choose a supplier in this festival.';end if;
 if coalesce(p_input->>'unit_rate','')!~'^[0-9]+$' or coalesce(p_input->>'extras','')!~'^[0-9]+$' then raise exception 'Use integer paise for catering amounts.';end if;
 total:=(p_input->>'billed')::bigint*(p_input->>'unit_rate')::bigint+(p_input->>'extras')::bigint;
 if total not between 0 and 100000000 then raise exception 'Catering total is outside the supported range.';end if;
 payload:=jsonb_build_object('service_id',s.id,'vendor_id',v_vendor,'ordered',(p_input->>'ordered')::integer,'served',(p_input->>'served')::integer,'billed',(p_input->>'billed')::integer,'unit_rate',(p_input->>'unit_rate')::bigint,'extras',(p_input->>'extras')::bigint,'note',btrim(coalesce(p_input->>'note','')));
 select * into v from public.catering_runs where id=v_id for update;
 if v.id is not null then
  if v.created_by<>auth.uid() or v.service_id<>s.id then raise exception 'Only the creator can edit this catering record.';end if;
  if (p_input->>'version')::integer=0 and v.version=1 and to_jsonb(v)-array['id','bill_id','created_by','version','updated_at']=payload then return v_id;end if;
  if v.version is distinct from (p_input->>'version')::integer then raise exception 'Catering record changed. Refresh.';end if;
  select * into b from public.finance_entries where id=v.bill_id for update;
  if b.id is not null and (b.status<>'pending' or b.version is distinct from (p_input->>'bill_version')::integer) then raise exception 'Refresh and unlock the catering bill before changing quantities or costs.';end if;
  if v.vendor_id<>v_vendor and exists(select 1 from public.catering_allocations where catering_id=v.id and amount>0) then raise exception 'Remove meal allocations before changing supplier.';end if;
 end if;
 if v.id is null and (p_input->>'version')::integer is distinct from 0 then raise exception 'Invalid new catering version.';end if;
 bill:=v.bill_id;
 if total>0 then
  bill:=private.save_finance_entry_internal(jsonb_build_object('id',coalesce(bill,gen_random_uuid()),'festival_id',s.festival_id,'version',coalesce(b.version,0),'kind','bill','occurred_on',s.service_date,'amount',total,'description','Catering · '||s.service_date::text||' · '||s.meal,'category','Catering','category_other','','reference','','account_id',null,'to_account_id',null,'flat_id',null,'vendor_id',v_vendor));
 elsif bill is not null then
  perform private.review_finance_entry_internal(bill,b.version,'void','Catering total changed to zero');bill:=null;
 end if;
 if v.id is null then
  insert into public.catering_runs(id,service_id,vendor_id,ordered,served,billed,unit_rate,extras,note,bill_id,created_by) values(v_id,s.id,v_vendor,(payload->>'ordered')::integer,(payload->>'served')::integer,(payload->>'billed')::integer,(payload->>'unit_rate')::bigint,(payload->>'extras')::bigint,payload->>'note',bill,auth.uid());
 else
  update public.catering_runs set vendor_id=v_vendor,ordered=(payload->>'ordered')::integer,served=(payload->>'served')::integer,billed=(payload->>'billed')::integer,unit_rate=(payload->>'unit_rate')::bigint,extras=(payload->>'extras')::bigint,note=payload->>'note',bill_id=bill,version=version+1,updated_at=now() where id=v_id;
 end if;
 insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'catering.saved',v_id,jsonb_build_object('before',to_jsonb(v),'after',payload,'bill_id',bill));return v_id;
end $$;

create function public.allocate_catering_payment(p_catering uuid,p_payment uuid,p_amount bigint,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare c public.catering_runs;p public.finance_entries;a public.catering_allocations;f uuid;used bigint;
begin
 select * into c from public.catering_runs where id=p_catering;select festival_id into f from public.meal_services where id=c.service_id;
 perform private.assert_festival(f);perform private.assert_admin();
 select * into c from public.catering_runs where id=p_catering;
 select * into p from public.finance_entries where id=p_payment for update;
 if p.kind is distinct from 'payment' or p.status is distinct from 'confirmed' or p.festival_id<>f or p.vendor_id<>c.vendor_id then raise exception 'Choose a confirmed payment to this supplier in this festival.';end if;
 select * into a from public.catering_allocations where catering_id=p_catering and payment_id=p_payment for update;
 if coalesce(a.version,0) is distinct from p_version then raise exception 'Allocation changed. Refresh.';end if;
 select coalesce(sum(amount),0) into used from public.catering_allocations where payment_id=p_payment and catering_id<>p_catering;
 if p_amount is null or p_amount<0 or used+p_amount>p.amount then raise exception 'Allocation exceeds available payment.';end if;
 insert into public.catering_allocations(catering_id,payment_id,amount) values(p_catering,p_payment,p_amount) on conflict(catering_id,payment_id) do update set amount=excluded.amount,version=public.catering_allocations.version+1;
 insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'catering.payment_allocated',p_catering,jsonb_build_object('payment_id',p_payment,'before',coalesce(a.amount,0),'after',p_amount));
end $$;

-- Existing bookings/catering must not silently move to different meal coverage or rates.
create function private.guard_meal_changes() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.coverage,new.guest_rate) is distinct from (old.coverage,old.guest_rate) and
 (exists(select 1 from public.meal_attendance where service_id=old.id) or exists(select 1 from public.catering_runs where service_id=old.id)) then raise exception 'Coverage and guest rate cannot change after attendance or catering is recorded.';end if;
 return new;
end $$;
create trigger protect_meal_coverage before update on public.meal_services for each row execute function private.guard_meal_changes();
revoke all on function private.guard_meal_changes() from public,anon,authenticated;

-- A single authorized read avoids row-limit truncation in exports and keeps finance details out of committee responses.
create function public.operations_data(p_festival uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.can_read_festival(p_festival) then raise exception 'Festival access required.' using errcode='42501';end if;
 result:=jsonb_build_object('as_of',now(),'festival',(select to_jsonb(f) from public.festivals f where id=p_festival),
 'days',coalesce((select jsonb_agg(to_jsonb(d) order by service_date) from public.festival_days d where festival_id=p_festival),'[]'),
 'flats',(public.finance_choices(p_festival)->'flats'),
 'services',coalesce((select jsonb_agg(to_jsonb(s) order by service_date,meal) from public.meal_services s where festival_id=p_festival),'[]'),
 'attendance',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.meal_attendance a join public.meal_services s on s.id=a.service_id where s.festival_id=p_festival),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(e) order by service_date,title) from public.festival_events e where festival_id=p_festival),'[]'),
 'participants',coalesce((select jsonb_agg(to_jsonb(p) order by sequence,name) from public.event_participants p join public.festival_events e on e.id=p.event_id where e.festival_id=p_festival),'[]'));
 if private.is_admin() then
  result:=result||jsonb_build_object('catering',coalesce((select jsonb_agg(to_jsonb(c)) from public.catering_runs c join public.meal_services s on s.id=c.service_id where s.festival_id=p_festival),'[]'),
  'allocations',coalesce((select jsonb_agg(to_jsonb(a)) from public.catering_allocations a join public.catering_runs c on c.id=a.catering_id join public.meal_services s on s.id=c.service_id where s.festival_id=p_festival),'[]'),
  'vendors',coalesce((select jsonb_agg(to_jsonb(v) order by name) from public.vendors v where festival_id=p_festival),'[]'),
  'finance',coalesce((select jsonb_agg(to_jsonb(e) order by number) from public.finance_entries e where festival_id=p_festival and kind in ('bill','payment')),'[]'));
 else
  result:=result||jsonb_build_object('catering_quantities',coalesce((select jsonb_agg(jsonb_build_object('service_id',c.service_id,'ordered',c.ordered,'served',c.served)) from public.catering_runs c join public.meal_services s on s.id=c.service_id where s.festival_id=p_festival),'[]'));
 end if;
 return result;
end $$;

revoke all on function public.save_attendance(jsonb),public.check_in_meal(uuid,integer,integer),public.set_meal_access(uuid,integer,boolean,timestamptz,text),public.save_festival_event(jsonb),public.save_event_participant(jsonb),public.check_in_event(uuid,integer,boolean),public.save_finance_entry(jsonb),public.review_finance_entry(uuid,integer,text,text),public.save_catering(jsonb),public.allocate_catering_payment(uuid,uuid,bigint,integer),public.operations_data(uuid) from public,anon,authenticated;
grant execute on function public.save_attendance(jsonb),public.check_in_meal(uuid,integer,integer),public.set_meal_access(uuid,integer,boolean,timestamptz,text),public.save_festival_event(jsonb),public.save_event_participant(jsonb),public.check_in_event(uuid,integer,boolean),public.save_finance_entry(jsonb),public.review_finance_entry(uuid,integer,text,text),public.save_catering(jsonb),public.allocate_catering_payment(uuid,uuid,bigint,integer),public.operations_data(uuid) to authenticated;
