-- EMERGENCY SQL SCRIPT: RESTORE EMPANADA INGREDIENTS (FIXED KEYS)
-- Run this in the Supabase SQL Editor

DO $$
DECLARE
    target_product_name TEXT := 'Empanaditas de Prieta con Manzana y Nuez';
    prod_record RECORD;
    recipe_json JSONB;
    recipe_item JSONB;
    r_id UUID;
    
    -- Arrays to hold our Restoration Data (Ordered exactly as in the screenshot/recipe)
    names TEXT[] := ARRAY[
        'Harina sin Polvos', 'Manteca de Cerdo', 'Salmuera', 'Vino Blanco', 
        'Prieta', 'Cebolla', 'Manzana Verde', 'Nueces', 
        'Orégano', 'Comino', 'Ají Color', 'Aceite vegetal', 
        'Huevo', 'Leche entera'
    ];
    
    units TEXT[] := ARRAY['kg', 'kg', 'ml', 'ml', 'kg', 'kg', 'kg', 'kg', 'kg', 'kg', 'kg', 'l', 'un', 'l'];
    costs NUMERIC[] := ARRAY[700, 2900, 0, 1700, 4600, 1200, 1350, 10000, 7500, 6600, 6600, 1200, 180, 900];
    stocks NUMERIC[] := ARRAY[25, 2, 9999, 5, 5, 10, 18, 1, 1, 1, 1, 5, 30, 12];
    categories TEXT[] := ARRAY[
        'GENERAL', 'GENERAL', 'OTROS', 'BEBIDAS Y LICORES', 'CARNES Y CECINAS', 
        'FRUTAS Y VERDURAS', 'FRUTAS Y VERDURAS', 'GENERAL', 'GENERAL', 'GENERAL', 'GENERAL', 'GENERAL',
        'LACTEOS Y HUEVOS', 'LACTEOS Y HUEVOS'
    ];
    storages TEXT[] := ARRAY[
        'Bodega Seca', 'Bodega Seca', 'Fresco', 'Bodega Seca',
        'Refrigerado', 'Bodega Seca', 'Refrigerado', 'Bodega Seca',
        'Bodega Seca', 'Bodega Seca', 'Bodega Seca', 'Bodega Seca',
        'Bodega Seca', 'Bodega Seca'
    ];

    i INT := 1;
    target_ing_id BIGINT;
    
BEGIN
    -- 1. Get the Product
    SELECT * INTO prod_record FROM public.products WHERE name ILIKE target_product_name || '%' LIMIT 1;
    
    IF prod_record.id IS NULL THEN RAISE EXCEPTION 'Product % not found.', target_product_name; END IF;

    r_id := prod_record.restaurant_id;
    recipe_json := prod_record.recipe;

    RAISE NOTICE 'Found Product: %', prod_record.name;

    -- 2. Loop through JSON
    FOR recipe_item IN SELECT * FROM jsonb_array_elements(recipe_json)
    LOOP
        -- FIX: Use 'ingredient_id' (snake_case) or 'ingredientId' (camelCase) just in case
        target_ing_id := COALESCE(
            (recipe_item->>'ingredient_id')::BIGINT, 
            (recipe_item->>'ingredientId')::BIGINT
        );
        
        IF target_ing_id IS NULL THEN
            RAISE NOTICE 'Skipping item with NULL ID in JSON: %', recipe_item;
            CONTINUE;
        END IF;

        IF i > array_length(names, 1) THEN EXIT; END IF;

        RAISE NOTICE 'Restoring ID % -> %', target_ing_id, names[i];

        INSERT INTO public.ingredients (
            id, name, unit, cost, stock, category, family, storage, min_stock, restaurant_id, created_at
        ) VALUES (
            target_ing_id, names[i], units[i], costs[i], stocks[i], categories[i], categories[i], 
            storages[i], 5, r_id, NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name, cost = EXCLUDED.cost, stock = EXCLUDED.stock, 
            unit = EXCLUDED.unit, category = EXCLUDED.category, 
            storage = EXCLUDED.storage, restaurant_id = EXCLUDED.restaurant_id;

        i := i + 1;
    END LOOP;
    
    RAISE NOTICE '✅ DONE. % Ingredients restored.', i-1;
END $$;
