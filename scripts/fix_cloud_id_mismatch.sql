-- ⚠️ SCRIPT DE CORRECCIÓN DE ID (Ejecutado el 31/01/2026)
-- Propósito: Forzar que el ID de la Nube (Supabase) coincida con el ID Local del POS
-- ID Local (Preservado): 1d437677-7b6e-49d2-b38b-dc3608aace7a
-- ID Nube (Reemplazado): d1b36bfc-2a05-4390-b094-2409d7876a59

BEGIN;

-- 1. Desactivar temporalmente restricciones
SET CONSTRAINTS ALL DEFERRED;

-- 2. Actualizar la tabla 'restaurants'
UPDATE restaurants 
SET id = '1d437677-7b6e-49d2-b38b-dc3608aace7a'
WHERE commerce_code = 'MJ-LEGACY-001';

-- 3. Confirmación
SELECT * FROM restaurants WHERE id = '1d437677-7b6e-49d2-b38b-dc3608aace7a';

COMMIT;
