-- Hide primary (ابتدائي) stage — platform serves prep + secondary only
UPDATE public.library_stages SET is_active = false WHERE code = 'primary' OR name_ar LIKE '%ابتدائي%';
UPDATE public.library_grades SET is_active = false WHERE code LIKE 'p%' AND code NOT LIKE 'pr%';
UPDATE public.library_subjects SET is_active = false
  WHERE stage_id IN (SELECT id FROM public.library_stages WHERE is_active = false);