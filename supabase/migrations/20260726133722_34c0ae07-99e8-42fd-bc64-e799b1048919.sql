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

  WITH teacher_ids AS (
    SELECT au.id AS user_id
    FROM auth.users au
    WHERE au.deleted_at IS NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = au.id AND ur.role = 'teacher'::public.app_role
        )
        OR EXISTS (
          SELECT 1 FROM public.teacher_requests tr
          WHERE tr.user_id = au.id
        )
        OR EXISTS (
          SELECT 1 FROM public.teacher_profiles tp
          WHERE tp.teacher_id = au.id
        )
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = au.id AND p.role = 'teacher'
        )
      )
  ),
  latest_requests AS (
    SELECT DISTINCT ON (tr.user_id)
      tr.*
    FROM public.teacher_requests tr
    JOIN teacher_ids ti ON ti.user_id = tr.user_id
    ORDER BY tr.user_id, tr.created_at DESC NULLS LAST, tr.id DESC
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
      ti.user_id,
      COALESCE(lr.id, ti.user_id) AS id,
      COALESCE(NULLIF(lr.full_name, ''), NULLIF(p.full_name, ''), au.email, 'معلم') AS full_name,
      COALESCE(NULLIF(lr.email, ''), NULLIF(p.email, ''), au.email, '') AS email,
      COALESCE(NULLIF(lr.phone, ''), NULLIF(p.phone, ''), NULL) AS phone,
      lr.school_name,
      lr.employee_id,
      CASE
        WHEN lr.status IN ('pending'::public.approval_status, 'approved'::public.approval_status, 'rejected'::public.approval_status) THEN lr.status::text
        WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = ti.user_id AND ur.role = 'teacher'::public.app_role) OR p.role = 'teacher' THEN 'approved'
        ELSE 'pending'
      END AS status,
      lr.rejection_reason,
      COALESCE(lr.created_at, p.created_at, au.created_at) AS created_at,
      COALESCE(lr.assigned_stages, ARRAY[]::text[]) AS assigned_stages,
      COALESCE(lr.assigned_grades, ARRAY[]::text[]) AS assigned_grades,
      lr.assigned_category,
      lr.education_type,
      tp.bio,
      tp.photo_url,
      tp.video_url,
      tp.is_approved AS is_profile_approved,
      COALESCE(ac.video_count, 0) AS video_count,
      COALESCE(ac.pdf_count, 0) AS pdf_count,
      COALESCE(ps.student_count, 0) AS student_count,
      COALESCE(p.is_banned, au.banned_until IS NOT NULL AND au.banned_until > now(), false) AS is_banned
    FROM teacher_ids ti
    JOIN auth.users au ON au.id = ti.user_id AND au.deleted_at IS NULL
    LEFT JOIN public.profiles p ON p.id = ti.user_id
    LEFT JOIN latest_requests lr ON lr.user_id = ti.user_id
    LEFT JOIN public.teacher_profiles tp ON tp.teacher_id = ti.user_id
    LEFT JOIN active_content ac ON ac.teacher_id = ti.user_id
    LEFT JOIN paid_students ps ON ps.teacher_id = ti.user_id
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
    'pending_profiles', COALESCE(count(*) FILTER (WHERE COALESCE(is_profile_approved, false) = false AND (bio IS NOT NULL OR photo_url IS NOT NULL OR video_url IS NOT NULL)), 0)
  )
  INTO result
  FROM ordered_rows;

  RETURN COALESCE(result, jsonb_build_object('teachers', '[]'::jsonb, 'total', 0, 'pending', 0, 'approved', 0, 'pending_profiles', 0));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_teacher_management() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_teacher_management() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_teacher_management() TO service_role;