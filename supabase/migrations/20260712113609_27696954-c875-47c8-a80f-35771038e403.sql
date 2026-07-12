COMMENT ON TABLE public.modrek_ai_conversations IS 'Modrek AI conversations (per student, per assistant type)';
COMMENT ON TABLE public.modrek_ai_messages IS 'Messages inside a Modrek AI conversation';
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';