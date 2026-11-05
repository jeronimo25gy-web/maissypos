-- Productos que se venden por peso (kilos con decimales), como el Kilo de Masa.
alter table public.productos add column if not exists por_peso boolean not null default false;
update public.productos set por_peso = true where sku = 'ARE-009' and empresa_id = 'aef04001-a941-4ad3-bd22-397a76ffc17d';
