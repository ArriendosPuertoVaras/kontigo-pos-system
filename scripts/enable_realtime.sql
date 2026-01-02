-- 1. Create publication if it doesn't exist (usually named 'supabase_realtime')
-- Note: 'supabase_realtime' is the default name used by Supabase UI.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

-- 2. Add tables to the publication
-- We use ALTER PUBLICATION ... ADD TABLE ... (But we need to handle if already added)
-- A safer way is using dynamic SQL or just dropping/creating, 
-- but in Supabase simple ADD TABLE works or we can use the UI name.

ALTER PUBLICATION supabase_realtime ADD TABLE restaurant_tables;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- 3. Set REPLICA IDENTITY to FULL for these tables
-- This ensures that UPDATE and DELETE payloads contain all OLD data if needed, 
-- improving sync consistency across clients.
ALTER TABLE restaurant_tables REPLICA IDENTITY FULL;
ALTER TABLE orders REPLICA IDENTITY FULL;

-- 4. Ensure we have indexes for the restaurant_id filter used in Realtime
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_sync ON restaurant_tables(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_sync ON orders(restaurant_id);
