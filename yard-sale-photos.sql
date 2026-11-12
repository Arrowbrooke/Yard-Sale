begin;
alter table public.yard_sales add column if not exists photo_paths text[] not null default '{}';
alter table public.yard_sales add constraint yard_sales_photo_limit check(cardinality(photo_paths)<=5);
create table public.sale_photo_reviews (
 id uuid primary key default gen_random_uuid(),
 sale_id uuid not null unique references public.yard_sales(id) on delete cascade,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 address text not null,
 photo_paths text[] not null check(cardinality(photo_paths) between 1 and 5),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 reviewed_at timestamptz
);
alter table public.sale_photo_reviews enable row level security;
revoke all on public.sale_photo_reviews from public,anon,authenticated;
grant select on public.sale_photo_reviews to authenticated;
create policy "Owners and organizer read photo reviews" on public.sale_photo_reviews for select to authenticated using(created_by=(select auth.uid()) or (select auth.jwt()->>'email')='organizer@arrowbrooke-map.invalid');
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('yard-sale-photos','yard-sale-photos',false,1048576,array['image/jpeg']) on conflict(id) do update set public=false,file_size_limit=1048576,allowed_mime_types=array['image/jpeg'];

create or replace function public.can_add_sale_photo(object_name text) returns boolean language plpgsql security definer set search_path='' as $$
declare target uuid; sale public.yard_sales%rowtype;
begin
 if object_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' then return false; end if;
 begin target:=split_part(object_name,'/',1)::uuid; exception when invalid_text_representation then return false; end;
 perform pg_advisory_xact_lock(hashtext('sale-photo:'||target::text));
 select * into sale from public.yard_sales where id=target;
 if sale.id is null or auth.uid() is null or (sale.created_by<>auth.uid() and coalesce(auth.jwt()->>'email','')<>'organizer@arrowbrooke-map.invalid') then return false; end if;
 if exists(select 1 from public.sale_photo_reviews where sale_id=target) then return false; end if;
 return (select count(*) from storage.objects where bucket_id='yard-sale-photos' and split_part(name,'/',1)=target::text)<5;
end; $$;
revoke all on function public.can_add_sale_photo(text) from public,anon;
grant execute on function public.can_add_sale_photo(text) to authenticated;
create policy "Upload up to five photos for own sale" on storage.objects for insert to authenticated with check(bucket_id='yard-sale-photos' and public.can_add_sale_photo(name));
create policy "Read approved photos or own private submissions" on storage.objects for select to anon,authenticated using(bucket_id='yard-sale-photos' and exists(select 1 from public.yard_sales s where s.id::text=split_part(name,'/',1) and ((s.approval_status='approved' and name=any(s.photo_paths)) or s.created_by=(select auth.uid()) or (select auth.jwt()->>'email')='organizer@arrowbrooke-map.invalid')));
create policy "Remove own sale photos or organizer moderation" on storage.objects for delete to authenticated using(bucket_id='yard-sale-photos' and exists(select 1 from public.yard_sales s where s.id::text=split_part(name,'/',1) and (s.created_by=(select auth.uid()) or (select auth.jwt()->>'email')='organizer@arrowbrooke-map.invalid')));

create or replace function public.submit_sale_photos(target_sale uuid, paths text[]) returns uuid language plpgsql security definer set search_path='' as $$
declare sale public.yard_sales%rowtype; review_id uuid;
begin
 select * into sale from public.yard_sales where id=target_sale for update;
 if sale.id is null or auth.uid() is null or (sale.created_by<>auth.uid() and coalesce(auth.jwt()->>'email','')<>'organizer@arrowbrooke-map.invalid') then raise exception 'This is not your listing.'; end if;
 if cardinality(paths) is null or cardinality(paths) not between 1 and 5 or array_position(paths,null) is not null then raise exception 'Choose one to five photos.'; end if;
 if (select count(distinct p) from unnest(paths) p)<>cardinality(paths) then raise exception 'Duplicate photos are not allowed.'; end if;
 if exists(select 1 from unnest(paths) p where split_part(p,'/',1)<>target_sale::text or not exists(select 1 from storage.objects o where o.bucket_id='yard-sale-photos' and o.name=p)) then raise exception 'Photo upload is incomplete.'; end if;
 insert into public.sale_photo_reviews(sale_id,created_by,address,photo_paths) values(target_sale,auth.uid(),sale.address,paths) returning id into review_id;
 return review_id;
end; $$;
revoke all on function public.submit_sale_photos(uuid,text[]) from public,anon;
grant execute on function public.submit_sale_photos(uuid,text[]) to authenticated;

create or replace function public.review_sale_photos(target_review uuid, decision text) returns uuid language plpgsql security definer set search_path='' as $$
declare review public.sale_photo_reviews%rowtype;
begin
 if coalesce(auth.jwt()->>'email','')<>'organizer@arrowbrooke-map.invalid' then raise exception 'Organizer login required.'; end if;
 if decision not in ('approved','rejected') or decision is null then raise exception 'Choose approve or reject.'; end if;
 select * into review from public.sale_photo_reviews where id=target_review for update;
 if review.id is null or review.status<>'pending' then raise exception 'This request has already been reviewed.'; end if;
 update public.sale_photo_reviews set status=decision,reviewed_at=now() where id=target_review;
 update public.yard_sales set photo_paths=case when decision='approved' then review.photo_paths else '{}'::text[] end where id=review.sale_id;
 return review.sale_id;
end; $$;
revoke all on function public.review_sale_photos(uuid,text) from public,anon;
grant execute on function public.review_sale_photos(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
select 'Private photo uploads and organizer approval ready' as result;
