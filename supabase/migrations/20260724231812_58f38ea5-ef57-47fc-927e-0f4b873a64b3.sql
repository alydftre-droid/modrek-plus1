CREATE OR REPLACE FUNCTION public.get_default_sub_subject_names(
  p_category text,
  p_stage text,
  p_grade text,
  p_section text DEFAULT NULL,
  p_subject_name text DEFAULT NULL
)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
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

  IF v_category IN ('studies', 'social') OR v_scope LIKE '%دراس%' THEN
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
$$;

CREATE OR REPLACE FUNCTION public.seed_group_sub_subjects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subject record;
  v_defaults text[];
BEGIN
  IF COALESCE(NEW.is_active, true) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT id, category, stage, grade, section, name
  INTO v_subject
  FROM public.subjects
  WHERE id = NEW.subject_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_defaults := public.get_default_sub_subject_names(
    v_subject.category,
    v_subject.stage,
    v_subject.grade,
    v_subject.section,
    v_subject.name
  );

  IF coalesce(array_length(v_defaults, 1), 0) = 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.sub_subjects (group_id, name, order_index, created_by, is_active)
  SELECT NEW.id, sub_name, ord - 1, COALESCE(NEW.teacher_id, NEW.created_by), true
  FROM unnest(v_defaults) WITH ORDINALITY AS seeded(sub_name, ord)
  ON CONFLICT (group_id, name) DO UPDATE
    SET is_active = true,
        order_index = EXCLUDED.order_index,
        created_by = COALESCE(public.sub_subjects.created_by, EXCLUDED.created_by);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_group_sub_subjects ON public.content_groups;
CREATE TRIGGER trg_seed_group_sub_subjects
AFTER INSERT OR UPDATE OF subject_id, is_active ON public.content_groups
FOR EACH ROW
WHEN (COALESCE(NEW.is_active, true) = true)
EXECUTE FUNCTION public.seed_group_sub_subjects();

REVOKE EXECUTE ON FUNCTION public.get_default_sub_subject_names(text, text, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_group_sub_subjects() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_default_sub_subject_names(text, text, text, text, text) TO authenticated, service_role, supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.seed_group_sub_subjects() TO authenticated, service_role;