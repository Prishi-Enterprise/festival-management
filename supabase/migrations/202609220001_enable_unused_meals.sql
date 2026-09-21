-- Enrollment protects existing entitlements, but must not prevent completing
-- previously unconfigured days. Used services retain their original terms.
create or replace function private.guard_meal_changes() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (new.coverage,new.guest_rate) is not distinct from (old.coverage,old.guest_rate) then return new; end if;
 if exists(select 1 from public.guest_bookings where service_id=old.id or old.id=any(included_services))
    or exists(select 1 from public.resident_checkins where service_id=old.id)
    or exists(select 1 from public.guest_meal_checkins where service_id=old.id)
    or exists(select 1 from public.catering_runs where service_id=old.id) then
   raise exception 'This meal has bookings, check-ins or catering records. Its coverage and legacy guest rate cannot change.';
 end if;
 if exists(select 1 from public.flat_enrollments where festival_id=old.festival_id)
    and not (old.coverage='not_served' and new.coverage in ('fixed','package') and new.guest_rate is not distinct from old.guest_rate) then
   raise exception 'Existing enrolled meal coverage cannot change. You can enable unused Not served meals as fixed or package coverage.';
 end if;
 return new;
end $$;
revoke all on function private.guard_meal_changes() from public,anon,authenticated;
