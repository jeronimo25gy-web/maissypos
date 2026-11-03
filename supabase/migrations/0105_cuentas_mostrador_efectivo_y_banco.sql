-- El mostrador usa dos cuentas: la caja del punto físico (efectivo) y una de banco
-- para sus transferencias. Una de cada tipo por empresa.
drop index if exists public.cuentas_un_mostrador;
create unique index cuentas_un_mostrador on public.cuentas (empresa_id, (tipo = 'efectivo')) where mostrador;
