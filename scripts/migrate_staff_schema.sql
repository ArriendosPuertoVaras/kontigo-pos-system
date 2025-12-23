-- 1. Drop the old Foreign Key constraints that link to the legacy 'staff' table
ALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS shifts_staff_id_fkey;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_staff_id_fkey;
ALTER TABLE public.cash_counts DROP CONSTRAINT IF EXISTS cash_counts_staff_id_fkey;

-- 2. Add NEW Foreign Key constraints linking to the correct 'restaurant_staff' table
-- This ensures data integrity is maintained with the table we are actually using.
ALTER TABLE public.shifts 
    ADD CONSTRAINT shifts_staff_id_fkey 
    FOREIGN KEY (staff_id) REFERENCES public.restaurant_staff(id);

ALTER TABLE public.orders 
    ADD CONSTRAINT orders_staff_id_fkey 
    FOREIGN KEY (staff_id) REFERENCES public.restaurant_staff(id);

ALTER TABLE public.cash_counts 
    ADD CONSTRAINT cash_counts_staff_id_fkey 
    FOREIGN KEY (staff_id) REFERENCES public.restaurant_staff(id);

-- 3. Now it is safe to drop the legacy 'staff' table
DROP TABLE IF EXISTS public.staff;
