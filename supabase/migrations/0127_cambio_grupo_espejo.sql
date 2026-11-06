-- Cambios que una empresa del grupo le descuenta a otra (Distri clasifica
-- "Descuenta al proveedor" con proveedor Arepas Maissy): en la empresa que
-- vendió queda el cambio registrado (Cambios, en bodega, cliente Distri) y la
-- nota crédito en su cartera, para que lo que una debe y la otra cobra cuadre.
alter table public.novedades add column if not exists origen_id uuid unique references public.novedades(id) on delete set null;

create or replace function public._reflejar_cambio_grupo(p_novedad_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  n record; v_otra uuid; v_sku text; v_cli record; v_emp text; v_nueva uuid;
  v_resta numeric; f record; v_v numeric; v_nota text;
begin
  select nv.*, p.empresa_grupo_id, pc.id prod_id, pc.nombre prod_nombre, pc.producto_espejo_id
  into n
  from novedades nv
  join proveedores p on p.id = nv.proveedor_id
  left join productos pc on pc.empresa_id = nv.empresa_id and pc.sku = nv.sku
  where nv.id = p_novedad_id;
  if n.id is null or n.tipo <> 'descuenta_proveedor' or not coalesce(n.revisado, false)
     or coalesce(n.valor, 0) <= 0 or n.empresa_grupo_id is null or n.empresa_grupo_id = n.empresa_id then
    return null;
  end if;
  if exists (select 1 from novedades where origen_id = n.id) then return null; end if;
  v_otra := n.empresa_grupo_id;

  -- El mismo producto en la otra empresa: vínculo de Maestros en cualquier
  -- dirección, y si no está ligado, por el nombre.
  select sku into v_sku from productos where empresa_id = v_otra and id = n.producto_espejo_id;
  if v_sku is null then select sku into v_sku from productos where empresa_id = v_otra and producto_espejo_id = n.prod_id limit 1; end if;
  if v_sku is null then select sku into v_sku from productos where empresa_id = v_otra and lower(trim(nombre)) = lower(trim(n.prod_nombre)) limit 1; end if;
  if v_sku is null then v_sku := n.sku; end if;

  select nombre into v_emp from empresas where id = n.empresa_id;
  select * into v_cli from clientes where empresa_id = v_otra and empresa_grupo_id = n.empresa_id limit 1;

  insert into novedades (empresa_id, fecha, sku, cantidad, tipo, momento, quien_registra, revisado, motivo,
    cliente_id, nombre_cliente, valor, precio, destino, origen_id)
  values (v_otra, n.fecha, v_sku, n.cantidad, 'perdida_negocio', 'en_bodega', 'admin', true,
    'Descontado por ' || coalesce(v_emp, 'empresa del grupo') || coalesce(': ' || nullif(n.motivo, 'Reportado en liquidacion del kiosco'), ''),
    v_cli.id, coalesce(v_cli.nombre, v_emp), n.valor, round(n.valor / nullif(n.cantidad, 0), 2), 'desecho', n.id)
  returning id into v_nueva;

  -- Nota crédito en la cartera de la otra empresa, primero lo más viejo.
  if v_cli.id is not null then
    v_resta := n.valor;
    v_nota := 'Cambio descontado por ' || coalesce(v_emp, 'empresa del grupo') || ': ' || coalesce(n.prod_nombre, n.sku) || ' x' || trim(to_char(n.cantidad, 'FM999990.###'));
    for f in select * from cartera_fiados where empresa_id = v_otra and cliente_id = v_cli.id and estado = 'pendiente' and saldo > 0
             order by fecha_fiado, created_at for update loop
      exit when v_resta <= 0.5;
      v_v := least(v_resta, f.saldo);
      insert into abonos_cartera (empresa_id, cartera_fiado_id, fecha, valor, cuenta_id, nota, registrado_por)
      values (v_otra, f.id, n.fecha, v_v, null, v_nota, 'Sistema');
      if f.saldo - v_v <= 0.5 then
        update cartera_fiados set saldo = 0, estado = 'pagado', fecha_pagado = now() where id = f.id;
      else
        update cartera_fiados set saldo = f.saldo - v_v where id = f.id;
      end if;
      v_resta := v_resta - v_v;
    end loop;
  end if;
  return v_nueva;
end;
$$;
revoke all on function public._reflejar_cambio_grupo(uuid) from public, anon, authenticated;

create or replace function public._trg_reflejar_cambio_grupo()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.tipo = 'descuenta_proveedor' and coalesce(new.revisado, false) and coalesce(new.valor, 0) > 0 and new.proveedor_id is not null then
    perform public._reflejar_cambio_grupo(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists reflejar_cambio_grupo on public.novedades;
create trigger reflejar_cambio_grupo after insert or update of tipo, revisado, valor, proveedor_id on public.novedades
for each row execute function public._trg_reflejar_cambio_grupo();

-- Los que ya estaban (Distri a Arepas desde el arranque).
select public._reflejar_cambio_grupo(id) from public.novedades
where tipo = 'descuenta_proveedor' and revisado and valor > 0 and fecha >= '2026-11-02'
  and proveedor_id in (select id from public.proveedores where empresa_grupo_id is not null);
