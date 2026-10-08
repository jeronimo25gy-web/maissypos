-- Una transferencia de mercancia puede salir durante la ruta (resta de lo
-- vendido del emisor) o al llegar, de lo que trajo de vuelta (resta de su
-- devolucion). Antes solo existia el primer caso y el segundo se restaba dos
-- veces.
alter table public.transferencias_mercancia add column if not exists de_devolucion boolean not null default false;
comment on column public.transferencias_mercancia.de_devolucion is 'true: el emisor la entrego al llegar, de lo que trajo de vuelta (sale de su devolucion, no de lo vendido)';
