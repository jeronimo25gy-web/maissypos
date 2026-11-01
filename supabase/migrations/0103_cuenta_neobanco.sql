-- Tipo de cuenta Neobanco para cuentas como Nubank.
alter table public.cuentas drop constraint if exists cuentas_tipo_cuenta_check;
alter table public.cuentas add constraint cuentas_tipo_cuenta_check
  check (tipo_cuenta is null or tipo_cuenta = any (array['ahorros'::text, 'corriente'::text, 'billetera'::text, 'neobanco'::text]));
