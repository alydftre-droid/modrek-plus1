-- ============================================================
-- Permanent teacher visibility protection layer
-- ============================================================

-- 1) Diagnostics log table
CREATE TABLE IF NOT EXISTS public.teacher_visibility_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid,
  check_name text NOT NULL,
  status text NOT NULL,           -- 'ok' | 'repaired' | 'error'
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.teacher_visibility_diagnostics TO authenticated;
GRANT ALL ON public.teacher_visibility_diagnostics TO service_role;
ALTER TABLE public.teacher_visibility_diagnostics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read teacher diagnostics" ON public.teacher_visibility_diagnostics;
CREATE POLICY "Admins read teacher diagnostics"
  ON public.teacher_visibility_diagnostics FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_teacher_diag_teacher ON public.teacher_visibility_diagnostics(teacher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_diag_status ON public.teacher_visibility_diagnostics(status, created_at DESC);

-- 2) Auto-repair function: ensure profile, teacher_profile, assignments and role exist for an approved teacher
CREATE OR REPLACE FUNCTION public.ensure_teacher_visibility(_teacher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.teacher_requests%ROWTYPE;
  v_grade text;
  v_grade_stage text;
  v_repairs jsonb := '[]'::jsonb;
  v_added_assignments int := 0;
  v_added_role boolean := false;
  v_added_tp boolean := false;
BEGIN
  SELECT * INTO v_req FROM public.teacher_requests
   WHERE user_id = _teacher_id AND status = 'approved'
   ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.teacher_visibility_diagnostics(teacher_id, check_name, status, details)
    VALUES (_teacher_id, 'ensure_teacher_visibility', 'ok', jsonb_build_object('reason','no_approved_request'));
    RETURN jsonb_build_object('success', true, 'skipped', true);
  END IF;

  -- Ensure teacher role
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _teacher_id AND role = 'teacher'::app_role) THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (_teacher_id, 'teacher'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    v_added_role := true;
    v_repairs := v_repairs || jsonb_build_object('added_role', true);
  END IF;

  -- Ensure teacher_profiles row
  IF NOT EXISTS (SELECT 1 FROM public.teacher_profiles WHERE user_id = _teacher_id) THEN
    INSERT INTO public.teacher_profiles(user_id, education_type)
    VALUES (_teacher_id, v_req.education_type)
    ON CONFLICT (user_id) DO NOTHING;
    v_added_tp := true;
    v_repairs := v_repairs || jsonb_build_object('added_teacher_profile', true);
  END IF;

  -- Ensure assignments
  IF v_req.assigned_grades IS NOT NULL THEN
    FOREACH v_grade IN ARRAY v_req.assigned_grades LOOP
      IF v_grade LIKE '%إعدادي%' THEN v_grade_stage := 'preparatory';
      ELSIF v_grade LIKE '%ثانوي%' THEN v_grade_stage := 'secondary';
      ELSE v_grade_stage := COALESCE(v_req.assigned_stages[1], 'preparatory');
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM public.teacher_assignments
        WHERE teacher_id = _teacher_id
          AND grade = v_grade
          AND category = COALESCE(v_req.assigned_category,'')
      ) THEN
        INSERT INTO public.teacher_assignments
          (teacher_id, stage, grade, category, section, education_type, teaches_integrated_science)
        VALUES
          (_teacher_id, v_grade_stage, v_grade, COALESCE(v_req.assigned_category,''),
           CASE WHEN v_req.assigned_sections IS NOT NULL AND array_length(v_req.assigned_sections,1) > 0
                THEN v_req.assigned_sections[1] ELSE NULL END,
           v_req.education_type, COALESCE(v_req.teaches_integrated_science, false))
        ON CONFLICT DO NOTHING;
        v_added_assignments := v_added_assignments + 1;
      END IF;
    END LOOP;
  END IF;

  IF v_added_assignments > 0 THEN
    v_repairs := v_repairs || jsonb_build_object('added_assignments', v_added_assignments);
  END IF;

  INSERT INTO public.teacher_visibility_diagnostics(teacher_id, check_name, status, details)
  VALUES (
    _teacher_id,
    'ensure_teacher_visibility',
    CASE WHEN v_added_role OR v_added_tp OR v_added_assignments > 0 THEN 'repaired' ELSE 'ok' END,
    jsonb_build_object('repairs', v_repairs, 'request_id', v_req.id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'repaired', (v_added_role OR v_added_tp OR v_added_assignments > 0),
    'added_role', v_added_role,
    'added_teacher_profile', v_added_tp,
    'added_assignments', v_added_assignments
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.teacher_visibility_diagnostics(teacher_id, check_name, status, details)
  VALUES (_teacher_id, 'ensure_teacher_visibility', 'error', jsonb_build_object('error', SQLERRM));
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 3) Trigger on teacher_requests: auto-ensure visibility on approval / update
CREATE OR REPLACE FUNCTION public.tg_ensure_teacher_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' THEN
    PERFORM public.ensure_teacher_visibility(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_teacher_visibility ON public.teacher_requests;
CREATE TRIGGER trg_ensure_teacher_visibility
AFTER INSERT OR UPDATE OF status, assigned_grades, assigned_category, assigned_sections, assigned_stages, education_type
ON public.teacher_requests
FOR EACH ROW
EXECUTE FUNCTION public.tg_ensure_teacher_visibility();

-- 4) Full regression check: scans all approved teachers and auto-repairs.
CREATE OR REPLACE FUNCTION public.run_teacher_visibility_audit()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_total int := 0;
  v_repaired int := 0;
  v_res jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  FOR r IN
    SELECT DISTINCT user_id FROM public.teacher_requests WHERE status = 'approved'
  LOOP
    v_total := v_total + 1;
    v_res := public.ensure_teacher_visibility(r.user_id);
    IF COALESCE((v_res->>'repaired')::boolean, false) THEN
      v_repaired := v_repaired + 1;
    END IF;
  END LOOP;

  INSERT INTO public.teacher_visibility_diagnostics(check_name, status, details)
  VALUES ('full_audit', 'ok',
          jsonb_build_object('total_checked', v_total, 'repaired', v_repaired));

  RETURN jsonb_build_object('success', true, 'total_checked', v_total, 'repaired', v_repaired);
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_teacher_visibility_audit() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_teacher_visibility(uuid) TO authenticated;

-- 5) Run an initial audit so any currently-broken teacher is fixed immediately.
SELECT public.run_teacher_visibility_audit();