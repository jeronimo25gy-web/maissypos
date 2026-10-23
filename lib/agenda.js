'use client'
import { supabase } from './supabase'
import { cargarPorPagar } from './por-pagar'
import { cargarParametros, obligaciones } from './nomina'
import { programadosProximos } from './gastos'

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

// Calendario del Inicio: todo lo que tiene fecha entre `desde` y `hasta` en
// las empresas `ids`. tipo: nomina | pagos | cobros | vehiculos | propios.
export const TIPOS_CALENDARIO = { nomina: 'Nómina', pagos: 'Pagos', cobros: 'Cobros', vehiculos: 'Vehículos y activos', propios: 'Propias' }
export async function cargarCalendario(ids, desde, hasta, empresas, usuario) {
  const nombre = (id) => (empresas.find(e => e.id === id)?.nombre || '').replace(/ SAS$/i, '')
  const varias = ids.length > 1
  const de = (id) => varias ? ` · ${nombre(id)}` : ''
  const [deudas, creditos, docs, docsCond, activos, propios, programados, porEmpresa] = await Promise.all([
    cargarPorPagar(ids, desde).catch(() => []),
    supabase.from('cartera_fiados').select('saldo, fecha_pago, empresa_id').eq('estado', 'pendiente').gt('saldo', 0).in('empresa_id', ids).gte('fecha_pago', desde).lte('fecha_pago', hasta).then(r => r.data || []),
    supabase.from('vehiculos_documentos').select('tipo, fecha_vencimiento, empresa_id, vehiculo_id, vehiculos(placa)').in('empresa_id', ids).gte('fecha_vencimiento', desde).lte('fecha_vencimiento', hasta).then(r => r.data || []),
    supabase.from('conductores_documentos').select('tipo, vence, empresa_id, vendedores(nombre)').in('empresa_id', ids).gte('vence', desde).lte('vence', hasta).then(r => r.data || []),
    supabase.from('activos').select('nombre, garantia_hasta, proximo_mantenimiento, empresa_id').in('empresa_id', ids).neq('estado', 'baja').then(r => r.data || []),
    supabase.from('calendario_eventos').select('*').in('empresa_id', ids).lte('fecha', hasta).then(r => r.data || []),
    supabase.from('gastos_programados').select('*').in('empresa_id', ids).eq('activo', true).then(r => r.data || []),
    Promise.all(ids.map(async id => {
      const [{ data: emps }, p] = await Promise.all([
        supabase.from('empleados').select('salario_base, riesgo_arl, activo, inicio_q1, inicio_q2').eq('empresa_id', id).eq('activo', true),
        cargarParametros(id),
      ])
      return { id, emps: emps || [], p }
    })),
  ])
  const ev = []
  // Pagos a proveedores: uno por día y empresa, con el detalle.
  const pagos = {}
  deudas.filter(d => d.vence && d.vence >= desde && d.vence <= hasta).forEach(d => { const k = `${d.vence}|${d.empresa_id}`; (pagos[k] = pagos[k] || []).push(d) })
  Object.entries(pagos).forEach(([k, l]) => {
    const [fecha, emp] = k.split('|')
    const total = l.reduce((s, d) => s + d.saldo, 0)
    ev.push({ fecha, tipo: 'pagos', titulo: l.length === 1 ? `Pago a ${l[0].nombre}` : `Pago a ${l.length} proveedores`, detalle: l.sort((a, b) => b.saldo - a.saldo).slice(0, 4).map(d => `${d.nombre} ${pesos(d.saldo)}`).join(' · ') + de(emp), valor: total, href: '/compras' })
  })
  const cred = {}
  creditos.forEach(c => { const k = `${c.fecha_pago}|${c.empresa_id}`; const x = (cred[k] = cred[k] || { n: 0, v: 0 }); x.n++; x.v += Number(c.saldo) })
  Object.entries(cred).forEach(([k, x]) => { const [fecha, emp] = k.split('|'); ev.push({ fecha, tipo: 'cobros', titulo: x.n === 1 ? '1 crédito vence' : `${x.n} créditos vencen`, detalle: `Cartera${de(emp)}`, valor: x.v, href: '/cartera' }) })
  porEmpresa.forEach(({ id, emps, p }) => {
    if (!emps.length) return
    obligaciones(emps, p, desde, hasta).forEach(o => ev.push({ fecha: o.fecha, tipo: 'nomina', titulo: o.titulo, detalle: `${o.detalle}${de(id)}`, valor: o.valor, href: '/nomina' }))
  })
  programadosProximos(programados, desde, hasta).forEach(g => ev.push({ fecha: g.fecha, tipo: 'pagos', titulo: g.titulo, detalle: g.detalle, valor: g.valor, href: '/gastos' }))
  docs.forEach(d => ev.push({ fecha: d.fecha_vencimiento, tipo: 'vehiculos', titulo: `Vence ${d.tipo} de ${d.vehiculos?.placa || 'un vehículo'}`, detalle: `Vehículos${de(d.empresa_id)}`, href: `/vehiculos?buscar=${encodeURIComponent(d.vehiculos?.placa || '')}` }))
  docsCond.forEach(d => ev.push({ fecha: d.vence, tipo: 'vehiculos', titulo: `Vence ${d.tipo === 'licencia' ? 'la licencia' : 'el carné de manipulación'} de ${d.vendedores?.nombre || 'un conductor'}`, detalle: `Conductores${de(d.empresa_id)}`, href: '/vehiculos' }))
  activos.forEach(a => {
    if (a.garantia_hasta >= desde && a.garantia_hasta <= hasta) ev.push({ fecha: a.garantia_hasta, tipo: 'vehiculos', titulo: `Termina la garantía de ${a.nombre}`, detalle: `Activos fijos${de(a.empresa_id)}`, href: '/vehiculos' })
    if (a.proximo_mantenimiento >= desde && a.proximo_mantenimiento <= hasta) ev.push({ fecha: a.proximo_mantenimiento, tipo: 'vehiculos', titulo: `Mantenimiento de ${a.nombre}`, detalle: `Activos fijos${de(a.empresa_id)}`, href: '/vehiculos' })
  })
  // Fechas propias, con sus repeticiones dentro del rango.
  const rol = usuario?.gerencia ? 'gerencia' : usuario?.rol
  propios.filter(e => e.para === 'todos' || e.para === rol || rol === 'gerencia').forEach(e => {
    const fechas = []
    if (e.repetir === 'no') { if (e.fecha >= desde) fechas.push(e.fecha) }
    else {
      let f = e.fecha
      for (let i = 0; i < 400 && f <= hasta; i++) {
        if (f >= desde) fechas.push(f)
        if (e.repetir === 'semana') f = sumar(f, 7)
        else { const d = new Date(e.fecha + 'T12:00:00'); d.setMonth(d.getMonth() + i + 1); f = d.toLocaleDateString('en-CA') }
      }
    }
    fechas.forEach(f => ev.push({ fecha: f, tipo: 'propios', titulo: e.titulo, detalle: [e.hora ? e.hora.slice(0, 5) : null, e.para === 'gerencia' ? 'Gerencia' : e.para === 'admin' ? 'Administrador' : 'Todos', e.notas, varias ? nombre(e.empresa_id) : null].filter(Boolean).join(' · '), propio: e }))
  })
  return ev.sort((a, b) => a.fecha.localeCompare(b.fecha) || (b.valor || 0) - (a.valor || 0))
}
