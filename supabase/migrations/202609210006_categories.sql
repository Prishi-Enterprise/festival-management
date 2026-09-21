-- Preserve existing free-text categories in Other detail; historical audit is unchanged.
alter table public.finance_entries add column category_other text not null default '' check(length(category_other)<=120);
update public.finance_entries set category_other=case when btrim(category)='' then 'Unspecified (legacy)' else category end,category='Other' where category not in ('Fixed contribution','Meal package','Guest meals','Donation','Catering','Decoration','Mandap','Puja & prasad','Music & sound','Events','Utilities','Transport','Supplies','Reimbursement','Transfer','Opening funds','Refund','Other');
alter table public.finance_entries add constraint category_choice check(category in ('Fixed contribution','Meal package','Guest meals','Donation','Catering','Decoration','Mandap','Puja & prasad','Music & sound','Events','Utilities','Transport','Supplies','Reimbursement','Transfer','Opening funds','Refund','Other'));
alter table public.finance_entries add constraint category_detail check((category='Other' and length(btrim(category_other)) between 2 and 120) or (category<>'Other' and category_other=''));
create or replace function public.save_finance_entry(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid := (p_input->>'id')::uuid; v_festival uuid := (p_input->>'festival_id')::uuid;
 v_old public.finance_entries; v_kind text := p_input->>'kind'; v_amount bigint;
 v_date date := (p_input->>'occurred_on')::date; v_account uuid := nullif(p_input->>'account_id','')::uuid;
 v_to uuid := nullif(p_input->>'to_account_id','')::uuid; v_flat uuid := nullif(p_input->>'flat_id','')::uuid;
 v_vendor uuid := nullif(p_input->>'vendor_id','')::uuid; v_payload jsonb;
begin
 perform private.assert_festival(v_festival);
 if coalesce(p_input->>'category','') not in ('Fixed contribution','Meal package','Guest meals','Donation','Catering','Decoration','Mandap','Puja & prasad','Music & sound','Events','Utilities','Transport','Supplies','Reimbursement','Transfer','Opening funds','Refund','Other') then raise exception 'Choose a category from the list.'; end if;
 if p_input->>'category'='Other' and length(btrim(coalesce(p_input->>'category_other',''))) not between 2 and 120 then raise exception 'Describe the Other category.'; end if;
 if p_input->>'category'<>'Other' and coalesce(p_input->>'category_other','')<>'' then raise exception 'Free text is only allowed for Other.'; end if;
 if coalesce(p_input->>'amount','') !~ '^[0-9]+$' then raise exception 'Amount must be integer paise.'; end if;
 v_amount:=(p_input->>'amount')::bigint;
 if v_kind in ('opening','charge') then perform private.assert_admin(); end if;
 if v_date is null or v_date < date '2000-01-01' or v_date > (now() at time zone 'Asia/Kolkata')::date + 366 then raise exception 'Choose a valid accounting date.'; end if;
 if v_flat is not null and not exists(select 1 from public.festival_flats where festival_id=v_festival and flat_id=v_flat) then raise exception 'Choose a flat in this festival.'; end if;
 v_payload:=jsonb_build_object('kind',v_kind,'occurred_on',v_date,'amount',v_amount,'description',btrim(p_input->>'description'),'category',p_input->>'category','category_other',btrim(coalesce(p_input->>'category_other','')),'reference',btrim(coalesce(p_input->>'reference','')),'account_id',v_account,'to_account_id',v_to,'flat_id',v_flat,'vendor_id',v_vendor);
 select * into v_old from public.finance_entries where id=v_id for update;
 if found then
  if v_old.festival_id<>v_festival or v_old.created_by<>auth.uid() then raise exception 'Only the creator can edit this entry.' using errcode='42501'; end if;
  if (p_input->>'version')::integer=0 and v_old.version=1 and v_old.status='pending'
    and (to_jsonb(v_old) - array['id','number','festival_id','created_by','version','status','created_at','updated_at','confirmed_by','confirmed_at'])=v_payload then return v_id; end if;
  if v_old.status<>'pending' then raise exception 'Entry is locked or void. Ask an admin to unlock confirmed entries.'; end if;
  if v_old.version is distinct from (p_input->>'version')::integer then raise exception 'Entry changed. Refresh before saving.'; end if;
  update public.finance_entries set kind=v_kind,occurred_on=v_date,amount=v_amount,description=v_payload->>'description',category=v_payload->>'category',category_other=v_payload->>'category_other',reference=v_payload->>'reference',account_id=v_account,to_account_id=v_to,flat_id=v_flat,vendor_id=v_vendor,version=version+1,updated_at=now() where id=v_id;
 else
  if (p_input->>'version')::integer is distinct from 0 then raise exception 'Entry no longer exists.'; end if;
  insert into public.finance_entries(id,festival_id,created_by,kind,occurred_on,amount,description,category,category_other,reference,account_id,to_account_id,flat_id,vendor_id)
   values(v_id,v_festival,auth.uid(),v_kind,v_date,v_amount,v_payload->>'description',v_payload->>'category',v_payload->>'category_other',v_payload->>'reference',v_account,v_to,v_flat,v_vendor);
 end if;
 insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'finance.saved',v_id,jsonb_build_object('before',to_jsonb(v_old),'after',v_payload));
 return v_id;
end $$;


alter function public.finance_report(uuid) rename to finance_report_base;
alter function public.finance_report_base(uuid) set schema private;
revoke all on function private.finance_report_base(uuid) from public,anon,authenticated;
create function public.finance_report(p_festival uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.assert_admin();
 return private.finance_report_base(p_festival) || jsonb_build_object('categories',coalesce((select jsonb_agg(x order by category) from (
 select category,coalesce(sum(amount) filter(where kind in ('collection','donation')),0) collected,
 coalesce(sum(amount) filter(where kind='bill'),0) billed,coalesce(sum(amount) filter(where kind='payment'),0) paid
 from public.finance_entries where festival_id=p_festival and status='confirmed' group by category) x),'[]'));
end $$;
revoke all on function public.finance_report(uuid) from public,anon,authenticated;
grant execute on function public.finance_report(uuid) to authenticated;
