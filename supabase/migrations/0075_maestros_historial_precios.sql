-- Maestros: historial de cambios de precio y costo de cada producto, y datos
-- completos de las cuentas bancarias (tipo de cuenta y titular).

create table if not exists productos_precios_historial (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  producto_id uuid not null references productos(id) on delete cascade,
  campo text not null check (campo in ('precio_venta', 'costo_compra', 'precio_empleado')),
  antes numeric,
  despues numeric,
  usuario text,
  created_at timestamptz not null default now()
);
create index if not exists productos_precios_historial_producto on productos_precios_historial (producto_id, created_at desc);
alter table productos_precios_historial enable row level security;
create policy productos_precios_historial_select on productos_precios_historial for select using (empresa_id = any (jwt_empresa_ids()));

-- Se registra solo, sin importar desde qué pantalla cambie el precio.
create or replace function registrar_cambio_precio() returns trigger
language plpgsql security definer set search_path = public as $$
declare quien text;
begin
  select nombre into quien from usuarios where auth_user_id = auth.uid() limit 1;
  if new.precio_venta is distinct from old.precio_venta then
    insert into productos_precios_historial (empresa_id, producto_id, campo, antes, despues, usuario) values (new.empresa_id, new.id, 'precio_venta', old.precio_venta, new.precio_venta, quien);
  end if;
  if new.costo_compra is distinct from old.costo_compra then
    insert into productos_precios_historial (empresa_id, producto_id, campo, antes, despues, usuario) values (new.empresa_id, new.id, 'costo_compra', old.costo_compra, new.costo_compra, quien);
  end if;
  if new.precio_empleado is distinct from old.precio_empleado then
    insert into productos_precios_historial (empresa_id, producto_id, campo, antes, despues, usuario) values (new.empresa_id, new.id, 'precio_empleado', old.precio_empleado, new.precio_empleado, quien);
  end if;
  return new;
end $$;
drop trigger if exists productos_cambio_precio on productos;
create trigger productos_cambio_precio after update of precio_venta, costo_compra, precio_empleado on productos
  for each row execute function registrar_cambio_precio();

alter table cuentas add column if not exists tipo_cuenta text check (tipo_cuenta is null or tipo_cuenta in ('ahorros', 'corriente', 'billetera'));
alter table cuentas add column if not exists titular text;
