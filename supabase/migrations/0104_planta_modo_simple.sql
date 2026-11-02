-- Modo de la planta por empresa y marca de Maíz nuevo por lote: el lote marcado
-- se registra con todas las mediciones aunque la planta esté en modo simple.
alter table public.empresas add column if not exists planta_simple boolean not null default false;
alter table public.produccion_cochadas add column if not exists maiz_nuevo boolean not null default false;
