-- ENABLE REALTIME FOR ORDERS
-- This ensures the Kitchen Display "beeps" when a new order arrives from the API.

BEGIN;

-- 1. Add 'orders' to the realtime publication
-- (If it's already there, this command usually handles it or we can ignore error, 
--  but for explicit safety we try adding it).
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- 2. Also ensure 'restaurant_staff' and 'api_keys' are there just in case for other bugs
ALTER PUBLICATION supabase_realtime ADD TABLE api_keys;
ALTER PUBLICATION supabase_realtime ADD TABLE restaurant_staff;

COMMIT;
