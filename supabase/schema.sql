-- ============================================================
-- FinZen · Esquema completo de base de datos (Supabase / Postgres)
-- Ejecuta este archivo en: Supabase Dashboard > SQL Editor > New query
--
-- Es IDEMPOTENTE: puedes ejecutarlo sobre una base vacía o sobre la
-- versión anterior de FinZen; solo agrega lo que falte.
--
-- Incluye: tablas, RLS (aislamiento por usuario), storage (facturas,
-- avatares, respaldos), vistas, funciones de reportes y borrado de cuenta.
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- PERFILES + PREFERENCIAS (se sincronizan entre dispositivos)
-- ============================================================
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  currency     text not null default 'COP',
  created_at   timestamptz not null default now()
);

alter table public.profiles
  add column if not exists avatar_url           text,
  add column if not exists language             text not null default 'es',
  add column if not exists theme                text not null default 'dark',
  add column if not exists auto_logout_minutes  int  not null default 5,
  add column if not exists auto_backup          boolean not null default true,
  add column if not exists backup_frequency     text not null default 'weekly',
  add column if not exists last_backup_at       timestamptz,
  add column if not exists report_notifications boolean not null default true,
  add column if not exists updated_at           timestamptz not null default now();

do $$ begin
  alter table public.profiles add constraint profiles_language_chk check (language in ('es','en'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_theme_chk check (theme in ('dark','light','system'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_backup_chk check (backup_frequency in ('daily','weekly','monthly'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_logout_chk check (auto_logout_minutes between 0 and 1440);
exception when duplicate_object then null; end $$;

-- ============================================================
-- CUENTAS (bancos, efectivo, tarjetas, inversión)
-- ============================================================
create table if not exists public.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name            text not null,
  bank            text,
  type            text not null default 'checking'
                    check (type in ('checking','savings','cash','credit','investment')),
  currency        text not null default 'COP',
  initial_balance numeric(16,2) not null default 0,
  archived        boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists idx_accounts_user on public.accounts(user_id);

-- ============================================================
-- CATEGORÍAS (ingreso / egreso; las "hormiga" se marcan con is_ant)
-- ============================================================
create table if not exists public.categories (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null,
  kind         text not null check (kind in ('income','expense')),
  expense_type text check (expense_type in ('fixed','normal','casual')),
  icon         text,
  color        text,
  created_at   timestamptz not null default now()
);
alter table public.categories
  add column if not exists is_ant   boolean not null default false,
  add column if not exists archived boolean not null default false;
create index if not exists idx_categories_user on public.categories(user_id);

-- ============================================================
-- PAGOS RECURRENTES (arriendo, suscripciones, seguros, créditos…)
-- due_date = próximo vencimiento; al marcar pagado avanza según frequency
-- ============================================================
create table if not exists public.recurring_payments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name              text not null,
  amount            numeric(16,2) not null check (amount >= 0),
  currency          text not null default 'COP',
  category_id       uuid references public.categories(id) on delete set null,
  account_id        uuid references public.accounts(id) on delete set null,
  payment_method    text,
  due_date          date not null,
  frequency         text not null default 'monthly'
                      check (frequency in ('once','weekly','biweekly','monthly','bimonthly','quarterly','semiannual','annual')),
  status            text not null default 'active' check (status in ('active','paused','finished')),
  notes             text,
  reminders_enabled boolean not null default true,
  reminder_days     int[] not null default '{7,3,1,0}',
  reminder_hour     int not null default 9 check (reminder_hour between 0 and 23),
  last_paid_at      date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_recurring_user on public.recurring_payments(user_id, due_date);

-- ============================================================
-- TRANSACCIONES (ingresos, egresos, transferencias)
-- ============================================================
create table if not exists public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id    uuid references public.accounts(id) on delete set null,
  to_account_id uuid references public.accounts(id) on delete set null,
  category_id   uuid references public.categories(id) on delete set null,
  type          text not null check (type in ('income','expense','transfer')),
  expense_type  text check (expense_type in ('fixed','normal','casual')),
  amount        numeric(16,2) not null check (amount >= 0),
  currency      text not null default 'COP',
  description   text,
  occurred_at   date not null default current_date,
  created_at    timestamptz not null default now()
);
alter table public.transactions
  add column if not exists payment_method       text,
  add column if not exists notes                text,
  add column if not exists is_ant               boolean not null default false,
  add column if not exists latitude             double precision,
  add column if not exists longitude            double precision,
  add column if not exists location_name        text,
  add column if not exists recurring_payment_id uuid references public.recurring_payments(id) on delete set null,
  add column if not exists updated_at           timestamptz not null default now();
do $$ begin
  alter table public.transactions add constraint tx_payment_method_chk check (
    payment_method is null or payment_method in
      ('cash','debit','credit','transfer','deposit','check','digital_wallet','other'));
exception when duplicate_object then null; end $$;
create index if not exists idx_tx_user on public.transactions(user_id);
create index if not exists idx_tx_user_date on public.transactions(user_id, occurred_at);
create index if not exists idx_tx_account on public.transactions(account_id);
create index if not exists idx_tx_user_ant on public.transactions(user_id, is_ant, occurred_at);

-- ============================================================
-- FACTURAS / ADJUNTOS (archivo en Storage, ligado a un movimiento)
-- ============================================================
create table if not exists public.attachments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  transaction_id      uuid references public.transactions(id) on delete cascade,
  storage_path        text not null unique,
  file_name           text not null,
  mime_type           text not null,
  kind                text not null default 'image' check (kind in ('photo','image','pdf','file')),
  size_bytes          bigint,
  original_size_bytes bigint,
  created_at          timestamptz not null default now()
);
create index if not exists idx_attachments_tx on public.attachments(transaction_id);
create index if not exists idx_attachments_user on public.attachments(user_id, created_at);

-- ============================================================
-- METAS DE AHORRO + APORTES
-- ============================================================
create table if not exists public.savings_goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null,
  target_amount numeric(16,2) not null check (target_amount > 0),
  target_date   date,
  icon          text,
  color         text,
  status        text not null default 'active' check (status in ('active','completed','archived')),
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_goals_user on public.savings_goals(user_id);

create table if not exists public.goal_contributions (
  id             uuid primary key default gen_random_uuid(),
  goal_id        uuid not null references public.savings_goals(id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  amount         numeric(16,2) not null check (amount <> 0),   -- negativo = retiro
  contributed_at date not null default current_date,
  note           text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_contrib_goal on public.goal_contributions(goal_id, contributed_at);
create index if not exists idx_contrib_user on public.goal_contributions(user_id, contributed_at);

-- ============================================================
-- DEUDAS (me deben / yo debo) + abonos
-- ============================================================
create table if not exists public.debts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  counterparty text not null,
  direction    text not null check (direction in ('they_owe_me','i_owe_them')),
  principal    numeric(16,2) not null check (principal >= 0),
  currency     text not null default 'COP',
  description  text,
  due_date     date,
  status       text not null default 'open' check (status in ('open','settled')),
  created_at   timestamptz not null default now()
);
create index if not exists idx_debts_user on public.debts(user_id);

create table if not exists public.debt_payments (
  id       uuid primary key default gen_random_uuid(),
  debt_id  uuid not null references public.debts(id) on delete cascade,
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  amount   numeric(16,2) not null check (amount > 0),
  paid_at  date not null default current_date,
  note     text
);
create index if not exists idx_debt_payments_debt on public.debt_payments(debt_id);

-- ============================================================
-- INVERSIONES
-- ============================================================
create table if not exists public.investments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name            text not null,
  type            text not null default 'other'
                    check (type in ('stocks','crypto','fund','real_estate','cdt','bonds','other')),
  amount_invested numeric(16,2) not null default 0,
  current_value   numeric(16,2) not null default 0,
  currency        text not null default 'COP',
  institution     text,
  started_at      date default current_date,
  notes           text,
  updated_at      timestamptz not null default now()
);
create index if not exists idx_investments_user on public.investments(user_id);

-- ============================================================
-- MENSAJES DEL ASISTENTE IA
-- ============================================================
create table if not exists public.ai_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role       text not null check (role in ('user','assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_user on public.ai_messages(user_id, created_at);

-- Instalaciones anteriores: user_id toma el usuario de la sesión por defecto
do $$
declare t text;
begin
  foreach t in array array[
    'accounts','categories','transactions','debts','debt_payments','investments','ai_messages',
    'recurring_payments','attachments','savings_goals','goal_contributions'
  ] loop
    execute format('alter table public.%I alter column user_id set default auth.uid();', t);
  end loop;
end $$;

-- ============================================================
-- VISTA: SALDO ACTUAL POR CUENTA
-- ============================================================
create or replace view public.account_balances
with (security_invoker = true) as
select
  a.id        as account_id,
  a.user_id,
  a.name,
  a.bank,
  a.type,
  a.currency,
  a.initial_balance
    + coalesce((select sum(t.amount) from public.transactions t
                where t.account_id = a.id and t.type = 'income'), 0)
    - coalesce((select sum(t.amount) from public.transactions t
                where t.account_id = a.id and t.type = 'expense'), 0)
    - coalesce((select sum(t.amount) from public.transactions t
                where t.account_id = a.id and t.type = 'transfer'), 0)
    + coalesce((select sum(t.amount) from public.transactions t
                where t.to_account_id = a.id and t.type = 'transfer'), 0)
    as current_balance
from public.accounts a
where a.archived = false;

-- ============================================================
-- VISTA: PROGRESO DE METAS
-- ============================================================
create or replace view public.goal_progress
with (security_invoker = true) as
select
  g.*,
  coalesce((select sum(c.amount) from public.goal_contributions c where c.goal_id = g.id), 0) as saved_amount,
  (select min(c.contributed_at) from public.goal_contributions c where c.goal_id = g.id)        as first_contribution_at
from public.savings_goals g;

-- ============================================================
-- FUNCIÓN: RESUMEN MENSUAL
-- ============================================================
drop function if exists public.monthly_summary(date);
create or replace function public.monthly_summary(p_month date)
returns table (
  total_income   numeric,
  total_expense  numeric,
  net            numeric,
  fixed_expense  numeric,
  normal_expense numeric,
  casual_expense numeric,
  ant_expense    numeric,
  ant_count      bigint,
  tx_count       bigint
)
language sql stable security invoker
as $$
  select
    coalesce(sum(amount) filter (where type = 'income'), 0),
    coalesce(sum(amount) filter (where type = 'expense'), 0),
    coalesce(sum(amount) filter (where type = 'income'), 0)
      - coalesce(sum(amount) filter (where type = 'expense'), 0),
    coalesce(sum(amount) filter (where type = 'expense' and expense_type = 'fixed'), 0),
    coalesce(sum(amount) filter (where type = 'expense' and expense_type = 'normal'), 0),
    coalesce(sum(amount) filter (where type = 'expense' and expense_type = 'casual'), 0),
    coalesce(sum(amount) filter (where type = 'expense' and is_ant), 0),
    count(*) filter (where type = 'expense' and is_ant),
    count(*)
  from public.transactions
  where user_id = auth.uid()
    and occurred_at >= date_trunc('month', p_month)::date
    and occurred_at <  (date_trunc('month', p_month) + interval '1 month')::date;
$$;

-- ============================================================
-- FUNCIÓN: SERIE DE FLUJO DE CAJA (día / semana / mes / año)
-- ============================================================
create or replace function public.cashflow_series(p_from date, p_to date, p_bucket text default 'month')
returns table (bucket date, income numeric, expense numeric, ant numeric)
language sql stable security invoker
as $$
  select
    date_trunc(p_bucket, occurred_at)::date,
    coalesce(sum(amount) filter (where type = 'income'), 0),
    coalesce(sum(amount) filter (where type = 'expense'), 0),
    coalesce(sum(amount) filter (where type = 'expense' and is_ant), 0)
  from public.transactions
  where user_id = auth.uid()
    and p_bucket in ('day','week','month','year')
    and occurred_at between p_from and p_to
  group by 1
  order by 1;
$$;

-- ============================================================
-- FUNCIÓN: GASTO / INGRESO POR CATEGORÍA EN UN PERIODO
-- ============================================================
create or replace function public.category_breakdown(p_from date, p_to date, p_kind text default 'expense', p_only_ant boolean default false)
returns table (category_id uuid, name text, color text, icon text, total numeric, tx_count bigint)
language sql stable security invoker
as $$
  select
    t.category_id,
    coalesce(c.name, 'Sin categoría'),
    c.color,
    c.icon,
    sum(t.amount),
    count(*)
  from public.transactions t
  left join public.categories c on c.id = t.category_id
  where t.user_id = auth.uid()
    and t.type = p_kind
    and (not p_only_ant or t.is_ant)
    and t.occurred_at between p_from and p_to
  group by t.category_id, c.name, c.color, c.icon
  order by sum(t.amount) desc;
$$;

-- ============================================================
-- CATEGORÍAS POR DEFECTO (no duplica las que ya existan)
-- ============================================================
create or replace function public.seed_default_categories(p_user uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.categories (user_id, name, kind, expense_type, icon, color, is_ant)
  select p_user, v.name, v.kind, v.expense_type, v.icon, v.color, v.is_ant
  from (values
    -- Ingresos
    ('Salario',            'income',  null::text, 'briefcase-outline',        '#22c55e', false),
    ('Bonificaciones',     'income',  null,       'gift-outline',             '#10b981', false),
    ('Comisiones',         'income',  null,       'ribbon-outline',           '#14b8a6', false),
    ('Ventas',             'income',  null,       'storefront-outline',       '#06b6d4', false),
    ('Intereses',          'income',  null,       'trending-up-outline',      '#0ea5e9', false),
    ('Honorarios',         'income',  null,       'document-text-outline',    '#3b82f6', false),
    ('Arriendos recibidos','income',  null,       'key-outline',              '#6366f1', false),
    ('Reembolsos',         'income',  null,       'return-down-back-outline', '#8b5cf6', false),
    ('Otros ingresos',     'income',  null,       'add-circle-outline',       '#16a34a', false),
    -- Gastos
    ('Alimentación',       'expense', 'normal',   'restaurant-outline',       '#f59e0b', false),
    ('Mercado',            'expense', 'normal',   'cart-outline',             '#eab308', false),
    ('Transporte',         'expense', 'normal',   'bus-outline',              '#3b82f6', false),
    ('Servicios',          'expense', 'fixed',    'flash-outline',            '#f97316', false),
    ('Arriendo',           'expense', 'fixed',    'home-outline',             '#ef4444', false),
    ('Salud',              'expense', 'normal',   'medkit-outline',           '#10b981', false),
    ('Educación',          'expense', 'fixed',    'school-outline',           '#6366f1', false),
    ('Entretenimiento',    'expense', 'casual',   'film-outline',             '#a855f7', false),
    ('Ropa',               'expense', 'casual',   'shirt-outline',            '#ec4899', false),
    ('Hogar',              'expense', 'normal',   'bed-outline',              '#84cc16', false),
    ('Seguros',            'expense', 'fixed',    'shield-checkmark-outline', '#0ea5e9', false),
    ('Créditos',           'expense', 'fixed',    'card-outline',             '#dc2626', false),
    ('Suscripciones',      'expense', 'fixed',    'repeat-outline',           '#8b5cf6', false),
    ('Mascotas',           'expense', 'normal',   'paw-outline',              '#d97706', false),
    ('Viajes',             'expense', 'casual',   'airplane-outline',         '#06b6d4', false),
    ('Impuestos',          'expense', 'fixed',    'receipt-outline',          '#64748b', false),
    ('Imprevistos',        'expense', 'casual',   'alert-circle-outline',     '#f43f5e', false),
    ('Tarjeta de crédito', 'expense', 'fixed',    'card-outline',             '#be123c', false),
    ('Gimnasio',           'expense', 'fixed',    'barbell-outline',          '#22c55e', false),
    ('Parqueadero clínica', 'expense', 'normal',   'car-outline',              '#0891b2', false),
    ('Ahorro cadena',      'expense', 'fixed',    'link-outline',             '#16a34a', false),
    ('Ahorro fondo de empleados', 'expense', 'fixed',    'people-outline',           '#059669', false),
    ('Ahorro voluntario',  'expense', 'fixed',    'wallet-outline',           '#10b981', false),
    ('Mi Pago',            'expense', 'fixed',    'phone-portrait-outline',   '#7c3aed', false),
    ('Servicios EPM',      'expense', 'fixed',    'water-outline',            '#f97316', false),
    ('Servicios Tigo',     'expense', 'fixed',    'wifi-outline',             '#2563eb', false),
    ('Otros gastos',       'expense', 'normal',   'ellipsis-horizontal-circle-outline', '#94a3b8', false),
    -- Gastos hormiga
    ('Café',               'expense', 'casual',   'cafe-outline',             '#b45309', true),
    ('Snacks',             'expense', 'casual',   'fast-food-outline',        '#f97316', true),
    ('Dulces y bebidas',   'expense', 'casual',   'ice-cream-outline',        '#ec4899', true),
    ('Propinas',           'expense', 'casual',   'hand-left-outline',        '#14b8a6', true),
    ('Compras impulsivas', 'expense', 'casual',   'bag-handle-outline',       '#e11d48', true),
    ('Domicilios',         'expense', 'casual',   'bicycle-outline',          '#f59e0b', true),
    ('Apps y juegos',      'expense', 'casual',   'game-controller-outline',  '#7c3aed', true),
    ('Otros hormiga',      'expense', 'casual',   'bug-outline',              '#a16207', true)
  ) as v(name, kind, expense_type, icon, color, is_ant)
  where not exists (
    select 1 from public.categories c
    where c.user_id = p_user and c.kind = v.kind and lower(c.name) = lower(v.name)
  );
end;
$$;

-- ============================================================
-- TRIGGER: al registrarse un usuario → perfil + categorías base
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  perform public.seed_default_categories(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Usuarios ya existentes: perfil y categorías nuevas
insert into public.profiles (id, display_name)
select u.id, split_part(u.email, '@', 1) from auth.users u
on conflict (id) do nothing;
select public.seed_default_categories(u.id) from auth.users u;

-- ============================================================
-- ELIMINAR CUENTA (el cliente borra primero sus archivos de Storage)
-- ============================================================
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  delete from auth.users where id = auth.uid();   -- todo lo demás cae en cascada
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
revoke all on function public.seed_default_categories(uuid) from public, anon, authenticated;

-- ============================================================
-- ROW LEVEL SECURITY · cada usuario SOLO ve lo suyo
-- ============================================================
alter table public.profiles           enable row level security;
alter table public.accounts           enable row level security;
alter table public.categories         enable row level security;
alter table public.transactions       enable row level security;
alter table public.debts              enable row level security;
alter table public.debt_payments      enable row level security;
alter table public.investments        enable row level security;
alter table public.ai_messages        enable row level security;
alter table public.recurring_payments enable row level security;
alter table public.attachments        enable row level security;
alter table public.savings_goals      enable row level security;
alter table public.goal_contributions enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

do $$
declare t text;
begin
  foreach t in array array[
    'accounts','categories','transactions','debts','debt_payments','investments','ai_messages',
    'recurring_payments','attachments','savings_goals','goal_contributions'
  ] loop
    execute format('drop policy if exists "own rows" on public.%I;', t);
    execute format(
      'create policy "own rows" on public.%I for all
         using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);
  end loop;
end $$;

-- Tablas hijas: además el registro padre debe ser del mismo usuario
drop policy if exists "own rows" on public.goal_contributions;
create policy "own rows" on public.goal_contributions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and exists (
    select 1 from public.savings_goals g where g.id = goal_id and g.user_id = auth.uid()));

drop policy if exists "own rows" on public.debt_payments;
create policy "own rows" on public.debt_payments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and exists (
    select 1 from public.debts d where d.id = debt_id and d.user_id = auth.uid()));

drop policy if exists "own rows" on public.attachments;
create policy "own rows" on public.attachments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id
    and (storage_path like auth.uid()::text || '/%')
    and (transaction_id is null or exists (
      select 1 from public.transactions t where t.id = transaction_id and t.user_id = auth.uid())));

drop policy if exists "own rows" on public.transactions;
create policy "own rows" on public.transactions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id
    and (account_id is null or exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid()))
    and (to_account_id is null or exists (select 1 from public.accounts a where a.id = to_account_id and a.user_id = auth.uid()))
    and (category_id is null or exists (select 1 from public.categories c where c.id = category_id and c.user_id = auth.uid())));

-- ============================================================
-- STORAGE · buckets privados; cada usuario solo su carpeta {uid}/...
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('attachments', 'attachments', false, 10485760),
  ('avatars',     'avatars',     false, 2097152),
  ('backups',     'backups',     false, 52428800)
on conflict (id) do nothing;

drop policy if exists "finzen own files read"   on storage.objects;
drop policy if exists "finzen own files insert" on storage.objects;
drop policy if exists "finzen own files update" on storage.objects;
drop policy if exists "finzen own files delete" on storage.objects;

create policy "finzen own files read" on storage.objects for select to authenticated
  using (bucket_id in ('attachments','avatars','backups') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "finzen own files insert" on storage.objects for insert to authenticated
  with check (bucket_id in ('attachments','avatars','backups') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "finzen own files update" on storage.objects for update to authenticated
  using (bucket_id in ('attachments','avatars','backups') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "finzen own files delete" on storage.objects for delete to authenticated
  using (bucket_id in ('attachments','avatars','backups') and (storage.foldername(name))[1] = auth.uid()::text);

-- Fin del esquema.
