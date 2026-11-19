import { supabase } from './supabase'
import { getEmpresaId } from './empresa'
import { obtenerFechaActual } from './supabase-helpers'

// La base de datos devuelve como mucho 1.000 filas por consulta. Con varios
// días de despachos (30 renglones por ruta al día) se pasaba de ese tope, se
// perdían renglones y el inventario salía inflado (11 nov: Arepa Tela con 387
// en bodega cuando había 0). Todo lo del cálculo se trae por páginas.
const todas = async (armar) => {
  const out = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await armar().range(desde, desde + 999)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}
const enTrozos = (lista, n) => Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, i * n + n))

// excluirDespachoId: al editar un despacho ya guardado, su propia carga no
// debe restarse del disponible contra el que se valida esa misma edicion.
export const calcularStockPorSku = async ({ excluirDespachoId = null, empresaId: empresaParam = null } = {}) => {
  // empresaParam: para ver el stock de otra empresa (ventas mixtas de mostrador).
  const empresaId = empresaParam || getEmpresaId()

  const [conteos, { data: empresaRow }, productosAll] = await Promise.all([
    todas(() => supabase
      .from('conteo_fisico')
      .select('sku, fecha, cantidad_fisica, cantidad_sistema, created_at')
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id')),
    supabase.from('empresas').select('modelos').eq('id', empresaId).maybeSingle(),
    todas(() => supabase.from('productos').select('sku, estado').eq('empresa_id', empresaId).order('id')),
  ])

  // El fallback de "ledger puro sin conteo" de abajo es especifico del modelo
  // 'produccion' y de 'mostrador' (Arepas Maissy: produccion diaria + compras, sin conteo
  // manual) -- Distri Maissy trabaja con conteo fisico diario por ruta como
  // fuente de verdad, y su comportamiento no debe cambiar.
  const esModeloProduccion = (empresaRow?.modelos || []).some(m => m === 'produccion' || m === 'mostrador')

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
    ;(productosAll || []).forEach(p => {
      if (!(p.sku in stockPorSku)) stockPorSku[p.sku] = { cantidad: 0, fecha: '1900-01-01', sinConteo: true }
    })
  }

  // Desde qué fecha hay que traer movimientos: el conteo más viejo de los
  // productos activos (uno desactivado con un conteo viejo obligaba a traer
  // semanas de despachos que no se necesitan).
  const activos = new Set((productosAll || []).filter(p => p.estado !== false).map(p => p.sku))
  const fechaMinima = Object.entries(stockPorSku).filter(([sku]) => activos.has(sku)).reduce((min, [, c]) => (!min || c.fecha < min) ? c.fecha : min, null)
  const compradoPorSku = {}
  const salidaPorSku = {}
  const despachadoPorSku = {}
  const devueltoPorSku = {}

  if (fechaMinima) {
    // Las consultas van en paralelo: antes iban una tras otra y cada
    // despacho o compra esperaba cuatro viajes seguidos al servidor.
    const cargarDespachado = async () => {
      const encabs = await todas(() => supabase
        .from('despachos_encab')
        .select('id, fecha, estado')
        .eq('empresa_id', empresaId)
        .gte('fecha', fechaMinima)
        .neq('estado', 'cancelado')
        .order('id'))
      const ids = encabs.map(e => e.id)
      if (!ids.length) return { encabs: [], detalles: [] }
      const partes = await Promise.all(enTrozos(ids, 100).map(trozo => todas(() => supabase
        .from('despachos_detalle')
        .select('sku, total, despacho_id, created_at')
        .eq('empresa_id', empresaId)
        .in('despacho_id', trozo)
        .order('id'))))
      return { encabs, detalles: partes.flat() }
    }
    const [liquidaciones, movimientos, { encabs, detalles }] = await Promise.all([
      todas(() => supabase
        .from('liquidaciones')
        .select('sku, devuelto, fecha, created_at')
        .eq('empresa_id', empresaId)
        .gt('devuelto', 0)
        .gte('fecha', fechaMinima)
        .order('id')),
      todas(() => supabase
        .from('inventario_mov')
        .select('sku, cantidad, fecha, tipo_movimiento, created_at')
        .eq('empresa_id', empresaId)
        .in('tipo_movimiento', ['entrada', 'salida'])
        .gte('fecha', fechaMinima)
        .order('id')),
      cargarDespachado(),
    ])
    ;(liquidaciones || []).forEach(l => {
      const stockInfo = stockPorSku[l.sku]
      if (!stockInfo || !cuentaDespuesDelConteo(stockInfo, l.fecha, l.created_at)) return
      devueltoPorSku[l.sku] = (devueltoPorSku[l.sku] || 0) + (l.devuelto || 0)
    })

    ;(movimientos || []).forEach(m => {
      const stockInfo = stockPorSku[m.sku]
      if (!stockInfo || !cuentaDespuesDelConteo(stockInfo, m.fecha, m.created_at)) return
      const destino = m.tipo_movimiento === 'entrada' ? compradoPorSku : salidaPorSku
      destino[m.sku] = (destino[m.sku] || 0) + (m.cantidad || 0)
    })

    const encabPorId = {}
    encabs.forEach(e => { encabPorId[e.id] = e })
    detalles.forEach(d => {
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

// Subir o bajar un renglón de despacho que ya existía (Corregir, + Agregar
// producto) cambia su total pero no su fecha de creación. Si ese renglón es
// anterior al último conteo del producto, el inventario lo da por incluido en
// el conteo y la diferencia nunca se descontaba (18 nov: 8 pandebonos
// anexados a Ruta 2 en la noche, después del conteo, seguían "en bodega").
// Para esos renglones la diferencia se anota como movimiento de inventario
// ligado al despacho, que sí entra encima del conteo.
// cambios: [{ sku, dif, creado }] — creado = created_at del renglón que se
// actualizó (los renglones nuevos no van: su fecha ya es posterior al conteo).
export async function anotarDiferenciaDespacho({ empresaId, despacho, cambios, referencia }) {
  const conDif = cambios.filter(c => c.creado && Math.abs(Number(c.dif) || 0) > 1e-9)
  if (!conDif.length) return null
  const { data: conteos, error } = await supabase.from('conteo_fisico').select('sku, fecha, created_at')
    .eq('empresa_id', empresaId).in('sku', [...new Set(conDif.map(c => c.sku))])
    .order('fecha', { ascending: false }).order('created_at', { ascending: false })
  if (error) return error.message
  const ultimo = {}
  ;(conteos || []).forEach(c => { if (!ultimo[c.sku]) ultimo[c.sku] = c })
  const yaContado = (c) => {
    const k = ultimo[c.sku]
    if (!k) return false
    if (despacho.fecha !== k.fecha) return despacho.fecha < k.fecha
    return !!k.created_at && new Date(c.creado) <= new Date(k.created_at)
  }
  const fecha = obtenerFechaActual()
  const filas = conDif.filter(yaContado).map(c => ({
    empresa_id: empresaId, sku: c.sku, cantidad: Math.abs(Number(c.dif)), fecha,
    tipo_movimiento: Number(c.dif) > 0 ? 'salida' : 'entrada', referencia, despacho_id: despacho.id,
  }))
  if (!filas.length) return null
  const { error: e } = await supabase.from('inventario_mov').insert(filas)
  return e?.message || null
}

// Volver a confirmar una liquidación borra sus renglones y los graba de nuevo
// con la hora de ahora. Si los anteriores ya estaban dentro del último conteo:
//  - liquidación del mismo día del conteo: la devolución se sumaba dos veces
//    (la del conteo y la del renglón nuevo, que queda "después" del conteo);
//  - liquidación de un día anterior al conteo: el cambio en la devolución no
//    llegaba nunca al inventario.
// Se anota la diferencia como movimiento ligado al despacho para que el
// inventario solo cambie en lo que de verdad cambió la devolución.
// previos: renglones que había antes de borrar [{ sku, devuelto, created_at }]
// nuevos: { sku: devuelto } que se van a grabar.
export async function anotarDiferenciaReliquidacion({ empresaId, despachoId, fecha, previos, nuevos, referencia }) {
  if (!previos?.length) return null
  const skus = [...new Set(previos.map(p => p.sku))]
  const { data: conteos, error } = await supabase.from('conteo_fisico').select('sku, fecha, created_at')
    .eq('empresa_id', empresaId).in('sku', skus)
    .order('fecha', { ascending: false }).order('created_at', { ascending: false })
  if (error) return error.message
  const ultimo = {}
  ;(conteos || []).forEach(c => { if (!ultimo[c.sku]) ultimo[c.sku] = c })
  const ahora = new Date()
  // Mismo criterio que calcularStockPorSku (cuentaDespuesDelConteo).
  const cuenta = (k, creado) => fecha > k.fecha || (fecha === k.fecha && (!k.created_at || new Date(creado) > new Date(k.created_at)))
  const porSku = {}
  previos.forEach(p => { (porSku[p.sku] = porSku[p.sku] || []).push(p) })
  const hoy = obtenerFechaActual()
  const filas = []
  Object.entries(porSku).forEach(([sku, renglones]) => {
    const k = ultimo[sku]
    if (!k) return
    // Solo lo que el inventario NO estaba sumando aparte (quedó dentro del conteo).
    const dentro = renglones.filter(r => !cuenta(k, r.created_at))
    if (!dentro.length) return
    const viejoDentro = dentro.reduce((s, r) => s + Number(r.devuelto || 0), 0)
    const nuevo = Number(nuevos[sku] || 0)
    // Debería sumar (nuevo - viejoDentro); el renglón nuevo por sí solo suma
    // nuevo si queda después del conteo, o nada si es de un día anterior.
    // (Lo viejo que estaba después del conteo se resta solo al borrarlo.)
    const automatico = cuenta(k, ahora.toISOString()) ? nuevo : 0
    const ajuste = nuevo - viejoDentro - automatico
    if (Math.abs(ajuste) < 1e-9) return
    filas.push({ empresa_id: empresaId, sku, cantidad: Math.abs(ajuste), fecha: hoy, tipo_movimiento: ajuste > 0 ? 'entrada' : 'salida', referencia, despacho_id: despachoId })
  })
  if (!filas.length) return null
  const { error: e } = await supabase.from('inventario_mov').insert(filas)
  return e?.message || null
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
