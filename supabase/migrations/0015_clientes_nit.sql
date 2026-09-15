-- clientes ya existia con un esquema propio (tipo_negocio, ruta_id,
-- vendedor_id, dias_credito, cupo_credito) pensado para clientes de ruta
-- con credito -- distinto al que se habia escrito en el codigo nuevo
-- (nit, contacto). Se adapta el codigo al esquema real en vez de duplicar
-- la tabla. Solo falta nit, util para identificar el cliente.
alter table public.clientes
  add column if not exists nit text;
