
-- Developer Overview Snapshots: separate history for the whole Withdrawal Settings overview page.
CREATE TABLE IF NOT EXISTS public.admin_overview_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_label text NOT NULL,
  snapshot jsonb NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_overview_snapshots TO authenticated;
GRANT ALL ON public.admin_overview_snapshots TO service_role;

ALTER TABLE public.admin_overview_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage overview snapshots"
  ON public.admin_overview_snapshots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_admin_overview_snapshots_created_at
  ON public.admin_overview_snapshots (created_at DESC);

-- Capture snapshot: takes the full admin_financial_overview and stores it as an immutable record.
CREATE OR REPLACE FUNCTION public.admin_capture_overview_snapshot(_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_overview jsonb;
  v_period text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  v_overview := public.admin_financial_overview();
  v_period := COALESCE(v_overview->>'period', to_char((now() AT TIME ZONE 'Africa/Cairo'), 'YYYY-MM'));

  INSERT INTO public.admin_overview_snapshots (period_label, snapshot, notes, created_by)
  VALUES (v_period, v_overview, _notes, v_uid)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'period', v_period);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_capture_overview_snapshot(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_capture_overview_snapshot(text) TO authenticated;

-- List all snapshots (compact metadata only).
CREATE OR REPLACE FUNCTION public.admin_list_overview_snapshots()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'period_label', s.period_label,
    'notes', s.notes,
    'created_at', s.created_at,
    'total_available', (s.snapshot->>'total_available')::numeric,
    'total_frozen',    (s.snapshot->>'total_frozen')::numeric,
    'month_gross',     (s.snapshot->>'month_gross')::numeric,
    'month_teacher_net', (s.snapshot->>'month_teacher_net')::numeric,
    'month_platform_cut', (s.snapshot->>'month_platform_cut')::numeric,
    'month_subscriptions', (s.snapshot->>'month_subscriptions')::int,
    'active_groups', (s.snapshot->>'active_groups')::int,
    'total_teachers', (s.snapshot->>'total_teachers')::int
  ) ORDER BY s.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM public.admin_overview_snapshots s;

  RETURN jsonb_build_object('success', true, 'rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_overview_snapshots() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_overview_snapshots() TO authenticated;

-- Fetch a single snapshot's full details.
CREATE OR REPLACE FUNCTION public.admin_get_overview_snapshot(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.admin_overview_snapshots%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_row FROM public.admin_overview_snapshots WHERE id = _id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_row.id,
    'period_label', v_row.period_label,
    'notes', v_row.notes,
    'created_at', v_row.created_at,
    'snapshot', v_row.snapshot
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_overview_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_overview_snapshot(uuid) TO authenticated;

-- Delete a snapshot (developer can prune).
CREATE OR REPLACE FUNCTION public.admin_delete_overview_snapshot(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;
  DELETE FROM public.admin_overview_snapshots WHERE id = _id;
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_overview_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_overview_snapshot(uuid) TO authenticated;
