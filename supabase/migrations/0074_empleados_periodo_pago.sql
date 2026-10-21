-- Periodo de pago por empleado: día en que empieza cada quincena.
-- Por defecto del 1 al 15 y del 16 a fin de mes; por ejemplo 5 y 21 = del 5
-- al 20 y del 21 al 4 del mes siguiente.
alter table empleados add column if not exists inicio_q1 smallint not null default 1;
alter table empleados add column if not exists inicio_q2 smallint not null default 16;
alter table empleados add constraint empleados_periodo_pago_check check (inicio_q1 between 1 and 15 and inicio_q2 between 14 and 28 and inicio_q2 > inicio_q1);
