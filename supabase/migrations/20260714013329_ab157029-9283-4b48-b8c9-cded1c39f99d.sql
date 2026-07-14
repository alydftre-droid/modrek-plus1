-- RLS root-cause fix: table GRANTs are not enough while RLS is enabled.
-- The upload wizard and student library taxonomy must be readable from the
-- live database, while writes remain admin-only through the existing policies.

DROP POLICY IF EXISTS "Public can read active library stages" ON public.library_stages;
CREATE POLICY "Public can read active library stages"
  ON public.library_stages
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Public can read active library sections" ON public.library_sections;
CREATE POLICY "Public can read active library sections"
  ON public.library_sections
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Public can read active library grades" ON public.library_grades;
CREATE POLICY "Public can read active library grades"
  ON public.library_grades
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Public can read active library tracks" ON public.library_tracks;
CREATE POLICY "Public can read active library tracks"
  ON public.library_tracks
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Public can read active library subjects" ON public.library_subjects;
CREATE POLICY "Public can read active library subjects"
  ON public.library_subjects
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true AND source_subject_id IS NOT NULL);

DROP POLICY IF EXISTS "Public can read active library sub subjects" ON public.library_sub_subjects;
CREATE POLICY "Public can read active library sub subjects"
  ON public.library_sub_subjects
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

NOTIFY pgrst, 'reload schema';