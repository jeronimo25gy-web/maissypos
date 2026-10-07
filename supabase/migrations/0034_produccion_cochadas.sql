-- Arepas Maissy: el maiz no se descuenta por formula (teorico, en fracciones
-- de bulto) sino por "cochada": los bultos reales que se ponen a cocinar en el
-- dia (1, 1.5, 2...). La formula queda como estandar para medir el rendimiento
-- real (lo que se produjo vs lo que se debio producir con ese maiz).
--
-- consumo_por_cochada marca las materias primas que se descuentan asi; las
-- demas (bolsas, conservante...) siguen descontandose por formula.

alter table public.productos
  add column if not exists consumo_por_cochada boolean not null default false;

create table if not exists public.produccion_cochadas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  fecha date not null,
  materia_prima_id uuid not null references public.productos(id),
  cantidad numeric(12,3) not null check (cantidad > 0),
  registrado_por text,
  anulada boolean not null default false,
  anulada_por text,
  created_at timestamptz not null default now()
);

create index if not exists produccion_cochadas_empresa_fecha on public.produccion_cochadas (empresa_id, fecha);

alter table public.produccion_cochadas enable row level security;

-- Igual que produccion_lotes: sin DELETE. Una cochada mal registrada se anula
-- (update + movimiento de reverso), queda el rastro.
create policy empresa_id_select on public.produccion_cochadas
  for select using (empresa_id = any (jwt_empresa_ids()));
create policy empresa_id_insert on public.produccion_cochadas
  for insert with check (empresa_id = any (jwt_empresa_ids()));
create policy empresa_id_update on public.produccion_cochadas
  for update using (empresa_id = any (jwt_empresa_ids())) with check (empresa_id = any (jwt_empresa_ids()));

-- Maiz crudo de Arepas Maissy (y su empresa de prueba) pasa a descontarse por cochada.
update public.productos set consumo_por_cochada = true
where sku in ('MP-001', 'ZZM-001')
  and empresa_id in ('aef04001-a941-4ad3-bd22-397a76ffc17d', '00000000-0000-4000-a000-0000000000a1');
