-- Agrega la columna 'modifiers' a la tabla 'products' si no existe.
-- Esta columna almacenará el array JSON de grupos de modificadores asignados al producto.

ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS modifiers JSONB DEFAULT '[]'::jsonb;

-- Comentario para documentación
COMMENT ON COLUMN public.products.modifiers IS 'Array JSON con los grupos de modificadores (ej. Punto de Carne) asignados a este producto.';
