'use client'
import { supabase } from './supabase'
import { cargarPorPagar } from './por-pagar'
import { cargarObligaciones, proximaCuota } from './obligaciones'
import { cargarParametros, obligaciones } from './nomina'
import { cargarProgramados, programadosProximos } from './gastos'

// Todo lo que la empresa debe, en una lista: proveedores, cuotas de créditos,
// nómina y seguridad social, gastos programados y lo que le debe a la otra
// empresa. Cada línea sale de su módulo, así que pagar allá la quita de aquí.
const sumar = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }

export const TIPOS_POR_PAGAR = { proveedores: 'Proveedores', obligaciones: 'Créditos', nomina: 'Nómina', gastos: 'Gastos fijos', empresas: 'Otra empresa' }

export async function cargarCuentasPorPagar(empresaId, hoy) {
  const finAño = `${hoy.slice(0, 4)}-12-31`
  const [proveedores, financieras, { data: emps }, p, { data: pagos }, programados, { data: empresas }] = await Promise.all([
    cargarPorPagar([empresaId], hoy).catch(() => []),
    cargarObligaciones(empresaId).catch(() => []),
    supabase.from('empleados').select('*').eq('empresa_id', empresaId).eq('activo', true),
    cargarParametros(empresaId),
    supabase.from('nomina_pagos').select('periodo, quincena').eq('empresa_id', empresaId).gte('periodo', sumar(hoy, -62).slice(0, 7)),
    cargarProgramados(empresaId).catch(() => []),
    supabase.from('empresas').select('id, nombre'),
  ])
  const nombre = (empresas || []).find(e => e.id === empresaId)?.nombre || ''
  const lista = []

  proveedores.forEach(d => lista.push({ tipo: 'proveedores', acreedor: d.nombre, fecha: d.vence || hoy, valor: d.saldo, titulo: d.nombre, detalle: d.vence ? `Se paga ${d.pago.toLowerCase()}` : 'Sin fecha de compra', href: '/compras?vista=cuentas' }))

  financieras.filter(o => o.estado === 'activa' && o.saldo > 0).forEach(o => {
    const f = proximaCuota(o, hoy)
    if (f) lista.push({ tipo: 'obligaciones', acreedor: o.entidad, fecha: f, valor: Math.min(Number(o.cuota), o.saldo), titulo: `Cuota ${o.entidad}`, detalle: `Saldo del crédito ${Math.round(o.saldo).toLocaleString('es-CO')}`, href: '/financiero?vista=obligaciones', estimado: true })
  })

  // Nómina: las quincenas sin pagar del mes en curso (también las que ya pasaron)
  // y lo demás desde hoy. Las de meses anteriores se pagaron antes de registrar
  // pagos en el sistema y no se cuentan como vencidas.
  const pagadas = new Set((pagos || []).map(x => `${x.periodo}-${x.quincena}`))
  if ((emps || []).length) obligaciones(emps, p, `${hoy.slice(0, 7)}-01`, finAño)
    .filter(o => o.tipo === 'nomina' ? !pagadas.has(`${o.mes}-${o.q}`) : o.fecha >= hoy)
    .forEach(o => lista.push({ tipo: 'nomina', acreedor: o.tipo === 'nomina' ? 'Nómina de empleados' : o.tipo === 'pila' ? 'Seguridad social' : o.titulo, fecha: o.fecha, valor: o.valor, titulo: o.titulo, detalle: o.detalle, href: '/nomina?vista=liquidacion', estimado: true }))

  programadosProximos(programados, hoy, finAño).forEach(g => lista.push({ tipo: 'gastos', acreedor: g.titulo, fecha: g.fecha, valor: g.valor, titulo: g.titulo, detalle: g.detalle, href: '/gastos', estimado: g.estimado }))

  // Lo que esta empresa le debe a otra del grupo: queda en la Cartera de la otra.
  if (nombre) {
    const { data: deudas } = await supabase.from('cartera_fiados').select('empresa_id, saldo, fecha_fiado, fecha_pago').neq('empresa_id', empresaId).eq('nombre_cliente', nombre).eq('estado', 'pendiente').gt('saldo', 0)
    ;(deudas || []).forEach(d => {
      const otra = (empresas || []).find(e => e.id === d.empresa_id)?.nombre || 'Otra empresa'
      lista.push({ tipo: 'empresas', acreedor: otra, fecha: d.fecha_pago || d.fecha_fiado, valor: Number(d.saldo), titulo: `Le debe a ${otra}`, detalle: `Desde el ${new Date(d.fecha_fiado + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} · se abona en la Cartera de ${otra}` })
    })
  }
  return lista.filter(x => x.valor > 0).sort((a, b) => a.fecha.localeCompare(b.fecha))
}
