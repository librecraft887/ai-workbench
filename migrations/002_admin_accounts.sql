-- Separate administrator accounts. Run after 001_resource_ledger.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS public.wb_admin_users (
 id uuid PRIMARY KEY,
 username text NOT NULL UNIQUE CHECK (username ~ '^[A-Za-z0-9_.-]{3,64}$'),
 display_name text NOT NULL,
 password_salt text NOT NULL,
 password_hash text NOT NULL,
 role text NOT NULL CHECK (role IN ('super_admin','resource_admin')),
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 last_login_at timestamptz
);
ALTER TABLE public.wb_admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wb_admin_users FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON public.wb_admin_users FROM %I',r);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  GRANT SELECT,INSERT,UPDATE ON public.wb_admin_users TO service_role;
  DROP POLICY IF EXISTS wb_service ON public.wb_admin_users;
  CREATE POLICY wb_service ON public.wb_admin_users TO service_role USING(true) WITH CHECK(true);
 END IF;
END $$;
COMMIT;
