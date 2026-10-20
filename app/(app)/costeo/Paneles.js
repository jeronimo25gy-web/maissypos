'use client'
import { useState, Fragment } from 'react'
import { costoTela, costoReferencia } from '@/lib/costos'
import { fijarEstandar } from '@/lib/produccion-admin'

// Costos de Arepas Maissy con la Tela blanca como base. Ver lib/costos.js.
export const C = {
  tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', linea: '#E3E1D8', suave: '#EFEDE6',
  rojo: '#C41230', rojoF: '#FBE9E9', amarillo: '#F2B21B', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8',
}
const COLOR_PARTE = { maiz: '#C41230', mod: '#E9A23B', cons: '#8C877C', cif: '#5A5750', aceite: '#B07C00', bolsa: '#2E5E3A' }
export const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const tarjeta = 'bg-white rounded-[18px] p-4'
const $ = (n) => '$' + Math.round(n).toLocaleString('es-CO')
// "26,66" o "26.66" → 26.66; "24.000" → 24000.
const leerNumero = (t) => { let x = String(t || '').trim(); if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, ''); return Number(x) }
const corto = (p) => (p?.nombre || '').replace(/^Arepa (de Maíz )?/i, '')
const PILL = { gris: [C.suave, C.gris], ambar: [C.ambarF, C.ambar], verde: [C.verdeF, C.verde], rojo: [C.rojoF, C.rojo] }
const Pill = ({ tono = 'gris', children }) => <span className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: PILL[tono][0], color: PILL[tono][1] }}>{children}</span>
const RAYADO = `repeating-linear-gradient(45deg, ${C.suave} 0 6px, ${C.linea} 6px 12px)`

export function PorPaquete({ d, telasSim, setTelasSim, bultosSim, setBultosSim, irInsumos }) {
  const bultos = bultosSim || d.contexto.bultosMes
  // Pocos días con producción registrada: la nómina y los servicios caen sobre muy pocos bultos.
  const pocosDias = d.contexto.diasConProduccion < d.contexto.dias * 0.6
  const blanco = d.tela && d.maizDe(d.tela.id)?.maizId
  const pm = d.porMaiz[blanco] || {}
  const telasBase = (mid) => d.porMaiz[mid]?.telasMedido || d.porMaiz[mid]?.telasFormula
  const telasPorMaiz = Object.fromEntries(d.maices.map(m => [m.id, telasSim[m.id] || telasBase(m.id)]))
  const telas = telasPorMaiz[blanco]
  const ct = blanco ? costoTela(d, blanco, telas, bultos) : null
  const bolsaTela = d.tela ? d.val('precio_bolsa', d.tela.id) : null
  const totalTela = ct ? ct.masa + (bolsaTela || 0) : null
  const pactadoTela = d.tela ? d.canales.pactado[d.tela.sku] : null
  const nombresRuta = Object.keys(d.canales.rutas)

  const faltan = []
  ct?.partes.filter(p => p.tela == null).forEach(p => faltan.push({ titulo: p.nombre, detalle: p.nota.replace(/^Sin dato: /, ''), tono: 'rojo', etiqueta: 'Sin dato' }))
  const sinBolsa = d.refs.filter(p => !/kilo de masa/i.test(p.nombre) && d.val('precio_bolsa', p.id) == null)
  if (sinBolsa.length) faltan.push({ titulo: `Bolsas de ${sinBolsa.map(corto).join(', ')}`, detalle: 'Se ponen en Precios de insumos.', tono: 'ambar', etiqueta: `Faltan ${sinBolsa.length}` })
  if (d.contexto.prest == null) faltan.push({ titulo: 'Prestaciones y seguridad social', detalle: 'Hoy solo cuenta el salario base. Se pone el % en Precios de insumos.', tono: 'ambar', etiqueta: 'Falta %' })
  const sinPrecio = d.refs.filter(p => !Number(p.precio_venta))
  if (sinPrecio.length) faltan.push({ titulo: `Precio de ${sinPrecio.map(corto).join(', ')}`, detalle: 'Está en $0 en Maestros; sin precio no hay margen.', tono: 'ambar', etiqueta: 'Sin precio' })

  const celda = (precio, costo, incompleto, extra) => {
    if (!precio) return <td className="py-2.5 px-2 text-right" style={{ color: C.gris }}>—</td>
    if (costo == null) return <td className="py-2.5 px-2 text-right tabular-nums">{$(precio)}<span className="block text-xs" style={{ color: C.gris }}>sin costo</span></td>
    const m = (precio - costo) / precio * 100
    return (
      <td className="py-2.5 px-2 text-right tabular-nums">{$(precio)}
        <span className="block text-xs"><b style={{ color: m < 0 ? C.rojo : m < 25 ? C.ambar : C.verde }}>{Math.round(m)}%</b>{incompleto ? <span style={{ color: C.gris }}> · incompleto</span> : ''}{extra ? <span style={{ color: C.gris }}> · {extra}</span> : ''}</span>
      </td>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        <Kpi rotulo="Costo de una Tela blanca" valor={totalTela != null ? $(totalTela) : 'Sin dato'} nota={ct?.incompleto ? <><Pill tono="ambar">Incompleto</Pill> <span>faltan {ct.partes.filter(p => p.tela == null).length} partes</span></> : 'Con todo lo registrado'} />
        <Kpi rotulo="Margen de la Tela a distribuidor" valor={pactadoTela && totalTela != null ? `${Math.round((pactadoTela.precio - totalTela) / pactadoTela.precio * 100)}%` : 'Sin dato'} nota={pactadoTela ? `Precio pactado ${$(pactadoTela.precio)} · ${pactadoTela.n} ${pactadoTela.n === 1 ? 'cliente' : 'clientes'}` : 'Sin precio pactado'} />
        <Kpi rotulo="Cada Tela de menos por bulto" valor={ct ? `+${$(ct.sensibilidad)}` : 'Sin dato'} nota="Lo que sube el costo de una Tela" />
        <Kpi rotulo="Datos que faltan" valor={faltan.length} rojo={faltan.length > 0} nota={faltan.length ? faltan.map(f => f.titulo.split(' ')[0]).slice(0, 4).join(', ') : 'Nada'} />
      </div>

      {blanco && (
        <div className={tarjeta + ' flex gap-3 items-center flex-wrap'}>
          <span className="flex-1 min-w-[240px]"><b>Telas por bulto</b><br /><span className="text-[13px]" style={{ color: C.gris }}>{pm.telasMedido ? 'Se usa lo medido y fijado en Producción.' : 'Se usa la fórmula, que nunca se ha medido. Prueba otro número para ver el efecto.'}</span></span>
          {[[pm.telasMedido, 'Medido'], [pm.telasFormula, 'Fórmula']].filter(([v]) => v).map(([v, n]) => (
            <button key={n} type="button" onClick={() => setTelasSim({ ...telasSim, [blanco]: v })} className="rounded-full min-h-[40px] px-4 text-sm font-bold"
              style={Math.round(telas) === Math.round(v) ? { background: '#fff', boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: C.suave }}>{n} · {Math.round(v)}</button>
          ))}
          <input inputMode="numeric" aria-label="Telas por bulto para simular" value={Math.round(telas || 0)} onChange={e => { const v = Number(e.target.value); if (v > 0) setTelasSim({ ...telasSim, [blanco]: v }) }}
            className="w-24 h-10 rounded-xl border-2 text-center text-lg font-extrabold bg-white" style={{ borderColor: C.linea, ...titulo }} />
        </div>
      )}

      <div className={tarjeta + ' flex gap-3 items-center flex-wrap'}>
        <span className="flex-1 min-w-[240px]"><b>Bultos del mes</b><br /><span className="text-[13px]" style={{ color: C.gris }}>La nómina y los gastos de planta se reparten entre los bultos del mes. Registrados: {d.contexto.bultosMes.toLocaleString('es-CO')} en {d.contexto.diasConProduccion} {d.contexto.diasConProduccion === 1 ? 'día' : 'días'}.</span></span>
        {bultosSim != null && <button type="button" onClick={() => setBultosSim(null)} className="rounded-full min-h-[40px] px-4 text-sm font-bold" style={{ background: C.suave }}>Volver a los registrados</button>}
        <input inputMode="numeric" aria-label="Bultos del mes para simular" value={bultos || ''} placeholder="0" onChange={e => { const v = Number(e.target.value); setBultosSim(v > 0 ? v : null) }}
          className="w-24 h-10 rounded-xl border-2 text-center text-lg font-extrabold bg-white" style={{ borderColor: C.linea, ...titulo }} />
      </div>
      {pocosDias && bultosSim == null && (
        <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: C.ambarF, color: C.ambar }}>
          <b>Este mes faltan días de producción por registrar.</b> Solo hay {d.contexto.diasConProduccion} {d.contexto.diasConProduccion === 1 ? 'día' : 'días'} con bultos anotados de {d.contexto.dias}, así que la nómina y los servicios caen sobre muy pocos bultos y la Tela sale más cara de lo real. Pon arriba los bultos que de verdad se montan al mes para verlo.
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] items-start">
        <div className={tarjeta + ' flex flex-col gap-3'}>
          <div className="flex items-baseline justify-between gap-2 flex-wrap"><h3 className="text-[17px] font-extrabold" style={titulo}>Cómo se arma el costo de una Tela</h3>{totalTela != null && <span className="text-[13px]" style={{ color: C.gris }}>{$(totalTela)} conocido{ct?.incompleto ? ' · incompleto' : ''}</span>}</div>
          {ct && (
            <>
              <div className="flex h-8 rounded-lg overflow-hidden gap-0.5" role="img" aria-label="Partes del costo de una Tela">
                {ct.partes.map(p => <i key={p.id} title={`${p.nombre}: ${p.tela != null ? $(p.tela) : 'sin dato'}`} style={{ flex: p.tela != null ? p.tela : totalTela * 0.1, background: p.tela != null ? COLOR_PARTE[p.id] : RAYADO }} />)}
                {bolsaTela != null && <i title={`Bolsa: ${$(bolsaTela)}`} style={{ flex: bolsaTela, background: COLOR_PARTE.bolsa }} />}
              </div>
              <div>
                {[...ct.partes, { id: 'bolsa', nombre: 'Bolsa', tela: bolsaTela, nota: bolsaTela != null ? 'Por paquete; no depende del rendimiento' : 'Sin dato: falta el precio de la bolsa' }].map(p => (
                  <div key={p.id} className="grid gap-2.5 py-2.5 border-t first:border-t-0 items-start" style={{ borderColor: C.linea, gridTemplateColumns: '14px minmax(0,1fr) auto' }}>
                    <span className="w-3 h-3 rounded-[3px] mt-1" style={{ background: p.tela != null ? COLOR_PARTE[p.id] : C.linea }} />
                    <span className="text-sm"><b>{p.nombre}</b><br /><span className="text-[13px]" style={{ color: C.gris }}>{p.nota}</span></span>
                    <span className="text-right font-extrabold tabular-nums">{p.tela != null ? $(p.tela) : <Pill tono="rojo">Sin dato</Pill>}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className={tarjeta + ' flex flex-col gap-1'}>
          <h3 className="text-[17px] font-extrabold" style={titulo}>Datos que faltan</h3>
          <p className="text-[13px] pb-1" style={{ color: C.gris }}>Mientras falten, el costo sale por debajo de lo real.</p>
          {faltan.length === 0 ? <p className="text-sm py-2" style={{ color: C.verde }}>Está todo.</p> : faltan.map((f, i) => (
            <div key={i} className="flex gap-3 items-center py-2.5 border-t first:border-t-0 text-sm" style={{ borderColor: C.linea }}>
              <span className="flex-1 min-w-0"><b>{f.titulo}</b><br /><span className="text-[13px]" style={{ color: C.gris }}>{f.detalle}</span></span>
              <Pill tono={f.tono}>{f.etiqueta}</Pill>
            </div>
          ))}
          <button type="button" onClick={irInsumos} className="mt-2 rounded-xl min-h-[40px] text-sm font-bold" style={{ background: C.suave }}>Ir a precios de insumos</button>
        </div>
      </div>

      <div className={tarjeta + ' flex flex-col gap-2'}>
        <div className="flex items-baseline justify-between gap-2 flex-wrap"><h3 className="text-[17px] font-extrabold" style={titulo}>Cada referencia</h3><span className="text-[13px]" style={{ color: C.gris }}>Margen por canal · verde 25% o más, ámbar menos, rojo pierde</span></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead><tr className="text-xs uppercase tracking-wide" style={{ color: C.gris }}>
              <th className="py-2 px-2 text-left">Referencia</th><th className="py-2 px-2 text-right">Peso</th><th className="py-2 px-2 text-right">Masa</th><th className="py-2 px-2 text-right">Bolsa</th><th className="py-2 px-2 text-right">Costo</th>
              <th className="py-2 px-2 text-right">Lista</th><th className="py-2 px-2 text-right">Pactado</th>{nombresRuta.map(n => <th key={n} className="py-2 px-2 text-right">{n}</th>)}
            </tr></thead>
            <tbody>
              {d.refs.map(p => {
                const r = costoReferencia(d, p, telasPorMaiz, bultos)
                const pact = d.canales.pactado[p.sku]
                return (
                  <tr key={p.id} className="border-t" style={{ borderColor: C.linea }}>
                    <td className="py-2.5 px-2"><b>{corto(p)}</b>{r.cruda && <span className="block text-xs" style={{ color: C.gris }}>Masa cruda</span>}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{p.peso_estandar_g ? `${Number(p.peso_estandar_g).toLocaleString('es-CO')} g` : '—'}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{r.masa != null ? $(r.masa) : <Pill>Sin dato</Pill>}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{r.bolsa != null ? $(r.bolsa) : <Pill tono="ambar">Falta</Pill>}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums font-bold">{r.total != null ? $(r.total) : '—'}</td>
                    {Number(p.precio_venta) ? celda(Number(p.precio_venta), r.total, r.incompleto) : <td className="py-2.5 px-2 text-right"><Pill tono="ambar">$0</Pill></td>}
                    {celda(pact?.precio, r.total, r.incompleto, pact ? `${pact.n} cl.` : '')}
                    {nombresRuta.map(n => <Fragment key={n}>{celda(d.canales.rutas[n][p.sku], r.total, r.incompleto)}</Fragment>)}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[13px]" style={{ color: C.gris }}>Masa = costo de la Tela sin bolsa × (peso ÷ {d.pesoTela?.toLocaleString('es-CO')} g), con el maíz de la fórmula de cada referencia. Pactado = el precio pactado más común con los clientes. El Kilo de Masa es masa cruda: su costo sale cuando haya masa pesada por bulto.</p>
      </div>
    </div>
  )
}

function Kpi({ rotulo, valor, nota, rojo }) {
  return (
    <div className="bg-white rounded-[18px] p-4 flex flex-col gap-0.5 min-w-0">
      <span className="text-[13px] font-bold" style={{ color: C.gris }}>{rotulo}</span>
      <span className="cifra-caja"><span className="cifra font-extrabold tabular-nums" style={{ ...titulo, color: rojo ? C.rojo : C.tinta, '--cifra-max': '28px' }}>{valor}</span></span>
      <span className="text-[13px]" style={{ color: C.gris }}>{nota}</span>
    </div>
  )
}

// Precios de insumos: lo que no viene de Compras ni de Nómina.
export function Insumos({ d, usuario, recargar }) {
  const [vals, setVals] = useState({})
  const [guardando, setGuardando] = useState(false)
  const est = (clave, productoId = null) => d.estandares.find(s => s.clave === clave && (s.producto_id || null) === productoId && !s.tanque_id)
  const guardar = async (clave, productoId, unidad) => {
    const k = clave + (productoId || '')
    const v = leerNumero(vals[k])
    if (!(v >= 0)) return
    setGuardando(true)
    try { await fijarEstandar({ clave, extra: { productoId }, fijo: est(clave, productoId) }, v, usuario); setVals({ ...vals, [k]: '' }); await recargar() }
    catch (e) { alert('No se pudo guardar: ' + e.message) }
    setGuardando(false)
  }
  const props = { est, vals, setVals, guardar, guardando }
  return (
    <div className="flex flex-col gap-3">
      <div className={tarjeta + ' flex flex-col gap-3'}>
        <h3 className="text-[17px] font-extrabold" style={titulo}>Insumos de planta</h3>
        <p className="text-[13px]" style={{ color: C.gris }}>El maíz sale de su última compra y la mano de obra de Nómina. El gas, la luz y el arriendo de la planta se registran en Gastos con una categoría de tipo “gasto de planta” (CIF).</p>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
          <Campo {...props} clave="precio_conservante_g" nombre="Conservante, precio del gramo" unidad="$" />
          <Campo {...props} clave="conservante_g_bulto" nombre="Conservante por bulto" unidad="g" />
          <Campo {...props} clave="precio_aceite_l" nombre="Aceite de girasol, precio del litro" unidad="$" ayuda="Garrafa de 2,5 L a $24.000 = $9.600 el litro" />
          <Campo {...props} clave="atomizador_ml" nombre="Capacidad del atomizador" unidad="ml" ayuda="Con esto y las recargas que marca la planta sale el aceite por bulto" />
          <Campo {...props} clave="prestaciones_pct" nombre="Prestaciones y seguridad social" unidad="%" ayuda="Se suma al salario base de la mano de obra directa" />
        </div>
      </div>
      <div className={tarjeta + ' flex flex-col gap-3'}>
        <h3 className="text-[17px] font-extrabold" style={titulo}>Bolsa de cada referencia</h3>
        <p className="text-[13px]" style={{ color: C.gris }}>Precio de una bolsa. Si viene por millar, divide entre 1.000.</p>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
          {d.refs.filter(p => !/kilo de masa/i.test(p.nombre)).map(p => <Campo {...props} key={p.id} clave="precio_bolsa" productoId={p.id} nombre={corto(p)} unidad="$" />)}
        </div>
      </div>
    </div>
  )
}

function Campo({ clave, productoId = null, nombre, unidad, ayuda, est, vals, setVals, guardar, guardando }) {
  const k = clave + (productoId || '')
  const actual = est(clave, productoId)
  return (
    <div className="rounded-xl p-3 flex flex-col gap-2" style={{ background: C.fondo }}>
      <span className="text-[13px] font-bold">{nombre} <span className="font-normal" style={{ color: C.gris }}>· {actual ? `${unidad === '$' ? $(actual.valor) : Number(actual.valor).toLocaleString('es-CO')}${unidad !== '$' ? ' ' + unidad : ''}` : 'sin dato'}</span></span>
      {ayuda && <span className="text-[12px]" style={{ color: C.gris }}>{ayuda}</span>}
      <div className="flex gap-2">
        <input inputMode="decimal" placeholder="Nuevo valor" value={vals[k] ?? ''} onChange={e => setVals({ ...vals, [k]: e.target.value })}
          className="flex-1 min-w-0 h-10 rounded-xl border-2 px-3 font-bold bg-white" style={{ borderColor: C.linea }} />
        <span className="self-center text-xs" style={{ color: C.gris }}>{unidad}</span>
        <button type="button" disabled={guardando || !vals[k]} onClick={() => guardar(clave, productoId, unidad)} className="rounded-xl px-3 text-xs font-bold disabled:opacity-40" style={{ background: C.suave }}>Guardar</button>
      </div>
    </div>
  )
}

// Reporte para Exportar (PDF presentable o Excel): cómo se arma la Tela y cada
// referencia con su margen, con los mismos números que se ven en pantalla.
export function reporteArepas(d, telasSim, bultosSim, empresa) {
  const bultos = bultosSim || d.contexto.bultosMes
  const blanco = d.tela && d.maizDe(d.tela.id)?.maizId
  const telasPorMaiz = Object.fromEntries(d.maices.map(m => [m.id, telasSim[m.id] || d.porMaiz[m.id]?.telasMedido || d.porMaiz[m.id]?.telasFormula]))
  const telas = telasPorMaiz[blanco]
  const ct = blanco ? costoTela(d, blanco, telas, bultos) : null
  const bolsaTela = d.tela ? d.val('precio_bolsa', d.tela.id) : null
  const totalTela = ct ? ct.masa + (bolsaTela || 0) : null
  const pactadoTela = d.tela ? d.canales.pactado[d.tela.sku] : null
  const nombresRuta = Object.keys(d.canales.rutas)
  const margen = (precio, costo) => precio && costo != null ? (precio - costo) / precio * 100 : null
  const periodo = new Date(d.mes + '-15T12:00:00').toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase())
  const partes = ct ? [...ct.partes, { nombre: 'Bolsa', tela: bolsaTela, nota: 'Por paquete; no depende del rendimiento' }] : []
  return {
    titulo: 'Costos desde la Tela', empresa: empresa?.nombre, logo: empresa?.logo_url, periodo,
    secciones: [
      { titulo: 'La Tela blanca', kpis: [
        { rotulo: 'Costo de una Tela blanca', valor: totalTela != null ? $(totalTela) : 'Sin dato', valorNumero: totalTela, nota: ct?.incompleto ? 'Incompleto: faltan datos' : 'Con todo lo registrado' },
        { rotulo: 'Margen a distribuidor', valor: pactadoTela && totalTela != null ? `${Math.round(margen(pactadoTela.precio, totalTela))}%` : 'Sin dato', valorNumero: pactadoTela ? margen(pactadoTela.precio, totalTela) : null, nota: pactadoTela ? `Precio pactado ${$(pactadoTela.precio)}` : 'Sin precio pactado' },
        { rotulo: 'Telas por bulto', valor: telas ? Math.round(telas).toLocaleString('es-CO') : 'Sin dato', valorNumero: telas, nota: telasSim[blanco] ? 'Simulado' : d.porMaiz[blanco]?.telasMedido ? 'Medido en Producción' : 'De la fórmula' },
        { rotulo: 'Bultos del mes', valor: Number(bultos || 0).toLocaleString('es-CO'), valorNumero: bultos, nota: bultosSim ? 'Simulado' : `Registrados en ${d.contexto.diasConProduccion} días` },
      ] },
      partes.length > 0 && { titulo: 'Cómo se arma el costo de una Tela', tabla: {
        columnas: [{ titulo: 'Parte' }, { titulo: 'De dónde sale' }, { titulo: 'Por Tela', tipo: 'pesos' }],
        filas: partes.map(p => [p.nombre, p.tela != null ? p.nota : 'Sin dato', p.tela]),
        total: ['Total', ct?.incompleto ? 'Incompleto' : '', totalTela],
      } },
      { titulo: 'Cada referencia', nota: `Masa = costo de la Tela sin bolsa × (peso ÷ ${d.pesoTela?.toLocaleString('es-CO')} g), con el maíz de la fórmula de cada referencia. Los márgenes están en %.`, tabla: {
        columnas: [{ titulo: 'Referencia' }, { titulo: 'Peso g', tipo: 'num' }, { titulo: 'Masa', tipo: 'pesos' }, { titulo: 'Bolsa', tipo: 'pesos' }, { titulo: 'Costo', tipo: 'pesos' }, { titulo: 'Lista', tipo: 'pesos' }, { titulo: 'Margen lista', tipo: 'pct' }, { titulo: 'Pactado', tipo: 'pesos' }, { titulo: 'Margen pactado', tipo: 'pct' }, ...nombresRuta.map(n => ({ titulo: `Margen ${n}`, tipo: 'pct' }))],
        filas: d.refs.map(p => {
          const r = costoReferencia(d, p, telasPorMaiz, bultos)
          const pact = d.canales.pactado[p.sku]
          const lista = Number(p.precio_venta) || null
          return [corto(p), Number(p.peso_estandar_g) || null, r.masa, r.bolsa, r.total, lista, margen(lista, r.total), pact?.precio ?? null, margen(pact?.precio, r.total), ...nombresRuta.map(n => margen(d.canales.rutas[n][p.sku], r.total))]
        }),
      } },
    ].filter(Boolean),
  }
}
