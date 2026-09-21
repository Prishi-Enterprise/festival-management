-- Admit verified email OTP accounts using the same invitations and role checks.
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
  insert into public.society_memberships(user_id,email,display_name,role) values(auth.uid(),v_email,v_name,v_inv.role);
  insert into public.festival_memberships(festival_id,user_id)
    select festival_id,auth.uid() from public.invitation_festivals where invitation_id=v_inv.id;
  update public.member_invitations set status='claimed',claimed_by=auth.uid() where id=v_inv.id;
  insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'membership.claimed',v_inv.id,jsonb_build_object('role',v_inv.role));
end;
$$;

-- Owner changed the unclaimed initial administrator before launch.
update public.member_invitations
set email='prishi.ai.ventures@gmail.com'
where email='shivamastha@gmail.com' and invited_by is null and status='pending';
