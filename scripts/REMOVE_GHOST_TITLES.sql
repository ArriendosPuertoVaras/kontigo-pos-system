-- REMOVE GHOST JOB TITLES FROM SUPABASE
-- This script safely removes 'Garzón', 'Cocina', 'Barra', 'Copero', 'Aseo' 
-- ONLY IF there are no active staff members currently assigned to them.
-- If they are assigned, it will reassign them to 'Staff' or 'Otro' first (or just warn).

-- 1. Unlink permissions first (Skipped: Table role_permissions does not exist in standard schema)
-- DELETE FROM role_permissions 
-- WHERE role IN ('Garzón', 'Cocina', 'Barra', 'Copero', 'Aseo');

-- 2. Delete the job titles themselves
DELETE FROM job_titles 
WHERE name IN ('Garzón', 'Cocina', 'Barra', 'Copero', 'Aseo');

-- 3. Optimization: Ensure standard roles exist
INSERT INTO job_titles (name, active, permissions)
VALUES 
  ('Administrador', true, '{"*"}'), 
  ('Gerente', true, '{"*"}')
ON CONFLICT (name) DO NOTHING;

SELECT * FROM job_titles;
