-- Una carga fallida borra su lote; si algo de ese lote se conservo, no debe
-- impedirlo: la fila queda como dato normal, sin lote.
do $$
declare t text;
begin
  foreach t in array array['proveedores','categorias_producto','productos','rutas','vendedores','clientes','rutero','conteo_fisico','cartera_fiados','facturas_proveedores'] loop
    execute format('alter table public.%I drop constraint %I', t, t || '_migracion_lote_fkey');
    execute format('alter table public.%I add constraint %I foreign key (migracion_lote) references public.migracion_lotes(id) on delete set null', t, t || '_migracion_lote_fkey');
  end loop;
end $$;
