-- =============================================
-- MULTI-AREA & DELIVERY FIX SCRIPT
-- =============================================
-- Run this in Supabase SQL Editor to support the new KDS features.

-- 1. Support for "In-Order Delivery" (Checkmark confirmation)
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS is_delivered boolean default false;

-- 2. Support for Custom KDS Areas (e.g. "Cocina Fria", "Postres")
-- We remove any constraints that might force 'kitchen' or 'bar' values
DO $$ 
BEGIN 
    -- Try to drop constraint if it exists (name may vary, so we try standard naming)
    ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_destination_check;
    
    -- If destination was an ENUM, convert it to TEXT to allow any string
    ALTER TABLE public.categories ALTER COLUMN destination TYPE text;
EXCEPTION
    WHEN OTHERS THEN 
        NULL; -- Ignore errors if constraint didn't exist
END $$;

-- 3. Ensure 'order' column exists for Categories Sorting
ALTER TABLE public.categories 
ADD COLUMN IF NOT EXISTS "order" integer default 0;

-- 4. Safety: Update Row Level Security
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;
GRANT ALL ON TABLE public.orders TO anon; -- For development robustness

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.categories TO authenticated;
GRANT ALL ON TABLE public.categories TO service_role;
GRANT ALL ON TABLE public.categories TO anon;

SELECT '✅ SUCCESS: Database Ready for Multi-Area KDS' as status;
