-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. RESTAURANTS (Tenants)
create table restaurants (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  commerce_code text not null unique, -- "KONTIGO-STGO"
  owner_email text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  active boolean default true
);

-- 2. RESTAURANT_STAFF (The "Cloud" version of Staff)
create table restaurant_staff (
  id uuid default uuid_generate_v4() primary key,
  restaurant_id uuid references restaurants(id) on delete cascade not null,
  name text not null,
  email text, -- Optional for waiters
  pin text,   -- 4-digit PIN for local access
  role_name text not null, -- "Garzón", "Admin" (Syncs from JobTitle)
  role_permissions jsonb default '[]'::jsonb, -- ['pos:view', 'kds:view']
  active boolean default true,
  
  -- EXTENDED PAYROLL FIELDS (Sync Support)
  avatar_color text,
  phone text,
  address text,
  rut text,
  nationality text,
  birth_date timestamp,
  status text default 'active', -- 'active' | 'inactive'
  
  -- Contract
  contract_type text, -- '40-hours', '44-hours', etc.
  contract_duration text, -- 'indefinite', 'fixed'
  start_date timestamp,
  weekly_hours_limit integer,
  active_role text, -- Current active shift role
  
  -- Financial
  salary_type text, -- 'monthly' | 'hourly'
  base_salary numeric,
  gratification boolean default true,
  colacion numeric default 0,
  movilizacion numeric default 0,
  estimated_tips numeric default 0,
  
  -- Social Security
  afp text,
  health_system text, -- 'Fonasa', 'Isapre'
  health_fee numeric, -- Isapre UF
  seguro_cesantia boolean default true,
  bank_details jsonb, -- { bank, accountType, accountNumber }

  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- MIGRATION SCRIPT (For existing tables)
-- Copia y pega esto en el SQL Editor de Supabase si ya creaste la tabla antes
/*
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS avatar_color text;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS rut text;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS nationality text;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS birth_date timestamp;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS status text default 'active';
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS contract_type text;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS contract_duration text;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS start_date timestamp;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS weekly_hours_limit integer;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS active_role text;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS salary_type text;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS base_salary numeric;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS gratification boolean default true;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS colacion numeric default 0;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS movilizacion numeric default 0;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS estimated_tips numeric default 0;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS afp text;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS health_system text;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS health_fee numeric;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS seguro_cesantia boolean default true;
ALTER TABLE restaurant_staff ADD COLUMN IF NOT EXISTS bank_details jsonb;
*/

-- 3. PROFILES (Users who can login via Google/Email)
-- This extends the auth.users table
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  restaurant_id uuid references restaurants(id),
  role text default 'manager',
  name text
);

-- RLS POLICIES (Safety First!)
alter table restaurants enable row level security;
alter table restaurant_staff enable row level security;
alter table profiles enable row level security;

-- Policy: Users can only see their own restaurant
create policy "Users can see own restaurant" on restaurants
  for select using (auth.uid() in (select id from profiles where restaurant_id = restaurants.id));

-- Policy: Users can only see staff from their restaurant
create policy "Users can see own staff" on restaurant_staff
  for all using (restaurant_id in (select restaurant_id from profiles where id = auth.uid()));

-- Policy: Profiles can see themselves
create policy "Users can see own profile" on profiles
  for select using (auth.uid() = id);

-- INDEXES
create index idx_restaurant_staff_restaurant_id on restaurant_staff(restaurant_id);
create index idx_restaurants_commerce_code on restaurants(commerce_code);
