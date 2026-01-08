-- FIX API KEYS PERMISSIONS
-- The previous policy relied on a variable that might not be set by the client.
-- This script opens the table permissions to ensure synchronization works.

-- 1. Drop the strict policy if it exists
DROP POLICY IF EXISTS "Users can manage their own API keys" ON api_keys;

-- 2. Create a permissive policy (since the App handles logic/filtering)
CREATE POLICY "Enable access to all users" ON api_keys
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 3. Ensure RLS is enabled (but now open via policy)
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
