-- Check if columns exist and return data for a sample user
SELECT 
    id, 
    name, 
    email,
    -- Check for critical payroll columns. If these fail, the columns don't exist.
    base_salary,
    afp,
    health_system,
    bank_details
FROM public.restaurant_staff
LIMIT 5;
