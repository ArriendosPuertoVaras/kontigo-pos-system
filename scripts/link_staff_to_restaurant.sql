-- MANUAL PROFILE LINKER (V2 - Datos Reales)
-- Use this to fix the Nexus Connection (RLS Profile Mismatch).

-- REEMPLAZA ESTOS VALORES
DO $$ 
DECLARE 
    target_user_email TEXT := 'manager@kontigo.cl'; -- TU EMAIL AQUÍ
    target_restaurant_id UUID := 'e72836f6-edce-462d-a36f-27e0303eae94'; -- ID de "Mi Restaurante Kontigo"
    user_id UUID;
BEGIN
    -- 1. Buscar el ID de usuario basado en su email
    SELECT id INTO user_id FROM auth.users WHERE email = target_user_email;
    
    IF user_id IS NULL THEN
        RAISE NOTICE '❌ ERROR: No existe ningún usuario con el email "%"', target_user_email;
    ELSE
        -- 2. Vincular el perfil local con la nube
        INSERT INTO public.profiles (id, restaurant_id, role, name)
        VALUES (user_id, target_restaurant_id, 'gerente', 'Admin')
        ON CONFLICT (id) DO UPDATE 
        SET restaurant_id = EXCLUDED.restaurant_id;
        
        RAISE NOTICE '✅ ÉXITO: Tu perfil (%) ahora está vinculado al restaurante con ID %', target_user_email, target_restaurant_id;
        RAISE NOTICE 'Ahora haz un Hard Refresh en el POS y el Nexus pasará a Azul.';
    END IF;
END $$;
