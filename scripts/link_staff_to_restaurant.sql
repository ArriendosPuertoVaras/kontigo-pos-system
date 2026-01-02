-- MANUAL PROFILE LINKER (V2 - Búsqueda por Nombre)
-- Use this if the Nexus diagnostic says "Perfil vinculado a otro restaurante".

-- REEMPLAZA ESTOS VALORES
DO $$ 
DECLARE 
    target_user_email TEXT := 'manager@kontigo.cl'; -- Cambia por tu email
    target_restaurant_name TEXT := 'Malas Juntas'; -- Cambia por el nombre de tu restaurante (ej: 'Malas Juntas')
    found_restaurant_id UUID;
    user_id UUID;
BEGIN
    -- 1. Buscar el restaurant por nombre (ignora mayúsculas/minúsculas)
    SELECT id INTO found_restaurant_id 
    FROM public.restaurants 
    WHERE name ILIKE '%' || target_restaurant_name || '%' 
    LIMIT 1;
    
    -- 2. Buscar el ID de usuario basado en su email
    SELECT id INTO user_id FROM auth.users WHERE email = target_user_email;
    
    IF found_restaurant_id IS NULL THEN
        RAISE NOTICE '❌ ERROR: No encontré ningún restaurante con el nombre "%"', target_restaurant_name;
        RAISE NOTICE 'Tip: Asegúrate de que el nombre esté bien escrito o búscalo en la tabla restaurants.';
    ELSIF user_id IS NULL THEN
        RAISE NOTICE '❌ ERROR: No existe ningún usuario con el email "%"', target_user_email;
    ELSE
        -- 3. Vincular el perfil local con la nube
        INSERT INTO public.profiles (id, restaurant_id, role, name)
        VALUES (user_id, found_restaurant_id, 'gerente', 'Admin')
        ON CONFLICT (id) DO UPDATE 
        SET restaurant_id = EXCLUDED.restaurant_id;
        
        RAISE NOTICE '✅ ÉXITO: Tu perfil (%) ahora está vinculado al restaurante "%" (ID: %)', target_user_email, target_restaurant_name, found_restaurant_id;
        RAISE NOTICE 'Ahora haz un Hard Refresh en el POS y el Nexus pasará a Azul.';
    END IF;
END $$;
