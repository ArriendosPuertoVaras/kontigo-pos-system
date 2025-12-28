-- COMPLETE SYSTEM SCHEMA UPDATE
-- Execute this in your Supabase SQL Editor to prevent data loss.

-- 1. Categorization (Ingredients)
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS family TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS sub_family TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS storage TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS is_infinite BOOLEAN DEFAULT FALSE;

-- 2. Sub-Recipes (Preparations)
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS is_preparation BOOLEAN DEFAULT FALSE;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS recipe JSONB; 
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS instructions JSONB; 
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS chef_note TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS prep_time TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS cook_time TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS total_time TEXT;

-- 3. FINANCE TABLES (New Sync Requirement)
-- 3. FINANCE TABLES (Updates)
-- Safe check for accounts table
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    balance NUMERIC DEFAULT 0,
    description TEXT,
    parent_code TEXT, 
    is_group BOOLEAN DEFAULT FALSE,
    tax_rate NUMERIC,
    currency TEXT DEFAULT 'CLP'
);

-- Ensure parent_code exists (Correction from previous version)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'accounts' AND column_name = 'parent_code') THEN 
        ALTER TABLE accounts ADD COLUMN parent_code TEXT; 
    END IF; 
END $$;

CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY,
    date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    description TEXT,
    reference_id TEXT,
    movements JSONB,
    status TEXT DEFAULT 'draft',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. OPERATIONAL TABLES (New Tables & Updates)

-- Purchase Orders (Was missing in screenshot)
CREATE TABLE IF NOT EXISTS purchase_orders (
    id BIGINT PRIMARY KEY,
    supplier_id BIGINT,
    date TIMESTAMP WITH TIME ZONE,
    status TEXT,
    total_cost NUMERIC,
    items JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Waste Logs (Already existed, ensure columns match)
CREATE TABLE IF NOT EXISTS waste_logs (
    id BIGINT PRIMARY KEY,
    ingredient_id BIGINT,
    quantity NUMERIC,
    reason TEXT,
    date TIMESTAMP WITH TIME ZONE,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Enable RLS (Optional but recommended)
-- ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
