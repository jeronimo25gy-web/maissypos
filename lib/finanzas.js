'use client'
import { supabase } from './supabase'
import { getEmpresaId } from './empresa'
import { obtenerFechaActual } from './supabase-helpers'
import { cargarPorPagar } from './por-pagar'
import { cargarCostos, esBaseTela } from './costos'
import { cargarCostosDistri } from './costos-distri'

// Finanzas de una empresa: resultado del mes (con el costo de lo vendido, no
// las compras), caja y bancos, flujo y lo que viene, y metas por ruta.

const PRESTAMO = 'prestamo al vendedor'
const normal = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
export const rango = (mes) => { const [y, m] = mes.split('-').map(Number); const ult = new Date(y, m, 0).getDate(); return { desde: `${mes}-01`, hasta: `${mes}-${String(ult).padStart(2, '0')}`, dias: ult } }
export const mesAnterior = (mes) => { const [y, m] = mes.split('-').map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const sumar = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }

export async function cargarEmpresa() {
  const { data } = await supabase.from('empresas').select('id, nombre, logo_url, modelos').eq('id', getEmpresaId()).maybeSingle()
  return data
}

// Costo de lo vendido en el mes.
// Distri: unidades vendidas × última compra (lib/costos-distri).
// Arepas: unidades vendidas × costo variable de cada referencia (maíz,
// conservante, aceite y bolsa); la nómina y los servicios de planta van aparte
// para no contarlos dos veces.
async function costoVendido(mes, empresa) {
  if (!(empresa?.modelos || []).includes('produccion')) {
    const d = await cargarCostosDistri(mes, empresa?.id)
    return { valor: d.filasRuta.reduce((s, r) => s + r.mercancia, 0), incompleto: d.sinCosto.length > 0, nota: 'Unidades vendidas por su última compra' }
  }
  const d = await cargarCostos(mes, empresa?.id)
  const { desde, hasta } = rango(mes)
  const empresaId = empresa?.id || getEmpresaId()
  const [{ data: liq }, { data: ventas }] = await Promise.all([
    supabase.from('liquidaciones').select('sku, vendido_neto').eq('empresa_id', empresaId).gte('fecha', desde).lte('fecha', hasta),
    supabase.from('ventas_encab').select('ventas_detalle(sku, cantidad)').eq('empresa_id', empresaId).eq('estado', 'confirmada').gte('fecha', desde).lte('fecha', hasta),
  ])
  const unidades = {}
  ;(liq || []).forEach(l => { unidades[l.sku] = (unidades[l.sku] || 0) + Number(l.vendido_neto || 0) })
  ;(ventas || []).forEach(v => (v.ventas_detalle || []).forEach(x => { unidades[x.sku] = (unidades[x.sku] || 0) + Number(x.cantidad || 0) }))
  let valor = 0, incompleto = false
  for (const p of d.refs) {
    const n = unidades[p.sku]
    if (!n) continue
    const md = d.maizDe(p.id)
    const pm = md && d.porMaiz[md.maizId]
    const telas = pm?.telasMedido || pm?.telasFormula
    if (!pm?.precio || !telas || !d.pesoTela || !p.peso_estandar_g || /kilo de masa/i.test(p.nombre)) { incompleto = true; continue }
    const variableBulto = pm.precio + (d.partes.consBulto || 0) + (d.partes.aceiteBulto || 0)
    if (d.partes.consBulto == null || d.partes.aceiteBulto == null) incompleto = true
    const bolsa = d.val('precio_bolsa', p.id)
    if (bolsa == null) incompleto = true
    valor += n * (variableBulto / telas * Number(p.peso_estandar_g) / d.pesoTela + (bolsa || 0))
  }
  return { valor, incompleto, nota: 'Maíz, conservante, aceite y bolsa de lo vendido' }
}

export async function cargarResultado(mes, empresa) {
  const empresaId = empresa?.id || getEmpresaId()
  const { desde, hasta } = rango(mes)
  const [{ data: liq }, { data: ventas }, { data: gRuta }, { data: gAdm }, { data: cats }, { data: pagos }, cv] = await Promise.all([
    supabase.from('liquidaciones').select('efectivo_esperado').eq('empresa_id', empresaId).gte('fecha', desde).lte('fecha', hasta),
    supabase.from('ventas_encab').select('total').eq('empresa_id', empresaId).eq('estado', 'confirmada').gte('fecha', desde).lte('fecha', hasta),
    supabase.from('liquidaciones_gastos').select('categoria, valor').eq('empresa_id', empresaId).gte('fecha', desde).lte('fecha', hasta),
    supabase.from('gastos_admin').select('categoria, valor').eq('empresa_id', empresaId).gte('fecha', desde).lte('fecha', hasta),
    supabase.from('categorias_gasto').select('nombre, tipo_costo').eq('empresa_id', empresaId).eq('tipo', 'admin'),
    supabase.from('nomina_pagos').select('salario_base, comision, total_bonificaciones, fecha_pago').eq('empresa_id', empresaId).gte('fecha_pago', desde).lte('fecha_pago', hasta),
    costoVendido(mes, empresa).catch(() => ({ valor: 0, incompleto: true, nota: 'No se pudo calcular' })),
  ])
  const porCat = (lista) => {
    const m = {}
    ;(lista || []).forEach(g => { const k = g.categoria || 'Otro'; m[k] = (m[k] || 0) + Number(g.valor || 0) })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }
  const rutas = (liq || []).reduce((s, l) => s + Number(l.efectivo_esperado || 0), 0)
  const mostrador = (ventas || []).reduce((s, v) => s + Number(v.total || 0), 0)
  const gastosRuta = porCat((gRuta || []).filter(g => normal(g.categoria) !== PRESTAMO))
  const tipoCat = Object.fromEntries((cats || []).map(c => [c.nombre, c.tipo_costo]))
  const planta = porCat((gAdm || []).filter(g => tipoCat[g.categoria] === 'cif'))
  const admin = porCat((gAdm || []).filter(g => tipoCat[g.categoria] !== 'cif'))
  const nomina = (pagos || []).reduce((s, p) => s + Number(p.salario_base || 0) + Number(p.comision || 0) + Number(p.total_bonificaciones || 0), 0)
  const suma = (l) => l.reduce((s, [, v]) => s + v, 0)
  const ventasTotal = rutas + mostrador
  const resultado = ventasTotal - cv.valor - suma(gastosRuta) - nomina - suma(planta) - suma(admin)
  return { rutas, mostrador, ventas: ventasTotal, costo: cv, gastosRuta, planta, admin, nomina, nominaPagos: (pagos || []).length, resultado }
}

export async function cargarCaja(mes, empresaId = getEmpresaId()) {
  const { desde, hasta } = rango(mes)
  const [{ data: cuentas }, { data: movs }, { data: porVerif }] = await Promise.all([
    supabase.from('cuentas').select('id, nombre, tipo, saldo_inicial, banco').eq('empresa_id', empresaId).eq('estado', true).order('tipo').order('nombre'),
    supabase.from('movimientos_tesoreria').select('id, cuenta_id, fecha, tipo, monto, concepto, referencia_tipo, created_at').eq('empresa_id', empresaId).order('fecha', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('transferencias_ruta').select('valor, fecha_limite').eq('empresa_id', empresaId).eq('estado', 'por_verificar'),
  ])
  const lista = (cuentas || []).map(c => {
    const propios = (movs || []).filter(m => m.cuenta_id === c.id)
    const saldo = Number(c.saldo_inicial || 0) + propios.reduce((s, m) => s + (m.tipo === 'entrada' ? 1 : -1) * Number(m.monto || 0), 0)
    return { ...c, saldo, ultimo: propios[0] || null }
  })
  return {
    cuentas: lista,
    total: lista.reduce((s, c) => s + c.saldo, 0),
    efectivo: lista.filter(c => c.tipo === 'efectivo').reduce((s, c) => s + c.saldo, 0),
    bancos: lista.filter(c => c.tipo !== 'efectivo').reduce((s, c) => s + c.saldo, 0),
    movimientosMes: (movs || []).filter(m => m.fecha >= desde && m.fecha <= hasta),
    sinCuenta: (movs || []).filter(m => !m.cuenta_id),
    porVerificar: { n: (porVerif || []).length, valor: (porVerif || []).reduce((s, t) => s + Number(t.valor || 0), 0) },
  }
}

// Mover plata entre cuentas: sale de una y entra a la otra el mismo día; no
// es gasto ni venta (referencia_tipo 'traslado').
export async function moverPlata({ origen, destino, monto, fecha, usuario, nombreOrigen, nombreDestino }) {
  const empresaId = getEmpresaId()
  const id = crypto.randomUUID()
  const { error } = await supabase.from('movimientos_tesoreria').insert([
    { empresa_id: empresaId, cuenta_id: origen, fecha, tipo: 'salida', monto, concepto: `Traslado a ${nombreDestino}${usuario ? ' · ' + usuario : ''}`, referencia_tipo: 'traslado', referencia_id: id },
    { empresa_id: empresaId, cuenta_id: destino, fecha, tipo: 'entrada', monto, concepto: `Traslado de ${nombreOrigen}${usuario ? ' · ' + usuario : ''}`, referencia_tipo: 'traslado', referencia_id: id },
  ])
  if (error) throw new Error(error.message)
}

// Flujo: entra y sale por semana del mes (sin traslados) y lo que viene en 30 días.
export async function cargarFlujo(mes, caja, empresaId = getEmpresaId()) {
  const hoy = obtenerFechaActual()
  const { desde, dias } = rango(mes)
  const semanas = []
  for (let ini = 1; ini <= dias; ini += 7) semanas.push({ desde: ini, hasta: Math.min(dias, ini + 6), entra: 0, sale: 0 })
  caja.movimientosMes.filter(m => m.referencia_tipo !== 'traslado').forEach(m => {
    const d = Number(m.fecha.slice(8, 10)), s = semanas.find(x => d >= x.desde && d <= x.hasta)
    if (s) s[m.tipo === 'entrada' ? 'entra' : 'sale'] += Number(m.monto || 0)
  })
  const hasta30 = sumar(hoy, 30)
  const [deudas, { data: creditos }, { data: ultimosPagos }] = await Promise.all([
    cargarPorPagar([empresaId], hoy).catch(() => []),
    supabase.from('cartera_fiados').select('saldo, fecha_pago').eq('empresa_id', empresaId).eq('estado', 'pendiente').gt('saldo', 0).gte('fecha_pago', hoy).lte('fecha_pago', hasta30),
    supabase.from('nomina_pagos').select('neto_a_pagar, fecha_pago').eq('empresa_id', empresaId).not('fecha_pago', 'is', null).order('fecha_pago', { ascending: false }).limit(60),
  ])
  const viene = []
  deudas.filter(d => d.vence && d.vence <= hasta30).forEach(d => viene.push({ fecha: d.vence < hoy ? hoy : d.vence, valor: -d.saldo, titulo: `Pago a ${d.nombre}`, detalle: d.vence < hoy ? 'Ya está vencido · Compras' : 'Proveedor · Compras', vencido: d.vence < hoy }))
  const porSemana = {}
  ;(creditos || []).forEach(c => { const k = c.fecha_pago; const x = (porSemana[k] = porSemana[k] || { n: 0, v: 0 }); x.n++; x.v += Number(c.saldo) })
  Object.entries(porSemana).forEach(([f, x]) => viene.push({ fecha: f, valor: x.v, titulo: `${x.n} ${x.n === 1 ? 'crédito vence' : 'créditos vencen'}`, detalle: 'Clientes · Cartera' }))
  // Nómina: estimada con el último pago (misma fecha de pago, siguiente quincena).
  const ultimaFecha = ultimosPagos?.[0]?.fecha_pago
  if (ultimaFecha) {
    const monto = ultimosPagos.filter(p => p.fecha_pago === ultimaFecha).reduce((s, p) => s + Number(p.neto_a_pagar || 0), 0)
    let f = sumar(ultimaFecha, 15)
    while (f < hoy) f = sumar(f, 15)
    if (f <= hasta30 && monto) viene.push({ fecha: f, valor: -monto, titulo: 'Nómina', detalle: 'Estimada con el último pago', estimado: true })
  }
  viene.sort((a, b) => a.fecha.localeCompare(b.fecha))
  let saldo = caja.total, primeroNegativo = null
  viene.forEach(v => { saldo += v.valor; v.saldo = saldo; if (saldo < 0 && !primeroNegativo) primeroNegativo = v })
  return { semanas, viene, saldoFinal: saldo, primeroNegativo, desde }
}

// Metas por ruta: lo vendido contra la meta y el ritmo, y la comisión que va ganando.
export async function cargarMetas(mes, empresaId = getEmpresaId()) {
  const { desde, hasta, dias } = rango(mes)
  const hoy = obtenerFechaActual()
  const transcurridos = hoy.slice(0, 7) === mes ? Number(hoy.slice(8, 10)) : hoy > hasta ? dias : 0
  const [{ data: rutas }, { data: metas }, { data: desps }, { data: liq }, { data: vends }, { data: tramos }] = await Promise.all([
    supabase.from('rutas').select('id, nombre, tipo').eq('empresa_id', empresaId).eq('estado', true).order('nombre'),
    supabase.from('metas_ventas').select('id, ruta_id, meta').eq('empresa_id', empresaId).eq('mes', mes).not('ruta_id', 'is', null),
    supabase.from('despachos_encab').select('id, ruta_id').eq('empresa_id', empresaId).gte('fecha', desde).lte('fecha', hasta),
    supabase.from('liquidaciones').select('despacho_id, efectivo_esperado').eq('empresa_id', empresaId).gte('fecha', desde).lte('fecha', hasta),
    supabase.from('vendedores').select('nombre, ruta_id').eq('empresa_id', empresaId).eq('estado', true),
    supabase.from('config_comisiones').select('id, meta_pct_min, meta_pct_max, comision_pct').eq('empresa_id', empresaId).order('meta_pct_min'),
  ])
  const rutaDe = Object.fromEntries((desps || []).map(d => [d.id, d.ruta_id]))
  const vendido = {}
  ;(liq || []).forEach(l => { const r = rutaDe[l.despacho_id]; if (r) vendido[r] = (vendido[r] || 0) + Number(l.efectivo_esperado || 0) })
  const tramo = (pct) => (tramos || []).find(t => pct >= Number(t.meta_pct_min) && (t.meta_pct_max == null || pct < Number(t.meta_pct_max)))
  const filas = (rutas || []).map(r => {
    const m = (metas || []).find(x => x.ruta_id === r.id)
    const v = vendido[r.id] || 0
    const pct = m?.meta ? v / Number(m.meta) * 100 : null
    const ritmo = dias ? transcurridos / dias * 100 : 0
    return { ruta: r, vendedor: (vends || []).find(x => x.ruta_id === r.id)?.nombre, meta: m ? Number(m.meta) : null, metaId: m?.id, vendido: v, pct, ritmo,
      estado: pct == null ? null : pct >= ritmo ? 'al_dia' : pct >= ritmo - 10 ? 'atras' : 'muy_atras', comision: pct != null ? tramo(pct)?.comision_pct ?? null : null }
  })
  return { filas, tramos: tramos || [], transcurridos, dias }
}

export async function guardarMeta(mes, rutaId, valor, metaId) {
  const empresaId = getEmpresaId()
  const { error } = metaId
    ? await supabase.from('metas_ventas').update({ meta: valor }).eq('id', metaId).eq('empresa_id', empresaId)
    : await supabase.from('metas_ventas').insert({ empresa_id: empresaId, mes, ruta_id: rutaId, meta: valor })
  if (error) throw new Error(error.message)
}

export { esBaseTela }
