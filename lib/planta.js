'use client'
import { supabase } from './supabase'
import { getEmpresaId } from './empresa'

// Control de produccion en planta. Todo lo que se registra se aplica de una
// vez en la pantalla y queda en una cola en el equipo; la cola sube a la base
// cuando hay señal, en orden. Cada fila lleva su id desde el equipo, asi que
// reintentar no duplica nada.

const claveCola = () => `maissy_planta_cola_${getEmpresaId()}`
const claveCache = () => `maissy_planta_cache_${getEmpresaId()}`
const claveErrores = () => `maissy_planta_errores_${getEmpresaId()}`

const leerJSON = (k, def) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? def } catch { return def } }
const guardarJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

export const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16) }))
export const ahora = () => new Date().toISOString()

export const MOTIVOS_REPROCESO = ['Rota', 'Quemada', 'Deforme', 'Pegada']
export const TEXTURAS = [
  { n: 1, nombre: 'Duro', detalle: 'No se aplasta. Por dentro blanco y harinoso.' },
  { n: 2, nombre: 'Le falta', detalle: 'Se aplasta con fuerza. El centro sigue blanco.' },
  { n: 3, nombre: 'En su punto', detalle: 'Se aplasta fácil, cocido parejo, el grano sigue entero.' },
  { n: 4, nombre: 'Pasadito', detalle: 'Muy blando, algunos granos reventados.' },
  { n: 5, nombre: 'Pasado', detalle: 'Reventado, pastoso, se deshace.' },
]
// Lo que el usuario observó en planta el 19 oct 2026. Se usa solo para la
// cuenta regresiva del monitor mientras no haya un tiempo de caída medido.
export const CAIDA_OBSERVADA_MIN = 28
// Merma de crudo a frío mientras no se fije una medida (Tela: unos 7 g de 114,5 g).
export const MERMA_ARRANQUE_PCT = 6.1
// Lotes cerrados que hacen falta para que el promedio de Telas por bulto sea el estándar.
export const LOTES_PARA_ESTANDAR = 26

export const cola = () => leerJSON(claveCola(), [])
export const errores = () => leerJSON(claveErrores(), [])
export const limpiarErrores = () => guardarJSON(claveErrores(), [])

// Estado local: { cochadas: {id: fila}, registros: {id: fila}, bodega: {cochadaId: {productoId: cant}}, ... }
export const leerCache = () => leerJSON(claveCache(), null)
const guardarCache = (e) => guardarJSON(claveCache(), e)

const aplicar = (e, op) => {
  if (op.tabla === 'produccion_cochadas') {
    if (op.op === 'insert') e.cochadas[op.datos.id] = { ...op.datos }
    if (op.op === 'update' && e.cochadas[op.id]) e.cochadas[op.id] = { ...e.cochadas[op.id], ...op.datos }
  }
  if (op.tabla === 'produccion_muestras_peso') {
    if (op.op === 'insert') e.registros[op.datos.id] = { ...op.datos }
    if (op.op === 'update' && e.registros[op.id]) e.registros[op.id] = { ...e.registros[op.id], ...op.datos }
  }
  return e
}

// Registra una o varias operaciones: se ven de una vez y quedan en la cola.
export function registrar(ops, estado) {
  const lista = Array.isArray(ops) ? ops : [ops]
  const c = cola()
  lista.forEach(o => c.push({ ...o, _id: nuevoId(), _t: ahora() }))
  guardarJSON(claveCola(), c)
  const e = estado ? structuredClone(estado) : leerCache()
  if (e) { lista.forEach(o => aplicar(e, o)); guardarCache(e) }
  return e
}

const esFallaDeRed = (err) => {
  const m = String(err?.message || err || '').toLowerCase()
  return (typeof navigator !== 'undefined' && navigator.onLine === false) || m.includes('failed to fetch') || m.includes('network') || m.includes('load failed') || m.includes('fetch')
}

let subiendo = false
// Sube la cola en orden. Si no hay señal se detiene y reintenta despues. Si
// la base rechaza una operacion (dato invalido), se aparta para no trabar el
// resto y se muestra como error.
export async function subirCola() {
  if (subiendo) return { pendientes: cola().length }
  subiendo = true
  try {
    let c = cola()
    while (c.length) {
      const op = c[0]
      let error = null
      try {
        if (op.op === 'insert') ({ error } = await supabase.from(op.tabla).upsert(op.datos, { onConflict: 'id', ignoreDuplicates: true }))
        else if (op.op === 'update') ({ error } = await supabase.from(op.tabla).update(op.datos).eq('id', op.id))
        else if (op.op === 'rpc') ({ error } = await supabase.rpc(op.rpc, op.args))
      } catch (err) { error = err }
      if (error) {
        if (esFallaDeRed(error)) break
        guardarJSON(claveErrores(), [...errores(), { ...op, error: error.message || String(error) }])
      }
      c = cola().slice(1)
      guardarJSON(claveCola(), c)
    }
    return { pendientes: c.length }
  } finally { subiendo = false }
}

// Carga lo de la planta desde la base y le vuelve a aplicar lo que todavía
// está en la cola, para que nada registrado sin señal desaparezca de la pantalla.
export async function cargarPlanta() {
  const empresaId = getEmpresaId()
  const hace3 = new Date(Date.now() - 3 * 86400000).toISOString()
  const hace90 = new Date(Date.now() - 90 * 86400000).toLocaleDateString('en-CA')
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  const [tq, prods, forms, est, abiertas, recientes, plan] = await Promise.all([
    supabase.from('tanques').select('*').eq('empresa_id', empresaId).eq('activo', true).order('orden'),
    supabase.from('productos').select('id, sku, nombre, presentacion, peso_estandar_g, paquetes_por_caja, tipo, consumo_por_cochada, costo_compra').eq('empresa_id', empresaId),
    supabase.from('formulas').select('id, producto_id, nombre, activo').eq('empresa_id', empresaId).eq('activo', true),
    supabase.from('produccion_estandares').select('*').eq('empresa_id', empresaId),
    supabase.from('produccion_cochadas').select('*').eq('empresa_id', empresaId).eq('estado', 'abierto').eq('anulada', false),
    supabase.from('produccion_cochadas').select('*').eq('empresa_id', empresaId).eq('estado', 'cerrado').not('hora_montada', 'is', null).gte('cerrado_at', hace3),
    supabase.from('produccion_plan').select('producto_id, paquetes, orden').eq('empresa_id', empresaId).eq('fecha', hoy).order('orden'),
  ])
  const err = [tq, prods, forms, est, abiertas, recientes, plan].find(r => r.error)
  if (err) throw new Error(err.error.message)

  const productos = prods.data || []
  // Maíces que se descuentan por lote (blanco, amarillo…).
  const maices = productos.filter(p => p.consumo_por_cochada)
  const maiz = maices[0] || null
  const conFormula = new Set((forms.data || []).map(f => f.producto_id))
  const referencias = productos.filter(p => p.tipo === 'terminado' && conFormula.has(p.id)).sort((a, b) => a.sku.localeCompare(b.sku))
  const { data: compras } = maices.length
    ? await supabase.from('compras').select('id, sku, fecha, cantidad, precio_unitario, proveedor_id, proveedores(nombre)').eq('empresa_id', empresaId).in('sku', maices.map(m => m.sku)).gte('fecha', hace90).order('fecha', { ascending: false }).limit(20)
    : { data: [] }

  const cochadas = Object.fromEntries([...(abiertas.data || []), ...(recientes.data || [])].map(c => [c.id, c]))
  const ids = Object.keys(cochadas)
  let registros = {}, bodega = {}
  if (ids.length) {
    const [{ data: regs }, { data: lotes }] = await Promise.all([
      supabase.from('produccion_muestras_peso').select('*').in('cochada_id', ids).eq('anulado', false),
      supabase.from('produccion_lotes').select('id, cochada_id, produccion_detalle(cantidad_producida, formula_id)').in('cochada_id', ids),
    ])
    registros = Object.fromEntries((regs || []).map(r => [r.id, r]))
    const productoDeFormula = Object.fromEntries((forms.data || []).map(f => [f.id, f.producto_id]))
    ;(lotes || []).forEach(l => (l.produccion_detalle || []).forEach(d => {
      const pid = productoDeFormula[d.formula_id]
      const b = (bodega[l.cochada_id] = bodega[l.cochada_id] || {})
      b[pid] = (b[pid] || 0) + Number(d.cantidad_producida)
    }))
  }

  const e = {
    tanques: tq.data || [], referencias, maiz, maices, compras: compras || [], estandares: est.data || [],
    cochadas, registros, bodega, plan: plan.data || [], hoy, cargado: ahora(),
  }
  cola().forEach(op => aplicar(e, op))
  guardarCache(e)
  return e
}

// --- Lecturas sobre el estado -------------------------------------------------

export const registrosDe = (e, cochadaId, tipo) => Object.values(e?.registros || {})
  .filter(r => r.cochada_id === cochadaId && !r.anulado && (!tipo || r.tipo === tipo))
  .sort((a, b) => (a.hora || '').localeCompare(b.hora || ''))

export const lotesAbiertos = (e) => Object.values(e?.cochadas || {})
  .filter(c => c.estado === 'abierto' && !c.anulada)
  .sort((a, b) => (a.hora_montada || '').localeCompare(b.hora_montada || ''))

export const estandar = (e, clave, { tanqueId, productoId } = {}) => (e?.estandares || [])
  .find(s => s.clave === clave && (s.tanque_id || null) === (tanqueId || null) && (s.producto_id || null) === (productoId || null))

// En qué paso va el lote, según lo que ya se registró.
export function pasoActual(e, c) {
  if (!c.hora_apagado) return 'coccion'
  if (!c.hora_sacada) return 'reposo'
  if (registrosDe(e, c.id, 'empaque').length) return 'empaque'
  if (registrosDe(e, c.id, 'cambio_ref').length) return 'troqueladora'
  return 'masa'
}
export const NOMBRE_PASO = { coccion: 'Cocinando', reposo: 'Reposando en el tanque', masa: 'Moliendo', troqueladora: 'En troqueladora', empaque: 'Empacando' }

// Referencia que se está troquelando y la que viene bajando a empaque.
export function referencias(e, c) {
  const cambios = registrosDe(e, c.id, 'cambio_ref')
  const llegadas = registrosDe(e, c.id, 'llego_ref')
  const caida = Number(estandar(e, 'tiempo_caida_min')?.valor) || CAIDA_OBSERVADA_MIN
  const arriba = cambios[cambios.length - 1] || null
  // Lo que ya llegó abajo: el último cambio confirmado con "Ya llegó" o con el tiempo de caída cumplido.
  let bajando = null, sigue = null
  for (const cb of cambios) {
    const llego = llegadas.some(l => l.producto_id === cb.producto_id && l.hora >= cb.hora)
    const min = (Date.now() - new Date(cb.hora).getTime()) / 60000
    if (llego || min >= caida) { bajando = cb; sigue = null }
    else sigue = { ...cb, faltan: Math.max(1, Math.round(caida - min)) }
  }
  return { arriba, bajando, sigue, caida }
}

export const empacado = (e, c) => {
  const m = {}
  registrosDe(e, c.id, 'empaque').forEach(r => { m[r.producto_id] = (m[r.producto_id] || 0) + Number(r.cantidad || 0) })
  return m
}
export const enBodega = (e, c) => e?.bodega?.[c.id] || {}

// Telas equivalentes por bulto: kilos empacados ÷ peso de una Tela ÷ bultos puestos.
export function telasPorBulto(e, c) {
  // La unidad base es la Tela blanca (537,5 g).
  const tela = e?.referencias?.find(p => /tela/i.test(p.nombre) && !/mini|amarill/i.test(p.nombre))
  const pesoTela = Number(tela?.peso_estandar_g)
  if (!pesoTela || !(Number(c.cantidad) > 0)) return null
  const emp = empacado(e, c)
  let gramos = 0
  for (const [pid, cant] of Object.entries(emp)) {
    const p = e.referencias.find(x => x.id === pid)
    if (!p?.peso_estandar_g) return null
    gramos += cant * Number(p.peso_estandar_g)
  }
  if (!gramos) return null
  return { telas: gramos / pesoTela / Number(c.cantidad), kg: gramos / 1000 }
}

export const unidadesPaquete = (p) => { const m = String(p?.presentacion || '').match(/(\d+)/); return m ? Number(m[1]) : null }
export const fmtHora = (iso) => iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' }) : '—'
export const fmtNum = (n, d = 1) => Number(n).toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d })
export const duracion = (desde, hasta) => {
  if (!desde) return '—'
  const min = Math.max(0, Math.round(((hasta ? new Date(hasta) : new Date()) - new Date(desde)) / 60000))
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
}

// Gramaje en crudo de una referencia: el que se fijó en Estándares, o uno de
// arranque (peso frío por arepa más la merma). El rango va del peso a 2 g más:
// nunca por debajo de lo que dice el paquete y sin regalar masa.
export function gramajeCrudo(e, p) {
  if (!p) return null
  const fijo = estandar(e, 'gramaje_crudo_g', { productoId: p.id })
  if (fijo) return { min: Number(fijo.valor), max: Number(fijo.valor) + 2, provisional: false }
  const und = unidadesPaquete(p)
  if (!und || !Number(p.peso_estandar_g)) return null
  const merma = Number(estandar(e, 'merma_pct', { productoId: p.id })?.valor) || Number(estandar(e, 'merma_pct')?.valor) || MERMA_ARRANQUE_PCT
  const min = Math.ceil(Number(p.peso_estandar_g) / und / (1 - merma / 100))
  return { min, max: min + 2, provisional: true }
}

// El lote que está en la troqueladora: el del cambio de molde más reciente; si
// no hay, el último que se sacó o se apagó.
export function loteEnLinea(e) {
  const lotes = lotesAbiertos(e)
  const conMolde = lotes.map(c => ({ c, h: registrosDe(e, c.id, 'cambio_ref').pop()?.hora || '' })).filter(x => x.h).sort((a, b) => b.h.localeCompare(a.h))
  if (conMolde.length) return conMolde[0].c
  const listos = lotes.filter(c => c.hora_apagado).sort((a, b) => (b.hora_sacada || b.hora_apagado).localeCompare(a.hora_sacada || a.hora_apagado))
  return listos[0] || null
}

// Plan del día con lo que ya se empacó hoy de cada referencia, y cuál sigue.
export function planDeHoy(e, actualId) {
  const hecho = {}
  Object.values(e?.registros || {}).filter(r => r.tipo === 'empaque' && !r.anulado && (r.hora || '') >= `${e.hoy}T05:00:00`)
    .forEach(r => { hecho[r.producto_id] = (hecho[r.producto_id] || 0) + Number(r.cantidad || 0) })
  const filas = (e?.plan || []).map(f => ({ ...f, producto: e.referencias.find(p => p.id === f.producto_id), hecho: hecho[f.producto_id] || 0 }))
    .filter(f => f.producto).map(f => ({ ...f, listo: f.hecho >= f.paquetes }))
  const i = filas.findIndex(f => f.producto_id === actualId)
  const sigue = filas.find((f, j) => j > i && !f.listo && f.producto_id !== actualId) || null
  return { filas, sigue, pedidos: filas.reduce((s, f) => s + f.paquetes, 0), hechos: filas.reduce((s, f) => s + Math.min(f.hecho, f.paquetes), 0) }
}

// Pesaje de 3 paquetes por caja: cajas llenas y cajas ya pesadas de una referencia en el lote.
export function cajasDe(e, c, p) {
  const porCaja = Number(p?.paquetes_por_caja) || null
  const pesadas = registrosDe(e, c.id, 'paquete').filter(r => r.producto_id === p?.id)
  const llenas = porCaja ? Math.floor((empacado(e, c)[p.id] || 0) / porCaja) : null
  return { porCaja, pesadas, llenas, faltan: llenas != null ? Math.max(0, llenas - pesadas.length) : 0 }
}

// Último pesaje de abajo de una referencia, en cualquier lote reciente (para el monitor de arriba).
export const ultimoPesaje = (e, productoId) => Object.values(e?.registros || {})
  .filter(r => r.tipo === 'paquete' && !r.anulado && r.producto_id === productoId)
  .sort((a, b) => (b.hora || '').localeCompare(a.hora || ''))[0] || null

// Peso permitido del paquete: el rango fijado de cada referencia (mínimo y
// máximo en Estándares) o, si no hay, el peso del paquete ± la tolerancia (3%).
export const toleranciaPaquete = (e) => Number(estandar(e, 'tolerancia_paquete_pct')?.valor) || 3
export function rangoPaquete(e, p) {
  const std = Number(p?.peso_estandar_g) || null
  const min = Number(estandar(e, 'paquete_min_g', { productoId: p?.id })?.valor)
  const max = Number(estandar(e, 'paquete_max_g', { productoId: p?.id })?.valor)
  if (min && max) return { min, max, std, fijo: true }
  if (!std) return null
  const t = toleranciaPaquete(e) / 100
  return { min: Math.round(std * (1 - t)), max: Math.round(std * (1 + t)), std, fijo: false }
}
// 'bien' dentro del rango, 'bajo' por debajo (sube el gramaje), 'alto' por encima (se regala masa).
export function estadoPeso(e, p, g) {
  const r = rangoPaquete(e, p)
  if (!r || !(g > 0)) return null
  return g < r.min ? 'bajo' : g > r.max ? 'alto' : 'bien'
}
