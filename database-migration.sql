-- ============================================
-- Coffee Chat Barista - Multi-Tenant Migration
-- ============================================
-- Run this in your Supabase SQL Editor

-- 1. Create the guild_settings table
CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  guild_name TEXT,
  announcements_channel_id TEXT,
  pairings_channel_id TEXT,
  moderator_role_id TEXT,
  ping_role_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add guild_id to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS guild_id TEXT;

-- 3. Add guild_id to current_week_signups table
ALTER TABLE current_week_signups ADD COLUMN IF NOT EXISTS guild_id TEXT;

-- 4. Add guild_id to current_week_pairings table
ALTER TABLE current_week_pairings ADD COLUMN IF NOT EXISTS guild_id TEXT;

-- 5. Add guild_id to history table
ALTER TABLE history ADD COLUMN IF NOT EXISTS guild_id TEXT;

-- 6. Update the primary key for profiles (now composite)
-- Drop any signup->profiles foreign keys first so profiles PK can be replaced safely.
DO $$
DECLARE
  fk_record RECORD;
BEGIN
  FOR fk_record IN
    SELECT con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace rel_ns ON rel_ns.oid = rel.relnamespace
    JOIN pg_class ref ON ref.oid = con.confrelid
    JOIN pg_namespace ref_ns ON ref_ns.oid = ref.relnamespace
    WHERE con.contype = 'f'
      AND rel_ns.nspname = 'public'
      AND ref_ns.nspname = 'public'
      AND rel.relname = 'current_week_signups'
      AND ref.relname = 'profiles'
  LOOP
    EXECUTE format('ALTER TABLE current_week_signups DROP CONSTRAINT IF EXISTS %I', fk_record.constraint_name);
  END LOOP;
END $$;

-- Replace old single-column PK with composite PK.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_pkey;
ALTER TABLE profiles ADD PRIMARY KEY (guild_id, user_id);

-- Recreate the signup->profiles FK using (guild_id, user_id).
-- NOT VALID avoids blocking migration on old test rows; new rows are still enforced.
ALTER TABLE current_week_signups
  ADD CONSTRAINT fk_signup_profile_multi_tenant
  FOREIGN KEY (guild_id, user_id)
  REFERENCES profiles(guild_id, user_id)
  ON DELETE CASCADE
  NOT VALID;

-- 7. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_guild ON profiles(guild_id);
CREATE INDEX IF NOT EXISTS idx_signups_guild ON current_week_signups(guild_id);
CREATE INDEX IF NOT EXISTS idx_pairings_guild ON current_week_pairings(guild_id);
CREATE INDEX IF NOT EXISTS idx_history_guild ON history(guild_id);
CREATE INDEX IF NOT EXISTS idx_guild_settings_configured ON guild_settings(announcements_channel_id) 
  WHERE announcements_channel_id IS NOT NULL;

-- 8. Add completion tracking columns to current_week_pairings
ALTER TABLE current_week_pairings ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE current_week_pairings ADD COLUMN IF NOT EXISTS completion_method TEXT DEFAULT NULL;
ALTER TABLE current_week_pairings ADD COLUMN IF NOT EXISTS assigned_vc_channel_id TEXT DEFAULT NULL;

-- 9. Create pending_reports table for auditable moderation workflow
CREATE TABLE IF NOT EXISTS pending_reports (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  pairing_id BIGINT,
  reporter_user_id TEXT NOT NULL,
  reported_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by_user_id TEXT,
  reviewed_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Indexes for report and completion queries
CREATE INDEX IF NOT EXISTS idx_pairings_guild_completion ON current_week_pairings(guild_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_pairings_guild_assigned_vc_id ON current_week_pairings(guild_id, assigned_vc_channel_id);
CREATE INDEX IF NOT EXISTS idx_pending_reports_guild_status ON pending_reports(guild_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_reports_reported ON pending_reports(guild_id, reported_user_id, status);

-- ============================================
-- If you have EXISTING data from a single-guild setup,
-- run this to migrate it (replace YOUR_GUILD_ID):
-- ============================================
-- UPDATE profiles SET guild_id = 'YOUR_GUILD_ID' WHERE guild_id IS NULL;
-- UPDATE current_week_signups SET guild_id = 'YOUR_GUILD_ID' WHERE guild_id IS NULL;
-- UPDATE current_week_pairings SET guild_id = 'YOUR_GUILD_ID' WHERE guild_id IS NULL;
-- UPDATE history SET guild_id = 'YOUR_GUILD_ID' WHERE guild_id IS NULL;


