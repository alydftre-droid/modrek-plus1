-- 1) Defense-in-depth trigger: block teacher deletion (hard or soft) after 24h
CREATE OR REPLACE FUNCTION public.enforce_teacher_content_delete_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_soft_delete boolean := false;
BEGIN
  -- System / service_role operations and anonymous internal jobs are untouched
  IF v_uid IS NULL OR OLD.uploaded_by IS DISTINCT FROM v_uid THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- Developers/admins can always delete
  IF public.has_role(v_uid, 'admin') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- Student personal library is out of scope
  IF COALESCE(OLD.type, '') = 'student_library' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_is_soft_delete := COALESCE(OLD.is_active, true) = true AND COALESCE(NEW.is_active, true) = false;
    IF NOT v_is_soft_delete THEN
      RETURN NEW;
    END IF;
  END IF;

  IF COALESCE(OLD.created_at, now()) < (now() - interval '24 hours') THEN
    RAISE EXCEPTION 'DELETE_WINDOW_EXPIRED: لا يمكن حذف هذا المحتوى بعد مرور 24 ساعة من وقت الرفع. تواصل مع الإدارة.'
      USING ERRCODE = '42501';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_content_delete_window_delete ON public.content;
CREATE TRIGGER trg_content_delete_window_delete
BEFORE DELETE ON public.content
FOR EACH ROW EXECUTE FUNCTION public.enforce_teacher_content_delete_window();

DROP TRIGGER IF EXISTS trg_content_delete_window_update ON public.content;
CREATE TRIGGER trg_content_delete_window_update
BEFORE UPDATE ON public.content
FOR EACH ROW EXECUTE FUNCTION public.enforce_teacher_content_delete_window();

-- 2) Unified deletion RPC used by the UI (teacher + developer)
CREATE OR REPLACE FUNCTION public.delete_group_content(_content_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_row public.content;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.content WHERE id = _content_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_is_admin := public.has_role(v_uid, 'admin');

  IF NOT v_is_admin THEN
    IF v_row.uploaded_by IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'NOT_OWNER: لا تملك صلاحية حذف هذا المحتوى.' USING ERRCODE = '42501';
    END IF;
    IF COALESCE(v_row.created_at, now()) < (now() - interval '24 hours') THEN
      RAISE EXCEPTION 'DELETE_WINDOW_EXPIRED: لا يمكن حذف هذا المحتوى بعد مرور 24 ساعة من وقت الرفع.' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.content
     SET is_active = false,
         updated_at = now()
   WHERE id = _content_id;

  RETURN jsonb_build_object('id', _content_id, 'deleted', true, 'by_admin', v_is_admin);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_group_content(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_group_content(uuid) TO authenticated;