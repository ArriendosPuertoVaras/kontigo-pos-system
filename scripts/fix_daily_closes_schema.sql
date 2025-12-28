-- FIX: Add ALL potentially missing columns to daily_closes
ALTER TABLE public.daily_closes 
ADD COLUMN IF NOT EXISTS cash_difference numeric default 0;

ALTER TABLE public.daily_closes 
ADD COLUMN IF NOT EXISTS dte_count integer default 0;

ALTER TABLE public.daily_closes 
ADD COLUMN IF NOT EXISTS opening_cash numeric default 0;

ALTER TABLE public.daily_closes 
ADD COLUMN IF NOT EXISTS start_time timestamp with time zone;

-- Ensure RLS is enabled
ALTER TABLE public.daily_closes ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT ALL ON TABLE public.daily_closes TO authenticated;
GRANT ALL ON TABLE public.daily_closes TO service_role;
GRANT ALL ON TABLE public.daily_closes TO anon;
