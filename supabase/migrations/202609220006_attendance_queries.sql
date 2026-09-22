-- Attendance reads must not lock the festival or expand every day/meal.
create index if not exists finance_attendance_fixed on public.finance_entries(festival_id,flat_id)
 where status='confirmed' and category='Fixed contribution' and kind in ('collection','refund');

create function public.attendance_data(p_festival uuid,p_query jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare sid uuid; svc public.meal_services; services jsonb; result jsonb;
 rq text:=regexp_replace(lower(left(coalesce(p_query->>'resident_search',''),120)),'[[:space:]–—-]','','g');
 gq text:=regexp_replace(lower(left(coalesce(p_query->>'guest_search',''),120)),'[[:space:]–—-]','','g');
 rp integer:=greatest(0,least(coalesce((p_query->>'resident_page')::integer,0),100000));
 gp integer:=greatest(0,least(coalesce((p_query->>'guest_page')::integer,0),100000));
 code uuid:=nullif(p_query->>'code','')::uuid;
 pass_kind text:=p_query->>'kind';
 preferred uuid:=nullif(p_query->>'guest','')::uuid;
begin
 if not private.can_read_festival(p_festival) then raise exception 'Festival access required.' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('guest_available',
 exists(select 1 from public.guest_packages p where p.festival_id=p_festival and p.active and s.id=any(p.service_ids))
 or exists(select 1 from public.guest_bookings g where s.id=any(g.included_services))) order by s.service_date,s.meal,s.id),'[]')
 into services from public.meal_services s where s.festival_id=p_festival;
 sid:=nullif(p_query->>'service','')::uuid;
 if sid is not null and not exists(select 1 from public.meal_services where id=sid and festival_id=p_festival) then
  raise exception 'Meal does not belong to this festival.' using errcode='42501';
 end if;
 if sid is null then
  select (s->>'id')::uuid into sid from jsonb_array_elements(services) s
  where s->>'coverage'<>'not_served' or (s->>'guest_available')::boolean limit 1;
 end if;
 select * into svc from public.meal_services where id=sid;
 with
 -- Payment and package membership are aggregated once, rather than rechecked for each age group.
 paid as materialized (
  select flat_id,sum(case when kind='collection' then amount else -amount end) amount,
   count(*) filter(where kind='collection') receipts
  from public.finance_entries where festival_id=p_festival and status='confirmed'
   and category='Fixed contribution' and kind in ('collection','refund') group by flat_id
 ),
 packages as materialized (
  select pm.enrollment_id,m.value member_id from public.package_members pm
  join public.flat_enrollments e on e.id=pm.enrollment_id and e.festival_id=p_festival
  join public.finance_entries f on f.id=pm.entry_id and f.status='confirmed'
  cross join lateral jsonb_array_elements_text(pm.member_ids) m
  union
  select fp.enrollment_id,m.value from public.free_package_members fp
  join public.flat_enrollments e on e.id=fp.enrollment_id and e.festival_id=p_festival
  cross join lateral jsonb_array_elements_text(fp.member_ids) m
 ),
 enrolled as materialized (
  select e.*,coalesce(p.amount>=e.fixed_rate and p.receipts>0,false) eligible,
   regexp_replace(lower(f.block||f.flat_number),'[[:space:]–—-]','','g') flat_search,f.block,f.flat_number
  from public.flat_enrollments e join public.flats f on f.id=e.flat_id left join paid p on p.flat_id=e.flat_id
  where e.festival_id=p_festival
 ),
 residents as materialized (
  select e.id,e.flat_id,e.created_by,sid service_id,e.eligible confirmed,
   coalesce(c.version,0) version,coalesce(c.attended,0) attended,
   counts.adults,counts.children,counts.under_seven,0 guest_adults,0 guest_children,0 guest_under_seven,'' note,
   least(coalesce(r.attendees,jsonb_array_length(e.members)),counts.adults+counts.children+counts.under_seven) rsvped
  from enrolled e
  cross join lateral (
   select count(*) filter(where m->>'age_group'='adult') adults,
    count(*) filter(where m->>'age_group'='child') children,
    count(*) filter(where m->>'age_group'='under_seven') under_seven
   from jsonb_array_elements(e.members) m
   where e.eligible and (svc.coverage='fixed' or (svc.coverage='package' and
    exists(select 1 from packages p where p.enrollment_id=e.id and p.member_id=m->>'id')))
  ) counts
  left join public.resident_checkins c on c.enrollment_id=e.id and c.service_id=sid
  left join public.resident_rsvps r on r.enrollment_id=e.id and r.service_date=svc.service_date
 ),
 resident_matches as materialized (
  select r.*,row_number() over(order by e.block,e.flat_number,e.id)-1 position
  from residents r join enrolled e on e.id=r.id
  where (code is null or (pass_kind='resident' and e.attendance_code=code))
   and (rq='' or strpos(e.flat_search,rq)>0 or strpos(regexp_replace(lower(coalesce(e.contact_phone,'')),'[[:space:]–—-]','','g'),rq)>0)
 ),
 resident_count as (select count(*) total,least(rp,greatest(0,(count(*)-1)/10)) page from resident_matches),
 resident_page as materialized (
  select r.* from resident_matches r cross join resident_count c where position>=c.page*10 and position<c.page*10+10
 ),
 guests as materialized (
  select g.*,coalesce(c.attended,case when g.package_id is null then g.attended else 0 end) meal_attended,
   f.block,f.flat_number,regexp_replace(lower(f.block||f.flat_number),'[[:space:]–—-]','','g') flat_search
  from public.guest_bookings g join public.meal_services s on s.id=g.service_id and s.festival_id=p_festival
  join public.flats f on f.id=g.flat_id
  left join public.guest_meal_checkins c on c.guest_id=g.id and c.service_id=sid
  where (g.package_id is null and g.service_id=sid) or (g.package_id is not null and sid=any(g.included_services))
 ),
 guest_matches as materialized (
  select g.*,row_number() over(order by (g.id=preferred) desc nulls last,g.block,g.flat_number,g.id)-1 position
  from guests g where (code is null or (pass_kind='guest' and g.pass_code=code))
   and (gq='' or strpos(g.flat_search,gq)>0 or strpos(replace(g.pass_code::text,'-',''),gq)>0)
 ),
 guest_count as (select count(*) total,least(gp,greatest(0,(count(*)-1)/10)) page from guest_matches),
 guest_page as materialized (
  select g.* from guest_matches g cross join guest_count c where position>=c.page*10 and position<c.page*10+10
 )
 select jsonb_build_object(
  'festival',(select to_jsonb(f) from public.festivals f where id=p_festival),
  'services',services,'selected_service_id',sid,'as_of',now(),
  'age_brackets',(select jsonb_build_object('child_min_age',coalesce((rates->>'child_min_age')::integer,7),'child_max_age',coalesce((rates->>'child_max_age')::integer,10)) from public.pricing_versions where festival_id=p_festival order by version desc limit 1),
  'flats',coalesce((select jsonb_agg(f) from public.flats f where id in(select flat_id from resident_page union select flat_id from guest_page)),'[]'),
  'enrollments',coalesce((select jsonb_agg(to_jsonb(e)-'flat_search'-'block'-'flat_number' order by r.position) from enrolled e join resident_page r on r.id=e.id),'[]'),
  'attendance',coalesce((select jsonb_agg(to_jsonb(r)-'position' order by position) from resident_page r),'[]'),
  'guests',coalesce((select jsonb_agg((to_jsonb(g)-'flat_search'-'block'-'flat_number'-'position'-'meal_attended')||jsonb_build_object(
   'attended',g.meal_attended,'checkins',jsonb_build_array(jsonb_build_object('service_id',sid,'attended',g.meal_attended)),
   'payment_status',case
    when exists(select 1 from public.guest_receipt_links l join public.finance_entries f on f.id=l.entry_id where l.guest_id=g.id and f.status='confirmed') then 'confirmed'
    when exists(select 1 from public.guest_receipt_links l join public.finance_entries f on f.id=l.entry_id where l.guest_id=g.id and f.status='pending') then 'pending'
    when exists(select 1 from public.guest_dues d where d.id=g.id) then 'payee_due' else 'none' end) order by position) from guest_page g),'[]'),
  'resident_list',(select jsonb_build_object('total',total,'page',page,'pages',greatest(1,ceil(total/10.0))) from resident_count),
  'guest_list',(select jsonb_build_object('total',total,'page',page,'pages',greatest(1,ceil(total/10.0))) from guest_count),
  -- Totals intentionally ignore search, scan and pagination.
  'totals',jsonb_build_object(
   'eligible',(select coalesce(sum(adults+children+under_seven),0) from residents)+(select coalesce(sum(adults+children+under_seven) filter(where not cancelled),0) from guests),
   'rsvped',(select coalesce(sum(rsvped),0) from residents)+(select coalesce(sum(adults+children+under_seven) filter(where not cancelled),0) from guests),
   'attended',(select coalesce(sum(attended),0) from residents)+(select coalesce(sum(meal_attended),0) from guests))
 ) into result;
 return result;
end $$;
revoke all on function public.attendance_data(uuid,jsonb) from public,anon;
grant execute on function public.attendance_data(uuid,jsonb) to authenticated;
