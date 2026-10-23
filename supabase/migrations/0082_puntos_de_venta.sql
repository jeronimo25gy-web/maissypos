-- Puntos de venta en el rutero: el punto (parque, unidad, esquina) es una
-- parada como el edificio, con su horario y sus clientes adentro. En el
-- rutero lo representa un cliente "ancla" (tipo_inmueble 'punto') que
-- también recibe las ventas sueltas del punto; los clientes del punto
-- (edificio_id = punto) no van uno por uno en el rutero.
alter table public.edificios add column if not exists tipo text not null default 'edificio';
alter table public.edificios drop constraint if exists edificios_tipo_check;
alter table public.edificios add constraint edificios_tipo_check check (tipo in ('edificio', 'punto'));
alter table public.edificios add column if not exists ruta_id uuid references public.rutas(id);
alter table public.edificios add column if not exists hora_llegada time;
alter table public.edificios add column if not exists hora_salida time;

-- Si el cliente acepta los avisos de llegada por WhatsApp.
alter table public.clientes add column if not exists avisos_whatsapp boolean not null default true;
