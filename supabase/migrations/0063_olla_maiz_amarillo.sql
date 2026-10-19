-- La Arepa Tela amarilla se cocina aparte, en una olla de 1 bulto, con su
-- propio maíz. Cada tanque recuerda qué maíz se le pone (la tablet lo propone
-- al montar); se puede cambiar en el momento.
alter table public.tanques
  add column if not exists materia_prima_id uuid references public.productos(id);

insert into public.tanques (empresa_id, nombre, capacidad_bultos, con_presion, orden)
select e.id, 'Olla 1 bulto', 1, false, 4
from public.empresas e
where e.id = 'aef04001-a941-4ad3-bd22-397a76ffc17d'
  and not exists (select 1 from public.tanques t where t.empresa_id = e.id and t.nombre = 'Olla 1 bulto');
