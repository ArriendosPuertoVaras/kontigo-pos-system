-- Add new categorization columns to ingredients table
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS family TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS sub_family TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS storage TEXT;

COMMENT ON COLUMN ingredients.family IS 'General category group (e.g. Abarrotes, Carnes)';
COMMENT ON COLUMN ingredients.sub_family IS 'Specific sub-category (e.g. Harinas, Embutidos)';
COMMENT ON COLUMN ingredients.storage IS 'Storage requirements (e.g. Refrigerado, Seco)';
