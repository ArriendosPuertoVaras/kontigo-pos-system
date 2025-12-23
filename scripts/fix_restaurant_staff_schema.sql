-- CRITICAL FIX: Recreate restaurant_staff with BIGINT ID to match Local Dexie DB
-- Steps: Drop FKs -> Drop Table -> Recreate Table -> Re-add FKs -> Drop Legacy Staff

-- 1. Drop constraints from dependent tables
ALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS shifts_staff_id_fkey;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_staff_id_fkey;
ALTER TABLE public.cash_counts DROP CONSTRAINT IF EXISTS cash_counts_staff_id_fkey;

-- 2. Drop the incorrect table (UUID version)
DROP TABLE IF EXISTS public.restaurant_staff CASCADE;

-- 3. Recreate restaurant_staff with BIGINT ID (Correct Type)
CREATE TABLE public.restaurant_staff (
    id bigint primary key, -- Explicitly BIGINT to match Dexie (1, 2, 3...)
    restaurant_id uuid references restaurants(id) on delete cascade not null,
    name text not null,
    email text,
    pin text,
    role_name text not null,
    role_permissions jsonb default '[]'::jsonb,
    active boolean default true,
    
    -- Extended Fields
    avatar_color text,
    phone text,
    address text,
    rut text,
    nationality text,
    birth_date timestamp,
    status text default 'active',
    contract_type text,
    contract_duration text,
    start_date timestamp,
    weekly_hours_limit integer,
    active_role text,
    salary_type text,
    base_salary numeric,
    gratification boolean default true,
    colacion numeric default 0,
    movilizacion numeric default 0,
    estimated_tips numeric default 0,
    afp text,
    health_system text,
    health_fee numeric,
    seguro_cesantia boolean default true,
    bank_details jsonb,

    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Enable RLS
ALTER TABLE public.restaurant_staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for all users" ON public.restaurant_staff FOR ALL USING (true) WITH CHECK (true);

-- 5. Re-add Foreign Keys to Dependent Tables (Now pointing to BIGINT)
-- Note: Dependent tables (shifts, orders) must have staff_id as BIGINT.
-- If they were created via sync from Dexie, they should already be correct.
ALTER TABLE public.shifts 
    ADD CONSTRAINT shifts_staff_id_fkey 
    FOREIGN KEY (staff_id) REFERENCES public.restaurant_staff(id);

ALTER TABLE public.orders 
    ADD CONSTRAINT orders_staff_id_fkey 
    FOREIGN KEY (staff_id) REFERENCES public.restaurant_staff(id);

ALTER TABLE public.cash_counts 
    ADD CONSTRAINT cash_counts_staff_id_fkey 
    FOREIGN KEY (staff_id) REFERENCES public.restaurant_staff(id);

-- 6. Drop Legacy Staff Table
DROP TABLE IF EXISTS public.staff;
