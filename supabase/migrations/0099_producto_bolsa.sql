-- La bolsa que usa cada producto: otro producto, materia prima. Costos toma su
-- costo de compra; si no hay bolsa asociada sigue el precio fijado por referencia.
alter table productos add column if not exists bolsa_id uuid references productos(id) on delete set null;
