-- CATEGORY TABLE
create table if not exists public.category (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text
);

-- PRODUCT TABLE (base product info)
create table public.product (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text references public.category(name) on delete set null default null,
  is_visible boolean not null default true,    
  image_url text default null,
  last_updated timestamp NOT NULL DEFAULT now(), 
  updated_by uuid REFERENCES auth.users(id)
);

-- PRODUCT VARIANTS TABLE (handles weight, pieces, flavor, etc.)
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.product(id) on delete cascade,
  sku text not null unique,
  variant_type text check (variant_type IN ('weight', 'pcs', 'price', 'flavor', 'size')) not null,
  variant_value text not null,           -- e.g., '250g', '12pcs', 'Small Pack'
  price int not null default 0,          -- price per variant
  quantity integer not null default 0,   -- stock level
  last_updated timestamp not null default now(),
  updated_by uuid references auth.users(id),
  constraint unique_variant_per_product
  unique (product_id, variant_type, variant_value)
);

-- ADMIN USERS TABLE
create table if not exists public.admin_users (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  constraint admin_users_pkey primary key (id),
  constraint admin_users_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete cascade
) tablespace pg_default;

-- TRIGGER FUNCTION TO UPDATE TIMESTAMP ON VARIANTS
create or replace function public.update_last_updated()
returns trigger
as $$
begin
  new.last_updated = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_update_last_updated_variant
before update on public.product_variants
for each row
execute function public.update_last_updated();

-- FUNCTION TO CHECK IF USER IS ADMIN
create or replace function public.is_admin()
returns boolean
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$ language sql security definer;

-- ENABLE RLS (Row-Level Security)
alter table public.category enable row level security;
alter table public.product enable row level security;
alter table public.product_variants enable row level security;
alter table public.admin_users enable row level security;

-- POLICIES

-- PRODUCT
create policy "Admins can manage product"
on public.product
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Users can view product"
on public.product
for select
using (true);

-- PRODUCT VARIANTS
create policy "Admins can manage product variants"
on public.product_variants
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Users can view product variants"
on public.product_variants
for select
using (true);

-- ADMIN USERS
create policy "Admins can view admin_users"
on public.admin_users
for select
using (public.is_admin());

create policy "Admins can manage admin_users"
on public.admin_users
for all
using (public.is_admin())
with check (public.is_admin());

-- CATEGORY
create policy "Admins can manage category"
on public.category
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Users can view category"
on public.category
for select
using (true);

-- TRIGGER: Nullify Empty Category
create or replace function public.nullify_empty_category_name()
returns trigger
as $$
begin
  if new.category = '' then
    new.category := null;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_nullify_empty_category_name
before insert or update on public.product
for each row
execute function public.nullify_empty_category_name();

CREATE OR REPLACE FUNCTION public.update_product_last_updated()
RETURNS trigger AS $$
BEGIN
  NEW.last_updated = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_product_last_updated
BEFORE UPDATE ON public.product
FOR EACH ROW
EXECUTE FUNCTION public.update_product_last_updated();

-- STORE STATUS TABLE
create table if not exists public.store_status (
  id uuid primary key default gen_random_uuid(),
  is_open boolean not null default true,
  updated_at timestamp with time zone default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- ENABLE RLS (Row-Level Security)
alter table public.store_status enable row level security;

-- POLICIES

-- Users can view store status
create policy "Users can view store status"
on public.store_status
for select
using (true);

-- Admins can manage store status
create policy "Admins can manage store status"
on public.store_status
for all
using (public.is_admin())
with check (public.is_admin());

CREATE SEQUENCE public.sku_sequence
START 1
INCREMENT 1
NO MINVALUE
NO MAXVALUE
CACHE 1;
CREATE OR REPLACE FUNCTION public.generate_sku()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  next_val bigint;
BEGIN
  next_val := nextval('public.sku_sequence');
  RETURN 'SF-' || lpad(next_val::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.create_default_variant()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.product_variants (
    product_id,
    sku,
    variant_type,
    variant_value,
    price,
    quantity,
    updated_by
  )
  VALUES (
    NEW.id,
    public.generate_sku(),
    'pcs',
    'default',
    0,
    0,
    NEW.updated_by
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE TRIGGER trg_create_default_variant
AFTER INSERT ON public.product
FOR EACH ROW
EXECUTE FUNCTION public.create_default_variant();

CREATE OR REPLACE FUNCTION public.prevent_last_variant_delete()
RETURNS trigger AS $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM public.product_variants
    WHERE product_id = OLD.product_id
  ) <= 1 THEN
    RAISE EXCEPTION 'A product must have at least one variant';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_last_variant_delete
BEFORE DELETE ON public.product_variants
FOR EACH ROW
EXECUTE FUNCTION public.prevent_last_variant_delete();

CREATE INDEX idx_product_variants_product_id
ON public.product_variants(product_id);
