DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='exams' AND column_name='created_by'
  ) THEN
    EXECUTE 'ALTER TABLE public.exams ALTER COLUMN created_by DROP NOT NULL';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';