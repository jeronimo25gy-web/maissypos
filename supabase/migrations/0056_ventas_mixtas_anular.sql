-- Ventas de mostrador mixtas (productos de Distri y de Arepas en una sola
-- compra): se guardan como una venta por empresa, ligadas por grupo_id, para
-- el comprobante unico. Y anular venta (solo admin): quien, cuando y por que.
alter table public.ventas_encab
  add column if not exists grupo_id uuid,
  add column if not exists anulada_por text,
  add column if not exists anulada_at timestamptz,
  add column if not exists motivo_anulacion text;
create index if not exists ventas_encab_grupo on public.ventas_encab (grupo_id) where grupo_id is not null;
