'use client'
import { supabase } from './supabase'
import { cargarPorPagar } from './por-pagar'

// Próximos días para el Inicio: pagos a proveedores, documentos de vehículos
// que vencen y créditos de clientes que vencen. Solo lo que tiene fecha real.
const sumar = (f, d) => { const x = new Date(f + 'T12:00:00'); x.setDate(x.getDate() + d); return x.toLocaleDateString('en-CA') }
const pesos = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO')

export async function cargarAgenda(ids, hoy, dias = 7) {
  const hasta = sumar(hoy, dias - 1)
  const [deudas, { data: docs }, { data: creditos }] = await Promise.all([
    cargarPorPagar(ids, hoy).catch(() => []),
    supabase.from('vehiculos_documentos').select('tipo, fecha_vencimiento, empresa_id, vehiculos(placa)').in('empresa_id', ids).gte('fecha_vencimiento', hoy).lte('fecha_vencimiento', hasta),
    supabase.from('cartera_fiados').select('saldo, fecha_pago, empresa_id').eq('estado', 'pendiente').gt('saldo', 0).in('empresa_id', ids).gte('fecha_pago', hoy).lte('fecha_pago', hasta),
  ])
  const eventos = []
  deudas.filter(d => d.vence && d.vence >= hoy && d.vence <= hasta)
    .forEach(d => eventos.push({ fecha: d.vence, tono: 'rojo', titulo: `Pago a ${d.nombre} · ${pesos(d.saldo)}`, modulo: 'Compras', href: '/compras' }))
  ;(docs || []).forEach(d => eventos.push({ fecha: d.fecha_vencimiento, tono: 'ambar', titulo: `Vence ${String(d.tipo || 'documento').toUpperCase()} de ${d.vehiculos?.placa || 'un vehículo'}`, modulo: 'Vehículos', href: '/vehiculos' }))
  const porDia = {}
  ;(creditos || []).forEach(c => { const x = (porDia[c.fecha_pago] = porDia[c.fecha_pago] || { n: 0, v: 0 }); x.n++; x.v += Number(c.saldo) })
  Object.entries(porDia).forEach(([f, x]) => eventos.push({ fecha: f, tono: 'gris', titulo: `${x.n} ${x.n === 1 ? 'crédito vence' : 'créditos vencen'} · ${pesos(x.v)}`, modulo: 'Cartera', href: '/cartera' }))
  eventos.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.tono === 'rojo' ? -1 : 1))
  return { dias: Array.from({ length: dias }, (_, i) => sumar(hoy, i)), eventos }
}
