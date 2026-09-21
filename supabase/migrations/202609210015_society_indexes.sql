create index membership_user_society on public.society_memberships(user_id,society_id) where active;
create index festivals_society on public.festivals(society_id);
create index invitations_email_pending on public.member_invitations(email) where status='pending';
