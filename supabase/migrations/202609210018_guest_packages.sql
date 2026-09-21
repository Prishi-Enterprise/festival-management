-- One-day guest packages are independent of resident coverage.
create table public.guest_packages (
 id uuid primary key default gen_random_uuid(), festival_id uuid not null references public.festivals(id),
 name text not null check(length(btrim(name)) between 1 and 80), service_date date not null,
 price bigint not null check(price between 0 and 100000000), service_ids uuid[] not null check(cardinality(service_ids) between 1 and 20),
 active boolean not null default true, version integer not null default 1,
 foreign key(festival_id,service_date) references public.festival_days(festival_id,service_date) deferrable initially deferred
);
alter table public.guest_packages enable row level security;
revoke all on public.guest_packages from public,anon,authenticated;
grant select on public.guest_packages to authenticated;
create policy package_read on public.guest_packages for select to authenticated using(private.can_read_festival(festival_id));
alter table public.guest_bookings add column package_id uuid references public.guest_packages(id), add column package_name text, add column unit_price bigint, add column included_services uuid[];
create table public.guest_meal_checkins (
 guest_id uuid not null references public.guest_bookings(id), service_id uuid not null references public.meal_services(id),
 attended integer not null default 0 check(attended>=0), primary key(guest_id,service_id)
);
alter table public.guest_meal_checkins enable row level security;
revoke all on public.guest_meal_checkins from public,anon,authenticated;
create function public.save_guest_package(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v public.guest_packages; fid uuid:=(p_input->>'festival_id')::uuid; pid uuid:=coalesce(nullif(p_input->>'id','')::uuid,gen_random_uuid()); ids uuid[];
begin
 perform private.assert_festival(fid); perform private.assert_admin();
 perform 1 from public.festivals where id=fid for update;
 select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_input->'service_ids');
 if cardinality(ids) is null or cardinality(ids) not between 1 and 20 or cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Select meals for the guest pass.';end if;
 if exists(select 1 from unnest(ids) x where not exists(select 1 from public.meal_services s where s.id=x and s.festival_id=fid and s.service_date=(p_input->>'service_date')::date)) then raise exception 'All included meals must be on the selected day in this festival.';end if;
 select * into v from public.guest_packages where id=pid for update;
 if v.id is not null and (v.festival_id<>fid or v.version is distinct from (p_input->>'version')::integer) then raise exception 'Guest package changed. Refresh.';end if;
 if v.id is null and (p_input->>'version')::integer is distinct from 0 then raise exception 'Invalid package version.';end if;
 insert into public.guest_packages(id,festival_id,name,service_date,price,service_ids,active)
 values(pid,fid,btrim(p_input->>'name'),(p_input->>'service_date')::date,(p_input->>'price')::bigint,ids,(p_input->>'active')::boolean)
 on conflict(id) do update set name=excluded.name,service_date=excluded.service_date,price=excluded.price,service_ids=excluded.service_ids,active=excluded.active,version=public.guest_packages.version+1;
 insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'guest_package.saved',pid,jsonb_build_object('before',to_jsonb(v),'after',p_input));return pid;
end $$;
revoke all on function public.save_guest_package(jsonb) from public,anon;
grant execute on function public.save_guest_package(jsonb) to authenticated;

alter function public.save_guest_payment(jsonb) rename to save_guest_payment_single;
alter function public.save_guest_payment_single(jsonb) set schema private;
revoke all on function private.save_guest_payment_single(jsonb) from public,anon,authenticated;
create function public.save_guest_payment(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.guest_packages; g public.guest_bookings; gid uuid:=coalesce(nullif(p_input->>'guest_id','')::uuid,(p_input->>'id')::uuid); primary_service uuid;
begin
 perform private.assert_festival((p_input->>'festival_id')::uuid);
 if nullif(p_input->>'package_id','') is null then return private.save_guest_payment_single(p_input); end if;
 select * into p from public.guest_packages where id=(p_input->>'package_id')::uuid for share;
 if p.id is null or p.festival_id is distinct from (p_input->>'festival_id')::uuid then raise exception 'Choose a guest package in this festival.';end if;
 select * into g from public.guest_bookings where id=gid for update;
 if g.id is null then
  if not p.active then raise exception 'Guest package is no longer available.';end if;
  if exists(select 1 from public.meal_services where id=any(p.service_ids) and (attendance_locked or booking_cutoff<=now())) then raise exception 'Guest registration is closed for an included meal.';end if;
  if not exists(select 1 from public.festival_flats where festival_id=p.festival_id and flat_id=(p_input->>'flat_id')::uuid) then raise exception 'Choose a participating flat.';end if;
  primary_service:=p.service_ids[1];
  insert into public.guest_bookings(id,service_id,flat_id,adults,children,under_seven,note,created_by,package_id,package_name,unit_price,included_services)
  values(gid,primary_service,(p_input->>'flat_id')::uuid,(p_input->>'adults')::integer,(p_input->>'children')::integer,(p_input->>'under_seven')::integer,coalesce(p_input->>'note',''),auth.uid(),p.id,p.name,p.price,p.service_ids);
 else
  if g.package_id is distinct from p.id then raise exception 'Keep the original guest package for linked payments.';end if;
  if nullif(p_input->>'guest_id','') is null and (g.adults,g.children,g.under_seven) is distinct from ((p_input->>'adults')::integer,(p_input->>'children')::integer,(p_input->>'under_seven')::integer) then raise exception 'Pass already exists with different guest counts.';end if;
  primary_service:=g.service_id;
 end if;
 return private.save_guest_payment_single(p_input||jsonb_build_object('guest_id',gid,'service_id',primary_service));
end $$;
revoke all on function public.save_guest_payment(jsonb) from public,anon;
grant execute on function public.save_guest_payment(jsonb) to authenticated;

alter function public.check_in_guest(uuid,uuid,integer,integer) rename to check_in_guest_single;
alter function public.check_in_guest_single(uuid,uuid,integer,integer) set schema private;
revoke all on function private.check_in_guest_single(uuid,uuid,integer,integer) from public,anon,authenticated;
create function public.check_in_guest(p_id uuid,p_service uuid,p_version integer,p_attended integer) returns void language plpgsql security definer set search_path='' as $$
declare g public.guest_bookings; previous integer;
begin
 select * into g from public.guest_bookings where id=p_id for update;
 if g.package_id is null then perform private.check_in_guest_single(p_id,p_service,p_version,p_attended);return;end if;
 perform private.assert_festival((select festival_id from public.meal_services where id=g.service_id));
 if not p_service=any(g.included_services) or g.cancelled or g.version is distinct from p_version then raise exception 'Pass is cancelled, changed or excludes this meal. Refresh.';end if;
 select attended into previous from public.guest_meal_checkins where guest_id=g.id and service_id=p_service;
 if p_attended is null or p_attended<0 or p_attended>g.adults+g.children+g.under_seven then raise exception 'Admission exceeds the guest allowance.';end if;
 if p_attended<coalesce(previous,0) and not private.is_admin() then raise exception 'Only admins can reduce saved check-ins.';end if;
 insert into public.guest_meal_checkins values(g.id,p_service,p_attended) on conflict(guest_id,service_id) do update set attended=excluded.attended;
 update public.guest_bookings set version=version+1 where id=g.id;
 insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'guest.checked_in',g.id,jsonb_build_object('service_id',p_service,'before',coalesce(previous,0),'after',p_attended));
end $$;
revoke all on function public.check_in_guest(uuid,uuid,integer,integer) from public,anon;
grant execute on function public.check_in_guest(uuid,uuid,integer,integer) to authenticated;

alter function public.save_guest_booking(jsonb) rename to save_guest_booking_single;
alter function public.save_guest_booking_single(jsonb) set schema private;
revoke all on function private.save_guest_booking_single(jsonb) from public,anon,authenticated;
create function public.save_guest_booking(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare g public.guest_bookings; n integer;
begin
 select * into g from public.guest_bookings where id=(p_input->>'id')::uuid for update;
 if g.package_id is null then return private.save_guest_booking_single(p_input);end if;
 perform private.assert_festival((select festival_id from public.meal_services where id=g.service_id));
 if g.created_by<>auth.uid() or g.version is distinct from (p_input->>'version')::integer or g.flat_id is distinct from (p_input->>'flat_id')::uuid or not (p_input->>'service_id')::uuid=any(g.included_services) then raise exception 'Booking changed or creator access required.';end if;
 if exists(select 1 from public.meal_services where id=any(g.included_services) and (attendance_locked or booking_cutoff<=now())) then raise exception 'Guest registration is closed.';end if;
 n:=(p_input->>'adults')::integer+(p_input->>'children')::integer+(p_input->>'under_seven')::integer;
 if exists(select 1 from public.guest_meal_checkins where guest_id=g.id and (attended>n or (attended>0 and (p_input->>'cancelled')::boolean))) then raise exception 'Correct meal check-ins before reducing or cancelling this pass.';end if;
 update public.guest_bookings set adults=(p_input->>'adults')::integer,children=(p_input->>'children')::integer,under_seven=(p_input->>'under_seven')::integer,note=btrim(coalesce(p_input->>'note','')),cancelled=(p_input->>'cancelled')::boolean,version=version+1 where id=g.id;
 insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'guest.saved',g.id,jsonb_build_object('before',to_jsonb(g),'after',p_input));return g.id;
end $$;
revoke all on function public.save_guest_booking(jsonb) from public,anon;
grant execute on function public.save_guest_booking(jsonb) to authenticated;

alter function public.operations_data(uuid) rename to operations_data_before_packages;
alter function public.operations_data_before_packages(uuid) set schema private;
revoke all on function private.operations_data_before_packages(uuid) from public,anon,authenticated;
create function public.operations_data(p_festival uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
 r:=private.operations_data_before_packages(p_festival);
 return r||jsonb_build_object(
 'guest_packages',coalesce((select jsonb_agg(p) from public.guest_packages p where festival_id=p_festival),'[]'),
 'services',coalesce((select jsonb_agg(s||jsonb_build_object('guest_available',exists(select 1 from public.guest_packages p where p.festival_id=p_festival and p.active and (s->>'id')::uuid=any(p.service_ids)) or exists(select 1 from public.guest_bookings g where (s->>'id')::uuid=any(g.included_services)))) from jsonb_array_elements(r->'services') s),'[]'),
 'guests',coalesce((select jsonb_agg(g||jsonb_build_object('checkins',coalesce((select jsonb_agg(c) from public.guest_meal_checkins c where c.guest_id=(g->>'id')::uuid),'[]'))) from jsonb_array_elements(r->'guests') g),'[]'),
 'attendance',coalesce((select jsonb_agg(a) from jsonb_array_elements(r->'attendance') a where not exists(select 1 from public.guest_bookings g where g.id=(a->>'id')::uuid and g.package_id is not null)),'[]') ||
 coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'service_id',sid,'flat_id',g.flat_id,'created_by',g.created_by,'version',g.version,'adults',0,'children',0,'under_seven',0,'guest_adults',g.adults,'guest_children',g.children,'guest_under_seven',g.under_seven,'confirmed',not g.cancelled,'attended',coalesce(c.attended,0),'note',g.note)) from public.guest_bookings g join public.meal_services s on s.id=g.service_id cross join unnest(g.included_services) sid left join public.guest_meal_checkins c on c.guest_id=g.id and c.service_id=sid where s.festival_id=p_festival and g.package_id is not null),'[]'));
end $$;
revoke all on function public.operations_data(uuid) from public,anon;
grant execute on function public.operations_data(uuid) to authenticated;
alter function public.guest_pass(uuid) rename to guest_pass_before_packages;
alter function public.guest_pass_before_packages(uuid) set schema private;
revoke all on function private.guest_pass_before_packages(uuid) from public,anon,authenticated;
create function public.guest_pass(p_code uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select private.guest_pass_before_packages(p_code)||jsonb_build_object('package_name',g.package_name,'meals',coalesce((select jsonb_agg(jsonb_build_object('meal',s.meal,'date',s.service_date,'attended',coalesce(c.attended,0)) order by s.meal) from public.meal_services s left join public.guest_meal_checkins c on c.guest_id=g.id and c.service_id=s.id where s.id=any(g.included_services)),'[]')) from public.guest_bookings g where g.pass_code=p_code;
$$;
revoke all on function public.guest_pass(uuid) from public;
grant execute on function public.guest_pass(uuid) to anon,authenticated;
-- Meal names may change without changing service identities. Removal is only for unused meals.
create function public.manage_meal(p_festival uuid,p_meal text,p_name text default null) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_festival(p_festival);perform private.assert_admin();
 perform 1 from public.festivals where id=p_festival for update;
 if not exists(select 1 from public.meal_services where festival_id=p_festival and meal=p_meal) then raise exception 'Meal changed. Refresh.';end if;
 if p_name is not null then
  if length(btrim(p_name)) not between 1 and 60 then raise exception 'Enter a meal name of 1 to 60 characters.';end if;
  if exists(select 1 from public.meal_services where festival_id=p_festival and lower(meal)=lower(btrim(p_name)) and meal<>p_meal) then raise exception 'A meal with that name already exists.';end if;
  update public.meal_services set meal=btrim(p_name),version=version+1 where festival_id=p_festival and meal=p_meal;
 else
  if exists(select 1 from public.meal_services s where festival_id=p_festival and meal=p_meal and (
   exists(select 1 from public.guest_packages p where s.id=any(p.service_ids)) or
   exists(select 1 from public.guest_bookings g where g.service_id=s.id or s.id=any(g.included_services)) or
   exists(select 1 from public.resident_checkins c where c.service_id=s.id) or
   exists(select 1 from public.catering_runs c where c.service_id=s.id) or
   (s.coverage<>'not_served' and exists(select 1 from public.flat_enrollments e where e.festival_id=p_festival)))) then raise exception 'Meal is in use by enrollment, passes, attendance or catering and cannot be removed.';end if;
  delete from public.meal_services where festival_id=p_festival and meal=p_meal;
 end if;
 insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'meal.managed',p_festival,jsonb_build_object('old_name',p_meal,'new_name',p_name));
end $$;
revoke all on function public.manage_meal(uuid,text,text) from public,anon;
grant execute on function public.manage_meal(uuid,text,text) to authenticated;

create or replace function public.save_catering(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.meal_services;v public.catering_runs;b public.finance_entries;v_id uuid:=(p_input->>'id')::uuid;
 v_vendor uuid:=(p_input->>'vendor_id')::uuid;total bigint;bill uuid;payload jsonb;
begin
 select * into s from public.meal_services where id=(p_input->>'service_id')::uuid;
 perform private.assert_festival(s.festival_id);perform private.assert_admin();
 select * into s from public.meal_services where id=s.id;
 if s.coverage='not_served' and not exists(select 1 from public.guest_packages p where s.id=any(p.service_ids) and p.active) and not exists(select 1 from public.guest_bookings g where s.id=any(g.included_services)) then raise exception 'Choose a served meal.';end if;
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

create or replace function private.save_guest_booking_internal(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.meal_services;v public.guest_bookings;v_id uuid:=(p_input->>'id')::uuid;payload jsonb;
begin
 select * into s from public.meal_services where id=(p_input->>'service_id')::uuid;perform private.assert_festival(s.festival_id);
 select * into s from public.meal_services where id=s.id;
 if s.coverage='not_served' or s.guest_rate is null then raise exception 'Configure this meal and its guest rate first.';end if;
 if not exists(select 1 from public.festival_flats where festival_id=s.festival_id and flat_id=(p_input->>'flat_id')::uuid) then raise exception 'Choose a participating flat.';end if;
 payload:=jsonb_build_object('service_id',s.id,'flat_id',(p_input->>'flat_id')::uuid,'adults',(p_input->>'adults')::integer,'children',(p_input->>'children')::integer,'under_seven',(p_input->>'under_seven')::integer,'note',btrim(coalesce(p_input->>'note','')),'cancelled',(p_input->>'cancelled')::boolean);
 select * into v from public.guest_bookings g where g.id=v_id;
 if v.id is not null and (v.created_by<>auth.uid() or v.service_id<>s.id or v.flat_id<>(p_input->>'flat_id')::uuid) then raise exception 'Only the creator can edit this guest booking.';end if;
 if v.id is not null and (p_input->>'version')::integer=0 and v.version=1 and to_jsonb(v)-array['id','pass_code','created_by','version','attended','package_id','package_name','unit_price','included_services']=payload then return v_id;end if;
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
