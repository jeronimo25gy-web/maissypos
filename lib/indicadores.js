'use client'
import { supabase } from './supabase'
import { obtenerFechaActual } from './supabase-helpers'
import { detectorInterno } from './inicio-datos'
import { obsequiosEnNegativo } from './ventas-helpers'
import { cargarCostosDistri } from './costos-distri'
import { cargarProduccion, rendimientoPromedio } from './produccion-admin'
import { rangoPaquete, telasPorBulto, registrosDe } from './planta'
import { cargarCostos, costoTela } from './costos'

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
    id: 'meta_mes', area: 'Ventas', nombre: 'Avance de la meta del mes', sentido: 'mas', unidad: '%', grafica: 'barras', soloMes: true, metaPropia: true,
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
    hacer: (res) => res.estado === 'verde' ? 'Va al ritmo de la meta.' : res.peor ? `${res.peor[0]} es la que más atrás va (${fmtPct(res.peor[1], 0)}). Revisar con el vendedor si la meta está bien puesta o si faltan clientes en el rutero.` : 'Revisar las metas por ruta en Finanzas.',
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
    hacer: (res) => res.peor && res.peor[1] < 0 ? `${res.peor[0]} es la que más baja (${fmtPct(res.peor[1], 0)}). Mirar qué clientes dejaron de comprarle.` : 'Todas las rutas suben o se mantienen.',
  },
  {
    id: 'ticket', area: 'Ventas', nombre: 'Compra promedio por cliente', sentido: 'mas', unidad: '$', grafica: 'linea',
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
    hacer: (res, meta) => meta == null ? 'Sin meta todavía: se ve solo cómo viene.' : res.valor >= meta ? 'Va bien.' : 'Ofrecer el paquete de 6 y los productos que más se llevan juntos para subir lo que lleva cada cliente.',
  },
  {
    id: 'visitas', area: 'Rutas y clientes', nombre: 'Visitas que terminan en venta', sentido: 'mas', unidad: '%', grafica: 'linea',
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
    hacer: (res) => res.peor ? `${res.peor[0]} vende en ${fmtPct(res.peor[1], 0)} de las visitas. Revisar el orden del rutero y los clientes que nunca compran.` : 'Marcar las visitas en Mi ruta para medirlo.',
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
    hacer: (res) => res.sinComprar ? `Hay ${res.sinComprar} clientes en el rutero que no compran hace 14 días. Pedir al vendedor visitarlos o sacarlos del rutero.` : 'Todo el rutero está comprando.',
  },
  {
    id: 'perdidos', area: 'Rutas y clientes', nombre: 'Clientes que dejaron de comprar', sentido: 'menos', unidad: '', grafica: 'barras',
    calc: async (ctx, r) => {
      const [antes, ahora] = await Promise.all([ventasConCliente(ctx, sumarDias(r.hasta, -44), sumarDias(r.hasta, -14)), ventasConCliente(ctx, sumarDias(r.hasta, -13), r.hasta)])
      const recientes = new Set(ahora.map(v => v.clave))
      const perdidos = new Map()
      antes.forEach(v => { if (recientes.has(v.clave)) return; const c = perdidos.get(v.clave) || { nombre: v.nombre, ruta: v.ruta, total: 0, ultima: v.fecha }; c.total += v.total; if (v.fecha > c.ultima) c.ultima = v.fecha; perdidos.set(v.clave, c) })
      const l = [...perdidos.values()].sort((a, b) => b.total - a.total)
      return { valor: l.length, texto: String(l.length), sig: 'Compraban y llevan 14 días o más sin comprar', filas: l.slice(0, 10).map(c => [`${c.nombre} · ${c.ruta}`, `${fmt$(c.total)} · hace ${dias(c.ultima, r.hasta) - 1} días`]) }
    },
    hacer: (res) => res.valor ? 'Mandarle a cada vendedor su lista para visitarlos esta semana.' : 'Ningún cliente se ha perdido.',
  },
  {
    id: 'vencida', area: 'Plata', nombre: 'Cartera vencida', sentido: 'menos', unidad: '%', grafica: 'apilada', soloHoy: true,
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
    hacer: (res, meta) => res.vencidos ? `Antes de dar más crédito, cobrar los ${res.vencidos} créditos vencidos (están en Cartera).` : 'No hay créditos vencidos.',
  },
  {
    id: 'credito', area: 'Plata', nombre: 'Venta a crédito', sentido: 'menos', unidad: '%', grafica: 'linea',
    calc: async (ctx, r) => {
      const [v, fiados] = await Promise.all([ventas(ctx, r), todo(() => supabase.from('cartera_fiados').select('valor_original, nombre_cliente, empresa_id, ruta_id').eq('es_saldo_inicial', false).gte('fecha_fiado', r.desde).lte('fecha_fiado', r.hasta).in('empresa_id', ctx.ids))])
      const f = fiados.filter(c => !(ctx.consolidado && ctx.interna({ cliente_nombre: c.nombre_cliente, empresa_id: c.empresa_id })))
      if (!v.total) return { valor: null, texto: 'Sin dato', sig: 'No hay ventas en el periodo' }
      const credito = f.reduce((s, c) => s + Number(c.valor_original || 0), 0)
      const rs = await rutas(ctx)
      const porRuta = {}; f.forEach(c => { const n = c.ruta_id ? nombreRuta(rs[c.ruta_id]?.nombre) : 'Mostrador'; porRuta[n] = (porRuta[n] || 0) + Number(c.valor_original || 0) })
      return { valor: credito / v.total * 100, texto: fmtPct(credito / v.total * 100, 0), sig: `${fmtM(credito)} fiados de ${fmtM(v.total)}`, filas: Object.entries(porRuta).map(([n, c]) => [n, v.porRuta[n] ? c / v.porRuta[n] * 100 : null, c]).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).map(([n, p, c]) => [n, p != null ? `${fmtPct(p, 0)} · ${fmt$(c)}` : fmt$(c)]) }
    },
    hacer: (res, meta) => meta != null && res.valor > meta ? 'Se está fiando más de la cuenta: revisar los cupos de crédito de los clientes.' : 'Va bien.',
  },
  {
    id: 'margen', area: 'Plata', nombre: 'Margen sobre la compra', sentido: 'mas', unidad: '%', grafica: 'linea', soloDistri: true, soloMes: true,
    calc: async (ctx, r) => {
      const l = await costosDistri(ctx, mesDe(r.hasta))
      const filasRuta = l.flatMap(d => d.filasRuta), filasProd = l.flatMap(d => d.filasProducto)
      const v = filasRuta.reduce((s, x) => s + x.ventas, 0), m = filasRuta.reduce((s, x) => s + x.mercancia, 0)
      if (!v) return { valor: null, texto: 'Sin dato', sig: 'No hay ventas liquidadas en el mes' }
      const bajos = filasProd.filter(f => f.unidades > 0 && f.margenPct != null).sort((a, b) => a.margenPct - b.margenPct)
      return { valor: (v - m) / v * 100, texto: fmtPct((v - m) / v * 100), sig: `De cada $100 vendidos, $${((v - m) / v * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 })} son margen`, filas: bajos.slice(0, 6).map(f => [f.nombre, fmtPct(f.margenPct)]), peor: bajos[0] }
    },
    hacer: (res) => res.peor ? `${res.peor.nombre} es la que menos deja (${fmtPct(res.peor.margenPct)}). Revisar su precio o su costo de compra en Costos.` : 'Revisar los costos de compra en Costos.',
  },
  {
    id: 'repartir', area: 'Plata', nombre: 'Lo que cuesta repartir', sentido: 'menos', unidad: '$100', grafica: 'barras', soloDistri: true, soloMes: true,
    calc: async (ctx, r) => {
      const l = await costosDistri(ctx, mesDe(r.hasta))
      const fr = l.flatMap(d => d.filasRuta).filter(x => x.tipo !== 'mostrador')
      const v = fr.reduce((s, x) => s + x.ventas, 0), c = fr.reduce((s, x) => s + x.repartir, 0)
      if (!v) return { valor: null, texto: 'Sin dato', sig: 'No hay ventas de ruta en el mes' }
      const filas = fr.filter(x => x.ventas).map(x => [nombreRuta(x.nombre), x.repartir / x.ventas * 100]).sort((a, b) => b[1] - a[1])
      return { valor: c / v * 100, texto: `$${Math.round(c / v * 100)}`, sig: 'De cada $100 vendidos en ruta y puntos de venta', filas: filas.map(([n, p]) => [n, `$${Math.round(p)}`]), peor: filas[0] }
    },
    hacer: (res) => res.peor && res.peor[1] > 50 ? `${res.peor[0]} gasta $${Math.round(res.peor[1])} de cada $100 que vende. Revisar la nómina cargada o si faltan ventas por registrar.` : 'Va bien.',
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
    hacer: (res) => res.estado === 'gris' ? 'Todavía no se compara. Con el lote 26 el promedio queda como estándar.' : res.estado === 'verde' ? 'Rinde como el estándar.' : 'Rinde menos que el estándar: revisar el gramaje en crudo y la cocción del maíz.',
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
    hacer: (res) => res.peor && res.peor[1] < 95 ? `${res.peor[0]} es la que más sale fuera del rango. Ajustar su gramaje en crudo en Producción → Estándares.` : 'Los paquetes salen en su peso.',
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
    hacer: (res) => res.peor && res.peor[1] < 95 ? `${res.peor[0]} es la que más queda corta (${fmtPct(res.peor[1], 0)}).` : 'Se cumple el plan.',
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
    hacer: (res, meta) => res.peor ? `El motivo que más pesa es "${res.peor[0]}". ${meta != null && res.valor > meta ? 'Se está perdiendo masa: revisar esa parte del proceso.' : ''}`.trim() : 'Va bien.',
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
      return { valor: h, texto: hh(h), sig: `De montar el tanque al último paquete · ${lotes.length} lotes`, filas: [['Reposo en el tanque', rep.length ? hh(prom(rep)) : 'Sin dato'], ['Lote más corto', hh(Math.min(...lotes.map(x => x.h)))], ['Lote más largo', hh(Math.max(...lotes.map(x => x.h)))]] }
    },
    hacer: (res, meta) => meta != null && res.valor > meta ? 'Los lotes se están demorando: mirar si el cuello de botella es el reposo, la troqueladora o el enfriamiento antes de empacar.' : 'Incluye el reposo del maíz en el tanque, que es parte del proceso.',
  },
  {
    id: 'costo_paquete', area: 'Producción', nombre: 'Costo de fabricar una Tela', sentido: 'menos', unidad: '$', grafica: 'linea', soloProduccion: true, soloMes: true,
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
    hacer: (res, meta) => res.incompleto ? 'Faltan datos en Costos: el costo real es más alto que este.' : res.mayor ? `Lo que más pesa es ${res.mayor.nombre.toLowerCase()} (${fmt$(res.mayor.tela)}).${meta != null && res.valor > meta ? ' Revisar el precio del maíz y el rendimiento.' : ''}` : 'Ver el detalle en Costos.',
  },
  {
    id: 'operario', area: 'Producción', nombre: 'Paquetes por operario al día', sentido: 'mas', unidad: '', grafica: 'barras', soloProduccion: true,
    calc: async (ctx, r) => {
      const [regs, { data: emps }] = await Promise.all([registrosPlanta(ctx, r, 'empaque'), supabase.from('empleados').select('id').eq('empresa_id', ctx.productora.id).eq('activo', true).eq('es_mano_obra_directa', true)])
      const paquetes = regs.reduce((s, x) => s + Number(x.cantidad || 0), 0)
      const diasProd = new Set(regs.map(x => new Date(x.hora).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }))).size
      const op = (emps || []).length
      if (!paquetes || !op) return { valor: null, texto: 'Sin dato', sig: !op ? 'No hay operarios marcados como mano de obra directa en Nómina' : 'No hay paquetes contados en el periodo' }
      const v = paquetes / diasProd / op
      return { valor: v, texto: Math.round(v).toLocaleString('es-CO'), sig: `${paquetes.toLocaleString('es-CO')} paquetes · ${diasProd} días · ${op} operarios`, filas: [['Paquetes empacados', paquetes.toLocaleString('es-CO')], ['Días con producción', String(diasProd)], ['Operarios de planta', String(op)]] }
    },
    hacer: (res, meta) => meta != null && res.valor < meta ? 'Rinde menos por persona: revisar paradas y cambios de molde, o si hace falta automatizar algún paso.' : 'Sirve para saber cuándo hace falta otra persona o una máquina.',
  },
  {
    id: 'cambios', area: 'Calidad', nombre: 'Cambios por producto dañado', sentido: 'menos', unidad: '%', grafica: 'linea',
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
  },
]
export const AREAS = ['Ventas', 'Rutas y clientes', 'Plata', 'Producción', 'Calidad']

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
  : `Meta: ${k.unidad === '$' ? fmt$(meta) : k.unidad === '%' ? fmtPct(meta) : k.unidad === '$100' ? `$${meta} o menos de cada $100` : k.unidad === 'h' ? `${meta.toLocaleString('es-CO')} horas` : meta.toLocaleString('es-CO')}${k.sentido === 'menos' && k.unidad !== '$100' ? ' o menos' : ''}`

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
