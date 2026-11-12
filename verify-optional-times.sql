begin;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select u.id from auth.users u where u.is_anonymous=true order by (select count(*) from public.yard_sales s where s.created_by=u.id) limit 1),'role','authenticated')::text,true);
select set_config('test.address',(select address_key from public.verified_addresses a where not exists(select 1 from public.yard_sales s where s.address_key=a.address_key and s.event_date='2026-11-14') limit 1),true);
set local role authenticated;
do $$ declare sale public.yard_sales; begin
 insert into public.yard_sales(event_date,title,address,address_key,categories,lat,lng,starts,ends) values('2026-11-14','Rollback optional hours check','Temporary',current_setting('test.address'),array['other'],0,0,null,null) returning * into sale;
 if sale.starts is not null or sale.ends is not null then raise exception 'Blank hours were replaced'; end if;
end $$;
reset role;
rollback;
select 'PASS: anonymous submission accepts blank hours; test rolled back' as result,
 exists(select 1 from public.verified_addresses where address_key='1424 saddle ridge dr') as saddle_ridge_verified;
