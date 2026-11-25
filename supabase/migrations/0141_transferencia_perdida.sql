-- Transferencia que nunca llegó y se da por perdida: queda como gasto de la
-- empresa (gastos_admin, categoría "Transferencias no recibidas") con su motivo.
-- Solo Gerencia la clasifica así; se puede devolver a por verificar si aparece.
alter table public.transferencias_ruta drop constraint if exists transferencias_ruta_estado_check;
alter table public.transferencias_ruta add constraint transferencias_ruta_estado_check
  check (estado in ('verificada', 'por_verificar', 'recibida', 'cargada', 'descontada', 'a_cartera', 'perdida'));
alter table public.transferencias_ruta add column if not exists motivo_perdida text;
alter table public.transferencias_ruta add column if not exists gasto_admin_id uuid references public.gastos_admin(id) on delete set null;

insert into public.categorias_gasto (empresa_id, nombre, tipo, estado)
select e.id, 'Transferencias no recibidas', 'admin', true
from public.empresas e
where not exists (select 1 from public.categorias_gasto c where c.empresa_id = e.id and c.tipo = 'admin' and c.nombre = 'Transferencias no recibidas');
