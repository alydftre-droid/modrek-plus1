DROP POLICY IF EXISTS "Teachers can manage own sub_subjects" ON public.sub_subjects;

CREATE POLICY "Teachers can manage group sub_subjects"
ON public.sub_subjects
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.content_groups cg
    WHERE cg.id = sub_subjects.group_id
      AND (cg.teacher_id = auth.uid() OR cg.created_by = auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.content_groups cg
    WHERE cg.id = sub_subjects.group_id
      AND (cg.teacher_id = auth.uid() OR cg.created_by = auth.uid())
  )
);

CREATE OR REPLACE FUNCTION public.get_default_sub_subject_names(
  p_category text,
  p_stage text,
  p_grade text,
  p_section text DEFAULT NULL::text,
  p_subject_name text DEFAULT NULL::text
)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_category text := lower(trim(coalesce(p_category, '')));
  v_stage text := lower(trim(coalesce(p_stage, '')));
  v_grade text := lower(trim(coalesce(p_grade, '')));
  v_section text := lower(trim(coalesce(p_section, '')));
  v_subject text := lower(trim(coalesce(p_subject_name, '')));
  v_scope text;
BEGIN
  v_scope := v_category || ' ' || v_subject;
  v_scope := replace(replace(replace(replace(v_scope, 'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا'), 'ى', 'ي');
  v_section := replace(replace(replace(replace(v_section, 'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا'), 'ى', 'ي');

  IF v_category = 'arabic' OR v_scope LIKE '%عرب%' THEN
    RETURN ARRAY['النحو','الصرف','البلاغة','الأدب والنصوص','القراءة','الإملاء','التعبير'];
  END IF;

  IF v_category IN ('sharia', 'religious') OR v_scope LIKE '%شرع%' THEN
    IF v_stage = 'preparatory' THEN
      RETURN ARRAY['التوحيد','الحديث','التفسير','السيرة','الفقه'];
    END IF;
    IF v_stage = 'secondary' AND v_grade IN ('first','second') THEN
      RETURN ARRAY['التفسير','الحديث','التوحيد','الفقه الشافعي'];
    END IF;
    IF v_stage = 'secondary' AND v_grade = 'third' THEN
      RETURN ARRAY['التفسير','الحديث','التوحيد','الفقه الشافعي','الميراث'];
    END IF;
    RETURN ARRAY['التفسير','الحديث','التوحيد','الفقه'];
  END IF;

  IF v_category IN ('studies', 'social')
     OR v_scope LIKE '%دراس%'
     OR v_scope LIKE '%تاريخ%'
     OR v_scope LIKE '%جغراف%' THEN
    RETURN ARRAY['التاريخ','الجغرافيا'];
  END IF;

  IF v_category = 'math' OR v_scope LIKE '%رياض%' OR v_scope LIKE '%math%' THEN
    IF v_stage = 'preparatory' THEN
      RETURN ARRAY['الجبر','الهندسة'];
    END IF;
    IF v_stage = 'secondary' AND v_grade = 'first' THEN
      RETURN ARRAY['الجبر','الهندسة','حساب المثلثات'];
    END IF;
    IF v_stage = 'secondary' AND v_grade = 'second' THEN
      RETURN ARRAY['الجبر','حساب المثلثات','الهندسة التحليلية'];
    END IF;
    IF v_stage = 'secondary' AND v_grade = 'third' THEN
      RETURN ARRAY['الجبر','الهندسة الفراغية','التفاضل والتكامل','الاستاتيكا','الديناميكا'];
    END IF;
    RETURN ARRAY['الجبر','الهندسة'];
  END IF;

  RETURN ARRAY[]::text[];
END;
$function$;