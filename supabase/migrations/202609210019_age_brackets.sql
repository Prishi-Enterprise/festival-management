alter function public.save_festival(jsonb) rename to save_festival_before_ages;
alter function public.save_festival_before_ages(jsonb) set schema private;
revoke all on function private.save_festival_before_ages(jsonb) from public,anon,authenticated;
create function public.save_festival(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare lo integer:=coalesce((p_input->'rates'->>'child_min_age')::integer,7); hi integer:=coalesce((p_input->'rates'->>'child_max_age')::integer,10); oldrates jsonb; fid uuid:=(p_input->>'id')::uuid;
begin
 perform private.assert_admin();
 if lo not between 0 and 17 or hi not between lo and 17 then raise exception 'Child ages must be ordered between 0 and 17.';end if;
 if fid is not null then
  perform private.assert_festival(fid);perform 1 from public.festivals where id=fid for update;
  select rates into oldrates from public.pricing_versions where festival_id=fid order by version desc limit 1;
  if (lo,hi) is distinct from (coalesce((oldrates->>'child_min_age')::integer,7),coalesce((oldrates->>'child_max_age')::integer,10)) and
  (exists(select 1 from public.flat_enrollments where festival_id=fid) or exists(select 1 from public.guest_bookings g join public.meal_services s on s.id=g.service_id where s.festival_id=fid)) then raise exception 'Age brackets cannot change after attendee registration. Existing age groups must keep their meaning.';end if;
 end if;
 return private.save_festival_before_ages(jsonb_set(p_input,'{rates}',(p_input->'rates')||jsonb_build_object('child_min_age',lo,'child_max_age',hi)));
end $$;
revoke all on function public.save_festival(jsonb) from public,anon;
grant execute on function public.save_festival(jsonb) to authenticated;
alter function public.operations_data(uuid) rename to operations_data_before_ages;
alter function public.operations_data_before_ages(uuid) set schema private;
revoke all on function private.operations_data_before_ages(uuid) from public,anon,authenticated;
create function public.operations_data(p_festival uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb; rates jsonb;
begin
 r:=private.operations_data_before_ages(p_festival);
 select p.rates into rates from public.pricing_versions p where festival_id=p_festival order by version desc limit 1;
 return r||jsonb_build_object('age_brackets',jsonb_build_object('child_min_age',coalesce((rates->>'child_min_age')::integer,7),'child_max_age',coalesce((rates->>'child_max_age')::integer,10)));
end $$;
revoke all on function public.operations_data(uuid) from public,anon;
grant execute on function public.operations_data(uuid) to authenticated;
