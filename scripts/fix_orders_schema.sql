-- Add 'covers' column to 'orders' table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'covers') THEN
        ALTER TABLE orders ADD COLUMN covers INTEGER DEFAULT 2;
    END IF;
END
$$;
