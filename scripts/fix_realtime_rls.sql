-- HEALER: FIX REALTIME RLS POLICIES
-- Enabling RLS without policies blocks Realtime. 
-- This script adds the necessary policies for standard tables used in the Nexus.

-- 1. Ensure RLS is enabled
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to avoid conflicts (clean slate)
DROP POLICY IF EXISTS "Nexus: Users can see own restaurant tables" ON public.restaurant_tables;
DROP POLICY IF EXISTS "Nexus: Users can see own restaurant orders" ON public.orders;

-- 3. Create permissive policies based on restaurant_id
-- We assume the user has a 'restaurant_id' claim in their profile or we filter by the column directly.
-- For standard Supabase Realtime with filters, the user must have SELECT permission on the rows.

CREATE POLICY "Nexus: Users can see own restaurant tables" 
ON public.restaurant_tables
FOR SELECT 
USING (
    restaurant_id IN (
        SELECT restaurant_id FROM public.profiles WHERE id = auth.uid()
    )
);

CREATE POLICY "Nexus: Users can see own restaurant orders" 
ON public.orders
FOR SELECT 
USING (
    restaurant_id IN (
        SELECT restaurant_id FROM public.profiles WHERE id = auth.uid()
    )
);

-- 4. Set REPLICA IDENTITY FULL (Required for Realtime UPDATE/DELETE)
ALTER TABLE public.restaurant_tables REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;

SELECT '✅ SUCCESS: Realtime RLS policies applied' as status;
