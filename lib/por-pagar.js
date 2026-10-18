import { supabase } from './supabase'

// Lo que se le debe a cada proveedor y desde cuando. El saldo sale de
// facturas_proveedores; la antiguedad, de las compras a credito: los abonos
// pagan primero lo mas viejo, asi que la deuda que queda es la de las
// compras mas recientes hasta completar el saldo. Vence a los dias de
// credito del proveedor (o el plazo general de la empresa, 30 si no hay).
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
    let vence = null
    if (desde) {
      const d = new Date(desde + 'T12:00:00'); d.setDate(d.getDate() + plazo)
      vence = d.toISOString().slice(0, 10)
    }
    const diasParaVencer = vence ? Math.round((new Date(vence + 'T12:00:00') - hoyD) / 864e5) : null
    return { empresa_id: s.empresa_id, proveedor_id: s.proveedor_id, nombre: s.proveedores?.nombre || 'Proveedor', saldo, desde, vence, diasParaVencer, plazo }
  }).sort((a, b) => (a.vence || '9').localeCompare(b.vence || '9'))
}
