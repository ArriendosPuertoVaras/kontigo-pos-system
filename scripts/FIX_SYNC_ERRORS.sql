-- 1. Fix 'pin' column error in 'restaurant_staff'
ALTER TABLE IF EXISTS public.restaurant_staff 
ADD COLUMN IF NOT EXISTS pin text;

-- 2. Fix 'production_logs' foreign key to allow product deletion (Cascade)
-- First drop the existing constraint
ALTER TABLE IF EXISTS public.production_logs 
DROP CONSTRAINT IF EXISTS production_logs_product_id_fkey;

-- Re-add with ON DELETE CASCADE
ALTER TABLE IF EXISTS public.production_logs 
ADD CONSTRAINT production_logs_product_id_fkey 
FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

-- 3. Fix 'production_logs' staff reference just in case (optional but good practice)
ALTER TABLE IF EXISTS public.production_logs 
DROP CONSTRAINT IF EXISTS production_logs_staff_id_fkey;

ALTER TABLE IF EXISTS public.production_logs 
ADD CONSTRAINT production_logs_staff_id_fkey 
FOREIGN KEY (staff_id) REFERENCES public.restaurant_staff(id) ON DELETE SET NULL;
