CREATE TABLE IF NOT EXISTS public.ai_gateway_providers (
  provider TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key_env TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT, INSERT, UPDATE ON public.ai_gateway_providers TO authenticated;
GRANT ALL ON public.ai_gateway_providers TO service_role;

ALTER TABLE public.ai_gateway_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can read ai gateways" ON public.ai_gateway_providers;
CREATE POLICY "Anyone authenticated can read ai gateways"
  ON public.ai_gateway_providers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can insert ai gateways" ON public.ai_gateway_providers;
CREATE POLICY "Admins can insert ai gateways"
  ON public.ai_gateway_providers FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update ai gateways" ON public.ai_gateway_providers;
CREATE POLICY "Admins can update ai gateways"
  ON public.ai_gateway_providers FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.enforce_single_active_ai_gateway()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active THEN
    UPDATE public.ai_gateway_providers SET is_active = false, updated_at = now()
    WHERE provider <> NEW.provider AND is_active;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_active_ai_gateway ON public.ai_gateway_providers;
CREATE TRIGGER trg_single_active_ai_gateway
  BEFORE INSERT OR UPDATE ON public.ai_gateway_providers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_active_ai_gateway();

INSERT INTO public.ai_gateway_providers (provider, label, base_url, api_key_env, is_active)
VALUES
  ('openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1', 'OPENROUTER_API_KEY', true),
  ('agentrouter', 'AgentRouter', 'https://agentrouter.org/v1', 'AGENTROUTER_API_KEY', false)
ON CONFLICT (provider) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ai_provider_function_settings (
  provider TEXT NOT NULL REFERENCES public.ai_gateway_providers(provider) ON DELETE CASCADE,
  function_name TEXT NOT NULL,
  models_to_try TEXT[] NOT NULL DEFAULT '{}',
  max_retries INTEGER NOT NULL DEFAULT 3,
  fallback_delay_ms INTEGER NOT NULL DEFAULT 0,
  enable_streaming BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  PRIMARY KEY (provider, function_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_provider_function_settings TO authenticated;
GRANT ALL ON public.ai_provider_function_settings TO service_role;

ALTER TABLE public.ai_provider_function_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can read provider fn settings" ON public.ai_provider_function_settings;
CREATE POLICY "Anyone authenticated can read provider fn settings"
  ON public.ai_provider_function_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can write provider fn settings" ON public.ai_provider_function_settings;
CREATE POLICY "Admins can write provider fn settings"
  ON public.ai_provider_function_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.ai_provider_function_settings (provider, function_name, models_to_try, max_retries, fallback_delay_ms, enable_streaming)
SELECT 'agentrouter', s.function_name, s.models_to_try, s.max_retries, s.fallback_delay_ms, s.enable_streaming
FROM public.ai_function_settings s
ON CONFLICT (provider, function_name) DO NOTHING;

INSERT INTO public.ai_provider_function_settings (provider, function_name, models_to_try, max_retries, fallback_delay_ms, enable_streaming)
VALUES
  ('agentrouter', 'library-explain-tts', ARRAY['google/gemini-3.1-flash-tts-preview'], 2, 0, false),
  ('agentrouter', 'vision', ARRAY['google/gemini-2.5-flash'], 3, 0, false),
  ('agentrouter', 'ocr', ARRAY['google/gemini-2.5-flash'], 3, 0, false),
  ('agentrouter', 'embeddings', ARRAY['openai/text-embedding-3-small'], 2, 0, false),
  ('agentrouter', 'stt', ARRAY['openai/gpt-4o-mini-transcribe'], 2, 0, false)
ON CONFLICT (provider, function_name) DO NOTHING;