-- Transferencias por verificar también de Mostrador y de los domicilios express:
-- la venta queda registrada, pero la plata no entra al banco hasta que se
-- marca "Llegó" en Cartera › Transferencias (o pasa a Cartera si no llega).
alter table public.transferencias_ruta drop constraint if exists transferencias_ruta_origen_check;
alter table public.transferencias_ruta add constraint transferencias_ruta_origen_check check (origen = any (array['manual', 'foto', 'mostrador', 'domicilio']));
alter table public.transferencias_ruta add column if not exists venta_encab_id uuid references public.ventas_encab(id) on delete set null;
