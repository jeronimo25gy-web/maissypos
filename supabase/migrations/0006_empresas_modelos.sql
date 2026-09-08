-- Modelos de negocio por empresa: permite que cada empresa active solo los
-- modulos que le sirven (ej. Distri Maissy no necesita Produccion/Formulas/
-- Costeo, pero Arepas Maissy si porque ademas de producir tambien reparte
-- por rutas). Ver components/Sidebar.js: MODELOS_NEGOCIO y el filtro de
-- modulosVisibles.

alter table public.empresas
  add column if not exists modelos text[] not null default array['distribucion'];

-- Ajusta estos valores segun corresponda. Distri Maissy SAS solo distribuye;
-- Arepas Maissy produce Y ademas reparte por rutas, asi que necesita los dos.
update public.empresas set modelos = array['distribucion']
  where nombre = 'Distri Maissy SAS';

update public.empresas set modelos = array['distribucion', 'produccion']
  where nombre = 'Arepas Maissy';
