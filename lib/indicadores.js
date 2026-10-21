'use client'
import { supabase } from './supabase'
import { obtenerFechaActual } from './supabase-helpers'
import { detectorInterno } from './inicio-datos'
import { obsequiosEnNegativo } from './ventas-helpers'
import { cargarCostosDistri } from './costos-distri'
import { cargarProduccion, rendimientoPromedio } from './produccion-admin'
import { rangoPaquete, telasPorBulto, registrosDe } from './planta'
import { cargarCostos, costoTela } from './costos'
import { calcularStockPorSku } from './inventario-helpers'

// Indicadores de Reportes: cada uno se calcula para un rango de fechas, así la
// misma cuenta sirve para el tablero (el periodo escogido) y para su historia
// (los meses y semanas anteriores). Las metas las ponen en la transición; sin
// meta el indicador sale sin color.

// --- Fechas ----------------------------------------------------------------------
export const sumarDias = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }
const ultimoDia = (mes) => { const [y, m] = mes.split('-').map(Number); return new Date(y, m, 0).getDate() }
const mesDe = (f) => f.slice(0, 7)
const mesAnterior = (mes) => { const [y, m] = mes.split('-').map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const nombreMes = (mes) => new Date(mes + '-15T12:00:00').toLocaleDateString('es-CO', { month: 'short' }).replace('.', '')
const lunesDe = (f) => { const d = new Date(f + 'T12:00:00'); const dia = (d.getDay() + 6) % 7; return sumarDias(f, -dia) }
const dias = (desde, hasta) => Math.round((new Date(hasta + 'T12:00:00') - new Date(desde + 'T12:00:00')) / 864e5) + 1

// Rango del periodo escogido y el anterior de la misma duración.
export function rangoPeriodo(periodo, hoy = obtenerFechaActual()) {
  const mes = mesDe(hoy)
  if (periodo === 'semana') { const d = lunesDe(hoy); return { desde: d, hasta: hoy, nombre: 'Esta semana' } }
  if (periodo === 'pasado') { const m = mesAnterior(mes); return { desde: `${m}-01`, hasta: `${m}-${ultimoDia(m)}`, nombre: new Date(m + '-15T12:00:00').toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }) } }
  if (periodo === 'tres') { const m = mesAnterior(mesAnterior(mes)); return { desde: `${m}-01`, hasta: hoy, nombre: 'Últimos 3 meses' } }
  return { desde: `${mes}-01`, hasta: hoy, nombre: new Date(mes + '-15T12:00:00').toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }) }
}
export function rangoAnterior(r) {
  const mesD = mesDe(r.desde), mesH = mesDe(r.hasta)
  // Mes (o meses) desde el día 1: el mismo número de días del mes anterior.
  if (r.desde.endsWith('-01')) {
    const meses = (Number(mesH.slice(0, 4)) - Number(mesD.slice(0, 4))) * 12 + Number(mesH.slice(5)) - Number(mesD.slice(5)) + 1
    let m = mesD; for (let i = 0; i < meses; i++) m = mesAnterior(m)
    let fin = mesH; for (let i = 0; i < meses; i++) fin = mesAnterior(fin)
    const dia = Math.min(Number(r.hasta.slice(8)), ultimoDia(fin))
    return { desde: `${m}-01`, hasta: `${fin}-${String(dia).padStart(2, '0')}` }
  }
  const n = dias(r.desde, r.hasta)
  return { desde: sumarDias(r.desde, -7 * Math.ceil(n / 7)), hasta: sumarDias(r.hasta, -7 * Math.ceil(n / 7)) }
}
// Historia: los últimos 6 meses y las últimas 8 semanas hasta hoy.
export function historia(hoy = obtenerFechaActual()) {
  const meses = []; let m = mesDe(hoy)
  for (let i = 0; i < 6; i++) { meses.unshift({ desde: `${m}-01`, hasta: i === 0 ? hoy : `${m}-${ultimoDia(m)}`, etiqueta: nombreMes(m) }); m = mesAnterior(m) }
  const semanas = []; let l = lunesDe(hoy)
  for (let i = 0; i < 8; i++) { semanas.unshift({ desde: l, hasta: i === 0 ? hoy : sumarDias(l, 6), etiqueta: new Date(l + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }).replace('.', '') }); l = sumarDias(l, -7) }
  return { meses, semanas }
}

// --- Datos (con memoria por rango para no pedir lo mismo dos veces) ---------------
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
const traer = (ctx, clave, fn) => { if (!ctx.memo.has(clave)) ctx.memo.set(clave, fn()); return ctx.memo.get(clave) }
const fmt$ = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n || 0)).toLocaleString('es-CO')
const fmtPct = (n, d = 1) => `${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('es-CO', { maximumFractionDigits: d })}%`
const fmtM = (n) => '$' + (n / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' M'

export function contexto(empresas, ids, consolidado) {
  const elegidas = empresas.filter(e => ids.includes(e.id))
  const productora = elegidas.find(e => (e.modelos || []).includes('produccion')) || null
  return { empresas, ids, consolidado, productora, distribuidoras: elegidas.filter(e => e !== productora), interna: detectorInterno(empresas), memo: new Map(), hoy: obtenerFechaActual() }
}

const rutas = (ctx) => traer(ctx, 'rutas', async () => {
  const { data } = await supabase.from('rutas').select('id, nombre, tipo, empresa_id').in('empresa_id', ctx.ids)
  return Object.fromEntries((data || []).map(r => [r.id, r]))
})
const nombreRuta = (n) => (n || '').replace(/^RUTA\s+/i, '').replace(/\b(\w)(\w*)/g, (_, a, b) => a + b.toLowerCase())

// Ventas del rango por ruta y por canal (rutas, puntos de venta, mostrador).
// En el grupo no cuentan las ventas entre empresas.
function ventas(ctx, r) {
  return traer(ctx, `ventas:${r.desde}:${r.hasta}`, async () => {
    const [liq, desps, vts, obs, rs] = await Promise.all([
      todo(() => supabase.from('liquidaciones').select('despacho_id, efectivo_esperado, empresa_id').gte('fecha', r.desde).lte('fecha', r.hasta).in('empresa_id', ctx.ids)),
      todo(() => supabase.from('despachos_encab').select('id, ruta_id').gte('fecha', r.desde).lte('fecha', r.hasta).in('empresa_id', ctx.ids)),
      todo(() => supabase.from('ventas_encab').select('total, cliente_nombre, empresa_id').neq('estado', 'anulada').gte('fecha', r.desde).lte('fecha', r.hasta).in('empresa_id', ctx.ids)),
      Promise.all(ctx.ids.map(id => obsequiosEnNegativo({ desde: r.desde, hasta: r.hasta, empresaId: id }))).then(l => l.flat()),
      rutas(ctx),
    ])
    const rutaDe = Object.fromEntries(desps.map(d => [d.id, d.ruta_id]))
    const porRuta = {}, canal = { rutas: 0, pdv: 0, mostrador: 0 }
    let total = 0
    ;[...liq, ...obs].forEach(l => {
      const v = Number(l.efectivo_esperado || 0), ruta = rs[rutaDe[l.despacho_id]]
      total += v
      const n = ruta ? nombreRuta(ruta.nombre) : 'Sin ruta'
      porRuta[n] = (porRuta[n] || 0) + v
      canal[ruta?.tipo === 'punto_venta' ? 'pdv' : 'rutas'] += v
    })
    vts.forEach(v => {
      if (ctx.consolidado && ctx.interna(v)) return
      const t = Number(v.total || 0)
      total += t; canal.mostrador += t
      porRuta.Mostrador = (porRuta.Mostrador || 0) + t
    })
    return { total, porRuta, canal }
  })
}

// Ventas con cliente (Mi ruta y mostrador): para compra por cliente y clientes.
function ventasConCliente(ctx, desde, hasta) {
  return traer(ctx, `vcc:${desde}:${hasta}`, async () => {
    const [vr, ve, rs] = await Promise.all([
      todo(() => supabase.from('ventas_ruta').select('cliente_id, nombre_cliente, total, fecha, ruta_id, forma_pago').eq('estado', 'activa').gte('fecha', desde).lte('fecha', hasta).in('empresa_id', ctx.ids)),
      todo(() => supabase.from('ventas_encab').select('cliente_id, cliente_nombre, total, fecha, empresa_id').neq('estado', 'anulada').gte('fecha', desde).lte('fecha', hasta).in('empresa_id', ctx.ids)),
      rutas(ctx),
    ])
    const generico = /^(venta en la calle|cliente|mostrador|consumidor final)?$/i
    const filas = []
    vr.forEach(v => { const nom = (v.nombre_cliente || '').trim(); if (v.cliente_id || !generico.test(nom)) filas.push({ clave: v.cliente_id || nom.toLowerCase(), nombre: nom, total: Number(v.total || 0), fecha: v.fecha, ruta: nombreRuta(rs[v.ruta_id]?.nombre) || 'Ruta' }) })
    ve.forEach(v => { if (ctx.consolidado && ctx.interna(v)) return; const nom = (v.cliente_nombre || '').trim(); if (v.cliente_id || !generico.test(nom)) filas.push({ clave: v.cliente_id || nom.toLowerCase(), nombre: nom, total: Number(v.total || 0), fecha: v.fecha, ruta: 'Mostrador' }) })
    return filas
  })
}

const costosDistri = (ctx, mes) => traer(ctx, `cd:${mes}`, async () => {
  const l = await Promise.all(ctx.distribuidoras.map(e => cargarCostosDistri(mes, e.id).catch(() => null)))
  return l.filter(Boolean)
})
const produccion = (ctx) => traer(ctx, 'prod', () => cargarProduccion(ctx.productora.id))
const registrosPlanta = (ctx, r, tipos) => traer(ctx, `rp:${tipos}:${r.desde}:${r.hasta}`, async () => {
  const desde = new Date(r.desde + 'T00:00:00-05:00').toISOString(), hasta = new Date(sumarDias(r.hasta, 1) + 'T00:00:00-05:00').toISOString()
  return todo(() => supabase.from('produccion_muestras_peso').select('tipo, producto_id, cantidad, pesos_individuales, hora, motivo').eq('empresa_id', ctx.productora.id).eq('anulado', false).in('tipo', tipos.split(',')).gte('hora', desde).lt('hora', hasta))
})

// --- Los indicadores ---------------------------------------------------------------
// sentido 'mas': más es mejor; 'menos': menos es mejor. grafica: barras, linea, apilada, puntos.
export const INDICADORES = [
  {
    id: 'meta_mes', area: 'Ventas', nombre: 'Cumplimiento de la meta del mes', sentido: 'mas', unidad: '%', grafica: 'barras', soloMes: true, metaPropia: true,
    calc: async (ctx, r) => {
      const mes = mesDe(r.hasta)
      const desde = `${mes}-01`
      const [{ data: metas }, v, rs] = await Promise.all([
        supabase.from('metas_ventas').select('meta, ruta_id').eq('mes', mes).in('empresa_id', ctx.ids),
        ventas(ctx, { desde, hasta: r.hasta }), rutas(ctx),
      ])
      const meta = (metas || []).reduce((s, m) => s + Number(m.meta || 0), 0)
      if (!meta) return { valor: null, texto: 'Sin metas', sig: 'No hay metas de ventas este mes (Finanzas → Metas)' }
      const ritmo = r.hasta >= `${mes}-${ultimoDia(mes)}` ? 100 : Number(r.hasta.slice(8)) / ultimoDia(mes) * 100
      const porRuta = {}
      ;(metas || []).forEach(m => { const n = nombreRuta(rs[m.ruta_id]?.nombre) || 'Sin ruta'; porRuta[n] = (porRuta[n] || 0) + Number(m.meta) })
      // Cada meta contra las ventas de su ruta: las rutas sin meta no cuentan.
      const vendido = Object.keys(porRuta).reduce((s, n) => s + (v.porRuta[n] || 0), 0)
      const pct = vendido / meta * 100
      const sinMeta = Object.keys(v.porRuta).filter(n => !porRuta[n] && v.porRuta[n] > 0).length
      return {
        valor: pct, texto: fmtPct(pct, 0), sig: `${fmtM(vendido)} de ${fmtM(meta)}${sinMeta ? ` · ${sinMeta} ${sinMeta === 1 ? 'ruta sin meta' : 'rutas sin meta'}` : ''}`, ritmo,
        metaTexto: ritmo < 100 ? `Al ritmo del mes debería ir en ${fmtPct(ritmo, 0)}` : 'Meta: 100%',
        estado: pct >= ritmo ? 'verde' : pct >= ritmo * 0.9 ? 'ambar' : 'rojo',
        filas: Object.entries(porRuta).map(([n, m]) => [n, (v.porRuta[n] || 0) / m * 100]).sort((a, b) => a[1] - b[1]).map(([n, p]) => [n, fmtPct(p, 0)]),
        peor: Object.entries(porRuta).map(([n, m]) => [n, (v.porRuta[n] || 0) / m * 100]).sort((a, b) => a[1] - b[1])[0],
      }
    },
    hacer: (res) => res.estado === 'verde' ? 'Avance acorde al ritmo de la meta.' : res.peor ? `${res.peor[0]} presenta el menor avance (${fmtPct(res.peor[1], 0)}). Revisar con el vendedor la meta asignada y la cobertura del rutero.` : 'Revisar las metas por ruta en Finanzas.',
  },
  {
    id: 'crecimiento', area: 'Ventas', nombre: 'Crecimiento contra el periodo anterior', sentido: 'mas', unidad: '%', grafica: 'barras',
    calc: async (ctx, r) => {
      const ant = rangoAnterior(r)
      const [a, b] = await Promise.all([ventas(ctx, r), ventas(ctx, ant)])
      if (!b.total) return { valor: null, texto: 'Sin dato', sig: 'No hay ventas en el periodo anterior' }
      const pct = (a.total / b.total - 1) * 100
      const filas = Object.keys({ ...a.porRuta, ...b.porRuta }).map(n => [n, b.porRuta[n] ? ((a.porRuta[n] || 0) / b.porRuta[n] - 1) * 100 : null]).filter(x => x[1] != null).sort((x, y) => x[1] - y[1])
      return { valor: pct, texto: `${pct > 0 ? '+' : ''}${fmtPct(pct)}`, sig: `${fmtM(a.total)} contra ${fmtM(b.total)}`, filas: filas.map(([n, p]) => [n, `${p > 0 ? '+' : ''}${fmtPct(p, 0)}`]), peor: filas[0] }
    },
    hacer: (res) => res.peor && res.peor[1] < 0 ? `${res.peor[0]} presenta la mayor caída (${fmtPct(res.peor[1], 0)}). Revisar los clientes inactivos de esa ruta.` : 'Todas las rutas crecen o se mantienen.',
  },
  {
    id: 'ticket', area: 'Ventas', nombre: 'Ticket promedio por cliente', sentido: 'mas', unidad: '$', grafica: 'linea',
    calc: async (ctx, r) => {
      const l = await ventasConCliente(ctx, r.desde, r.hasta)
      const clientes = new Map()
      l.forEach(v => { const c = clientes.get(v.clave) || { total: 0, ruta: v.ruta }; c.total += v.total; clientes.set(v.clave, c) })
      if (!clientes.size) return { valor: null, texto: 'Sin dato', sig: 'No hay ventas con cliente en el periodo' }
      const total = [...clientes.values()].reduce((s, c) => s + c.total, 0)
      const porRuta = {}
      clientes.forEach(c => { const x = (porRuta[c.ruta] = porRuta[c.ruta] || { t: 0, n: 0 }); x.t += c.total; x.n++ })
      return { valor: total / clientes.size, texto: fmt$(total / clientes.size), sig: `${clientes.size.toLocaleString('es-CO')} clientes · ${fmtM(total)}`, filas: Object.entries(porRuta).sort((a, b) => b[1].t - a[1].t).map(([n, x]) => [n, `${fmt$(x.t / x.n)} · ${x.n} clientes`]) }
    },
    hacer: (res, meta) => meta == null ? 'Sin meta definida: solo se muestra la tendencia.' : res.valor >= meta ? 'Dentro de la meta.' : 'Promover el paquete x6 y la venta cruzada para aumentar el valor de compra por cliente.',
  },
  {
    id: 'visitas', area: 'Rutas y clientes', nombre: 'Efectividad de visitas', sentido: 'mas', unidad: '%', grafica: 'linea',
    calc: async (ctx, r) => {
      const [vis, rs] = await Promise.all([
        todo(() => supabase.from('visitas_ruta').select('resultado, ruta_id').gte('fecha', r.desde).lte('fecha', r.hasta).in('empresa_id', ctx.ids).in('resultado', ['compro', 'no_compro', 'no_estaba'])),
        rutas(ctx),
      ])
      if (!vis.length) return { valor: null, texto: 'Sin dato', sig: 'No hay visitas marcadas en Mi ruta' }
      const porRuta = {}
      vis.forEach(v => { const n = nombreRuta(rs[v.ruta_id]?.nombre) || 'Ruta'; const x = (porRuta[n] = porRuta[n] || { c: 0, n: 0 }); x.n++; if (v.resultado === 'compro') x.c++ })
      const compro = vis.filter(v => v.resultado === 'compro').length
      const filas = Object.entries(porRuta).map(([n, x]) => [n, x.c / x.n * 100, x]).sort((a, b) => a[1] - b[1])
      return { valor: compro / vis.length * 100, texto: fmtPct(compro / vis.length * 100, 0), sig: `${compro} ventas en ${vis.length} visitas`, filas: filas.map(([n, p, x]) => [n, `${fmtPct(p, 0)} · ${x.c} de ${x.n}`]), peor: filas[0] }
    },
    hacer: (res) => res.peor ? `${res.peor[0]} convierte el ${fmtPct(res.peor[1], 0)} de las visitas. Revisar el orden del rutero y los clientes sin compras.` : 'Registrar las visitas en Mi ruta para medir este indicador.',
  },
  {
    id: 'activos', area: 'Rutas y clientes', nombre: 'Clientes activos del rutero', sentido: 'mas', unidad: '%', grafica: 'linea',
    calc: async (ctx, r) => {
      const [rut, rs] = await Promise.all([todo(() => supabase.from('rutero').select('cliente_id, ruta_id').in('empresa_id', ctx.ids)), rutas(ctx)])
      const l = await ventasConCliente(ctx, sumarDias(r.hasta, -13), r.hasta)
      const compraron = new Set(l.map(v => v.clave))
      const rutaDe = new Map(); rut.forEach(x => { if (!rutaDe.has(x.cliente_id)) rutaDe.set(x.cliente_id, x.ruta_id) })
      if (!rutaDe.size) return { valor: null, texto: 'Sin dato', sig: 'No hay clientes en el rutero' }
      const porRuta = {}
      rutaDe.forEach((ruta, c) => { const n = nombreRuta(rs[ruta]?.nombre) || 'Ruta'; const x = (porRuta[n] = porRuta[n] || { a: 0, n: 0 }); x.n++; if (compraron.has(c)) x.a++ })
      const activos = [...rutaDe.keys()].filter(c => compraron.has(c)).length
      const filas = Object.entries(porRuta).map(([n, x]) => [n, x.a / x.n * 100, x]).sort((a, b) => a[1] - b[1])
      return { valor: activos / rutaDe.size * 100, texto: fmtPct(activos / rutaDe.size * 100, 0), sig: `${activos} de ${rutaDe.size} compraron en los últimos 14 días`, filas: filas.map(([n, p, x]) => [n, `${fmtPct(p, 0)} · ${x.a} de ${x.n}`]), sinComprar: rutaDe.size - activos }
    },
    hacer: (res) => res.sinComprar ? `Hay ${res.sinComprar} clientes del rutero sin compras en los últimos 14 días. Programar visita o depurar el rutero.` : 'Todo el rutero registra compras recientes.',
  },
  {
    id: 'perdidos', area: 'Rutas y clientes', nombre: 'Clientes inactivos', sentido: 'menos', unidad: '', grafica: 'barras',
    calc: async (ctx, r) => {
      const [antes, ahora] = await Promise.all([ventasConCliente(ctx, sumarDias(r.hasta, -44), sumarDias(r.hasta, -14)), ventasConCliente(ctx, sumarDias(r.hasta, -13), r.hasta)])
      const recientes = new Set(ahora.map(v => v.clave))
      const perdidos = new Map()
      antes.forEach(v => { if (recientes.has(v.clave)) return; const c = perdidos.get(v.clave) || { nombre: v.nombre, ruta: v.ruta, total: 0, ultima: v.fecha }; c.total += v.total; if (v.fecha > c.ultima) c.ultima = v.fecha; perdidos.set(v.clave, c) })
      const l = [...perdidos.values()].sort((a, b) => b.total - a.total)
      return { valor: l.length, texto: String(l.length), sig: 'Clientes con compras previas y sin compras en los últimos 14 días', filas: l.slice(0, 10).map(c => [`${c.nombre} · ${c.ruta}`, `${fmt$(c.total)} · hace ${dias(c.ultima, r.hasta) - 1} días`]) }
    },
    hacer: (res) => res.valor ? 'Enviar a cada vendedor su lista para programar visitas esta semana.' : 'No hay clientes inactivos.',
  },
  {
    id: 'vencida', area: 'Finanzas', nombre: 'Cartera vencida', sentido: 'menos', unidad: '%', grafica: 'apilada', soloHoy: true,
    calc: async (ctx) => {
      const l = (await todo(() => supabase.from('cartera_fiados').select('saldo, fecha_pago, nombre_cliente, empresa_id, ruta_id').eq('estado', 'pendiente').gt('saldo', 0).in('empresa_id', ctx.ids)))
        .filter(c => !(ctx.consolidado && ctx.interna({ cliente_nombre: c.nombre_cliente, empresa_id: c.empresa_id })))
      const total = l.reduce((s, c) => s + Number(c.saldo), 0)
      if (!total) return { valor: 0, texto: '0%', sig: 'No hay nada por cobrar' }
      const b = { 'Al día': 0, '1 a 15 días': 0, '16 a 30 días': 0, 'Más de 30': 0 }
      l.forEach(c => { const d = c.fecha_pago && c.fecha_pago < ctx.hoy ? dias(c.fecha_pago, ctx.hoy) - 1 : 0; b[d <= 0 ? 'Al día' : d <= 15 ? '1 a 15 días' : d <= 30 ? '16 a 30 días' : 'Más de 30'] += Number(c.saldo) })
      const vencida = total - b['Al día']
      return { valor: vencida / total * 100, texto: fmtPct(vencida / total * 100, 0), sig: `${fmtM(vencida)} vencidos de ${fmtM(total)} por cobrar`, filas: Object.entries(b).map(([n, v]) => [n, fmt$(v)]), partes: b, vencidos: l.filter(c => c.fecha_pago && c.fecha_pago < ctx.hoy).length }
    },
    hacer: (res, meta) => res.vencidos ? `Priorizar el cobro de los ${res.vencidos} créditos vencidos antes de otorgar nuevo crédito (ver Cartera).` : 'No hay créditos vencidos.',
  },
  {
    id: 'credito', area: 'Finanzas', nombre: 'Venta a crédito', sentido: 'menos', unidad: '%', grafica: 'linea',
    calc: async (ctx, r) => {
      const [v, fiados] = await Promise.all([ventas(ctx, r), todo(() => supabase.from('cartera_fiados').select('valor_original, nombre_cliente, empresa_id, ruta_id').eq('es_saldo_inicial', false).gte('fecha_fiado', r.desde).lte('fecha_fiado', r.hasta).in('empresa_id', ctx.ids))])
      const f = fiados.filter(c => !(ctx.consolidado && ctx.interna({ cliente_nombre: c.nombre_cliente, empresa_id: c.empresa_id })))
      if (!v.total) return { valor: null, texto: 'Sin dato', sig: 'No hay ventas en el periodo' }
      const credito = f.reduce((s, c) => s + Number(c.valor_original || 0), 0)
      const rs = await rutas(ctx)
      const porRuta = {}; f.forEach(c => { const n = c.ruta_id ? nombreRuta(rs[c.ruta_id]?.nombre) : 'Mostrador'; porRuta[n] = (porRuta[n] || 0) + Number(c.valor_original || 0) })
      return { valor: credito / v.total * 100, texto: fmtPct(credito / v.total * 100, 0), sig: `${fmtM(credito)} fiados de ${fmtM(v.total)}`, filas: Object.entries(porRuta).map(([n, c]) => [n, v.porRuta[n] ? c / v.porRuta[n] * 100 : null, c]).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).map(([n, p, c]) => [n, p != null ? `${fmtPct(p, 0)} · ${fmt$(c)}` : fmt$(c)]) }
    },
    hacer: (res, meta) => meta != null && res.valor > meta ? 'La venta a crédito supera la meta: revisar los cupos de crédito asignados.' : 'Dentro de la meta.',
  },
  {
    id: 'margen', area: 'Finanzas', nombre: 'Margen sobre la compra', sentido: 'mas', unidad: '%', grafica: 'linea', soloDistri: true, soloMes: true,
    calc: async (ctx, r) => {
      const l = await costosDistri(ctx, mesDe(r.hasta))
      const filasRuta = l.flatMap(d => d.filasRuta), filasProd = l.flatMap(d => d.filasProducto)
      const v = filasRuta.reduce((s, x) => s + x.ventas, 0), m = filasRuta.reduce((s, x) => s + x.mercancia, 0)
      if (!v) return { valor: null, texto: 'Sin dato', sig: 'No hay ventas liquidadas en el mes' }
      const bajos = filasProd.filter(f => f.unidades > 0 && f.margenPct != null).sort((a, b) => a.margenPct - b.margenPct)
      return { valor: (v - m) / v * 100, texto: fmtPct((v - m) / v * 100), sig: `De cada $100 vendidos, $${((v - m) / v * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 })} son margen`, filas: bajos.slice(0, 6).map(f => [f.nombre, fmtPct(f.margenPct)]), peor: bajos[0] }
    },
    hacer: (res) => res.peor ? `${res.peor.nombre} presenta el menor margen (${fmtPct(res.peor.margenPct)}). Revisar su precio de venta o su costo de compra en Costos.` : 'Revisar los costos de compra en Costos.',
  },
  {
    id: 'repartir', area: 'Finanzas', nombre: 'Costo de distribución', sentido: 'menos', unidad: '$100', grafica: 'barras', soloDistri: true, soloMes: true,
    calc: async (ctx, r) => {
      const l = await costosDistri(ctx, mesDe(r.hasta))
      const fr = l.flatMap(d => d.filasRuta).filter(x => x.tipo !== 'mostrador')
      const v = fr.reduce((s, x) => s + x.ventas, 0), c = fr.reduce((s, x) => s + x.repartir, 0)
      if (!v) return { valor: null, texto: 'Sin dato', sig: 'No hay ventas de ruta en el mes' }
      const filas = fr.filter(x => x.ventas).map(x => [nombreRuta(x.nombre), x.repartir / x.ventas * 100]).sort((a, b) => b[1] - a[1])
      return { valor: c / v * 100, texto: `$${Math.round(c / v * 100)}`, sig: 'De cada $100 vendidos en ruta y puntos de venta', filas: filas.map(([n, p]) => [n, `$${Math.round(p)}`]), peor: filas[0] }
    },
    hacer: (res) => res.peor && res.peor[1] > 50 ? `${res.peor[0]} registra un costo de distribución de $${Math.round(res.peor[1])} por cada $100 vendidos. Revisar la nómina asignada y las ventas pendientes por registrar.` : 'Dentro de la meta.',
  },
  {
    id: 'telas', area: 'Producción', nombre: 'Telas por bulto', sentido: 'mas', unidad: '', grafica: 'puntos', soloProduccion: true, metaPropia: true,
    calc: async (ctx, r) => {
      const e = await produccion(ctx)
      const rp = rendimientoPromedio(e)
      const lotes = e.lista.filter(c => c.estado === 'cerrado' && c.cerrado_at && c.cerrado_at.slice(0, 10) >= r.desde && c.cerrado_at.slice(0, 10) <= sumarDias(r.hasta, 1))
        .map(c => ({ c, t: telasPorBulto(e, c)?.telas })).filter(x => x.t > 0)
      const todos = e.lista.filter(c => c.estado === 'cerrado').sort((a, b) => (a.cerrado_at || '').localeCompare(b.cerrado_at || '')).map(c => telasPorBulto(e, c)?.telas).filter(x => x > 0)
      const prom = lotes.length ? lotes.reduce((s, x) => s + x.t, 0) / lotes.length : null
      const tq = {}; lotes.forEach(x => { const n = e.tanques.find(t => t.id === x.c.tanque_id)?.nombre || 'Lote'; (tq[n] = tq[n] || []).push(x.t) })
      const base = { puntos: todos, filas: Object.entries(tq).map(([n, l]) => [n, `${Math.round(l.reduce((s, v) => s + v, 0) / l.length)} · ${l.length} lotes`]) }
      if (!rp.listo) return { ...base, valor: prom, texto: prom ? String(Math.round(prom)) : 'Sin dato', estado: 'gris', metaTexto: `Midiendo: ${rp.n} de ${rp.meta} lotes`, sig: `${lotes.length} lotes cerrados en el periodo` }
      const dev = prom ? (prom / rp.valor - 1) * 100 : null
      return { ...base, valor: prom, texto: prom ? String(Math.round(prom)) : 'Sin dato', metaTexto: `Estándar: ${Math.round(rp.valor)}`, sig: `${lotes.length} lotes cerrados en el periodo`, estado: dev == null ? 'sin' : dev >= -2 ? 'verde' : dev >= -5 ? 'ambar' : 'rojo' }
    },
    hacer: (res) => res.estado === 'gris' ? 'En medición: con el lote 26 el promedio se establece como estándar.' : res.estado === 'verde' ? 'Rendimiento dentro del estándar.' : 'Rendimiento inferior al estándar: revisar el gramaje en crudo y la cocción del maíz.',
  },
  {
    id: 'peso', area: 'Producción', nombre: 'Paquetes en el rango de peso', sentido: 'mas', unidad: '%', grafica: 'linea', soloProduccion: true,
    calc: async (ctx, r) => {
      const [e, regs] = await Promise.all([produccion(ctx), registrosPlanta(ctx, r, 'paquete')])
      const porRef = {}
      let ok = 0, n = 0
      regs.forEach(x => {
        const p = e.referencias.find(q => q.id === x.producto_id); const rg = rangoPaquete(e, p)
        if (!rg) return
        ;(x.pesos_individuales || []).map(Number).forEach(g => { const bien = g >= rg.min && g <= rg.max; n++; if (bien) ok++; const k = (porRef[p.nombre] = porRef[p.nombre] || { ok: 0, n: 0, livianos: 0 }); k.n++; if (bien) k.ok++; if (g < rg.min) k.livianos++ })
      })
      if (!n) return { valor: null, texto: 'Sin dato', sig: 'No han pesado cajas en el periodo' }
      const filas = Object.entries(porRef).map(([nom, k]) => [nom.replace(/^Arepa (de Maíz )?/i, ''), k.ok / k.n * 100, k]).sort((a, b) => a[1] - b[1])
      return { valor: ok / n * 100, texto: fmtPct(ok / n * 100, 0), sig: `${n} paquetes pesados`, filas: filas.map(([nom, p, k]) => [nom, `${fmtPct(p, 0)}${k.livianos ? ` · ${k.livianos} livianos` : ''}`]), peor: filas[0] }
    },
    hacer: (res) => res.peor && res.peor[1] < 95 ? `${res.peor[0]} presenta más paquetes fuera de rango. Ajustar su gramaje en crudo en Producción → Estándares.` : 'Los paquetes cumplen el rango de peso.',
  },
  {
    id: 'plan', area: 'Producción', nombre: 'Cumplimiento del plan', sentido: 'mas', unidad: '%', grafica: 'barras', soloProduccion: true,
    calc: async (ctx, r) => {
      const [{ data: plan }, regs, e] = await Promise.all([
        supabase.from('produccion_plan').select('fecha, producto_id, paquetes').eq('empresa_id', ctx.productora.id).gte('fecha', r.desde).lte('fecha', r.hasta),
        registrosPlanta(ctx, r, 'empaque'), produccion(ctx),
      ])
      if (!(plan || []).length) return { valor: null, texto: 'Sin dato', sig: 'No hay plan del día en el periodo' }
      const hecho = {}
      regs.forEach(x => { const f = new Date(x.hora).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }); const k = f + x.producto_id; hecho[k] = (hecho[k] || 0) + Number(x.cantidad || 0) })
      const porRef = {}
      let pedido = 0, cumplido = 0
      plan.forEach(p => { const h = Math.min(hecho[p.fecha + p.producto_id] || 0, p.paquetes); pedido += p.paquetes; cumplido += h; const n = (e.referencias.find(q => q.id === p.producto_id)?.nombre || '').replace(/^Arepa (de Maíz )?/i, ''); const k = (porRef[n] = porRef[n] || { p: 0, c: 0 }); k.p += p.paquetes; k.c += h })
      const filas = Object.entries(porRef).map(([n, k]) => [n, k.c / k.p * 100]).sort((a, b) => a[1] - b[1])
      return { valor: cumplido / pedido * 100, texto: fmtPct(cumplido / pedido * 100, 0), sig: `${cumplido.toLocaleString('es-CO')} de ${pedido.toLocaleString('es-CO')} paquetes pedidos`, filas: filas.map(([n, p]) => [n, fmtPct(p, 0)]), peor: filas[0] }
    },
    hacer: (res) => res.peor && res.peor[1] < 95 ? `${res.peor[0]} presenta el menor cumplimiento (${fmtPct(res.peor[1], 0)}).` : 'El plan se cumple.',
  },
  {
    id: 'desecho', area: 'Producción', nombre: 'Reproceso y desecho', sentido: 'menos', unidad: '%', grafica: 'linea', soloProduccion: true,
    calc: async (ctx, r) => {
      const regs = await registrosPlanta(ctx, r, 'bola,reproceso,desecho')
      const suma = (t) => regs.filter(x => x.tipo === t).reduce((s, x) => s + Number(x.cantidad || 0), 0)
      const masa = suma('bola'), rep = suma('reproceso'), des = suma('desecho')
      if (!masa) return { valor: null, texto: 'Sin dato', sig: 'No hay masa pesada en el periodo' }
      const motivos = {}
      regs.filter(x => x.tipo === 'reproceso').forEach(x => { const m = x.motivo || 'Sin motivo'; motivos[m] = (motivos[m] || 0) + Number(x.cantidad || 0) })
      const kg = (v) => `${v.toLocaleString('es-CO', { maximumFractionDigits: 1 })} kg · ${fmtPct(v / masa * 100)}`
      const filas = [...Object.entries(motivos).sort((a, b) => b[1] - a[1]).map(([m, v]) => [`Reproceso · ${m}`, kg(v)]), ['Desecho', kg(des)]]
      return { valor: (rep + des) / masa * 100, texto: fmtPct((rep + des) / masa * 100), sig: `${(rep + des).toLocaleString('es-CO', { maximumFractionDigits: 1 })} kg de ${masa.toLocaleString('es-CO', { maximumFractionDigits: 0 })} kg de masa`, filas, peor: Object.entries(motivos).sort((a, b) => b[1] - a[1])[0] }
    },
    hacer: (res, meta) => res.peor ? `El motivo principal es "${res.peor[0]}". ${meta != null && res.valor > meta ? 'La pérdida de masa supera la meta: revisar esa etapa del proceso.' : ''}`.trim() : 'Dentro de la meta.',
  },
  {
    id: 'ciclo', area: 'Producción', nombre: 'Tiempo de ciclo por lote', sentido: 'menos', unidad: 'h', grafica: 'barras', soloProduccion: true,
    calc: async (ctx, r) => {
      const e = await produccion(ctx)
      const lotes = e.lista.filter(c => c.estado === 'cerrado' && c.cerrado_at && c.hora_montada && c.cerrado_at.slice(0, 10) >= r.desde && c.cerrado_at.slice(0, 10) <= sumarDias(r.hasta, 1))
        .map(c => { const emp = registrosDe(e, c.id, 'empaque'); const fin = emp.length ? emp[emp.length - 1].hora : c.cerrado_at; return { c, h: (new Date(fin) - new Date(c.hora_montada)) / 36e5, reposo: c.hora_apagado && c.hora_sacada ? (new Date(c.hora_sacada) - new Date(c.hora_apagado)) / 36e5 : null } })
        .filter(x => x.h > 0)
      if (!lotes.length) return { valor: null, texto: 'Sin dato', sig: 'No hay lotes cerrados en el periodo' }
      const prom = (l) => l.reduce((s, v) => s + v, 0) / l.length
      const h = prom(lotes.map(x => x.h)), rep = lotes.map(x => x.reposo).filter(v => v != null)
      const hh = (v) => `${Math.floor(v)} h ${String(Math.round((v % 1) * 60)).padStart(2, '0')} min`
      return { valor: h, texto: hh(h), sig: `Desde el montaje hasta el último paquete · ${lotes.length} lotes`, filas: [['Reposo en el tanque', rep.length ? hh(prom(rep)) : 'Sin dato'], ['Lote más corto', hh(Math.min(...lotes.map(x => x.h)))], ['Lote más largo', hh(Math.max(...lotes.map(x => x.h)))]] }
    },
    hacer: (res, meta) => meta != null && res.valor > meta ? 'El tiempo de ciclo supera la meta: identificar el cuello de botella entre reposo, troquelado y enfriamiento.' : 'Incluye el reposo del maíz en el tanque, que forma parte del proceso.',
  },
  {
    id: 'costo_paquete', area: 'Producción', nombre: 'Costo unitario de la Tela', sentido: 'menos', unidad: '$', grafica: 'linea', soloProduccion: true, soloMes: true,
    calc: async (ctx, r) => {
      const d = await traer(ctx, `costos:${mesDe(r.hasta)}`, () => cargarCostos(mesDe(r.hasta), ctx.productora.id))
      const blanco = d.tela && d.maizDe(d.tela.id)?.maizId
      const pm = d.porMaiz[blanco] || {}
      const telas = pm.telasMedido || pm.telasFormula
      const ct = blanco && telas ? costoTela(d, blanco, telas, d.contexto.bultosMes) : null
      if (!ct) return { valor: null, texto: 'Sin dato', sig: 'Faltan datos de costos' }
      const bolsa = d.val('precio_bolsa', d.tela.id) || 0
      return { valor: ct.masa + bolsa, texto: fmt$(ct.masa + bolsa), sig: `Paquete de Tela blanca${ct.incompleto ? ' · incompleto' : ''} · ${Math.round(telas)} Telas por bulto`, filas: [...ct.partes.map(p => [p.nombre, p.tela != null ? fmt$(p.tela) : 'Sin dato']), ['Bolsa', fmt$(bolsa)]], incompleto: ct.incompleto, mayor: ct.partes.filter(p => p.tela != null).sort((a, b) => b.tela - a.tela)[0] }
    },
    hacer: (res, meta) => res.incompleto ? 'Datos incompletos en Costos: el costo real es superior al calculado.' : res.mayor ? `El componente de mayor peso es ${res.mayor.nombre.toLowerCase()} (${fmt$(res.mayor.tela)}).${meta != null && res.valor > meta ? ' Revisar el precio del maíz y el rendimiento.' : ''}` : 'Ver el detalle en Costos.',
  },
  {
    id: 'operario', area: 'Producción', nombre: 'Productividad por operario', sentido: 'mas', unidad: '', grafica: 'barras', soloProduccion: true,
    calc: async (ctx, r) => {
      const [regs, { data: emps }] = await Promise.all([registrosPlanta(ctx, r, 'empaque'), supabase.from('empleados').select('id').eq('empresa_id', ctx.productora.id).eq('activo', true).eq('es_mano_obra_directa', true)])
      const paquetes = regs.reduce((s, x) => s + Number(x.cantidad || 0), 0)
      const diasProd = new Set(regs.map(x => new Date(x.hora).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }))).size
      const op = (emps || []).length
      if (!paquetes || !op) return { valor: null, texto: 'Sin dato', sig: !op ? 'No hay operarios marcados como mano de obra directa en Nómina' : 'No hay paquetes contados en el periodo' }
      const v = paquetes / diasProd / op
      return { valor: v, texto: Math.round(v).toLocaleString('es-CO'), sig: `${paquetes.toLocaleString('es-CO')} paquetes · ${diasProd} días · ${op} operarios`, filas: [['Paquetes empacados', paquetes.toLocaleString('es-CO')], ['Días con producción', String(diasProd)], ['Operarios de planta', String(op)]] }
    },
    hacer: (res, meta) => meta != null && res.valor < meta ? 'Productividad por debajo de la meta: revisar paradas, cambios de molde y oportunidades de automatización.' : 'Permite evaluar la necesidad de personal adicional o de automatización.',
  },
  {
    id: 'cambios', area: 'Calidad', nombre: 'Índice de cambios por calidad', sentido: 'menos', unidad: '%', grafica: 'linea',
    calc: async (ctx, r) => {
      const [nov, liq, ve] = await Promise.all([
        todo(() => supabase.from('novedades').select('cantidad, motivo, sku').gte('fecha', r.desde).lte('fecha', r.hasta).in('empresa_id', ctx.ids)),
        todo(() => supabase.from('liquidaciones').select('vendido_neto').gte('fecha', r.desde).lte('fecha', r.hasta).in('empresa_id', ctx.ids)),
        todo(() => supabase.from('ventas_encab').select('cliente_nombre, empresa_id, ventas_detalle(cantidad)').neq('estado', 'anulada').gte('fecha', r.desde).lte('fecha', r.hasta).in('empresa_id', ctx.ids)),
      ])
      const vendidas = liq.reduce((s, x) => s + Number(x.vendido_neto || 0), 0) + ve.filter(v => !(ctx.consolidado && ctx.interna(v))).reduce((s, v) => s + (v.ventas_detalle || []).reduce((t, d) => t + Number(d.cantidad || 0), 0), 0)
      if (!vendidas) return { valor: null, texto: 'Sin dato', sig: 'No hay ventas en el periodo' }
      const und = nov.reduce((s, x) => s + Number(x.cantidad || 0), 0)
      const mot = {}; nov.forEach(x => { const m = /kiosco/i.test(x.motivo || '') ? 'Sin motivo (kiosco)' : x.motivo || 'Sin motivo'; mot[m] = (mot[m] || 0) + Number(x.cantidad || 0) })
      return { valor: und / vendidas * 100, texto: fmtPct(und / vendidas * 100), sig: `${und.toLocaleString('es-CO')} unidades cambiadas de ${Math.round(vendidas).toLocaleString('es-CO')} vendidas`, filas: Object.entries(mot).sort((a, b) => b[1] - a[1]).map(([m, n]) => [m, `${n.toLocaleString('es-CO')} und`]), peor: Object.entries(mot).sort((a, b) => b[1] - a[1])[0] }
    },
    hacer: (res) => res.peor ? `El motivo más común es "${res.peor[0]}". Si son hongos o mal olor antes de vencer, revisar conservante, enfriamiento y almacenamiento.` : 'No hubo cambios.',
  },  {
    id: 'recompra', area: 'Rutas y clientes', nombre: 'Tasa de recompra', sentido: 'mas', unidad: '%', grafica: 'linea',
    calc: async (ctx, r) => {
      const ant = rangoAnterior(r)
      const [antes, ahora] = await Promise.all([ventasConCliente(ctx, ant.desde, ant.hasta), ventasConCliente(ctx, r.desde, r.hasta)])
      const previos = new Map(); antes.forEach(v => { if (!previos.has(v.clave)) previos.set(v.clave, v.ruta) })
      if (!previos.size) return { valor: null, texto: 'Sin dato', sig: 'No hay clientes con compras en el periodo anterior' }
      const volvieron = new Set(ahora.map(v => v.clave))
      const porRuta = {}
      previos.forEach((ruta, c) => { const x = (porRuta[ruta] = porRuta[ruta] || { v: 0, n: 0 }); x.n++; if (volvieron.has(c)) x.v++ })
      const v = [...previos.keys()].filter(c => volvieron.has(c)).length
      const filas = Object.entries(porRuta).map(([n, x]) => [n, x.v / x.n * 100, x]).sort((a, b) => a[1] - b[1])
      return { valor: v / previos.size * 100, texto: fmtPct(v / previos.size * 100, 0), sig: `${v} de ${previos.size} clientes del periodo anterior volvieron a comprar`, filas: filas.map(([n, p, x]) => [n, `${fmtPct(p, 0)} · ${x.v} de ${x.n}`]), peor: filas[0] }
    },
    hacer: (res) => res.peor ? `En ${res.peor[0]} vuelve a comprar el ${fmtPct(res.peor[1], 0)} de los clientes. El detalle está en el indicador Clientes inactivos.` : 'Revisar la lista de clientes que dejaron de comprar.',
  },
  {
    id: 'dias_inventario', area: 'Inventario', nombre: 'Días de inventario', sentido: 'menos', unidad: 'días', grafica: 'linea', soloHoy: true,
    calc: async (ctx) => {
      const desde = sumarDias(ctx.hoy, -13)
      const [stocks, prods, liq, ve] = await Promise.all([
        Promise.all(ctx.ids.map(id => calcularStockPorSku({ empresaId: id }).then(s => ({ id, s })).catch(() => ({ id, s: {} })))),
        todo(() => supabase.from('productos').select('sku, nombre, tipo, empresa_id').in('empresa_id', ctx.ids)),
        todo(() => supabase.from('liquidaciones').select('sku, vendido_neto, empresa_id').gte('fecha', desde).lte('fecha', ctx.hoy).in('empresa_id', ctx.ids)),
        todo(() => supabase.from('ventas_encab').select('empresa_id, cliente_nombre, ventas_detalle(sku, cantidad)').neq('estado', 'anulada').gte('fecha', desde).lte('fecha', ctx.hoy).in('empresa_id', ctx.ids)),
      ])
      const vendido = {}
      liq.forEach(l => { const k = l.empresa_id + l.sku; vendido[k] = (vendido[k] || 0) + Number(l.vendido_neto || 0) })
      ve.forEach(v => { if (ctx.consolidado && ctx.interna(v)) return; (v.ventas_detalle || []).forEach(d => { const k = v.empresa_id + d.sku; vendido[k] = (vendido[k] || 0) + Number(d.cantidad || 0) }) })
      const filas = []
      let stockTotal = 0, diarioTotal = 0
      prods.filter(p => p.tipo !== 'materia_prima').forEach(p => {
        const st = Math.max(0, Number(stocks.find(x => x.id === p.empresa_id)?.s?.[p.sku]?.stockActual || 0))
        const diario = (vendido[p.empresa_id + p.sku] || 0) / 14
        if (!st && !diario) return
        stockTotal += st; diarioTotal += diario
        filas.push({ nombre: p.nombre, st, diario, dias: diario ? st / diario : null })
      })
      if (!diarioTotal) return { valor: null, texto: 'Sin dato', sig: 'No hay ventas en los últimos 14 días' }
      const riesgo = filas.filter(f => f.st > 0).sort((a, b) => (b.dias ?? 1e9) - (a.dias ?? 1e9))
      const und = (n) => n.toLocaleString('es-CO', { maximumFractionDigits: 1 })
      return { valor: stockTotal / diarioTotal, texto: `${und(stockTotal / diarioTotal)} días`, sig: 'Existencias en bodega ÷ venta diaria promedio (últimos 14 días)',
        filas: riesgo.slice(0, 8).map(f => [f.nombre, f.dias == null ? `${und(f.st)} und · sin ventas` : `${und(f.dias)} días · ${und(f.st)} und`]), peor: riesgo[0], sinVentas: riesgo.filter(f => f.dias == null).length }
    },
    hacer: (res) => res.peor ? `${res.peor.nombre} registra la mayor permanencia en bodega${res.peor.dias != null ? ` (${Math.round(res.peor.dias)} días)` : ' y sin ventas en 14 días'}. Ajustar la compra o priorizar su venta en ruta antes del vencimiento.${res.sinVentas > 1 ? ` Hay ${res.sinVentas} productos con existencias y sin ventas.` : ''}` : 'Rotación de inventario adecuada.',
  },
  {
    id: 'proveedor', area: 'Calidad', nombre: 'Calidad del proveedor', sentido: 'menos', unidad: '%', grafica: 'linea',
    calc: async (ctx, r) => {
      const [nov, compras, { data: provs }] = await Promise.all([
        todo(() => supabase.from('novedades').select('cantidad, proveedor_id').not('proveedor_id', 'is', null).gte('fecha', r.desde).lte('fecha', r.hasta).in('empresa_id', ctx.ids)),
        todo(() => supabase.from('compras').select('cantidad, proveedor_id').gte('fecha', r.desde).lte('fecha', r.hasta).in('empresa_id', ctx.ids)),
        supabase.from('proveedores').select('id, nombre').in('empresa_id', ctx.ids),
      ])
      const nombre = Object.fromEntries((provs || []).map(p => [p.id, p.nombre]))
      const p = {}
      compras.forEach(c => { if (!c.proveedor_id) return; const x = (p[c.proveedor_id] = p[c.proveedor_id] || { c: 0, m: 0 }); x.c += Number(c.cantidad || 0) })
      nov.forEach(n => { const x = (p[n.proveedor_id] = p[n.proveedor_id] || { c: 0, m: 0 }); x.m += Number(n.cantidad || 0) })
      const comprado = Object.values(p).reduce((s, x) => s + x.c, 0), malo = Object.values(p).reduce((s, x) => s + x.m, 0)
      if (!comprado) return { valor: null, texto: 'Sin dato', sig: 'No hay compras a proveedores en el periodo' }
      const filas = Object.entries(p).filter(([, x]) => x.c).map(([id, x]) => [nombre[id] || 'Proveedor', x.m / x.c * 100, x]).sort((a, b) => b[1] - a[1])
      return { valor: malo / comprado * 100, texto: fmtPct(malo / comprado * 100), sig: `${malo.toLocaleString('es-CO')} unidades con problema de ${Math.round(comprado).toLocaleString('es-CO')} compradas`, filas: filas.map(([n, pc, x]) => [n, `${fmtPct(pc)} · ${x.m} de ${Math.round(x.c).toLocaleString('es-CO')}`]), peor: filas[0] }
    },
    hacer: (res) => res.peor && res.peor[1] > 0 ? `${res.peor[0]} registra el mayor índice de cambios (${fmtPct(res.peor[1])}). Gestionar la reposición pendiente o evaluar proveedores alternos.` : 'Sin cambios atribuibles a proveedores.',
  },
]
// Indicadores para más adelante: lo que necesita cada uno para poder medirse.
export const PROXIMOS = [
  { nombre: 'Domicilios a tiempo', necesita: 'Usar Domicilios con hora límite para cada pedido.' },
  { nombre: 'Tiempo del pedido', necesita: 'Usar Domicilios: de que se toma el pedido a que se entrega.' },
  { nombre: 'Pedidos completos', necesita: 'Un toque en Mi ruta al entregar: completo o faltó algo.' },
  { nombre: 'Costo real por domicilio', necesita: 'Registrar el valor pagado al domiciliario o a la mensajería por envío.' },
  { nombre: 'Ventas por red social', necesita: 'Marcar de dónde llegó cada pedido: WhatsApp, Instagram, TikTok o recomendado.' },
  { nombre: 'Temperaturas de horno y cuarto frío', necesita: 'Un botón en la tablet de planta para anotar la temperatura.' },
  { nombre: 'Rendimiento de yuca y queso', necesita: 'Aplica si se procesan en planta: registrar el peso recibido y el consumido.' },
]

// Indicadores que el admin quitó del tablero (por empresa o para el grupo).
const parametroOcultos = (ctx) => ctx.consolidado ? 'indicadores_ocultos_grupo' : 'indicadores_ocultos'
export async function cargarOcultos(ctx) {
  const { data } = await supabase.from('configuracion').select('id, empresa_id, valor').eq('parametro', parametroOcultos(ctx)).in('empresa_id', ctx.ids).limit(1)
  try { return { fila: data?.[0] || null, lista: JSON.parse(data?.[0]?.valor || '[]') } } catch { return { fila: data?.[0] || null, lista: [] } }
}
export async function guardarOcultos(ctx, fila, lista) {
  const valor = JSON.stringify(lista)
  const { error } = fila
    ? await supabase.from('configuracion').update({ valor }).eq('id', fila.id)
    : await supabase.from('configuracion').insert({ empresa_id: ctx.ids[0], parametro: parametroOcultos(ctx), valor })
  if (error) throw new Error(error.message)
}
export const AREAS = ['Ventas', 'Rutas y clientes', 'Finanzas', 'Producción', 'Inventario', 'Calidad']

export const aplica = (k, ctx) => (!k.soloDistri || ctx.distribuidoras.length) && (!k.soloProduccion || ctx.productora)

// Estado con la meta que pusieron: más es mejor o menos es mejor, con un 10% de margen para "cerca".
export function estadoCon(k, res, meta) {
  if (res.estado) return res.estado
  if (res.valor == null) return 'sin'
  if (meta == null) return 'sin'
  if (k.sentido === 'mas') return res.valor >= meta ? 'verde' : res.valor >= meta * 0.9 ? 'ambar' : 'rojo'
  return res.valor <= meta ? 'verde' : res.valor <= meta * 1.1 + 0.5 ? 'ambar' : 'rojo'
}
export const textoMeta = (k, meta) => meta == null ? 'Sin meta todavía'
  : `Meta: ${k.unidad === '$' ? fmt$(meta) : k.unidad === '%' ? fmtPct(meta) : k.unidad === '$100' ? `$${meta} o menos de cada $100` : k.unidad === 'h' ? `${meta.toLocaleString('es-CO')} horas` : k.unidad === 'días' ? `${meta.toLocaleString('es-CO')} días` : meta.toLocaleString('es-CO')}${k.sentido === 'menos' && k.unidad !== '$100' ? ' o menos' : ''}`

// Metas guardadas: de la empresa, o del grupo cuando se ve el grupo.
export async function cargarMetas(ctx) {
  const { data } = await supabase.from('indicadores_metas').select('id, empresa_id, alcance, indicador, meta').in('empresa_id', ctx.ids).eq('alcance', ctx.consolidado ? 'grupo' : 'empresa')
  return Object.fromEntries((data || []).map(m => [m.indicador, m]))
}
export async function guardarMeta(ctx, indicador, meta, previa, usuario) {
  const datos = { empresa_id: previa?.empresa_id || ctx.ids[0], alcance: ctx.consolidado ? 'grupo' : 'empresa', indicador, meta, actualizado_por: usuario?.nombre || null, updated_at: new Date().toISOString() }
  const { error } = previa
    ? await supabase.from('indicadores_metas').update(datos).eq('id', previa.id)
    : await supabase.from('indicadores_metas').insert(datos)
  if (error) throw new Error(error.message)
}

// Tendencia corta para la tarjeta: los últimos 6 meses (o lo que haya).
export async function calcular(k, ctx, r) {
  try { return await k.calc(ctx, r) } catch (err) { return { valor: null, texto: 'Sin dato', sig: 'No se pudo calcular: ' + err.message } }
}
