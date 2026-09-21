-- Preserve service IDs used by attendance, guest passes and catering.
alter table public.meal_services drop constraint meal_services_meal_check;
alter table public.meal_services add constraint meal_services_meal_check check(length(btrim(meal)) between 1 and 60 and meal=btrim(meal));
create or replace function public.save_meal_calendar(p_festival uuid,p_services jsonb) returns void language plpgsql security definer set search_path='' as $$
declare s jsonb; v_old public.meal_services; v_count integer; v_rate bigint; v_meals integer;
begin
 perform private.assert_festival(p_festival);perform private.assert_admin();
 perform 1 from public.festivals where id=p_festival for update;
 if jsonb_typeof(p_services) is distinct from 'array' then raise exception 'Add meals and configure their daily coverage.'; end if;
 if jsonb_array_length(p_services) not between 1 and 620 then raise exception 'Configure between 1 and 20 meals for each festival date.'; end if;
 if exists(select 1 from jsonb_array_elements(p_services) where value->>'meal' is null or length(btrim(value->>'meal')) not between 1 and 60 or value->>'meal' <> btrim(value->>'meal')) then raise exception 'Enter meal names of 1 to 60 characters.';end if;
 select count(distinct value->>'meal') into v_meals from jsonb_array_elements(p_services);
 if v_meals>20 or v_meals<>(select count(distinct lower(value->>'meal')) from jsonb_array_elements(p_services)) then raise exception 'Use up to 20 distinct meal names.';end if;
 select count(*)*v_meals into v_count from public.festival_days where festival_id=p_festival;
 if jsonb_array_length(p_services)<>v_count then raise exception 'Configure every added meal for every festival date.';end if;
 if (select count(distinct (value->>'service_date',value->>'meal')) from jsonb_array_elements(p_services))<>v_count then raise exception 'Duplicate meal services.';end if;
 if exists(select 1 from jsonb_array_elements(p_services) submitted where not exists(select 1 from public.festival_days d where d.festival_id=p_festival and d.service_date=(submitted->>'service_date')::date)) then raise exception 'Meal date must belong to the festival.';end if;
 if exists(select 1 from public.meal_services m where m.festival_id=p_festival and not exists(select 1 from jsonb_array_elements(p_services) submitted where submitted->>'meal'=m.meal and (submitted->>'service_date')::date=m.service_date)) then raise exception 'Keep saved meals in the calendar; mark unused meals Not served.';end if;
 for s in select value from jsonb_array_elements(p_services) loop
  if s->>'coverage' is null or s->>'coverage' not in ('fixed','package','not_served') then raise exception 'Choose a meal coverage option.';end if;
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
