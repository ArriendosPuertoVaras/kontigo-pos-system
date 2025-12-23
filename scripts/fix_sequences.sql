-- FIX OUT OF SYNC SEQUENCES (ROBUST VERSION)
-- This script dynamically finds the correct sequence name for each table and resets it.

-- 1. Fix Job Titles
SELECT setval(pg_get_serial_sequence('job_titles', 'id'), COALESCE((SELECT MAX(id) FROM job_titles) + 1, 1), false);

-- 2. Fix Restaurant Staff
SELECT setval(pg_get_serial_sequence('restaurant_staff', 'id'), COALESCE((SELECT MAX(id) FROM restaurant_staff) + 1, 1), false);

-- 3. Fix Ingredients
SELECT setval(pg_get_serial_sequence('ingredients', 'id'), COALESCE((SELECT MAX(id) FROM ingredients) + 1, 1), false);

-- 4. Fix Products
SELECT setval(pg_get_serial_sequence('products', 'id'), COALESCE((SELECT MAX(id) FROM products) + 1, 1), false);

-- 5. Fix Suppliers
SELECT setval(pg_get_serial_sequence('suppliers', 'id'), COALESCE((SELECT MAX(id) FROM suppliers) + 1, 1), false);

-- 6. Fix Categories
SELECT setval(pg_get_serial_sequence('categories', 'id'), COALESCE((SELECT MAX(id) FROM categories) + 1, 1), false);

-- 7. Fix Restaurant Tables
SELECT setval(pg_get_serial_sequence('restaurant_tables', 'id'), COALESCE((SELECT MAX(id) FROM restaurant_tables) + 1, 1), false);
