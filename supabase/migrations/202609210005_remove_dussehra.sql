-- Meal services are the sole source of coverage. Keep applied migration history intact.
drop index public.one_dussehra_per_festival;
alter table public.festival_days drop column is_dussehra;

create or replace function public.save_festival(p_input jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := coalesce((p_input->>'id')::uuid,gen_random_uuid()); v_old public.festivals;
  v_count integer := (p_input->>'day_count')::integer; v_rates jsonb := p_input->'rates';
  v_day jsonb; v_key text; v_previous date; v_date date; v_i integer := 0; v_price_version integer;
begin
  -- Serializes member assignment changes with membership activation/revocation.
  perform 1 from public.societies for update;
  perform private.assert_admin();
  if p_input->>'id' is not null then
    select * into v_old from public.festivals where id=v_id for update;
    if not found or v_old.version is distinct from (p_input->>'version')::integer then raise exception 'Festival changed. Refresh before saving.'; end if;
  elsif (p_input->>'version')::integer is distinct from 0 then raise exception 'Invalid new festival version.';
  end if;
  if v_count is null or v_count not between 1 and 31 or jsonb_typeof(p_input->'days') is distinct from 'array' or jsonb_array_length(p_input->'days')<>v_count then raise exception 'Provide one calendar row for every festival day (1–31).'; end if;
  if v_rates is null or jsonb_typeof(v_rates)<>'object' then raise exception 'Charges are required.'; end if;
  foreach v_key in array array['fixed','adult','child','under_seven'] loop
    if coalesce(v_rates->>v_key,'') !~ '^[0-9]+$' or (v_rates->>v_key)::numeric>100000000 then raise exception 'Charges must be nonnegative integer paise.'; end if;
  end loop;
  if (v_rates->>'under_seven')::bigint<>0 then raise exception 'Under-seven contribution must be zero.'; end if;
  if not(v_rates ? 'guest') or (v_rates->>'guest' is not null and (v_rates->>'guest' !~ '^[0-9]+$' or (v_rates->>'guest')::numeric>100000000)) then raise exception 'Guest rate must be blank or nonnegative integer paise.'; end if;
  if coalesce(v_rates->>'household_policy','') not in ('unconfirmed','all_residents') or coalesce(v_rates->>'guest_age_policy','') not in ('unconfirmed','same_rate','under_seven_free') then raise exception 'Choose valid meal policies.'; end if;
  for v_day in select value from jsonb_array_elements(p_input->'days') loop
    v_i := v_i+1; v_date := (v_day->>'service_date')::date;
    if v_date is null or (v_day->>'day_number')::integer is distinct from v_i or (v_i=1 and v_date is distinct from (p_input->>'start_date')::date) or (v_previous is not null and v_date<=v_previous) then raise exception 'Calendar dates must be ordered and match the start date.'; end if;
    v_previous:=v_date;
  end loop;
  if jsonb_typeof(p_input->'flat_ids') is distinct from 'array' or jsonb_typeof(p_input->'member_ids') is distinct from 'array' then raise exception 'Flats and committee assignments are required.'; end if;
  if p_input->>'status'='ready' and (v_rates->>'guest' is null or v_rates->>'household_policy'='unconfirmed' or v_rates->>'guest_age_policy'='unconfirmed' or jsonb_array_length(p_input->'flat_ids')=0) then raise exception 'Choose flats, guest rate and meal policies before marking setup ready.'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_input->'member_ids') ids where not exists(select 1 from public.society_memberships m where m.user_id=ids.value::uuid and m.active)) then raise exception 'Assign only active committee accounts.'; end if;
  insert into public.festivals(id,name,start_date,day_count,status,created_by)
    values(v_id,btrim(p_input->>'name'),(p_input->>'start_date')::date,v_count,p_input->>'status',auth.uid())
    on conflict(id) do update set name=excluded.name,start_date=excluded.start_date,day_count=excluded.day_count,status=excluded.status,version=public.festivals.version+1,updated_at=now();
  delete from public.festival_days where festival_id=v_id;
  insert into public.festival_days(festival_id,day_number,service_date,label)
    select v_id,(d->>'day_number')::integer,(d->>'service_date')::date,btrim(d->>'label') from jsonb_array_elements(p_input->'days') d;
  delete from public.festival_flats where festival_id=v_id;
  insert into public.festival_flats(festival_id,flat_id) select v_id,value::uuid from jsonb_array_elements_text(p_input->'flat_ids');
  -- Invalidate a People form opened before an assignment change in Festivals.
  update public.society_memberships m set version=version+1
  where exists(select 1 from public.festival_memberships a where a.festival_id=v_id and a.user_id=m.user_id)
    is distinct from exists(select 1 from jsonb_array_elements_text(p_input->'member_ids') i where i.value::uuid=m.user_id);
  delete from public.festival_memberships where festival_id=v_id;
  insert into public.festival_memberships(festival_id,user_id) select v_id,value::uuid from jsonb_array_elements_text(p_input->'member_ids');
  select coalesce(max(version),0) into v_price_version from public.pricing_versions where festival_id=v_id;
  if not exists(select 1 from public.pricing_versions where festival_id=v_id and version=v_price_version and rates=v_rates) then
    insert into public.pricing_versions(festival_id,version,rates,created_by) values(v_id,v_price_version+1,v_rates,auth.uid());
  end if;
  insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'festival.saved',v_id,jsonb_build_object('version',coalesce(v_old.version,0)+1));
  return v_id;
end;
$$;
