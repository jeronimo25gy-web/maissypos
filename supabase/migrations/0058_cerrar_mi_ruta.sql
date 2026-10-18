-- Cierre del dia desde Mi ruta (reemplaza el kiosco).
-- 1) Tipo de ruta: los puntos de venta (carros parqueados) no tienen rutero.
alter table public.rutas add column if not exists tipo text not null default 'ruta';
alter table public.rutas drop constraint if exists rutas_tipo_check;
alter table public.rutas add constraint rutas_tipo_check check (tipo in ('ruta', 'punto_venta'));
update public.rutas set tipo = 'punto_venta' where nombre ilike 'punto de venta%' or nombre ilike 'pdv%';

-- 2) Borrador "en curso": lo que el vendedor va anotando en el dia
-- (transferencias, fiados). Al cerrar pasa a por_aprobar. El vendedor sigue
-- sin poder aprobar: solo toca borradores en curso o por aprobar.
alter table public.liquidaciones_borrador drop constraint if exists liquidaciones_borrador_estado_check;
alter table public.liquidaciones_borrador add constraint liquidaciones_borrador_estado_check check (estado in ('en_curso', 'por_aprobar', 'aprobado'));
drop policy if exists liq_borrador_vendedor_no_aprueba on public.liquidaciones_borrador;
create policy liq_borrador_vendedor_no_aprueba on public.liquidaciones_borrador as restrictive for all
  using (coalesce(public.jwt_rol(), '') <> 'vendedor' or estado in ('en_curso', 'por_aprobar'))
  with check (coalesce(public.jwt_rol(), '') <> 'vendedor' or estado in ('en_curso', 'por_aprobar'));

-- 3) Fotos de soporte (pantallazos de transferencias, recibos de gastos),
-- privadas y separadas por empresa: <empresa_id>/<...>.
insert into storage.buckets (id, name, public) values ('soportes', 'soportes', false) on conflict (id) do nothing;
drop policy if exists soportes_select on storage.objects;
drop policy if exists soportes_insert on storage.objects;
create policy soportes_select on storage.objects for select to authenticated
  using (bucket_id = 'soportes' and (storage.foldername(name))[1]::uuid = any (public.jwt_empresa_ids()));
create policy soportes_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'soportes' and (storage.foldername(name))[1]::uuid = any (public.jwt_empresa_ids()));
