-- Un producto puede empacarse en dos bolsas dentro de la misma producción: la
-- principal y otra con el porcentaje de paquetes que va en ella.
alter table productos
  add column if not exists bolsa_alterna_id uuid references productos(id) on delete set null,
  add column if not exists bolsa_alterna_pct numeric(5,2) not null default 0;
