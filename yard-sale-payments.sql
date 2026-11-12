begin;
alter table public.yard_sales add column if not exists payment_methods text[] not null default '{}';
alter table public.yard_sales add column if not exists payment_other text not null default '';
alter table public.yard_sales add constraint yard_sales_payment_methods_check check(cardinality(payment_methods)<=7 and payment_methods<@array['cash','venmo','zelle','cashapp','paypal','card','other']::text[] and array_position(payment_methods,null) is null);
alter table public.yard_sales add constraint yard_sales_payment_other_check check(char_length(payment_other)<=80 and (payment_other='' or 'other'=any(payment_methods)));
grant insert(payment_methods,payment_other),update(payment_methods,payment_other) on public.yard_sales to authenticated;
notify pgrst,'reload schema';
commit;
select 'Optional sale payment methods ready' as result;
