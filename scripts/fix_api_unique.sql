-- CRITICAL FIX FOR API SYNC
-- Run this to allow "Upserting" by key_hash (avoiding ID errors)

BEGIN;

-- 1. Ensure keys are unique so we can update them safely
ALTER TABLE api_keys ADD CONSTRAINT api_keys_key_hash_key UNIQUE (key_hash);

COMMIT;
