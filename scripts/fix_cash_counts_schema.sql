-- FIX: Add missing 'details' column to cash_counts
ALTER TABLE public.cash_counts 
ADD COLUMN IF NOT EXISTS details jsonb default '[]'::jsonb;

-- FIX: Ensure RLS policies exist
ALTER TABLE public.cash_counts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for cash_counts" ON public.cash_counts;
CREATE POLICY "Enable all access for cash_counts" ON public.cash_counts FOR ALL USING (true) WITH CHECK (true);

-- Grant permissions just in case
GRANT ALL ON TABLE public.cash_counts TO authenticated;
GRANT ALL ON TABLE public.cash_counts TO service_role;
GRANT ALL ON TABLE public.cash_counts TO anon;
