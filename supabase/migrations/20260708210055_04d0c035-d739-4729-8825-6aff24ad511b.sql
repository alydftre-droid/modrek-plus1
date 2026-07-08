UPDATE public.ai_function_settings
SET models_to_try = ARRAY['gemini-2.5-flash','gemini-2.5-flash-lite']::text[],
    max_retries = 3,
    fallback_delay_ms = 0,
    enable_streaming = true
WHERE function_name IN ('ai-chat','support-assistant','teacher-assistant');

UPDATE public.ai_function_settings
SET models_to_try = ARRAY['gemini-2.5-flash','gemini-2.5-flash-lite']::text[],
    max_retries = 3,
    fallback_delay_ms = 0,
    enable_streaming = false
WHERE function_name IN ('generate-exam','grade-essay');