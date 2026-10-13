-- Ventas en ruta por cliente (el "carrito" del vendedor) y visitas del rutero.
-- Son el registro de lo que paso en la calle y el ticket del cliente: no mueven
-- caja, cartera ni inventario. La plata, los creditos y las devoluciones se
-- cuadran en la liquidacion (que el admin aprueba); de aqui salen precargados
-- los creditos de ese dia.

create table if not exists public.ventas_ruta (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  empresa_id uuid not null references public.empresas(id),
  despacho_id uuid references public.despachos_encab(id) on delete set null,
  vendedor_id uuid references public.vendedores(id),
  ruta_id uuid references public.rutas(id),
  cliente_id uuid references public.clientes(id),
  nombre_cliente text not null,
  fecha date not null,
  total numeric not null default 0,
  forma_pago text not null check (forma_pago in ('efectivo', 'transferencia', 'credito')),
  fecha_pago date,
  estado text not null default 'activa' check (estado in ('activa', 'anulada')),
  registrado_por text,
  created_at timestamptz default now()
);
create index if not exists ventas_ruta_despacho on public.ventas_ruta (despacho_id);
create index if not exists ventas_ruta_cliente on public.ventas_ruta (cliente_id, fecha);

create table if not exists public.ventas_ruta_detalle (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.ventas_ruta(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id),
  sku text not null,
  nombre text,
  cantidad numeric not null,
  precio numeric not null,
  subtotal numeric not null
);
create index if not exists ventas_ruta_detalle_venta on public.ventas_ruta_detalle (venta_id);

create table if not exists public.visitas_ruta (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  fecha date not null,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  ruta_id uuid references public.rutas(id),
  vendedor_id uuid references public.vendedores(id),
  resultado text not null check (resultado in ('compro', 'no_compro', 'no_estaba')),
  venta_id uuid references public.ventas_ruta(id) on delete set null,
  created_at timestamptz default now(),
  unique (cliente_id, fecha)
);

do $$
declare t text;
begin
  foreach t in array array['ventas_ruta', 'ventas_ruta_detalle', 'visitas_ruta'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (empresa_id = any (jwt_empresa_ids()))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (empresa_id = any (jwt_empresa_ids()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (empresa_id = any (jwt_empresa_ids())) with check (empresa_id = any (jwt_empresa_ids()))', t || '_update', t);
    execute format($p$create policy %I on public.%I for delete to authenticated using (empresa_id = any (jwt_empresa_ids()) and (coalesce(jwt_rol(), '') <> 'vendedor' or %L = 'visitas_ruta'))$p$, t || '_delete', t, t);
  end loop;
end $$;
