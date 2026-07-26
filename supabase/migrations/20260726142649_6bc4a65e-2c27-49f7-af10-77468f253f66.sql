-- Fix ghost teachers caused by inconsistent role rows.
-- A user cannot be counted as an active teacher from user_roles alone if their profile is still student
-- and they do not have an approved teacher request.
DELETE FROM public.user_roles ur
USING public.profiles p
WHERE ur.user_id = p.id
  AND ur.role = 'teacher'::public.app_role
  AND COALESCE(p.role, '') <> 'teacher'
  AND NOT EXISTS (
    SELECT 1
    FROM public.teacher_requests tr
    WHERE tr.user_id = ur.user_id
      AND tr.status = 'approved'::public.approval_status
  );

CREATE OR REPLACE FUNCTION public.admin_get_teacher_management()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'غير مصرح' USING ERRCODE = '42501';
  END IF;

  WITH latest_requests AS (
    SELECT DISTINCT ON (tr.user_id)
      tr.*
    FROM public.teacher_requests tr
    JOIN auth.users au ON au.id = tr.user_id AND au.deleted_at IS NULL
    WHERE tr.status IN ('pending'::public.approval_status, 'approved'::public.approval_status)
    ORDER BY tr.user_id, tr.created_at DESC NULLS LAST, tr.id DESC
  ),
  valid_teachers AS (
    SELECT
      lr.*,
      p.role AS profile_role,
      p.full_name AS profile_full_name,
      p.email AS profile_email,
      p.phone AS profile_phone,
      p.created_at AS profile_created_at,
      p.is_banned AS profile_is_banned,
      au.email AS auth_email,
      au.created_at AS auth_created_at,
      au.banned_until AS auth_banned_until,
      CASE
        WHEN lr.status = 'pending'::public.approval_status THEN 'pending'
        WHEN lr.status = 'approved'::public.approval_status
          AND p.role = 'teacher'
          AND EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id = lr.user_id
              AND ur.role = 'teacher'::public.app_role
          )
          THEN 'approved'
        ELSE NULL
      END AS effective_status
    FROM latest_requests lr
    JOIN auth.users au ON au.id = lr.user_id AND au.deleted_at IS NULL
    LEFT JOIN public.profiles p ON p.id = lr.user_id
  ),
  teacher_ids AS (
    SELECT user_id
    FROM valid_teachers
    WHERE effective_status IN ('pending', 'approved')
  ),
  active_content AS (
    SELECT
      c.uploaded_by AS teacher_id,
      count(*) FILTER (WHERE c.type = 'video')::int AS video_count,
      count(*) FILTER (WHERE c.type <> 'video' OR c.type IS NULL)::int AS pdf_count
    FROM public.content c
    JOIN teacher_ids ti ON ti.user_id = c.uploaded_by
    WHERE COALESCE(c.is_active, true) = true
    GROUP BY c.uploaded_by
  ),
  paid_students AS (
    SELECT
      COALESCE(cg.teacher_id, cg.created_by) AS teacher_id,
      count(DISTINCT sgp.student_id)::int AS student_count
    FROM public.student_group_purchases sgp
    JOIN public.content_groups cg ON cg.id = sgp.group_id
    JOIN teacher_ids ti ON ti.user_id = COALESCE(cg.teacher_id, cg.created_by)
    WHERE COALESCE(cg.is_active, true) = true
      AND NOT public.is_test_student(sgp.student_id)
    GROUP BY COALESCE(cg.teacher_id, cg.created_by)
  ),
  rows AS (
    SELECT
      vt.user_id,
      vt.id,
      COALESCE(NULLIF(vt.full_name, ''), NULLIF(vt.profile_full_name, ''), vt.auth_email, 'معلم') AS full_name,
      COALESCE(NULLIF(vt.email, ''), NULLIF(vt.profile_email, ''), vt.auth_email, '') AS email,
      COALESCE(NULLIF(vt.phone, ''), NULLIF(vt.profile_phone, ''), NULL) AS phone,
      vt.school_name,
      vt.employee_id,
      vt.effective_status AS status,
      vt.rejection_reason,
      COALESCE(vt.created_at, vt.profile_created_at, vt.auth_created_at) AS created_at,
      COALESCE(vt.assigned_stages, ARRAY[]::text[]) AS assigned_stages,
      COALESCE(vt.assigned_grades, ARRAY[]::text[]) AS assigned_grades,
      vt.assigned_category,
      vt.education_type,
      tp.bio,
      tp.photo_url,
      tp.video_url,
      tp.is_approved AS is_profile_approved,
      COALESCE(ac.video_count, 0) AS video_count,
      COALESCE(ac.pdf_count, 0) AS pdf_count,
      COALESCE(ps.student_count, 0) AS student_count,
      COALESCE(vt.profile_is_banned, vt.auth_banned_until IS NOT NULL AND vt.auth_banned_until > now(), false) AS is_banned
    FROM valid_teachers vt
    LEFT JOIN public.teacher_profiles tp ON tp.teacher_id = vt.user_id
    LEFT JOIN active_content ac ON ac.teacher_id = vt.user_id
    LEFT JOIN paid_students ps ON ps.teacher_id = vt.user_id
    WHERE vt.effective_status IN ('pending', 'approved')
  ),
  ordered_rows AS (
    SELECT *
    FROM rows
    ORDER BY
      CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
      created_at DESC NULLS LAST,
      full_name ASC
  )
  SELECT jsonb_build_object(
    'teachers', COALESCE(jsonb_agg(to_jsonb(ordered_rows)), '[]'::jsonb),
    'total', COALESCE(count(*), 0),
    'pending', COALESCE(count(*) FILTER (WHERE status = 'pending'), 0),
    'approved', COALESCE(count(*) FILTER (WHERE status = 'approved'), 0),
    'pending_profiles', COALESCE(count(*) FILTER (WHERE COALESCE(is_profile_approved, false) = false AND (NULLIF(bio, '') IS NOT NULL OR NULLIF(photo_url, '') IS NOT NULL OR NULLIF(video_url, '') IS NOT NULL)), 0)
  )
  INTO result
  FROM ordered_rows;

  RETURN COALESCE(result, jsonb_build_object('teachers', '[]'::jsonb, 'total', 0, 'pending', 0, 'approved', 0, 'pending_profiles', 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_teacher_management() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_teacher_management() TO service_role;