'use client'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { conObsequiosRestados } from '@/lib/ventas-helpers'
import { rangoQuincena, diasQuincena, tieneAuxilio } from '@/lib/nomina'

const rangoMes = (mes) => { const [y, m] = mes.split('-').map(Number); return { inicio: `${mes}-01`, fin: `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` } }

// Descuentos que salen solos de la operación dentro de un rango de fechas:
// descuadres de caja en liquidación, consumo propio y productos, préstamos en
// ruta y en Gastos, y transferencias no recibidas antes de su fecha límite.
export async function cargarDescuentos(empleados, desde, hasta) {
  const empresaId = getEmpresaId()
  const empleadoIds = empleados.map(e => e.id)
  const vendedorIds = empleados.filter(e => e.vendedor_id).map(e => e.vendedor_id)
  const empleadoPorVendedor = {}
  empleados.forEach(e => { if (e.vendedor_id) empleadoPorVendedor[e.vendedor_id] = e.id })
  const vacio = Promise.resolve({ data: [] })
  const [{ data: liq }, { data: prestamosGastos }, { data: consumos }, { data: prestamosRuta }, { data: transfVencidas }] = await Promise.all([
    vendedorIds.length ? supabase.from('liquidaciones_detalle').select('vendedor_id, diferencia, fecha').in('vendedor_id', vendedorIds).lt('diferencia', 0).gte('fecha', desde).lte('fecha', hasta).eq('empresa_id', empresaId) : vacio,
    empleadoIds.length ? supabase.from('gastos_admin').select('empleado_id, valor, fecha, categoria').in('empleado_id', empleadoIds).eq('anulado', false).ilike('categoria', '%restamo%').gte('fecha', desde).lte('fecha', hasta).eq('empresa_id', empresaId) : vacio,
    empleadoIds.length ? supabase.from('consumos_empleado').select('empleado_id, vendedor_id, venta_id, valor, fecha').or(`empleado_id.in.(${empleadoIds.join(',')})${vendedorIds.length ? `,vendedor_id.in.(${vendedorIds.join(',')})` : ''}`).gte('fecha', desde).lte('fecha', hasta).eq('empresa_id', empresaId) : vacio,
    vendedorIds.length ? supabase.from('liquidaciones_gastos').select('vendedor_id, valor, fecha, categoria').in('vendedor_id', vendedorIds).ilike('categoria', '%restamo%').gte('fecha', desde).lte('fecha', hasta).eq('empresa_id', empresaId) : vacio,
    vendedorIds.length ? supabase.from('transferencias_ruta').select('id, vendedor_id, valor, fecha, fecha_limite, referencia').in('vendedor_id', vendedorIds).eq('estado', 'cargada').eq('empresa_id', empresaId) : vacio,
  ])
  const porEmpleado = {}
  empleados.forEach(e => { porEmpleado[e.id] = { total: 0, detalle: [] } })
  const agregar = (empId, concepto, fecha, valor, extra = {}) => {
    if (!empId || !porEmpleado[empId] || !valor) return
    porEmpleado[empId].detalle.push({ concepto, fecha, valor, ...extra })
    porEmpleado[empId].total += valor
  }
  ;(liq || []).forEach(l => agregar(empleadoPorVendedor[l.vendedor_id], 'Descuadre de liquidación', l.fecha, Math.abs(l.diferencia)))
  ;(prestamosGastos || []).forEach(g => agregar(g.empleado_id, 'Préstamo registrado en Gastos', g.fecha, Number(g.valor) || 0))
  ;(consumos || []).forEach(c => agregar(c.empleado_id || empleadoPorVendedor[c.vendedor_id], c.venta_id ? 'Productos' : 'Consumo propio', c.fecha, Number(c.valor) || 0))
  ;(prestamosRuta || []).forEach(g => agregar(empleadoPorVendedor[g.vendedor_id], 'Préstamo en ruta', g.fecha, Number(g.valor) || 0))
  ;(transfVencidas || []).forEach(t => agregar(empleadoPorVendedor[t.vendedor_id], `Transferencia no recibida, cargada al vendedor${t.referencia ? ` (${t.referencia})` : ''}`, t.fecha, Number(t.valor) || 0, { transferenciaId: t.id }))
  Object.values(porEmpleado).forEach(p => p.detalle.sort((a, b) => a.fecha.localeCompare(b.fecha)))
  return porEmpleado
}

const comisionDeTramo = (pctMeta, utilidad, tramos) => {
  const t = (tramos || []).find(r => pctMeta >= r.meta_pct_min && (r.meta_pct_max == null || pctMeta <= r.meta_pct_max))
  return t ? utilidad * (t.comision_pct / 100) : 0
}

// Comisión del mes por ruta según los tramos de Finanzas → Metas.
export async function cargarComisionPorRuta(mes) {
  const { inicio, fin } = rangoMes(mes)
  const empresaId = getEmpresaId()
  const [{ data: tramos }, { data: rutas }, { data: metas }, { data: despachos }, { data: liq }, { data: gastos }] = await Promise.all([
    supabase.from('config_comisiones').select('*').eq('empresa_id', empresaId).order('meta_pct_min'),
    supabase.from('rutas').select('id').eq('estado', true).eq('empresa_id', empresaId),
    supabase.from('metas_ventas').select('*').eq('mes', mes).not('ruta_id', 'is', null).eq('empresa_id', empresaId),
    supabase.from('despachos_encab').select('id, ruta_id').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', empresaId),
    supabase.from('liquidaciones').select('despacho_id, efectivo_esperado').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', empresaId),
    supabase.from('liquidaciones_gastos').select('despacho_id, valor').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', empresaId),
  ])
  const rutaDe = Object.fromEntries((despachos || []).map(d => [d.id, d.ruta_id]))
  const venta = {}, gasto = {}
  ;(await conObsequiosRestados(liq, { desde: inicio, hasta: fin, empresaId })).forEach(l => { const r = rutaDe[l.despacho_id]; if (r) venta[r] = (venta[r] || 0) + (l.efectivo_esperado || 0) })
  ;(gastos || []).forEach(g => { const r = rutaDe[g.despacho_id]; if (r) gasto[r] = (gasto[r] || 0) + (g.valor || 0) })
  const meta = Object.fromEntries((metas || []).map(m => [m.ruta_id, m.meta]))
  return Object.fromEntries((rutas || []).map(r => {
    const v = venta[r.id] || 0, m = meta[r.id] || 0
    return [r.id, comisionDeTramo(m > 0 ? v / m * 100 : 0, v - (gasto[r.id] || 0), tramos)]
  }))
}

// Préstamos con su saldo y cuotas pagadas.
export async function cargarPrestamos() {
  const empresaId = getEmpresaId()
  const [{ data: prestamos }, { data: abonos }] = await Promise.all([
    supabase.from('nomina_prestamos').select('*').eq('empresa_id', empresaId).order('fecha', { ascending: false }),
    supabase.from('nomina_prestamos_abonos').select('*').eq('empresa_id', empresaId).order('fecha'),
  ])
  return (prestamos || []).map(p => {
    const suyos = (abonos || []).filter(a => a.prestamo_id === p.id)
    const pagado = suyos.reduce((s, a) => s + Number(a.valor), 0)
    return { ...p, abonos: suyos, pagado, saldo: Math.max(0, Number(p.monto) - pagado), cuotasPagadas: suyos.filter(a => a.origen === 'nomina').length }
  })
}

// Novedades sin quincena (registradas antes del pago quincenal) van a la segunda.
export const quincenaDe = (n) => n.quincena || 2

// Liquidación de un empleado en una quincena. Las comisiones y las cuotas de
// préstamos van en la segunda quincena (fin de mes).
export function liquidar(e, { mes, q, p, novedades, automaticos, comisionPorRuta, vendedores, prestamos, cuotasEditadas }) {
  const dias = diasQuincena(e, mes, q)
  const salarioMes = Number(e.salario_base) || 0
  const salario = Math.round(salarioMes / 30 * dias)
  const auxilio = tieneAuxilio(salarioMes, p) ? Math.round(p.auxilio_transporte / 30 * dias) : 0
  const suyas = novedades.filter(n => n.empleado_id === e.id && quincenaDe(n) === q)
  const horas = suyas.filter(n => n.tipo === 'horas')
  const bonos = suyas.filter(n => n.tipo === 'bonificacion')
  const vendedor = vendedores.find(v => v.id === e.vendedor_id)
  const comision = q === 2 && vendedor?.ruta_id ? Math.round(comisionPorRuta[vendedor.ruta_id] || 0) : 0
  const valorHoras = horas.reduce((s, n) => s + Number(n.valor), 0)
  const bonosSalariales = bonos.filter(n => n.salarial).reduce((s, n) => s + Number(n.valor), 0)
  const base = salario + valorHoras + comision + bonosSalariales
  const salud = Math.round(base * p.salud_empleado / 100)
  const pension = Math.round(base * p.pension_empleado / 100)
  // Descuentos de la operación dentro del periodo de este empleado (las
  // transferencias vencidas entran en cualquier quincena).
  const { desde, hasta } = rangoQuincena(mes, q, e)
  const auto = { detalle: (automaticos[e.id]?.detalle || []).filter(x => x.transferenciaId || (x.fecha >= desde && x.fecha <= hasta)) }
  const { fin } = rangoMes(mes)
  const prest = q !== 2 ? [] : prestamos
    .filter(x => x.empleado_id === e.id && x.estado === 'activo' && x.saldo > 0 && x.fecha <= fin && !x.abonos.some(a => a.origen === 'nomina' && a.periodo === mes))
    .map(x => {
      const sugerida = Math.min(Number(x.valor_cuota), x.saldo)
      const ed = cuotasEditadas?.[x.id]
      const cuota = ed === undefined || ed === '' ? sugerida : Math.min(Math.max(0, parseFloat(ed) || 0), x.saldo)
      return { ...x, cuota, sugerida, numeroCuota: x.cuotasPagadas + 1 }
    })

  const devengos = [{ concepto: dias < 15 ? `Salario (${dias} días)` : 'Salario', valor: salario }]
  if (auxilio) devengos.push({ concepto: 'Auxilio de transporte', valor: auxilio })
  if (comision) devengos.push({ concepto: 'Comisión del mes', valor: comision })
  horas.forEach(n => devengos.push({ concepto: n.concepto, valor: Number(n.valor) }))
  bonos.forEach(n => devengos.push({ concepto: `${n.concepto}${n.salarial ? ' (salarial)' : ''}`, valor: Number(n.valor) }))
  const deducciones = [
    { concepto: `Salud (${p.salud_empleado}%)`, valor: salud, aporte: true },
    { concepto: `Pensión (${p.pension_empleado}%)`, valor: pension, aporte: true },
  ]
  auto.detalle.forEach(d => deducciones.push({ concepto: `${d.concepto} (${d.fecha})`, valor: d.valor, transferenciaId: d.transferenciaId }))
  prest.filter(x => x.cuota > 0).forEach(x => deducciones.push({ concepto: `Cuota préstamo ${x.numeroCuota} de ${x.num_cuotas}${x.concepto ? ` · ${x.concepto}` : ''}`, valor: x.cuota, prestamoId: x.id }))
  suyas.filter(n => n.tipo === 'descuento').forEach(n => deducciones.push({ concepto: n.concepto, valor: Number(n.valor) }))
  const totalDevengado = devengos.reduce((s, d) => s + d.valor, 0)
  const totalDeducciones = deducciones.reduce((s, d) => s + d.valor, 0)
  return {
    desde, hasta, dias, salario, auxilio, comision, horas: valorHoras, salud, pension, prestamos: prest, devengos, deducciones,
    bonificaciones: bonos.reduce((s, n) => s + Number(n.valor), 0),
    otrosDescuentos: totalDeducciones - salud - pension,
    totalDevengado, totalDeducciones, neto: totalDevengado - totalDeducciones,
  }
}

export { rangoQuincena }
export function rangoTodos(empleados, mes, q) {
  const rs = (empleados.length ? empleados : [{}]).map(e => rangoQuincena(mes, q, e))
  return { desde: rs.map(r => r.desde).sort()[0], hasta: rs.map(r => r.hasta).sort().pop() }
}
