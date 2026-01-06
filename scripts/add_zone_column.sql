-- Add 'zone' column to restaurant_tables for Multi-Zone support
-- Default zone is 'General' if not specified.

ALTER TABLE restaurant_tables 
ADD COLUMN IF NOT EXISTS zone text DEFAULT 'General';

-- Update existing tables to have a reasonable default
UPDATE restaurant_tables 
SET zone = 'General' 
WHERE zone IS NULL;

-- If we have our specific "Delivery" table, let's mark it as 'Delivery' zone
UPDATE restaurant_tables 
SET zone = 'Delivery' 
WHERE name ILIKE '%Delivery%';
