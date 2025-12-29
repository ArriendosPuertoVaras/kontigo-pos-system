-- PASO FUERZA BRUTA: CASCADE
-- El error ocurría porque otras tablas (turnos, ordenes) estaban "atadas" a esta tabla mal formada.
-- Al usar CASCADE, cortamos esas cuerdas viejas para poder reconstruir.

-- 1. Borrar tabla antigua FORZANDO (CASCADE)
DROP TABLE IF EXISTS public.restaurant_staff CASCADE;

-- 2. Crear tabla nueva con la columna CORRECTA (user_id)
CREATE TABLE public.restaurant_staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'owner',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(restaurant_id, user_id)
);

-- 3. Vincular tu usuario (ricardoperaltavargas@gmail.com)
DO $$
DECLARE
    target_email TEXT := 'ricardoperaltavargas@gmail.com';
    my_user_id UUID;
    my_rest_id UUID;
BEGIN
    SELECT id INTO my_user_id FROM auth.users WHERE email = target_email;
    SELECT id INTO my_rest_id FROM public.restaurants WHERE name LIKE 'Malas Juntas%' LIMIT 1;

    IF my_user_id IS NOT NULL AND my_rest_id IS NOT NULL THEN
        INSERT INTO public.restaurant_staff (restaurant_id, user_id, role)
        VALUES (my_rest_id, my_user_id, 'owner');
        RAISE NOTICE '¡EXITO TOTAL! Tabla reconstruida y usuario vinculado.';
    ELSE
        RAISE EXCEPTION 'Error: No encontre el usuario o el restaurante.';
    END IF;
END $$;
