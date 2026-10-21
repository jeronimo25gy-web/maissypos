import { cargarPorPagar } from './por-pagar'
import { supabase } from './supabase'
import { obsequiosEnNegativo } from './ventas-helpers'

// Datos del Inicio del admin: operacion del dia y resultados del mes, para
// una empresa o el consolidado. En el consolidado no se cuentan las ventas
// entre empresas (Arepas -> Distri): para cada empresa sola si son venta,
// pero juntas serian las mismas arepas contadas dos veces.

const sinTildes = (t) => (t || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const nombreClave = (t) => sinTildes(t).replace(/\bs\.?a\.?s\.?\b/g, '').replace(/[^a-z]/g, '')
const diaMenos = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA') }
const horaDe = (iso) => Number(new Date(iso).toLocaleString('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hour12: false })) % 24
const esExpress = (v) => (v.observaciones || '').startsWith('Domicilio express')

// Supabase entrega maximo 1000 filas por consulta: se pide por paginas.
async function todo(armar) {
  const out = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await armar().range(desde, desde + 999)
    if (error || !data) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

// Para saber si una venta fue a la otra empresa del grupo.
export function detectorInterno(empresas) {
  const claves = empresas.map(e => ({ id: e.id, clave: nombreClave(e.nombre) }))
  return (venta) => {
    const c = nombreClave(venta.cliente_nombre)
    if (!c || c.length < 6) return null
    return claves.find(x => x.id !== venta.empresa_id && (x.clave === c || x.clave.startsWith(c) || c.startsWith(x.clave)))?.id || null
  }
}

const obsequiosDe = async (ids, rango) => (await Promise.all(ids.map(id => obsequiosEnNegativo({ ...rango, empresaId: id }).then(r => r.map(x => ({ ...x, empresa_id: id })))))).flat()

export async function cargarDia(ids, fecha, empresas, { consolidado }) {
  const antes = diaMenos(fecha, 7)
  const dow = new Date(fecha + 'T12:00:00').getDay() || 7
  const interna = detectorInterno(empresas)
  const [
    { data: despachos }, { data: rutas }, liq, { data: liqDet }, { data: borr }, { data: tickets }, { data: ticketsAntes },
    { data: visitas }, rutero, { data: mostrador }, { data: mostradorAntes }, liqAntes, { data: creditos }, { data: efectivos },
  ] = await Promise.all([
    supabase.from('despachos_encab').select('id, ruta_id, estado, empresa_id, rutas(nombre), vendedores(nombre)').eq('fecha', fecha).neq('estado', 'cancelado').in('empresa_id', ids),
    supabase.from('rutas').select('id, nombre, empresa_id').eq('estado', true).in('empresa_id', ids).order('nombre'),
    todo(() => supabase.from('liquidaciones').select('despacho_id, efectivo_esperado, empresa_id').eq('fecha', fecha).in('empresa_id', ids)),
    supabase.from('liquidaciones_detalle').select('despacho_id, diferencia').eq('fecha', fecha).in('empresa_id', ids),
    supabase.from('liquidaciones_borrador').select('despacho_id, diferencia, datos').eq('estado', 'por_aprobar').in('empresa_id', ids),
    supabase.from('ventas_ruta').select('despacho_id, total, created_at').eq('fecha', fecha).eq('estado', 'activa').in('empresa_id', ids),
    supabase.from('ventas_ruta').select('total, created_at').eq('fecha', antes).eq('estado', 'activa').in('empresa_id', ids),
    supabase.from('visitas_ruta').select('ruta_id').eq('fecha', fecha).in('empresa_id', ids),
    todo(() => supabase.from('rutero').select('ruta_id').eq('dia_semana', dow).in('empresa_id', ids)),
    supabase.from('ventas_encab').select('total, created_at, empresa_id, cliente_nombre, observaciones').eq('fecha', fecha).neq('estado', 'anulada').in('empresa_id', ids),
    supabase.from('ventas_encab').select('total, created_at, empresa_id, cliente_nombre, observaciones').eq('fecha', antes).neq('estado', 'anulada').in('empresa_id', ids),
    todo(() => supabase.from('liquidaciones').select('efectivo_esperado').eq('fecha', antes).in('empresa_id', ids)),
    supabase.from('cartera_fiados').select('valor_original').eq('fecha_fiado', fecha).eq('es_saldo_inicial', false).in('empresa_id', ids),
    supabase.from('cuentas').select('id, empresa_id').eq('tipo', 'efectivo').in('empresa_id', ids),
  ])
  const [obsDia, obsAntes] = await Promise.all([obsequiosDe(ids, { fecha }), obsequiosDe(ids, { fecha: antes })])
  const cuentasEf = (efectivos || []).map(c => c.id)
  const { data: movs } = cuentasEf.length
    ? await supabase.from('movimientos_tesoreria').select('tipo, monto, empresa_id').eq('fecha', fecha).in('cuenta_id', cuentasEf)
    : { data: [] }

  const ventaLiq = {}
  ;[...liq, ...obsDia].forEach(l => { ventaLiq[l.despacho_id] = (ventaLiq[l.despacho_id] || 0) + Number(l.efectivo_esperado || 0) })
  const difLiq = Object.fromEntries((liqDet || []).map(d => [d.despacho_id, Number(d.diferencia || 0)]))
  const borrPor = Object.fromEntries((borr || []).map(b => [b.despacho_id, b]))
  const ticketsPor = {}
  ;(tickets || []).forEach(t => { ticketsPor[t.despacho_id] = (ticketsPor[t.despacho_id] || 0) + Number(t.total || 0) })
  const visitasPor = {}, ruteroPor = {}
  ;(visitas || []).forEach(v => { visitasPor[v.ruta_id] = (visitasPor[v.ruta_id] || 0) + 1 })
  rutero.forEach(r => { ruteroPor[r.ruta_id] = (ruteroPor[r.ruta_id] || 0) + 1 })

  // Una fila por ruta: lo despachado hoy (si son varios despachos se suman).
  const filas = {}
  ;(despachos || []).forEach(d => {
    const f = (filas[d.ruta_id] = filas[d.ruta_id] || { ruta: d.rutas?.nombre, vendedor: d.vendedores?.nombre, estados: [], venta: 0, diferencia: null, ruta_id: d.ruta_id })
    f.estados.push(d.estado)
    if (d.estado === 'liquidado') { f.venta += ventaLiq[d.id] || 0; if (difLiq[d.id] != null) f.diferencia = (f.diferencia || 0) + difLiq[d.id] }
    else if (d.estado === 'por_aprobar') { const b = borrPor[d.id]; f.venta += Number(b?.datos?.resumen?.vendido || ticketsPor[d.id] || 0); if (b) f.diferencia = (f.diferencia || 0) + Number(b.diferencia || 0) }
    else f.venta += ticketsPor[d.id] || 0
  })
  const filasRutas = Object.values(filas).map(f => ({
    ...f,
    estado: f.estados.includes('despachado') ? 'calle' : f.estados.includes('por_aprobar') ? 'aprobar' : 'liquidada',
    visitados: visitasPor[f.ruta_id] || 0, enRutero: ruteroPor[f.ruta_id] || 0,
  }))
  if (dow !== 7) (rutas || []).filter(r => !filas[r.id]).forEach(r => filasRutas.push({ ruta: r.nombre, vendedor: null, estado: 'sin', venta: 0, diferencia: null, visitados: 0, enRutero: ruteroPor[r.id] || 0 }))

  const cuentaMostrador = (lista) => (lista || []).filter(v => !(consolidado && interna(v)))
  const most = cuentaMostrador(mostrador)
  const ventasRutas = filasRutas.reduce((s, f) => s + f.venta, 0)
  const ventasMostrador = most.filter(v => !esExpress(v)).reduce((s, v) => s + Number(v.total || 0), 0)
  const ventasDomicilios = most.filter(esExpress).reduce((s, v) => s + Number(v.total || 0), 0)
  const totalAntes = [...liqAntes, ...obsAntes].reduce((s, l) => s + Number(l.efectivo_esperado || 0), 0) + cuentaMostrador(mostradorAntes).reduce((s, v) => s + Number(v.total || 0), 0)
  const abiertas = filasRutas.some(f => f.estado === 'calle' || f.estado === 'aprobar')

  // Por hora: lo que se registra con hora (tickets de ruta y mostrador).
  const porHora = (lista) => { const h = Array(13).fill(0); lista.forEach(v => { const i = horaDe(v.created_at) - 6; if (i >= 0 && i < 13) h[i] += Number(v.total || 0) }); let a = 0; return h.map(x => (a += x)) }
  const horaActual = horaDe(new Date().toISOString())
  const hoyHora = porHora([...(tickets || []), ...most])
  const esHoy = fecha === new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

  const efectivoPor = {}
  ;(movs || []).forEach(m => { efectivoPor[m.empresa_id] = (efectivoPor[m.empresa_id] || 0) + (m.tipo === 'entrada' ? 1 : -1) * Number(m.monto || 0) })

  return {
    filasRutas, ventasRutas, ventasMostrador, ventasDomicilios, total: ventasRutas + ventasMostrador + ventasDomicilios,
    totalAntes, abiertas, fechaAntes: antes,
    horas: { hoy: hoyHora.map((v, i) => (esHoy && i + 6 > horaActual ? null : v)), antes: porHora([...(ticketsAntes || []), ...cuentaMostrador(mostradorAntes)]), hay: hoyHora[12] > 0 },
    creditosHoy: (creditos || []).reduce((s, c) => s + Number(c.valor_original || 0), 0), creditosCant: (creditos || []).length,
    efectivoPor,
  }
}

export async function cargarMes(ids, fecha, empresas, { consolidado }) {
  const inicio = fecha.slice(0, 7) + '-01'
  const interna = detectorInterno(empresas)
  const [liq, ventas, gastosRuta, gastosAdm, { data: metas }, { data: cartera }, { data: prods }, deudas] = await Promise.all([
    todo(() => supabase.from('liquidaciones').select('fecha, sku, vendido_neto, efectivo_esperado, empresa_id').gte('fecha', inicio).lte('fecha', fecha).in('empresa_id', ids)),
    todo(() => supabase.from('ventas_encab').select('fecha, total, empresa_id, cliente_nombre, observaciones, ventas_detalle(sku, cantidad)').gte('fecha', inicio).lte('fecha', fecha).neq('estado', 'anulada').in('empresa_id', ids)),
    todo(() => supabase.from('liquidaciones_gastos').select('valor, empresa_id').gte('fecha', inicio).lte('fecha', fecha).in('empresa_id', ids)),
    todo(() => supabase.from('gastos_admin').select('valor, empresa_id').eq('anulado', false).gte('fecha', inicio).lte('fecha', fecha).in('empresa_id', ids)),
    supabase.from('metas_ventas').select('meta, empresa_id').eq('mes', fecha.slice(0, 7)).in('empresa_id', ids),
    supabase.from('cartera_fiados').select('saldo, fecha_fiado, fecha_pago, nombre_cliente, empresa_id').eq('estado', 'pendiente').in('empresa_id', ids),
    supabase.from('productos').select('sku, nombre, empresa_id').in('empresa_id', ids),
    cargarPorPagar(ids, fecha).catch(() => []),
  ])
  const obs = await obsequiosDe(ids, { desde: inicio, hasta: fecha })
  const nombreDe = {}
  ;(prods || []).forEach(p => { nombreDe[p.empresa_id + ':' + p.sku] = p.nombre })
  const dias = Number(fecha.slice(8, 10)), diasMes = new Date(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)), 0).getDate()
  const serie = () => Array(dias).fill(0)
  const rutas = serie(), mostrador = serie(), domicilios = serie()
  const porEmpresa = Object.fromEntries(ids.map(id => [id, { ventas: 0, interna: 0, gastos: 0, rutas: 0, mostrador: 0 }]))
  const unidades = {}

  ;[...liq, ...obs].forEach(l => {
    const d = Number(l.fecha.slice(8, 10)) - 1, v = Number(l.efectivo_esperado || 0)
    if (d >= 0 && d < dias) rutas[d] += v
    porEmpresa[l.empresa_id].ventas += v; porEmpresa[l.empresa_id].rutas += v
    const n = nombreDe[l.empresa_id + ':' + l.sku] || l.sku
    unidades[n] = (unidades[n] || 0) + Number(l.vendido_neto || 0)
  })
  ventas.forEach(v => {
    const t = Number(v.total || 0), d = Number(v.fecha.slice(8, 10)) - 1
    porEmpresa[v.empresa_id].ventas += t; porEmpresa[v.empresa_id].mostrador += t
    const aOtra = interna(v)
    if (aOtra) porEmpresa[v.empresa_id].interna += t
    if (consolidado && aOtra) return
    if (d >= 0 && d < dias) (esExpress(v) ? domicilios : mostrador)[d] += t
    ;(v.ventas_detalle || []).forEach(x => { const n = nombreDe[v.empresa_id + ':' + x.sku] || x.sku; unidades[n] = (unidades[n] || 0) + Number(x.cantidad || 0) })
  })
  ;[...gastosRuta, ...gastosAdm].forEach(g => { porEmpresa[g.empresa_id].gastos += Number(g.valor || 0) })

  let a = 0
  const acumulado = rutas.map((r, i) => (a += r + mostrador[i] + domicilios[i]))
  const meta = (metas || []).reduce((s, m) => s + Number(m.meta || 0), 0)
  const hoyDate = new Date(fecha + 'T12:00:00')
  const edad = (f) => Math.round((hoyDate - new Date(f + 'T12:00:00')) / 864e5)
  const antig = [0, 0, 0, 0]
  let vencida = 0, carteraInterna = 0
  // En el consolidado, lo que una empresa le debe a la otra no es cartera del grupo.
  const carteraGrupo = (cartera || []).filter(c => {
    const aOtra = interna({ cliente_nombre: c.nombre_cliente, empresa_id: c.empresa_id })
    if (consolidado && aOtra) { carteraInterna += Number(c.saldo || 0); return false }
    return true
  })
  carteraGrupo.forEach(c => {
    const e = edad(c.fecha_fiado || fecha), s = Number(c.saldo || 0)
    antig[e <= 7 ? 0 : e <= 15 ? 1 : e <= 30 ? 2 : 3] += s
    if (c.fecha_pago && c.fecha_pago < fecha) vencida += s
  })
  // Por pagar a proveedores; en el consolidado, sin lo que se le debe a la otra empresa.
  const porPagar = deudas.filter(d => !(consolidado && interna({ cliente_nombre: d.nombre, empresa_id: d.empresa_id })))
  const ventasInternas = Object.values(porEmpresa).reduce((s, e) => s + e.interna, 0)
  const totalEmpresas = Object.values(porEmpresa).reduce((s, e) => s + e.ventas, 0)
  return {
    dias, diasMes, rutas, mostrador, domicilios, acumulado, meta,
    ritmo: meta ? Array.from({ length: dias }, (_, i) => meta * (i + 1) / diasMes) : null,
    ventas: consolidado ? totalEmpresas - ventasInternas : totalEmpresas, ventasInternas,
    gastos: Object.values(porEmpresa).reduce((s, e) => s + e.gastos, 0),
    porEmpresa, cartera: carteraGrupo.reduce((s, c) => s + Number(c.saldo || 0), 0), carteraCant: carteraGrupo.length, carteraInterna, vencida, antig,
    porPagar: porPagar.reduce((s, d) => s + d.saldo, 0), porPagarCant: porPagar.length,
    porPagarVencido: porPagar.filter(d => d.vence && d.vence < fecha).reduce((s, d) => s + d.saldo, 0),
    porPagarProximo: porPagar.find(d => d.vence && d.vence >= fecha) || null,
    top: Object.entries(unidades).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]).slice(0, 8),
  }
}
