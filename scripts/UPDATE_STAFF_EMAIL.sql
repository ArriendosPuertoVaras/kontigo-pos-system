-- ASEGURAR CAMPO EMAIL EN STAFF PARA LOGIN
-- Este script es seguro de correr múltiples veces.

DO $$
BEGIN
    -- 1. Agregar columna email si no existe
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'staff' 
        AND column_name = 'email'
    ) THEN
        ALTER TABLE public.staff ADD COLUMN email TEXT;
        RAISE NOTICE '✅ Columna email agregada a tabla staff';
    ELSE
        RAISE NOTICE 'ℹ️ Columna email ya existía en tabla staff';
    END IF;

    -- 2. Crear índice para búsquedas rápidas por email
    CREATE INDEX IF NOT EXISTS idx_staff_email ON public.staff(email);

END $$;
