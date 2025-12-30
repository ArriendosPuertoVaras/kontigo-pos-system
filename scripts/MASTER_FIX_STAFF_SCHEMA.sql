-- MASTER FIX: CORRECT STAFF SCHEMA & SYNC
-- Objetivo: Reemplazar la tabla 'restaurant_staff' (UUID) por una versión correcta (BIGINT)
-- para que coincida con production_logs, shifts y el POS Local.

BEGIN;

-- 1. DESCONECTAR TABLAS DEPENDIENTES (Romper vínculos temporalmente)
-- Quitamos las reglas que dicen "No borres staff si tiene turnos" para poder arreglar el staff.
ALTER TABLE IF EXISTS public.shifts DROP CONSTRAINT IF EXISTS shifts_staff_id_fkey;
ALTER TABLE IF EXISTS public.orders DROP CONSTRAINT IF EXISTS orders_staff_id_fkey;
ALTER TABLE IF EXISTS public.cash_counts DROP CONSTRAINT IF EXISTS cash_counts_staff_id_fkey;
ALTER TABLE IF EXISTS public.production_logs DROP CONSTRAINT IF EXISTS production_logs_staff_id_fkey;
ALTER TABLE IF EXISTS public.salary_settlements DROP CONSTRAINT IF EXISTS salary_settlements_staff_id_fkey;

-- 2. ELIMINAR TABLA INCORRECTA
-- Borramos la tabla que tiene IDs tipo UUID (Texto largo irreconocible por el POS)
DROP TABLE IF EXISTS public.restaurant_staff CASCADE;

-- 3. CREAR TABLA CORRECTA (Idéntica al POS Local)
CREATE TABLE public.restaurant_staff (
    id bigint primary key,   -- CORRECCIÓN: Ahora es NUMÉRICO (1, 2, 3...)
    restaurant_id uuid not null, 
    name text not null,
    
    -- Autenticación Correcta
    pin text,                -- CORRECCIÓN: Agregamos el PIN
    email text,
    role text,               -- 'admin', 'manager'
    role_name text,          -- 'Cocinero', 'Garzón'
    status text default 'active',
    active boolean default true, -- Para compatibilidad
    
    -- Datos RRHH
    rut text,
    address text,
    phone text,
    nationality text,
    birth_date timestamp with time zone,
    
    -- Contrato
    contract_type text,      
    contract_duration text,
    start_date timestamp with time zone,
    weekly_hours_limit integer, -- CORRECCIÓN DE NOMBRE
    
    -- Remuneraciones
    salary_type text,
    base_salary numeric,
    hourly_rate numeric,     
    gratification boolean default true,
    colacion numeric default 0,
    movilizacion numeric default 0,
    estimated_tips numeric default 0,
    
    -- Previsión
    afp text,
    health_system text,
    health_fee numeric,
    seguro_cesantia boolean default true,
    
    -- Otros
    avatar_color text,
    bank_details jsonb,
    
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. HABILITAR SEGURIDAD (RLS)
ALTER TABLE public.restaurant_staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for all users" ON public.restaurant_staff FOR ALL USING (true) WITH CHECK (true);

-- 5. REPARAR Y RECONECTAR TABLAS HIJAS

-- A. SHIFTS (Turnos)
-- Tu imagen muestra que shifts ya usa BIGINT. Perfecto. Solo reconectamos.
ALTER TABLE public.shifts 
    ADD CONSTRAINT shifts_staff_id_fkey 
    FOREIGN KEY (staff_id) REFERENCES public.restaurant_staff(id) ON DELETE CASCADE;

-- B. PRODUCTION_LOGS (Tu imagen muestra BIGINT. Perfecto.)
ALTER TABLE public.production_logs 
    ADD CONSTRAINT production_logs_staff_id_fkey 
    FOREIGN KEY (staff_id) REFERENCES public.restaurant_staff(id) ON DELETE SET NULL;

-- C. ORDERS (Ventas)
ALTER TABLE public.orders ALTER COLUMN staff_id TYPE bigint USING staff_id::bigint;
ALTER TABLE public.orders 
    ADD CONSTRAINT orders_staff_id_fkey 
    FOREIGN KEY (staff_id) REFERENCES public.restaurant_staff(id) ON DELETE SET NULL;

-- D. CASH_COUNTS (Caja)
ALTER TABLE public.cash_counts ALTER COLUMN staff_id TYPE bigint USING staff_id::bigint;
ALTER TABLE public.cash_counts 
    ADD CONSTRAINT cash_counts_staff_id_fkey 
    FOREIGN KEY (staff_id) REFERENCES public.restaurant_staff(id) ON DELETE SET NULL;

COMMIT;
