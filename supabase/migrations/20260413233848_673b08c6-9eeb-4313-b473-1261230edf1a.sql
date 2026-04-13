
INSERT INTO storage.buckets (id, name, public) VALUES ('live-recordings', 'live-recordings', true);

CREATE POLICY "Teachers can upload recordings"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'live-recordings' AND auth.role() = 'authenticated');

CREATE POLICY "Anyone can view recordings"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'live-recordings');

CREATE POLICY "Teachers can delete own recordings"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'live-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);
