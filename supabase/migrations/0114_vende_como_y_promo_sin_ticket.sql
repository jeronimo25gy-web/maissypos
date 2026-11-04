-- Productos que en Mi ruta se venden como otro (ej. Arepa Tela Amarilla se
-- vende como Arepa Tela): en el carro y en el ticket son uno solo, pero se
-- despachan y se devuelven cada uno por aparte.
alter table public.productos add column if not exists vende_como_sku text;

-- Promociones: lo vendido sin ticket se liquida al precio de lista (false,
-- mientras no todos usan Mi ruta) o al precio de la unidad suelta (true).
alter table public.promociones add column if not exists sin_ticket_a_suelta boolean not null default false;
