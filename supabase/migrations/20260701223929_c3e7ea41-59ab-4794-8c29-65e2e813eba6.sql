INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM public.profiles WHERE lower(email)='alyedaft@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

UPDATE public.profiles SET role='admin' WHERE lower(email)='alyedaft@gmail.com';