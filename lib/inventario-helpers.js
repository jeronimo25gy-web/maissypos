import { supabase } from './supabase'
import { getEmpresaId } from './empresa'

// excluirDespachoId: al editar un despacho ya guardado, su propia carga no
// debe restarse del disponible contra el que se valida esa misma edicion.
export const calcularStockPorSku = async ({ excluirDespachoId = null } = {}) => {
  const empresaId = getEmpresaId()

  const [{ data: conteos }, { data: empresaRow }] = await Promise.all([
    supabase
      .from('conteo_fisico')
      .select('sku, fecha, cantidad_fisica, cantidad_sistema, created_at')
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('empresas').select('modelos').eq('id', empresaId).maybeSingle(),
  ])

  // El fallback de "ledger puro sin conteo" de abajo es especifico del modelo
  // 'produccion' (Arepas Maissy: produccion diaria + compras, sin conteo
  // manual) -- Distri Maissy trabaja con conteo fisico diario por ruta como
  // fuente de verdad, y su comportamiento no debe cambiar.
  const esModeloProduccion = (empresaRow?.modelos || []).includes('produccion')

  // La base del stock es lo que el sistema esperaba al momento del conteo, no
  // lo que se conto: si hay diferencia, entra como movimiento de ajuste solo
  // cuando alguien la aprueba en Ajustes de Inventario. Antes la base era lo
  // contado Y ademas la aprobacion sumaba el ajuste, asi que la diferencia
  // quedaba aplicada dos veces (sistema 100, contado 90, aprobado -> 80).
  // Requiere que el conteo se haga antes de cualquier movimiento del dia.
  const stockPorSku = {}
  ;(conteos || []).forEach(c => {
    if (!(c.sku in stockPorSku)) {
      stockPorSku[c.sku] = { cantidad: c.cantidad_sistema ?? c.cantidad_fisica, contada: c.cantidad_fisica, fecha: c.fecha, creado: c.created_at }
    }
  })

  // Un movimiento entra encima del conteo si es de un dia posterior, o del
  // mismo dia pero registrado despues de guardar el conteo. Lo del mismo dia
  // registrado ANTES ya esta dentro de cantidad_sistema (el conteo lo calculo
  // con este mismo helper); sumarlo otra vez lo contaba doble cuando el conteo
  // no se hacia a primera hora (ej. Distri cuenta al llegar las rutas).
  const cuentaDespuesDelConteo = (info, fecha, creado) => {
    if (fecha > info.fecha) return true
    if (fecha < info.fecha) return false
    if (!info.creado || !creado) return true
    return new Date(creado) > new Date(info.creado)
  }

  // Un producto sin ningun conteo fisico todavia no debe quedar sin dato --
  // arranca en 0 desde el principio de los tiempos, para que el stock se
  // pueda calcular como un ledger puro (compras - consumo - despacho) sin
  // depender de que alguien lo haya contado a mano alguna vez.
  if (esModeloProduccion) {
    const { data: productosAll } = await supabase.from('productos').select('sku').eq('empresa_id', empresaId)
    ;(productosAll || []).forEach(p => {
      if (!(p.sku in stockPorSku)) stockPorSku[p.sku] = { cantidad: 0, fecha: '1900-01-01', sinConteo: true }
    })
  }

  const fechaMinima = Object.values(stockPorSku).reduce((min, c) => (!min || c.fecha < min) ? c.fecha : min, null)
  const compradoPorSku = {}
  const salidaPorSku = {}
  const despachadoPorSku = {}
  const devueltoPorSku = {}

  if (fechaMinima) {
    const { data: liquidaciones } = await supabase
      .from('liquidaciones')
      .select('sku, devuelto, fecha, created_at')
      .eq('empresa_id', empresaId)
      .gt('devuelto', 0)
      .gte('fecha', fechaMinima)
    ;(liquidaciones || []).forEach(l => {
      const stockInfo = stockPorSku[l.sku]
      if (!stockInfo || !cuentaDespuesDelConteo(stockInfo, l.fecha, l.created_at)) return
      devueltoPorSku[l.sku] = (devueltoPorSku[l.sku] || 0) + (l.devuelto || 0)
    })

    const { data: movimientos } = await supabase
      .from('inventario_mov')
      .select('sku, cantidad, fecha, tipo_movimiento, created_at')
      .eq('empresa_id', empresaId)
      .in('tipo_movimiento', ['entrada', 'salida'])
      .gte('fecha', fechaMinima)
    ;(movimientos || []).forEach(m => {
      const stockInfo = stockPorSku[m.sku]
      if (!stockInfo || !cuentaDespuesDelConteo(stockInfo, m.fecha, m.created_at)) return
      const destino = m.tipo_movimiento === 'entrada' ? compradoPorSku : salidaPorSku
      destino[m.sku] = (destino[m.sku] || 0) + (m.cantidad || 0)
    })

    const { data: detalles } = await supabase
      .from('despachos_detalle')
      .select('sku, total, despacho_id, created_at')
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
      if (excluirDespachoId && d.despacho_id === excluirDespachoId) return
      const encab = encabPorId[d.despacho_id]
      if (!encab) return
      const stockInfo = stockPorSku[d.sku]
      if (!stockInfo || !cuentaDespuesDelConteo(stockInfo, encab.fecha, d.created_at)) return
      despachadoPorSku[d.sku] = (despachadoPorSku[d.sku] || 0) + (d.total || 0)
    })
  }

  const resultado = {}
  Object.keys(stockPorSku).forEach(sku => {
    const stockInfo = stockPorSku[sku]
    resultado[sku] = {
      stockActual: stockInfo.cantidad + (compradoPorSku[sku] || 0) + (devueltoPorSku[sku] || 0) - (salidaPorSku[sku] || 0) - (despachadoPorSku[sku] || 0),
      fechaConteo: stockInfo.fecha,
      cantidadConteo: stockInfo.cantidad,
      cantidadContada: stockInfo.contada ?? null,
      comprado: compradoPorSku[sku] || 0,
      devuelto: devueltoPorSku[sku] || 0,
      salida: salidaPorSku[sku] || 0,
      despachado: despachadoPorSku[sku] || 0,
      sinConteo: !!stockInfo.sinConteo,
    }
  })
  return resultado
}

// Empresas con proveedor que repone (Distri): un cambio que el vendedor hizo
// en ruta queda "pendiente por reponer" a nombre del ultimo proveedor que
// vendio ese producto. La unidad buena ya salio con el despacho; la buena que
// traiga el proveedor entra al marcarlo "Repuesto" en Cambios. Devuelve null
// si la empresa no maneja reposicion de proveedor (Arepas Maissy).
export async function proveedorParaReponer(empresaId, skus) {
  const { data: emp } = await supabase.from('empresas').select('cambios_incluye_proveedor').eq('id', empresaId).maybeSingle()
  if (!(emp?.cambios_incluye_proveedor ?? true)) return null
  if (skus.length === 0) return {}
  const { data } = await supabase.from('compras').select('sku, proveedor_id, created_at')
    .eq('empresa_id', empresaId).in('sku', skus).order('created_at', { ascending: false })
  const porSku = {}
  ;(data || []).forEach(c => { if (!porSku[c.sku] && c.proveedor_id) porSku[c.sku] = c.proveedor_id })
  return porSku
}
