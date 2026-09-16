-- Additive migration. Existing teachers/courses/teacher_courses are untouched.
BEGIN;
CREATE TABLE IF NOT EXISTS public.wb_imports (
 id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
 filename text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
 records jsonb NOT NULL CHECK (jsonb_typeof(records)='array'),
 issues jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(issues)='array'),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.wb_identity_links (
 course_id text PRIMARY KEY, teacher_id text NOT NULL,
 confirmed_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.wb_login_guard (
 id integer PRIMARY KEY CHECK (id=1), window_start timestamptz NOT NULL, attempts integer NOT NULL
);
CREATE OR REPLACE FUNCTION public.wb_allow_login() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 INSERT INTO wb_login_guard(id,window_start,attempts) VALUES(1,now(),1)
 ON CONFLICT(id) DO UPDATE SET
 attempts=CASE WHEN wb_login_guard.window_start < now()-interval '10 minutes' THEN 1 ELSE wb_login_guard.attempts+1 END,
 window_start=CASE WHEN wb_login_guard.window_start < now()-interval '10 minutes' THEN now() ELSE wb_login_guard.window_start END
 RETURNING attempts INTO n;
 RETURN n<=30;
END; $$;
ALTER TABLE public.wb_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wb_identity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wb_login_guard ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wb_imports, public.wb_identity_links, public.wb_login_guard FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wb_allow_login() FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON public.wb_imports,public.wb_identity_links,public.wb_login_guard FROM %I',r);
   EXECUTE format('REVOKE ALL ON FUNCTION public.wb_allow_login() FROM %I',r);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  GRANT SELECT,INSERT,UPDATE ON public.wb_imports,public.wb_identity_links TO service_role;
  GRANT EXECUTE ON FUNCTION public.wb_allow_login() TO service_role;
  DROP POLICY IF EXISTS wb_service ON public.wb_imports;
  CREATE POLICY wb_service ON public.wb_imports TO service_role USING(true) WITH CHECK(true);
  DROP POLICY IF EXISTS wb_service ON public.wb_identity_links;
  CREATE POLICY wb_service ON public.wb_identity_links TO service_role USING(true) WITH CHECK(true);
 END IF;
END $$;
COMMIT;
-- Check which role CLOUDBASE_API_KEY actually uses before enabling production.
-- Never grant these tables or the login RPC to anon/authenticated for convenience.
