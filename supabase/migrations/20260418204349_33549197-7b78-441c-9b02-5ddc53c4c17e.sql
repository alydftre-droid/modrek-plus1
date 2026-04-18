-- Fix existing teacher_assignments that have NULL education_type
-- by syncing from teacher_requests
UPDATE public.teacher_assignments ta
SET education_type = tr.education_type
FROM public.teacher_requests tr
WHERE ta.teacher_id = tr.user_id
  AND ta.education_type IS NULL
  AND tr.education_type IS NOT NULL
  AND tr.status = 'approved';
