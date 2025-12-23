-- 1. ADD UNIQUE CONSTRAINT (Crucial for UPSERT to work and not 409)
-- We wrap in a block to avoid errors if it already partially exists or names differ
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salary_settlements_unique_period') THEN
        ALTER TABLE public.salary_settlements 
        ADD CONSTRAINT salary_settlements_unique_period 
        UNIQUE (staff_id, period_month, period_year);
    END IF;
END $$;

-- 2. ENSURE RLS & PERMISSIONS ARE WIDE OPEN (For Dev)
ALTER TABLE public.salary_settlements ENABLE ROW LEVEL SECURITY;

-- Drop verify policies to allow clean recreation
DROP POLICY IF EXISTS "Enable all access for anon" ON public.salary_settlements;
DROP POLICY IF EXISTS "Enable all access for authenticated" ON public.salary_settlements;

-- Re-create permissive policies
CREATE POLICY "Enable all access for anon" ON public.salary_settlements
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Enable all access for authenticated" ON public.salary_settlements
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

GRANT ALL ON public.salary_settlements TO anon;
GRANT ALL ON public.salary_settlements TO authenticated;
GRANT ALL ON public.salary_settlements TO service_role;
