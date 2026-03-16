-- Create a dedicated private bucket for student library uploads if it does not exist
insert into storage.buckets (id, name, public, file_size_limit)
select 'student-library', 'student-library', false, 524288000
where not exists (
  select 1 from storage.buckets where id = 'student-library'
);

-- Allow students to upload their own library files under library/{user_id}/...
drop policy if exists "Students can upload own student library files" on storage.objects;
create policy "Students can upload own student library files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'student-library'
  and split_part(name, '/', 1) = 'library'
  and split_part(name, '/', 2) = auth.uid()::text
);

-- Allow students to update their own library files
drop policy if exists "Students can update own student library files" on storage.objects;
create policy "Students can update own student library files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'student-library'
  and split_part(name, '/', 1) = 'library'
  and split_part(name, '/', 2) = auth.uid()::text
)
with check (
  bucket_id = 'student-library'
  and split_part(name, '/', 1) = 'library'
  and split_part(name, '/', 2) = auth.uid()::text
);

-- Allow students to delete their own library files
drop policy if exists "Students can delete own student library files" on storage.objects;
create policy "Students can delete own student library files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'student-library'
  and split_part(name, '/', 1) = 'library'
  and split_part(name, '/', 2) = auth.uid()::text
);

-- Allow students to read only their own library files
drop policy if exists "Students can read own student library files" on storage.objects;
create policy "Students can read own student library files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'student-library'
  and split_part(name, '/', 1) = 'library'
  and split_part(name, '/', 2) = auth.uid()::text
);

-- Allow students to register only their own library items in content
drop policy if exists "Students can insert own library content" on public.content;
create policy "Students can insert own library content"
on public.content
for insert
to authenticated
with check (
  auth.uid() = uploaded_by
  and type = 'student_library'
  and coalesce(is_paid, false) = false
  and subject_id is null
  and group_id is null
);

-- Allow students to update only their own library items
drop policy if exists "Students can update own library content" on public.content;
create policy "Students can update own library content"
on public.content
for update
to authenticated
using (
  auth.uid() = uploaded_by
  and type = 'student_library'
)
with check (
  auth.uid() = uploaded_by
  and type = 'student_library'
);

-- Allow students to delete only their own library items
drop policy if exists "Students can delete own library content" on public.content;
create policy "Students can delete own library content"
on public.content
for delete
to authenticated
using (
  auth.uid() = uploaded_by
  and type = 'student_library'
);