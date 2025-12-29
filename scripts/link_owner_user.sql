DO $$
DECLARE
    target_email TEXT := 'ricardoperaltavargas@gmail.com'; -- EMAIL CONFIRMADO DEL USUARIO
    new_user_id UUID;
    restaurant_id UUID;
BEGIN
    -- 1. Buscar el ID del Usuario recién creado en Supabase Auth
    SELECT id INTO new_user_id FROM auth.users WHERE email = target_email;

    -- 2. Buscar el ID del Restaurante 'Malas Juntas'
    SELECT id INTO restaurant_id FROM public.restaurants WHERE name LIKE 'Malas Juntas%' LIMIT 1;

    IF new_user_id IS NULL THEN
        RAISE EXCEPTION 'No se encontró el usuario %. Asegúrate de haberlo creado en la pestaña Authentication primero.', target_email;
    END IF;

    IF restaurant_id IS NULL THEN
        RAISE EXCEPTION 'No se encontró el restaurante Malas Juntas.';
    END IF;

    -- 3. Crear el Vínculo Oficial
    INSERT INTO public.restaurant_staff (restaurant_id, user_id, role)
    VALUES (restaurant_id, new_user_id, 'owner')
    ON CONFLICT (restaurant_id, user_id) DO NOTHING;

    RAISE NOTICE '¡Vínculo Exitoso! El usuario % ahora es dueño de Malas Juntas.', target_email;
END $$;
