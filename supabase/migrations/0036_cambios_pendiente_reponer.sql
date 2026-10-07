-- Distri: un cambio mano a mano con un proveedor (ej. 2 unidades malas de una
-- compra a Velmar que el proveedor cambia al dia siguiente) queda "pendiente
-- por reponer" hasta que se marca como repuesto. No mueve inventario: entran
-- 2 malas y vuelven 2 buenas.

alter table public.novedades
  add column if not exists pendiente_reponer boolean not null default false,
  add column if not exists repuesto_at timestamptz,
  add column if not exists repuesto_por text;

create index if not exists novedades_por_reponer
  on public.novedades (empresa_id) where pendiente_reponer and repuesto_at is null;
