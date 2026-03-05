
-- Add new metadata columns to content_groups
ALTER TABLE public.content_groups 
  ADD COLUMN IF NOT EXISTS start_date date DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS end_date date DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lesson_count integer DEFAULT 0;

-- Add RLS policy for admins to manage all groups  
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can manage all groups' AND tablename = 'content_groups') THEN
    CREATE POLICY "Admins can manage all groups" ON public.content_groups FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;
