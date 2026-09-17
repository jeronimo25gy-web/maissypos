-- Compras ahora deja editar el precio de cada producto al momento de la
-- compra (antes era fijo = costo_compra). Eso resuelve que Costeo refleje
-- el precio real, pero abre una puerta de fraude: alguien con acceso a
-- Compras (no solo a Maestros, que jero controla) podria registrar un
-- precio distinto al de la factura real sin que el admin se entere.
--
-- Se agrega un flag por empresa (no a la fuerza global) para avisar por
-- alertas_admin + WhatsApp cada vez que el precio de una compra difiera
-- del costo_compra anterior del producto -- asi el admin puede pedir la
-- factura oficial y confirmar el cambio. Por defecto queda activo (mas
-- seguro), y se apaga por empresa donde no haga falta (p.ej. si el mismo
-- dueño es quien compra).

alter table public.empresas
  add column if not exists alertar_cambio_precio_compra boolean not null default true;
