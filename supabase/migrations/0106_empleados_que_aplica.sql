-- Por empleado: si recibe auxilio de transporte, si se le pagan aportes de
-- seguridad social (salud, pensión, ARL, caja y parafiscales) y si causa
-- prestaciones sociales. Por defecto todo aplica.
alter table public.empleados add column if not exists con_auxilio boolean not null default true;
alter table public.empleados add column if not exists con_seguridad_social boolean not null default true;
alter table public.empleados add column if not exists con_prestaciones boolean not null default true;
