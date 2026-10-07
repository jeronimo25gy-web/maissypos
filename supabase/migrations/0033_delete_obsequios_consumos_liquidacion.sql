-- Reabrir / volver a guardar una liquidacion (auxiliar o kiosco) borra lo que
-- esa liquidacion habia generado antes de reinsertarlo. obsequios y
-- consumos_empleado no tenian politica DELETE, asi que el borrado no hacia
-- nada (RLS lo ignora en silencio) y cada re-guardado los duplicaba.
-- Solo se permite borrar filas ligadas a un despacho (las que crea la
-- liquidacion); los consumos de empleado de otros origenes siguen sin borrado.

create policy empresa_id_delete on public.obsequios
  for delete using (empresa_id = any (jwt_empresa_ids()) and despacho_id is not null);

create policy consumos_empleado_delete on public.consumos_empleado
  for delete using (empresa_id = any (jwt_empresa_ids()) and despacho_id is not null);
