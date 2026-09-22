-- Attendance passes have separate bearer codes from RSVP editing links.
alter table public.flat_enrollments add column attendance_code uuid not null unique default gen_random_uuid();
create function public.resident_pass(p_code uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'society',jsonb_build_object('name',soc.name,'logo_url',soc.logo_url,'theme_color',soc.theme_color),
 'festival',f.name,'flat',fl.block||'–'||fl.flat_number,'code',e.attendance_code,
 'registered',jsonb_array_length(e.members),'eligible',private.fixed_paid(e.id),
 'meals',coalesce((select jsonb_agg(jsonb_build_object('date',s.service_date,'meal',s.meal,'eligible',jsonb_array_length(private.resident_members(e.id,s.id)),'attended',coalesce(c.attended,0)) order by s.service_date,s.meal)
 from public.meal_services s left join public.resident_checkins c on c.service_id=s.id and c.enrollment_id=e.id
 where s.festival_id=f.id and s.coverage<>'not_served'),'[]'))
 from public.flat_enrollments e join public.festivals f on f.id=e.festival_id join public.flats fl on fl.id=e.flat_id join public.societies soc on soc.id=f.society_id
 where e.attendance_code=p_code;
$$;
revoke all on function public.resident_pass(uuid) from public,anon,authenticated;
grant execute on function public.resident_pass(uuid) to anon,authenticated;
