-- Valor del domicilio: lo pone quien toma el pedido, va en el ticket y el
-- vendedor lo entrega en la liquidacion junto con la venta.
alter table public.domicilios add column if not exists valor_domicilio numeric not null default 0;
alter table public.ventas_ruta add column if not exists valor_domicilio numeric not null default 0;
