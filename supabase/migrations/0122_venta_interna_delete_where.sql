-- La venta interna fallaba desde la app: el borrado de la tabla temporal sin
-- WHERE lo bloquea la protección de borrados masivos. Se agrega WHERE true.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public._sincronizar_venta_interna(uuid)'::regprocedure);
  v_def := replace(v_def, 'delete from _vi_lineas;', 'delete from _vi_lineas where true;');
  execute v_def;
end $$;
