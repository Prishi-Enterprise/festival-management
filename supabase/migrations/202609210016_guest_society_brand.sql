alter function public.guest_pass(uuid) rename to guest_pass_before_society;
alter function public.guest_pass_before_society(uuid) set schema private;
revoke all on function private.guest_pass_before_society(uuid) from public,anon,authenticated;
create function public.guest_pass(p_code uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select private.guest_pass_before_society(p_code)||jsonb_build_object('society',jsonb_build_object('name',s.name,'logo_url',s.logo_url,'theme_color',s.theme_color)) from public.guest_bookings g join public.meal_services m on m.id=g.service_id join public.festivals f on f.id=m.festival_id join public.societies s on s.id=f.society_id where g.pass_code=p_code;
$$;
revoke all on function public.guest_pass(uuid) from public;
grant execute on function public.guest_pass(uuid) to anon,authenticated;
