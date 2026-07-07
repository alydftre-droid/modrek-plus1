REVOKE ALL ON FUNCTION public.register_device_push_token(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_device_push_token(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.register_device_push_token(text, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.register_device_push_token(text, text) TO authenticated;