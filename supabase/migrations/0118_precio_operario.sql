-- Precio para los operarios de producción: en Nómina se marca quién lo tiene
-- y en Maestros cada producto puede tener su precio de operario. Si el
-- producto no lo tiene, el operario paga el precio de empleado.
alter table public.empleados add column if not exists precio_operario boolean not null default false;
alter table public.productos add column if not exists precio_operario numeric;
update public.productos set precio_operario = 750
where empresa_id = 'aef04001-a941-4ad3-bd22-397a76ffc17d' and sku = 'ARE-002';
update public.empleados set precio_operario = true where id = '8e44b67b-6d40-45e4-af1b-eabba72a2a9c';
