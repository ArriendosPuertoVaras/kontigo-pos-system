-- FINAL SCHEMA BULLETPROOFING
-- Ensures all tables have the correct columns to accept local data without errors.

-- 1. PRODUCTS: Ensure 'recipe' is JSONB (Critical for '8 gr' vs '8 un')
ALTER TABLE products ADD COLUMN IF NOT EXISTS recipe jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS modifiers jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS instructions text; -- or jsonb/string[]
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_available boolean DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id integer;

-- 2. INGREDIENTS: Ensure inventory fields exist
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS min_stock numeric;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS yield_percent numeric;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS family text;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS sub_family text;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS storage text;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS purchase_unit text;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS conversion_factor numeric;

-- 3. ORDERS: Ensure complex fields
ALTER TABLE orders ADD COLUMN IF NOT EXISTS items jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payments jsonb;

-- 4. CLEANUP DUPLICATES (Bonus: Optional safety check)
-- This is hard to do safely in SQL without knowing which ID is "real".
-- We rely on the user manually deleting the "bad" ones in the UI.
