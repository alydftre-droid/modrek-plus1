-- Add covering indexes for every public-schema foreign key that lacks one.
-- Prevents sequential scans on joins and on cascading deletes as data grows.
DO $$
DECLARE
  r record;
  idx_name text;
  stmt text;
BEGIN
  FOR r IN
    SELECT t.relname AS tbl,
           (SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY x.ord)
              FROM unnest(c.conkey) WITH ORDINALITY x(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = x.attnum) AS cols,
           (SELECT string_agg(a.attname, '_' ORDER BY x.ord)
              FROM unnest(c.conkey) WITH ORDINALITY x(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = x.attnum) AS colnames
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE c.contype = 'f'
       AND n.nspname = 'public'
       AND NOT EXISTS (
         SELECT 1 FROM pg_index i
          WHERE i.indrelid = c.conrelid
            AND (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
       )
  LOOP
    idx_name := left('idx_fk_' || r.tbl || '_' || r.colnames, 63);
    stmt := format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)', idx_name, r.tbl, r.cols);
    EXECUTE stmt;
  END LOOP;
END $$;