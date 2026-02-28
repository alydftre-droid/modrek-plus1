-- ======================================================
-- 0) تأكد إن extension UUID شغال
-- ======================================================
CREATE EXTENSION if NOT EXISTS "pgcrypto";

-- ======================================================
-- 1) تعديل جدول profiles (role)
-- ======================================================
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS role text CHECK (role IN ('student', 'teacher', 'admin')) DEFAULT 'student';

-- ======================================================
-- 2) جدول طلبات تسجيل المعلمين
-- ======================================================
CREATE TABLE IF NOT EXISTS teacher_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  school text NOT NULL,
  employee_id text NOT NULL,
  phone text NOT NULL,
  stage text NOT NULL CHECK (stage IN ('preparatory', 'secondary')),
  subject text NOT NULL,
  grades TEXT[] NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason text,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE (user_id)
);

-- ======================================================
-- 3) جدول تخصيص المعلم (لوحة المعلم)
-- ======================================================
CREATE TABLE IF NOT EXISTS teacher_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  subject text NOT NULL,
  stage text NOT NULL CHECK (stage IN ('preparatory', 'secondary')),
  grades TEXT[] NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE (teacher_id)
);

-- ======================================================
-- 4) Indexes
-- ======================================================
CREATE INDEX if NOT EXISTS idx_teacher_requests_user_id ON teacher_requests (user_id);

CREATE INDEX if NOT EXISTS idx_teacher_assignments_teacher_id ON teacher_assignments (teacher_id);

-- ======================================================
-- 5) Enable RLS
-- ======================================================
ALTER TABLE teacher_requests enable ROW level security;

ALTER TABLE teacher_assignments enable ROW level security;

-- ======================================================
-- 6) Policies for teacher_requests
-- ======================================================
-- المعلم يشوف طلبه
CREATE POLICY "teacher view own request" ON teacher_requests FOR
SELECT
  USING (auth.uid () = user_id);

-- المعلم يضيف طلب
CREATE POLICY "teacher insert request" ON teacher_requests FOR insert
WITH
  CHECK (auth.uid () = user_id);

-- الأدمن يدير الطلبات
CREATE POLICY "admin manage teacher_requests" ON teacher_requests FOR ALL USING (
  EXISTS (
    SELECT
      1
    FROM
      profiles
    WHERE
      profiles.id = auth.uid ()
      AND profiles.role = 'admin'
  )
);

-- ======================================================
-- 7) Policies for teacher_assignments
-- ======================================================
-- المعلم يشوف تخصيصه
CREATE POLICY "teacher view own assignment" ON teacher_assignments FOR
SELECT
  USING (auth.uid () = teacher_id);

-- الأدمن يدير التخصيص
CREATE POLICY "admin manage teacher_assignments" ON teacher_assignments FOR ALL USING (
  EXISTS (
    SELECT
      1
    FROM
      profiles
    WHERE
      profiles.id = auth.uid ()
      AND profiles.role = 'admin'
  )
);

-- حذف السياسات لو موجودة
DROP POLICY if EXISTS "teacher view own request" ON teacher_requests;

DROP POLICY if EXISTS "teacher insert request" ON teacher_requests;

DROP POLICY if EXISTS "admin manage teacher_requests" ON teacher_requests;

DROP POLICY if EXISTS "teacher view own assignment" ON teacher_assignments;

DROP POLICY if EXISTS "admin manage teacher_assignments" ON teacher_assignments;