-- Tenant V2: give every tenant-owned table an explicit tenant_id and a
-- RESTRICTIVE tenant gate. Default = official tenant, so existing Modrek Plus
-- data and behaviour are preserved exactly.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'content','content_groups','content_chunks','sub_subjects','subjects',
    'subscriptions','subscription_requests','subscription_messages',
    'student_group_purchases','student_teacher_choices','teacher_assignments',
    'exams','exam_questions','exam_question_options','exam_attempts','exam_answers','exam_statistics',
    'notifications','teacher_messages','support_messages','live_sessions','live_session_messages',
    'video_progress','wallets','teacher_wallets','deposit_requests','usage_logs',
    'library_books','library_book_chunks','library_book_pages','library_book_conversations',
    'knowledge_sources','knowledge_units','content_groups',
    'ai_conversations','ai_messages','ai_sources','ai_admin_instructions',
    'modrek_ai_conversations','modrek_ai_messages','storage_assets',
    'teacher_profiles','teacher_requests','group_weekly_schedule','ads','ad_targets'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = t) THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = t AND column_name = 'tenant_id') THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN tenant_id uuid NOT NULL DEFAULT public.official_tenant_id() REFERENCES public.tenants(id) ON DELETE RESTRICT',
        t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)', t || '_tenant_id_idx', t);
    END IF;

    -- Backfill from an existing platform_id column when present.
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = t AND column_name = 'platform_id') THEN
      EXECUTE format(
        'UPDATE public.%I x SET tenant_id = tn.id FROM public.tenants tn
          WHERE tn.teacher_platform_id = x.platform_id AND x.tenant_id IS DISTINCT FROM tn.id', t);
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'tenant_isolation_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL
         USING (public.tenant_row_visible(tenant_id))
         WITH CHECK (public.tenant_row_visible(tenant_id))',
      'tenant_isolation_' || t, t);
  END LOOP;
END $$;

-- New rows always inherit the tenant authorized for the writing session.
CREATE OR REPLACE FUNCTION public.set_tenant_id_from_session()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.tenant_id IS NULL OR NEW.tenant_id = public.official_tenant_id() THEN
    NEW.tenant_id := public.effective_request_tenant_id();
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
       AND c.table_name NOT IN ('tenants','tenant_accounts','tenant_session_contexts','tenant_teacher_config','teacher_platforms')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_tenant_id_trg ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER set_tenant_id_trg BEFORE INSERT ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_from_session()', t);
  END LOOP;
END $$;