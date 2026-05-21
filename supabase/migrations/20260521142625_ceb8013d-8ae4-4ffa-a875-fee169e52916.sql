CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_net";
DO $$
BEGIN
  RAISE NOTICE 'External bootstrap migration applied: %', now();
END
$$;