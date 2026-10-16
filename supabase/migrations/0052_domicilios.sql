-- Domicilios: el admin/auxiliar toma el pedido (telefono o WhatsApp) y le
-- llega al vendedor de la ruta en Mi ruta (burbuja). El vendedor lo entrega
-- desde el carro con ticket, o marca que no se pudo.
create table if not exists public.domicilios (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  empresa_id uuid not null references public.empresas(id),
  fecha date not null,
  cliente_id uuid references public.clientes(id),
  nombre_cliente text not null,
  telefono text, direccion text, edificio text, apto text, barrio text,
  ruta_id uuid references public.rutas(id),
  vendedor_id uuid references public.vendedores(id),
  hora_limite time,
  forma_pago text not null default 'efectivo' check (forma_pago in ('efectivo', 'transferencia', 'credito')),
  nota text,
  total numeric not null default 0,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'entregado', 'no_entregado', 'cancelado')),
  motivo text,
  venta_id uuid references public.ventas_ruta(id) on delete set null,
  tomado_por text,
  resuelto_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists domicilios_ruta_estado on public.domicilios (empresa_id, ruta_id, estado, fecha);

create table if not exists public.domicilios_detalle (
  id uuid primary key default gen_random_uuid(),
  domicilio_id uuid not null references public.domicilios(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id),
  sku text not null,
  nombre text,
  cantidad numeric not null,
  subtotal numeric not null default 0
);
create index if not exists domicilios_detalle_dom on public.domicilios_detalle (domicilio_id);

do $$
declare t text;
begin
  foreach t in array array['domicilios', 'domicilios_detalle'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (empresa_id = any (jwt_empresa_ids()))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (empresa_id = any (jwt_empresa_ids()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (empresa_id = any (jwt_empresa_ids())) with check (empresa_id = any (jwt_empresa_ids()))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (empresa_id = any (jwt_empresa_ids()))', t || '_delete', t);
    -- El vendedor no crea ni borra domicilios: solo los entrega o dice que no se pudo.
    execute format($p$create policy %I on public.%I as restrictive for insert to authenticated with check (coalesce(jwt_rol(), '') <> 'vendedor')$p$, t || '_vend_no_crea', t);
    execute format($p$create policy %I on public.%I as restrictive for delete to authenticated using (coalesce(jwt_rol(), '') <> 'vendedor')$p$, t || '_vend_no_borra', t);
  end loop;
end $$;
create policy domicilios_vend_solo_entrega on public.domicilios as restrictive for update to authenticated
  using (true) with check (coalesce(jwt_rol(), '') <> 'vendedor' or estado in ('entregado', 'no_entregado'));
create policy domicilios_detalle_vend_no_edita on public.domicilios_detalle as restrictive for update to authenticated
  using (coalesce(jwt_rol(), '') <> 'vendedor');
