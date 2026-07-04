-- Deactivate any auto-seeded sub_subject whose name equals its parent subject name
-- (e.g. a "الرياضيات" sub-subject inside the "الرياضيات" subject group).
UPDATE public.sub_subjects ss
SET is_active = false
FROM public.content_groups cg
JOIN public.subjects s ON s.id = cg.subject_id
WHERE ss.group_id = cg.id
  AND ss.is_active = true
  AND regexp_replace(trim(ss.name), '\s+', ' ', 'g') = regexp_replace(trim(s.name), '\s+', ' ', 'g');