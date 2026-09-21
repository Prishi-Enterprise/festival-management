-- Report permission is independent of festival assignment and defaults to denied.
alter table public.society_memberships add column can_view_reports boolean not null default false;
alter table public.member_invitations add column can_view_reports boolean not null default false;
drop function public.invite_member(text,text,uuid[]);
create or replace function public.invite_member(p_email text, p_role text, p_festival_ids uuid[] default '{}', p_can_view_reports boolean default false) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_email text := lower(btrim(p_email));
begin
  perform 1 from public.societies for update;
  perform private.assert_admin();
  if v_email is null or length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid Google email.'; end if;
  if p_role is null or p_role not in ('admin','committee') then raise exception 'Invalid role.'; end if;
  if exists(select 1 from public.society_memberships where email=v_email) then raise exception 'This account is already onboarded. Edit its membership instead.'; end if;
  update public.member_invitations set status='revoked' where email=v_email and status='pending' and expires_at<=now();
  if exists(select 1 from public.member_invitations where email=v_email and status='pending') then raise exception 'An active invitation already exists for this account.'; end if;
  insert into public.member_invitations(email,role,invited_by,can_view_reports) values(v_email,p_role,auth.uid(),coalesce(p_can_view_reports,false)) returning id into v_id;
  insert into public.invitation_festivals(invitation_id,festival_id) select v_id, unnest(coalesce(p_festival_ids,'{}'));
  insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'invitation.created',v_id,jsonb_build_object('email',v_email,'role',p_role,'can_view_reports',coalesce(p_can_view_reports,false)));
  return v_id;
end;
$$;
create or replace function public.update_member(p_input jsonb) returns void language plpgsql security definer set search_path = '' as $$
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
  update public.society_memberships set role=v_role,active=v_active,can_view_reports=coalesce((p_input->>'can_view_reports')::boolean,false),version=version+1 where user_id=v_id;
  -- Invalidate a festival form opened before an assignment change in People.
  update public.festivals f set version=version+1,updated_at=now()
  where exists(select 1 from public.festival_memberships a where a.festival_id=f.id and a.user_id=v_id)
    is distinct from exists(select 1 from jsonb_array_elements_text(p_input->'festival_ids') i where i.value::uuid=f.id);
  delete from public.festival_memberships where user_id=v_id;
  insert into public.festival_memberships(user_id,festival_id) select v_id,value::uuid from jsonb_array_elements_text(p_input->'festival_ids');
  insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'membership.updated',v_id,
    jsonb_build_object('before',jsonb_build_object('role',v_old.role,'active',v_old.active,'can_view_reports',v_old.can_view_reports),'after',p_input));
end;
$$;
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
  select * into v_member from public.society_memberships where user_id=auth.uid();
  if found then
    if not v_member.active then raise exception 'Your membership is inactive.'; end if;
    return;
  end if;
  select * into v_inv from public.member_invitations
    where email=v_email and status='pending' and expires_at>now() for update;
  if not found then raise exception 'An active invitation for this email is required.'; end if;
  insert into public.society_memberships(user_id,email,display_name,role,can_view_reports) values(auth.uid(),v_email,v_name,v_inv.role,v_inv.can_view_reports);
  insert into public.festival_memberships(festival_id,user_id)
    select festival_id,auth.uid() from public.invitation_festivals where invitation_id=v_inv.id;
  update public.member_invitations set status='claimed',claimed_by=auth.uid() where id=v_inv.id;
  insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'membership.claimed',v_inv.id,jsonb_build_object('role',v_inv.role));
end;
$$;
revoke all on function public.invite_member(text,text,uuid[],boolean) from public,anon,authenticated;
grant execute on function public.invite_member(text,text,uuid[],boolean) to authenticated;
alter function public.finance_overview(uuid) rename to finance_overview_base;
alter function public.finance_overview_base(uuid) set schema private;
revoke all on function private.finance_overview_base(uuid) from public,anon,authenticated;
create function public.finance_overview(p_festival uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.can_read_festival(p_festival) then raise exception 'Festival access required.' using errcode='42501'; end if;
 if not exists(select 1 from public.society_memberships where user_id=auth.uid() and active and (role='admin' or can_view_reports)) then
  raise exception 'Report permission required.' using errcode='42501';
 end if;
 return private.finance_overview_base(p_festival);
end $$;
revoke all on function public.finance_overview(uuid) from public,anon,authenticated;
grant execute on function public.finance_overview(uuid) to authenticated;
