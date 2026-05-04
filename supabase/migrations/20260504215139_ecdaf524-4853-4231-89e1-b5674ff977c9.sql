
-- Add metadata for ticket lifecycle
ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS is_teacher_request boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_resolved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_support_messages_user_created
  ON public.support_messages (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_messages_teacher
  ON public.support_messages (is_teacher_request, created_at DESC);

-- Internal notes table (admin-only)
CREATE TABLE IF NOT EXISTS public.support_internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_user_id uuid NOT NULL,
  admin_id uuid NOT NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_internal_notes_user
  ON public.support_internal_notes (conversation_user_id, created_at DESC);

ALTER TABLE public.support_internal_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage internal notes" ON public.support_internal_notes;
CREATE POLICY "Admins manage internal notes"
  ON public.support_internal_notes
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Resolution toggle helper (admin-only)
CREATE OR REPLACE FUNCTION public.set_support_resolution(_user_id uuid, _resolved boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  UPDATE public.support_messages
  SET is_resolved = _resolved,
      resolved_at = CASE WHEN _resolved THEN now() ELSE NULL END
  WHERE user_id = _user_id;

  RETURN jsonb_build_object('success', true, 'resolved', _resolved);
END;
$$;

-- Allow students/teachers to mark replies as read (already covered by admin update)
DROP POLICY IF EXISTS "Users can mark own replies read" ON public.support_messages;
CREATE POLICY "Users can mark own replies read"
  ON public.support_messages
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
