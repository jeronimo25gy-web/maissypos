import { supabase } from './supabase'
import { getEmpresaId } from './empresa'

// Los obsequios quedan dentro del "vendido" de liquidaciones (salieron y no
// volvieron, y la liquidacion los resta de la plata a entregar), pero no son
// venta. Esto los devuelve con la misma forma de una fila de liquidaciones y
// en negativo, para concatenarlos a las liquidaciones de cualquier informe de
// ventas y que se descuenten solos al sumar por ruta, vendedor, sku o fecha.
// Inventario y compras NO deben usarlo: ahi el obsequio si es mercancia que salio.
export async function obsequiosEnNegativo({ desde, hasta, fecha, empresaId } = {}) {
  let q = supabase.from('obsequios').select('despacho_id, vendedor_id, sku, fecha, cantidad, valor_unitario').eq('empresa_id', empresaId || getEmpresaId())
  if (fecha) q = q.eq('fecha', fecha)
  if (desde) q = q.gte('fecha', desde)
  if (hasta) q = q.lte('fecha', hasta)
  const { data } = await q
  return (data || []).map(o => ({
    despacho_id: o.despacho_id,
    vendedor_id: o.vendedor_id,
    sku: o.sku,
    fecha: o.fecha,
    despachado: 0,
    devuelto: 0,
    cambio: 0,
    vendido_neto: -(o.cantidad || 0),
    efectivo_esperado: -((o.cantidad || 0) * (o.valor_unitario || 0)),
    es_obsequio: true,
  }))
}

export const conObsequiosRestados = async (liquidaciones, rango) =>
  [...(liquidaciones || []), ...(await obsequiosEnNegativo(rango))]
