-- 1. Create the table for Multi-Tenant Restaurant Configuration
CREATE TABLE IF NOT EXISTS restaurant_config (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    restaurant_id UUID NOT NULL,

    -- Identity
    fantasy_name TEXT,
    business_name TEXT,
    rut TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    
    -- SII / DTE Credentials (Encrypted or just stored if managed by RLS)
    sii_environment TEXT CHECK (sii_environment IN ('certificacion', 'produccion')),
    sii_certificate_p12 TEXT, -- Base64 storage
    sii_certificate_password TEXT,
    sii_api_key TEXT,
    
    -- Payment
    payment_provider TEXT CHECK (payment_provider IN ('mercadopago', 'transbank', 'sumup')),
    payment_terminal_id TEXT,

    -- Constraints
    UNIQUE(restaurant_id) -- Only one config per restaurant
);

-- 2. Enable RLS (Row Level Security)
ALTER TABLE restaurant_config ENABLE ROW LEVEL SECURITY;

-- 3. Policy: Tenants can only see their own config
CREATE POLICY "Tenants can view own config" 
ON restaurant_config FOR SELECT 
USING (restaurant_id::text = current_setting('app.current_restaurant_id', true));

CREATE POLICY "Tenants can upsert own config" 
ON restaurant_config FOR INSERT 
WITH CHECK (restaurant_id::text = current_setting('app.current_restaurant_id', true));

CREATE POLICY "Tenants can update own config" 
ON restaurant_config FOR UPDATE
USING (restaurant_id::text = current_setting('app.current_restaurant_id', true));

-- 4. Grant Permissions
GRANT ALL ON restaurant_config TO authenticated;
GRANT ALL ON restaurant_config TO service_role;
