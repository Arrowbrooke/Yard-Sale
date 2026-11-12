begin;
create table if not exists public.yard_sales (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(),
 created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
 event_date date not null check(event_date = '2026-11-14'),
 title text not null check(char_length(trim(title)) between 1 and 80),
 address text not null check(char_length(trim(address)) between 1 and 140),
 address_key text not null references public.verified_addresses(address_key),
 notes text not null default '' check(char_length(notes)<=400),
 approval_status text not null default 'approved' check(approval_status in ('approved','rejected')),
 categories text[] not null check(cardinality(categories) between 1 and 10 and categories <@ array['mens','womens','kids','toys','electronics','household','furniture','tools','books','other']::text[] and array_position(categories,null) is null),
 lat double precision not null,
 lng double precision not null,
 starts time not null,
 ends time not null,
 check(ends>starts),
 unique(event_date,address_key)
);
alter table public.yard_sales enable row level security;
revoke all on public.yard_sales from public,anon,authenticated;
grant select on public.yard_sales to anon,authenticated;
grant insert(event_date,title,address,address_key,notes,categories,lat,lng,starts,ends) on public.yard_sales to authenticated;
grant delete on public.yard_sales to authenticated;
grant update(title,notes,categories,approval_status,starts,ends) on public.yard_sales to authenticated;
create policy "Public yard sales and own submissions" on public.yard_sales for select to anon,authenticated using(approval_status='approved' or created_by=(select auth.uid()));
create policy "Residents add own yard sale" on public.yard_sales for insert to authenticated with check(created_by=(select auth.uid()));
create policy "Residents remove own yard sale" on public.yard_sales for delete to authenticated using(created_by=(select auth.uid()));
create policy "Organizer edits yard sales" on public.yard_sales for update to authenticated using((select auth.jwt()->>'email')='organizer@arrowbrooke-map.invalid') with check((select auth.jwt()->>'email')='organizer@arrowbrooke-map.invalid');
create policy "Organizer removes yard sales" on public.yard_sales for delete to authenticated using((select auth.jwt()->>'email')='organizer@arrowbrooke-map.invalid');
create or replace function public.validate_yard_sale() returns trigger language plpgsql security definer set search_path='' as $$
declare canonical public.verified_addresses%rowtype;
begin
 if new.event_date <> '2026-11-14'::date or current_timestamp >= '2026-11-15 00:00:00 America/Chicago'::timestamptz then
  raise exception 'Yard sale submissions are closed for this event.' using errcode='22023';
 end if;
 select * into canonical from public.verified_addresses where address_key=lower(trim(new.address_key));
 if canonical.address_key is null then raise exception 'Choose a verified Arrowbrooke home.' using errcode='23514'; end if;
 new.address_key:=canonical.address_key; new.address:=canonical.display_address; new.lat:=canonical.lat; new.lng:=canonical.lng;
 perform pg_advisory_xact_lock(hashtext(new.created_by::text));
 if coalesce(auth.jwt()->>'email','')<>'organizer@arrowbrooke-map.invalid' and (select count(*) from public.yard_sales where created_by=new.created_by and event_date=new.event_date)>=3 then raise exception 'You may add up to three homes for this event.'; end if;
 return new;
end;
$$;
revoke all on function public.validate_yard_sale() from public,anon,authenticated;
create trigger validate_yard_sale before insert on public.yard_sales for each row execute function public.validate_yard_sale();
alter publication supabase_realtime add table public.yard_sales;
notify pgrst,'reload schema';
commit;
select (select count(*) from public.verified_addresses) as verified_addresses, (select count(*) from public.yard_sales) as yard_sales;
