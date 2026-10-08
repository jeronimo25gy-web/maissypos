-- Transferencias que reporta un vendedor en su liquidacion, comprobante por
-- comprobante. Politica: solo cuenta como plata entregada la que un admin ya
-- vio en el banco ('verificada'); la demas queda 'por_verificar' como deuda del
-- vendedor con fecha limite acordada. Si un admin confirma que llego pasa a
-- 'recibida' (y entra a Caja y Bancos); si vence sin llegar se le descuenta en
-- nomina ('descontada'). Las fotos no se guardan: solo los datos leidos.

alter table public.cuentas
  add column if not exists banco text,
  add column if not exists numero text,
  add column if not exists llaves text;

create table if not exists public.transferencias_ruta (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  despacho_id uuid not null references public.despachos_encab(id),
  vendedor_id uuid references public.vendedores(id),
  ruta_id uuid references public.rutas(id),
  fecha date not null,
  valor numeric not null check (valor > 0),
  referencia text,
  banco text,
  fecha_comprobante date,
  destino text,
  cuenta_maissy boolean,
  estado text not null check (estado in ('verificada', 'por_verificar', 'recibida', 'descontada')),
  fecha_limite date,
  cuenta_id uuid references public.cuentas(id),
  origen text not null default 'manual' check (origen in ('manual', 'foto')),
  registrado_por text,
  verificada_por text,
  verificada_at timestamptz,
  nomina_pago_id uuid references public.nomina_pagos(id),
  created_at timestamptz not null default now()
);
create index if not exists transferencias_ruta_despacho on public.transferencias_ruta (despacho_id);
create index if not exists transferencias_ruta_pendientes on public.transferencias_ruta (empresa_id, estado);
create index if not exists transferencias_ruta_referencia on public.transferencias_ruta (empresa_id, referencia);

alter table public.transferencias_ruta enable row level security;

create policy empresa_select on public.transferencias_ruta for select using (empresa_id = any (jwt_empresa_ids()));
-- Quien liquida puede registrar comprobantes, pero solo un admin las registra ya verificadas.
create policy empresa_insert on public.transferencias_ruta for insert
  with check (empresa_id = any (jwt_empresa_ids()) and (estado = 'por_verificar' or jwt_rol() = 'admin'));
-- Al re-guardar una liquidacion se reemplazan las que siguen sin resolver.
create policy empresa_delete on public.transferencias_ruta for delete
  using (empresa_id = any (jwt_empresa_ids()) and estado in ('verificada', 'por_verificar') and (estado = 'por_verificar' or jwt_rol() = 'admin'));
-- Marcar "llego" o descontada en nomina: solo admin.
create policy admin_update on public.transferencias_ruta for update
  using (empresa_id = any (jwt_empresa_ids()) and jwt_rol() = 'admin')
  with check (empresa_id = any (jwt_empresa_ids()) and jwt_rol() = 'admin');
