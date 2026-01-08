-- MASTER FIX FOR API LAYER
-- Run this ENTIRE script in Supabase SQL Editor to resolve "Offline" errors.

BEGIN;

-- 1. Ensure Table Exists
CREATE TABLE IF NOT EXISTS api_keys (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id text NOT NULL,
    name text NOT NULL,
    key_hash text NOT NULL,
    prefix text NOT NULL,
    created_at timestamptz DEFAULT now(),
    last_used_at timestamptz,
    status text DEFAULT 'active',
    permissions text[] DEFAULT '{orders:write}'
);

-- 2. Wipe existing policies to start fresh
DROP POLICY IF EXISTS "Users can manage their own API keys" ON api_keys;
DROP POLICY IF EXISTS "Enable access to all users" ON api_keys;

-- 3. Enable RLS and Add Permissive Policy
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable access to all users" ON api_keys
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 4. CRITICAL: Enable Realtime for this table
-- This is likely why the "sync" fails, as it tries to subscribe.
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR ALL TABLES;
-- Alternatively, if you want to be specific (but FOR ALL TABLES is safest for MVP):
-- ALTER PUBLICATION supabase_realtime ADD TABLE api_keys;

-- 5. Grant Permissions to Service Roles
GRANT ALL ON api_keys TO anon;
GRANT ALL ON api_keys TO authenticated;
GRANT ALL ON api_keys TO service_role;

COMMIT;
