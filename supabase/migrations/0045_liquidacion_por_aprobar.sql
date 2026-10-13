-- Liquidacion por aprobar: el vendedor llena su liquidacion en el kiosco,
-- pero queda como borrador sin mover caja, cartera ni inventario. Solo queda
-- en firme cuando el admin o el auxiliar la revisa (cuenta la devolucion y
-- la plata) y la guarda en Liquidacion. Sin excepciones por vendedor.

create table if not exists public.liquidaciones_borrador (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  despacho_id uuid not null references public.despachos_encab(id) on delete cascade,
  vendedor_id uuid references public.vendedores(id),
  fecha date not null,
  datos jsonb not null,
  efectivo_declarado numeric default 0,
  diferencia numeric default 0,
  estado text not null default 'por_aprobar' check (estado in ('por_aprobar', 'aprobado')),
  enviado_por text,
  enviado_at timestamptz default now(),
  aprobado_por text,
  aprobado_at timestamptz,
  created_at timestamptz default now(),
  unique (despacho_id)
);
create index if not exists liquidaciones_borrador_empresa_estado on public.liquidaciones_borrador (empresa_id, estado);

alter table public.liquidaciones_borrador enable row level security;
create policy liq_borrador_select on public.liquidaciones_borrador for select to authenticated using (empresa_id = any (jwt_empresa_ids()));
create policy liq_borrador_insert on public.liquidaciones_borrador for insert to authenticated with check (empresa_id = any (jwt_empresa_ids()));
create policy liq_borrador_update on public.liquidaciones_borrador for update to authenticated using (empresa_id = any (jwt_empresa_ids())) with check (empresa_id = any (jwt_empresa_ids()));
create policy liq_borrador_delete on public.liquidaciones_borrador for delete to authenticated using (empresa_id = any (jwt_empresa_ids()) and coalesce(jwt_rol(), '') <> 'vendedor');
-- El vendedor solo puede dejarlo por aprobar: aprobar es del admin/auxiliar.
create policy liq_borrador_vendedor_no_aprueba on public.liquidaciones_borrador as restrictive for all to authenticated
  using (coalesce(jwt_rol(), '') <> 'vendedor' or estado = 'por_aprobar')
  with check (coalesce(jwt_rol(), '') <> 'vendedor' or estado = 'por_aprobar');

-- El vendedor no escribe plata ni liquidaciones en firme, ni por fuera de la app.
do $$
declare t text;
begin
  foreach t in array array['liquidaciones', 'liquidaciones_detalle', 'liquidaciones_fiados', 'liquidaciones_gastos',
    'liquidaciones_descuentos', 'movimientos_tesoreria', 'cartera_fiados', 'obsequios', 'consumos_empleado', 'transferencias_ruta']
  loop
    execute format('drop policy if exists vendedor_no_escribe_ins on public.%I', t);
    execute format('drop policy if exists vendedor_no_escribe_upd on public.%I', t);
    execute format('drop policy if exists vendedor_no_escribe_del on public.%I', t);
    execute format($p$create policy vendedor_no_escribe_ins on public.%I as restrictive for insert to authenticated with check (coalesce(jwt_rol(), '') <> 'vendedor')$p$, t);
    execute format($p$create policy vendedor_no_escribe_upd on public.%I as restrictive for update to authenticated using (coalesce(jwt_rol(), '') <> 'vendedor')$p$, t);
    execute format($p$create policy vendedor_no_escribe_del on public.%I as restrictive for delete to authenticated using (coalesce(jwt_rol(), '') <> 'vendedor')$p$, t);
  end loop;
end $$;

-- El vendedor no puede marcar su despacho como liquidado: solo pasarlo a por aprobar.
drop policy if exists vendedor_estado_despacho on public.despachos_encab;
create policy vendedor_estado_despacho on public.despachos_encab as restrictive for update to authenticated
  using (true)
  with check (coalesce(jwt_rol(), '') <> 'vendedor' or estado in ('despachado', 'por_aprobar'));
