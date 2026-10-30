-- La cuenta del mostrador de cada empresa: sale en los comprobantes de
-- mostrador a credito (y en los domicilios express) para que el cliente sepa
-- a donde transferir. Una sola por empresa.
alter table public.cuentas add column if not exists mostrador boolean not null default false;
create unique index if not exists cuentas_un_mostrador on public.cuentas (empresa_id) where mostrador;
