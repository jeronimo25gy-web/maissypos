-- De donde sale lo que esperaba el sistema en cada diferencia (conteo anterior,
-- entradas, devoluciones, despachos, salidas), para explicarla al aprobar.
alter table public.divergencias_inventario add column if not exists desglose jsonb;
-- El conteo inicial (arranque con datos reales) es punto de partida: lo
-- contado queda como base sin diferencias por aprobar.
alter table public.conteo_fisico add column if not exists inicial boolean not null default false;
