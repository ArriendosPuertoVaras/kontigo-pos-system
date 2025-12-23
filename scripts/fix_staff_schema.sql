-- FIX RESTAURANT STAFF SCHEMA
-- Adds all missing columns to support full staff profile sync from Dexie -> Supabase

-- Financial & Contract Info
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS hourly_rate numeric DEFAULT 0;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS daily_salary numeric DEFAULT 0;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS base_salary numeric DEFAULT 0;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS estimated_tips numeric DEFAULT 0;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS colacion numeric DEFAULT 0;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS movilizacion numeric DEFAULT 0;

-- Contract Details
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS contract_type text; -- '40-hours', 'part-time', etc
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS contract_duration text; -- 'indefinite', 'fixed'
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS start_date timestamp with time zone;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS weekly_hours_limit integer;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS salary_type text; -- 'monthly', 'hourly'

-- Personal Info
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS rut text;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS nationality text;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS birth_date timestamp with time zone;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS avatar_color text;

-- Social Security & Health
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS afp text;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS health_system text; -- Fonasa/Isapre
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS health_fee numeric DEFAULT 0; -- Costo Isapre
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS seguro_cesantia boolean DEFAULT false;

-- Banking
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS bank_details jsonb;

-- Status/Roles (Ensure they exist)
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS active_role text;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
