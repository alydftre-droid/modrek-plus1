
-- Add SELECT policy for students to read their own library content
drop policy if exists "Students can select own library content" on public.content;
create policy "Students can select own library content"
on public.content
for select
to authenticated
using (
  auth.uid() = uploaded_by
  and type = 'student_library'
);
