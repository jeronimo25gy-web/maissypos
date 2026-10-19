'use client'
import { supabase } from './supabase'
import { getEmpresaId } from './empresa'
import { obtenerFechaActual } from './supabase-helpers'
import { registrosDe, telasPorBulto, estandar, empacado, lotesAbiertos } from './planta'

// Producción vista por el admin: lo que registra la planta (lotes de cocción)
// más lo anotado a mano. Regla: lo que no se midió dice "sin dato"; nunca un
// valor por defecto.

export const corto = (p) => (p?.nombre || '').replace(/^Arepa (de Maíz )?/i, '')
export const mediana = (l) => { if (!l.length) return null; const s = [...l].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
export const promedio = (l) => l.length ? l.reduce((s, v) => s + v, 0) / l.length : null
export const minutos = (a, b) => a && b ? (new Date(b) - new Date(a)) / 60000 : null
const diaBogota = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const mermaPct = (r) => { const p = r.pesos_individuales || []; const fin = p[2] || p[1]; return p[0] && fin ? (1 - fin / p[0]) * 100 : null }

export async function cargarProduccion() {
  const empresaId = getEmpresaId()
  const hoy = obtenerFechaActual()
  const desde = new Date(Date.now() - 45 * 86400000).toLocaleDateString('en-CA')
  const [tq, prods, forms, est, cochs, hoyCoch, hoyLotes] = await Promise.all([
    supabase.from('tanques').select('*').eq('empresa_id', empresaId).order('orden'),
    supabase.from('productos').select('id, sku, nombre, presentacion, peso_estandar_g, tipo, consumo_por_cochada').eq('empresa_id', empresaId),
    supabase.from('formulas').select('id, producto_id, rendimiento, formulas_detalle(materia_prima_id, cantidad)').eq('empresa_id', empresaId).eq('activo', true),
    supabase.from('produccion_estandares').select('*').eq('empresa_id', empresaId),
    supabase.from('produccion_cochadas').select('*').eq('empresa_id', empresaId).eq('anulada', false).not('hora_montada', 'is', null).or(`fecha.gte.${desde},estado.eq.abierto`).order('hora_montada', { ascending: false }),
    supabase.from('produccion_cochadas').select('materia_prima_id, cantidad').eq('empresa_id', empresaId).eq('anulada', false).eq('fecha', hoy),
    supabase.from('produccion_lotes').select('id, cochada_id, produccion_detalle(formula_id, cantidad_producida)').eq('empresa_id', empresaId).eq('fecha', hoy),
  ])
  const err = [tq, prods, forms, est, cochs, hoyCoch, hoyLotes].find(r => r.error)
  if (err) throw new Error(err.error.message)

  const lista = cochs.data || []
  const ids = lista.map(c => c.id)
  const [{ data: regs }, { data: lotesCoch }] = ids.length ? await Promise.all([
    supabase.from('produccion_muestras_peso').select('*').in('cochada_id', ids).eq('anulado', false),
    supabase.from('produccion_lotes').select('cochada_id, produccion_detalle(formula_id, cantidad_producida)').in('cochada_id', ids),
  ]) : [{ data: [] }, { data: [] }]

  const productos = prods.data || []
  const productoDeFormula = Object.fromEntries((forms.data || []).map(f => [f.id, f.producto_id]))
  const conFormula = new Set((forms.data || []).map(f => f.producto_id))
  const bodega = {}
  ;(lotesCoch || []).forEach(l => (l.produccion_detalle || []).forEach(d => {
    const pid = productoDeFormula[d.formula_id]
    const b = (bodega[l.cochada_id] = bodega[l.cochada_id] || {})
    b[pid] = (b[pid] || 0) + Number(d.cantidad_producida)
  }))
  const referencias = productos.filter(p => p.tipo === 'terminado' && conFormula.has(p.id)).sort((a, b) => a.sku.localeCompare(b.sku))
  const maices = productos.filter(p => p.consumo_por_cochada)
  // Telas por bulto según la fórmula (la de la Tela blanca): 1 ÷ bultos por paquete.
  const tela = referencias.find(p => /tela/i.test(p.nombre) && !/mini|amarill/i.test(p.nombre))
  const fTela = (forms.data || []).find(f => f.producto_id === tela?.id)
  const dTela = (fTela?.formulas_detalle || []).find(d => maices.some(m => m.id === d.materia_prima_id))
  const telasFormula = dTela?.cantidad > 0 ? (fTela.rendimiento || 1) / Number(dTela.cantidad) : null

  return {
    hoy, tanques: tq.data || [], estandares: est.data || [], referencias, maices, telasFormula,
    cochadas: Object.fromEntries(lista.map(c => [c.id, c])), lista,
    registros: Object.fromEntries((regs || []).map(r => [r.id, r])), bodega,
    hoyCochadas: hoyCoch.data || [], hoyLotes: hoyLotes.data || [], productoDeFormula,
  }
}

export function medirLote(e, c) {
  const regs = (t) => registrosDe(e, c.id, t)
  const suma = (t) => regs(t).reduce((s, r) => s + Number(r.cantidad || 0), 0)
  const abs = (c.testigos || []).filter(t => t.kg > 0).map(t => (t.kg - 1) * 100)
  const mermas = regs('merma').map(mermaPct).filter(v => v != null)
  const rend = telasPorBulto(e, c)
  const masa = suma('bola')
  const merma = promedio(mermas)
  const kgEmp = rend?.kg || null
  const crudoEmp = kgEmp && merma != null ? kgEmp / (1 - merma / 100) : null
  const desecho = suma('desecho')
  return {
    coccion: minutos(c.hora_montada, c.hora_apagado), reposo: minutos(c.hora_apagado, c.hora_sacada),
    absorcion: promedio(abs), absorciones: abs, masa: masa || null, bolas: regs('bola').length, merma, nMermas: mermas.length,
    rend, crudoEmp, desecho, reproceso: suma('reproceso'), aceite: regs('aceite').length,
    sinExplicar: masa && crudoEmp != null ? masa - crudoEmp - desecho : null,
  }
}

// Lo del día: maíz puesto, empacado por referencia, lo que ya entró a bodega,
// lo que falta pasar y lo que necesita atención.
export function resumenHoy(e) {
  const maiz = {}
  e.hoyCochadas.forEach(c => { maiz[c.materia_prima_id] = (maiz[c.materia_prima_id] || 0) + Number(c.cantidad) })
  const empacadoHoy = {}
  Object.values(e.registros).filter(r => r.tipo === 'empaque' && diaBogota(r.hora) === e.hoy)
    .forEach(r => { empacadoHoy[r.producto_id] = (empacadoHoy[r.producto_id] || 0) + Number(r.cantidad || 0) })
  let enBodegaHoy = 0
  e.hoyLotes.forEach(l => (l.produccion_detalle || []).forEach(d => {
    enBodegaHoy += Number(d.cantidad_producida)
    // Lo anotado a mano (sin lote de cocción) cuenta como empacado del día.
    if (!l.cochada_id) { const pid = e.productoDeFormula[d.formula_id]; empacadoHoy[pid] = (empacadoHoy[pid] || 0) + Number(d.cantidad_producida) }
  }))
  const abiertos = lotesAbiertos(e)
  const porPasar = abiertos.reduce((s, c) => {
    const emp = empacado(e, c), bod = e.bodega[c.id] || {}
    return s + Object.entries(emp).reduce((t, [pid, n]) => t + Math.max(0, n - (bod[pid] || 0)), 0)
  }, 0)

  const avisos = []
  const tanque = (id) => e.tanques.find(t => t.id === id)?.nombre || 'Lote'
  abiertos.forEach(c => {
    if (c.hora_sacada && diaBogota(c.hora_sacada) < e.hoy) {
      const emp = empacado(e, c), bod = e.bodega[c.id] || {}
      const pend = Object.entries(emp).reduce((t, [pid, n]) => t + Math.max(0, n - (bod[pid] || 0)), 0)
      avisos.push({ tono: 'ambar', titulo: `Lote sin cerrar · ${tanque(c.tanque_id)}`, detalle: `Se sacó el ${new Date(c.hora_sacada).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', timeZone: 'America/Bogota' })}${pend ? ` · ${pend} paquetes contados sin pasar a bodega` : ''}. Abajo lo cierran en la planta.` })
    }
    const std = Number(estandar(e, 'tiempo_coccion_min', { tanqueId: c.tanque_id })?.valor)
    const lleva = minutos(c.hora_montada, new Date().toISOString())
    if (!c.hora_apagado && std && lleva > std + 15) avisos.push({ tono: 'ambar', titulo: `${tanque(c.tanque_id)} lleva ${Math.floor(lleva / 60)}:${String(Math.round(lleva % 60)).padStart(2, '0')} cocinando`, detalle: `El estándar del tanque es ${std} min y no lo han apagado en la tablet.` })
  })
  // Peso crudo de hoy contra el estándar fijado o, si no hay, contra la semana.
  const crudos = Object.values(e.registros).filter(r => r.tipo === 'crudo')
  e.referencias.forEach(p => {
    const deHoy = crudos.filter(r => r.producto_id === p.id && diaBogota(r.hora) === e.hoy).flatMap(r => (r.pesos_individuales || []).map(Number))
    if (!deHoy.length) return
    const fijo = Number(estandar(e, 'peso_crudo_g', { productoId: p.id })?.valor)
    const semana = crudos.filter(r => r.producto_id === p.id && diaBogota(r.hora) < e.hoy && minutos(r.hora, new Date().toISOString()) < 7 * 1440).flatMap(r => (r.pesos_individuales || []).map(Number))
    const base = fijo || (semana.length >= 10 ? promedio(semana) : null)
    if (!base) return
    const dev = (promedio(deHoy) / base - 1) * 100
    if (dev >= 5) avisos.push({ tono: 'rojo', titulo: `${corto(p)} pasada de peso`, detalle: `Hoy pesa ${dev.toLocaleString('es-CO', { maximumFractionDigits: 1 })}% más que ${fijo ? 'el estándar' : 'el promedio de la semana'}. Cada paquete se lleva más masa de la que cobra.` })
    if (dev <= -5) avisos.push({ tono: 'ambar', titulo: `${corto(p)} baja de peso`, detalle: `Hoy pesa ${Math.abs(dev).toLocaleString('es-CO', { maximumFractionDigits: 1 })}% menos que ${fijo ? 'el estándar' : 'el promedio de la semana'}.` })
  })
  const mermasHoy = Object.values(e.registros).filter(r => r.tipo === 'merma' && diaBogota(r.hora) === e.hoy).length
  if (mermasHoy) avisos.push({ tono: 'verde', titulo: `Merma medida ${mermasHoy} ${mermasHoy === 1 ? 'vez' : 'veces'} hoy`, detalle: mermasHoy >= 2 ? 'Ya se cumplieron las 2 del día.' : 'Falta 1 para las 2 del día.' })

  const empacadoTotal = Object.values(empacadoHoy).reduce((s, n) => s + n, 0)
  return { maiz, empacadoHoy, empacadoTotal, enBodegaHoy, porPasar, avisos, abiertos }
}

// Telas por bulto de los lotes cerrados en los últimos días.
export function telasSemana(e, dias = 7) {
  const desde = Date.now() - dias * 86400000
  const v = e.lista.filter(c => c.estado === 'cerrado' && c.cerrado_at && new Date(c.cerrado_at).getTime() >= desde)
    .map(c => telasPorBulto(e, c)?.telas).filter(x => x > 0)
  return { valor: mediana(v), n: v.length }
}

// Estándares: lo medido (con cuántos datos) contra lo fijado.
export function filasEstandares(e) {
  const medidos = e.lista.map(c => ({ c, m: medirLote(e, c) }))
  const cerrados = medidos.filter(x => x.c.estado === 'cerrado')
  const filas = []
  const fila = (clave, nombre, valores, unidad, dec, extra = {}, usarPromedio = false) => {
    filas.push({ clave, nombre, medido: valores.length ? (usarPromedio ? promedio(valores) : mediana(valores)) : null, n: valores.length, unidad, dec, fijo: estandar(e, clave, extra), extra })
  }
  e.maices.forEach(m => {
    const v = cerrados.filter(x => x.c.materia_prima_id === m.id).map(x => x.m.rend?.telas).filter(x => x > 0)
    if (v.length || estandar(e, 'telas_por_bulto', { productoId: m.id })) fila('telas_por_bulto', `Telas por bulto · ${m.nombre}`, v, '', 0, { productoId: m.id })
  })
  e.tanques.forEach(t => fila('tiempo_coccion_min', `Tiempo de cocción · ${t.nombre}`, medidos.filter(x => x.c.tanque_id === t.id).map(x => x.m.coccion).filter(v => v > 0), 'min', 0, { tanqueId: t.id }))
  fila('absorcion_pct', 'Absorción del maíz', medidos.flatMap(x => x.m.absorciones), '%', 0, {}, true)
  const regs = Object.values(e.registros)
  e.referencias.forEach(p => {
    const deRef = regs.filter(r => r.producto_id === p.id)
    fila('peso_crudo_g', `Peso crudo · ${corto(p)}`, deRef.filter(r => r.tipo === 'crudo').flatMap(r => (r.pesos_individuales || []).map(Number)), 'g', 1, { productoId: p.id }, true)
    fila('merma_pct', `Merma de crudo a frío · ${corto(p)}`, deRef.filter(r => r.tipo === 'merma').map(mermaPct).filter(v => v != null), '%', 1, { productoId: p.id }, true)
  })
  const caidas = []
  regs.filter(r => r.tipo === 'llego_ref').forEach(l => {
    const cambio = regs.filter(r => r.tipo === 'cambio_ref' && r.cochada_id === l.cochada_id && r.producto_id === l.producto_id && r.hora <= l.hora).sort((a, b) => b.hora.localeCompare(a.hora))[0]
    if (cambio) caidas.push(minutos(cambio.hora, l.hora))
  })
  fila('tiempo_caida_min', 'Tiempo de caída (troqueladora → empaque)', caidas, 'min', 0)
  return filas.filter(f => f.n > 0 || f.fijo)
}

export const DATOS_A_MANO = [
  { clave: 'conservante_g_bulto', nombre: 'Conservante por bulto', unidad: 'g', extra: {} },
  { clave: 'atomizador_ml', nombre: 'Capacidad del atomizador de aceite', unidad: 'ml', extra: {} },
  { clave: 'peso_bulto_kg', nombre: 'Peso real del bulto (con báscula)', unidad: 'kg', extra: {} },
]

export async function fijarEstandar(f, valor, usuario) {
  const datos = { empresa_id: getEmpresaId(), clave: f.clave, tanque_id: f.extra?.tanqueId || null, producto_id: f.extra?.productoId || null, valor: Math.round(valor * 100) / 100, estado: 'fijo', actualizado_por: usuario?.nombre || null, updated_at: new Date().toISOString() }
  const { error } = f.fijo
    ? await supabase.from('produccion_estandares').update(datos).eq('id', f.fijo.id)
    : await supabase.from('produccion_estandares').insert(datos)
  if (error) throw new Error(error.message)
}
