-- Cambios en quien fabrica: qué se hace con la unidad mala que vuelve. Si se
-- bota se pierde todo su costo; si va a reproceso (quebrada o agrietada) se
-- recupera la masa y se pierde solo la bolsa.
alter table public.novedades add column if not exists destino text check (destino in ('desecho', 'reproceso'));
