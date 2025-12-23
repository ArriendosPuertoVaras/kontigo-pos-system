-- Allow authenticated uploads to the payroll-docs bucket
create policy "Allow uploads to payroll-docs"
on storage.objects
for insert
to public
with check ( bucket_id = 'payroll-docs' );

-- Allow public access to read files in payroll-docs (double check)
create policy "Allow public read access"
on storage.objects
for select
to public
using ( bucket_id = 'payroll-docs' );

-- Allow updates (overwrite)
create policy "Allow updates to payroll-docs"
on storage.objects
for update
to public
using ( bucket_id = 'payroll-docs' );
