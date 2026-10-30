-- Transferencias que no llegan: al vencer la fecha limite siguen pendientes y
-- la oficina decide si se le cargan al vendedor. Solo las cargadas pasan a
-- descontarse en la nomina.
alter table public.transferencias_ruta drop constraint if exists transferencias_ruta_estado_check;
alter table public.transferencias_ruta add constraint transferencias_ruta_estado_check
  check (estado in ('verificada', 'por_verificar', 'recibida', 'cargada', 'descontada'));
alter table public.transferencias_ruta add column if not exists cargada_por text;
alter table public.transferencias_ruta add column if not exists cargada_at timestamptz;
