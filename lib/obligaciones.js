'use client'
import { supabase } from './supabase'
import { getEmpresaId } from './empresa'

// Obligaciones financieras de la empresa: créditos, leasing, tarjetas y demás.
// El abono a capital baja la deuda y no es gasto; los intereses sí son gasto
// del mes y entran al resultado en Finanzas.
export const TIPOS_OBLIGACION = {
  credito: 'Crédito bancario', vehiculo: 'Crédito de vehículo', leasing: 'Leasing', tarjeta: 'Tarjeta de crédito',
  rotativo: 'Cupo rotativo o sobregiro', socio: 'Préstamo de socio o tercero', otro: 'Otra obligación',
}

const dd = (n) => String(n).padStart(2, '0')
const fechaDelMes = (mes, dia) => { const [y, m] = mes.split('-').map(Number); return `${mes}-${dd(Math.min(dia, new Date(y, m, 0).getDate()))}` }
const mesMas = (mes, n) => { const [y, m] = mes.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${dd(d.getMonth() + 1)}` }

// Próxima cuota: la del mes si aún no se ha pagado; si ya pasó queda vencida.
export function proximaCuota(o, hoy) {
  if (o.estado !== 'activa' || !o.dia_pago || !(Number(o.cuota) > 0) || o.saldo <= 0) return null
  let mes = hoy.slice(0, 7)
  if (o.fecha_inicio.slice(0, 7) > mes) mes = o.fecha_inicio.slice(0, 7)
  if (o.pagos.some(p => p.fecha.slice(0, 7) === mes)) mes = mesMas(mes, 1)
  return fechaDelMes(mes, o.dia_pago)
}

export async function cargarObligaciones(empresaId = getEmpresaId()) {
  const [{ data: lista }, { data: pagos }] = await Promise.all([
    supabase.from('obligaciones_financieras').select('*').eq('empresa_id', empresaId).order('estado').order('created_at'),
    supabase.from('obligaciones_pagos').select('*').eq('empresa_id', empresaId).order('fecha', { ascending: false }),
  ])
  return (lista || []).map(o => {
    const suyos = (pagos || []).filter(p => p.obligacion_id === o.id)
    const capital = suyos.reduce((s, p) => s + Number(p.capital || 0), 0)
    return { ...o, pagos: suyos, capitalPagado: capital, interesesPagados: suyos.reduce((s, p) => s + Number(p.intereses || 0), 0), saldo: Math.max(0, Number(o.saldo_inicial) - capital) }
  })
}

// Cuotas con fecha dentro de un rango, para el flujo de caja y el calendario.
export function cuotasEnRango(obligaciones, desde, hasta) {
  const out = []
  obligaciones.forEach(o => {
    if (o.estado !== 'activa' || !o.dia_pago || !(Number(o.cuota) > 0) || o.saldo <= 0) return
    for (let mes = desde.slice(0, 7), n = 0; mes <= hasta.slice(0, 7) && n < 14; mes = mesMas(mes, 1), n++) {
      if (o.fecha_inicio.slice(0, 7) > mes || o.pagos.some(p => p.fecha.slice(0, 7) === mes)) continue
      const fecha = fechaDelMes(mes, o.dia_pago)
      if (fecha >= desde && fecha <= hasta) out.push({ fecha, valor: Math.min(Number(o.cuota), o.saldo + o.saldo * Number(o.tasa_mensual || 0) / 100), o })
    }
  })
  return out
}

export const interesSugerido = (o) => Math.round(o.saldo * Number(o.tasa_mensual || 0) / 100)

export async function crearObligacion(datos, { cuentaId, usuario }) {
  const empresa_id = getEmpresaId()
  const { data, error } = await supabase.from('obligaciones_financieras').insert({ ...datos, empresa_id, registrado_por: usuario }).select().single()
  if (error) throw new Error(error.message)
  // Si el dinero del crédito entró a una cuenta, queda como entrada de esa cuenta.
  if (cuentaId) {
    const { error: e2 } = await supabase.from('movimientos_tesoreria').insert({ empresa_id, cuenta_id: cuentaId, fecha: datos.fecha_inicio, tipo: 'entrada', monto: datos.saldo_inicial, concepto: `Desembolso ${datos.entidad}`, referencia_tipo: 'obligacion', referencia_id: data.id })
    if (e2) throw new Error('La obligación quedó registrada, pero falló la entrada a la cuenta: ' + e2.message)
  }
  return data
}

export async function registrarPagoObligacion(o, { fecha, capital, intereses, cuentaId, usuario }) {
  const empresa_id = getEmpresaId()
  const { data, error } = await supabase.from('obligaciones_pagos').insert({ empresa_id, obligacion_id: o.id, fecha, capital, intereses, cuenta_id: cuentaId || null, registrado_por: usuario }).select().single()
  if (error) throw new Error(error.message)
  const fallos = []
  if (cuentaId) {
    const { error: e2 } = await supabase.from('movimientos_tesoreria').insert({ empresa_id, cuenta_id: cuentaId, fecha, tipo: 'salida', monto: capital + intereses, concepto: `Cuota ${o.entidad}`, referencia_tipo: 'obligacion_pago', referencia_id: data.id })
    if (e2) fallos.push('la salida de la cuenta')
  }
  if (o.saldo - capital <= 0.5) {
    const { error: e3 } = await supabase.from('obligaciones_financieras').update({ estado: 'pagada' }).eq('id', o.id)
    if (e3) fallos.push('marcarla como pagada')
  }
  if (fallos.length) throw new Error(`El pago quedó registrado, pero falló ${fallos.join(' y ')}.`)
}
