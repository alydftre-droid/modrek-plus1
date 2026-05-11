CREATE TABLE public.ai_function_settings (
  function_name text PRIMARY KEY,
  models_to_try text[] NOT NULL DEFAULT ARRAY['gemini-2.5-flash','gemini-flash-latest','gemini-2.5-flash-lite']::text[],
  max_retries int NOT NULL DEFAULT 3,
  fallback_delay_ms int NOT NULL DEFAULT 0,
  enable_streaming boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.ai_function_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read ai settings"
  ON public.ai_function_settings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can insert ai settings"
  ON public.ai_function_settings FOR INSERT
  TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update ai settings"
  ON public.ai_function_settings FOR UPDATE
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete ai settings"
  ON public.ai_function_settings FOR DELETE
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_ai_function_settings_updated_at
  BEFORE UPDATE ON public.ai_function_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.ai_function_settings (function_name, models_to_try, max_retries, fallback_delay_ms, enable_streaming) VALUES
  ('ai-chat', ARRAY['gemini-2.5-pro','gemini-2.5-flash','gemini-flash-latest','gemini-2.5-flash-lite']::text[], 3, 0, true),
  ('support-assistant', ARRAY['gemini-2.5-flash','gemini-flash-latest','gemini-2.5-flash-lite']::text[], 3, 0, true),
  ('teacher-assistant', ARRAY['gemini-2.5-flash','gemini-flash-latest','gemini-2.5-flash-lite']::text[], 3, 0, true),
  ('generate-exam', ARRAY['gemini-2.5-pro','gemini-2.5-flash','gemini-flash-latest']::text[], 3, 0, false),
  ('grade-essay', ARRAY['gemini-2.5-pro','gemini-2.5-flash','gemini-flash-latest']::text[], 3, 0, false)
ON CONFLICT (function_name) DO NOTHING;