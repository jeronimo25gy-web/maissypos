import { supabase } from './supabase'
import { getEmpresaId } from './empresa'

export const calcularStockPorSku = async () => {
  const empresaId = getEmpresaId()

  const { data: conteos } = await supabase
    .from('conteo_fisico')
    .select('sku, fecha, cantidad_fisica, created_at')
    .eq('empresa_id', empresaId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })

  const stockPorSku = {}
  ;(conteos || []).forEach(c => {
    if (!(c.sku in stockPorSku)) stockPorSku[c.sku] = { cantidad: c.cantidad_fisica, fecha: c.fecha }
  })

  const fechaMinima = Object.values(stockPorSku).reduce((min, c) => (!min || c.fecha < min) ? c.fecha : min, null)
  const compradoPorSku = {}
  const salidaPorSku = {}
  const despachadoPorSku = {}

  if (fechaMinima) {
    const { data: movimientos } = await supabase
      .from('inventario_mov')
      .select('sku, cantidad, fecha, tipo_movimiento')
      .eq('empresa_id', empresaId)
      .in('tipo_movimiento', ['entrada', 'salida'])
      .gte('fecha', fechaMinima)
    ;(movimientos || []).forEach(m => {
      const stockInfo = stockPorSku[m.sku]
      if (!stockInfo || m.fecha < stockInfo.fecha) return
      const destino = m.tipo_movimiento === 'entrada' ? compradoPorSku : salidaPorSku
      destino[m.sku] = (destino[m.sku] || 0) + (m.cantidad || 0)
    })

    const { data: detalles } = await supabase
      .from('despachos_detalle')
      .select('sku, total, despacho_id')
      .eq('empresa_id', empresaId)
    const idsDespachos = [...new Set((detalles || []).map(d => d.despacho_id))]
    const encabPorId = {}
    if (idsDespachos.length > 0) {
      const { data: encabs } = await supabase
        .from('despachos_encab')
        .select('id, fecha, estado')
        .in('id', idsDespachos)
        .gte('fecha', fechaMinima)
        .neq('estado', 'cancelado')
      ;(encabs || []).forEach(e => { encabPorId[e.id] = e })
    }
    ;(detalles || []).forEach(d => {
      const encab = encabPorId[d.despacho_id]
      if (!encab) return
      const stockInfo = stockPorSku[d.sku]
      if (!stockInfo || encab.fecha < stockInfo.fecha) return
      despachadoPorSku[d.sku] = (despachadoPorSku[d.sku] || 0) + (d.total || 0)
    })
  }

  const resultado = {}
  Object.keys(stockPorSku).forEach(sku => {
    const stockInfo = stockPorSku[sku]
    resultado[sku] = {
      stockActual: stockInfo.cantidad + (compradoPorSku[sku] || 0) - (salidaPorSku[sku] || 0) - (despachadoPorSku[sku] || 0),
      fechaConteo: stockInfo.fecha,
    }
  })
  return resultado
}
