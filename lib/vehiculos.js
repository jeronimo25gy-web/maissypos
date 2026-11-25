'use client'
import { supabase } from './supabase'
import { paginado } from './paginar'

// Vehículos y activos: preoperacional diario, plan de mantenimiento,
// combustible, costo por kilómetro, documentos de conductores y depreciación.

// Preoperacional: todo viene "Bien" y el conductor solo marca lo que tiene
// novedad. Frenos, llantas y luces son críticos: avisan antes de salir.
export const CHECKLIST = {
  carro: [
    ['luces', 'Luces, direccionales y stops', true], ['pito', 'Pito'], ['frenos', 'Frenos y freno de parqueo', true], ['llantas', 'Llantas', true],
    ['fugas', 'Sin fugas de aceite, combustible o agua'], ['niveles', 'Niveles de aceite y refrigerante'], ['carroceria', 'Carrocería, vidrios, espejos y plumillas'],
    ['cinturones', 'Cinturones de seguridad'], ['seguridad', 'Kit de carretera, herramientas y extintor'], ['higiene', 'Limpieza, desinfección y sin plagas'],
  ],
  moto: [
    ['luces', 'Luces, direccionales y stop', true], ['pito', 'Pito'], ['frenos', 'Frenos', true], ['llantas', 'Llantas', true],
    ['cadena', 'Cadena y kit de arrastre'], ['fugas', 'Sin fugas de aceite o combustible'], ['espejos', 'Espejos'],
    ['casco', 'Casco y chaleco'], ['higiene', 'Caja de carga limpia y sin plagas'],
  ],
}
export const nombreItem = (clase, k) => (CHECKLIST[clase] || CHECKLIST.carro).find(x => x[0] === k)?.[1] || k
export const esCritico = (clase, k) => !!(CHECKLIST[clase] || CHECKLIST.carro).find(x => x[0] === k)?.[2]

export const PLAN_BASE = {
  carro: [['Cambio de aceite y filtro', 5000, null], ['Filtro de aire', 10000, null], ['Pastillas de freno', 20000, null], ['Llantas', 40000, null], ['Alineación y balanceo', null, 6]],
  moto: [['Cambio de aceite', 3000, null], ['Kit de arrastre', 15000, null], ['Pastillas de freno', 10000, null], ['Llantas', 15000, null]],
}
export const DOCUMENTOS_VEHICULO = ['SOAT', 'Tecnomecánica', 'Seguro todo riesgo', 'Matrícula', 'Control de plagas']

const dias = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5)
const sumarMeses = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setMonth(d.getMonth() + Number(n)); return d.toLocaleDateString('en-CA') }
const normal = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Estado de cada mantenimiento del plan: el último hecho (por nombre) y cuánto falta.
export function estadoPlan(plan, mantenimientos, kmActual, hoy) {
  return plan.map(p => {
    const clave = normal(p.tipo).split(' ').slice(0, 2).join(' ')
    const ultimo = mantenimientos.filter(m => m.plan_id === p.id || normal(m.tipo).includes(clave)).sort((a, b) => b.fecha.localeCompare(a.fecha))[0] || null
    const kmProx = p.cada_km && ultimo?.km_realizado != null ? Number(ultimo.km_realizado) + Number(p.cada_km) : null
    const fechaProx = p.cada_meses && ultimo ? sumarMeses(ultimo.fecha, p.cada_meses) : null
    const faltaKm = kmProx != null ? kmProx - Number(kmActual || 0) : null
    const faltaDias = fechaProx ? dias(hoy, fechaProx) : null
    const vencido = (faltaKm != null && faltaKm <= 0) || (faltaDias != null && faltaDias <= 0)
    const pronto = !vencido && ((faltaKm != null && faltaKm <= Math.max(300, Number(p.cada_km) * 0.1)) || (faltaDias != null && faltaDias <= 15))
    return { ...p, ultimo, kmProx, fechaProx, faltaKm, faltaDias, estado: !ultimo ? 'sin_registro' : vencido ? 'vencido' : pronto ? 'pronto' : 'al_dia' }
  })
}

// Kilómetros por día desde los preoperacionales (diferencia con el siguiente registro).
export function kmPorDia(preops) {
  const orden = [...preops].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const out = {}
  orden.forEach((p, i) => { const sig = orden[i + 1]; if (sig) out[p.fecha] = Math.max(0, Number(sig.km) - Number(p.km)) })
  return out
}

// Rendimiento entre tanqueos de tanque lleno: km recorridos ÷ galones cargados.
export function rendimiento(tanqueos) {
  const llenos = [...tanqueos].filter(t => t.km != null && Number(t.galones) > 0).sort((a, b) => Number(a.km) - Number(b.km))
  const tramos = []
  for (let i = 1; i < llenos.length; i++) {
    if (!llenos[i].tanque_lleno || !llenos[i - 1].tanque_lleno) continue
    const km = Number(llenos[i].km) - Number(llenos[i - 1].km)
    if (km > 0) tramos.push({ km, galones: Number(llenos[i].galones), dias: dias(llenos[i - 1].fecha, llenos[i].fecha) })
  }
  const ult = tramos.slice(-3)
  if (!ult.length) return null
  const km = ult.reduce((s, t) => s + t.km, 0), gal = ult.reduce((s, t) => s + t.galones, 0)
  return { kmPorGalon: km / gal, kmEntreTanqueos: km / ult.length, diasEntreTanqueos: ult.reduce((s, t) => s + t.dias, 0) / ult.length }
}

// Valor actual estimado: depreciación en línea recta (referencia de gestión).
export function valorActual(valor, fechaCompra, vidaAnios, hoy) {
  if (!Number(valor) || !fechaCompra || !Number(vidaAnios)) return null
  const meses = Math.max(0, dias(fechaCompra, hoy) / 30.4)
  return Math.max(0, Number(valor) * (1 - meses / (Number(vidaAnios) * 12)))
}

export const estadoVence = (fecha, hoy, aviso = 30) => {
  if (!fecha) return { tono: 'gris', texto: 'Sin fecha', dias: null }
  const d = dias(hoy, fecha)
  return d < 0 ? { tono: 'rojo', texto: `Vencido hace ${-d} ${-d === 1 ? 'día' : 'días'}`, dias: d }
    : d <= aviso ? { tono: 'ambar', texto: d === 0 ? 'Vence hoy' : `Vence en ${d} ${d === 1 ? 'día' : 'días'}`, dias: d }
    : { tono: 'verde', texto: 'Vigente', dias: d }
}

// Vehículo que maneja un vendedor: el asignado como conductor o el de su ruta.
export async function vehiculoDeVendedor(empresaId, vendedor) {
  const { data } = await supabase.from('vehiculos').select('*').eq('empresa_id', empresaId).neq('estado', 'inactivo')
  const lista = data || []
  return lista.find(v => v.conductor_id === vendedor.id) || (vendedor.ruta_id && lista.find(v => v.ruta_id === vendedor.ruta_id)) || null
}

// Clase de un gasto de carro que no es gasolina, para "Lo invertido".
export const claseGastoCarro = (g) => {
  const t = `${g.descripcion || ''} ${g.categoria || ''}`
  if (/seguro|soat|tecnomec|impuesto|matr[ií]cula|revisi[oó]n t|licencia de tr/i.test(t)) return 'documentos'
  if (/manten|llanta|lavad|repuest|taller|aceite|freno|bater[ií]a|calibr|arregl|latoner|pintur|el[eé]ctric|filtro|luces|embrague|suspensi|motor/i.test(t)) return 'mantenimiento'
  return 'otros'
}
export const TIPOS_ARREGLO = [['preventivo', 'Preventivo'], ['correctivo', 'Correctivo'], ['llantas', 'Llantas'], ['electrico', 'Eléctrico'], ['latoneria', 'Latonería y pintura'], ['lavada', 'Lavada'], ['otro', 'Otro']]
// Lo que le falta a un arreglo para quedar completo: taller y factura.
export const faltaEnArreglo = (a) => {
  const taller = !!(a.taller_id || a.tallerNombre || a.taller)
  const factura = !!((a.facturas && a.facturas.length) || a.factura_url || a.soporte_url)
  return !taller && !factura ? 'Falta taller y factura' : !taller ? 'Falta taller' : !factura ? 'Falta factura' : null
}

// Todo lo de la flota de una empresa para el módulo Vehículos y activos.
export async function cargarFlota(empresaId, hoy) {
  const mes = hoy.slice(0, 7)
  const hace = (n) => { const d = new Date(hoy + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA') }
  const r = await Promise.all([
    supabase.from('vehiculos').select('*').eq('empresa_id', empresaId).order('placa'),
    supabase.from('vehiculos_documentos').select('*').eq('empresa_id', empresaId).order('fecha_vencimiento'),
    supabase.from('vehiculos_mantenimientos').select('*').eq('empresa_id', empresaId).order('fecha', { ascending: false }),
    supabase.from('vehiculos_plan').select('*').eq('empresa_id', empresaId).order('created_at'),
    supabase.from('vehiculos_preoperacional').select('*').eq('empresa_id', empresaId).gte('fecha', hace(75)).order('fecha'),
    paginado(() => supabase.from('vehiculos_tanqueos').select('*').eq('empresa_id', empresaId).order('fecha')),
    supabase.from('vehiculos_entregas').select('*').eq('empresa_id', empresaId).order('fecha', { ascending: false }),
    supabase.from('vehiculos_novedades').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(200),
    supabase.from('vendedores').select('id, nombre, ruta_id, estado, telefono').eq('empresa_id', empresaId).order('nombre'),
    supabase.from('rutas').select('id, nombre').eq('empresa_id', empresaId).eq('estado', true).order('nombre'),
    supabase.from('conductores_documentos').select('*').eq('empresa_id', empresaId),
    paginado(() => supabase.from('bodega_movimientos').select('vehiculo_id, cantidad, fecha, bodega_items(nombre, valor_unitario)').not('vehiculo_id', 'is', null)),
    supabase.from('vehiculos_fotos').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
    // Gasolina anotada en las liquidaciones y cargada a un carro (la de los
    // tanqueos de Mi ruta ya está en vehiculos_tanqueos).
    paginado(() => supabase.from('liquidaciones_gastos').select('id, vehiculo_id, fecha, valor, concepto, categoria, de_empresa, despachos_encab(rutas(nombre))').eq('empresa_id', empresaId).not('vehiculo_id', 'is', null).is('tanqueo_id', null)),
    // Gastos de la oficina cargados a un carro (gasolina dada antes de salir, seguro, parqueadero).
    paginado(() => supabase.from('gastos_admin').select('id, vehiculo_id, fecha, valor, descripcion, categoria, soporte_url').eq('empresa_id', empresaId).eq('anulado', false).not('vehiculo_id', 'is', null)),
    supabase.from('vehiculos_talleres').select('*').eq('empresa_id', empresaId).order('nombre'),
  ])
  const err = r.find(x => x.error)
  if (err) throw new Error(err.error.message)
  const [vehs, docs, mantsCrudos, plan, preops, tanqueosRegistrados, entregas, novedades, vends, rutas, docsCond, repuestos, fotos, gasolinaLiq, gastosCarro, talleres] = r.map(x => x.data || [])
  const mants = mantsCrudos.map(m => ({ ...m, tallerNombre: talleres.find(t => t.id === m.taller_id)?.nombre || m.taller || null }))
  const esGasolina = (g) => /gasolin|combustib|tanque/i.test(`${g.descripcion || ''} ${g.categoria || ''}`)
  const gasolinaOficina = gastosCarro.filter(esGasolina).map(g => ({ vehiculo_id: g.vehiculo_id, fecha: g.fecha, valor: g.valor, origen: 'Pagado desde la oficina' }))
  // De la liquidación, lo que no es gasolina (calcomanías, lavada) va con los otros gastos del carro.
  const liqConDescripcion = gasolinaLiq.map(g => ({ ...g, descripcion: g.concepto, origen: 'liquidacion', rutaPago: g.despachos_encab?.rutas?.nombre || null }))
  const otrosGastosCarro = [...gastosCarro.filter(g => !esGasolina(g)).map(g => ({ ...g, origen: 'gastos' })), ...liqConDescripcion.filter(g => !esGasolina(g))]
  // Se suma la gasolina de las liquidaciones como tanqueo sin galones ni km,
  // salvo que ya exista el mismo tanqueo (mismo carro, día y valor).
  const extra = []
  ;[...liqConDescripcion.filter(esGasolina).map(g => ({ ...g, origen: 'Anotado en la liquidación' })), ...gasolinaOficina].forEach((g, i) => {
    const igual = (t) => t.vehiculo_id === g.vehiculo_id && t.fecha === g.fecha && Math.abs(Number(t.valor) - Number(g.valor)) < 1
    if (tanqueosRegistrados.some(igual) || extra.some(igual)) return
    extra.push({ id: `extra${i}`, vehiculo_id: g.vehiculo_id, fecha: g.fecha, valor: g.valor, km: null, galones: null, tanque_lleno: false, registrado_por: g.origen, deLiquidacion: true })
  })
  const tanqueos = [...tanqueosRegistrados, ...extra]
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
  const vehiculos = vehs.map(v => {
    const suyos = (l) => l.filter(x => x.vehiculo_id === v.id)
    const p = suyos(preops), t = suyos(tanqueos), m = suyos(mants)
    const kmDia = kmPorDia(p)
    const kmMes = Object.entries(kmDia).filter(([f]) => f.startsWith(mes)).reduce((s, [, k]) => s + k, 0)
    const combustible = t.filter(x => x.fecha.startsWith(mes)).reduce((s, x) => s + Number(x.valor || 0), 0)
    const mantMes = m.filter(x => x.fecha.startsWith(mes)).reduce((s, x) => s + Number(x.costo || 0), 0)
    const rep = repuestos.filter(x => x.vehiculo_id === v.id).reduce((s, x) => s + Number(x.cantidad || 0) * Number(x.bodega_items?.valor_unitario || 0), 0)
    // Los mantenimientos pagados desde Gastos ya quedan en el historial del carro: no se suman otra vez.
    const otrosMes = otrosGastosCarro.filter(x => x.vehiculo_id === v.id && String(x.fecha).startsWith(mes)
      && !m.some(y => y.fecha === x.fecha && Math.abs(Number(y.costo) - Number(x.valor)) < 1)).reduce((s, x) => s + Number(x.valor || 0), 0)
    const costoMes = combustible + mantMes + otrosMes + rep
    // Lo invertido en el carro: este mes, este año y desde que se tiene, por tipo.
    // Los gastos de la liquidación o de Gastos que ya están en un arreglo (enlazados
    // o con la misma fecha y valor) no se cuentan dos veces.
    const yaEnArreglo = (g) => m.some(y => (g.origen === 'gastos' ? y.gasto_admin_id === g.id : y.liq_gasto_id === g.id) || (y.fecha === g.fecha && Math.abs(Number(y.costo) - Number(g.valor)) < 1))
    const otrosSuyos = otrosGastosCarro.filter(x => x.vehiculo_id === v.id && !yaEnArreglo(x)).map(x => ({ ...x, clase: claseGastoCarro(x) }))
    const anio = hoy.slice(0, 4)
    const sumar = (pref) => {
      const en = (f) => String(f || '').startsWith(pref)
      const o = {
        combustible: t.filter(x => en(x.fecha)).reduce((s, x) => s + Number(x.valor || 0), 0),
        mantenimiento: m.filter(x => en(x.fecha)).reduce((s, x) => s + Number(x.costo || 0), 0) + otrosSuyos.filter(x => x.clase === 'mantenimiento' && en(x.fecha)).reduce((s, x) => s + Number(x.valor || 0), 0),
        documentos: otrosSuyos.filter(x => x.clase === 'documentos' && en(x.fecha)).reduce((s, x) => s + Number(x.valor || 0), 0),
        otros: otrosSuyos.filter(x => x.clase === 'otros' && en(x.fecha)).reduce((s, x) => s + Number(x.valor || 0), 0),
        repuestos: repuestos.filter(x => x.vehiculo_id === v.id && en(x.fecha)).reduce((s, x) => s + Number(x.cantidad || 0) * Number(x.bodega_items?.valor_unitario || 0), 0),
      }
      return { ...o, total: o.combustible + o.mantenimiento + o.documentos + o.otros + o.repuestos }
    }
    const porAnio = {}
    ;[...t, ...m, ...otrosSuyos].forEach(x => { const a = String(x.fecha || '').slice(0, 4); if (a) porAnio[a] = true })
    const inversion = { mes: sumar(mes), anio: sumar(anio), total: sumar(''), anios: Object.fromEntries(Object.keys(porAnio).map(a => [a, sumar(a)])) }
    // Arreglos: los registrados en el carro y los de mantenimiento pagados en una
    // liquidación o en Gastos que todavía no se han completado aquí.
    const arreglos = [
      ...m.map(x => ({ ...x, clave: 'm' + x.id, valor: Number(x.costo || 0), origen: x.gasto_admin_id ? 'gastos' : x.liq_gasto_id ? 'liquidacion' : 'vehiculos', registrado: true })),
      ...otrosSuyos.filter(x => x.clase === 'mantenimiento').map(x => ({ clave: (x.origen === 'gastos' ? 'g' : 'l') + x.id, gastoId: x.id, origen: x.origen, fecha: x.fecha, tipo: x.descripcion || x.categoria, valor: Number(x.valor || 0), rutaPago: x.rutaPago, de_empresa: x.de_empresa, soporte_url: x.soporte_url, registrado: false })),
    ].map(x => ({ ...x, falta: faltaEnArreglo(x) })).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
    return {
      ...v, documentos: suyos(docs), mantenimientos: m, plan: estadoPlan(suyos(plan), m, v.kilometraje_actual, hoy), preops: p, kmDia, kmMes,
      tanqueos: t, rendimiento: rendimiento(t), inversion, arreglos, entregas: suyos(entregas), novedades: suyos(novedades), fotos: suyos(fotos),
      costo: { combustible, mantenimiento: mantMes + otrosMes, repuestos: rep, total: costoMes, porKm: kmMes > 0 ? costoMes / kmMes : null },
      conductor: vends.find(x => x.id === v.conductor_id) || null, ruta: rutas.find(x => x.id === v.ruta_id) || null,
      preopHoy: p.find(x => x.fecha === hoy) || null, valorActual: valorActual(v.valor_compra, v.fecha_compra, v.vida_util_anios, hoy),
    }
  })
  return { vehiculos, vendedores: vends, rutas, docsCond, talleres }
}

// Lo que requiere atención: documentos, licencias, mantenimientos, novedades
// abiertas y preoperacional pendiente de hoy.
export function atencion(flota, hoy) {
  const out = []
  flota.vehiculos.filter(v => v.estado !== 'inactivo').forEach(v => {
    v.documentos.forEach(d => { const e = estadoVence(d.fecha_vencimiento, hoy); if (e.tono === 'rojo' || e.tono === 'ambar') out.push({ tono: e.tono, titulo: `${d.tipo} de ${v.placa}: ${e.texto.toLowerCase()}`, detalle: v.conductor?.nombre || '', vehiculo: v.id, orden: e.dias }) })
    v.plan.filter(p => p.estado === 'vencido' || p.estado === 'pronto').forEach(p => out.push({ tono: p.estado === 'vencido' ? 'rojo' : 'ambar', titulo: `${p.tipo} de ${v.placa}${p.estado === 'vencido' ? ': ya se cumplió' : ''}`, detalle: p.faltaKm != null ? (p.faltaKm > 0 ? `Faltan ${Math.round(p.faltaKm).toLocaleString('es-CO')} km` : `Pasado por ${Math.round(-p.faltaKm).toLocaleString('es-CO')} km`) : p.faltaDias != null ? `Faltan ${p.faltaDias} días` : '', vehiculo: v.id, orden: p.estado === 'vencido' ? -1 : 5 }))
    v.novedades.filter(n => n.estado === 'abierta').forEach(n => out.push({ tono: n.critica ? 'rojo' : 'ambar', titulo: `Novedad en ${v.placa}: ${nombreItem(v.clase, n.item).toLowerCase()}`, detalle: `${n.detalle} · ${n.reportada_por || ''}`, vehiculo: v.id, orden: n.critica ? -2 : 3 }))
  })
  flota.docsCond.forEach(d => {
    const e = estadoVence(d.vence, hoy, 60)
    const vend = flota.vendedores.find(x => x.id === d.vendedor_id)
    if (vend?.estado !== false && (e.tono === 'rojo' || e.tono === 'ambar')) out.push({ tono: e.tono, titulo: `${d.tipo === 'licencia' ? 'Licencia' : 'Carné de manipulación'} de ${vend?.nombre || 'un conductor'}: ${e.texto.toLowerCase()}`, detalle: d.categoria ? `Categoría ${d.categoria}` : '', conductor: d.vendedor_id, orden: e.dias })
  })
  return out.sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99))
}
