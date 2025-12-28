-- Fix 'dtes' table schema - All Missing Columns
DO $$
BEGIN
    -- 1. order_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dtes' AND column_name = 'order_id') THEN
        ALTER TABLE dtes ADD COLUMN order_id INTEGER REFERENCES orders(id);
    END IF;

    -- 2. receiver_address
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dtes' AND column_name = 'receiver_address') THEN
        ALTER TABLE dtes ADD COLUMN receiver_address TEXT;
    END IF;

    -- 3. receiver_name
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dtes' AND column_name = 'receiver_name') THEN
        ALTER TABLE dtes ADD COLUMN receiver_name TEXT;
    END IF;

    -- 4. receiver_rut
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dtes' AND column_name = 'receiver_rut') THEN
        ALTER TABLE dtes ADD COLUMN receiver_rut TEXT;
    END IF;

    -- 5. xml_content
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dtes' AND column_name = 'xml_content') THEN
        ALTER TABLE dtes ADD COLUMN xml_content TEXT;
    END IF;
END
$$;
