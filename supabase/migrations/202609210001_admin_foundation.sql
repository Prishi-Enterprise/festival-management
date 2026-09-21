-- Admin foundation. Apply to DEV first. One society per project in this release.
create schema if not exists private;
revoke all on schema private from public;

create table public.societies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  singleton boolean not null default true unique check (singleton),
  timezone text not null default 'Asia/Kolkata'
);
insert into public.societies (id, name) values ('00000000-0000-4000-8000-000000000001', 'Radhe');

create table public.society_memberships (
  user_id uuid primary key references auth.users(id),
  society_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.societies(id),
  email text not null unique check (email = lower(btrim(email))),
  display_name text not null default '',
  role text not null check (role in ('admin', 'committee')),
  active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now()
);
create table public.festivals (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.societies(id),
  name text not null check (length(btrim(name)) between 2 and 100),
  start_date date not null,
  day_count integer not null check (day_count between 1 and 31),
  status text not null default 'draft' check (status in ('draft', 'ready')),
  version integer not null default 1,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.festival_days (
  festival_id uuid not null references public.festivals(id),
  day_number integer not null check (day_number between 1 and 31),
  service_date date not null,
  label text not null check (length(label) between 1 and 60),
  is_dussehra boolean not null default false,
  primary key (festival_id, day_number), unique (festival_id, service_date)
);
create unique index one_dussehra_per_festival on public.festival_days(festival_id) where is_dussehra;
create table public.flats (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.societies(id),
  block text not null check (block ~ '^[A-Z0-9-]{1,12}$'),
  flat_number text not null check (flat_number ~ '^[A-Za-z0-9-]{1,12}$'),
  unique (block, flat_number)
);
create table public.festival_flats (
  festival_id uuid not null references public.festivals(id),
  flat_id uuid not null references public.flats(id), primary key (festival_id, flat_id)
);
create table public.festival_memberships (
  festival_id uuid not null references public.festivals(id),
  user_id uuid not null references public.society_memberships(user_id), primary key (festival_id, user_id)
);
create table public.pricing_versions (
  festival_id uuid not null references public.festivals(id),
  version integer not null check (version > 0),
  rates jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), primary key (festival_id, version)
);
create table public.member_invitations (
  id uuid primary key default gen_random_uuid(), email text not null check (email = lower(btrim(email))),
  role text not null check (role in ('admin', 'committee')),
  status text not null default 'pending' check (status in ('pending', 'claimed', 'revoked')),
  invited_by uuid references auth.users(id), claimed_by uuid references auth.users(id),
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now()
);
create unique index one_pending_invitation on public.member_invitations(email) where status = 'pending';
create table public.invitation_festivals (
  invitation_id uuid not null references public.member_invitations(id),
  festival_id uuid not null references public.festivals(id), primary key (invitation_id, festival_id)
);
create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id), action text not null, entity_id uuid,
  details jsonb not null default '{}', created_at timestamptz not null default now()
);
-- A one-use admission record, not an email-based admin bypass.
insert into public.member_invitations(email, role, expires_at)
values ('shivamastha@gmail.com', 'admin', 'infinity');

create function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.society_memberships where user_id = auth.uid() and active and role = 'admin');
$$;
create function private.assert_admin() returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admin access required.' using errcode = '42501'; end if;
end;
$$;
create function private.can_read_festival(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin() or exists (
    select 1 from public.festival_memberships f join public.society_memberships m on m.user_id=f.user_id
    where f.festival_id=p_id and m.user_id=auth.uid() and m.active
  );
$$;

-- RLS applies even if someone bypasses the Next.js UI.
alter table public.societies enable row level security;
alter table public.society_memberships enable row level security;
alter table public.festivals enable row level security;
alter table public.festival_days enable row level security;
alter table public.flats enable row level security;
alter table public.festival_flats enable row level security;
alter table public.festival_memberships enable row level security;
alter table public.pricing_versions enable row level security;
alter table public.member_invitations enable row level security;
alter table public.invitation_festivals enable row level security;
alter table public.audit_events enable row level security;
create policy society_admin_read on public.societies for select to authenticated using (private.is_admin());
create policy member_read on public.society_memberships for select to authenticated using (private.is_admin() or user_id=auth.uid());
create policy festival_read on public.festivals for select to authenticated using (private.can_read_festival(id));
create policy day_read on public.festival_days for select to authenticated using (private.can_read_festival(festival_id));
create policy flat_read on public.flats for select to authenticated using (private.is_admin());
create policy festival_flat_read on public.festival_flats for select to authenticated using (private.is_admin());
create policy assignment_read on public.festival_memberships for select to authenticated using (private.is_admin() or (user_id=auth.uid() and private.can_read_festival(festival_id)));
create policy price_read on public.pricing_versions for select to authenticated using (private.is_admin());
create policy invitation_read on public.member_invitations for select to authenticated using (private.is_admin());
create policy invitation_festival_read on public.invitation_festivals for select to authenticated using (private.is_admin());
create policy audit_read on public.audit_events for select to authenticated using (private.is_admin());

create function public.claim_membership() returns void language plpgsql security definer set search_path = '' as $$
declare v_email text; v_name text; v_inv public.member_invitations; v_member public.society_memberships;
begin
  if auth.uid() is null then raise exception 'Sign in with Google first.'; end if;
  -- Serialize onboarding and role changes, including two first-login requests.
  perform 1 from public.societies for update;
  select lower(btrim(u.email)), coalesce(u.raw_user_meta_data->>'full_name','') into v_email,v_name
  from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null
    and exists (select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
      and lower(i.identity_data->>'email')=lower(u.email) and i.identity_data->>'email_verified'='true');
  if v_email is null or coalesce(auth.jwt()->'app_metadata'->>'provider','') <> 'google' then
    raise exception 'A verified Google account is required.';
  end if;
  select * into v_member from public.society_memberships where user_id=auth.uid();
  if found then
    if not v_member.active then raise exception 'Your membership is inactive.'; end if;
    return;
  end if;
  select * into v_inv from public.member_invitations
    where email=v_email and status='pending' and expires_at>now() for update;
  if not found then raise exception 'An active invitation for this Google account is required.'; end if;
  insert into public.society_memberships(user_id,email,display_name,role) values(auth.uid(),v_email,v_name,v_inv.role);
  insert into public.festival_memberships(festival_id,user_id)
    select festival_id,auth.uid() from public.invitation_festivals where invitation_id=v_inv.id;
  update public.member_invitations set status='claimed',claimed_by=auth.uid() where id=v_inv.id;
  insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'membership.claimed',v_inv.id,jsonb_build_object('role',v_inv.role));
end;
$$;

-- Configure as the Supabase Before User Created hook. Data access is still
-- denied without membership if the operator has not enabled this hook yet.
create function public.before_user_created(event jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(event->'user'->>'email'));
begin
  if exists(select 1 from public.member_invitations where email=v_email and status='pending' and expires_at>now())
    or exists(select 1 from public.society_memberships where email=v_email and active) then return '{}'::jsonb; end if;
  return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','This app requires an admin invitation.'));
end;
$$;

create function public.invite_member(p_email text, p_role text, p_festival_ids uuid[] default '{}') returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_email text := lower(btrim(p_email));
begin
  perform 1 from public.societies for update;
  perform private.assert_admin();
  if v_email is null or length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid Google email.'; end if;
  if p_role is null or p_role not in ('admin','committee') then raise exception 'Invalid role.'; end if;
  if exists(select 1 from public.society_memberships where email=v_email) then raise exception 'This account is already onboarded. Edit its membership instead.'; end if;
  update public.member_invitations set status='revoked' where email=v_email and status='pending' and expires_at<=now();
  if exists(select 1 from public.member_invitations where email=v_email and status='pending') then raise exception 'An active invitation already exists for this account.'; end if;
  insert into public.member_invitations(email,role,invited_by) values(v_email,p_role,auth.uid()) returning id into v_id;
  insert into public.invitation_festivals(invitation_id,festival_id) select v_id, unnest(coalesce(p_festival_ids,'{}'));
  insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'invitation.created',v_id,jsonb_build_object('email',v_email,'role',p_role));
  return v_id;
end;
$$;
create function public.revoke_invitation(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.societies for update;
  perform private.assert_admin();
  update public.member_invitations set status='revoked' where id=p_id and status='pending';
  if not found then raise exception 'Invitation is no longer pending. Refresh the page.'; end if;
  insert into public.audit_events(actor_id,action,entity_id) values(auth.uid(),'invitation.revoked',p_id);
end;
$$;
create function public.update_member(p_input jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare v_old public.society_memberships; v_id uuid := (p_input->>'user_id')::uuid;
v_role text := p_input->>'role'; v_active boolean := (p_input->>'active')::boolean;
begin
  perform 1 from public.societies for update;
  perform private.assert_admin();
  select * into v_old from public.society_memberships where user_id=v_id for update;
  if not found or v_old.version is distinct from (p_input->>'version')::integer then raise exception 'Membership changed. Refresh before saving.'; end if;
  if v_role is null or v_role not in ('admin','committee') or v_active is null then raise exception 'Invalid member settings.'; end if;
  if v_old.role='admin' and v_old.active and (v_role<>'admin' or not v_active)
    and (select count(*) from public.society_memberships where role='admin' and active)=1 then raise exception 'Keep at least one active admin.'; end if;
  update public.society_memberships set role=v_role,active=v_active,version=version+1 where user_id=v_id;
  -- Invalidate a festival form opened before an assignment change in People.
  update public.festivals f set version=version+1,updated_at=now()
  where exists(select 1 from public.festival_memberships a where a.festival_id=f.id and a.user_id=v_id)
    is distinct from exists(select 1 from jsonb_array_elements_text(p_input->'festival_ids') i where i.value::uuid=f.id);
  delete from public.festival_memberships where user_id=v_id;
  insert into public.festival_memberships(user_id,festival_id) select v_id,value::uuid from jsonb_array_elements_text(p_input->'festival_ids');
  insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'membership.updated',v_id,
    jsonb_build_object('before',jsonb_build_object('role',v_old.role,'active',v_old.active),'after',p_input));
end;
$$;
create function public.add_flats(p_block text, p_flats text[]) returns void language plpgsql security definer set search_path = '' as $$
declare v_block text := upper(btrim(p_block)); v_flat text;
begin
  perform private.assert_admin();
  if v_block is null or v_block !~ '^[A-Z0-9-]{1,12}$' or coalesce(cardinality(p_flats),0) not between 1 and 500 then raise exception 'Enter a block and between 1 and 500 flat numbers.'; end if;
  foreach v_flat in array p_flats loop
    if v_flat is null or btrim(v_flat) !~ '^[A-Za-z0-9-]{1,12}$' then raise exception 'Invalid flat number.'; end if;
    insert into public.flats(block,flat_number) values(v_block,upper(btrim(v_flat))) on conflict(block,flat_number) do nothing;
  end loop;
  insert into public.audit_events(actor_id,action,details) values(auth.uid(),'flats.added',jsonb_build_object('block',v_block,'flats',p_flats));
end;
$$;

create function public.save_festival(p_input jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := coalesce((p_input->>'id')::uuid,gen_random_uuid()); v_old public.festivals;
  v_count integer := (p_input->>'day_count')::integer; v_rates jsonb := p_input->'rates';
  v_day jsonb; v_key text; v_previous date; v_date date; v_i integer := 0; v_dussehra integer := 0; v_price_version integer;
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
    if (v_day->>'is_dussehra')::boolean then v_dussehra:=v_dussehra+1; end if;
  end loop;
  if v_dussehra>1 then raise exception 'Choose only one Dussehra day.'; end if;
  if jsonb_typeof(p_input->'flat_ids') is distinct from 'array' or jsonb_typeof(p_input->'member_ids') is distinct from 'array' then raise exception 'Flats and committee assignments are required.'; end if;
  if p_input->>'status'='ready' and (v_rates->>'guest' is null or v_rates->>'household_policy'='unconfirmed' or v_rates->>'guest_age_policy'='unconfirmed' or v_dussehra<>1 or jsonb_array_length(p_input->'flat_ids')=0) then raise exception 'Choose flats, Dussehra, guest rate and meal policies before marking setup ready.'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_input->'member_ids') ids where not exists(select 1 from public.society_memberships m where m.user_id=ids.value::uuid and m.active)) then raise exception 'Assign only active committee accounts.'; end if;
  insert into public.festivals(id,name,start_date,day_count,status,created_by)
    values(v_id,btrim(p_input->>'name'),(p_input->>'start_date')::date,v_count,p_input->>'status',auth.uid())
    on conflict(id) do update set name=excluded.name,start_date=excluded.start_date,day_count=excluded.day_count,status=excluded.status,version=public.festivals.version+1,updated_at=now();
  delete from public.festival_days where festival_id=v_id;
  insert into public.festival_days(festival_id,day_number,service_date,label,is_dussehra)
    select v_id,(d->>'day_number')::integer,(d->>'service_date')::date,btrim(d->>'label'),(d->>'is_dussehra')::boolean from jsonb_array_elements(p_input->'days') d;
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

-- Read-only detail is deliberately admin-only; no financial detail in committee responses.
create function public.get_festival_detail(p_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform private.assert_admin();
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

-- Grant SELECT only. All mutations go through checked functions.
revoke all on public.societies, public.society_memberships, public.festivals, public.festival_days,
 public.flats, public.festival_flats, public.festival_memberships, public.pricing_versions,
 public.member_invitations, public.invitation_festivals, public.audit_events from anon, authenticated;
grant select on public.societies, public.society_memberships, public.festivals, public.festival_days,
 public.flats, public.festival_flats, public.festival_memberships, public.pricing_versions,
 public.member_invitations, public.invitation_festivals, public.audit_events to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_admin(), private.can_read_festival(uuid) to authenticated;
revoke all on function public.claim_membership(), public.before_user_created(jsonb),
 public.invite_member(text,text,uuid[]), public.revoke_invitation(uuid), public.update_member(jsonb),
 public.add_flats(text,text[]), public.save_festival(jsonb), public.get_festival_detail(uuid) from public, anon, authenticated;
grant execute on function public.claim_membership(), public.invite_member(text,text,uuid[]),
 public.revoke_invitation(uuid), public.update_member(jsonb), public.add_flats(text,text[]),
 public.save_festival(jsonb), public.get_festival_detail(uuid) to authenticated;
grant execute on function public.before_user_created(jsonb) to supabase_auth_admin;
