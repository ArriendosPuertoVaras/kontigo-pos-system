-- Try to insert a dummy record to verify permissions are OPEN
INSERT INTO public.salary_settlements (
    staff_id, 
    period_month, 
    period_year, 
    base_salary, 
    gratification, 
    total_imponible, 
    total_descuentos, 
    total_haberes, 
    liquid_salary, 
    finalized
) VALUES (
    1, -- Assuming staff_id 1 exists, if not this might fail on constraint. 
       -- If it fails on foreign key, we know permissions worked!
    12, 
    2025, 
    500000, 
    0, 
    500000, 
    50000, 
    500000, 
    450000, 
    true
);
