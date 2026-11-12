-- Lo que la empresa le debe al vendedor y se le paga en la nómina: propinas de
-- clientes que llegaron de más en una transferencia y sobrantes de ruta ya
-- confirmados. Los descuadres se le siguen restando en la misma nómina.
-- No es costo laboral: la plata entró a la cuenta y sale igual en el pago.
-- estado: pendiente (se paga en la próxima nómina), pagado (ya salió en una
-- nómina) o empresa (sobrante que se decidió dejar en la empresa).
create table if not exists public.nomina_a_favor (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  vendedor_id uuid references public.vendedores(id),
  empleado_id uuid references public.empleados(id),
  fecha date not null,
  valor numeric not null check (valor > 0),
  origen text not null check (origen in ('propina', 'sobrante')),
  concepto text,
  transferencia_id uuid references public.transferencias_ruta(id) on delete set null,
  despacho_id uuid references public.despachos_encab(id) on delete set null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'pagado', 'empresa')),
  nomina_pago_id uuid references public.nomina_pagos(id) on delete set null,
  registrado_por text,
  created_at timestamptz not null default now()
);
create unique index if not exists nomina_a_favor_sobrante_unico on public.nomina_a_favor (despacho_id) where origen = 'sobrante';
create index if not exists nomina_a_favor_empresa_estado on public.nomina_a_favor (empresa_id, estado);

alter table public.nomina_a_favor enable row level security;
create policy admin_select on public.nomina_a_favor for select using (empresa_id = any (public.jwt_empresa_ids()) and public.jwt_rol() = 'admin');
create policy admin_insert on public.nomina_a_favor for insert with check (empresa_id = any (public.jwt_empresa_ids()) and public.jwt_rol() = 'admin');
create policy admin_update on public.nomina_a_favor for update using (empresa_id = any (public.jwt_empresa_ids()) and public.jwt_rol() = 'admin') with check (empresa_id = any (public.jwt_empresa_ids()) and public.jwt_rol() = 'admin');
create policy admin_delete on public.nomina_a_favor for delete using (empresa_id = any (public.jwt_empresa_ids()) and public.jwt_rol() = 'admin' and estado <> 'pagado');
create policy solo_lectura_ins on public.nomina_a_favor as restrictive for insert with check (not (select public.cliente_bloqueado()));
create policy solo_lectura_upd on public.nomina_a_favor as restrictive for update using (not (select public.cliente_bloqueado())) with check (not (select public.cliente_bloqueado()));
create policy solo_lectura_del on public.nomina_a_favor as restrictive for delete using (not (select public.cliente_bloqueado()));
create policy suspendido_sin_lectura on public.nomina_a_favor as restrictive for select using (not (select public.cliente_suspendido()));

-- La nómina guarda aparte lo que se pagó a favor (no entra a Finanzas como costo).
alter table public.nomina_pagos add column if not exists total_a_favor numeric not null default 0;
