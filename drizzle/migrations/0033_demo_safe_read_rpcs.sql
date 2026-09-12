-- Read-only reporting RPCs perform an idempotent bootstrap write (wallet rows,
-- debug log). Skip that write for demo accounts so demo admins keep FULL
-- visibility of those pages while remaining strictly read-only.
DO $do$
DECLARE
  r record;
  def text;
  i int;
  j int;
  newdef text;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname IN ('admin_financial_overview', 'admin_list_teacher_wallets', 'get_exam_review_questions')
  LOOP
    def := pg_get_functiondef(r.oid);
    IF position('current_user_is_demo' IN def) > 0 THEN
      CONTINUE;
    END IF;
    i := position('INSERT INTO' IN def);
    IF i = 0 THEN
      CONTINUE;
    END IF;
    j := position(';' IN substr(def, i)) + i - 1;
    newdef := substr(def, 1, i - 1)
      || 'IF NOT public.current_user_is_demo() THEN '
      || substr(def, i, j - i + 1)
      || ' END IF;'
      || substr(def, j + 1);
    EXECUTE newdef;
  END LOOP;
END
$do$;