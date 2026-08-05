CREATE OR REPLACE FUNCTION public.verify_cron_secret(_name text, _secret text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  stored text;
BEGIN
  SELECT decrypted_secret INTO stored
  FROM vault.decrypted_secrets
  WHERE name = _name
  LIMIT 1;

  IF stored IS NULL OR _secret IS NULL THEN
    RETURN false;
  END IF;
  RETURN stored = _secret;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_cron_secret(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_secret(text, text) TO service_role;