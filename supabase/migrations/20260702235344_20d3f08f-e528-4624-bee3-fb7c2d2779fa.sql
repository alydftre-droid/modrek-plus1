
DROP POLICY IF EXISTS "modrek_lib_read" ON storage.objects;
DROP POLICY IF EXISTS "modrek_lib_insert" ON storage.objects;
DROP POLICY IF EXISTS "modrek_lib_update" ON storage.objects;
DROP POLICY IF EXISTS "modrek_lib_delete" ON storage.objects;

CREATE POLICY "modrek_lib_read" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'modrek-library' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "modrek_lib_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'modrek-library' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "modrek_lib_update" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'modrek-library' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "modrek_lib_delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'modrek-library' AND public.has_role(auth.uid(),'admin'));
