-- ============================================
-- Coffee Chat Barista - Clean Slate Reset
-- ============================================
-- Purpose:
--   Wipe all existing bot data while keeping schema/migrations intact.
--
-- Safe to run before launch if your data is test-only.
--
-- Tables cleared (if they exist):
--   - pending_reports
--   - current_week_signups
--   - current_week_pairings
--   - history
--   - profiles
--   - guild_settings
--
-- Notes:
--   - This is destructive and cannot be undone.
--   - After running, each server must run /coffee setup again.

DO $$
DECLARE
  tables_to_truncate TEXT[] := ARRAY[
    'pending_reports',
    'current_week_signups',
    'current_week_pairings',
    'history',
    'profiles',
    'guild_settings'
  ];
  current_table_name TEXT;
BEGIN
  FOREACH current_table_name IN ARRAY tables_to_truncate LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables AS t
      WHERE t.table_schema = 'public'
        AND t.table_name = current_table_name
    ) THEN
      EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE', current_table_name);
    END IF;
  END LOOP;
END $$;
