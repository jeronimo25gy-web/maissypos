'use client'
import { supabase } from './supabase'
import { calcularStockPorSku } from './inventario-helpers'

// Datos del módulo Inventario. Distri: existencias, unidades en ruta, venta
// diaria, cobertura, pedido para un día (parte de la carga del mismo día de la
// semana anterior) con alertas por ruta, baja rotación y bolsas de reparto.
// Arepas: producto terminado y materias primas con su cobertura.

const sumarDias = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }
async function todo(armar) {
  const out = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await armar().range(desde, desde + 999)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}
export const esBolsa = (p) => /^BOL-/.test(p?.sku || '') || p?.categoria === 'Insumos de reparto'

export async function cargarInventarioDistri(empresaId, hoy, diaPedido) {
  const hace14 = sumarDias(hoy, -13), hace28 = sumarDias(hoy, -27), hace60 = sumarDias(hoy, -60)
  // Las 4 fechas anteriores con el mismo día de la semana que el día del pedido.
  const dPedido = new Date(diaPedido + 'T12:00:00')
  const fechas = [1, 2, 3, 4].map(k => { const d = new Date(dPedido); d.setDate(d.getDate() - 7 * k); return d.toLocaleDateString('en-CA') })
  const [prods, stock, liq14, ve14, abiertos, liqDia, compras, provs, rutas, salidasBolsas, rutasTipo] = await Promise.all([
    todo(() => supabase.from('productos').select('id, sku, nombre, categoria, tipo, stock_minimo, costo_compra, proveedor_id, orden_despacho').eq('empresa_id', empresaId).eq('estado', true).order('orden_despacho', { ascending: true, nullsFirst: false }).order('nombre')),
    calcularStockPorSku({ empresaId }),
    todo(() => supabase.from('liquidaciones').select('sku, vendido_neto').eq('empresa_id', empresaId).gte('fecha', hace14).lte('fecha', hoy)),
    todo(() => supabase.from('ventas_encab').select('ventas_detalle(sku, cantidad)').eq('empresa_id', empresaId).neq('estado', 'anulada').gte('fecha', hace14).lte('fecha', hoy)),
    todo(() => supabase.from('despachos_encab').select('id, despachos_detalle(sku, total)').eq('empresa_id', empresaId).in('estado', ['despachado', 'por_aprobar'])),
    todo(() => supabase.from('liquidaciones').select('fecha, sku, despachado, devuelto, despacho_id').eq('empresa_id', empresaId).in('fecha', fechas)),
    todo(() => supabase.from('compras').select('sku, precio_unitario, proveedor_id, fecha').eq('empresa_id', empresaId).gte('fecha', hace60).order('fecha', { ascending: false })),
    supabase.from('proveedores').select('id, nombre').eq('empresa_id', empresaId).then(r => r.data || []),
    supabase.from('despachos_encab').select('id, ruta_id, fecha').eq('empresa_id', empresaId).in('fecha', fechas).then(r => r.data || []),
    todo(() => supabase.from('inventario_mov').select('sku, cantidad, fecha').eq('empresa_id', empresaId).eq('tipo_movimiento', 'salida').like('referencia', 'Bolsas de reparto%').gte('fecha', hace28)),
    supabase.from('rutas').select('id, nombre').eq('empresa_id', empresaId).then(r => r.data || []),
  ])
  const nombreRuta = Object.fromEntries(rutasTipo.map(r => [r.id, r.nombre.replace(/^RUTA\s+/i, '').replace(/\b(\w)(\w*)/g, (_, a, b) => a + b.toLowerCase())]))
  const rutaDeDespacho = Object.fromEntries(rutas.map(d => [d.id, d.ruta_id]))
  const vendido14 = {}
  liq14.forEach(l => { vendido14[l.sku] = (vendido14[l.sku] || 0) + Number(l.vendido_neto || 0) })
  ve14.forEach(v => (v.ventas_detalle || []).forEach(d => { vendido14[d.sku] = (vendido14[d.sku] || 0) + Number(d.cantidad || 0) }))
  const enRuta = {}
  abiertos.forEach(d => (d.despachos_detalle || []).forEach(x => { enRuta[x.sku] = (enRuta[x.sku] || 0) + Number(x.total || 0) }))
  const ultimaCompra = {}
  compras.forEach(c => { if (!ultimaCompra[c.sku]) ultimaCompra[c.sku] = c })
  const proveedor = Object.fromEntries(provs.map(p => [p.id, p.nombre]))

  // Carga del mismo día de la semana anterior y alertas por ruta (últimas 4 salidas de ese día).
  const semanaPasada = fechas[0]
  const cargaAnterior = {}
  const porRutaSku = {} // ruta|sku -> [{despachado, devuelto}]
  liqDia.forEach(l => {
    if (l.fecha === semanaPasada) cargaAnterior[l.sku] = (cargaAnterior[l.sku] || 0) + Number(l.despachado || 0)
    const ruta = rutaDeDespacho[l.despacho_id]
    if (!ruta || !(Number(l.despachado) > 0)) return
    const k = ruta + '|' + l.sku;
    (porRutaSku[k] = porRutaSku[k] || []).push({ despachado: Number(l.despachado), devuelto: Number(l.devuelto || 0) })
  })
  const alertas = {}
  Object.entries(porRutaSku).forEach(([k, salidas]) => {
    if (salidas.length < 3) return
    const [ruta, sku] = k.split('|')
    const agotado = salidas.filter(s => s.devuelto <= 0).length
    const alta = salidas.filter(s => s.devuelto >= 3 && s.devuelto / s.despachado >= 0.3)
    if (agotado >= 3) (alertas[sku] = alertas[sku] || []).push({ tipo: 'agotado', ruta: nombreRuta[ruta] || 'Ruta', veces: agotado, de: salidas.length })
    else if (alta.length >= 3) (alertas[sku] = alertas[sku] || []).push({ tipo: 'devolucion', ruta: nombreRuta[ruta] || 'Ruta', veces: alta.length, de: salidas.length, pct: Math.round(alta.reduce((s, x) => s + x.devuelto / x.despachado, 0) / alta.length * 100) })
  })

  const consumoBolsas = {}
  salidasBolsas.forEach(m => { consumoBolsas[m.sku] = (consumoBolsas[m.sku] || 0) + Number(m.cantidad || 0) })

  const filas = prods.filter(p => p.tipo !== 'materia_prima' || esBolsa(p)).map(p => {
    const st = stock[p.sku]
    const bodega = st ? Number(st.stockActual) : null
    const diaria = (vendido14[p.sku] || 0) / 14
    const costo = Number(ultimaCompra[p.sku]?.precio_unitario) || Number(p.costo_compra) || 0
    const carga = cargaAnterior[p.sku] || 0
    return {
      ...p, bodega, enRuta: enRuta[p.sku] || 0, diaria, cobertura: diaria > 0 && bodega != null ? bodega / diaria : null,
      costo, valor: bodega > 0 ? bodega * costo : 0, contado: st?.sinConteo ? null : st?.fechaConteo || null, detalle: st || null,
      cargaAnterior: carga, sugerido: Math.max(0, Math.ceil(carga + Number(p.stock_minimo || 0) - Math.max(0, bodega || 0))),
      proveedor: proveedor[ultimaCompra[p.sku]?.proveedor_id || p.proveedor_id] || 'Sin proveedor',
      alertas: alertas[p.sku] || [], consumoSemanal: (consumoBolsas[p.sku] || 0) / 4,
    }
  })
  const productos = filas.filter(f => !esBolsa(f))
  return {
    productos, bolsas: filas.filter(esBolsa), semanaPasada,
    valor: productos.reduce((s, f) => s + f.valor, 0),
    bajoMinimo: productos.filter(f => f.bodega != null && f.bodega >= 0 && f.bodega < Number(f.stock_minimo || 0)),
    negativos: productos.filter(f => f.bodega != null && f.bodega < 0),
    sinVentas: productos.filter(f => f.bodega > 0 && !f.diaria),
    cobertura: (() => { const c = productos.filter(f => f.diaria > 0 && f.bodega > 0); const d = c.reduce((s, f) => s + f.diaria, 0); return d ? c.reduce((s, f) => s + f.bodega, 0) / d : null })(),
  }
}

// Arepas: producto terminado (bodega, hecho hoy, despachado hoy) y materias primas con su cobertura.
export async function cargarInventarioPlanta(empresaId, hoy) {
  const hace14 = sumarDias(hoy, -13)
  const [prods, stock, lotesHoy, despHoy, salidas, forms] = await Promise.all([
    todo(() => supabase.from('productos').select('id, sku, nombre, tipo, stock_minimo, costo_compra').eq('empresa_id', empresaId).eq('estado', true).order('sku')),
    calcularStockPorSku({ empresaId }),
    todo(() => supabase.from('produccion_lotes').select('produccion_detalle(formula_id, cantidad_producida)').eq('empresa_id', empresaId).eq('fecha', hoy)),
    todo(() => supabase.from('despachos_encab').select('despachos_detalle(sku, total)').eq('empresa_id', empresaId).eq('fecha', hoy)),
    todo(() => supabase.from('inventario_mov').select('sku, cantidad').eq('empresa_id', empresaId).eq('tipo_movimiento', 'salida').gte('fecha', hace14).lte('fecha', hoy)),
    supabase.from('formulas').select('id, producto_id').eq('empresa_id', empresaId).then(r => r.data || []),
  ])
  const prodDeFormula = Object.fromEntries(forms.map(f => [f.id, f.producto_id]))
  const hecho = {}, despachado = {}, consumo = {}
  lotesHoy.forEach(l => (l.produccion_detalle || []).forEach(d => { const pid = prodDeFormula[d.formula_id]; hecho[pid] = (hecho[pid] || 0) + Number(d.cantidad_producida || 0) }))
  despHoy.forEach(d => (d.despachos_detalle || []).forEach(x => { despachado[x.sku] = (despachado[x.sku] || 0) + Number(x.total || 0) }))
  salidas.forEach(m => { consumo[m.sku] = (consumo[m.sku] || 0) + Number(m.cantidad || 0) })
  const bodega = (p) => stock[p.sku] ? Number(stock[p.sku].stockActual) : null
  return {
    // El Kilo de Masa se anota solo al venderlo: no tiene existencias que mostrar.
    terminados: prods.filter(p => p.tipo === 'terminado' && !/kilo de masa/i.test(p.nombre)).map(p => ({ ...p, bodega: bodega(p), hecho: hecho[p.id] || 0, despachado: despachado[p.sku] || 0 })),
    insumos: prods.filter(p => p.tipo === 'materia_prima').map(p => { const b = bodega(p), d = (consumo[p.sku] || 0) / 14; return { ...p, bodega: b, diaria: d, cobertura: d > 0 && b != null ? b / d : null } }),
  }
}

// Bodega interna del grupo.
export async function cargarBodegaInterna(ids) {
  const [cats, items, movs, vehs] = await Promise.all([
    supabase.from('bodega_categorias').select('id, nombre, empresa_id').in('empresa_id', ids).order('nombre').then(r => r.data || []),
    supabase.from('bodega_items').select('*').in('empresa_id', ids).eq('activo', true).order('nombre').then(r => r.data || []),
    supabase.from('bodega_movimientos').select('*, bodega_items(nombre, unidad), vehiculos(placa)').in('empresa_id', ids).order('created_at', { ascending: false }).limit(30).then(r => r.data || []),
    supabase.from('vehiculos').select('id, placa, marca, modelo, empresa_id').in('empresa_id', ids).then(r => r.data || []),
  ])
  return { cats, items, movs, vehs }
}
