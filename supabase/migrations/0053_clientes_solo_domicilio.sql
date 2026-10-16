-- Clientes que solo piden domicilio: se guardan para encontrarlos despues,
-- aparte de los clientes de ruta (sin ruta ni rutero) hasta que se agreguen.
alter table public.clientes add column if not exists solo_domicilio boolean not null default false;
