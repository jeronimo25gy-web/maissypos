import { supabase } from './supabase'
import { getEmpresaId } from './empresa'

// Los reportes agregados (Reportes, Costeo, Financiero, Ejecutivo) suman
// filas de `liquidaciones` de MUCHAS rutas a la vez por sku -- no se puede
// aplicar un solo precio de ruta como en Despacho/Liquidacion (donde solo
// hay una ruta en pantalla). Hay que saber de que ruta vino cada fila antes
// de multiplicar por precio, para no mezclar el precio especial de una ruta
// con las ventas de otra que vendio al precio normal.
export const cargarContextoPreciosRuta = async (despachoIds) => {
  const empresaId = getEmpresaId()
  const idsUnicos = [...new Set((despachoIds || []).filter(Boolean))]
  if (idsUnicos.length === 0) return { rutaPorDespacho: {}, preciosPorRuta: {} }

  const { data: despachos } = await supabase.from('despachos_encab').select('id, ruta_id').in('id', idsUnicos)
  const rutaPorDespacho = Object.fromEntries((despachos || []).map(d => [d.id, d.ruta_id]))

  const rutaIds = [...new Set(Object.values(rutaPorDespacho).filter(Boolean))]
  const preciosPorRuta = {}
  if (rutaIds.length > 0) {
    const { data: precios } = await supabase.from('rutas_precios').select('ruta_id, sku, precio_especial').eq('empresa_id', empresaId).in('ruta_id', rutaIds)
    ;(precios || []).forEach(p => {
      if (!preciosPorRuta[p.ruta_id]) preciosPorRuta[p.ruta_id] = {}
      preciosPorRuta[p.ruta_id][p.sku] = p.precio_especial
    })
  }
  return { rutaPorDespacho, preciosPorRuta }
}

// Precio a usar para una fila de liquidacion puntual (identificada por su
// despacho_id y sku): el especial de su ruta si existe, si no el de catalogo
// que se le pase como base.
export const precioEfectivo = (despachoId, sku, precioBase, ctx) => {
  const rutaId = ctx.rutaPorDespacho[despachoId]
  const especial = rutaId ? ctx.preciosPorRuta[rutaId]?.[sku] : undefined
  return especial !== undefined ? especial : precioBase
}
