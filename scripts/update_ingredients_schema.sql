-- Add missing columns to ingredients table to match local schema
ALTER TABLE ingredients 
ADD COLUMN IF NOT EXISTS is_infinite BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS min_stock NUMERIC DEFAULT 5,
ADD COLUMN IF NOT EXISTS code TEXT,
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS purchase_unit TEXT,
ADD COLUMN IF NOT EXISTS conversion_factor NUMERIC DEFAULT 1;

-- Add comment
COMMENT ON COLUMN ingredients.is_infinite IS 'Flag for infinite stock items like water or service';
COMMENT ON COLUMN ingredients.min_stock IS 'Custom low stock threshold';
