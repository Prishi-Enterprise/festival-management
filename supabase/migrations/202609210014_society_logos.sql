-- Public society branding only; no financial or resident documents in this bucket.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('society-logos','society-logos',true,131072,array['image/png']) on conflict(id) do update set public=true,file_size_limit=131072,allowed_mime_types=array['image/png'];
create policy society_logo_upload on storage.objects for insert to authenticated with check(bucket_id='society-logos' and private.is_superadmin());
-- Immutable unique filenames: replacing a society logo changes its database path.
-- No public write, listing, overwrite or delete grants are added.
