"""Idempotently harden the historical Modrek AI migration for production replay.

Production may already contain the modrek_ai_* tables from a previous partial
run while the migration history row is missing. We rewrite the migration file
so it can be re-applied safely on any project state.
"""
from pathlib import Path

path = Path("supabase/migrations/20260712105101_4bfa3893-c738-4564-a8af-0368873bb410.sql")
sql = path.read_text(encoding="utf-8")

replacements = {
    "CREATE TABLE public.modrek_ai_conversations (":
        "CREATE TABLE IF NOT EXISTS public.modrek_ai_conversations (",
    "CREATE INDEX idx_modrek_ai_conv_student ON public.modrek_ai_conversations(student_id, last_message_at DESC);":
        "CREATE INDEX IF NOT EXISTS idx_modrek_ai_conv_student ON public.modrek_ai_conversations(student_id, last_message_at DESC);",
    "CREATE TABLE public.modrek_ai_messages (":
        "CREATE TABLE IF NOT EXISTS public.modrek_ai_messages (",
    "CREATE INDEX idx_modrek_ai_msg_conv ON public.modrek_ai_messages(conversation_id, created_at);":
        "CREATE INDEX IF NOT EXISTS idx_modrek_ai_msg_conv ON public.modrek_ai_messages(conversation_id, created_at);",
    "CREATE POLICY \"Students manage their own AI conversations\"\n  ON public.modrek_ai_conversations":
        "DROP POLICY IF EXISTS \"Students manage their own AI conversations\" ON public.modrek_ai_conversations;\nCREATE POLICY \"Students manage their own AI conversations\"\n  ON public.modrek_ai_conversations",
    "CREATE POLICY \"Students access messages of their conversations\"\n  ON public.modrek_ai_messages":
        "DROP POLICY IF EXISTS \"Students access messages of their conversations\" ON public.modrek_ai_messages;\nCREATE POLICY \"Students access messages of their conversations\"\n  ON public.modrek_ai_messages",
    "CREATE TRIGGER modrek_ai_msg_touch_conv\n  AFTER INSERT ON public.modrek_ai_messages":
        "DROP TRIGGER IF EXISTS modrek_ai_msg_touch_conv ON public.modrek_ai_messages;\nCREATE TRIGGER modrek_ai_msg_touch_conv\n  AFTER INSERT ON public.modrek_ai_messages",
    "CREATE TRIGGER modrek_ai_conv_updated_at\n  BEFORE UPDATE ON public.modrek_ai_conversations":
        "DROP TRIGGER IF EXISTS modrek_ai_conv_updated_at ON public.modrek_ai_conversations;\nCREATE TRIGGER modrek_ai_conv_updated_at\n  BEFORE UPDATE ON public.modrek_ai_conversations",
    "CREATE POLICY \"Students access their own Modrek AI exams\"\n  ON public.exams":
        "DROP POLICY IF EXISTS \"Students access their own Modrek AI exams\" ON public.exams;\nCREATE POLICY \"Students access their own Modrek AI exams\"\n  ON public.exams",
}

for old, new in replacements.items():
    sql = sql.replace(old, new)

conv_hardening = """

-- modrek_ai_conversations_production_replay_hardening
-- Production may already contain this table from a previous partial/manual run
-- while the migration history row is missing. Complete the shape safely.
ALTER TABLE public.modrek_ai_conversations
  ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS assistant_type TEXT NOT NULL DEFAULT 'study',
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'محادثة جديدة',
  ADD COLUMN IF NOT EXISTS context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'modrek_ai_conversations_assistant_type_check'
      AND conrelid = 'public.modrek_ai_conversations'::regclass
  ) THEN
    ALTER TABLE public.modrek_ai_conversations
      ADD CONSTRAINT modrek_ai_conversations_assistant_type_check
      CHECK (assistant_type IN ('study','exams','review'));
  END IF;
END $$;
"""

msg_hardening = """

-- modrek_ai_messages_production_replay_hardening
ALTER TABLE public.modrek_ai_messages
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.modrek_ai_conversations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS parts JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'modrek_ai_messages_role_check'
      AND conrelid = 'public.modrek_ai_messages'::regclass
  ) THEN
    ALTER TABLE public.modrek_ai_messages
      ADD CONSTRAINT modrek_ai_messages_role_check
      CHECK (role IN ('user','assistant','system','tool'));
  END IF;
END $$;
"""

conv_marker = "CREATE INDEX IF NOT EXISTS idx_modrek_ai_conv_student ON public.modrek_ai_conversations(student_id, last_message_at DESC);"
if "modrek_ai_conversations_production_replay_hardening" not in sql:
    sql = sql.replace(conv_marker, conv_marker + conv_hardening)

msg_marker = "CREATE INDEX IF NOT EXISTS idx_modrek_ai_msg_conv ON public.modrek_ai_messages(conversation_id, created_at);"
if "modrek_ai_messages_production_replay_hardening" not in sql:
    sql = sql.replace(msg_marker, msg_marker + msg_hardening)

path.write_text(sql, encoding="utf-8")
print("Hardened production replay migration:", path.name)


# Harden admin_switch_system_terms consolidation migration for production replay.
# Migration 20260725180920 creates both (uuid[], text) and a (text, uuid[]) SQL
# wrapper that depends on it. Migration 20260725180953 then drops (uuid[], text)
# WITHOUT CASCADE — which fails on fresh production replay because the wrapper
# still depends on it. Patch the DROP statements to use CASCADE.
term_path = Path("supabase/migrations/20260725180953_b0642069-afaf-4fab-a1f2-278011bcfdc2.sql")
if term_path.exists():
    term_sql = term_path.read_text(encoding="utf-8")
    patched = term_sql
    patched = patched.replace(
        "DROP FUNCTION IF EXISTS public.admin_switch_system_terms(uuid[], text);",
        "DROP FUNCTION IF EXISTS public.admin_switch_system_terms(uuid[], text) CASCADE;",
    )
    patched = patched.replace(
        "DROP FUNCTION IF EXISTS public.admin_switch_system_terms(text, uuid[]);",
        "DROP FUNCTION IF EXISTS public.admin_switch_system_terms(text, uuid[]) CASCADE;",
    )
    # Also ensure any leftover (uuid[], text) wrapper is removed defensively.
    if "-- admin_switch_system_terms_production_replay_hardening" not in patched:
        patched = (
            "-- admin_switch_system_terms_production_replay_hardening\n"
            "DROP FUNCTION IF EXISTS public.admin_switch_system_terms(uuid[], text) CASCADE;\n"
            "DROP FUNCTION IF EXISTS public.admin_switch_system_terms(text, uuid[]) CASCADE;\n\n"
        ) + patched
    if patched != term_sql:
        term_path.write_text(patched, encoding="utf-8")
        print("Hardened admin_switch_system_terms migration:", term_path.name)
