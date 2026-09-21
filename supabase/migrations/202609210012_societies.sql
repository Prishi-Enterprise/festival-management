-- Society isolation: existing records stay in the original Radhe society.
alter table public.societies drop column singleton;
alter table public.societies add column logo_url text, add column theme_color text not null default '#b88724', add column version integer not null default 1;
alter table public.societies add constraint society_brand_valid check(length(name) between 2 and 100 and theme_color ~ '^#[0-9A-Fa-f]{6}$' and (logo_url is null or logo_url='/radhe-logo.jpg' or logo_url ~ '^/storage/v1/object/public/society-logos/[a-f0-9-]+[.]png$'));
update public.societies set name='Radhe Infinity',logo_url='/radhe-logo.jpg';
create table private.platform_admins(email text primary key check(email=lower(email)));
insert into private.platform_admins values('sb@prishi.in');
-- Historical authors/holders reference Auth identities, not a particular society membership.
do $$ declare c record; begin
 for c in select conrelid::regclass tbl,conname,pg_get_constraintdef(oid) def from pg_constraint where contype='f' and confrelid='public.society_memberships'::regclass loop
  execute format('alter table %s drop constraint %I',c.tbl,c.conname);
  execute format('alter table %s add constraint %I %s',c.tbl,c.conname,replace(c.def,'REFERENCES society_memberships(user_id)','REFERENCES auth.users(id)'));
 end loop;
end $$;
alter table public.society_memberships drop constraint society_memberships_pkey, drop constraint society_memberships_email_key;
alter table public.society_memberships add primary key(society_id,user_id),add unique(society_id,email);
alter table public.flats drop constraint flats_block_flat_number_key;
alter table public.flats add unique(society_id,block,flat_number);
alter table public.member_invitations add column society_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.societies;
drop index public.one_pending_invitation;
create unique index one_pending_invitation on public.member_invitations(society_id,email) where status='pending';
create or replace function private.is_superadmin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join private.platform_admins p on p.email=lower(u.email) where u.id=auth.uid() and u.email_confirmed_at is not null);
$$;
create or replace function private.current_society() returns uuid language plpgsql stable security definer set search_path='' as $$
declare h text; begin
 h:=nullif(coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-society-id','');
 if h is not null then return h::uuid; end if;
 -- Compatibility for old clients: only a single active society can be inferred.
 if (select count(*) from public.society_memberships where user_id=auth.uid() and active)=1 then
 return (select society_id from public.society_memberships where user_id=auth.uid() and active limit 1); end if;
 return null;
end $$;
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.societies where id=private.current_society()) and (private.is_superadmin() or exists(select 1 from public.society_memberships where user_id=auth.uid() and society_id=private.current_society() and active and role='admin'));
$$;
create or replace function private.can_read_festival(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.festivals f where f.id=p_id and f.society_id=private.current_society() and (private.is_admin() or exists(select 1 from public.festival_memberships fm join public.society_memberships m on m.user_id=fm.user_id and m.society_id=f.society_id where fm.festival_id=f.id and m.user_id=auth.uid() and m.active)));
$$;
-- Scope every previously society-global SELECT policy.
drop policy society_admin_read on public.societies;
create policy society_read on public.societies for select to authenticated using(private.is_superadmin() or exists(select 1 from public.society_memberships m where m.society_id=id and m.user_id=auth.uid() and m.active));
drop policy member_read on public.society_memberships;
create policy member_read on public.society_memberships for select to authenticated using(society_id=private.current_society() and (private.is_admin() or user_id=auth.uid()));
drop policy flat_read on public.flats;
create policy flat_read on public.flats for select to authenticated using(society_id=private.current_society() and private.is_admin());
drop policy festival_flat_read on public.festival_flats;
create policy festival_flat_read on public.festival_flats for select to authenticated using(private.can_read_festival(festival_id));
drop policy assignment_read on public.festival_memberships;
create policy assignment_read on public.festival_memberships for select to authenticated using(private.can_read_festival(festival_id) and (private.is_admin() or user_id=auth.uid()));
drop policy price_read on public.pricing_versions;
create policy price_read on public.pricing_versions for select to authenticated using(private.is_admin() and private.can_read_festival(festival_id));
drop policy invitation_read on public.member_invitations;
create policy invitation_read on public.member_invitations for select to authenticated using(society_id=private.current_society() and private.is_admin());
drop policy invitation_festival_read on public.invitation_festivals;
create policy invitation_festival_read on public.invitation_festivals for select to authenticated using(private.is_admin() and private.can_read_festival(festival_id));
drop policy postings_read on public.finance_postings;
create policy postings_read on public.finance_postings for select to authenticated using(private.is_admin() and exists(select 1 from public.finance_entries e where e.id=entry_id and private.can_read_festival(e.festival_id)));
drop policy catering_read on public.catering_runs;
create policy catering_read on public.catering_runs for select to authenticated using(private.is_admin() and exists(select 1 from public.meal_services s where s.id=service_id and private.can_read_festival(s.festival_id)));
drop policy catering_allocations_read on public.catering_allocations;
create policy catering_allocations_read on public.catering_allocations for select to authenticated using(private.is_admin() and exists(select 1 from public.catering_runs c join public.meal_services s on s.id=c.service_id where c.id=catering_id and private.can_read_festival(s.festival_id)));
-- Existing audit rows have no tenant key: retain them for platform review only.
drop policy audit_read on public.audit_events;
create policy audit_read on public.audit_events for select to authenticated using(private.is_superadmin());
grant execute on function private.current_society(),private.is_superadmin() to authenticated;
revoke all on private.platform_admins from public,anon,authenticated;
create or replace function public.save_festival(p_input jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := coalesce((p_input->>'id')::uuid,gen_random_uuid()); v_old public.festivals;
  v_count integer := (p_input->>'day_count')::integer; v_rates jsonb := p_input->'rates';
  v_day jsonb; v_key text; v_previous date; v_date date; v_i integer := 0; v_price_version integer;
begin
  -- Serializes member assignment changes with membership activation/revocation.
  perform 1 from public.societies where id=private.current_society() for update;
  perform private.assert_admin();
  if p_input->>'id' is not null then
    select * into v_old from public.festivals where id=v_id and society_id=private.current_society() for update;
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
  if exists(select 1 from jsonb_array_elements_text(p_input->'member_ids') ids where not exists(select 1 from public.society_memberships m where m.user_id=ids.value::uuid and m.active and m.society_id=private.current_society())) then raise exception 'Assign only active committee accounts.'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_input->'flat_ids') i where not exists(select 1 from public.flats where id=i.value::uuid and society_id=private.current_society())) then raise exception 'Choose flats in this society.'; end if;
  insert into public.festivals(id,society_id,name,start_date,day_count,status,created_by)
    values(v_id,private.current_society(),btrim(p_input->>'name'),(p_input->>'start_date')::date,v_count,p_input->>'status',auth.uid())
    on conflict(id) do update set name=excluded.name,start_date=excluded.start_date,day_count=excluded.day_count,status=excluded.status,version=public.festivals.version+1,updated_at=now();
  delete from public.festival_days where festival_id=v_id;
  insert into public.festival_days(festival_id,day_number,service_date,label)
    select v_id,(d->>'day_number')::integer,(d->>'service_date')::date,btrim(d->>'label') from jsonb_array_elements(p_input->'days') d;
  delete from public.festival_flats where festival_id=v_id;
  insert into public.festival_flats(festival_id,flat_id) select v_id,value::uuid from jsonb_array_elements_text(p_input->'flat_ids');
  -- Invalidate a People form opened before an assignment change in Festivals.
  update public.society_memberships m set version=version+1
  where m.society_id=private.current_society() and (exists(select 1 from public.festival_memberships a where a.festival_id=v_id and a.user_id=m.user_id)
    is distinct from exists(select 1 from jsonb_array_elements_text(p_input->'member_ids') i where i.value::uuid=m.user_id));
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
create or replace function public.invite_member(p_email text, p_role text, p_festival_ids uuid[] default '{}', p_can_view_reports boolean default false) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_email text := lower(btrim(p_email));
begin
  perform 1 from public.societies where id=private.current_society() for update;
  perform private.assert_admin();
  if v_email is null or length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid Google email.'; end if;
  if p_role is null or p_role not in ('admin','committee') then raise exception 'Invalid role.'; end if;
  if exists(select 1 from public.society_memberships where society_id=private.current_society() and email=v_email) then raise exception 'This account is already onboarded. Edit its membership instead.'; end if;
  update public.member_invitations set status='revoked' where society_id=private.current_society() and email=v_email and status='pending' and expires_at<=now();
  if exists(select 1 from public.member_invitations where society_id=private.current_society() and email=v_email and status='pending') then raise exception 'An active invitation already exists for this account.'; end if;
  if exists(select 1 from unnest(p_festival_ids) f where not private.can_read_festival(f)) then raise exception 'Choose festivals in this society.'; end if;
  insert into public.member_invitations(society_id,email,role,invited_by,can_view_reports) values(private.current_society(),v_email,p_role,auth.uid(),coalesce(p_can_view_reports,false)) returning id into v_id;
  insert into public.invitation_festivals(invitation_id,festival_id) select v_id, unnest(coalesce(p_festival_ids,'{}'));
  insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'invitation.created',v_id,jsonb_build_object('email',v_email,'role',p_role,'can_view_reports',coalesce(p_can_view_reports,false)));
  return v_id;
end;
$$;
create or replace function public.update_member(p_input jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare v_old public.society_memberships; v_id uuid := (p_input->>'user_id')::uuid;
v_role text := p_input->>'role'; v_active boolean := (p_input->>'active')::boolean;
begin
  perform 1 from public.societies where id=private.current_society() for update;
  perform private.assert_admin();
  select * into v_old from public.society_memberships where society_id=private.current_society() and user_id=v_id for update;
  if not found or v_old.version is distinct from (p_input->>'version')::integer then raise exception 'Membership changed. Refresh before saving.'; end if;
  if v_role is null or v_role not in ('admin','committee') or v_active is null then raise exception 'Invalid member settings.'; end if;
  if v_old.role='admin' and v_old.active and (v_role<>'admin' or not v_active)
    and (select count(*) from public.society_memberships where society_id=private.current_society() and role='admin' and active)=1 then raise exception 'Keep at least one active admin.'; end if;
  update public.society_memberships set role=v_role,active=v_active,can_view_reports=coalesce((p_input->>'can_view_reports')::boolean,false),version=version+1 where society_id=private.current_society() and user_id=v_id;
  -- Invalidate a festival form opened before an assignment change in People.
  if exists(select 1 from jsonb_array_elements_text(p_input->'festival_ids') i where not private.can_read_festival(i.value::uuid)) then raise exception 'Choose festivals in this society.'; end if;
  update public.festivals f set version=version+1,updated_at=now()
  where f.society_id=private.current_society() and (exists(select 1 from public.festival_memberships a where a.festival_id=f.id and a.user_id=v_id)
    is distinct from exists(select 1 from jsonb_array_elements_text(p_input->'festival_ids') i where i.value::uuid=f.id));
  delete from public.festival_memberships where user_id=v_id and festival_id in(select id from public.festivals where society_id=private.current_society());
  insert into public.festival_memberships(user_id,festival_id) select v_id,value::uuid from jsonb_array_elements_text(p_input->'festival_ids');
  insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'membership.updated',v_id,
    jsonb_build_object('before',jsonb_build_object('role',v_old.role,'active',v_old.active,'can_view_reports',v_old.can_view_reports),'after',p_input));
end;
$$;
create or replace function public.revoke_invitation(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.societies for update;
  perform private.assert_admin();
  update public.member_invitations set status='revoked' where id=p_id and society_id=private.current_society() and status='pending';
  if not found then raise exception 'Invitation is no longer pending. Refresh the page.'; end if;
  insert into public.audit_events(actor_id,action,entity_id) values(auth.uid(),'invitation.revoked',p_id);
end;
$$;
create or replace function public.add_flats(p_block text, p_flats text[]) returns void language plpgsql security definer set search_path = '' as $$
declare v_block text := upper(btrim(p_block)); v_flat text;
begin
  perform private.assert_admin();
  if v_block is null or v_block !~ '^[A-Z0-9-]{1,12}$' or coalesce(cardinality(p_flats),0) not between 1 and 500 then raise exception 'Enter a block and between 1 and 500 flat numbers.'; end if;
  foreach v_flat in array p_flats loop
    if v_flat is null or btrim(v_flat) !~ '^[A-Za-z0-9-]{1,12}$' then raise exception 'Invalid flat number.'; end if;
    insert into public.flats(society_id,block,flat_number) values(private.current_society(),v_block,upper(btrim(v_flat))) on conflict(society_id,block,flat_number) do nothing;
  end loop;
  insert into public.audit_events(actor_id,action,details) values(auth.uid(),'flats.added',jsonb_build_object('block',v_block,'flats',p_flats));
end;
$$;
create or replace function public.get_festival_detail(p_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform private.assert_admin();
  if not private.can_read_festival(p_id) then raise exception 'Festival access required.' using errcode='42501'; end if;
  select to_jsonb(f) || jsonb_build_object(
    'days',coalesce((select jsonb_agg(to_jsonb(d) order by day_number) from public.festival_days d where festival_id=f.id),'[]'),
    'rates',(select rates from public.pricing_versions where festival_id=f.id order by version desc limit 1),
    'pricing_version',(select max(version) from public.pricing_versions where festival_id=f.id),
    'flat_ids',coalesce((select jsonb_agg(flat_id) from public.festival_flats where festival_id=f.id),'[]'),
    'member_ids',coalesce((select jsonb_agg(user_id) from public.festival_memberships where festival_id=f.id),'[]')
  ) into v_result from public.festivals f where f.id=p_id;
  return v_result;
end;
$$;
create or replace function public.create_finance_resource(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid := (p_input->>'id')::uuid; v_festival uuid := (p_input->>'festival_id')::uuid;
 v_kind text := p_input->>'kind'; v_label text := btrim(p_input->>'label'); v_existing jsonb;
begin
 perform private.assert_festival(v_festival); perform private.assert_admin();
 if v_kind='account' then
  if not exists(select 1 from public.society_memberships m where m.user_id=(p_input->>'holder_id')::uuid and m.active and m.society_id=private.current_society()
    and (m.role='admin' or exists(select 1 from public.festival_memberships fm where fm.user_id=m.user_id and fm.festival_id=v_festival))) then raise exception 'Choose an active assigned holder.'; end if;
  select to_jsonb(a) into v_existing from public.fund_accounts a where id=v_id;
  if v_existing is not null then
   if v_existing->>'festival_id'=v_festival::text and v_existing->>'label'=v_label and v_existing->>'method'=p_input->>'method' and v_existing->>'holder_id'=p_input->>'holder_id' then return v_id; end if;
   raise exception 'Request already used. Refresh.';
  end if;
  insert into public.fund_accounts(id,festival_id,label,method,holder_id) values(v_id,v_festival,v_label,p_input->>'method',(p_input->>'holder_id')::uuid);
 elsif v_kind='vendor' then
  select to_jsonb(v) into v_existing from public.vendors v where id=v_id;
  if v_existing is not null then
   if v_existing->>'festival_id'=v_festival::text and v_existing->>'name'=v_label then return v_id; end if;
   raise exception 'Request already used. Refresh.';
  end if;
  insert into public.vendors(id,festival_id,name) values(v_id,v_festival,v_label);
 else raise exception 'Invalid resource.'; end if;
 insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'finance.resource_created',v_id,p_input-'id');
 return v_id;
end $$;
do $$ declare f record; s text; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname like 'finance_report%' loop
  s:=pg_get_functiondef(f.oid);
  s:=replace(s,'m.user_id=a.holder_id','m.user_id=a.holder_id and m.society_id=private.current_society()');
  s:=replace(s,'group by a.id,m.user_id','group by a.id,m.society_id,m.user_id');
  execute s;
 end loop;
end $$;
create or replace function public.finance_overview(p_festival uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.can_read_festival(p_festival) then raise exception 'Festival access required.' using errcode='42501'; end if;
 if not private.is_superadmin() and not exists(select 1 from public.society_memberships where society_id=private.current_society() and user_id=auth.uid() and active and (role='admin' or can_view_reports)) then
  raise exception 'Report permission required.' using errcode='42501';
 end if;
 return private.finance_overview_base(p_festival);
end $$;
create or replace function public.claim_membership() returns void language plpgsql security definer set search_path = '' as $$
declare v_email text; v_name text; v_inv public.member_invitations; v_member public.society_memberships;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  -- Serialize onboarding and role changes, including two first-login requests.
  perform 1 from public.societies for update;
  select lower(btrim(u.email)), coalesce(u.raw_user_meta_data->>'full_name','') into v_email,v_name
  from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null
    and exists (select 1 from auth.identities i where i.user_id=u.id and lower(i.identity_data->>'email')=lower(u.email)
      and ((i.provider='google' and i.identity_data->>'email_verified'='true'
        and auth.jwt()->'app_metadata'->>'provider'='google')
        or (i.provider='email' and auth.jwt()->'amr' @> '[{"method":"otp"}]'::jsonb)));
  if v_email is null then
    raise exception 'A verified email code or Google account is required.';
  end if;
  for v_inv in select * from public.member_invitations where email=v_email and status='pending' and expires_at>now() for update loop
    insert into public.society_memberships(society_id,user_id,email,display_name,role,can_view_reports)
    values(v_inv.society_id,auth.uid(),v_email,v_name,v_inv.role,v_inv.can_view_reports) on conflict(society_id,user_id) do nothing;
    insert into public.festival_memberships(festival_id,user_id) select festival_id,auth.uid() from public.invitation_festivals where invitation_id=v_inv.id on conflict do nothing;
    update public.member_invitations set status='claimed',claimed_by=auth.uid() where id=v_inv.id;
    insert into public.audit_events(actor_id,action,entity_id) values(auth.uid(),'membership.claimed',v_inv.id);
  end loop;
  if not private.is_superadmin() and not exists(select 1 from public.society_memberships where user_id=auth.uid() and active) then
 if exists(select 1 from public.society_memberships where user_id=auth.uid()) then raise exception 'Your membership is inactive.'; end if;
 raise exception 'An active invitation for this email is required.'; end if;
end $$;
create or replace function public.before_user_created(event jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare e text:=lower(btrim(event->'user'->>'email')); begin
 if exists(select 1 from private.platform_admins where email=e) or exists(select 1 from public.member_invitations where email=e and status='pending' and expires_at>now()) or exists(select 1 from public.society_memberships where email=e and active) then return '{}';end if;
 return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','This app requires an admin invitation.'));
end $$;
create function public.my_societies() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('superadmin',private.is_superadmin(),'societies',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('role',case when private.is_superadmin() then 'admin' else m.role end) order by s.name) from public.societies s left join public.society_memberships m on m.society_id=s.id and m.user_id=auth.uid() and m.active where private.is_superadmin() or m.user_id is not null),'[]'));
$$;
create function public.save_society(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid:=coalesce((p_input->>'id')::uuid,gen_random_uuid()); old public.societies; begin
 if not private.is_superadmin() then raise exception 'Super admin access required.' using errcode='42501'; end if;
 select * into old from public.societies where id=sid for update;
 if coalesce(old.version,0) is distinct from (p_input->>'version')::integer then raise exception 'Society changed. Refresh before saving.';end if;
 insert into public.societies(id,name,logo_url,theme_color) values(sid,btrim(p_input->>'name'),nullif(p_input->>'logo_url',''),coalesce(p_input->>'theme_color','#b88724'))
 on conflict(id) do update set name=excluded.name,logo_url=excluded.logo_url,theme_color=excluded.theme_color,version=public.societies.version+1;
 insert into public.audit_events(actor_id,action,entity_id) values(auth.uid(),'society.saved',sid);
 return sid;
end $$;
revoke all on function public.my_societies(),public.save_society(jsonb) from public,anon;
grant execute on function public.my_societies(),public.save_society(jsonb) to authenticated;
revoke all on function private.current_society(),private.is_superadmin() from public,anon;
