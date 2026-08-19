DO $$
BEGIN
  EXECUTE 'ALTER TABLE temples ADD COLUMN IF NOT EXISTS custom_services JSONB NOT NULL DEFAULT ''[]''::jsonb';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Need superuser — skipping';
END $$;
