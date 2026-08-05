-- 1) Normalized schedule table (JSON stays the write surface; this is the query/report surface)
CREATE TABLE IF NOT EXISTS public.group_weekly_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.content_groups(id) ON DELETE CASCADE,
  day_of_week text NOT NULL,
  "time" text NOT NULL,
  timezone text NOT NULL DEFAULT 'Africa/Cairo',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_weekly_schedule TO authenticated;
GRANT SELECT ON public.group_weekly_schedule TO anon;
GRANT ALL ON public.group_weekly_schedule TO service_role;

ALTER TABLE public.group_weekly_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Schedules visible with their group"
ON public.group_weekly_schedule FOR SELECT
USING (EXISTS (SELECT 1 FROM public.content_groups g WHERE g.id = group_id));

CREATE POLICY "Admins manage all schedules"
ON public.group_weekly_schedule FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers manage own group schedules"
ON public.group_weekly_schedule FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.content_groups g WHERE g.id = group_id AND (g.teacher_id = auth.uid() OR g.created_by = auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.content_groups g WHERE g.id = group_id AND (g.teacher_id = auth.uid() OR g.created_by = auth.uid())));

CREATE UNIQUE INDEX IF NOT EXISTS group_weekly_schedule_unique_slot
  ON public.group_weekly_schedule (group_id, day_of_week, "time");
CREATE INDEX IF NOT EXISTS group_weekly_schedule_lookup
  ON public.group_weekly_schedule (day_of_week, "time") WHERE is_active;

-- 2) Reminder idempotency log (one notification batch per slot occurrence)
CREATE TABLE IF NOT EXISTS public.group_lesson_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.group_weekly_schedule(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.content_groups(id) ON DELETE CASCADE,
  occurrence_at timestamptz NOT NULL,
  recipients integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.group_lesson_reminder_log TO service_role;
ALTER TABLE public.group_lesson_reminder_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read reminder log"
ON public.group_lesson_reminder_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE UNIQUE INDEX IF NOT EXISTS group_lesson_reminder_once
  ON public.group_lesson_reminder_log (schedule_id, occurrence_at);

-- 3) Validation of the JSON schedule: no duplicates, no overlapping (<30 min) slots per day
CREATE OR REPLACE FUNCTION public.validate_group_weekly_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  slots jsonb := COALESCE(NEW.weekly_schedule, '[]'::jsonb);
  dup_count int;
  clash_count int;
BEGIN
  IF jsonb_typeof(slots) <> 'array' THEN
    RAISE EXCEPTION 'جدول الحصص يجب أن يكون قائمة مواعيد';
  END IF;

  SELECT count(*) INTO dup_count FROM (
    SELECT (s->>'day') AS d, (s->>'time') AS t
    FROM jsonb_array_elements(slots) s
    GROUP BY 1, 2 HAVING count(*) > 1
  ) x;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'لا يمكن تكرار نفس اليوم ونفس الوقت داخل نفس المجموعة';
  END IF;

  SELECT count(*) INTO clash_count
  FROM (
    SELECT (s->>'day') AS d,
           (split_part(s->>'time', ':', 1))::int * 60 + (split_part(s->>'time', ':', 2))::int AS m
    FROM jsonb_array_elements(slots) s
  ) a
  JOIN (
    SELECT (s->>'day') AS d,
           (split_part(s->>'time', ':', 1))::int * 60 + (split_part(s->>'time', ':', 2))::int AS m
    FROM jsonb_array_elements(slots) s
  ) b ON a.d = b.d AND a.m < b.m AND (b.m - a.m) < 30;
  IF clash_count > 0 THEN
    RAISE EXCEPTION 'يوجد تعارض بين مواعيد نفس اليوم (يجب 30 دقيقة على الأقل بين الحصص)';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_group_weekly_schedule ON public.content_groups;
CREATE TRIGGER trg_validate_group_weekly_schedule
BEFORE INSERT OR UPDATE OF weekly_schedule ON public.content_groups
FOR EACH ROW EXECUTE FUNCTION public.validate_group_weekly_schedule();

-- 4) Mirror JSON -> normalized table (edits deactivate/replace old slots => stale reminders stop)
CREATE OR REPLACE FUNCTION public.sync_group_weekly_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  slots jsonb := COALESCE(NEW.weekly_schedule, '[]'::jsonb);
  active boolean := COALESCE(NEW.is_active, true);
BEGIN
  INSERT INTO public.group_weekly_schedule (group_id, day_of_week, "time", timezone, is_active)
  SELECT NEW.id, s->>'day', s->>'time', COALESCE(s->>'timezone', 'Africa/Cairo'), active
  FROM jsonb_array_elements(slots) s
  WHERE s->>'day' IS NOT NULL AND s->>'time' IS NOT NULL
  ON CONFLICT (group_id, day_of_week, "time")
  DO UPDATE SET is_active = active, updated_at = now();

  -- deactivate slots that are no longer part of the schedule (or the whole group is off)
  UPDATE public.group_weekly_schedule gws
  SET is_active = false, updated_at = now()
  WHERE gws.group_id = NEW.id
    AND gws.is_active
    AND (
      NOT active
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(slots) s
        WHERE s->>'day' = gws.day_of_week AND s->>'time' = gws."time"
      )
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_group_weekly_schedule ON public.content_groups;
CREATE TRIGGER trg_sync_group_weekly_schedule
AFTER INSERT OR UPDATE OF weekly_schedule, is_active ON public.content_groups
FOR EACH ROW EXECUTE FUNCTION public.sync_group_weekly_schedule();

-- 5) Backfill existing JSON schedules
INSERT INTO public.group_weekly_schedule (group_id, day_of_week, "time", timezone, is_active)
SELECT g.id, s->>'day', s->>'time', 'Africa/Cairo', g.is_active
FROM public.content_groups g
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(g.weekly_schedule, '[]'::jsonb)) s
WHERE s->>'day' IS NOT NULL AND s->>'time' IS NOT NULL
ON CONFLICT (group_id, day_of_week, "time") DO NOTHING;