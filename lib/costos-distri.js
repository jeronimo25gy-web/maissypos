'use client'
import { supabase } from './supabase'
import { getEmpresaId } from './empresa'
import { obtenerFechaActual } from './supabase-helpers'
import { cargarContextoPreciosRuta, precioEfectivo } from './precios-ruta-helpers'
import { cargarParametros, costoLaboral } from './nomina'

// Costos de una distribuidora: no fabrica, compra y reparte. Costo = lo que
// se pagó por el producto (última compra) + lo que cuesta sacar la ruta.
// Lo que no está registrado queda null ("sin dato").

const CATEGORIAS_NO_COSTO = ['prestamo al vendedor'] // un préstamo no es gasto de la ruta
const normal = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const moda = (l) => { const c = {}; l.forEach(v => { c[v] = (c[v] || 0) + 1 }); const [p, n] = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; return { precio: Number(p), n } }

export async function cargarCostosDistri(mes, empresaId = getEmpresaId()) {
  const [y, m] = mes.split('-').map(Number)
  const diasMes = new Date(y, m, 0).getDate()
  const desde = `${mes}-01`, hasta = `${mes}-${String(diasMes).padStart(2, '0')}`
  const hoy = obtenerFechaActual()
  const dias = hoy.slice(0, 7) === mes ? Number(hoy.slice(8, 10)) : diasMes
  const hace60 = new Date(Date.now() - 60 * 86400000).toLocaleDateString('en-CA')

  const q = await Promise.all([
    supabase.from('productos').select('id, sku, nombre, precio_venta, costo_compra, tipo, estado').eq('empresa_id', empresaId).neq('tipo', 'materia_prima'),
    supabase.from('compras').select('sku, precio_unitario, fecha').eq('empresa_id', empresaId).gt('precio_unitario', 0).gte('fecha', hace60).order('fecha', { ascending: false }),
    supabase.from('clientes_precios').select('sku, precio_especial').eq('empresa_id', empresaId),
    supabase.from('liquidaciones').select('despacho_id, vendedor_id, sku, vendido_neto').eq('empresa_id', empresaId).gte('fecha', desde).lte('fecha', hasta),
    supabase.from('despachos_encab').select('id, ruta_id, vendedor_id').eq('empresa_id', empresaId).gte('fecha', desde).lte('fecha', hasta),
    supabase.from('rutas').select('id, nombre, tipo').eq('empresa_id', empresaId),
    supabase.from('liquidaciones_gastos').select('despacho_id, valor, categoria').eq('empresa_id', empresaId).gte('fecha', desde).lte('fecha', hasta),
    supabase.from('obsequios').select('despacho_id, cantidad, valor_unitario').eq('empresa_id', empresaId).gte('fecha', desde).lte('fecha', hasta),
    supabase.from('novedades').select('vendedor_id, valor, tipo').eq('empresa_id', empresaId).eq('tipo', 'perdida_negocio').gte('fecha', desde).lte('fecha', hasta),
    supabase.from('empleados').select('salario_base, vendedor_id, riesgo_arl').eq('empresa_id', empresaId).eq('activo', true).not('vendedor_id', 'is', null),
    supabase.from('ventas_encab').select('id').eq('empresa_id', empresaId).eq('estado', 'confirmada').gte('fecha', desde).lte('fecha', hasta),
    supabase.from('cartera_fiados').select('ruta_id, saldo, fecha_pago, estado').eq('empresa_id', empresaId).gt('saldo', 0),
    supabase.from('categorias_gasto').select('nombre, tipo_costo').eq('empresa_id', empresaId).eq('tipo', 'admin'),
    supabase.from('gastos_admin').select('categoria, valor, ruta_id').eq('empresa_id', empresaId).eq('anulado', false).gte('fecha', desde).lte('fecha', hasta),
    // Bolsas de reparto que salieron con cada despacho, y su costo.
    supabase.from('inventario_mov').select('sku, cantidad, tipo_movimiento, despacho_id').eq('empresa_id', empresaId).like('referencia', 'Bolsas de reparto%').gte('fecha', desde).lte('fecha', hasta),
    supabase.from('productos').select('sku, costo_compra').eq('empresa_id', empresaId).like('sku', 'BOL-%'),
    supabase.from('compras').select('sku, precio_unitario, fecha').eq('empresa_id', empresaId).like('sku', 'BOL-%').gt('precio_unitario', 0).order('fecha', { ascending: false }).limit(50),
  ])
  const err = q.find(r => r.error)
  if (err) throw new Error(err.error.message)
  const parametros = await cargarParametros(empresaId)
  const [{ data: productos }, { data: compras }, { data: cp }, { data: liqs }, { data: desps }, { data: rutasData }, { data: gastosRuta }, { data: obsequios }, { data: perdidas }, { data: emps }, { data: ventasMost }, { data: cartera }, { data: cats }, { data: gastos }, { data: movBolsas }, { data: prodBolsas }, { data: compBolsas }] = q

  // Costo de cada producto: la última compra de los últimos 60 días o el de Maestros.
  const costo = {}
  ;(productos || []).forEach(p => {
    const c = (compras || []).find(x => x.sku === p.sku)
    costo[p.sku] = c ? { valor: Number(c.precio_unitario), fuente: 'compra', fecha: c.fecha } : (Number(p.costo_compra) ? { valor: Number(p.costo_compra), fuente: 'maestros' } : null)
  })
  const pactado = {}
  ;(cp || []).forEach(x => { (pactado[x.sku] = pactado[x.sku] || []).push(Number(x.precio_especial)) })
  const prodPorSku = Object.fromEntries((productos || []).map(p => [p.sku, p]))

  // Lo vendido en rutas (liquidaciones) con el precio de su ruta.
  const ctx = await cargarContextoPreciosRuta((liqs || []).map(l => l.despacho_id))
  const despacho = Object.fromEntries((desps || []).map(d => [d.id, d]))
  const rutas = Object.fromEntries((rutasData || []).map(r => [r.id, { ...r, ventas: 0, mercancia: 0, sinCosto: 0, gastos: 0, gastosAnotados: false, obsequios: 0, perdidas: 0, vendedor: null, porCobrar: 0, vencido: 0 }]))
  const porProducto = {}
  const vendedoresRuta = {} // vendedor -> { ruta -> despachos }
  ;(liqs || []).forEach(l => {
    const p = prodPorSku[l.sku]
    const n = Number(l.vendido_neto || 0)
    if (!p || !n) return
    const precio = precioEfectivo(l.despacho_id, l.sku, Number(p.precio_venta || 0), ctx)
    const c = costo[l.sku]?.valor
    const pp = (porProducto[l.sku] = porProducto[l.sku] || { unidades: 0, ventas: 0, mercancia: 0 })
    pp.unidades += n; pp.ventas += n * precio; pp.mercancia += c != null ? n * c : 0
    const rid = despacho[l.despacho_id]?.ruta_id
    if (rid && rutas[rid]) { rutas[rid].ventas += n * precio; if (c != null) rutas[rid].mercancia += n * c; else rutas[rid].sinCosto += n * precio }
  })
  ;(desps || []).forEach(d => { if (d.vendedor_id && d.ruta_id) { const v = (vendedoresRuta[d.vendedor_id] = vendedoresRuta[d.vendedor_id] || {}); v[d.ruta_id] = (v[d.ruta_id] || 0) + 1 } })
  const rutaDeVendedor = (vid) => { const v = vendedoresRuta[vid]; return v ? Object.entries(v).sort((a, b) => b[1] - a[1])[0][0] : null }

  ;(gastosRuta || []).forEach(g => {
    const rid = despacho[g.despacho_id]?.ruta_id
    if (!rid || !rutas[rid]) return
    rutas[rid].gastosAnotados = true
    if (!CATEGORIAS_NO_COSTO.includes(normal(g.categoria))) rutas[rid].gastos += Number(g.valor || 0)
  })
  ;(obsequios || []).forEach(o => { const rid = despacho[o.despacho_id]?.ruta_id; if (rid && rutas[rid]) rutas[rid].obsequios += Number(o.cantidad || 0) * Number(o.valor_unitario || 0) })
  // Bolsas de reparto: costo de la ruta (no se le cobran); al costo de la última compra.
  const costoBolsa = {}
  ;(prodBolsas || []).forEach(b => { if (Number(b.costo_compra) > 0) costoBolsa[b.sku] = Number(b.costo_compra) })
  ;[...(compBolsas || [])].reverse().forEach(c => { costoBolsa[c.sku] = Number(c.precio_unitario) })
  ;(movBolsas || []).forEach(m => {
    const rid = despacho[m.despacho_id]?.ruta_id
    if (!rid || !rutas[rid]) return
    rutas[rid].gastos += (m.tipo_movimiento === 'salida' ? 1 : -1) * Number(m.cantidad || 0) * (costoBolsa[m.sku] || 0)
  })
  ;(perdidas || []).forEach(x => { const rid = rutaDeVendedor(x.vendedor_id); if (rid && rutas[rid]) rutas[rid].perdidas += Number(x.valor || 0) })
  // Costo laboral del vendedor (salario, auxilio, aportes y prestaciones) en su ruta
  // (la que más sacó en el mes), en proporción a los días.
  ;(emps || []).forEach(e => { const rid = rutaDeVendedor(e.vendedor_id); if (rid && rutas[rid]) rutas[rid].vendedor = (rutas[rid].vendedor || 0) + costoLaboral(e, parametros).total * dias / diasMes })
  ;(cartera || []).forEach(c => { if (!c.ruta_id || !rutas[c.ruta_id]) return; rutas[c.ruta_id].porCobrar += Number(c.saldo); if (c.fecha_pago && c.fecha_pago < hoy) rutas[c.ruta_id].vencido += Number(c.saldo) })

  // Mostrador: una fila más, con lo vendido en la bodega.
  let mostrador = null
  const idsVentas = (ventasMost || []).map(v => v.id)
  if (idsVentas.length) {
    const { data: det } = await supabase.from('ventas_detalle').select('sku, cantidad, subtotal').in('venta_id', idsVentas)
    mostrador = { id: 'mostrador', nombre: 'Mostrador', tipo: 'mostrador', ventas: 0, mercancia: 0, sinCosto: 0, gastos: 0, gastosAnotados: true, obsequios: 0, perdidas: 0, vendedor: null, porCobrar: 0, vencido: 0 }
    ;(det || []).forEach(x => {
      const c = costo[x.sku]?.valor, n = Number(x.cantidad || 0)
      mostrador.ventas += Number(x.subtotal || 0)
      if (c != null) mostrador.mercancia += n * c; else mostrador.sinCosto += Number(x.subtotal || 0)
      const pp = (porProducto[x.sku] = porProducto[x.sku] || { unidades: 0, ventas: 0, mercancia: 0 })
      pp.unidades += n; pp.ventas += Number(x.subtotal || 0); pp.mercancia += c != null ? n * c : 0
    })
  }

  const filasProducto = (productos || []).filter(p => p.estado !== false).map(p => {
    const c = costo[p.sku], lista = Number(p.precio_venta || 0), pp = porProducto[p.sku]
    return {
      sku: p.sku, nombre: p.nombre, costo: c, lista, pactado: pactado[p.sku] ? moda(pactado[p.sku]) : null,
      margenPct: c && lista ? (lista - c.valor) / lista * 100 : null,
      unidades: pp?.unidades || 0, deja: pp && c ? pp.ventas - pp.mercancia : null,
    }
  }).sort((a, b) => (b.deja ?? -1) - (a.deja ?? -1) || b.unidades - a.unidades)

  const tipoCat = Object.fromEntries((cats || []).map(c => [c.nombre, c.tipo_costo]))
  // Gastos de distribución asignados a una ruta van a esa ruta; sin ruta, a los fijos.
  ;(gastos || []).filter(g => tipoCat[g.categoria] === 'distribucion' && g.ruta_id && rutas[g.ruta_id]).forEach(g => { rutas[g.ruta_id].gastos += Number(g.valor || 0) })

  const filasRuta = [...Object.values(rutas).filter(r => r.ventas > 0 || r.porCobrar > 0), ...(mostrador ? [mostrador] : [])]
    .map(r => ({ ...r, repartir: r.gastos + (r.vendedor || 0), deja: r.ventas - r.mercancia - r.gastos - (r.vendedor || 0) - r.obsequios - r.perdidas }))
    .sort((a, b) => b.ventas - a.ventas)

  const fijos = (gastos || []).filter(g => tipoCat[g.categoria] === 'costo_fijo' || (tipoCat[g.categoria] === 'distribucion' && !(g.ruta_id && rutas[g.ruta_id]))).reduce((s, g) => s + Number(g.valor || 0), 0)

  return {
    mes, filasProducto, filasRuta, fijos,
    sinCompraReciente: filasProducto.filter(f => f.costo?.fuente === 'maestros' && f.unidades > 0).length,
    sinCosto: filasProducto.filter(f => !f.costo && f.unidades > 0),
    rutasSinVendedor: filasRuta.filter(r => r.tipo !== 'mostrador' && r.vendedor == null && r.ventas > 0).map(r => r.nombre),
    rutasSinGastos: filasRuta.filter(r => r.tipo === 'ruta' && !r.gastosAnotados && r.ventas > 0).map(r => r.nombre),
  }
}
