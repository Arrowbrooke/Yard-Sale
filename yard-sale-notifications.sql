do $$
declare original record; target text; definition text;
begin
 select t.tgname,pg_get_triggerdef(t.oid) as definition into original
 from pg_trigger t join pg_proc p on p.oid=t.tgfoid
 where t.tgrelid='public.stops'::regclass and not t.tgisinternal and p.proname='http_request' and position('notify-new-stop' in pg_get_triggerdef(t.oid))>0
 limit 1;
 if original.tgname is null then raise exception 'Existing push webhook was not found; no changes made.'; end if;
 foreach target in array array['yard_sales','sale_photo_reviews'] loop
  if not exists(select 1 from pg_trigger where tgrelid=('public.'||target)::regclass and tgname=original.tgname) then
   definition:=replace(original.definition,' ON public.stops ',' ON public.'||target||' ');
   if definition=original.definition then raise exception 'Unexpected webhook definition; no changes made.'; end if;
   execute definition;
  end if;
 end loop;
end $$;
select c.relname as table_name,count(*) as notification_hooks from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid where c.oid in ('public.yard_sales'::regclass,'public.sale_photo_reviews'::regclass) and p.proname='http_request' group by c.relname;
