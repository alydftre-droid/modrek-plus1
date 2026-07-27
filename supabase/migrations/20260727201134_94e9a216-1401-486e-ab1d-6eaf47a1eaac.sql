DO $$
BEGIN
  IF to_regclass('public.ai_function_settings') IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.ai_function_settings
     SET models_to_try = ARRAY['google/gemini-2.5-flash', 'google/gemini-2.5-flash-lite']
   WHERE function_name <> 'modrek-ai-exams'
     AND function_name NOT ILIKE '%tts%'
     AND (
       models_to_try IS NULL
       OR array_length(models_to_try, 1) IS NULL
       OR EXISTS (
         SELECT 1 FROM unnest(models_to_try) m
         WHERE m ILIKE '%gemini-2.5-pro%'
       )
     );

  UPDATE public.ai_function_settings
     SET models_to_try = ARRAY['google/gemini-2.5-pro', 'google/gemini-2.5-flash']
   WHERE function_name = 'modrek-ai-exams';

  INSERT INTO public.ai_function_settings (function_name, models_to_try, max_retries, fallback_delay_ms, enable_streaming)
  SELECT 'modrek-ai-exams', ARRAY['google/gemini-2.5-pro', 'google/gemini-2.5-flash'], 3, 0, false
  WHERE NOT EXISTS (SELECT 1 FROM public.ai_function_settings WHERE function_name = 'modrek-ai-exams');
END $$;