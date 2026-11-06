-- Vendedores que se pagan por día (ayudantes de punto de venta): no van en
-- Nómina; su pago se registra como gasto "Pago vendedor del día".
alter table public.vendedores add column if not exists pago_por_dia boolean not null default false;
update public.vendedores set pago_por_dia = true
where empresa_id = '025529ee-8655-459b-91a3-4a719f28c8bc' and nombre in ('Vendedor 2 PDV2', 'Vendedor PDV 2');
