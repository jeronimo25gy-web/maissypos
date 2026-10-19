import { supabase } from './supabase'
import { getEmpresaId } from './empresa'
import { obtenerFechaActual } from './supabase-helpers'
import { calcularStockPorSku } from './inventario-helpers'

// Lotes por dia de produccion (Arepas). Lo que hay en bodega de cada dia =
// lo producido ese dia - lo que salio de el en despachos (menos lo que volvio
// en la liquidacion, que regresa al lote mas viejo que llevaba el carro).
// Luego se cuadra contra el stock total: si falta (ventas de mostrador,
// cambios, ajustes), se descuenta de lo mas viejo; si sobra, se suma a lo mas
// reciente. Se miran los ultimos 14 dias.
const DIAS_ATRAS = 14
// La arepa dura 10 dias refrigerada (vida util del producto) y maximo 5 por
// fuera de la nevera: se avisa cuando a un lote le quedan 3 dias o menos, y al
// despachar si lo que sale ya no alcanza a durar 5 dias por fuera.
export const AVISO_DIAS = 3
export const DIAS_FUERA_NEVERA = 5

const sumarDias = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }

export async function cargarLotes({ excluirDespachoId = null, empresaId = getEmpresaId() } = {}) {
  const hoy = obtenerFechaActual()
  const desde = sumarDias(hoy, -DIAS_ATRAS)
  const [stock, { data: producido }, { data: salidas }, { data: prods }] = await Promise.all([
    calcularStockPorSku({ excluirDespachoId, empresaId }),
    supabase.from('inventario_mov').select('sku, fecha, cantidad').eq('tipo_movimiento', 'entrada').ilike('referencia', 'Producci%').gte('fecha', desde).eq('empresa_id', empresaId),
    supabase.from('lotes_salida').select('despacho_id, sku, fecha_lote, cantidad').gte('fecha_lote', desde).eq('empresa_id', empresaId),
    supabase.from('productos').select('sku, dias_vida_util').eq('empresa_id', empresaId),
  ])
  const vida = Object.fromEntries((prods || []).map(p => [p.sku, Number(p.dias_vida_util) || null]))

  // Lo que volvio de cada despacho: sale de su lote mas viejo.
  const despachos = [...new Set((salidas || []).filter(s => s.despacho_id !== excluirDespachoId).map(s => s.despacho_id))]
  const { data: liq } = despachos.length
    ? await supabase.from('liquidaciones').select('despacho_id, sku, devuelto').in('despacho_id', despachos).eq('empresa_id', empresaId)
    : { data: [] }
  const devuelto = {}
  ;(liq || []).forEach(l => { const k = l.despacho_id + '|' + l.sku; devuelto[k] = (devuelto[k] || 0) + Number(l.devuelto || 0) })

  const neto = {} // sku -> fecha -> lo que salio y no volvio
  const porDespacho = {}
  ;(salidas || []).filter(s => s.despacho_id !== excluirDespachoId).forEach(s => {
    const k = s.despacho_id + '|' + s.sku
    ;(porDespacho[k] = porDespacho[k] || []).push({ fecha: s.fecha_lote, cantidad: Number(s.cantidad) })
  })
  Object.entries(porDespacho).forEach(([k, lista]) => {
    const sku = k.split('|')[1]
    let vuelve = devuelto[k] || 0
    lista.sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach(x => {
      const regresa = Math.min(vuelve, x.cantidad)
      vuelve -= regresa
      const m = (neto[sku] = neto[sku] || {})
      m[x.fecha] = (m[x.fecha] || 0) + x.cantidad - regresa
    })
  })

  const prodPorSku = {}
  ;(producido || []).forEach(p => { const m = (prodPorSku[p.sku] = prodPorSku[p.sku] || {}); m[p.fecha] = (m[p.fecha] || 0) + Number(p.cantidad || 0) })

  const resultado = {}
  const skus = new Set([...Object.keys(prodPorSku), ...Object.keys(neto)])
  skus.forEach(sku => {
    const fechas = [...new Set([...Object.keys(prodPorSku[sku] || {}), ...Object.keys(neto[sku] || {})])].sort()
    let lotes = fechas.map(f => ({ fecha: f, cantidad: (prodPorSku[sku]?.[f] || 0) - (neto[sku]?.[f] || 0) }))
    // Lo que salio de mas de un dia (sin produccion registrada) se cobra a lo mas viejo.
    let deuda = lotes.reduce((s, l) => s + Math.min(0, l.cantidad), 0) * -1
    lotes = lotes.map(l => ({ ...l, cantidad: Math.max(0, l.cantidad) }))
    for (const l of lotes) { if (deuda <= 0) break; const q = Math.min(deuda, l.cantidad); l.cantidad -= q; deuda -= q }
    // Cuadre con el stock total.
    const total = Math.max(0, stock[sku]?.stockActual || 0)
    let suma = lotes.reduce((s, l) => s + l.cantidad, 0)
    if (suma > total) {
      let sobra = suma - total
      for (const l of lotes) { if (sobra <= 0) break; const q = Math.min(sobra, l.cantidad); l.cantidad -= q; sobra -= q }
    } else if (suma < total) {
      if (lotes.length) lotes[lotes.length - 1].cantidad += total - suma
      else lotes.push({ fecha: null, cantidad: total })
    }
    resultado[sku] = lotes.filter(l => l.cantidad > 0).map(l => {
      const v = vida[sku]
      const vence = v && l.fecha ? sumarDias(l.fecha, v) : null
      const diasParaVencer = vence ? Math.round((new Date(vence + 'T12:00:00') - new Date(hoy + 'T12:00:00')) / 864e5) : null
      return { ...l, vence, diasParaVencer }
    })
  })
  return resultado
}

// Reparte una cantidad entre los lotes: 'viejo' saca primero lo mas viejo,
// 'fresco' lo mas reciente. Lo que no alcance queda como de hoy.
export function repartir(lotes, cantidad, preferencia = 'viejo') {
  const hoy = obtenerFechaActual()
  const orden = [...(lotes || [])].sort((a, b) => (a.fecha || hoy).localeCompare(b.fecha || hoy))
  if (preferencia === 'fresco') orden.reverse()
  let resta = Number(cantidad) || 0
  const out = []
  for (const l of orden) {
    if (resta <= 0) break
    const q = Math.min(resta, l.cantidad)
    if (q > 0) { out.push({ fecha: l.fecha || hoy, cantidad: q }); resta -= q }
  }
  if (resta > 0) {
    const h = out.find(x => x.fecha === hoy)
    if (h) h.cantidad += resta
    else out.push({ fecha: hoy, cantidad: resta, faltante: true })
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha))
}

export const etiquetaLote = (fecha) => {
  const hoy = obtenerFechaActual()
  if (!fecha || fecha === hoy) return 'hoy'
  if (fecha === sumarDias(hoy, -1)) return 'ayer'
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}
