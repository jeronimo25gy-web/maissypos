-- Control de gramaje en Produccion: permite anotar una muestra de pesos
-- reales (varios paquetes pesados a mano) por producto terminado y lote de
-- produccion, compararla contra un peso estandar objetivo, y avisar si se
-- sale de una tolerancia -- para separar "el maiz rindio mal" (ver Formulas/
-- Costeo) de "el operario esta porcionando distinto al estandar" (esto).

alter table public.productos
  add column if not exists peso_estandar_g numeric,
  add column if not exists tolerancia_gramaje_pct numeric not null default 5;

create table if not exists public.produccion_muestras_peso (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  lote_id uuid not null references public.produccion_lotes(id),
  producto_id uuid not null references public.productos(id),
  pesos_individuales numeric[] not null,
  peso_promedio_g numeric not null,
  peso_estandar_g numeric, -- snapshot del estandar vigente al momento de la muestra
  desviacion_pct numeric, -- (peso_promedio_g - peso_estandar_g) / peso_estandar_g * 100
  created_at timestamptz not null default now()
);

alter table public.produccion_muestras_peso enable row level security;
drop policy if exists "empresa_id_select" on public.produccion_muestras_peso;
drop policy if exists "empresa_id_insert" on public.produccion_muestras_peso;
create policy "empresa_id_select" on public.produccion_muestras_peso for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "empresa_id_insert" on public.produccion_muestras_peso for insert with check (empresa_id = any (public.jwt_empresa_ids()));
