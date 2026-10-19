-- Kilos de maíz puestos en el lote cuando se pesan con la báscula de
-- plataforma (a veces no son bultos exactos: "1 y un poquito").
alter table public.produccion_cochadas add column if not exists maiz_kg numeric(10,2);
