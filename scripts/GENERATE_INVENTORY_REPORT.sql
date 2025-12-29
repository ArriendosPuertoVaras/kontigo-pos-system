-- 📊 INVENTORY HEALTH REPORT
-- Run this script in Supabase SQL Editor AFTER you have clicked "Restaurar" in the App.
-- It will show you exactly what is saved in the Cloud.

SELECT 
    COUNT(*) as "Total Ingredientes",
    SUM(CASE WHEN family IS NULL THEN 1 ELSE 0 END) as "Sin Categoría",
    SUM(CASE WHEN storage IS NULL THEN 1 ELSE 0 END) as "Sin Almacenaje"
FROM ingredients;

-- DETAILED LIST
SELECT 
    name as "Nombre", 
    stock as "Stock", 
    unit as "Unid.",
    cost as "Costo ($)", 
    family as "Familia", 
    storage as "Almacenaje",
    CASE 
        WHEN created_at IS NOT NULL THEN to_char(created_at, 'HH24:MI:SS') 
        ELSE 'Recién Creado' 
    END as "Última Carga"
FROM ingredients
ORDER BY name ASC;
