-- Add 'order_id' column to 'dtes' table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dtes' AND column_name = 'order_id') THEN
        ALTER TABLE dtes ADD COLUMN order_id INTEGER REFERENCES orders(id);
    END IF;
END
$$;
