-- =============================================
-- MASTER FIX SCHEMA SCRIPT (Run this in Supabase SQL Editor)
-- =============================================
-- This script safely adds all potentially missing columns to your Cloud Database
-- to match your Local App. It is safe to run multiple times.

-- 1. FIX: CASH COUNTS (Arqueos)
-- ---------------------------------------------
ALTER TABLE public.cash_counts 
ADD COLUMN IF NOT EXISTS details jsonb default '[]'::jsonb;

ALTER TABLE public.cash_counts 
ADD COLUMN IF NOT EXISTS notes text;

-- 2. FIX: DAILY CLOSES (Cierre Z)
-- ---------------------------------------------
ALTER TABLE public.daily_closes 
ADD COLUMN IF NOT EXISTS start_time timestamp with time zone;

ALTER TABLE public.daily_closes 
ADD COLUMN IF NOT EXISTS opening_cash numeric default 0;

ALTER TABLE public.daily_closes 
ADD COLUMN IF NOT EXISTS cash_difference numeric default 0;

ALTER TABLE public.daily_closes 
ADD COLUMN IF NOT EXISTS dte_count integer default 0;

ALTER TABLE public.daily_closes 
ADD COLUMN IF NOT EXISTS total_tips numeric default 0;

ALTER TABLE public.daily_closes 
ADD COLUMN IF NOT EXISTS total_cash numeric default 0;

ALTER TABLE public.daily_closes 
ADD COLUMN IF NOT EXISTS total_card numeric default 0;

ALTER TABLE public.daily_closes 
ADD COLUMN IF NOT EXISTS total_online numeric default 0;

ALTER TABLE public.daily_closes 
ADD COLUMN IF NOT EXISTS status text default 'closed';

ALTER TABLE public.daily_closes 
ADD COLUMN IF NOT EXISTS closed_by text;

-- 3. FIX: SHIFTS (Turnos)
-- ---------------------------------------------
ALTER TABLE public.shifts 
ADD COLUMN IF NOT EXISTS scheduled_start timestamp with time zone;

ALTER TABLE public.shifts 
ADD COLUMN IF NOT EXISTS scheduled_end timestamp with time zone;

ALTER TABLE public.shifts 
ADD COLUMN IF NOT EXISTS is_overtime boolean default false;

ALTER TABLE public.shifts 
ADD COLUMN IF NOT EXISTS manager_approval text default 'pending';

ALTER TABLE public.shifts 
ADD COLUMN IF NOT EXISTS auto_clock_out boolean default false;

-- 4. FIX: PERMISSIONS & POLICIES (Safety Net)
-- ---------------------------------------------
ALTER TABLE public.cash_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_closes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- Reset Policies to Public (for development ease/robustness)
DROP POLICY IF EXISTS "Enable all access for cash_counts" ON public.cash_counts;
CREATE POLICY "Enable all access for cash_counts" ON public.cash_counts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for daily_closes" ON public.daily_closes;
CREATE POLICY "Enable all access for daily_closes" ON public.daily_closes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for shifts" ON public.shifts;
CREATE POLICY "Enable all access for shifts" ON public.shifts FOR ALL USING (true) WITH CHECK (true);

-- Grant Access
GRANT ALL ON TABLE public.cash_counts TO authenticated;
GRANT ALL ON TABLE public.cash_counts TO service_role;
GRANT ALL ON TABLE public.cash_counts TO anon;

GRANT ALL ON TABLE public.daily_closes TO authenticated;
GRANT ALL ON TABLE public.daily_closes TO service_role;
GRANT ALL ON TABLE public.daily_closes TO anon;

GRANT ALL ON TABLE public.shifts TO authenticated;
GRANT ALL ON TABLE public.shifts TO service_role;
GRANT ALL ON TABLE public.shifts TO anon;

-- Finish
SELECT '✅ SUCCESS: Database Schema Updated Successfully' as status;
