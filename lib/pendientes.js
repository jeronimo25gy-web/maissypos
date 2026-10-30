import { supabase } from './supabase'
import { obtenerFechaActual } from './supabase-helpers'
import { estadoDocumento, proximoMasCercano, diasHasta } from './vehiculos-helpers'
import { calcularStockPorSku } from './inventario-helpers'
import { cargarPorPagar } from './por-pagar'
import { cargarLotes, AVISO_DIAS } from './lotes'
import { estadoPlan, nombreItem } from './vehiculos'

// Lo que hay que hacer, en un solo lugar: lo usan el Inicio, la campanita y
// las insignias del menu. Cada pendiente sale de un estado real (un credito
// vencido, una liquidacion por aprobar...) y desaparece solo cuando se
// resuelve; solo los avisos sueltos (alertas_admin) se marcan como vistos.
//
// prioridad: 'alta' | 'hoy' | 'semana'. modulo: id del modulo en el menu.

const fmt = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`
const fechaCorta = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })

// Avisos sueltos que se generan en otras pantallas.
const ALERTAS = {
  descuadre_caja: { prioridad: 'alta', modulo: 'liquidacion', href: '/liquidacion' },
  transferencia_rechazada: { prioridad: 'hoy', modulo: 'transferencias', href: '/transferencias' },
  transferencia_pendiente: { prioridad: 'hoy', modulo: 'transferencias', href: '/transferencias' },
  clave_olvidada: { prioridad: 'hoy', modulo: 'configuracion', href: '/configuracion' },
  descuadre_conteo: { prioridad: 'semana', modulo: 'conteo', href: '/conteo' },
  cambio_precio_compra: { prioridad: 'semana', modulo: 'compras', href: '/compras' },
  gramaje_fuera_de_rango: { prioridad: 'semana', modulo: 'produccion', href: '/produccion' },
  venta_anulada: { prioridad: 'hoy', modulo: 'rutas', href: '/rutas' },
}
const ALERTAS_CUBIERTAS = ['liquidacion_por_aprobar', 'vehiculo_critico', 'vehiculo_novedad'] // ya salen por su estado (despacho, novedad abierta)

const cache = new Map()
export const invalidarPendientes = () => cache.clear()

export async function cargarPendientes(empresaIds, { completo = false } = {}) {
  const clave = empresaIds.join(',') + (completo ? ':c' : '')
  const guardado = cache.get(clave)
  if (guardado && Date.now() - guardado.t < 60000) return guardado.items
  const { data: emps } = await supabase.from('empresas').select('id, nombre, modelos').in('id', empresaIds)
  const varias = empresaIds.length > 1
  const listas = await Promise.all((emps || []).map(e => pendientesDeEmpresa(e, { completo, varias })))
  const orden = { alta: 0, hoy: 1, semana: 2 }
  const items = listas.flat().sort((a, b) => orden[a.prioridad] - orden[b.prioridad])
  cache.set(clave, { t: Date.now(), items })
  return items
}

// { modulo: { cantidad, alta } } para las insignias del menu.
export const resumenPorModulo = (items) => items.reduce((m, it) => {
  const x = (m[it.modulo] = m[it.modulo] || { cantidad: 0, alta: false })
  x.cantidad += it.cantidad || 1
  x.alta = x.alta || it.prioridad === 'alta'
  return m
}, {})

async function pendientesDeEmpresa(empresa, { completo, varias }) {
  const id = empresa.id
  const hoy = obtenerFechaActual()
  const dow = new Date(hoy + 'T12:00:00').getDay()
  const de = varias ? ` · ${empresa.nombre.replace(/ SAS$/i, '')}` : ''
  const distribucion = (empresa.modelos || []).includes('distribucion')
  const [
    { data: porAprobar }, { data: borradores }, { data: vencidos }, { data: transf }, { data: docs }, { data: vehs }, { data: mants },
    { data: alertas }, { data: domis }, { count: cambios }, { data: rutas }, { data: despHoy }, { data: solicitudes },
    { data: ultimoConteo }, { count: divergencias }, porPagar,
  ] = await Promise.all([
    supabase.from('despachos_encab').select('id, fecha, rutas(nombre), vendedores(nombre)').eq('estado', 'por_aprobar').eq('empresa_id', id),
    supabase.from('liquidaciones_borrador').select('despacho_id, diferencia').eq('estado', 'por_aprobar').eq('empresa_id', id),
    supabase.from('cartera_fiados').select('nombre_cliente, saldo, fecha_pago').eq('estado', 'pendiente').lt('fecha_pago', hoy).eq('empresa_id', id).order('fecha_pago'),
    supabase.from('transferencias_ruta').select('valor, fecha_limite, vendedores(nombre)').eq('estado', 'por_verificar').lte('fecha_limite', hoy).eq('empresa_id', id),
    supabase.from('vehiculos_documentos').select('tipo, fecha_vencimiento, vehiculos(placa)').eq('empresa_id', id),
    supabase.from('vehiculos').select('id, placa, kilometraje_actual').eq('empresa_id', id),
    supabase.from('vehiculos_mantenimientos').select('vehiculo_id, tipo, km_proximo, fecha').eq('empresa_id', id),
    supabase.from('alertas_admin').select('id, tipo, mensaje, created_at').eq('leida', false).eq('empresa_id', id).order('created_at', { ascending: false }).limit(30),
    supabase.from('domicilios').select('id, nombre_cliente, tipo, hora_limite, estado').in('estado', ['pendiente']).lte('fecha', hoy).eq('empresa_id', id),
    supabase.from('novedades').select('id', { count: 'exact', head: true }).eq('revisado', false).eq('empresa_id', id),
    supabase.from('rutas').select('id, nombre').eq('estado', true).eq('empresa_id', id),
    supabase.from('despachos_encab').select('ruta_id').eq('fecha', hoy).neq('estado', 'cancelado').eq('empresa_id', id),
    supabase.from('solicitudes_rutero').select('id, clientes(nombre), vendedores(nombre)').eq('estado', 'pendiente').eq('empresa_id', id),
    supabase.from('conteo_fisico').select('fecha').eq('empresa_id', id).order('fecha', { ascending: false }).limit(1),
    supabase.from('divergencias_inventario').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente').eq('empresa_id', id),
    cargarPorPagar([id], hoy).catch(() => []),
  ])
  // Vehículos: plan de mantenimiento, novedades del preoperacional y documentos de conductores.
  const [{ data: planVeh }, { data: novsVeh }, { data: docsCond }] = await Promise.all([
    supabase.from('vehiculos_plan').select('*').eq('empresa_id', id),
    supabase.from('vehiculos_novedades').select('item, detalle, critica, vehiculos(placa, clase)').eq('estado', 'abierta').eq('empresa_id', id),
    supabase.from('conductores_documentos').select('tipo, vence, vendedores(nombre, estado)').eq('empresa_id', id),
  ])
  const items = []
  const add = (it) => items.push({ empresa_id: id, cantidad: 1, ...it })

  // ---- prioridad alta ----
  if (porAprobar?.length) {
    const dif = Object.fromEntries((borradores || []).map(b => [b.despacho_id, Number(b.diferencia || 0)]))
    add({
      clave: `aprobar-${id}`, prioridad: 'alta', modulo: 'liquidacion', href: '/liquidacion', cantidad: porAprobar.length,
      titulo: plural(porAprobar.length, 'liquidación por aprobar', 'liquidaciones por aprobar') + de,
      detalle: porAprobar.map(d => `${d.vendedores?.nombre || d.rutas?.nombre}${dif[d.id] ? ` (diferencia ${dif[d.id] > 0 ? '+' : '−'}${fmt(Math.abs(dif[d.id]))})` : ''}`).join(' · '),
    })
  }
  if (vencidos?.length) {
    const total = vencidos.reduce((s, c) => s + Number(c.saldo || 0), 0)
    add({
      clave: `vencidos-${id}`, prioridad: 'alta', modulo: 'cartera', href: '/cartera', cantidad: vencidos.length,
      titulo: `${plural(vencidos.length, 'crédito vencido', 'créditos vencidos')} · ${fmt(total)}${de}`,
      detalle: `El más viejo: ${vencidos[0].nombre_cliente}, ${fmt(vencidos[0].saldo)} desde el ${fechaCorta(vencidos[0].fecha_pago)}.`,
    })
  }
  const pagosVencidos = porPagar.filter(p => p.diasParaVencer != null && p.diasParaVencer < 0)
  const pagosSemana = porPagar.filter(p => p.diasParaVencer != null && p.diasParaVencer >= 0 && p.diasParaVencer <= 7)
  if (pagosVencidos.length) add({
    clave: `pagos-v-${id}`, prioridad: 'alta', modulo: 'compras', href: '/compras', cantidad: pagosVencidos.length,
    titulo: `${plural(pagosVencidos.length, 'pago a proveedor vencido', 'pagos a proveedores vencidos')} · ${fmt(pagosVencidos.reduce((s, p) => s + p.saldo, 0))}${de}`,
    detalle: pagosVencidos.slice(0, 3).map(p => `${p.nombre} ${fmt(p.saldo)}, venció el ${fechaCorta(p.vence)}`).join(' · '),
  })
  const transfVencidas = (transf || []).filter(t => t.fecha_limite < hoy)
  const transfHoy = (transf || []).filter(t => t.fecha_limite === hoy)
  if (transfVencidas.length) add({
    clave: `transf-v-${id}`, prioridad: 'alta', modulo: 'cartera', href: '/cartera', cantidad: transfVencidas.length,
    titulo: `${plural(transfVencidas.length, 'transferencia sin verificar', 'transferencias sin verificar')} ya vencida${transfVencidas.length > 1 ? 's' : ''}${de}`,
    detalle: `${fmt(transfVencidas.reduce((s, t) => s + Number(t.valor || 0), 0))} · la fecha límite ya pasó; falta decidir si llegó o si se le carga al vendedor.`,
  })
  ;(docs || []).forEach(d => {
    const dias = diasHasta(d.fecha_vencimiento)
    const st = estadoDocumento(d.fecha_vencimiento).status
    if (st === 'vencido' || (st === 'por_vencer' && dias <= 7)) add({
      clave: `doc-${id}-${d.vehiculos?.placa}-${d.tipo}`, prioridad: 'alta', modulo: 'vehiculos', href: '/vehiculos',
      titulo: `${d.tipo} de ${d.vehiculos?.placa || 'un vehículo'} ${dias < 0 ? 'vencido' : dias === 0 ? 'vence hoy' : `vence en ${plural(dias, 'día', 'días')}`}`,
      detalle: `Fecha: ${fechaCorta(d.fecha_vencimiento)}${de}`,
    })
    else if (st === 'por_vencer') add({
      clave: `doc-${id}-${d.vehiculos?.placa}-${d.tipo}`, prioridad: 'semana', modulo: 'vehiculos', href: '/vehiculos',
      titulo: `${d.tipo} de ${d.vehiculos?.placa || 'un vehículo'} vence en ${plural(dias, 'día', 'días')}`, detalle: `Fecha: ${fechaCorta(d.fecha_vencimiento)}${de}`,
    })
  })

  // ---- para hoy ----
  if (domis?.length) add({
    clave: `domis-${id}`, prioridad: 'hoy', modulo: 'domicilios', href: '/domicilios', cantidad: domis.length,
    titulo: plural(domis.length, 'domicilio por entregar', 'domicilios por entregar') + de,
    detalle: domis.slice(0, 3).map(d => `${d.nombre_cliente}${d.hora_limite ? ` antes de ${d.hora_limite.slice(0, 5)}` : ''}${d.tipo === 'express' ? ' (express)' : ''}`).join(' · '),
  })
  if (cambios) add({
    clave: `cambios-${id}`, prioridad: 'hoy', modulo: 'cambios', href: '/cambios', cantidad: cambios,
    titulo: plural(cambios, 'cambio sin clasificar', 'cambios sin clasificar') + de, detalle: 'Reportados en ruta o en la liquidación, esperando revisión.',
  })
  if (transfHoy.length) add({
    clave: `transf-h-${id}`, prioridad: 'hoy', modulo: 'cartera', href: '/cartera', cantidad: transfHoy.length,
    titulo: `${plural(transfHoy.length, 'transferencia por verificar', 'transferencias por verificar')} · ${fmt(transfHoy.reduce((s, t) => s + Number(t.valor || 0), 0))}${de}`,
    detalle: 'La fecha límite es hoy.',
  })
  if (dow !== 0 && rutas?.length) {
    const conDespacho = new Set((despHoy || []).map(d => d.ruta_id))
    const sin = rutas.filter(r => !conDespacho.has(r.id))
    if (sin.length) add({
      clave: `sindespacho-${id}`, prioridad: 'hoy', modulo: 'despacho', href: '/despacho', cantidad: sin.length,
      titulo: plural(sin.length, 'ruta sin despachar hoy', 'rutas sin despachar hoy') + de, detalle: sin.map(r => r.nombre).join(' · '),
    })
  }
  if (solicitudes?.length) add({
    clave: `sacar-${id}`, prioridad: 'hoy', modulo: 'rutas', href: '/rutas', cantidad: solicitudes.length,
    titulo: `${plural(solicitudes.length, 'pedido', 'pedidos')} de sacar clientes del rutero${de}`,
    detalle: solicitudes.slice(0, 3).map(s => `${s.clientes?.nombre} (lo pide ${s.vendedores?.nombre || 'el vendedor'})`).join(' · '),
  })

  // ---- esta semana ----
  if (distribucion) {
    const ultimo = ultimoConteo?.[0]?.fecha
    const dias = ultimo ? Math.round((new Date(hoy + 'T12:00:00') - new Date(ultimo + 'T12:00:00')) / 864e5) : null
    if (dias === null || dias > 7 || (dow === 1 && dias > 0)) add({
      clave: `conteo-${id}`, prioridad: dow === 1 ? 'hoy' : 'semana', modulo: 'conteo', href: '/conteo',
      titulo: dow === 1 ? `Conteo de bodega programado para hoy${de}` : `Conteo de bodega pendiente${de}`,
      detalle: ultimo ? `Último conteo: ${fechaCorta(ultimo)} (hace ${plural(dias, 'día', 'días')}).` : 'Todavía no hay conteo.',
    })
  }
  // Arepas: lotes de produccion que vencen manana o ya vencieron (si el producto tiene vida util).
  const conVida = (empresa.modelos || []).includes('produccion')
    ? (await supabase.from('productos').select('sku, nombre').not('dias_vida_util', 'is', null).eq('empresa_id', id)).data || [] : []
  if (conVida.length) {
    const lotes = await cargarLotes({ empresaId: id }).catch(() => ({}))
    const nombres = Object.fromEntries(conVida.map(p => [p.sku, p.nombre]))
    const porVencer = Object.entries(lotes).flatMap(([sku, ls]) => ls.filter(l => l.diasParaVencer != null && l.diasParaVencer <= AVISO_DIAS).map(l => ({ sku, ...l })))
    if (porVencer.length) add({
      clave: `lotes-${id}`, prioridad: porVencer.some(l => l.diasParaVencer <= 1) ? 'alta' : 'hoy', modulo: 'despacho', href: '/despacho', cantidad: porVencer.length,
      titulo: `${plural(porVencer.length, 'lote de arepas vence', 'lotes de arepas vencen')} en ${AVISO_DIAS} días o menos${de}`,
      detalle: porVencer.slice(0, 3).map(l => `${l.cantidad} ${nombres[l.sku] || l.sku} del ${fechaCorta(l.fecha)} (${l.diasParaVencer < 0 ? 'vencido' : l.diasParaVencer === 0 ? 'vence hoy' : `vence en ${plural(l.diasParaVencer, 'día', 'días')}`})`).join(' · ') + '. Despáchalos primero a rutas o mostrador.',
    })
  }
  if (pagosSemana.length) add({
    clave: `pagos-s-${id}`, prioridad: pagosSemana.some(p => p.diasParaVencer === 0) ? 'hoy' : 'semana', modulo: 'compras', href: '/compras', cantidad: pagosSemana.length,
    titulo: `${plural(pagosSemana.length, 'pago a proveedor vence', 'pagos a proveedores vencen')} esta semana · ${fmt(pagosSemana.reduce((s, p) => s + p.saldo, 0))}${de}`,
    detalle: pagosSemana.slice(0, 3).map(p => `${p.nombre} ${fmt(p.saldo)}, ${p.diasParaVencer === 0 ? 'hoy' : 'el ' + fechaCorta(p.vence)}`).join(' · '),
  })
  // Cambios que el proveedor no ha repuesto en mas de 7 dias.
  const hace7 = new Date(new Date(hoy + 'T12:00:00').getTime() - 7 * 864e5).toLocaleDateString('en-CA')
  const { data: sinReponer } = await supabase.from('novedades').select('cantidad, fecha, proveedores(nombre)').eq('pendiente_reponer', true).is('repuesto_at', null).lt('fecha', hace7).eq('empresa_id', id)
  if (sinReponer?.length) {
    const provs = [...new Set(sinReponer.map(n => n.proveedores?.nombre).filter(Boolean))]
    add({
      clave: `reponer-${id}`, prioridad: 'semana', modulo: 'cambios', href: '/cambios', cantidad: sinReponer.length,
      titulo: `${plural(sinReponer.reduce((s, n) => s + Number(n.cantidad || 0), 0), 'unidad', 'unidades')} sin reponer hace más de 7 días${de}`,
      detalle: `${provs.join(', ') || 'Proveedores'}: márcalas como repuestas o pásalas a pérdida.`,
    })
  }
  if (divergencias) add({
    clave: `ajustes-${id}`, prioridad: 'semana', modulo: 'ajustes-inventario', href: '/ajustes-inventario', cantidad: divergencias,
    titulo: plural(divergencias, 'ajuste de inventario por aprobar', 'ajustes de inventario por aprobar') + de, detalle: 'Diferencias del conteo esperando revisión.',
  })
  const mantsPor = {}
  ;(mants || []).forEach(m => { (mantsPor[m.vehiculo_id] = mantsPor[m.vehiculo_id] || []).push(m) })
  ;(vehs || []).forEach(v => {
    const plan = (planVeh || []).filter(p => p.vehiculo_id === v.id)
    if (plan.length) {
      // Con plan: cada mantenimiento por kilometraje o por tiempo.
      estadoPlan(plan, mantsPor[v.id] || [], v.kilometraje_actual, hoy).filter(p => p.estado === 'vencido' || p.estado === 'pronto').forEach(p => add({
        clave: `mant-${id}-${v.id}-${p.id}`, prioridad: p.estado === 'vencido' ? 'hoy' : 'semana', modulo: 'vehiculos', href: '/vehiculos',
        titulo: p.estado === 'vencido' ? `${p.tipo} de ${v.placa}: ya se cumplió` : `${p.tipo} de ${v.placa} ${p.faltaKm != null ? `en ${Math.round(p.faltaKm).toLocaleString('es-CO')} km` : `en ${plural(p.faltaDias, 'día', 'días')}`}`,
        detalle: `Va en ${Number(v.kilometraje_actual || 0).toLocaleString('es-CO')} km${de}`,
      }))
      return
    }
    const p = proximoMasCercano(mantsPor[v.id] || [], v.kilometraje_actual)
    if (p && p.restante <= 1000) add({
      clave: `mant-${id}-${v.id}`, prioridad: p.restante <= 0 ? 'hoy' : 'semana', modulo: 'vehiculos', href: '/vehiculos',
      titulo: p.restante <= 0 ? `${p.tipo} de ${v.placa}: ya se cumplió` : `${p.tipo} de ${v.placa} en ${Math.round(p.restante).toLocaleString('es-CO')} km`,
      detalle: `Va en ${Number(v.kilometraje_actual || 0).toLocaleString('es-CO')} km${de}`,
    })
  })
  ;(novsVeh || []).forEach((n, i) => add({
    clave: `novveh-${id}-${i}-${n.vehiculos?.placa}-${n.item}`, prioridad: n.critica ? 'alta' : 'semana', modulo: 'vehiculos', href: '/vehiculos',
    titulo: `Novedad en ${n.vehiculos?.placa || 'un vehículo'}: ${nombreItem(n.vehiculos?.clase, n.item).toLowerCase()}`, detalle: `${n.detalle || ''}${de}`,
  }))
  ;(docsCond || []).filter(d => d.vence && d.vendedores?.estado !== false).forEach(d => {
    const dias = diasHasta(d.vence)
    if (dias > 60) return
    const nombre = d.tipo === 'licencia' ? 'Licencia de conducción' : 'Carné de manipulación'
    add({
      clave: `cond-${id}-${d.vendedores?.nombre}-${d.tipo}`, prioridad: dias <= 7 ? 'alta' : 'semana', modulo: 'vehiculos', href: '/vehiculos',
      titulo: `${nombre} de ${d.vendedores?.nombre || 'un conductor'} ${dias < 0 ? 'vencida' : dias === 0 ? 'vence hoy' : `vence en ${plural(dias, 'día', 'días')}`}`,
      detalle: `Fecha: ${fechaCorta(d.vence)}${de}`,
    })
  })
  if (completo) {
    const { data: prods } = await supabase.from('productos').select('sku, nombre, stock_minimo').eq('estado', true).gt('stock_minimo', 0).eq('empresa_id', id)
    if (prods?.length) {
      const stock = await calcularStockPorSku({ empresaId: id }).catch(() => ({}))
      const bajos = prods.filter(p => stock[p.sku] && stock[p.sku].stockActual < p.stock_minimo)
      if (bajos.length) add({
        clave: `stock-${id}`, prioridad: 'semana', modulo: 'inventario', href: '/inventario', cantidad: bajos.length,
        titulo: `${plural(bajos.length, 'producto', 'productos')} por debajo del mínimo${de}`,
        detalle: bajos.slice(0, 3).map(p => `${p.nombre}: ${Math.round(stock[p.sku].stockActual)} de ${p.stock_minimo}`).join(' · '),
      })
    }
  }

  // ---- avisos sueltos ----
  ;(alertas || []).filter(a => !ALERTAS_CUBIERTAS.includes(a.tipo)).forEach(a => {
    const meta = ALERTAS[a.tipo] || { prioridad: 'hoy', modulo: 'ejecutivo', href: '/ejecutivo' }
    add({ clave: `alerta-${a.id}`, alertaId: a.id, prioridad: meta.prioridad, modulo: meta.modulo, href: meta.href, titulo: a.mensaje, detalle: new Date(a.created_at).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) + de })
  })
  return items
}

export async function marcarAlertaVista(alertaId) {
  await supabase.from('alertas_admin').update({ leida: true }).eq('id', alertaId)
  invalidarPendientes()
}
