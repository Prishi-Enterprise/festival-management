alter table public.flats add column active boolean not null default true;
alter table public.flats drop constraint flats_society_id_block_flat_number_key;
create unique index active_flat_number on public.flats(society_id,block,flat_number) where active;
create or replace function public.add_flats(p_block text,p_flats text[]) returns void language plpgsql security definer set search_path='' as $$
declare b text:=upper(btrim(p_block)); n text;
begin
 perform private.assert_admin();
 if b is null or b !~ '^[A-Z0-9-]{1,12}$' or coalesce(cardinality(p_flats),0) not between 1 and 500 then raise exception 'Enter a block and between 1 and 500 flat numbers.';end if;
 foreach n in array p_flats loop
  if n is null or btrim(n) !~ '^[A-Za-z0-9-]{1,12}$' then raise exception 'Invalid flat number.';end if;
  insert into public.flats(society_id,block,flat_number) values(private.current_society(),b,upper(btrim(n))) on conflict(society_id,block,flat_number) where active do nothing;
 end loop;
 insert into public.audit_events(actor_id,action,details) values(auth.uid(),'flats.added',jsonb_build_object('block',b,'flats',p_flats));
end $$;
create function public.deactivate_flats(p_ids uuid[]) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.assert_admin();
 if coalesce(cardinality(p_ids),0) not between 1 and 2000 or exists(select 1 from unnest(p_ids) wanted(id) where not exists(select 1 from public.flats f where f.id=wanted.id and f.society_id=private.current_society())) then raise exception 'Choose flats in this society.';end if;
 update public.flats set active=false where id=any(p_ids) and society_id=private.current_society();
 insert into public.audit_events(actor_id,action,details) values(auth.uid(),'flats.deactivated',jsonb_build_object('society_id',private.current_society(),'flat_ids',p_ids));
end $$;
revoke all on function public.deactivate_flats(uuid[]) from public,anon;
grant execute on function public.deactivate_flats(uuid[]) to authenticated;
-- Keep historical festival membership even when a setup form is saved again.
alter function public.save_festival(jsonb) rename to save_festival_before_flat_status;
alter function public.save_festival_before_flat_status(jsonb) set schema private;
revoke all on function private.save_festival_before_flat_status(jsonb) from public,anon,authenticated;
create function public.save_festival(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare fid uuid:=(p_input->>'id')::uuid; ids jsonb;
begin
 perform private.assert_admin();
 if fid is not null then perform private.assert_festival(fid);end if;
 if exists(select 1 from jsonb_array_elements_text(p_input->'flat_ids') i join public.flats f on f.id=i.value::uuid where not f.active and not exists(select 1 from public.festival_flats ff where ff.festival_id=fid and ff.flat_id=f.id)) then raise exception 'Inactive flats cannot be added to a festival.';end if;
 select coalesce(jsonb_agg(id),'[]') into ids from (
 select value::uuid id from jsonb_array_elements_text(p_input->'flat_ids')
 union select f.id from public.flats f join public.festival_flats ff on ff.flat_id=f.id where ff.festival_id=fid and not f.active
 ) kept;
 return private.save_festival_before_flat_status(jsonb_set(p_input,'{flat_ids}',ids));
end $$;
revoke all on function public.save_festival(jsonb) from public,anon;
grant execute on function public.save_festival(jsonb) to authenticated;
-- New attendee registrations cannot point at retired flats; existing records remain usable.
create function private.require_active_flat() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.flats where id=new.flat_id and active) then raise exception 'This flat is inactive. Choose the corrected active record.';end if;
 return new;
end $$;
create trigger active_enrollment_flat before insert on public.flat_enrollments for each row execute function private.require_active_flat();
create trigger active_guest_flat before insert on public.guest_bookings for each row execute function private.require_active_flat();
revoke all on function private.require_active_flat() from public,anon,authenticated;
