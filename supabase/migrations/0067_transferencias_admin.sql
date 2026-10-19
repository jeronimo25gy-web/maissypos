-- Transferencias de mercancía entre vendedores: el admin puede confirmar o
-- rechazar en nombre del vendedor (queda quién y cuándo) y anotar una que el
-- vendedor no anotó (origen_registro 'admin', ya confirmada).
alter table public.transferencias_mercancia
  add column if not exists confirmado_por text,
  add column if not exists confirmado_at timestamptz;
alter table public.transferencias_mercancia drop constraint if exists transferencias_mercancia_origen_registro_check;
alter table public.transferencias_mercancia add constraint transferencias_mercancia_origen_registro_check
  check (origen_registro in ('emisor', 'receptor', 'admin'));
