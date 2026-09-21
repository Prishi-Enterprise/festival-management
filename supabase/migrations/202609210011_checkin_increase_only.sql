-- Saved meal admissions can only increase, except audited admin corrections.
create or replace function public.check_in_residents(p_enrollment uuid,p_service uuid,p_version integer,p_attended integer) returns void language plpgsql security definer set search_path='' as $$
declare e public.flat_enrollments;c public.resident_checkins;n integer;
begin
 select * into e from public.flat_enrollments where id=p_enrollment;perform private.assert_festival(e.festival_id);
 if not exists(select 1 from public.meal_services where id=p_service and festival_id=e.festival_id and coverage<>'not_served') then raise exception 'Wrong meal service.';end if;
 select * into c from public.resident_checkins where enrollment_id=e.id and service_id=p_service;
 if coalesce(c.version,0) is distinct from p_version then raise exception 'Attendance changed. Refresh before checking in.';end if;
 if p_attended < coalesce(c.attended,0) and not private.is_admin() then raise exception 'Saved check-in counts cannot be reduced by committee members. Ask an admin to correct the count.';end if;
 n:=jsonb_array_length(private.resident_members(e.id,p_service));
 if p_attended is null or p_attended<0 or (p_attended>n and not (private.is_admin() and p_attended < coalesce(c.attended,0))) then raise exception 'Admission exceeds eligible attendees. Confirm the fixed payment and selected package payment first.';end if;
 insert into public.resident_checkins(enrollment_id,service_id,attended) values(e.id,p_service,p_attended)
 on conflict(enrollment_id,service_id) do update set attended=excluded.attended,version=public.resident_checkins.version+1;
 insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'residents.checked_in',e.id,jsonb_build_object('service_id',p_service,'before',coalesce(c.attended,0),'after',p_attended));
end $$;
create or replace function public.check_in_guest(p_id uuid,p_service uuid,p_version integer,p_attended integer) returns void language plpgsql security definer set search_path='' as $$
declare g public.guest_bookings;s public.meal_services;
begin
 select * into s from public.meal_services where id=p_service;perform private.assert_festival(s.festival_id);
 select * into g from public.guest_bookings where id=p_id;
 if g.id is null or g.service_id<>s.id or g.cancelled or s.coverage='not_served' or g.version is distinct from p_version then raise exception 'Pass is cancelled, changed or for a different meal. Refresh.';end if;
 if p_attended < g.attended and not private.is_admin() then raise exception 'Saved check-in counts cannot be reduced by committee members. Ask an admin to correct the count.';end if;
 update public.guest_bookings set attended=p_attended,version=version+1 where id=g.id;
 insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'guest.checked_in',g.id,jsonb_build_object('before',g.attended,'after',p_attended));
end $$;
