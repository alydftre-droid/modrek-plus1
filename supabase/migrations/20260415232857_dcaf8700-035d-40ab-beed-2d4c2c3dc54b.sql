-- 1. Create teacher-profiles storage bucket with proper RLS
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'teacher-profiles', 
  'teacher-profiles', 
  true,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO NOTHING;

-- Teachers can upload their own profile files
CREATE POLICY "Teachers can upload own profile files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'teacher-profiles'
  AND auth.role() = 'authenticated'
  AND has_role(auth.uid(), 'teacher'::app_role)
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Teachers can update their own profile files
CREATE POLICY "Teachers can update own profile files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'teacher-profiles'
  AND has_role(auth.uid(), 'teacher'::app_role)
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Teachers can delete their own profile files
CREATE POLICY "Teachers can delete own profile files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'teacher-profiles'
  AND has_role(auth.uid(), 'teacher'::app_role)
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Admins can manage all teacher profile files
CREATE POLICY "Admins can manage teacher profiles"
ON storage.objects FOR ALL
USING (
  bucket_id = 'teacher-profiles'
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- 2. Harden handle_new_user to restrict roles to student/teacher only
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_role public.app_role;
  student_code_val TEXT;
BEGIN
  user_role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'student');
  
  -- SECURITY: Only allow student or teacher roles from signup metadata
  -- Admin and support roles must be assigned manually by an admin
  IF user_role NOT IN ('student', 'teacher') THEN
    user_role := 'student';
  END IF;
  
  IF user_role = 'student' THEN
     student_code_val := floor(random() * 100000)::text;
  ELSE
     student_code_val := NULL;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, phone, student_code, stage, grade, section)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    student_code_val,
    NEW.raw_user_meta_data->>'stage',
    NEW.raw_user_meta_data->>'grade',
    NEW.raw_user_meta_data->>'section'
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- 3. Fix notifications policies to require authentication
DROP POLICY IF EXISTS "Users can view their notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their notifications" ON public.notifications;

CREATE POLICY "Users can view their notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING ((auth.uid() = user_id) OR (user_id IS NULL));

CREATE POLICY "Users can update their notifications"
ON public.notifications
FOR UPDATE
TO authenticated
USING ((auth.uid() = user_id) OR (user_id IS NULL));