-- A deferred guest entry is money owed by a payee, not a cash receipt or expense.
create table public.guest_dues (
 id uuid primary key references public.guest_bookings(id),
 vendor_id uuid not null references public.vendors(id),
 amount bigint not null check(amount between 1 and 100000000),
 created_by uuid not null references public.society_memberships(user_id),
 version integer not null default 1,
 description text not null check(length(btrim(description)) between 2 and 300)
);
alter table public.guest_dues enable row level security;
revoke all on public.guest_dues from public,anon,authenticated;
-- Amounts are returned through authorized RPCs; all writes are transactional.
alter function public.save_guest_booking(jsonb) rename to save_guest_booking_internal;
alter function public.save_guest_booking_internal(jsonb) set schema private;
revoke all on function private.save_guest_booking_internal(jsonb) from public,anon,authenticated;
create function public.save_guest_booking(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.guest_bookings where id=(p_input->>'id')::uuid) then raise exception 'Create a guest entry to generate a pass.';end if;
 return private.save_guest_booking_internal(p_input);
end $$;
revoke all on function public.save_guest_booking(jsonb) from public,anon,authenticated;
grant execute on function public.save_guest_booking(jsonb) to authenticated;
-- One receipt belongs to one guest pass; a pass can have split receipts.
create table public.guest_receipt_links (
 entry_id uuid primary key references public.finance_entries(id),
 guest_id uuid not null references public.guest_bookings(id)
);
create index guest_receipt_links_guest on public.guest_receipt_links(guest_id);
alter table public.guest_receipt_links enable row level security;
revoke all on public.guest_receipt_links from public,anon,authenticated;
grant select on public.guest_receipt_links to authenticated;
create policy visible_receipt_link on public.guest_receipt_links for select to authenticated
 using (exists(select 1 from public.finance_entries f where f.id=entry_id));

create function public.save_guest_payment(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare g public.guest_bookings;s public.meal_services;r public.finance_entries;
 due public.guest_dues; used_amount bigint; mode text:=coalesce(p_input->>'payment_mode','collected');
 rid uuid:=(p_input->>'id')::uuid;gid uuid:=coalesce(nullif(p_input->>'guest_id','')::uuid,(p_input->>'id')::uuid);linked uuid;
begin
 perform private.assert_festival((p_input->>'festival_id')::uuid);
 if mode not in ('collected','payee_due') then raise exception 'Invalid payment mode.';end if;
 if p_input->>'kind' is distinct from 'collection' or p_input->>'category' is distinct from 'Guest meals' then raise exception 'Choose a guest meal receipt.';end if;
 select * into s from public.meal_services where id=(p_input->>'service_id')::uuid;
 if s.id is null or s.festival_id is distinct from (p_input->>'festival_id')::uuid then raise exception 'Choose a meal in this festival.';end if;
 select guest_id into linked from public.guest_receipt_links where entry_id=rid;
 if linked is not null and linked<>gid then raise exception 'This receipt is already linked to another pass.';end if;
 select * into r from public.finance_entries where id=rid;
 if r.id is not null and (r.kind<>'collection' or r.category<>'Guest meals' or r.flat_id is distinct from (p_input->>'flat_id')::uuid) then raise exception 'Only a matching guest receipt can be linked.';end if;
 if nullif(p_input->>'guest_id','') is null then
  perform private.save_guest_booking_internal(jsonb_build_object('id',gid,'version',0,'service_id',s.id,'flat_id',p_input->>'flat_id','adults',p_input->'adults','children',p_input->'children','under_seven',p_input->'under_seven','note',coalesce(p_input->>'note',''),'cancelled',false));
 end if;
 select * into g from public.guest_bookings where id=gid;
 if g.id is null or g.service_id<>s.id or g.flat_id is distinct from (p_input->>'flat_id')::uuid or (g.cancelled and not exists(select 1 from public.guest_dues where id=gid)) then raise exception 'Choose an active pass for the same flat and meal.';end if;
 select * into due from public.guest_dues where id=gid;
 if mode='payee_due' then
  if r.id is not null or linked is not null then raise exception 'A cash receipt cannot become a payee due.';end if;
  if not exists(select 1 from public.vendors where id=(p_input->>'vendor_id')::uuid and festival_id=s.festival_id) then raise exception 'Choose a payee in this festival.';end if;
  if exists(select 1 from public.guest_receipt_links where guest_id=gid) then raise exception 'Payments already exist. Reconcile the existing entry instead.';end if;
  if due.id is null then
   if (p_input->>'version')::integer is distinct from 0 then raise exception 'Invalid due version.';end if;
   insert into public.guest_dues(id,vendor_id,amount,created_by,description) values(gid,(p_input->>'vendor_id')::uuid,(p_input->>'amount')::bigint,auth.uid(),btrim(p_input->>'description'));
  else
   if due.created_by<>auth.uid() then raise exception 'Only the creator can edit this due.' using errcode='42501';end if;
   if (p_input->>'version')::integer=0 and due.version=1 and due.vendor_id=(p_input->>'vendor_id')::uuid and due.amount=(p_input->>'amount')::bigint and due.description=btrim(p_input->>'description') then return gid;end if;
   if due.version is distinct from (p_input->>'version')::integer then raise exception 'Due changed. Refresh before saving.';end if;
   update public.guest_dues set vendor_id=(p_input->>'vendor_id')::uuid,amount=(p_input->>'amount')::bigint,description=btrim(p_input->>'description'),version=version+1 where id=gid;
  end if;
  insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'guest.payee_due_saved',gid,jsonb_build_object('before',to_jsonb(due),'amount',p_input->'amount','vendor_id',p_input->'vendor_id'));
  return gid;
 end if;
 if due.id is not null then
  select coalesce(sum(f.amount),0) into used_amount from public.guest_receipt_links l join public.finance_entries f on f.id=l.entry_id where l.guest_id=gid and f.status in ('pending','confirmed') and f.id<>rid;
  if used_amount+(p_input->>'amount')::bigint>due.amount then raise exception 'Payment exceeds the remaining payee due (including pending receipts).';end if;
 end if;
 perform private.save_finance_entry_internal(p_input);
 insert into public.guest_receipt_links(entry_id,guest_id) values(rid,gid) on conflict(entry_id) do nothing;
 insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'guest.receipt_linked',gid,jsonb_build_object('entry_id',rid));
 return rid;
end $$;
revoke all on function public.save_guest_payment(jsonb) from public,anon,authenticated;
grant execute on function public.save_guest_payment(jsonb) to authenticated;

-- Existing linked receipts cannot be repurposed through the generic form.
alter function public.save_finance_entry(jsonb) rename to save_finance_entry_before_guest;
alter function public.save_finance_entry_before_guest(jsonb) set schema private;
revoke all on function private.save_finance_entry_before_guest(jsonb) from public,anon,authenticated;
create function public.save_finance_entry(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if p_input->>'kind'='collection' and p_input->>'category'='Guest meals' then raise exception 'Use Guest meal payment to link the entry to its pass.';end if;
 if exists(select 1 from public.guest_receipt_links where entry_id=(p_input->>'id')::uuid) then raise exception 'Edit this receipt through Guest meal payment to preserve its pass link.';end if;
 return private.save_finance_entry_before_guest(p_input);
end $$;
revoke all on function public.save_finance_entry(jsonb) from public,anon,authenticated;
grant execute on function public.save_finance_entry(jsonb) to authenticated;

alter function public.operations_data(uuid) rename to operations_data_before_guest_receipts;
alter function public.operations_data_before_guest_receipts(uuid) set schema private;
revoke all on function private.operations_data_before_guest_receipts(uuid) from public,anon,authenticated;
create function public.operations_data(p_festival uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=private.operations_data_before_guest_receipts(p_festival);
 return result || jsonb_build_object('guests',coalesce((select jsonb_agg(g || jsonb_build_object('payment_status',
 case when exists(select 1 from public.guest_receipt_links l join public.finance_entries f on f.id=l.entry_id where l.guest_id=(g->>'id')::uuid and f.status='confirmed') then 'confirmed'
 when exists(select 1 from public.guest_receipt_links l join public.finance_entries f on f.id=l.entry_id where l.guest_id=(g->>'id')::uuid and f.status='pending') then 'pending'
 when exists(select 1 from public.guest_dues where id=(g->>'id')::uuid) then 'payee_due' else 'none' end)) from jsonb_array_elements(result->'guests') g),'[]'));
end $$;
revoke all on function public.operations_data(uuid) from public,anon,authenticated;
grant execute on function public.operations_data(uuid) to authenticated;

create function public.guest_due_report(p_festival uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.can_read_festival(p_festival) then raise exception 'Festival access required.' using errcode='42501';end if;
 return coalesce((select jsonb_agg(x) from (
 select d.*,g.flat_id,g.service_id,g.cancelled,
 coalesce((select sum(f.amount) from public.guest_receipt_links l join public.finance_entries f on f.id=l.entry_id where l.guest_id=d.id and f.status='confirmed'),0) confirmed,
 coalesce((select sum(f.amount) from public.guest_receipt_links l join public.finance_entries f on f.id=l.entry_id where l.guest_id=d.id and f.status='pending'),0) pending
 from public.guest_dues d join public.guest_bookings g on g.id=d.id join public.meal_services s on s.id=g.service_id
 where s.festival_id=p_festival and (private.is_admin() or d.created_by=auth.uid())
 ) x),'[]');
end $$;
revoke all on function public.guest_due_report(uuid) from public,anon,authenticated;
grant execute on function public.guest_due_report(uuid) to authenticated;

alter function public.finance_report(uuid) rename to finance_report_before_guest_dues;
alter function public.finance_report_before_guest_dues(uuid) set schema private;
revoke all on function private.finance_report_before_guest_dues(uuid) from public,anon,authenticated;
create function public.finance_report(p_festival uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.assert_admin();
 return private.finance_report_before_guest_dues(p_festival) || jsonb_build_object('guest_dues',public.guest_due_report(p_festival));
end $$;
revoke all on function public.finance_report(uuid) from public,anon,authenticated;
grant execute on function public.finance_report(uuid) to authenticated;
