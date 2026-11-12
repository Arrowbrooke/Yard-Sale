begin;
alter table public.yard_sales alter column starts drop not null;
alter table public.yard_sales alter column ends drop not null;
commit;
select 'Sale start and end times are optional; existing hours preserved' as result;
