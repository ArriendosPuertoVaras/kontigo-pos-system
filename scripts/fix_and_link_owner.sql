-- PASO INTEGRAL: CORREGIR TABLA Y VINCULAR
-- 1. Si la tabla existe pero está "mail", la borramos para recrearla bien.
-- (Asumimos que no hay datos valiosos ahí porque recién estás configurando esto)
DROP TABLE IF EXISTS public.restaurant_staff;

-- 2. Crear la tabla con la estructura CORRECTA
CREATE TABLE public.restaurant_staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- La columna que faltaba
    role TEXT DEFAULT 'owner',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(restaurant_id, user_id)
);

-- 3. Vincular tu Usuario Oficial con Malas Juntas
DO $$
DECLARE
    target_email TEXT := 'ricardoperaltavargas@gmail.com';
    new_user_id UUID;
    restaurant_id UUID;
BEGIN
    -- Buscar IDs
    SELECT id INTO new_user_id FROM auth.users WHERE email = target_email;
    SELECT id INTO restaurant_id FROM public.restaurants WHERE name LIKE 'Malas Juntas%' LIMIT 1;

    -- Validar
    IF new_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no encontrado: %', target_email;
    END IF;
    IF restaurant_id IS NULL THEN
        RAISE EXCEPTION 'Restaurante Malas Juntas no encontrado.';
    END IF;

    -- Insertar
    INSERT INTO public.restaurant_staff (restaurant_id, user_id, role)
    VALUES (restaurant_id, new_user_id, 'owner')
    ON CONFLICT (restaurant_id, user_id) DO NOTHING;

    RAISE NOTICE '¡CORRECCION EXITOSA! Tabla arreglada y usuario vinculado.';
END $$;
