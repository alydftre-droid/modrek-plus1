DO $$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','678d6610-d472-49a3-b234-f53b1cd2d2fd',true);
  PERFORM set_config('request.jwt.claims','{"sub":"678d6610-d472-49a3-b234-f53b1cd2d2fd","role":"authenticated"}',true);
  r := public.create_modrek_ai_exam('{"title":"DIAG_TEST","subject_id":"9ed0e44b-e126-4d3b-95ab-e5594385b04d","duration_minutes":30,"total_marks":2,"pass_marks":1,"difficulty":"medium","questions":[{"type":"mcq","question":"q1","marks":1,"correct_answer":"a","options":["a","b","c","d"]},{"type":"true_false","question":"q2","marks":1,"correct_answer":"صح"}]}'::jsonb);
  RAISE NOTICE 'RESULT: %', r;
  -- cleanup
  DELETE FROM public.exams WHERE title='DIAG_TEST';
END $$;