-- Cambios reportados en la liquidación: marca estable de origen. Antes se
-- reconocían por el motivo "Reportado en liquidacion del kiosco", pero al
-- clasificarlos en Cambios el motivo se cambia (Hongos, Empaque dañado...) y al
-- volver a guardar la liquidación se reportaban otra vez: cambios duplicados y
-- doble descuento al proveedor.
alter table public.novedades add column if not exists de_liquidacion boolean not null default false;

update public.novedades set de_liquidacion = true
where motivo = 'Reportado en liquidacion del kiosco'
   or (momento = 'en_ruta' and quien_registra = 'vendedor' and vendedor_id is not null and fecha >= '2026-11-02');
