-- Final production repair for Developer > Teacher Affairs detail dashboard.
-- Root cause: production database was missing the developer teacher RPCs used by the rebuilt UI.

CREATE OR REPLACE FUNCTION public.is_developer_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.has_role(_user_id, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _user_id
        AND (p.role = 'admin' OR lower(coalesce(p.email, '')) IN ('aliana200713@gmail.com','alyedaft@gmail.com'))
    ), false
  );
$$;

ALTER TABLE public.teacher_activity_logs ADD COLUMN IF NOT EXISTS device_type text;
ALTER TABLE public.teacher_activity_logs ADD COLUMN IF NOT EXISTS browser text;
ALTER TABLE public.teacher_activity_logs ADD COLUMN IF NOT EXISTS os text;
ALTER TABLE public.teacher_activity_logs ADD COLUMN IF NOT EXISTS session_id text;
ALTER TABLE public.teacher_activity_logs ADD COLUMN IF NOT EXISTS description text;

CREATE OR REPLACE FUNCTION public.get_developer_teacher_profile(_teacher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_caller uuid := auth.uid(); v_result jsonb;
BEGIN
  IF v_caller IS NULL OR NOT public.is_developer_admin(v_caller) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT jsonb_build_object(
    'id', p.id, 'full_name', p.full_name, 'teacher_code', p.teacher_code,
    'avatar_url', COALESCE(tp.photo_url, p.avatar_url), 'photo_url', tp.photo_url,
    'email', p.email, 'phone', p.phone, 'created_at', p.created_at,
    'is_banned', COALESCE(p.is_banned,false), 'role', p.role,
    'professional_title', tp.professional_title, 'bio', tp.bio,
    'experience_years', tp.experience_years,
    'is_approved', COALESCE(tp.is_approved,false),
    'commission_rate', COALESCE(p.commission_rate, 0.55)
  ) INTO v_result
  FROM public.profiles p LEFT JOIN public.teacher_profiles tp ON tp.teacher_id=p.id
  WHERE p.id=_teacher_id;
  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_developer_teacher_overview(_teacher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid(); v_total_students int := 0; v_active_30 int := 0; v_courses int := 0;
  v_videos int := 0; v_pdfs int := 0; v_views bigint := 0; v_watch_hours numeric := 0;
  v_active_subs int := 0; v_wallet jsonb;
BEGIN
  IF v_caller IS NULL OR NOT public.is_developer_admin(v_caller) THEN RAISE EXCEPTION 'not authorized'; END IF;

  SELECT COUNT(DISTINCT sgp.student_id) INTO v_total_students
  FROM public.student_group_purchases sgp JOIN public.content_groups cg ON cg.id=sgp.group_id
  WHERE COALESCE(cg.teacher_id,cg.created_by)=_teacher_id;

  SELECT COUNT(DISTINCT sgp.student_id) INTO v_active_30
  FROM public.student_group_purchases sgp JOIN public.content_groups cg ON cg.id=sgp.group_id
  WHERE COALESCE(cg.teacher_id,cg.created_by)=_teacher_id AND sgp.purchased_at > now()-interval '30 days';

  SELECT COUNT(*) INTO v_active_subs
  FROM public.student_group_purchases sgp JOIN public.content_groups cg ON cg.id=sgp.group_id
  WHERE COALESCE(cg.teacher_id,cg.created_by)=_teacher_id AND COALESCE(cg.is_active,true)=true;

  SELECT COUNT(*) INTO v_courses FROM public.content_groups WHERE COALESCE(teacher_id,created_by)=_teacher_id;

  SELECT COUNT(*) INTO v_videos
  FROM public.content c LEFT JOIN public.content_groups cg ON cg.id=c.group_id
  WHERE (c.uploaded_by=_teacher_id OR COALESCE(cg.teacher_id,cg.created_by)=_teacher_id)
    AND lower(COALESCE(c.type,'')) IN ('video','videos','فيديو') AND COALESCE(c.is_active,true)=true;

  SELECT COUNT(*) INTO v_pdfs
  FROM public.content c LEFT JOIN public.content_groups cg ON cg.id=c.group_id
  WHERE (c.uploaded_by=_teacher_id OR COALESCE(cg.teacher_id,cg.created_by)=_teacher_id)
    AND lower(COALESCE(c.type,'')) IN ('pdf','file','document','documents','ملف','ملفات') AND COALESCE(c.is_active,true)=true;

  SELECT COALESCE(COUNT(*),0), COALESCE(SUM(vp.progress_seconds)/3600.0,0) INTO v_views, v_watch_hours
  FROM public.video_progress vp JOIN public.content c ON c.id=vp.content_id LEFT JOIN public.content_groups cg ON cg.id=c.group_id
  WHERE c.uploaded_by=_teacher_id OR COALESCE(cg.teacher_id,cg.created_by)=_teacher_id;

  SELECT jsonb_build_object('balance',COALESCE(balance,0),'total_earned',COALESCE(total_earned,0),'frozen_balance',COALESCE(frozen_balance,0)) INTO v_wallet
  FROM public.teacher_wallets WHERE teacher_id=_teacher_id;

  RETURN jsonb_build_object('total_students',COALESCE(v_total_students,0),'active_students_30d',COALESCE(v_active_30,0),
    'active_subscriptions',COALESCE(v_active_subs,0),'courses_count',COALESCE(v_courses,0),'videos_count',COALESCE(v_videos,0),
    'pdfs_count',COALESCE(v_pdfs,0),'total_views',COALESCE(v_views,0),'watch_hours',ROUND(COALESCE(v_watch_hours,0),1),
    'wallet',COALESCE(v_wallet,'{"balance":0,"total_earned":0,"frozen_balance":0}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_developer_teacher_logs(_teacher_id uuid, _limit integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL OR NOT public.is_developer_admin(v_caller) THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at DESC) FROM (
    SELECT id, action_type, action_label,
      COALESCE(description, metadata->>'description', action_label) AS description,
      page_path, ip_address,
      COALESCE(device_type, metadata->>'device_type') AS device_type,
      COALESCE(browser, metadata->>'browser') AS browser,
      COALESCE(os, metadata->>'os') AS os,
      COALESCE(session_id, metadata->>'session_id') AS session_id,
      duration_seconds, metadata, created_at
    FROM public.teacher_activity_logs WHERE teacher_id=_teacher_id
    ORDER BY created_at DESC LIMIT LEAST(GREATEST(COALESCE(_limit,500),1),2000)
  ) l), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_developer_teacher_courses(_teacher_id uuid)
RETURNS TABLE(group_id uuid, group_title text, subject_name text, grade text, stage text, price numeric, students_count integer, revenue numeric, videos_count integer, pdfs_count integer, created_at timestamptz, is_active boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL OR NOT public.is_developer_admin(v_caller) THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT cg.id, cg.title, s.name, COALESCE(s.grade,'غير محدد')::text, COALESCE(s.stage,'')::text, COALESCE(cg.price,0)::numeric,
         COUNT(DISTINCT sgp.student_id)::int, COALESCE(SUM(DISTINCT sgp.amount_paid),0)::numeric,
         COUNT(DISTINCT c.id) FILTER (WHERE lower(COALESCE(c.type,'')) IN ('video','videos','فيديو') AND COALESCE(c.is_active,true))::int,
         COUNT(DISTINCT c.id) FILTER (WHERE lower(COALESCE(c.type,'')) IN ('pdf','file','document','documents','ملف','ملفات') AND COALESCE(c.is_active,true))::int,
         cg.created_at, COALESCE(cg.is_active,true)
  FROM public.content_groups cg
  LEFT JOIN public.subjects s ON s.id=cg.subject_id
  LEFT JOIN public.student_group_purchases sgp ON sgp.group_id=cg.id
  LEFT JOIN public.content c ON c.group_id=cg.id
  WHERE COALESCE(cg.teacher_id,cg.created_by)=_teacher_id
  GROUP BY cg.id,cg.title,s.name,COALESCE(s.grade,'غير محدد'),COALESCE(s.stage,''),cg.price,cg.created_at,cg.is_active
  ORDER BY COALESCE(s.grade,'غير محدد'), cg.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_developer_teacher_wallet_monthly(_teacher_id uuid, _period text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_caller uuid := auth.uid(); v_period text := COALESCE(NULLIF(_period,''),to_char(now(),'YYYY-MM')); v_wallet jsonb; v_earned numeric:=0; v_count int:=0; v_tx jsonb:='[]'; v_wd jsonb:='[]'; v_archive jsonb;
BEGIN
  IF v_caller IS NULL OR NOT public.is_developer_admin(v_caller) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT jsonb_build_object('balance',COALESCE(balance,0),'total_earned',COALESCE(total_earned,0),'frozen_balance',COALESCE(frozen_balance,0),'current_period',current_period) INTO v_wallet FROM public.teacher_wallets WHERE teacher_id=_teacher_id;
  SELECT COALESCE(SUM(net_amount),0), COUNT(*) INTO v_earned, v_count FROM public.teacher_earning_records WHERE teacher_id=_teacher_id AND period_label=v_period;
  SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC),'[]'::jsonb) INTO v_tx FROM (SELECT id, amount, transaction_type, description, balance_after, created_at FROM public.teacher_wallet_transactions WHERE teacher_id=_teacher_id AND to_char(created_at,'YYYY-MM')=v_period ORDER BY created_at DESC LIMIT 200) t;
  SELECT COALESCE(jsonb_agg(w ORDER BY w.created_at DESC),'[]'::jsonb) INTO v_wd FROM (SELECT id, amount, payment_method, status, created_at, processed_at FROM public.teacher_withdrawal_requests WHERE teacher_id=_teacher_id AND to_char(created_at,'YYYY-MM')=v_period ORDER BY created_at DESC) w;
  SELECT to_jsonb(a) INTO v_archive FROM public.teacher_monthly_archives a WHERE a.teacher_id=_teacher_id AND a.period_label=v_period;
  RETURN jsonb_build_object('period',v_period,'wallet',COALESCE(v_wallet,'{"balance":0,"total_earned":0,"frozen_balance":0,"current_period":null}'::jsonb),'period_earned',COALESCE(v_earned,0),'earnings_count',COALESCE(v_count,0),'transactions',COALESCE(v_tx,'[]'::jsonb),'withdrawals',COALESCE(v_wd,'[]'::jsonb),'archive',v_archive);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_developer_teacher_students_by_grade(_teacher_id uuid)
RETURNS TABLE(student_id uuid, full_name text, avatar_url text, email text, phone text, stage text, grade text, section text, student_code text, groups_count integer, total_paid numeric, first_purchase timestamptz, last_activity timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL OR NOT public.is_developer_admin(v_caller) THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT p.id,p.full_name,p.avatar_url,p.email,p.phone,p.stage,p.grade,p.section,p.student_code,
         COUNT(DISTINCT sgp.group_id)::int, COALESCE(SUM(sgp.amount_paid),0)::numeric, MIN(sgp.purchased_at), MAX(sgp.purchased_at)
  FROM public.student_group_purchases sgp JOIN public.content_groups cg ON cg.id=sgp.group_id JOIN public.profiles p ON p.id=sgp.student_id
  WHERE COALESCE(cg.teacher_id,cg.created_by)=_teacher_id
  GROUP BY p.id,p.full_name,p.avatar_url,p.email,p.phone,p.stage,p.grade,p.section,p.student_code
  ORDER BY MAX(sgp.purchased_at) DESC NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_developer_teacher_subs_by_grade(_teacher_id uuid)
RETURNS TABLE(grade text, stage text, active_subs integer, monthly_revenue numeric, new_this_week integer, new_this_month integer, groups_count integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL OR NOT public.is_developer_admin(v_caller) THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT COALESCE(s.grade,'غير محدد')::text, COALESCE(s.stage,'')::text, COUNT(*)::int,
         COALESCE(SUM(CASE WHEN date_trunc('month',sgp.purchased_at)=date_trunc('month',now()) THEN sgp.amount_paid ELSE 0 END),0)::numeric,
         COUNT(*) FILTER (WHERE sgp.purchased_at > now()-interval '7 days')::int,
         COUNT(*) FILTER (WHERE sgp.purchased_at > now()-interval '30 days')::int,
         COUNT(DISTINCT cg.id)::int
  FROM public.student_group_purchases sgp JOIN public.content_groups cg ON cg.id=sgp.group_id LEFT JOIN public.subjects s ON s.id=cg.subject_id
  WHERE COALESCE(cg.teacher_id,cg.created_by)=_teacher_id
  GROUP BY COALESCE(s.grade,'غير محدد'), COALESCE(s.stage,'') ORDER BY COUNT(*) DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_developer_teacher_group_details(_teacher_id uuid, _grade text DEFAULT NULL)
RETURNS TABLE(group_id uuid, group_title text, subject_name text, grade text, price numeric, students_count integer, revenue numeric, new_today integer, new_month integer, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL OR NOT public.is_developer_admin(v_caller) THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT cg.id,cg.title,s.name,COALESCE(s.grade,'غير محدد')::text,COALESCE(cg.price,0)::numeric,COUNT(DISTINCT sgp.student_id)::int,COALESCE(SUM(sgp.amount_paid),0)::numeric,
         COUNT(sgp.id) FILTER (WHERE sgp.purchased_at::date=current_date)::int,
         COUNT(sgp.id) FILTER (WHERE sgp.purchased_at > now()-interval '30 days')::int,
         cg.created_at
  FROM public.content_groups cg LEFT JOIN public.subjects s ON s.id=cg.subject_id LEFT JOIN public.student_group_purchases sgp ON sgp.group_id=cg.id
  WHERE COALESCE(cg.teacher_id,cg.created_by)=_teacher_id AND (_grade IS NULL OR COALESCE(s.grade,'غير محدد')=_grade)
  GROUP BY cg.id,cg.title,s.name,COALESCE(s.grade,'غير محدد'),cg.price,cg.created_at
  ORDER BY COALESCE(SUM(sgp.amount_paid),0) DESC, cg.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.is_developer_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_developer_teacher_profile(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_developer_teacher_overview(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_developer_teacher_logs(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_developer_teacher_courses(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_developer_teacher_wallet_monthly(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_developer_teacher_students_by_grade(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_developer_teacher_subs_by_grade(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_developer_teacher_group_details(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_developer_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_profile(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_overview(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_logs(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_courses(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_wallet_monthly(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_students_by_grade(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_subs_by_grade(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_group_details(uuid, text) TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_activity_logs TO authenticated;
NOTIFY pgrst, 'reload schema';
