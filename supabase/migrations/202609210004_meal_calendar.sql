create table public.meal_services (
 id uuid primary key default gen_random_uuid(), festival_id uuid not null references public.festivals(id),
 service_date date not null, meal text not null check(meal in ('breakfast','lunch','dinner')),
 coverage text not null check(coverage in ('fixed','package','not_served')),
 guest_rate bigint check(guest_rate between 0 and 100000000),
 version integer not null default 1, unique(festival_id,service_date,meal),
 foreign key(festival_id,service_date) references public.festival_days(festival_id,service_date) deferrable initially deferred
);
alter table public.meal_services enable row level security;
create policy service_read on public.meal_services for select to authenticated using(private.can_read_festival(festival_id));
revoke all on public.meal_services from public,anon,authenticated;
grant select on public.meal_services to authenticated;
create function public.save_meal_calendar(p_festival uuid,p_services jsonb) returns void language plpgsql security definer set search_path='' as $$
declare s jsonb; v_old public.meal_services; v_count integer; v_rate bigint;
begin
 perform private.assert_festival(p_festival);perform private.assert_admin();
 select count(*)*3 into v_count from public.festival_days where festival_id=p_festival;
 if jsonb_typeof(p_services) is distinct from 'array' or jsonb_array_length(p_services)<>v_count then raise exception 'Configure breakfast, lunch and dinner for every festival date.';end if;
 if (select count(distinct (value->>'service_date',value->>'meal')) from jsonb_array_elements(p_services))<>v_count then raise exception 'Duplicate meal services.';end if;
 for s in select value from jsonb_array_elements(p_services) loop
  if s->>'coverage' is null or s->>'coverage' not in ('fixed','package','not_served') then raise exception 'Choose a meal coverage option.';end if;
  if s->>'meal' is null or s->>'meal' not in ('breakfast','lunch','dinner') then raise exception 'Invalid meal type.';end if;
  if not exists(select 1 from public.festival_days where festival_id=p_festival and service_date=(s->>'service_date')::date) then raise exception 'Meal date must belong to the festival.';end if;
  if s->>'guest_rate' is not null and (s->>'guest_rate' !~ '^[0-9]+$' or (s->>'guest_rate')::numeric>100000000) then raise exception 'Guest rate must be nonnegative integer paise.';end if;
  v_rate:=(s->>'guest_rate')::bigint;
  select * into v_old from public.meal_services where festival_id=p_festival and service_date=(s->>'service_date')::date and meal=s->>'meal' for update;
  if found then
   if v_old.version is distinct from (s->>'version')::integer then raise exception 'Meal calendar changed. Refresh before saving.';end if;
   update public.meal_services set coverage=s->>'coverage',guest_rate=v_rate,version=version+1 where id=v_old.id;
  else
   if (s->>'version')::integer is distinct from 0 then raise exception 'Meal calendar changed. Refresh before saving.';end if;
   insert into public.meal_services(festival_id,service_date,meal,coverage,guest_rate) values(p_festival,(s->>'service_date')::date,s->>'meal',s->>'coverage',v_rate);
  end if;
 end loop;
 insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'meal_calendar.saved',p_festival,jsonb_build_object('services',p_services));
end $$;
revoke all on function public.save_meal_calendar(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_meal_calendar(uuid,jsonb) to authenticated;
