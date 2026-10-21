'use client'
import { supabase } from './supabase'
import { getEmpresaId } from './empresa'
import { obtenerFechaActual } from './supabase-helpers'
import { cargarParametros, costoLaboral } from './nomina'

// Costos de Arepas desde una sola base: lo que cuesta un bulto de maíz hecho
// arepa ÷ las Telas que rinde = costo de la masa de una Tela blanca (537,5 g).
// Cada referencia cuesta esa masa por su peso + su bolsa. Lo que no está
// registrado o medido queda null ("sin dato") y el costo sale incompleto.

const cuenta = (l) => l.reduce((m, v) => (m[v] = (m[v] || 0) + 1, m), {})
const moda = (l) => { const c = cuenta(l); return Object.entries(c).sort((a, b) => b[1] - a[1])[0] }
export const esBaseTela = (p) => /tela/i.test(p?.nombre || '') && !/mini|amarill/i.test(p?.nombre || '')

export async function cargarCostos(mes, empresaId = getEmpresaId()) {
  const [y, m] = mes.split('-').map(Number)
  const desde = `${mes}-01`, hasta = `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
  const hace30 = new Date(Date.now() - 30 * 86400000).toISOString()
  const q = await Promise.all([
    supabase.from('productos').select('id, sku, nombre, presentacion, precio_venta, costo_compra, peso_estandar_g, tipo, consumo_por_cochada, estado').eq('empresa_id', empresaId),
    supabase.from('formulas').select('id, producto_id, rendimiento, formulas_detalle(materia_prima_id, cantidad)').eq('empresa_id', empresaId).eq('activo', true),
    supabase.from('produccion_estandares').select('*').eq('empresa_id', empresaId),
    supabase.from('empleados').select('salario_base, riesgo_arl').eq('empresa_id', empresaId).eq('activo', true).eq('es_mano_obra_directa', true),
    supabase.from('gastos_admin').select('categoria, valor').eq('empresa_id', empresaId).eq('anulado', false).gte('fecha', desde).lte('fecha', hasta),
    supabase.from('categorias_gasto').select('nombre, tipo_costo').eq('empresa_id', empresaId).eq('tipo', 'admin'),
    supabase.from('produccion_cochadas').select('materia_prima_id, cantidad, fecha').eq('empresa_id', empresaId).eq('anulada', false).gte('fecha', desde).lte('fecha', hasta),
    supabase.from('clientes_precios').select('sku, precio_especial').eq('empresa_id', empresaId),
    supabase.from('rutas_precios').select('sku, precio_especial, rutas(nombre)').eq('empresa_id', empresaId),
    supabase.from('produccion_cochadas').select('id, cantidad').eq('empresa_id', empresaId).eq('anulada', false).gte('hora_montada', hace30),
  ])
  const err = q.find(r => r.error)
  if (err) throw new Error(err.error.message)
  const parametros = await cargarParametros(empresaId)
  const [{ data: productos }, { data: formulas }, { data: estandares }, { data: emps }, { data: gastos }, { data: cats }, { data: cochMes }, { data: cp }, { data: rp }, { data: coch30 }] = q

  const est = (clave, productoId = null) => (estandares || []).find(s => s.clave === clave && (s.producto_id || null) === productoId && !s.tanque_id)
  const val = (clave, productoId) => { const s = est(clave, productoId); return s ? Number(s.valor) : null }
  const maices = (productos || []).filter(p => p.consumo_por_cochada)
  const conFormula = new Set((formulas || []).map(f => f.producto_id))
  const refs = (productos || []).filter(p => p.tipo === 'terminado' && p.estado !== false && conFormula.has(p.id)).sort((a, b) => a.sku.localeCompare(b.sku))
  const tela = refs.find(esBaseTela)
  const pesoTela = Number(tela?.peso_estandar_g) || null
  const maizDe = (prodId) => {
    const f = (formulas || []).find(x => x.producto_id === prodId)
    const d = (f?.formulas_detalle || []).find(x => maices.some(m => m.id === x.materia_prima_id))
    return d ? { maizId: d.materia_prima_id, porPaquete: Number(d.cantidad) / (f.rendimiento || 1) } : null
  }

  // Último precio del bulto en Compras, por maíz.
  const { data: compras } = maices.length
    ? await supabase.from('compras').select('sku, precio_unitario, fecha').eq('empresa_id', empresaId).in('sku', maices.map(x => x.sku)).gt('precio_unitario', 0).order('fecha', { ascending: false }).limit(40)
    : { data: [] }

  // Aceite: recargas del atomizador en los lotes de los últimos 30 días.
  let aceiteBulto = null
  const atomizador = val('atomizador_ml'), precioAceite = val('precio_aceite_l')
  if (atomizador && precioAceite && coch30?.length) {
    const { data: recargas } = await supabase.from('produccion_muestras_peso').select('id').eq('tipo', 'aceite').eq('anulado', false).in('cochada_id', coch30.map(c => c.id))
    const bultos30 = coch30.reduce((s, c) => s + Number(c.cantidad), 0)
    if (recargas?.length && bultos30) aceiteBulto = recargas.length * atomizador / 1000 * precioAceite / bultos30
  }

  // Mano de obra y gastos de planta del mes ÷ bultos puestos en el mes.
  const hoy = obtenerFechaActual()
  const diasMes = new Date(y, m, 0).getDate()
  const enCurso = hoy.slice(0, 7) === mes
  const dias = enCurso ? Number(hoy.slice(8, 10)) : diasMes
  // Costo laboral real de Nómina: salario, auxilio, aportes y prestaciones.
  const salariosMOD = (emps || []).reduce((s, e) => s + Number(e.salario_base || 0), 0)
  const costoMOD = (emps || []).reduce((s, e) => s + costoLaboral(e, parametros).total, 0)
  const prest = salariosMOD ? (costoMOD - salariosMOD) / salariosMOD * 100 : null
  const nomina = costoMOD * (dias / diasMes)
  const bultosMes = (cochMes || []).reduce((s, c) => s + Number(c.cantidad), 0)
  const tipoCat = Object.fromEntries((cats || []).map(c => [c.nombre, c.tipo_costo]))
  const cif = (gastos || []).filter(g => tipoCat[g.categoria] === 'cif').reduce((s, g) => s + Number(g.valor || 0), 0)
  const fijos = (gastos || []).filter(g => tipoCat[g.categoria] === 'costo_fijo').reduce((s, g) => s + Number(g.valor || 0), 0)

  const consBulto = val('conservante_g_bulto') && val('precio_conservante_g') ? val('conservante_g_bulto') * val('precio_conservante_g') : null
  const modBulto = nomina && bultosMes ? nomina / bultosMes : null
  const cifBulto = cif && bultosMes ? cif / bultosMes : null

  // Por maíz: precio del bulto y Telas que rinde (medido y fijado, o la fórmula).
  const porMaiz = Object.fromEntries(maices.map(mz => {
    const c = (compras || []).find(x => x.sku === mz.sku)
    const precio = c ? Number(c.precio_unitario) : (Number(mz.costo_compra) || null)
    const telaMaiz = refs.find(p => /tela/i.test(p.nombre) && !/mini/i.test(p.nombre) && maizDe(p.id)?.maizId === mz.id)
    const md = telaMaiz && maizDe(telaMaiz.id)
    const telasFormula = md?.porPaquete ? (1 / md.porPaquete) * (pesoTela / Number(telaMaiz.peso_estandar_g)) : null
    const medido = val('telas_por_bulto', mz.id)
    return [mz.id, { maiz: mz, precio, fuentePrecio: c ? `Compra del ${new Date(c.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}` : 'Precio en Maestros', telasFormula, telasMedido: medido }]
  }))

  // Precios por canal.
  const pactados = {}
  ;(cp || []).forEach(x => { (pactados[x.sku] = pactados[x.sku] || []).push(Number(x.precio_especial)) })
  const rutas = {}
  ;(rp || []).forEach(x => { const n = x.rutas?.nombre || 'Ruta'; (rutas[n] = rutas[n] || {})[x.sku] = Number(x.precio_especial) })

  return {
    mes, refs, tela, pesoTela, maices, porMaiz, maizDe, estandares, val,
    partes: { consBulto, modBulto, cifBulto, aceiteBulto },
    contexto: { nomina, bultosMes, cif, fijos, prest, empleadosMOD: (emps || []).length, atomizador, enCurso, dias, diasMes, diasConProduccion: new Set((cochMes || []).map(c => c.fecha)).size },
    canales: {
      pactado: Object.fromEntries(Object.entries(pactados).map(([sku, l]) => { const [p, n] = moda(l); return [sku, { precio: Number(p), n, total: l.length }] })),
      rutas,
    },
  }
}

// Costo de la masa de una Tela con un rendimiento dado, y sus partes.
export function costoTela(d, maizId, telas, bultosMes) {
  const pm = d.porMaiz[maizId]
  if (!pm || !telas) return null
  // Mano de obra y gastos de planta se reparten entre los bultos del mes: los
  // registrados o, para simular, los que se digan.
  const bm = bultosMes || d.contexto.bultosMes
  // Si se dicen los bultos de un mes completo, la nómina también va completa.
  const nominaUsada = bultosMes && bultosMes !== d.contexto.bultosMes ? d.contexto.nomina * d.contexto.diasMes / d.contexto.dias : d.contexto.nomina
  const modBulto = nominaUsada && bm ? nominaUsada / bm : null
  const cifBulto = d.contexto.cif && bm ? d.contexto.cif / bm : null
  const partes = [
    { id: 'maiz', nombre: 'Maíz', bulto: pm.precio, nota: pm.precio ? `Bulto a $${Math.round(pm.precio).toLocaleString('es-CO')} · ${pm.fuentePrecio}` : 'Sin precio de compra' },
    { id: 'mod', nombre: 'Mano de obra', bulto: modBulto, nota: modBulto ? `$${Math.round(nominaUsada).toLocaleString('es-CO')} de nómina (${d.contexto.empleadosMOD} de mano de obra directa${d.contexto.enCurso && nominaUsada === d.contexto.nomina ? `, ${d.contexto.dias} de ${d.contexto.diasMes} días` : ', mes completo'}) ÷ ${bm.toLocaleString('es-CO')} bultos del mes` : d.contexto.empleadosMOD ? 'Sin dato: no hay bultos puestos este mes' : 'Sin dato: nadie marcado como mano de obra directa en Nómina' },
    { id: 'cons', nombre: 'Conservante', bulto: d.partes.consBulto, nota: d.partes.consBulto ? `${d.val('conservante_g_bulto')} g × $${d.val('precio_conservante_g')} por bulto` : 'Sin dato: falta la dosis o el precio del gramo' },
    { id: 'cif', nombre: 'Luz, agua, gas y arriendo de planta', bulto: cifBulto, nota: cifBulto ? `$${Math.round(d.contexto.cif).toLocaleString('es-CO')} de gastos de planta del mes ÷ ${bm.toLocaleString('es-CO')} bultos` : 'Sin dato: no hay gastos de planta este mes' },
    { id: 'aceite', nombre: 'Aceite de la lona', bulto: d.partes.aceiteBulto, nota: d.partes.aceiteBulto ? 'Recargas del atomizador en los últimos 30 días ÷ bultos' : d.contexto.atomizador ? 'Sin dato: no hay recargas registradas en la planta' : 'Sin dato: falta la capacidad del atomizador' },
  ].map(p => ({ ...p, tela: p.bulto != null ? p.bulto / telas : null }))
  const masa = partes.reduce((s, p) => s + (p.tela || 0), 0)
  const bultoConocido = partes.reduce((s, p) => s + (p.bulto || 0), 0)
  return { partes, masa, incompleto: partes.some(p => p.tela == null), sensibilidad: bultoConocido / (telas - 1) - bultoConocido / telas }
}

// Una referencia: masa por su peso + su bolsa, con el maíz de su fórmula.
export function costoReferencia(d, p, telasPorMaiz, bultosMes) {
  const md = d.maizDe(p.id)
  if (/kilo de masa/i.test(p.nombre)) return { cruda: true, masa: null, bolsa: d.val('precio_bolsa', p.id), total: null }
  const ct = md && costoTela(d, md.maizId, telasPorMaiz[md.maizId], bultosMes)
  const masa = ct && d.pesoTela && p.peso_estandar_g ? ct.masa * Number(p.peso_estandar_g) / d.pesoTela : null
  const bolsa = d.val('precio_bolsa', p.id)
  return { masa, bolsa, total: masa != null && bolsa != null ? masa + bolsa : null, incompleto: ct?.incompleto, maizId: md?.maizId }
}
