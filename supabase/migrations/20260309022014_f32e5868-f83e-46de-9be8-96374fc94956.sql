-- Create sub_subjects table to store customizable sub-subjects per teacher/group
CREATE TABLE public.sub_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.content_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'BookOpen',
  order_index INTEGER DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  UNIQUE(group_id, name)
);

-- Enable RLS
ALTER TABLE public.sub_subjects ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view active sub_subjects"
ON public.sub_subjects FOR SELECT
USING (is_active = true);

CREATE POLICY "Teachers can manage own sub_subjects"
ON public.sub_subjects FOR ALL
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Admins can manage all sub_subjects"
ON public.sub_subjects FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Add sub_subject_id to content table to reference the new sub_subjects table
ALTER TABLE public.content ADD COLUMN IF NOT EXISTS sub_subject_id UUID REFERENCES public.sub_subjects(id) ON DELETE SET NULL;