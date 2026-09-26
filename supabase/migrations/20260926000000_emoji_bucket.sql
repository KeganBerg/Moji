-- Public bucket for finished emoji, used by the "Get a share link" button.
-- Anyone can read; anonymous uploads are limited to small images under public/.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('emojis', 'emojis', true, 524288, array['image/png', 'image/gif', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "Anyone can upload emoji to public/"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'emojis' and (storage.foldername(name))[1] = 'public');
