GRANT SELECT, INSERT, UPDATE, DELETE ON public.modrek_ai_conversations TO authenticated;
GRANT ALL ON public.modrek_ai_conversations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.modrek_ai_messages TO authenticated;
GRANT ALL ON public.modrek_ai_messages TO service_role;
NOTIFY pgrst, 'reload schema';