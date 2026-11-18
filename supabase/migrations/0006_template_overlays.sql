-- Template PNGs stay private. Application routes issue short-lived access only
-- after checking workspace membership or event template approval.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('snapqueue-template-overlays','snapqueue-template-overlays',false,20971520,array['image/png'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
