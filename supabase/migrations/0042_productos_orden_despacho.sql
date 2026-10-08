-- Orden fijo en que se carga el carro (despacho, liquidacion, inventario...).
-- Las centenas marcan el grupo fisico: 1xx arepas, 2xx panaderia,
-- 3xx nevera (lacteos y lo refrigerado), 4xx carnicos, 5xx huevos.
-- (Aplicada por MCP el 2026-10-08; los valores por sku se cargaron ahi.)
alter table public.productos add column if not exists orden_despacho integer;
