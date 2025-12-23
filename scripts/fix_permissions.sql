-- Enable RLS (already enabled, but good to be sure)
ALTER TABLE public.salary_settlements ENABLE ROW LEVEL SECURITY;

-- Allow anonymous access (since the local app might not be using Auth)
-- This allows ANYONE with the API key to insert/update/select.
-- Ideally, you'd use authentication, but for this dev stage and local use:

-- Drop existing restricted policies if any
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.salary_settlements;
DROP POLICY IF EXISTS "Allow public access" ON public.salary_settlements;

-- Create permissive policy for public/anon
CREATE POLICY "Allow public access"
ON public.salary_settlements
FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- Ensure the ID sequence is synced if manual inserts caused issues (optional but safe)
SELECT setval('salary_settlements_id_seq', (SELECT MAX(id) FROM salary_settlements));
