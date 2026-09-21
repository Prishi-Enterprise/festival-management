-- Private, unguessable flat RSVP links. Phone numbers are never a lookup/auth key.
alter table public.flat_enrollments add column contact_phone text check(contact_phone ~ '^\+[1-9][0-9]{7,14}$'), add column rsvp_code uuid not null unique default gen_random_uuid();
create table public.resident_rsvps(enrollment_id uuid not null references public.flat_enrollments,service_date date not null,attendees integer not null check(attendees between 0 and 100),version integer not null default 1,updated_at timestamptz not null default now(),primary key(enrollment_id,service_date));
alter table public.resident_rsvps enable row level security;
revoke all on public.resident_rsvps from public,anon,authenticated;
alter function public.save_flat_payment(jsonb) rename to save_flat_payment_base;
alter function public.save_flat_payment_base(jsonb) set schema private;
revoke all on function private.save_flat_payment_base(jsonb) from public,anon,authenticated;
create function public.save_flat_payment(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.flat_enrollments; receipt uuid; phone text:=nullif(btrim(p_input->>'contact_phone'),'');begin
 perform private.assert_festival((p_input->>'festival_id')::uuid);
 select * into e from public.flat_enrollments where festival_id=(p_input->>'festival_id')::uuid and flat_id=(p_input->>'flat_id')::uuid;
 if e.id is null and (phone is null or phone !~ '^\+[1-9][0-9]{7,14}$') then raise exception 'Enter one contact phone number with country code for this flat.';end if;
 if phone is not null and phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Enter a valid phone number with country code.';end if;
 receipt:=private.save_flat_payment_base(p_input);
 -- Phone changes after registration are deliberate, audited actions, not receipt edits.
 if e.id is null then update public.flat_enrollments set contact_phone=phone where festival_id=(p_input->>'festival_id')::uuid and flat_id=(p_input->>'flat_id')::uuid;end if;
 return receipt;
end $$;
create function public.update_flat_contact(p_enrollment uuid,p_phone text,p_rotate boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare e public.flat_enrollments;begin
 select * into e from public.flat_enrollments where id=p_enrollment;perform private.assert_festival(e.festival_id);perform private.assert_admin();
 if p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Enter a valid phone number with country code.';end if;
 update public.flat_enrollments set contact_phone=p_phone,rsvp_code=case when p_rotate then gen_random_uuid() else rsvp_code end where id=e.id;
 insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'flat.contact_updated',e.id,jsonb_build_object('link_rotated',p_rotate));
end $$;
create function public.resident_rsvp(p_code uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('society',jsonb_build_object('name',soc.name,'logo_url',soc.logo_url,'theme_color',soc.theme_color),'festival',f.name,'flat',fl.block||'–'||fl.flat_number,'maximum',jsonb_array_length(e.members),'phone_hint',right(e.contact_phone,4),'days',coalesce((select jsonb_agg(jsonb_build_object('date',d.service_date,'label',d.label,'attendees',coalesce(r.attendees,jsonb_array_length(e.members)),'version',coalesce(r.version,0),'open',d.service_date>=(now() at time zone soc.timezone)::date and exists(select 1 from public.meal_services s where s.festival_id=f.id and s.service_date=d.service_date and s.coverage<>'not_served' and not s.attendance_locked and (s.booking_cutoff is null or now()<s.booking_cutoff))) order by d.day_number) from public.festival_days d left join public.resident_rsvps r on r.enrollment_id=e.id and r.service_date=d.service_date where d.festival_id=f.id),'[]'))
 from public.flat_enrollments e join public.festivals f on f.id=e.festival_id join public.flats fl on fl.id=e.flat_id join public.societies soc on soc.id=f.society_id where e.rsvp_code=p_code and e.contact_phone is not null;
$$;
create function public.save_resident_rsvp(p_code uuid,p_date date,p_attendees integer,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare e public.flat_enrollments;r public.resident_rsvps;tz text;begin
 select * into e from public.flat_enrollments where rsvp_code=p_code and contact_phone is not null for update;
 if not found then raise exception 'This RSVP link is not available.';end if;
 select s.timezone into tz from public.festivals f join public.societies s on s.id=f.society_id where f.id=e.festival_id;
 if p_date<(now() at time zone tz)::date or not exists(select 1 from public.festival_days where festival_id=e.festival_id and service_date=p_date) or not exists(select 1 from public.meal_services where festival_id=e.festival_id and service_date=p_date and coverage<>'not_served' and not attendance_locked and (booking_cutoff is null or now()<booking_cutoff)) then raise exception 'RSVP is closed for this day.';end if;
 if p_attendees is null or p_attendees<0 or p_attendees>jsonb_array_length(e.members) then raise exception 'RSVP cannot exceed registered fixed attendees.';end if;
 select * into r from public.resident_rsvps where enrollment_id=e.id and service_date=p_date;
 if coalesce(r.version,0) is distinct from p_version then raise exception 'RSVP changed. Refresh and try again.';end if;
 insert into public.resident_rsvps(enrollment_id,service_date,attendees) values(e.id,p_date,p_attendees) on conflict(enrollment_id,service_date) do update set attendees=excluded.attendees,version=public.resident_rsvps.version+1,updated_at=now();
 insert into public.audit_events(action,entity_id,details) values('resident.rsvp_updated',e.id,jsonb_build_object('date',p_date,'before',coalesce(r.attendees,jsonb_array_length(e.members)),'after',p_attendees));
end $$;
alter function public.operations_data(uuid) rename to operations_data_before_rsvp;
alter function public.operations_data_before_rsvp(uuid) set schema private;
revoke all on function private.operations_data_before_rsvp(uuid) from public,anon,authenticated;
create function public.operations_data(p_festival uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;begin
 r:=private.operations_data_before_rsvp(p_festival);
 return r||jsonb_build_object('rsvps',coalesce((select jsonb_agg(to_jsonb(x)) from public.resident_rsvps x join public.flat_enrollments e on e.id=x.enrollment_id where e.festival_id=p_festival),'[]'));
end $$;
revoke all on function public.save_flat_payment(jsonb),public.update_flat_contact(uuid,text,boolean),public.resident_rsvp(uuid),public.save_resident_rsvp(uuid,date,integer,integer),public.operations_data(uuid) from public,anon,authenticated;
grant execute on function public.save_flat_payment(jsonb),public.update_flat_contact(uuid,text,boolean),public.operations_data(uuid) to authenticated;
grant execute on function public.resident_rsvp(uuid),public.save_resident_rsvp(uuid,date,integer,integer) to anon,authenticated;
