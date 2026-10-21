'use client'
import { supabase } from './supabase'

// Nómina quincenal y costo laboral por empresa (legislación colombiana).
// Los valores legales se guardan por empresa en nomina_parametros y se
// ajustan cada año; estos son los vigentes en 2026.
export const PARAMETROS_BASE = {
  smmlv: 1750905,
  auxilio_transporte: 249095,
  horas_mes: 210, // jornada de 42 horas semanales desde el 15 de julio de 2026
  recargos: { extra_diurna: 25, extra_nocturna: 75, recargo_nocturno: 35, dominical: 90 },
  salud_empleado: 4,
  pension_empleado: 4,
  pension_empleador: 12,
  salud_empleador: 8.5,
  caja: 4,
  sena: 2,
  icbf: 3,
  exonerado: true, // art. 114-1 E.T.: sin salud, SENA ni ICBF del empleador por debajo de 10 salarios mínimos
  dia_pila: 10,
}

export const CLASES_HORA = {
  extra_diurna: { nombre: 'Hora extra diurna', extra: true },
  extra_nocturna: { nombre: 'Hora extra nocturna', extra: true },
  recargo_nocturno: { nombre: 'Recargo nocturno', extra: false },
  dominical: { nombre: 'Dominical o festivo', extra: false },
}

export const TARIFA_ARL = { 1: 0.522, 2: 1.044, 3: 2.436, 4: 4.35, 5: 6.96 }
export const NIVEL_ARL = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' }

export async function cargarParametros(empresaId) {
  const { data } = await supabase.from('nomina_parametros').select('datos').eq('empresa_id', empresaId).maybeSingle()
  const d = data?.datos || {}
  return { ...PARAMETROS_BASE, ...d, recargos: { ...PARAMETROS_BASE.recargos, ...(d.recargos || {}) } }
}

export async function guardarParametros(empresaId, datos) {
  const { error } = await supabase.from('nomina_parametros').upsert({ empresa_id: empresaId, datos, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
}

// Tipo de empleado según su destino en Costos.
export const tipoEmpleado = (e) => e.es_mano_obra_directa ? 'mod' : e.vendedor_id ? 'ventas' : 'admin'
export const NOMBRE_TIPO = { mod: 'Mano de obra directa', ventas: 'Ventas', admin: 'Administrativo' }

export const tieneAuxilio = (salario, p) => Number(salario) > 0 && Number(salario) <= 2 * p.smmlv

// Quincenas. Cada empleado tiene el día en que empieza cada una (por defecto
// 1 y 16: del 1 al 15 y del 16 a fin de mes; con 5 y 21: del 5 al 20 y del 21
// al 4 del mes siguiente). La segunda quincena es la del fin de mes.
export const ultimoDia = (mes) => { const [y, m] = mes.split('-').map(Number); return new Date(y, m, 0).getDate() }
const dd = (n) => String(n).padStart(2, '0')
const mesSiguiente = (mes) => { const [y, m] = mes.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${dd(m + 1)}` }
const diaAntes = (f) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-CA') }
export const cortes = (e) => ({ q1: Number(e?.inicio_q1) || 1, q2: Number(e?.inicio_q2) || 16 })
export const esCalendario = (e) => { const c = cortes(e); return c.q1 === 1 && c.q2 === 16 }
export function rangoQuincena(mes, q, e) {
  const c = cortes(e)
  if (q === 1) return { desde: `${mes}-${dd(c.q1)}`, hasta: `${mes}-${dd(c.q2 - 1)}` }
  return { desde: `${mes}-${dd(c.q2)}`, hasta: c.q1 === 1 ? `${mes}-${dd(ultimoDia(mes))}` : diaAntes(`${mesSiguiente(mes)}-${dd(c.q1)}`) }
}
export const fechaPago = (mes, q, e) => rangoQuincena(mes, q, e).hasta
const NOMBRE_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const diaMes = (f) => `${Number(f.slice(8, 10))} de ${NOMBRE_MES[Number(f.slice(5, 7)) - 1]}`
// Texto del periodo: "16 al 31 de octubre 2026", "21 de octubre al 4 de noviembre 2026".
export function textoRango(desde, hasta) {
  const año = hasta.slice(0, 4)
  return desde.slice(0, 7) === hasta.slice(0, 7) ? `${Number(desde.slice(8, 10))} al ${diaMes(hasta)} ${año}` : `${diaMes(desde)} al ${diaMes(hasta)} ${año}`
}
export const nombreQuincena = (mes, q, e) => {
  const [y, m] = mes.split('-').map(Number)
  if (!q) return `${NOMBRE_MES[m - 1]} ${y}`
  const r = rangoQuincena(mes, q, e)
  return textoRango(r.desde, r.hasta)
}
export const nombreMesQ = (mes, q) => `${q === 1 ? 'Primera' : 'Segunda'} quincena de ${NOMBRE_MES[Number(mes.slice(5, 7)) - 1]}`
export function quincenaActual(hoy) {
  return { mes: hoy.slice(0, 7), q: Number(hoy.slice(8, 10)) <= 15 ? 1 : 2 }
}

// Días a pagar en la quincena (mes comercial: 15 por quincena); si ingresó
// dentro del periodo se cuentan desde su fecha de ingreso.
export function diasQuincena(e, mes, q) {
  const { desde, hasta } = rangoQuincena(mes, q, e)
  if (e.fecha_inicio && e.fecha_inicio > hasta) return 0
  if (!e.fecha_inicio || e.fecha_inicio <= desde) return 15
  const faltaron = Math.round((new Date(e.fecha_inicio + 'T12:00:00') - new Date(desde + 'T12:00:00')) / 864e5)
  return Math.max(0, 15 - faltaron)
}

export const valorHora = (salario, p) => Number(salario || 0) / p.horas_mes
export function valorHoras(salario, horas, clase, p) {
  const pct = Number(p.recargos[clase] || 0) / 100
  const factor = CLASES_HORA[clase]?.extra ? 1 + pct : pct
  return Math.round(valorHora(salario, p) * Number(horas || 0) * factor)
}

// Costo laboral mensual de un empleado: salario, auxilio, aportes del
// empleador y provisión de prestaciones sociales.
export function costoLaboral(e, p) {
  const sal = Number(e.salario_base || 0)
  const aux = tieneAuxilio(sal, p) ? p.auxilio_transporte : 0
  const exento = p.exonerado && sal < 10 * p.smmlv
  const partes = {
    pension: sal * p.pension_empleador / 100,
    salud: exento ? 0 : sal * p.salud_empleador / 100,
    arl: sal * (TARIFA_ARL[e.riesgo_arl || 1] || TARIFA_ARL[1]) / 100,
    caja: sal * p.caja / 100,
    parafiscales: exento ? 0 : sal * (p.sena + p.icbf) / 100,
    prima: (sal + aux) * 8.33 / 100,
    cesantias: (sal + aux) * 8.33 / 100,
    intereses: (sal + aux) * 1 / 100,
    vacaciones: sal * 4.17 / 100,
    auxilio: aux,
  }
  const adicional = Object.values(partes).reduce((s, v) => s + v, 0)
  return { salario: sal, partes, adicional, total: sal + adicional }
}

// Provisión de aportes y prestaciones de un pago ya hecho (para Finanzas).
export function provisionDePago(pago, e, p) {
  const base = Number(pago.salario_base || 0) + Number(pago.comision || 0) + Number(pago.horas_extra || 0)
  const aux = Number(pago.auxilio_transporte || 0)
  const exento = p.exonerado && Number(e?.salario_base || 0) < 10 * p.smmlv
  const tarifa = TARIFA_ARL[e?.riesgo_arl || 1] || TARIFA_ARL[1]
  return base * (p.pension_empleador + tarifa + p.caja + (exento ? 0 : p.salud_empleador + p.sena + p.icbf) + 4.17) / 100
    + (base + aux) * (8.33 + 8.33 + 1) / 100
}

// Obligaciones laborales con fecha: próximas quincenas, seguridad social,
// prima, intereses y cesantías. Para Finanzas y el calendario de Nómina.
export function obligaciones(empleados, p, hoy, hasta) {
  const activos = empleados.filter(e => e.activo !== false)
  const mensual = activos.reduce((s, e) => s + Number(e.salario_base || 0), 0)
  const auxMes = activos.reduce((s, e) => s + (tieneAuxilio(e.salario_base, p) ? p.auxilio_transporte : 0), 0)
  const aportes = activos.reduce((s, e) => { const c = costoLaboral(e, p).partes; return s + c.pension + c.salud + c.arl + c.caja + c.parafiscales }, 0)
  const deduccionEmpleado = mensual * (p.salud_empleado + p.pension_empleado) / 100
  const lista = []
  const año = Number(hoy.slice(0, 4))
  // Quincenas de este mes y los siguientes, por grupo de empleados con el mismo periodo de pago.
  const grupos = {}
  activos.forEach(e => { const c = cortes(e); (grupos[`${c.q1}-${c.q2}`] = grupos[`${c.q1}-${c.q2}`] || []).push(e) })
  let [y, m] = hoy.slice(0, 7).split('-').map(Number)
  y = m === 1 ? y - 1 : y; m = m === 1 ? 12 : m - 1 // desde el mes anterior: su segunda quincena puede pagarse este mes
  for (let i = 0; i < 4; i++) {
    const mes = `${y}-${String(m).padStart(2, '0')}`
    Object.values(grupos).forEach(g => {
      const neto = g.reduce((s, e) => { const sal = Number(e.salario_base || 0); return s + (sal + (tieneAuxilio(sal, p) ? p.auxilio_transporte : 0)) / 2 - sal * (p.salud_empleado + p.pension_empleado) / 200 }, 0)
      ;[1, 2].forEach(q => { const f = fechaPago(mes, q, g[0]); if (f >= hoy && f <= hasta) lista.push({ fecha: f, valor: Math.round(neto), titulo: `Nómina ${nombreQuincena(mes, q, g[0])}`, detalle: `${g.length} ${g.length === 1 ? 'empleado' : 'empleados'}${q === 2 ? ' · sin comisiones' : ''}`, tipo: 'nomina', mes, q }) })
    })
    if (i > 0) {
      const pila = `${mes}-${String(Math.min(p.dia_pila, ultimoDia(mes))).padStart(2, '0')}`
      if (pila >= hoy && pila <= hasta) lista.push({ fecha: pila, valor: Math.round(aportes + deduccionEmpleado), titulo: 'Seguridad social (PILA)', detalle: 'Aportes del empleador y del empleado', tipo: 'pila' })
    }
    m++; if (m > 12) { m = 1; y++ }
  }
  const primaSem = (mensual + auxMes) / 2
  const fijas = [
    { fecha: `${año}-06-30`, valor: primaSem, titulo: 'Prima de servicios', detalle: 'Primer semestre' },
    { fecha: `${año}-12-20`, valor: primaSem, titulo: 'Prima de servicios', detalle: 'Segundo semestre' },
    { fecha: `${año + 1}-01-31`, valor: (mensual + auxMes) * 0.12, titulo: 'Intereses sobre cesantías', detalle: 'Pago al empleado' },
    { fecha: `${año + 1}-02-14`, valor: mensual + auxMes, titulo: 'Consignación de cesantías', detalle: 'Al fondo de cada empleado' },
    { fecha: `${año}-01-31`, valor: (mensual + auxMes) * 0.12, titulo: 'Intereses sobre cesantías', detalle: 'Pago al empleado' },
    { fecha: `${año}-02-14`, valor: mensual + auxMes, titulo: 'Consignación de cesantías', detalle: 'Al fondo de cada empleado' },
  ]
  fijas.filter(o => o.fecha >= hoy && o.fecha <= hasta).forEach(o => lista.push({ ...o, valor: Math.round(o.valor), tipo: 'prestacion' }))
  return lista.sort((a, b) => a.fecha.localeCompare(b.fecha))
}
