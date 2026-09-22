alter table public.society_memberships add column can_manage_finance boolean not null default false;
alter table public.member_invitations add column can_manage_finance boolean not null default false;
create function private.can_manage_finance() returns boolean language sql stable security definer set search_path='' as $$
 select private.is_admin() or exists(select 1 from public.society_memberships where society_id=private.current_society() and user_id=auth.uid() and active and can_manage_finance);
$$;
create function private.assert_finance() returns void language plpgsql security definer set search_path='' as $$
begin if not private.can_manage_finance() then raise exception 'Finance & accounts permission required.' using errcode='42501'; end if; end $$;
revoke all on function private.can_manage_finance(),private.assert_finance() from public,anon;
grant execute on function private.can_manage_finance() to authenticated;
revoke all on function private.assert_finance() from authenticated;
drop policy entries_read on public.finance_entries;
create policy entries_read on public.finance_entries for select to authenticated using(private.can_read_festival(festival_id) and (private.can_manage_finance() or created_by=auth.uid()));

drop function public.invite_member(text,text,uuid[],boolean);
create or replace function public.invite_member(p_email text, p_role text, p_festival_ids uuid[] default '{}', p_can_view_reports boolean default false, p_can_manage_finance boolean default false) returns uuid language plpgsql security definer set search_path = '' as $$
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
  insert into public.member_invitations(society_id,email,role,invited_by,can_view_reports,can_manage_finance) values(private.current_society(),v_email,p_role,auth.uid(),coalesce(p_can_view_reports,false) or coalesce(p_can_manage_finance,false),coalesce(p_can_manage_finance,false)) returning id into v_id;
  insert into public.invitation_festivals(invitation_id,festival_id) select v_id, unnest(coalesce(p_festival_ids,'{}'));
  insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'invitation.created',v_id,jsonb_build_object('email',v_email,'role',p_role,'can_view_reports',coalesce(p_can_view_reports,false) or coalesce(p_can_manage_finance,false),'can_manage_finance',coalesce(p_can_manage_finance,false)));
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
  update public.society_memberships set role=v_role,active=v_active,can_manage_finance=coalesce((p_input->>'can_manage_finance')::boolean,false),can_view_reports=coalesce((p_input->>'can_view_reports')::boolean,false) or coalesce((p_input->>'can_manage_finance')::boolean,false),version=version+1 where society_id=private.current_society() and user_id=v_id;
  -- Invalidate a festival form opened before an assignment change in People.
  if exists(select 1 from jsonb_array_elements_text(p_input->'festival_ids') i where not private.can_read_festival(i.value::uuid)) then raise exception 'Choose festivals in this society.'; end if;
  update public.festivals f set version=version+1,updated_at=now()
  where f.society_id=private.current_society() and (exists(select 1 from public.festival_memberships a where a.festival_id=f.id and a.user_id=v_id)
    is distinct from exists(select 1 from jsonb_array_elements_text(p_input->'festival_ids') i where i.value::uuid=f.id));
  delete from public.festival_memberships where user_id=v_id and festival_id in(select id from public.festivals where society_id=private.current_society());
  insert into public.festival_memberships(user_id,festival_id) select v_id,value::uuid from jsonb_array_elements_text(p_input->'festival_ids');
  insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'membership.updated',v_id,
    jsonb_build_object('before',jsonb_build_object('role',v_old.role,'active',v_old.active,'can_view_reports',v_old.can_view_reports,'can_manage_finance',v_old.can_manage_finance),'after',p_input));
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
  for v_inv in select * from public.member_invitations where email=v_email and status='pending' and expires_at>now() for update loop
    insert into public.society_memberships(society_id,user_id,email,display_name,role,can_view_reports,can_manage_finance)
    values(v_inv.society_id,auth.uid(),v_email,v_name,v_inv.role,v_inv.can_view_reports or v_inv.can_manage_finance,v_inv.can_manage_finance) on conflict(society_id,user_id) do nothing;
    insert into public.festival_memberships(festival_id,user_id) select festival_id,auth.uid() from public.invitation_festivals where invitation_id=v_inv.id on conflict do nothing;
    update public.member_invitations set status='claimed',claimed_by=auth.uid() where id=v_inv.id;
    insert into public.audit_events(actor_id,action,entity_id) values(auth.uid(),'membership.claimed',v_inv.id);
  end loop;
  if not private.is_superadmin() and not exists(select 1 from public.society_memberships where user_id=auth.uid() and active) then
 if exists(select 1 from public.society_memberships where user_id=auth.uid()) then raise exception 'Your membership is inactive.'; end if;
 raise exception 'An active invitation for this email is required.'; end if;
end $$;
create or replace function private.review_finance_entry_internal(p_id uuid,p_version integer,p_action text,p_reason text default '') returns void language plpgsql security definer set search_path='' as $$
declare v public.finance_entries; v_balance bigint; v_new_version integer;
begin
 select * into v from public.finance_entries where id=p_id;
 if not found then raise exception 'Entry not found.'; end if;
 perform private.assert_festival(v.festival_id);
 select * into v from public.finance_entries where id=p_id for update;
 if v.version is distinct from p_version then raise exception 'Entry changed. Refresh before reviewing.'; end if;
 v_new_version:=v.version+1;
 if p_action='confirm' then
  perform private.assert_finance();
  if v.status<>'pending' then raise exception 'Only pending entries can be confirmed.'; end if;
  if v.kind='refund' and v.amount>(select coalesce(sum(case when kind='collection' then amount else -amount end),0) from public.finance_entries where festival_id=v.festival_id and flat_id=v.flat_id and status='confirmed' and kind in ('collection','refund')) then raise exception 'Refund exceeds confirmed payments from this flat.'; end if;
  if v.kind in ('payment','transfer','refund') then
   select coalesce(sum(amount),0) into v_balance from public.finance_postings where account_id=v.account_id;
   if v_balance<v.amount then raise exception 'Insufficient confirmed funds. Confirm the inflow first.'; end if;
  end if;
  if v.account_id is not null then
   insert into public.finance_postings(entry_id,entry_version,account_id,amount) values(v.id,v_new_version,v.account_id,case when v.kind in ('payment','transfer','refund') then -v.amount else v.amount end);
  end if;
  if v.to_account_id is not null then insert into public.finance_postings(entry_id,entry_version,account_id,amount) values(v.id,v_new_version,v.to_account_id,v.amount); end if;
  update public.finance_entries set status='confirmed',version=v_new_version,confirmed_by=auth.uid(),confirmed_at=now(),updated_at=now() where id=v.id;
 elsif p_action='unlock' then
  perform private.assert_admin();
  if v.status<>'confirmed' or length(btrim(p_reason)) not between 3 and 300 then raise exception 'Unlock requires a confirmed entry and a correction reason.'; end if;
  if v.kind='collection' and v.amount>(select coalesce(sum(case when kind='collection' then amount else -amount end),0) from public.finance_entries where festival_id=v.festival_id and flat_id=v.flat_id and status='confirmed' and kind in ('collection','refund')) then raise exception 'Reverse flat refunds before unlocking this collection.'; end if;
  -- Do not reverse a receipt/transfer that has already funded confirmed spending.
  if exists(select 1 from public.finance_postings p where p.entry_id=v.id and p.entry_version=v.version and p.amount>0
    and (select coalesce(sum(b.amount),0) from public.finance_postings b where b.account_id=p.account_id)<p.amount) then raise exception 'Reverse dependent spending first; unlocking would leave negative confirmed funds.'; end if;
  insert into public.finance_postings(entry_id,entry_version,account_id,amount)
    select v.id,v_new_version,account_id,-amount from public.finance_postings where entry_id=v.id and entry_version=v.version;
  update public.finance_entries set status='pending',version=v_new_version,confirmed_by=null,confirmed_at=null,updated_at=now() where id=v.id;
 elsif p_action='void' then
  if v.status<>'pending' or (v.created_by<>auth.uid() and not private.is_admin()) or length(btrim(p_reason)) not between 3 and 300 then raise exception 'Only pending entries can be voided, with a reason.'; end if;
  update public.finance_entries set status='void',version=v_new_version,updated_at=now() where id=v.id;
 else raise exception 'Unknown review action.'; end if;
 insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'finance.'||p_action,v.id,jsonb_build_object('before',to_jsonb(v),'reason',p_reason,'version',v_new_version));
end $$;
revoke all on function public.invite_member(text,text,uuid[],boolean,boolean) from public,anon;
grant execute on function public.invite_member(text,text,uuid[],boolean,boolean) to authenticated;
