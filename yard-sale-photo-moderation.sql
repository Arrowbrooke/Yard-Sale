begin;
alter table public.sale_photo_reviews add column if not exists approved_paths text[] not null default '{}';
alter table public.sale_photo_reviews add column if not exists rejected_paths text[] not null default '{}';
update public.sale_photo_reviews set approved_paths=photo_paths where status='approved' and cardinality(approved_paths)=0;
update public.sale_photo_reviews set rejected_paths=photo_paths where status='rejected' and cardinality(rejected_paths)=0;

create or replace function public.review_sale_photo(target_review uuid, target_path text, decision text) returns uuid language plpgsql security definer set search_path='' as $$
declare review public.sale_photo_reviews%rowtype; approved text[]; rejected text[]; next_status text;
begin
 if coalesce(auth.jwt()->>'email','')<>'organizer@arrowbrooke-map.invalid' then raise exception 'Organizer login required.'; end if;
 if decision is null or decision not in ('approved','rejected') then raise exception 'Choose approve or reject.'; end if;
 select * into review from public.sale_photo_reviews where id=target_review for update;
 if review.id is null or target_path is null or not(target_path=any(review.photo_paths)) then raise exception 'Photo not found in this review.'; end if;
 approved:=array_remove(review.approved_paths,target_path); rejected:=array_remove(review.rejected_paths,target_path);
 if decision='approved' then
  if not exists(select 1 from storage.objects where bucket_id='yard-sale-photos' and name=target_path) then raise exception 'This photo is no longer available.'; end if;
  approved:=array_append(approved,target_path);
 else rejected:=array_append(rejected,target_path); end if;
 next_status:=case when cardinality(approved)+cardinality(rejected)<cardinality(review.photo_paths) then 'pending' when cardinality(approved)>0 then 'approved' else 'rejected' end;
 update public.sale_photo_reviews set approved_paths=approved,rejected_paths=rejected,status=next_status,reviewed_at=now() where id=target_review;
 update public.yard_sales set photo_paths=approved where id=review.sale_id;
 return review.sale_id;
end; $$;
revoke all on function public.review_sale_photo(uuid,text,text) from public,anon;
grant execute on function public.review_sale_photo(uuid,text,text) to authenticated;

create or replace function public.review_selected_sale_photos(target_review uuid, paths text[], decision text) returns uuid language plpgsql security definer set search_path='' as $$
declare path text; sale uuid;
begin
 if coalesce(auth.jwt()->>'email','')<>'organizer@arrowbrooke-map.invalid' then raise exception 'Organizer login required.'; end if;
 if cardinality(paths) is null or cardinality(paths) not between 1 and 5 or array_position(paths,null) is not null then raise exception 'Select one to five photos.'; end if;
 foreach path in array paths loop sale:=public.review_sale_photo(target_review,path,decision); end loop;
 return sale;
end; $$;
revoke all on function public.review_selected_sale_photos(uuid,text[],text) from public,anon;
grant execute on function public.review_selected_sale_photos(uuid,text[],text) to authenticated;

create or replace function public.remove_sale_photo(target_sale uuid,target_path text) returns uuid language plpgsql security definer set search_path='' as $$
declare review_id uuid;
begin
 if coalesce(auth.jwt()->>'email','')<>'organizer@arrowbrooke-map.invalid' then raise exception 'Organizer login required.'; end if;
 select id into review_id from public.sale_photo_reviews where sale_id=target_sale and target_path=any(photo_paths);
 if review_id is not null then return public.review_sale_photo(review_id,target_path,'rejected'); end if;
 update public.yard_sales set photo_paths=array_remove(photo_paths,target_path) where id=target_sale and target_path=any(photo_paths);
 if not found then raise exception 'Photo not found on this sale.'; end if;
 return target_sale;
end; $$;
revoke all on function public.remove_sale_photo(uuid,text) from public,anon;
grant execute on function public.remove_sale_photo(uuid,text) to authenticated;

-- Older open tabs can finish a review without losing individual decisions.
create or replace function public.review_sale_photos(target_review uuid,decision text) returns uuid language plpgsql security definer set search_path='' as $$
declare review public.sale_photo_reviews%rowtype; path text;
begin
 if coalesce(auth.jwt()->>'email','')<>'organizer@arrowbrooke-map.invalid' then raise exception 'Organizer login required.'; end if;
 if decision is null or decision not in ('approved','rejected') then raise exception 'Choose approve or reject.'; end if;
 select * into review from public.sale_photo_reviews where id=target_review for update;
 if review.id is null or review.status<>'pending' then raise exception 'This request has already been reviewed.'; end if;
 foreach path in array review.photo_paths loop
  if not(path=any(review.approved_paths)) and not(path=any(review.rejected_paths)) then perform public.review_sale_photo(target_review,path,decision); end if;
 end loop;
 return review.sale_id;
end; $$;
notify pgrst,'reload schema';
commit;
select 'Individual photo approval, rejection and removal ready' as result;
