import { supabase } from './supabase'
import { venceCompra, textoPago } from './pago-proveedor'

// Lo que se le debe a cada proveedor y desde cuando. El saldo sale de
// facturas_proveedores; la antiguedad, de las compras a credito: los abonos
// pagan primero lo mas viejo, asi que la deuda que queda es la de las
// compras mas recientes hasta completar el saldo. Vence segun como se le
// paga al proveedor (lib/pago-proveedor): a un plazo en dias o en su dia fijo.
export async function cargarPorPagar(empresaIds, hoy) {
  const [{ data: saldos }, { data: compras }, { data: conf }] = await Promise.all([
    supabase.from('facturas_proveedores').select('empresa_id, proveedor_id, total_pendiente, proveedores(*)').eq('estado', 'pendiente').gt('total_pendiente', 0).in('empresa_id', empresaIds),
    supabase.from('compras_encab').select('empresa_id, proveedor_id, fecha, total').eq('estado', 'confirmada').eq('estado_pago', 'cuenta_por_pagar').in('empresa_id', empresaIds).order('fecha', { ascending: false }),
    supabase.from('configuracion').select('empresa_id, valor').eq('parametro', 'plazo_proveedor_dias').in('empresa_id', empresaIds),
  ])
  const plazoEmpresa = Object.fromEntries((conf || []).map(c => [c.empresa_id, Number(c.valor) || 30]))
  const hoyD = new Date(hoy + 'T12:00:00')
  return (saldos || []).map(s => {
    const saldo = Number(s.total_pendiente || 0)
    let resta = saldo, desde = null
    for (const c of (compras || [])) {
      if (c.proveedor_id !== s.proveedor_id || c.empresa_id !== s.empresa_id) continue
      desde = c.fecha
      resta -= Number(c.total || 0)
      if (resta <= 0) break
    }
    const plazo = Number(s.proveedores?.dias_credito) || plazoEmpresa[s.empresa_id] || 30
    const vence = venceCompra(desde, s.proveedores, plazoEmpresa[s.empresa_id] || 30)
    const diasParaVencer = vence ? Math.round((new Date(vence + 'T12:00:00') - hoyD) / 864e5) : null
    return { empresa_id: s.empresa_id, proveedor_id: s.proveedor_id, nombre: s.proveedores?.nombre || 'Proveedor', saldo, desde, vence, diasParaVencer, plazo, pago: textoPago(s.proveedores, plazoEmpresa[s.empresa_id] || 30) }
  }).sort((a, b) => (a.vence || '9').localeCompare(b.vence || '9'))
}

// Lo que de verdad falta por pagar a un proveedor: los pagos cubren primero lo
// más viejo, así que lo que se debe son las compras más recientes hasta
// completar el saldo (la más vieja de esas puede estar abonada en parte).
// Devuelve las pendientes de la más vieja a la más nueva, las que ya quedaron
// cubiertas y lo del saldo que no sale de compras (saldo inicial).
export function pendientesPorSaldo(compras, saldo) {
  const recientes = [...compras].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
  let resta = Number(saldo || 0)
  const pendientes = [], cubiertas = []
  for (const c of recientes) {
    const t = Number(c.total || 0)
    if (resta <= 0.5) { cubiertas.push(c); continue }
    const falta = Math.min(t, resta)
    pendientes.push({ ...c, falta, parcial: falta < t - 0.5 })
    resta -= t
  }
  return { pendientes: pendientes.reverse(), cubiertas, sinCompra: Math.max(resta, 0) }
}
