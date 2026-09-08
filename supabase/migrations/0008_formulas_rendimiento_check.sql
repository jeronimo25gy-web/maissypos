-- rendimiento solo estaba protegido por el min="0.01" del input en el
-- frontend; a nivel de base de datos se podia insertar 0 o negativo, lo que
-- hace que produccion/page.js calcule factor=0 y sume el producto terminado
-- sin descontar nada de materia prima.
alter table public.formulas
  add constraint formulas_rendimiento_positivo check (rendimiento > 0);
