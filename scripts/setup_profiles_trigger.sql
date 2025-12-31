-- Trigger to automatically create a profile entry when a new user signs up via Supabase Auth.

-- 1. Create the function that handles the insertion
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, role, restaurant_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Nuevo Usuario'),
    coalesce(new.raw_user_meta_data->>'role', 'gerente'), -- Default to gerente if not specified
    (new.raw_user_meta_data->>'restaurant_id')::uuid -- Optional: if restaurant_id is passed in metadata
  );
  return new;
end;
$$;

-- 2. Create the trigger
-- Drop if exists to avoid conflicts during re-runs
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Optional: Backfill for existing users (Run this manually if needed)
-- insert into public.profiles (id, name, role)
-- select id, coalesce(raw_user_meta_data->>'full_name', 'Usuario Existente'), 'gerente'
-- from auth.users
-- where id not in (select id from public.profiles);
