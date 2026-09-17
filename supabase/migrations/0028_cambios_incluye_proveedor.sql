-- Cambios ofrece "Descuenta al proveedor" como clasificacion, pero eso
-- solo tiene sentido para un negocio que REVENDE producto de un
-- proveedor externo (Distri Maissy). Arepas Maissy es productora: sus
-- arepas terminadas no tienen un "proveedor" que se las reponga -- un
-- cambio/perdida de una arepa propia siempre es perdida del negocio o
-- mano a mano, nunca un credito contra un proveedor (sus proveedores
-- reales son de materia prima -- maiz, conservante, empaque -- no de
-- producto terminado).
--
-- Se agrega un flag por empresa (activo por defecto, como los modelos
-- de negocio) para que cada una vea solo las opciones que le aplican.

alter table public.empresas
  add column if not exists cambios_incluye_proveedor boolean not null default true;

update public.empresas set cambios_incluye_proveedor = false
where id = 'aef04001-a941-4ad3-bd22-397a76ffc17d';
