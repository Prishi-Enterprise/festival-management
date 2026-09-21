-- Amounts are integer paise. Only confirmed revisions affect approved reports.
create table public.fund_accounts (
 id uuid primary key, festival_id uuid not null references public.festivals(id),
 label text not null check(length(btrim(label)) between 2 and 100),
 method text not null check(method in ('cash','online')),
 holder_id uuid not null references public.society_memberships(user_id),
 unique(festival_id,label), unique(festival_id,id)
);
create table public.vendors (
 id uuid primary key, festival_id uuid not null references public.festivals(id),
 name text not null check(length(btrim(name)) between 2 and 100),
 unique(festival_id,name), unique(festival_id,id)
);
create table public.finance_entries (
 id uuid primary key, number bigint generated always as identity unique,
 festival_id uuid not null references public.festivals(id),
 created_by uuid not null references public.society_memberships(user_id),
 version integer not null default 1 check(version>0),
 status text not null default 'pending' check(status in ('pending','confirmed','void')),
 kind text not null check(kind in ('collection','donation','bill','payment','transfer','opening','charge','refund')),
 occurred_on date not null, amount bigint not null check(amount between 1 and 100000000),
 description text not null check(length(btrim(description)) between 2 and 300),
 category text not null default '' check(length(category)<=80),
 reference text not null default '' check(length(reference)<=100),
 account_id uuid, to_account_id uuid, vendor_id uuid,
 flat_id uuid references public.flats(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 confirmed_by uuid references public.society_memberships(user_id), confirmed_at timestamptz,
 foreign key(festival_id,account_id) references public.fund_accounts(festival_id,id),
 foreign key(festival_id,to_account_id) references public.fund_accounts(festival_id,id),
 foreign key(festival_id,vendor_id) references public.vendors(festival_id,id),
 check((kind in ('collection','donation','payment','transfer','opening','refund'))=(account_id is not null)),
 check((kind='transfer')=(to_account_id is not null)),
 check(account_id is distinct from to_account_id or to_account_id is null),
 check((kind in ('bill','payment'))=(vendor_id is not null)),
 check((kind in ('collection','charge','refund'))=(flat_id is not null))
);
create index finance_by_festival on public.finance_entries(festival_id,status,occurred_on);
create index finance_by_creator on public.finance_entries(created_by,festival_id);
create table public.finance_postings (
 id bigint generated always as identity primary key,
 entry_id uuid not null references public.finance_entries(id),
 entry_version integer not null,
 account_id uuid not null references public.fund_accounts(id),
 amount bigint not null check(amount<>0),
 created_at timestamptz not null default now(),
 unique(entry_id,entry_version,account_id)
);

alter table public.fund_accounts enable row level security;
alter table public.vendors enable row level security;
alter table public.finance_entries enable row level security;
alter table public.finance_postings enable row level security;
create policy accounts_read on public.fund_accounts for select to authenticated using(private.can_read_festival(festival_id));
create policy vendors_read on public.vendors for select to authenticated using(private.can_read_festival(festival_id));
create policy entries_read on public.finance_entries for select to authenticated using(private.can_read_festival(festival_id) and (private.is_admin() or created_by=auth.uid()));
create policy postings_read on public.finance_postings for select to authenticated using(private.is_admin());
revoke all on public.fund_accounts,public.vendors,public.finance_entries,public.finance_postings from public,anon,authenticated;
grant select on public.fund_accounts,public.vendors,public.finance_entries,public.finance_postings to authenticated;

create function private.assert_festival(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 -- Serialize balances, confirmation, edits, and setup within each festival.
 perform 1 from public.festivals where id=p_id for update;
 if not found or not private.can_read_festival(p_id) then raise exception 'Festival access required.' using errcode='42501'; end if;
end $$;

create function public.create_finance_resource(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid := (p_input->>'id')::uuid; v_festival uuid := (p_input->>'festival_id')::uuid;
 v_kind text := p_input->>'kind'; v_label text := btrim(p_input->>'label'); v_existing jsonb;
begin
 perform private.assert_festival(v_festival); perform private.assert_admin();
 if v_kind='account' then
  if not exists(select 1 from public.society_memberships m where m.user_id=(p_input->>'holder_id')::uuid and m.active
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

create function public.save_finance_entry(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid := (p_input->>'id')::uuid; v_festival uuid := (p_input->>'festival_id')::uuid;
 v_old public.finance_entries; v_kind text := p_input->>'kind'; v_amount bigint;
 v_date date := (p_input->>'occurred_on')::date; v_account uuid := nullif(p_input->>'account_id','')::uuid;
 v_to uuid := nullif(p_input->>'to_account_id','')::uuid; v_flat uuid := nullif(p_input->>'flat_id','')::uuid;
 v_vendor uuid := nullif(p_input->>'vendor_id','')::uuid; v_payload jsonb;
begin
 perform private.assert_festival(v_festival);
 if coalesce(p_input->>'amount','') !~ '^[0-9]+$' then raise exception 'Amount must be integer paise.'; end if;
 v_amount:=(p_input->>'amount')::bigint;
 if v_kind in ('opening','charge') then perform private.assert_admin(); end if;
 if v_date is null or v_date < date '2000-01-01' or v_date > (now() at time zone 'Asia/Kolkata')::date + 366 then raise exception 'Choose a valid accounting date.'; end if;
 if v_flat is not null and not exists(select 1 from public.festival_flats where festival_id=v_festival and flat_id=v_flat) then raise exception 'Choose a flat in this festival.'; end if;
 v_payload:=jsonb_build_object('kind',v_kind,'occurred_on',v_date,'amount',v_amount,'description',btrim(p_input->>'description'),'category',btrim(coalesce(p_input->>'category','')),'reference',btrim(coalesce(p_input->>'reference','')),'account_id',v_account,'to_account_id',v_to,'flat_id',v_flat,'vendor_id',v_vendor);
 select * into v_old from public.finance_entries where id=v_id for update;
 if found then
  if v_old.festival_id<>v_festival or v_old.created_by<>auth.uid() then raise exception 'Only the creator can edit this entry.' using errcode='42501'; end if;
  if (p_input->>'version')::integer=0 and v_old.version=1 and v_old.status='pending'
    and (to_jsonb(v_old) - array['id','number','festival_id','created_by','version','status','created_at','updated_at','confirmed_by','confirmed_at'])=v_payload then return v_id; end if;
  if v_old.status<>'pending' then raise exception 'Entry is locked or void. Ask an admin to unlock confirmed entries.'; end if;
  if v_old.version is distinct from (p_input->>'version')::integer then raise exception 'Entry changed. Refresh before saving.'; end if;
  update public.finance_entries set kind=v_kind,occurred_on=v_date,amount=v_amount,description=v_payload->>'description',category=v_payload->>'category',reference=v_payload->>'reference',account_id=v_account,to_account_id=v_to,flat_id=v_flat,vendor_id=v_vendor,version=version+1,updated_at=now() where id=v_id;
 else
  if (p_input->>'version')::integer is distinct from 0 then raise exception 'Entry no longer exists.'; end if;
  insert into public.finance_entries(id,festival_id,created_by,kind,occurred_on,amount,description,category,reference,account_id,to_account_id,flat_id,vendor_id)
   values(v_id,v_festival,auth.uid(),v_kind,v_date,v_amount,v_payload->>'description',v_payload->>'category',v_payload->>'reference',v_account,v_to,v_flat,v_vendor);
 end if;
 insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'finance.saved',v_id,jsonb_build_object('before',to_jsonb(v_old),'after',v_payload));
 return v_id;
end $$;

create function public.review_finance_entry(p_id uuid,p_version integer,p_action text,p_reason text default '') returns void language plpgsql security definer set search_path='' as $$
declare v public.finance_entries; v_balance bigint; v_new_version integer;
begin
 select * into v from public.finance_entries where id=p_id;
 if not found then raise exception 'Entry not found.'; end if;
 perform private.assert_festival(v.festival_id);
 select * into v from public.finance_entries where id=p_id for update;
 if v.version is distinct from p_version then raise exception 'Entry changed. Refresh before reviewing.'; end if;
 v_new_version:=v.version+1;
 if p_action='confirm' then
  perform private.assert_admin();
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

create function public.finance_overview(p_festival uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.can_read_festival(p_festival) then raise exception 'Festival access required.' using errcode='42501'; end if;
 return jsonb_build_object(
  'collections',(select coalesce(sum(amount),0) from public.finance_entries where festival_id=p_festival and status='confirmed' and kind in ('collection','donation')),
  'expenses',(select coalesce(sum(amount),0) from public.finance_entries where festival_id=p_festival and status='confirmed' and kind='bill'),
  'payments',(select coalesce(sum(amount),0) from public.finance_entries where festival_id=p_festival and status='confirmed' and kind='payment'),
  'refunds',(select coalesce(sum(amount),0) from public.finance_entries where festival_id=p_festival and status='confirmed' and kind='refund'),
  'opening',(select coalesce(sum(amount),0) from public.finance_entries where festival_id=p_festival and status='confirmed' and kind='opening'),
  'pending',(select count(*) from public.finance_entries where festival_id=p_festival and status='pending'),
  'cash',(select coalesce(sum(p.amount),0) from public.finance_postings p join public.fund_accounts a on a.id=p.account_id where a.festival_id=p_festival and a.method='cash'),
  'online',(select coalesce(sum(p.amount),0) from public.finance_postings p join public.fund_accounts a on a.id=p.account_id where a.festival_id=p_festival and a.method='online')
 );
end $$;

create function public.finance_report(p_festival uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.assert_admin();
 if not exists(select 1 from public.festivals where id=p_festival) then raise exception 'Festival not found.'; end if;
 return jsonb_build_object('festival_name',(select name from public.festivals where id=p_festival),'as_of',now(),'overview',public.finance_overview(p_festival),
 'accounts',coalesce((select jsonb_agg(x order by x.label) from (select a.*,m.display_name,m.email,coalesce(sum(p.amount),0) balance from public.fund_accounts a join public.society_memberships m on m.user_id=a.holder_id left join public.finance_postings p on p.account_id=a.id where a.festival_id=p_festival group by a.id,m.user_id) x),'[]'),
 'vendors',coalesce((select jsonb_agg(x order by x.name) from (select v.id,v.name,coalesce(sum(e.amount) filter(where e.kind='bill'),0) billed,coalesce(sum(e.amount) filter(where e.kind='payment'),0) paid from public.vendors v left join public.finance_entries e on e.vendor_id=v.id and e.status='confirmed' where v.festival_id=p_festival group by v.id) x),'[]'),
 'flats',coalesce((select jsonb_agg(x order by x.block,x.flat_number) from (select f.id,f.block,f.flat_number,coalesce(sum(e.amount) filter(where e.kind='charge'),0) charged,coalesce(sum(e.amount) filter(where e.kind='collection'),0)-coalesce(sum(e.amount) filter(where e.kind='refund'),0) paid from public.festival_flats ff join public.flats f on f.id=ff.flat_id left join public.finance_entries e on e.flat_id=f.id and e.festival_id=p_festival and e.status='confirmed' where ff.festival_id=p_festival group by f.id) x),'[]'),
 'entries',coalesce((select jsonb_agg(to_jsonb(e) order by e.number) from public.finance_entries e where e.festival_id=p_festival),'[]'));
end $$;

-- Returns only operational choices, never other members' financial entries or balances.
create function public.finance_choices(p_festival uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.can_read_festival(p_festival) then raise exception 'Festival access required.' using errcode='42501'; end if;
 return jsonb_build_object('flats',coalesce((select jsonb_agg(to_jsonb(f) order by block,flat_number) from public.flats f join public.festival_flats ff on ff.flat_id=f.id where ff.festival_id=p_festival),'[]'));
end $$;

revoke all on function private.assert_festival(uuid) from public,anon,authenticated;
revoke all on function public.create_finance_resource(jsonb), public.save_finance_entry(jsonb), public.review_finance_entry(uuid,integer,text,text), public.finance_overview(uuid), public.finance_report(uuid),public.finance_choices(uuid) from public,anon,authenticated;
grant execute on function public.create_finance_resource(jsonb), public.save_finance_entry(jsonb), public.review_finance_entry(uuid,integer,text,text), public.finance_overview(uuid), public.finance_report(uuid),public.finance_choices(uuid) to authenticated;
