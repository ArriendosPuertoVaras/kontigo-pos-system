-- FIX: MISSING SYNC COLUMNS FOR DELIVERY NOTIFICATIONS
-- Run this in Supabase SQL Editor

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS ready_sections text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS delivered_sections text[] DEFAULT '{}';

-- Optimization: Ensure REPLICA IDENTITY is FULL for these updates to propagate correctly via Realtime
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- Index for performance in filtering (already partly handled, but good practice)
CREATE INDEX IF NOT EXISTS idx_orders_delivery_tracking ON public.orders USING gin (ready_sections, delivered_sections);

SELECT '✅ SUCCESS: ready_sections and delivered_sections columns added to orders table' as message;
