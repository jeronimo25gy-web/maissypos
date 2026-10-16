-- Descuentos: solo los clientes habilitados por el admin (precio especial por
-- producto en clientes_precios). El vendedor los usa al vender pero no los
-- crea ni los cambia.
drop policy if exists clientes_precios_vendedor_no_escribe on public.clientes_precios;
create policy clientes_precios_vendedor_no_escribe on public.clientes_precios as restrictive for all to authenticated
  using (true) with check (coalesce(jwt_rol(), '') <> 'vendedor');
drop policy if exists clientes_precios_vendedor_no_borra on public.clientes_precios;
create policy clientes_precios_vendedor_no_borra on public.clientes_precios as restrictive for delete to authenticated
  using (coalesce(jwt_rol(), '') <> 'vendedor');

-- Reprogramar visita: el vendedor la pasa a otro dia y ese dia le sale de
-- primero en el rutero.
alter table public.visitas_ruta drop constraint if exists visitas_ruta_resultado_check;
alter table public.visitas_ruta add constraint visitas_ruta_resultado_check check (resultado in ('compro', 'no_compro', 'no_estaba', 'reprogramada'));
alter table public.visitas_ruta add column if not exists reprogramada_para date, add column if not exists nota text;
create index if not exists visitas_ruta_reprogramadas on public.visitas_ruta (ruta_id, reprogramada_para) where resultado = 'reprogramada';
