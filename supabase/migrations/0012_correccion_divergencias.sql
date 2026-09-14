-- Faltaba la opcion real de correccion: hoy "Aprobar" confia ciegamente en
-- cantidad_fisica (lo que el auxiliar anoto), sin forma de decir "conto 10
-- pero en realidad habia 11" antes de ajustar el inventario. Se agrega:
--   - cantidad_corregida: el numero real que se usa para el ajuste (por
--     defecto igual a cantidad_fisica si no hace falta corregir nada)
--   - motivo_ajuste: por que se corrigio (o por que se aprobo tal cual),
--     separado de motivo_rechazo que ya existia para el caso de rechazo

alter table public.divergencias_inventario
  add column if not exists cantidad_corregida numeric,
  add column if not exists motivo_ajuste text;
