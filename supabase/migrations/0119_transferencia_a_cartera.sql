-- Transferencia reportada que no llegó al banco: pasa a Cartera como crédito
-- pendiente del cliente, y queda ligada a ese crédito.
alter table public.transferencias_ruta drop constraint if exists transferencias_ruta_estado_check;
alter table public.transferencias_ruta add constraint transferencias_ruta_estado_check
  check (estado in ('verificada', 'por_verificar', 'recibida', 'cargada', 'descontada', 'a_cartera'));
alter table public.transferencias_ruta add column if not exists cartera_fiados_id uuid references public.cartera_fiados(id);
