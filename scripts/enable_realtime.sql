-- 1. Create publication if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

-- 2. Add tables to the publication safely (idempotent)
DO $$
BEGIN
    -- Add restaurant_tables if not already present
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'restaurant_tables'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_tables;
    END IF;

    -- Add orders if not already present
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    END IF;
END $$;

-- 3. Set REPLICA IDENTITY to FULL
ALTER TABLE public.restaurant_tables REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- 4. Ensure we have indexes for performance
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_sync ON public.restaurant_tables(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_sync ON public.orders(restaurant_id);

SELECT '✅ SUCCESS: Realtime connectivity enabled safely' as status;
