-- Materias primas que no pasan por el conteo físico, como las bolsas: su saldo se
-- escribe en Inventario. Es una marca propia: no depende de la categoría.
alter table public.productos add column if not exists no_se_cuenta boolean not null default false;

update public.productos set no_se_cuenta = true
where tipo = 'materia_prima' and nombre ilike 'bolsa%'
  and empresa_id = 'aef04001-a941-4ad3-bd22-397a76ffc17d';
