begin;
alter table public.sale_photo_reviews drop constraint if exists sale_photo_reviews_sale_id_key;
create index if not exists sale_photo_reviews_sale_id_idx on public.sale_photo_reviews(sale_id);

create or replace function public.yard_sale_photo_capacity(target_sale uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare used integer;
begin
 if not exists(select 1 from public.yard_sales where id=target_sale and approval_status='approved') then raise exception 'Sale not found.'; end if;
 select count(*) into used from storage.objects where bucket_id='yard-sale-photos' and split_part(name,'/',1)=target_sale::text;
 return jsonb_build_object('limit',5,'used',used,'remaining',greatest(0,5-used));
end; $$;
revoke all on function public.yard_sale_photo_capacity(uuid) from public;
grant execute on function public.yard_sale_photo_capacity(uuid) to anon,authenticated;

create or replace function public.can_add_sale_photo(object_name text) returns boolean language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if auth.uid() is null or object_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' then return false; end if;
 begin target:=split_part(object_name,'/',1)::uuid; exception when invalid_text_representation then return false; end;
 perform pg_advisory_xact_lock(hashtext('sale-photo:'||target::text));
 if not exists(select 1 from public.yard_sales where id=target and approval_status='approved') then return false; end if;
 return (select count(*) from storage.objects where bucket_id='yard-sale-photos' and split_part(name,'/',1)=target::text)<5;
end; $$;

drop policy if exists "Read approved photos or own private submissions" on storage.objects;
create policy "Read approved photos or own private submissions" on storage.objects for select to anon,authenticated using(bucket_id='yard-sale-photos' and exists(select 1 from public.yard_sales s where s.id::text=split_part(name,'/',1) and ((s.approval_status='approved' and name=any(s.photo_paths)) or s.created_by=(select auth.uid()) or (select auth.jwt()->>'email')='organizer@arrowbrooke-map.invalid' or owner_id=(select auth.uid())::text)));
drop policy if exists "Remove own sale photos or organizer moderation" on storage.objects;
create policy "Remove own sale photos or organizer moderation" on storage.objects for delete to authenticated using(bucket_id='yard-sale-photos' and exists(select 1 from public.yard_sales s where s.id::text=split_part(name,'/',1) and (s.created_by=(select auth.uid()) or (select auth.jwt()->>'email')='organizer@arrowbrooke-map.invalid' or (owner_id=(select auth.uid())::text and not exists(select 1 from public.sale_photo_reviews r where r.sale_id=s.id and name=any(r.photo_paths))))));

create or replace function public.submit_sale_photos(target_sale uuid, paths text[]) returns uuid language plpgsql security definer set search_path='' as $$
declare sale public.yard_sales%rowtype; review_id uuid;
begin
 select * into sale from public.yard_sales where id=target_sale and approval_status='approved' for update;
 if sale.id is null or auth.uid() is null then raise exception 'Sale not found or connection expired.'; end if;
 if cardinality(paths) is null or cardinality(paths) not between 1 and 5 or array_position(paths,null) is not null then raise exception 'Choose one to five photos.'; end if;
 if (select count(distinct p) from unnest(paths) p)<>cardinality(paths) then raise exception 'Duplicate photos are not allowed.'; end if;
 if exists(select 1 from unnest(paths) p where split_part(p,'/',1)<>target_sale::text or not exists(select 1 from storage.objects o where o.bucket_id='yard-sale-photos' and o.name=p and (o.owner_id=auth.uid()::text or coalesce(auth.jwt()->>'email','')='organizer@arrowbrooke-map.invalid'))) then raise exception 'Photo upload is incomplete or belongs to another visitor.'; end if;
 if exists(select 1 from public.sale_photo_reviews r where r.sale_id=target_sale and r.photo_paths&&paths) then raise exception 'These photos have already been submitted.'; end if;
 if (select count(*) from storage.objects where bucket_id='yard-sale-photos' and split_part(name,'/',1)=target_sale::text)>5 then raise exception 'This sale already has five photos.'; end if;
 insert into public.sale_photo_reviews(sale_id,created_by,address,photo_paths) values(target_sale,auth.uid(),sale.address,paths) returning id into review_id;
 return review_id;
end; $$;

create or replace function public.review_sale_photo(target_review uuid, target_path text, decision text) returns uuid language plpgsql security definer set search_path='' as $$
declare review public.sale_photo_reviews%rowtype; target_sale uuid; approved text[]; rejected text[]; next_status text;
begin
 if coalesce(auth.jwt()->>'email','')<>'organizer@arrowbrooke-map.invalid' then raise exception 'Organizer login required.'; end if;
 if decision is null or decision not in ('approved','rejected') then raise exception 'Choose approve or reject.'; end if;
 select sale_id into target_sale from public.sale_photo_reviews where id=target_review;
 perform 1 from public.yard_sales where id=target_sale for update;
 select * into review from public.sale_photo_reviews where id=target_review for update;
 if review.id is null or target_path is null or not(target_path=any(review.photo_paths)) then raise exception 'Photo not found in this review.'; end if;
 approved:=array_remove(review.approved_paths,target_path); rejected:=array_remove(review.rejected_paths,target_path);
 if decision='approved' then
  if not exists(select 1 from storage.objects where bucket_id='yard-sale-photos' and name=target_path) then raise exception 'This photo is no longer available.'; end if;
  approved:=array_append(approved,target_path);
 else rejected:=array_append(rejected,target_path); end if;
 next_status:=case when cardinality(approved)+cardinality(rejected)<cardinality(review.photo_paths) then 'pending' when cardinality(approved)>0 then 'approved' else 'rejected' end;
 update public.sale_photo_reviews set approved_paths=approved,rejected_paths=rejected,status=next_status,reviewed_at=now() where id=target_review;
 update public.yard_sales set photo_paths=array(select distinct p from public.sale_photo_reviews r cross join lateral unnest(r.approved_paths) p where r.sale_id=target_sale and exists(select 1 from storage.objects o where o.bucket_id='yard-sale-photos' and o.name=p)) where id=target_sale;
 return target_sale;
end; $$;
notify pgrst,'reload schema';
commit;
select 'Later photo submissions enabled, five stored photos per sale, organizer approval preserved' as result;
