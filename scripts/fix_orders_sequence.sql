-- FIX ORDERS ID SEQUENCE
-- Run this in Supabase SQL Editor to resolve "Duplicate Key" errors.

BEGIN;

-- Reset the sequence for 'orders' table to the maximum existing ID + 1
-- This ensures the next API insertion gets a fresh, unused ID.

SELECT setval(
    pg_get_serial_sequence('orders', 'id'),
    COALESCE((SELECT MAX(id) FROM orders), 0) + 1,
    false
);

COMMIT;
