CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.dispatch_notification_push(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_link text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text;
  v_anon text;
BEGIN
  IF p_user_id IS NULL OR COALESCE(trim(p_title), '') = '' OR COALESCE(trim(p_body), '') = '' THEN
    RETURN;
  END IF;

  v_url := 'https://qteuqfntsocsdbjmdvmr.supabase.co/functions/v1/send-push-notification';
  v_anon := 'sb_publishable_rN8ogJuF9T1Dy6aMkdLVeQ__RbfP19A';

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon,
      'Authorization', 'Bearer ' || v_anon
    ),
    body := jsonb_build_object(
      'user_id', p_user_id,
      'title', p_title,
      'body', p_body,
      'link', COALESCE(p_link, '')
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'dispatch_notification_push failed: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_external_sync(sync_scope text DEFAULT 'tables')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_base_url text := 'https://qteuqfntsocsdbjmdvmr.supabase.co/functions/v1/external-sync';
  v_url text;
  v_anon text := 'sb_publishable_rN8ogJuF9T1Dy6aMkdLVeQ__RbfP19A';
BEGIN
  v_url := v_base_url || CASE
    WHEN sync_scope IN ('auth','tables','rls') THEN '?only=' || sync_scope
    ELSE ''
  END;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon,
      'Authorization', 'Bearer ' || v_anon
    ),
    body := jsonb_build_object(
      'source', 'db-trigger',
      'scope', sync_scope,
      'requested_at', now()
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'request_external_sync failed: %', SQLERRM;
END;
$$;