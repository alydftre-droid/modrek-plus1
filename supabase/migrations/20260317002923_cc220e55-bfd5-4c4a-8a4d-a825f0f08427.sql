-- Add media attachment support to support chat messages
ALTER TABLE public.support_messages
ADD COLUMN IF NOT EXISTS file_url TEXT,
ADD COLUMN IF NOT EXISTS file_type TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Ensure support message ownership queries remain efficient
CREATE INDEX IF NOT EXISTS idx_support_messages_user_created_at
ON public.support_messages (user_id, created_at DESC);

-- Create a private bucket for support chat uploads if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('support-uploads', 'support-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- Allow students to upload their own support attachments
CREATE POLICY "Students can upload own support attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'support-uploads'
  AND split_part(name, '/', 1) = auth.uid()::text
);

-- Allow students to read their own support attachments
CREATE POLICY "Students can read own support attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'support-uploads'
  AND split_part(name, '/', 1) = auth.uid()::text
);

-- Allow students to update their own support attachments
CREATE POLICY "Students can update own support attachments"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'support-uploads'
  AND split_part(name, '/', 1) = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'support-uploads'
  AND split_part(name, '/', 1) = auth.uid()::text
);

-- Allow students to delete their own support attachments
CREATE POLICY "Students can delete own support attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'support-uploads'
  AND split_part(name, '/', 1) = auth.uid()::text
);

-- Allow admins to fully access support attachments
CREATE POLICY "Admins manage support attachments"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'support-uploads'
  AND public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  bucket_id = 'support-uploads'
  AND public.has_role(auth.uid(), 'admin')
);