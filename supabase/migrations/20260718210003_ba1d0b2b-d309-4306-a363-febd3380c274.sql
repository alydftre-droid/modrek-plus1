WITH g AS (
  SELECT cg.id AS group_id, cg.subject_id, COALESCE(cg.teacher_id, cg.created_by) AS teacher_id,
         (SELECT ss.id FROM public.sub_subjects ss WHERE ss.group_id = cg.id ORDER BY COALESCE(ss.is_active,true) DESC, ss.order_index NULLS LAST, ss.created_at LIMIT 1) AS sub_subject_id,
         (SELECT ss.name FROM public.sub_subjects ss WHERE ss.group_id = cg.id ORDER BY COALESCE(ss.is_active,true) DESC, ss.order_index NULLS LAST, ss.created_at LIMIT 1) AS sub_subject_name
  FROM public.content_groups cg
  WHERE cg.id = 'bb589417-8e6d-4254-9192-50e896894724'::uuid
)
INSERT INTO public.content (id,title,type,file_url,subject_id,uploaded_by,group_id,sub_subject_id,sub_subject,term,education_type,is_active)
SELECT '3f218cc8-6afa-49ad-a260-38790440b2ba'::uuid, 'اختبار تحقق نهائي للإشعارات - يحذف تلقائياً', 'video', 'test://notification-final-confirm', subject_id, teacher_id, group_id, sub_subject_id, sub_subject_name, 'term1', NULL, true FROM g
ON CONFLICT (id) DO NOTHING;