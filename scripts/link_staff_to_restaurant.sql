-- MANUAL PROFILE LINKER
-- Use this if the Nexus diagnostic says "Perfil vinculado a otro restaurante" or "Perfil no encontrado".

-- 1. Get your User ID from Supabase Auth > Users (or the console log)
-- 2. Get your Restaurant ID from logical settings (or the console log)

-- REEMPLAZA ESTOS VALORES
DO $$ 
DECLARE 
    target_user_email TEXT := 'manager@kontigo.cl'; -- Cambia por tu email
    target_restaurant_id UUID := 'TU-RESTAURANT-ID-AQUI'; -- Cambia por tu ID
    user_id UUID;
BEGIN
    SELECT id INTO user_id FROM auth.users WHERE email = target_user_email;
    
    IF user_id IS NULL THEN
        RAISE NOTICE 'Error: Usuario con email % no encontrado', target_user_email;
    ELSE
        INSERT INTO public.profiles (id, restaurant_id, role, name)
        VALUES (user_id, target_restaurant_id, 'gerente', 'Admin')
        ON CONFLICT (id) DO UPDATE 
        SET restaurant_id = EXCLUDED.restaurant_id;
        
        RAISE NOTICE '✅ Perfil de % vinculado correctamente al restaurante %', target_user_email, target_restaurant_id;
    END IF;
END $$;
