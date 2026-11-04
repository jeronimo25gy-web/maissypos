// Cuándo se le paga a un proveedor: a un plazo en días desde la compra, o en
// un día fijo (cada semana, cada quincena o cada mes). Con día fijo, todo lo
// comprado antes de ese día vence ese día; lo comprado el mismo día pasa al
// siguiente pago.
export const DIAS_SEMANA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
export const FRECUENCIAS = [['plazo', 'A un plazo en días'], ['semanal', 'Cada semana'], ['quincenal', 'Cada quincena'], ['mensual', 'Cada mes']]

const iso = (d) => d.toLocaleDateString('en-CA')
const ultimoDia = (y, m) => new Date(y, m + 1, 0).getDate()

export function venceCompra(fecha, prov, plazoGeneral = 30) {
  if (!fecha) return null
  const d = new Date(fecha + 'T12:00:00')
  const f = prov?.pago_frecuencia || 'plazo'
  const dia = Number(prov?.pago_dia) || null
  if (f === 'semanal' && dia) {
    const hoy = ((d.getDay() + 6) % 7) + 1
    d.setDate(d.getDate() + (((dia - hoy + 7) % 7) || 7))
    return iso(d)
  }
  if (f === 'quincenal') {
    const y = d.getFullYear(), m = d.getMonth(), n = d.getDate()
    if (n < 15) return iso(new Date(y, m, 15, 12))
    if (n < ultimoDia(y, m)) return iso(new Date(y, m, ultimoDia(y, m), 12))
    return iso(new Date(y, m + 1, 15, 12))
  }
  if (f === 'mensual' && dia) {
    const y = d.getFullYear(), m = d.getMonth()
    const este = new Date(y, m, Math.min(dia, ultimoDia(y, m)), 12)
    return iso(este > d ? este : new Date(y, m + 1, Math.min(dia, ultimoDia(y, m + 1)), 12))
  }
  d.setDate(d.getDate() + (Number(prov?.dias_credito) || plazoGeneral))
  return iso(d)
}

export function textoPago(prov, plazoGeneral = 30) {
  const f = prov?.pago_frecuencia || 'plazo'
  const dia = Number(prov?.pago_dia) || null
  if (f === 'semanal' && dia) return `Cada ${DIAS_SEMANA[dia - 1]}`
  if (f === 'quincenal') return 'Los días 15 y último del mes'
  if (f === 'mensual' && dia) return `Cada mes, el día ${dia}`
  const n = Number(prov?.dias_credito) || plazoGeneral
  return `A ${n} día${n === 1 ? '' : 's'}`
}
