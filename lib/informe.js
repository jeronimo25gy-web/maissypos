'use client'
import { obtenerFechaActual } from './supabase-helpers'
import { cargarMes } from './inicio-datos'
import { cargarResultado, cargarCaja, cargarFlujo, cargarMetas, rango, mesAnterior } from './finanzas'
import { cargarCostos, costoTela } from './costos'
import { cargarCostosDistri } from './costos-distri'

// Informe del mes de Maissy Group para la reunión de socios: la venta de cada
// empresa y la del grupo, el estado de resultados por empresa y junto, la caja,
// las metas, lo que deja cada ruta, la producción y lo que hay que mirar.
// En el grupo no se cuentan las ventas entre empresas (Arepas -> Distri): para
// la que vende son venta y para la que compra son costo, así que se quitan de
// los dos lados y el resultado del grupo es la suma de los dos resultados.

const $ = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n || 0)).toLocaleString('es-CO')
const pct = (n) => `${n.toLocaleString('es-CO', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`
const corto = (n) => (n || '').replace(/ S\.?A\.?S\.?$/i, '')
const nombreMes = (m) => new Date(m + '-15T12:00:00').toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
const diaCorto = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
const suma = (l) => l.reduce((s, [, v]) => s + v, 0)

// Hasta qué día se mira el mes: hoy si es el mes en curso, si no el último día.
const corte = (mes) => { const hoy = obtenerFechaActual(); return hoy.slice(0, 7) === mes ? hoy : rango(mes).hasta }

async function grupoDelMes(mes, empresas) {
  const ids = empresas.map(e => e.id)
  const [porEmpresa, grupo] = await Promise.all([
    Promise.all(empresas.map(e => cargarResultado(mes, e))),
    cargarMes(ids, corte(mes), empresas, { consolidado: true }),
  ])
  return { porEmpresa, grupo, internas: grupo.ventasInternas || 0 }
}

const partidas = (r) => ({
  ventas: r.ventas, rutas: r.rutas, mostrador: r.mostrador, costo: r.costo.valor,
  ruta: suma(r.gastosRuta), nomina: r.nomina, planta: suma(r.planta), admin: suma(r.admin), resultado: r.resultado,
})

export async function armarInformeGrupo(mes, empresas) {
  const productora = empresas.find(e => (e.modelos || []).includes('produccion'))
  const distribuidoras = empresas.filter(e => e !== productora)
  const [actual, anterior, cajas, metas, costosArepas, costosDistri] = await Promise.all([
    grupoDelMes(mes, empresas),
    grupoDelMes(mesAnterior(mes), empresas).catch(() => null),
    Promise.all(empresas.map(e => cargarCaja(mes, e.id).then(async c => ({ caja: c, flujo: await cargarFlujo(mes, c, e.id).catch(() => null) })))),
    Promise.all(empresas.map(e => cargarMetas(mes, e.id).catch(() => null))),
    productora ? cargarCostos(mes, productora.id).catch(() => null) : null,
    Promise.all(distribuidoras.map(e => cargarCostosDistri(mes, e.id).catch(() => null))),
  ])

  const filas = actual.porEmpresa.map(partidas)
  const sumar = (k) => filas.reduce((s, f) => s + f[k], 0)
  const g = {
    ventas: sumar('ventas') - actual.internas, costo: sumar('costo') - actual.internas,
    ruta: sumar('ruta'), nomina: sumar('nomina'), planta: sumar('planta'), admin: sumar('admin'), resultado: sumar('resultado'),
  }
  const pctRes = g.ventas ? g.resultado / g.ventas * 100 : null
  const ant = anterior && (() => {
    const v = anterior.porEmpresa.reduce((s, r) => s + r.ventas, 0) - anterior.internas
    const r = anterior.porEmpresa.reduce((s, x) => s + x.resultado, 0)
    return { ventas: v, resultado: r, pct: v ? r / v * 100 : null }
  })()

  // Resumen: la venta de cada empresa y la del grupo.
  const resumen = {
    titulo: 'El mes del grupo',
    kpis: [
      ...empresas.map((e, i) => ({ rotulo: `Venta ${corto(e.nombre)}`, valor: $(filas[i].ventas), valorNumero: filas[i].ventas, nota: `Rutas ${$(filas[i].rutas)} · mostrador ${$(filas[i].mostrador)}` })),
      { rotulo: 'Venta del grupo', valor: $(g.ventas), valorNumero: g.ventas, nota: actual.internas ? `Sin ${$(actual.internas)} vendidos entre empresas` : 'Sin ventas entre empresas' },
      { rotulo: 'Resultado del grupo', valor: $(g.resultado), valorNumero: g.resultado, nota: `${pctRes != null ? pct(pctRes) + ' de las ventas' : 'Sin ventas'}${ant?.pct != null ? ` · ${nombreMes(mesAnterior(mes)).split(' ')[0]} ${pct(ant.pct)}` : ''}` },
    ],
  }

  // Estado de resultados: cada empresa y el grupo.
  const cascada = [
    { rotulo: 'Ventas del grupo', valor: g.ventas, tipo: 'base' },
    { rotulo: 'Costo de lo vendido', valor: -g.costo, tipo: 'resta' },
    { rotulo: 'Margen sobre la mercancía', valor: g.ventas - g.costo, tipo: 'sub' },
    ...(g.ruta ? [{ rotulo: 'Gastos de ruta', valor: -g.ruta, tipo: 'resta' }] : []),
    ...(g.nomina ? [{ rotulo: 'Nómina', valor: -g.nomina, tipo: 'resta' }] : []),
    ...(g.planta ? [{ rotulo: 'Servicios y gastos de planta', valor: -g.planta, tipo: 'resta' }] : []),
    ...(g.admin ? [{ rotulo: 'Gastos administrativos', valor: -g.admin, tipo: 'resta' }] : []),
    { rotulo: 'Resultado del grupo', valor: g.resultado, tipo: 'total' },
  ]
  const fila = (rotulo, k, signo = 1, grupo) => [rotulo, ...filas.map(f => f[k] ? signo * f[k] : null), grupo ?? (g[k] ? signo * g[k] : null)]
  const porcentaje = (v, r) => v ? pct(r / v * 100) : '—'
  const incompletos = empresas.filter((e, i) => actual.porEmpresa[i].costo.incompleto).map(e => corto(e.nombre))
  const estado = {
    titulo: 'Estado de resultados',
    cascada,
    tabla: {
      columnas: [{ titulo: 'Concepto' }, ...empresas.map(e => ({ titulo: corto(e.nombre), tipo: 'pesos' })), { titulo: 'Grupo', tipo: 'pesos' }],
      filas: [
        fila('Ventas', 'ventas', 1, sumar('ventas')),
        ...(actual.internas ? [['Menos ventas entre empresas', ...empresas.map(() => null), -actual.internas]] : []),
        fila('Costo de lo vendido', 'costo', -1),
        ['Margen sobre la mercancía', ...filas.map(f => f.ventas - f.costo), g.ventas - g.costo],
        fila('Gastos de ruta', 'ruta', -1),
        fila('Nómina', 'nomina', -1),
        fila('Servicios y gastos de planta', 'planta', -1),
        fila('Gastos administrativos', 'admin', -1),
        ['% de las ventas', ...filas.map(f => porcentaje(f.ventas, f.resultado)), porcentaje(g.ventas, g.resultado)],
      ],
      total: ['Resultado', ...filas.map(f => f.resultado), g.resultado],
    },
    nota: `Lo que Arepas le vende a Distri es venta de Arepas y costo de Distri; en el grupo se quita de los dos lados. Distri: costo = unidades vendidas por su última compra. Arepas: maíz, conservante, aceite y bolsa de lo vendido; la nómina y los servicios de planta van aparte.${incompletos.length ? ` Costo incompleto en ${incompletos.join(' y ')}: faltan costos de algunos productos.` : ''}`,
  }

  // Plata: caja, calle y proveedores.
  const cajaTotal = cajas.reduce((s, c) => s + c.caja.total, 0)
  const plata = {
    titulo: 'Dónde está la plata',
    kpis: [
      { rotulo: 'Caja y bancos', valor: $(cajaTotal), valorNumero: cajaTotal, nota: 'Hoy, las dos empresas' },
      { rotulo: 'Plata en la calle', valor: $(actual.grupo.cartera), valorNumero: actual.grupo.cartera, nota: actual.grupo.vencida ? `${$(actual.grupo.vencida)} vencida` : 'Nada vencido' },
      { rotulo: 'Por pagar a proveedores', valor: $(actual.grupo.porPagar), valorNumero: actual.grupo.porPagar, nota: actual.grupo.porPagarVencido ? `${$(actual.grupo.porPagarVencido)} vencido` : 'Nada vencido' },
    ],
    tabla: {
      columnas: [{ titulo: 'Empresa' }, { titulo: 'Efectivo', tipo: 'pesos' }, { titulo: 'Bancos', tipo: 'pesos' }, { titulo: 'Total', tipo: 'pesos' }],
      filas: empresas.map((e, i) => [corto(e.nombre), cajas[i].caja.efectivo, cajas[i].caja.bancos, cajas[i].caja.total]),
      total: ['Grupo', cajas.reduce((s, c) => s + c.caja.efectivo, 0), cajas.reduce((s, c) => s + c.caja.bancos, 0), cajaTotal],
    },
    nota: 'Las deudas entre las dos empresas no cuentan como cartera ni como deuda del grupo.',
  }

  // Metas por ruta de las dos empresas.
  const filasMeta = empresas.flatMap((e, i) => (metas[i]?.filas || []).filter(f => f.meta).map(f => ({ ...f, empresa: corto(e.nombre) })))
  const ritmo = metas.find(m => m)?.dias ? metas.find(m => m).transcurridos / metas.find(m => m).dias * 100 : null
  const metaSec = filasMeta.length > 0 && {
    titulo: 'Contra la meta',
    tabla: {
      columnas: [{ titulo: 'Ruta' }, { titulo: 'Empresa' }, { titulo: 'Vendedor' }, { titulo: 'Meta', tipo: 'pesos' }, { titulo: 'Vendido', tipo: 'pesos' }, { titulo: 'Avance', tipo: 'pct' }],
      filas: filasMeta.map(f => [f.ruta.nombre, f.empresa, f.vendedor || '', f.meta, f.vendido, f.pct]),
      total: ['Todas', '', '', filasMeta.reduce((s, f) => s + f.meta, 0), filasMeta.reduce((s, f) => s + f.vendido, 0), filasMeta.reduce((s, f) => s + f.vendido, 0) / filasMeta.reduce((s, f) => s + f.meta, 0) * 100],
    },
    nota: ritmo != null && ritmo < 100 ? `Van ${pct(ritmo)} de los días del mes: una ruta al día lleva por lo menos ese avance.` : null,
  }

  // Lo que deja cada ruta (distribuidoras).
  const filasRuta = distribuidoras.flatMap((e, i) => (costosDistri[i]?.filasRuta || []).map(r => ({ ...r, empresa: corto(e.nombre) })))
  const rutasSec = filasRuta.length > 0 && {
    titulo: 'Lo que deja cada ruta',
    tabla: {
      columnas: [{ titulo: 'Ruta' }, { titulo: 'Ventas', tipo: 'pesos' }, { titulo: 'Mercancía', tipo: 'pesos' }, { titulo: 'Repartir', tipo: 'pesos' }, { titulo: 'Deja', tipo: 'pesos' }, { titulo: '% de la venta', tipo: 'pct' }],
      filas: filasRuta.map(r => [distribuidoras.length > 1 ? `${r.nombre} · ${r.empresa}` : r.nombre, r.ventas, r.mercancia, r.tipo === 'mostrador' ? null : r.repartir, r.deja, r.ventas ? r.deja / r.ventas * 100 : null]),
    },
    nota: 'Antes de gastos fijos. Repartir = gasolina, viáticos y nómina del vendedor; los cambios y obsequios también se restan.',
  }

  // Producción (Arepas): bultos, rendimiento y costo de la Tela.
  let produccion = null
  if (costosArepas) {
    const d = costosArepas
    const blanco = d.tela && d.maizDe(d.tela.id)?.maizId
    const pm = d.porMaiz[blanco] || {}
    const telas = pm.telasMedido || pm.telasFormula
    const ct = blanco && telas ? costoTela(d, blanco, telas, d.contexto.bultosMes) : null
    const bolsa = d.tela ? d.val('precio_bolsa', d.tela.id) : null
    const tela = ct ? ct.masa + (bolsa || 0) : null
    produccion = {
      titulo: 'Producción',
      tabla: {
        columnas: [{ titulo: 'Dato' }, { titulo: nombreMes(mes).split(' ')[0].replace(/^./, c => c.toUpperCase()) }],
        filas: [
          ['Bultos montados', `${Number(d.contexto.bultosMes || 0).toLocaleString('es-CO')} en ${d.contexto.diasConProduccion} ${d.contexto.diasConProduccion === 1 ? 'día' : 'días'}`],
          [`Telas por bulto (${pm.telasMedido ? 'medido' : 'fórmula'})`, telas ? Math.round(telas).toLocaleString('es-CO') : 'Sin dato'],
          ['Costo de una Tela blanca', tela != null ? `${$(tela)}${ct.incompleto ? ' (incompleto)' : ''}` : 'Sin dato'],
        ],
      },
    }
  }

  // Lo que hay que mirar.
  const mirar = []
  if (actual.grupo.vencida) mirar.push(['Cartera', `${$(actual.grupo.vencida)} en créditos vencidos de ${$(actual.grupo.cartera)} que hay en la calle`])
  if (actual.grupo.porPagarVencido) mirar.push(['Proveedores', `${$(actual.grupo.porPagarVencido)} en pagos vencidos`])
  empresas.forEach((e, i) => {
    const n = cajas[i].flujo?.primeroNegativo
    if (n) mirar.push(['Caja', `El ${diaCorto(n.fecha)} la caja de ${corto(e.nombre)} no alcanza (${n.titulo.toLowerCase()})`])
  })
  empresas.forEach((e, i) => { if (filas[i].ventas && filas[i].resultado < 0) mirar.push(['Resultado', `${corto(e.nombre)} va perdiendo ${$(-filas[i].resultado)} en el mes`]) })
  const atras = filasMeta.filter(f => f.estado === 'muy_atras')
  if (atras.length) mirar.push(['Metas', `${atras.map(f => f.ruta.nombre).join(', ')} ${atras.length === 1 ? 'va' : 'van'} más de 10 puntos por debajo del ritmo`])
  if (incompletos.length) mirar.push(['Costos', `Faltan costos de algunos productos en ${incompletos.join(' y ')}; el resultado sale más alto de lo real`])
  if (costosArepas && costosArepas.contexto.diasConProduccion < costosArepas.contexto.dias * 0.6) mirar.push(['Producción', `Solo ${costosArepas.contexto.diasConProduccion} días con bultos registrados de ${costosArepas.contexto.dias}: el costo de la Tela sale más alto de lo real`])

  return {
    titulo: 'Informe del mes', empresa: 'Maissy Group', periodo: `${nombreMes(mes).replace(/^./, c => c.toUpperCase())}${corte(mes) < rango(mes).hasta ? ` · hasta el ${diaCorto(corte(mes))}` : ''}`,
    secciones: [
      resumen, estado, plata, metaSec, rutasSec, produccion,
      { titulo: 'Lo que hay que mirar', tabla: { columnas: [{ titulo: 'Tema' }, { titulo: 'Qué pasa' }], filas: mirar.length ? mirar : [['Todo en orden', 'Nada urgente este mes']] } },
    ].filter(Boolean),
  }
}
