-- SCRIPT DE ACTUALIZACIÓN DE ESQUEMA (NUEVO PROYECTO)
-- Ejecutar esto en el SQL Editor de Supabase (iahez...)

-- 1. CATEGORIES
ALTER TABLE IF EXISTS public.categories ADD COLUMN IF NOT EXISTS sort_order integer default 0;
ALTER TABLE IF EXISTS public.categories ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE IF EXISTS public.categories ADD COLUMN IF NOT EXISTS created_at timestamp with time zone default now();
ALTER TABLE IF EXISTS public.categories ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone;

-- 2. PRODUCTS
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS recipe jsonb;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS category_id bigint references public.categories(id);
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS price numeric default 0;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS cost numeric default 0;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS stock numeric default 0;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS active boolean default true;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS restaurant_id uuid references public.restaurants(id);
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS created_at timestamp with time zone default now();
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone;

-- 3. INGREDIENTS
ALTER TABLE IF EXISTS public.ingredients ADD COLUMN IF NOT EXISTS family text;
ALTER TABLE IF EXISTS public.ingredients ADD COLUMN IF NOT EXISTS sub_family text;
ALTER TABLE IF EXISTS public.ingredients ADD COLUMN IF NOT EXISTS storage text;
ALTER TABLE IF EXISTS public.ingredients ADD COLUMN IF NOT EXISTS cost numeric default 0;
ALTER TABLE IF EXISTS public.ingredients ADD COLUMN IF NOT EXISTS stock numeric default 0;
ALTER TABLE IF EXISTS public.ingredients ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE IF EXISTS public.ingredients ADD COLUMN IF NOT EXISTS restaurant_id uuid references public.restaurants(id);
ALTER TABLE IF EXISTS public.ingredients ADD COLUMN IF NOT EXISTS supplier_id bigint;
ALTER TABLE IF EXISTS public.ingredients ADD COLUMN IF NOT EXISTS created_at timestamp with time zone default now();
ALTER TABLE IF EXISTS public.ingredients ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone;
ALTER TABLE IF EXISTS public.ingredients ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

-- 4. SUPPLIERS
ALTER TABLE IF EXISTS public.suppliers ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE IF EXISTS public.suppliers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE IF EXISTS public.suppliers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE IF EXISTS public.suppliers ADD COLUMN IF NOT EXISTS restaurant_id uuid references public.restaurants(id);
