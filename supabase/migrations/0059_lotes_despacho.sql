-- Lotes por dia de produccion (Arepas): de que dia salio cada producto en un
-- despacho. El saldo de cada lote = lo producido ese dia - lo que salio de el
-- (menos lo que volvio en la liquidacion), cuadrado contra el stock total.
-- Cada ruta tiene su regla: lo mas viejo primero (por defecto) o lo mas
-- fresco primero (TAT, que deja la arepa en tiendas).

alter table public.rutas add column if not exists lote_preferencia text not null default 'viejo';
alter table public.rutas drop constraint if exists rutas_lote_preferencia_check;
alter table public.rutas add constraint rutas_lote_preferencia_check check (lote_preferencia in ('viejo', 'fresco'));
update public.rutas set lote_preferencia = 'fresco' where nombre ilike '%TAT%';

create table if not exists public.lotes_salida (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  despacho_id uuid not null references public.despachos_encab(id) on delete cascade,
  sku text not null,
  fecha_lote date not null,
  cantidad numeric not null check (cantidad > 0),
  created_at timestamptz default now()
);
create index if not exists lotes_salida_despacho on public.lotes_salida (despacho_id);
create index if not exists lotes_salida_empresa_fecha on public.lotes_salida (empresa_id, fecha_lote);

alter table public.lotes_salida enable row level security;
drop policy if exists lotes_salida_select on public.lotes_salida;
drop policy if exists lotes_salida_escribir on public.lotes_salida;
create policy lotes_salida_select on public.lotes_salida for select using (empresa_id = any (public.jwt_empresa_ids()));
-- Solo admin y auxiliar despachan.
create policy lotes_salida_escribir on public.lotes_salida for all
  using (empresa_id = any (public.jwt_empresa_ids()) and coalesce(public.jwt_rol(), '') <> 'vendedor')
  with check (empresa_id = any (public.jwt_empresa_ids()) and coalesce(public.jwt_rol(), '') <> 'vendedor');
