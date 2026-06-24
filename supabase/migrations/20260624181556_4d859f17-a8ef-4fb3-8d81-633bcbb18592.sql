
ALTER VIEW public.public_teacher_profiles SET (security_invoker = true);
ALTER VIEW public.approved_teacher_assignments SET (security_invoker = true);

DROP POLICY IF EXISTS "Public can view ai lesson pages images" ON storage.objects;
CREATE POLICY "Authenticated can view ai lesson pages images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ai-lesson-pages' AND auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION public.has_content_storage_access(_bucket text, _name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _first text;
  _second text;
  _group uuid;
  _lesson uuid;
  _subject uuid;
  _lesson_group uuid;
BEGIN
  IF _uid IS NULL THEN
    RETURN false;
  END IF;
  IF public.has_role(_uid, 'admin'::app_role) THEN
    RETURN true;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.content c
    WHERE c.uploaded_by = _uid
      AND (
        c.file_url LIKE '%' || _name || '%'
        OR COALESCE(c.thumbnail_url, '') LIKE '%' || _name || '%'
      )
  ) THEN
    RETURN true;
  END IF;

  _first := split_part(_name, '/', 1);
  _second := split_part(_name, '/', 2);

  IF _first = 'ai-lessons' THEN
    BEGIN
      _lesson := _second::uuid;
    EXCEPTION WHEN others THEN
      BEGIN
        _subject := _second::uuid;
      EXCEPTION WHEN others THEN
        RETURN false;
      END;
    END;

    IF _lesson IS NOT NULL THEN
      SELECT subject_id, group_id INTO _subject, _lesson_group
      FROM public.ai_lessons WHERE id = _lesson;
      IF EXISTS (SELECT 1 FROM public.ai_lessons WHERE id = _lesson AND created_by = _uid) THEN
        RETURN true;
      END IF;
    END IF;

    IF _subject IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.student_id = _uid
        AND s.subject_id = _subject
        AND s.is_active = true
        AND s.end_date > now()
    ) THEN
      RETURN true;
    END IF;

    IF _lesson_group IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.student_group_purchases sgp
      WHERE sgp.student_id = _uid AND sgp.group_id = _lesson_group
    ) THEN
      RETURN true;
    END IF;

    IF _lesson_group IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.bundled_package_subscription_groups bpsg
      JOIN public.bundled_package_subscriptions bps ON bps.id = bpsg.subscription_id
      WHERE bps.student_id = _uid AND bpsg.group_id = _lesson_group
    ) THEN
      RETURN true;
    END IF;

    RETURN false;
  END IF;

  BEGIN
    _group := _first::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  RETURN EXISTS (
    SELECT 1
    FROM public.content c
    WHERE c.group_id = _group
      AND (
        COALESCE(c.is_paid, false) = false
        OR EXISTS (
          SELECT 1 FROM public.student_group_purchases sgp
          WHERE sgp.student_id = _uid AND sgp.group_id = _group
        )
        OR (
          c.subject_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.subscriptions s
            WHERE s.student_id = _uid
              AND s.subject_id = c.subject_id
              AND s.is_active = true
              AND s.end_date > now()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.bundled_package_subscription_groups bpsg
          JOIN public.bundled_package_subscriptions bps ON bps.id = bpsg.subscription_id
          WHERE bps.student_id = _uid AND bpsg.group_id = _group
        )
      )
  );
END;
$function$;
