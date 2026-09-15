-- Facturacion electronica: por ahora la factura DIAN se crea a mano en
-- Siigo (su plan actual no incluye la API para automatizarlo). Lo que se
-- necesita en MaissyPOS es simple: cuando un cliente exige factura
-- electronica, subir el PDF que Siigo genera como evidencia de que se
-- hizo y se envio -- ligado a la venta, con su propio historial.

insert into storage.buckets (id, name, public)
values ('facturas', 'facturas', true)
on conflict (id) do nothing;

drop policy if exists "facturas_storage_select" on storage.objects;
create policy "facturas_storage_select" on storage.objects
for select using (bucket_id = 'facturas');

drop policy if exists "facturas_storage_insert" on storage.objects;
create policy "facturas_storage_insert" on storage.objects
for insert with check (bucket_id = 'facturas' and auth.role() = 'authenticated');

drop policy if exists "facturas_storage_delete" on storage.objects;
create policy "facturas_storage_delete" on storage.objects
for delete using (bucket_id = 'facturas' and auth.role() = 'authenticated');

create table if not exists public.facturas_electronicas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  venta_id uuid references public.ventas_encab(id),
  cliente_id uuid references public.clientes(id),
  numero_factura text,
  archivo_url text not null,
  subido_por text not null,
  created_at timestamptz not null default now()
);

alter table public.facturas_electronicas enable row level security;

drop policy if exists "facturas_electronicas_select" on public.facturas_electronicas;
create policy "facturas_electronicas_select" on public.facturas_electronicas
for select using (empresa_id = any (public.jwt_empresa_ids()));

drop policy if exists "facturas_electronicas_insert" on public.facturas_electronicas;
create policy "facturas_electronicas_insert" on public.facturas_electronicas
for insert with check (empresa_id = any (public.jwt_empresa_ids()));

drop policy if exists "facturas_electronicas_delete" on public.facturas_electronicas;
create policy "facturas_electronicas_delete" on public.facturas_electronicas
for delete using (empresa_id = any (public.jwt_empresa_ids()));
