
-- Allow teachers to upload to books bucket
CREATE POLICY "Teachers can upload books"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'books' AND has_role(auth.uid(), 'teacher'::app_role));

-- Allow teachers to upload to videos bucket
CREATE POLICY "Teachers can upload videos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'videos' AND has_role(auth.uid(), 'teacher'::app_role));

-- Allow teachers to upload to exams bucket
CREATE POLICY "Teachers can upload exams"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'exams' AND has_role(auth.uid(), 'teacher'::app_role));

-- Allow teachers to delete their own files
CREATE POLICY "Teachers can delete books"
ON storage.objects FOR DELETE
USING (bucket_id = 'books' AND has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Teachers can delete videos"
ON storage.objects FOR DELETE
USING (bucket_id = 'videos' AND has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Teachers can delete exams"
ON storage.objects FOR DELETE
USING (bucket_id = 'exams' AND has_role(auth.uid(), 'teacher'::app_role));

-- Allow teachers to insert content rows
CREATE POLICY "Teachers can insert content"
ON public.content FOR INSERT
WITH CHECK (has_role(auth.uid(), 'teacher'::app_role) AND auth.uid() = uploaded_by);

-- Allow teachers to update their own content
CREATE POLICY "Teachers can update own content"
ON public.content FOR UPDATE
USING (has_role(auth.uid(), 'teacher'::app_role) AND auth.uid() = uploaded_by);

-- Allow teachers to delete (soft) their own content
CREATE POLICY "Teachers can delete own content"
ON public.content FOR DELETE
USING (has_role(auth.uid(), 'teacher'::app_role) AND auth.uid() = uploaded_by);
