CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_type text NOT NULL CHECK (tenant_type IN ('official','teacher')),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','archived')),
  teacher_platform_id uuid UNIQUE REFERENCES public.teacher_platforms(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tenants TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX tenants_single_official_idx ON public.tenants (tenant_type) WHERE tenant_type = 'official';

CREATE TABLE public.tenant_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  full_name text,
  education_type text,
  stage text,
  grade text,
  section text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, auth_user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_accounts TO authenticated;
GRANT ALL ON public.tenant_accounts TO service_role;
ALTER TABLE public.tenant_accounts ENABLE ROW LEVEL SECURITY;
CREATE INDEX tenant_accounts_user_idx ON public.tenant_accounts(auth_user_id, tenant_id, status);

CREATE TABLE public.tenant_teacher_config (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  owner_teacher_id uuid NOT NULL,
  education_types text[] NOT NULL DEFAULT ARRAY['عام','أزهر']::text[],
  stages text[] NOT NULL DEFAULT ARRAY[]::text[],
  grades text[] NOT NULL DEFAULT ARRAY[]::text[],
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.tenant_teacher_config TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tenant_teacher_config TO authenticated;
GRANT ALL ON public.tenant_teacher_config TO service_role;
ALTER TABLE public.tenant_teacher_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tenant_session_contexts (
  session_id uuid PRIMARY KEY,
  auth_user_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_account_id uuid NOT NULL REFERENCES public.tenant_accounts(id) ON DELETE CASCADE,
  activated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_session_contexts TO authenticated;
GRANT ALL ON public.tenant_session_contexts TO service_role;
ALTER TABLE public.tenant_session_contexts ENABLE ROW LEVEL SECURITY;
CREATE INDEX tenant_session_contexts_user_idx ON public.tenant_session_contexts(auth_user_id, tenant_id);

ALTER TABLE public.teacher_platforms ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT;