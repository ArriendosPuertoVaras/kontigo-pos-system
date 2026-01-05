-- ALIGN SUPABASE WITH NEW PURCHASE TRACKING FEATURES
-- Run this in Supabase SQL Editor

-- 1. Add RUT to Suppliers
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS rut TEXT;

-- 2. Add Payment Status and Due Date to Purchase Orders
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'Paid';
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS due_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS folio TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS customer_number TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- 3. Logical Deletion for Suppliers
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- 3. Ensure RLS allows these columns (usually automatic, but good to check)
-- No specific RLS changes needed for standard columns.

-- 4. Notify about success
COMMENT ON COLUMN suppliers.rut IS 'Chilean RUT identifier for suppliers';
COMMENT ON COLUMN purchase_orders.payment_status IS 'Paid or Pending status for accounting';
COMMENT ON COLUMN purchase_orders.due_date IS 'Mandatory for Pending payments to trigger alerts';
