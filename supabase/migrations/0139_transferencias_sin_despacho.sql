-- Las transferencias por verificar de Mostrador, Domicilios y abonos de Cartera
-- no vienen de un despacho: despacho_id puede ir vacío (0132 y 0133 lo daban por
-- hecho y el insert fallaba con "null value in column despacho_id").
alter table public.transferencias_ruta alter column despacho_id drop not null;
