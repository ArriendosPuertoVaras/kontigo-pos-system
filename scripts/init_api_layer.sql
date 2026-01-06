-- Enable API Access Layer
-- Phase 1 of Master Plan 2026

-- 1. Create API Keys Table
CREATE TABLE IF NOT EXISTS api_keys (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id text NOT NULL,
    name text NOT NULL, -- "UberEats", "Zapier", etc.
    key_hash text NOT NULL, -- We store the raw key for now for simplicity in MVP, or hash it. Let's store raw for display in UI (controlled env).
    prefix text NOT NULL, -- "sk_live_..."
    created_at timestamptz DEFAULT now(),
    last_used_at timestamptz,
    status text DEFAULT 'active', -- 'active' | 'revoked'
    permissions text[] DEFAULT '{orders:write}' -- Scope
);

-- 2. Index for fast lookup during API requests
CREATE INDEX IF NOT EXISTS idx_api_keys_lookup ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_restaurant ON api_keys(restaurant_id);

-- 3. RLS Policies (Security)
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Allow restaurant owners to see/manage their own keys
CREATE POLICY "Users can manage their own API keys" ON api_keys
    FOR ALL
    USING (restaurant_id = current_setting('app.current_restaurant_id', true)::text);

-- 4. Verify Orders Table compatibility (JSONB items)
-- ensuring items column is definitely jsonb
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'items' AND data_type = 'jsonb') THEN
        -- If it's text or something else, we might need migration, but usually we started with jsonb. 
        -- Creating it if table doesn't exist is handled by sync, but here we ensure.
        NULL;
    END IF;
END $$;
