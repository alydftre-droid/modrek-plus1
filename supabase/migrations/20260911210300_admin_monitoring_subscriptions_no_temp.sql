CREATE OR REPLACE FUNCTION public.admin_monitoring_subscriptions(
  _filter text DEFAULT 'all', _search text DEFAULT NULL, _limit integer DEFAULT 25, _offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(_limit,25),1),100);
  v_off integer := GREATEST(COALESCE(_offset,0),0);
  v_total bigint := 0;
  v_rows jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.assert_admin_caller();

  WITH base AS (
    SELECT s.id, s.student_id, p.full_name AS student_name, p.student_code,
      s.teacher_id, tp.full_name AS teacher_name,
      sub.name AS subject_name, s.start_date, s.end_date, s.is_active, s.created_at,
      (SELECT g.title FROM public.student_group_purchases sp
         JOIN public.content_groups g ON g.id = sp.group_id
        WHERE sp.student_id = s.student_id AND g.subject_id = s.subject_id
        ORDER BY sp.purchased_at DESC LIMIT 1) AS group_title,
      (SELECT sp.amount_paid FROM public.student_group_purchases sp
         JOIN public.content_groups g ON g.id = sp.group_id
        WHERE sp.student_id = s.student_id AND g.subject_id = s.subject_id
        ORDER BY sp.purchased_at DESC LIMIT 1) AS amount_paid,
      CASE
        WHEN s.is_active IS NOT TRUE THEN 'cancelled'
        WHEN s.end_date IS NOT NULL AND s.end_date < now() THEN 'expired'
        WHEN s.end_date IS NOT NULL AND s.end_date <= now() + interval '5 days' THEN 'expiring'
        WHEN s.created_at >= now() - interval '2 days' THEN 'new'
        ELSE 'active'
      END AS status
    FROM public.subscriptions s
    JOIN public.profiles p ON p.id = s.student_id
    LEFT JOIN public.profiles tp ON tp.id = s.teacher_id
    LEFT JOIN public.subjects sub ON sub.id = s.subject_id
    WHERE COALESCE(p.is_test_account,false) = false
  ), filtered AS (
    SELECT * FROM base
    WHERE (COALESCE(_filter,'all') = 'all'
        OR (_filter = 'active' AND status IN ('active','new','expiring'))
        OR status = _filter)
      AND (_search IS NULL OR _search = '' OR student_name ILIKE '%'||_search||'%'
           OR COALESCE(student_code,'') ILIKE '%'||_search||'%' OR student_id::text ILIKE '%'||_search||'%')
  ), counted AS (
    SELECT count(*) AS c FROM filtered
  ), page AS (
    SELECT to_jsonb(f) AS x FROM filtered f ORDER BY f.created_at DESC LIMIT v_limit OFFSET v_off
  )
  SELECT (SELECT c FROM counted), COALESCE((SELECT jsonb_agg(x) FROM page), '[]'::jsonb)
  INTO v_total, v_rows;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_monitoring_subscriptions(text, text, integer, integer) TO authenticated, service_role, postgres;