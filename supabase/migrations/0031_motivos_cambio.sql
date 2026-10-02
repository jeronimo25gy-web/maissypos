-- Catalogo de motivos fijos para Cambios (novedades.motivo) -- antes era
-- texto libre, lo que impide agrupar ("danada", "se dano", "llego rota" son
-- 3 cosas distintas para un reporte). Mismo patron que categorias_gasto.
-- Se siembra solo para Arepas Maissy (no se usa en Distri Maissy, que sigue
-- con texto libre tal cual estaba -- cambios/page.js cae a eso si la
-- empresa no tiene ningun motivo_cambio activo).

create table if not exists public.motivos_cambio (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  nombre text not null,
  estado boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.motivos_cambio enable row level security;
drop policy if exists "motivos_cambio_select" on public.motivos_cambio;
drop policy if exists "motivos_cambio_insert" on public.motivos_cambio;
drop policy if exists "motivos_cambio_update" on public.motivos_cambio;
create policy "motivos_cambio_select" on public.motivos_cambio for select using (empresa_id = any (public.jwt_empresa_ids()));
create policy "motivos_cambio_insert" on public.motivos_cambio for insert with check (empresa_id = any (public.jwt_empresa_ids()));
create policy "motivos_cambio_update" on public.motivos_cambio for update using (empresa_id = any (public.jwt_empresa_ids())) with check (empresa_id = any (public.jwt_empresa_ids()));

insert into public.motivos_cambio (empresa_id, nombre) values
  ('aef04001-a941-4ad3-bd22-397a76ffc17d', 'Defecto de fabricacion/calidad'),
  ('aef04001-a941-4ad3-bd22-397a76ffc17d', 'Danada en transporte'),
  ('aef04001-a941-4ad3-bd22-397a76ffc17d', 'Producto vencido'),
  ('aef04001-a941-4ad3-bd22-397a76ffc17d', 'Error de pedido/despacho'),
  ('aef04001-a941-4ad3-bd22-397a76ffc17d', 'Cliente no la quiso'),
  ('aef04001-a941-4ad3-bd22-397a76ffc17d', 'Otro');
