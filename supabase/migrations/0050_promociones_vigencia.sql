-- Vigencia de la promo y precio de la unidad suelta mientras rige: hasta la
-- fecha todo se liquida como antes; desde la fecha, en las rutas que no estan
-- excluidas, la suelta va a su precio y la promo se arma sola en el ticket.
alter table public.promociones
  add column if not exists precio_suelta numeric,
  add column if not exists vigente_desde date,
  add column if not exists excluir_rutas uuid[] not null default '{}';

-- Distri, Arepa Tela: desde el 2 de noviembre de 2026, suelta $2.500 y 6 por
-- $14.000, en todas las rutas menos los puntos de venta 1 y 2.
update public.promociones
set precio_suelta = 2500, vigente_desde = '2026-11-02',
    excluir_rutas = array['0e6f82f3-318a-412d-b882-97878c7df44b', '6e756c7b-fbb5-444f-8884-b55084a42f4a']::uuid[]
where empresa_id = '025529ee-8655-459b-91a3-4a719f28c8bc' and sku = 'ARE-001' and nombre = 'Promo x6';
