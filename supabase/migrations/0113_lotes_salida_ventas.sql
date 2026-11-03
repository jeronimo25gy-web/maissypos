-- Ventas de mostrador en quien fabrica (distribuidores): de qué día de
-- producción sale cada producto, igual que en el despacho.
alter table public.lotes_salida add column if not exists venta_id uuid references public.ventas_encab(id) on delete cascade;
alter table public.lotes_salida alter column despacho_id drop not null;
alter table public.lotes_salida drop constraint if exists lotes_salida_origen;
alter table public.lotes_salida add constraint lotes_salida_origen check (despacho_id is not null or venta_id is not null);
create index if not exists lotes_salida_venta on public.lotes_salida (venta_id);
