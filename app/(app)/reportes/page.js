'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { puedeVerModulo } from '@/lib/permisos'
import { PageHeader } from '@/components/ui'
import Exportar from '@/components/Exportar'
import { INDICADORES, AREAS, PROXIMOS, aplica, contexto, rangoPeriodo, historia, calcular, estadoCon, textoMeta, cargarMetas, guardarMeta, cargarOcultos, guardarOcultos } from '@/lib/indicadores'

// Reportes: tablero de indicadores. Cada uno con su meta (la ponen en la
// transición), un color, la tendencia de los últimos meses y, al abrirlo, cómo
// se calcula, cómo va cada ruta o referencia, qué hacer y su gráfica.
// El Reportes de antes quedó en /reportes-anterior.
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: 'var(--hoja)', linea: '#E3E1D8', suave: '#EFEDE6', rojo: 'var(--rojo)', rojoF: 'var(--rojo-suave)', amarillo: 'var(--acento)', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8' }
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const ESTADO = { verde: ['En la meta', C.verdeF, C.verde, C.verde], ambar: ['Cerca', C.ambarF, C.ambar, C.amarillo], rojo: ['Lejos', C.rojoF, C.rojo, C.rojo], gris: ['Midiendo', C.suave, C.gris, '#B9B3A3'], sin: ['Sin meta', C.suave, C.gris, C.tinta] }
const PERIODOS = [['semana', 'Esta semana'], ['mes', 'Este mes'], ['pasado', 'Mes pasado'], ['tres', '3 meses']]
const corto = (n) => (n || '').replace(/ S\.?A\.?S\.?$/i, '').replace(/ Maissy$/i, '')

export default function Reportes() {
  const router = useRouter()
  const [usuario, setUsuario] = useState(null)
  const [empresas, setEmpresas] = useState([])
  const [sel, setSel] = useState(null)
  const [periodo, setPeriodo] = useState('mes')
  const [res, setRes] = useState({})
  const [metas, setMetas] = useState({})
  const [hist, setHist] = useState({}) // id -> { meses: [{etiqueta, valor}], semanas }
  const [abierto, setAbierto] = useState(null)
  const [ocultos, setOcultos] = useState({ fila: null, lista: [] })
  const [agregando, setAgregando] = useState(false)
  const ctxRef = useRef(null)

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')
    if (!u) { router.push('/entrar'); return }
    if (!puedeVerModulo(u, 'reportes', ['admin'])) { router.push('/despacho'); return }
    setUsuario(u)
    supabase.from('empresas').select('id, nombre, modelos').eq('activo', true).order('nombre').then(({ data }) => {
      const acc = (data || []).filter(e => !u.empresas || u.empresas.includes(e.id))
      setEmpresas(acc)
      setSel(acc.length > 1 ? 'grupo' : acc[0]?.id || getEmpresaId())
    })
  }, [router])

  const ids = sel === 'grupo' ? empresas.map(e => e.id) : sel ? [sel] : []
  const rango = rangoPeriodo(periodo)

  useEffect(() => {
    if (!ids.length || !empresas.length) return
    let vivo = true
    const ctx = contexto(empresas, ids, sel === 'grupo')
    ctxRef.current = ctx
    setRes({}); setHist({}); setAbierto(null)
    cargarMetas(ctx).then(m => vivo && setMetas(m)).catch(() => {})
    cargarOcultos(ctx).then(o => vivo && setOcultos(o)).catch(() => {})
    const lista = INDICADORES.filter(k => aplica(k, ctx))
    // Primero el valor del periodo; después, sin apuro, la tendencia de 6 meses.
    Promise.all(lista.map(k => calcular(k, ctx, rango).then(r => vivo && setRes(s => ({ ...s, [k.id]: r }))))).then(async () => {
      const { meses } = historia()
      for (const k of lista) {
        if (!vivo || k.soloHoy || k.grafica === 'puntos') continue
        const vals = await Promise.all(meses.map(m => calcular(k, ctx, m).then(r => ({ etiqueta: m.etiqueta, valor: r.valor }))))
        if (vivo) setHist(h => ({ ...h, [k.id]: { ...h[k.id], meses: vals } }))
      }
    })
    return () => { vivo = false }
  }, [sel, periodo, empresas.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Semanas: solo cuando abren el indicador.
  useEffect(() => {
    const k = INDICADORES.find(x => x.id === abierto)
    const ctx = ctxRef.current
    if (!k || !ctx || k.soloMes || k.soloHoy || k.grafica === 'puntos' || hist[k.id]?.semanas) return
    let vivo = true
    const { semanas } = historia()
    Promise.all(semanas.map(s => calcular(k, ctx, s).then(r => ({ etiqueta: s.etiqueta, valor: r.valor })))).then(vals => vivo && setHist(h => ({ ...h, [k.id]: { ...h[k.id], semanas: vals } })))
    return () => { vivo = false }
  }, [abierto]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!usuario) return null
  const ctx = ctxRef.current
  const aplicables = ctx ? INDICADORES.filter(k => aplica(k, ctx)) : []
  const lista = aplicables.filter(k => !ocultos.lista.includes(k.id))
  const cambiarOcultos = async (nueva) => {
    const antes = ocultos
    setOcultos({ ...ocultos, lista: nueva })
    try { await guardarOcultos(ctx, ocultos.fila, nueva); setOcultos(await cargarOcultos(ctx)) } catch (err) { setOcultos(antes); alert('No se pudo guardar: ' + err.message) }
  }
  const metaDe = (k) => metas[k.id] ? Number(metas[k.id].meta) : null
  const estadoDe = (k) => res[k.id] ? estadoCon(k, res[k.id], metaDe(k)) : null
  const cuenta = { verde: 0, ambar: 0, rojo: 0, gris: 0, sin: 0 }
  lista.forEach(k => { const e = estadoDe(k); if (e) cuenta[e]++ })
  const nombreEmpresa = sel === 'grupo' ? 'Maissy Group' : empresas.find(e => e.id === sel)?.nombre

  const armar = () => ({
    titulo: 'Indicadores', empresa: nombreEmpresa, periodo: `${rango.nombre.replace(/^./, c => c.toUpperCase())}`,
    secciones: [
      { titulo: 'Resumen', kpis: [['verde', 'En la meta'], ['ambar', 'Cerca de la meta'], ['rojo', 'Lejos de la meta'], ['sin', 'Sin meta o midiendo']].map(([e, n]) => ({ rotulo: n, valor: String(e === 'sin' ? cuenta.sin + cuenta.gris : cuenta[e]), valorNumero: e === 'sin' ? cuenta.sin + cuenta.gris : cuenta[e] })) },
      ...AREAS.map(a => ({ titulo: a, tabla: { columnas: [{ titulo: 'Indicador' }, { titulo: 'Resultado' }, { titulo: 'Meta' }, { titulo: 'Estado' }, { titulo: 'Qué hacer' }],
        filas: lista.filter(k => k.area === a && res[k.id]).map(k => [k.nombre, res[k.id].texto, res[k.id].metaTexto || textoMeta(k, metaDe(k)), ESTADO[estadoDe(k)][0], k.hacer(res[k.id], metaDe(k))]) } })).filter(s => s.tabla.filas.length),
    ],
  })

  return (
    <div style={{ background: C.fondo, color: C.tinta }} className="min-h-screen">
      <PageHeader sinEmpresa title="Reportes" subtitle={nombreEmpresa} actions={<Exportar armar={armar} />} />
      <div className="p-4 max-w-6xl mx-auto flex flex-col gap-4">
        <div className="bg-white rounded-[18px] p-3 flex gap-2.5 flex-wrap items-center">
          <Segmento opciones={PERIODOS} valor={periodo} onCambio={setPeriodo} etiqueta="Periodo" />
          {empresas.length > 1 && <Segmento opciones={[...empresas.map(e => [e.id, corto(e.nombre)]), ['grupo', 'Grupo']]} valor={sel} onCambio={setSel} etiqueta="Empresa" />}
          <span className="text-[13px] ml-auto" style={{ color: C.gris }}>{rango.nombre.replace(/^./, c => c.toUpperCase())}{periodo === 'mes' || periodo === 'semana' ? ` · hasta hoy` : ''}</span>
          <button type="button" onClick={() => setAgregando(!agregando)} aria-expanded={agregando} className="rounded-xl min-h-[40px] px-3.5 text-sm font-bold" style={{ background: C.suave }}>Agregar indicadores</button>
        </div>

        {agregando && (
          <div className="bg-white rounded-[18px] p-4 flex flex-col gap-3" style={{ boxShadow: `inset 0 0 0 2.5px ${C.tinta}` }}>
            <div className="flex justify-between gap-2 items-center flex-wrap"><h2 className="text-[19px] font-extrabold" style={titulo}>Agregar indicadores</h2>
              <button type="button" onClick={() => setAgregando(false)} className="rounded-xl min-h-[36px] px-3 text-sm font-bold" style={{ background: C.suave }}>Cerrar</button></div>
            <span className="text-[11.5px] font-extrabold uppercase tracking-wider" style={{ color: C.gris }}>Disponibles para el tablero</span>
            {aplicables.filter(k => ocultos.lista.includes(k.id)).length === 0
              ? <p className="text-sm" style={{ color: C.gris }}>Todos los indicadores están en el tablero</p>
              : <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                {aplicables.filter(k => ocultos.lista.includes(k.id)).map(k => (
                  <div key={k.id} className="rounded-xl p-3 flex items-center gap-3" style={{ background: C.fondo }}>
                    <span className="flex-1 min-w-0"><b className="text-sm">{k.nombre}</b><br /><span className="text-[12.5px]" style={{ color: C.gris }}>{k.area}</span></span>
                    <button type="button" onClick={() => cambiarOcultos(ocultos.lista.filter(x => x !== k.id))} className="rounded-xl min-h-[36px] px-3 text-sm font-bold bg-white">Agregar</button>
                  </div>
                ))}
              </div>}
            <span className="text-[11.5px] font-extrabold uppercase tracking-wider pt-1" style={{ color: C.gris }}>Próximamente</span>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              {PROXIMOS.map(p => (
                <div key={p.nombre} className="rounded-xl p-3 flex flex-col gap-0.5" style={{ background: C.fondo }}>
                  <b className="text-sm">{p.nombre}</b><span className="text-[12.5px]" style={{ color: C.gris }}>Requiere: {p.necesita}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {[['verde', 'En la meta'], ['ambar', 'Cerca de la meta'], ['rojo', 'Lejos de la meta'], ['sin', 'Sin meta todavía']].map(([e, n]) => (
            <div key={e} className="bg-white rounded-[18px] px-4 py-3 flex items-center gap-3">
              <i className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: e === 'sin' ? C.linea : ESTADO[e][3] }} />
              <span><b className="text-[30px] leading-none tabular-nums block" style={titulo}>{e === 'sin' ? cuenta.sin + cuenta.gris : cuenta[e]}</b><span className="text-[13px]" style={{ color: C.gris }}>{n}</span></span>
            </div>
          ))}
        </div>

        {AREAS.map(a => {
          const deArea = lista.filter(k => k.area === a)
          if (!deArea.length) return null
          const k2 = deArea.find(k => k.id === abierto)
          return (
            <section key={a} className="flex flex-col gap-2.5">
              <h2 className="text-[21px] font-extrabold" style={titulo}>{a}</h2>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
                {deArea.map(k => <Tarjeta key={k.id} k={k} r={res[k.id]} meta={metaDe(k)} estado={estadoDe(k)} hist={hist[k.id]?.meses} abierto={abierto === k.id} onClick={() => setAbierto(abierto === k.id ? null : k.id)} />)}
              </div>
              {k2 && res[k2.id] && <Detalle k={k2} r={res[k2.id]} meta={metas[k2.id]} estado={estadoDe(k2)} hist={hist[k2.id]} ctx={ctx} usuario={usuario}
                onQuitar={() => { setAbierto(null); cambiarOcultos([...ocultos.lista, k2.id]) }}
                onMeta={async (v) => { await guardarMeta(ctx, k2.id, v, metas[k2.id], usuario); setMetas(await cargarMetas(ctx)) }} />}
            </section>
          )
        })}
        {!lista.length && <p className="text-center py-16" style={{ color: C.gris }}>Cargando…</p>}
      </div>
    </div>
  )
}

function Segmento({ opciones, valor, onCambio, etiqueta }) {
  return (
    <div className="flex gap-1 rounded-full p-1 flex-wrap" style={{ background: C.fondo }} role="group" aria-label={etiqueta}>
      {opciones.map(([v, n]) => (
        <button key={v} type="button" aria-pressed={valor === v} onClick={() => onCambio(v)} className="rounded-full min-h-[36px] px-3.5 text-[13.5px] font-bold"
          style={valor === v ? { background: '#fff', color: C.tinta, boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { color: C.gris }}>{n}</button>
      ))}
    </div>
  )
}

function Tarjeta({ k, r, meta, estado, hist, abierto, onClick }) {
  const e = ESTADO[estado || 'sin']
  const barra = r && r.valor != null && (meta != null || k.id === 'meta_mes') && k.grafica !== 'puntos'
  const objetivo = k.id === 'meta_mes' ? r?.ritmo : meta
  const tope = barra ? Math.max(r.valor, objetivo || 0) * 1.15 || 1 : 1
  return (
    <button type="button" onClick={onClick} aria-expanded={abierto} className="bg-white rounded-[18px] px-4 pt-3.5 pb-3 flex flex-col gap-1.5 text-left min-w-0"
      style={abierto ? { boxShadow: `inset 0 0 0 2.5px ${C.tinta}` } : undefined}>
      <span className="flex justify-between gap-2 items-start">
        <span className="font-bold text-sm">{k.nombre}</span>
        {r && <span className="inline-flex items-center gap-1.5 text-xs font-extrabold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: e[1], color: e[2] }}><i className="w-2 h-2 rounded-full" style={{ background: 'currentColor' }} />{e[0]}</span>}
      </span>
      <span className="cifra-caja"><span className="cifra font-extrabold tabular-nums" style={{ ...titulo, '--cifra-max': '30px' }}>{r ? r.texto : '…'}</span></span>
      {barra && objetivo != null && (
        <span className="relative h-2 rounded" style={{ background: C.suave }} aria-hidden="true">
          <i className="block h-full rounded" style={{ width: `${Math.min(100, Math.max(0, r.valor) / tope * 100)}%`, background: e[3] }} />
          <span className="absolute -top-[3px] w-0.5 h-3.5" style={{ left: `${objetivo / tope * 100}%`, background: C.tinta }} />
        </span>
      )}
      <span className="text-[13px]" style={{ color: C.gris }}>{r ? (r.metaTexto || textoMeta(k, meta)) : ''}</span>
      <span className="text-[13px]" style={{ color: C.gris }}>{r?.sig}</span>
      <Chispa valores={hist} color={e[3]} />
    </button>
  )
}

function Chispa({ valores, color }) {
  // Los meses del principio en cero son de antes de que hubiera datos: no se dibujan.
  const conDato = (valores || []).filter(v => v.valor != null)
  const desde = conDato.findIndex(v => v.valor !== 0)
  const l = desde < 0 ? [] : conDato.slice(desde)
  if (l.length < 2) return <span className="text-[12px]" style={{ color: C.gris }}>{valores ? 'Sin historia todavía' : ''}</span>
  const W = 150, H = 32, max = Math.max(...l.map(v => v.valor)), min = Math.min(...l.map(v => v.valor))
  const x = (i) => 4 + i * (W - 8) / (l.length - 1), y = (v) => 4 + (max - v) * (H - 8) / ((max - min) || 1)
  return (
    <svg width={W} height={H} role="img" aria-label={`Últimos meses: ${l.map(v => `${v.etiqueta} ${Math.round(v.valor * 10) / 10}`).join(', ')}`}>
      <polyline fill="none" stroke={color} strokeWidth="2" points={l.map((v, i) => `${x(i)},${y(v.valor)}`).join(' ')} />
      <circle cx={x(l.length - 1)} cy={y(l[l.length - 1].valor)} r="3.5" fill={color} />
    </svg>
  )
}

function Detalle({ k, r, meta, estado, hist, usuario, onMeta, onQuitar }) {
  const [escala, setEscala] = useState(k.soloMes ? 'meses' : 'meses')
  const [tipo, setTipo] = useState(null)
  const [nueva, setNueva] = useState('')
  const [guardando, setGuardando] = useState(false)
  const caja = useRef(null)
  // Al abrir, que se vea: en el celular el detalle queda debajo de las tarjetas del área.
  useEffect(() => { caja.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }) }, [k.id])
  const metaN = meta ? Number(meta.meta) : null
  const datos = hist?.[escala]
  const guardar = async () => {
    const v = Number(String(nueva).replace(/\./g, '').replace(',', '.'))
    if (!isFinite(v)) return
    setGuardando(true)
    try { await onMeta(v); setNueva('') } catch (err) { alert('No se pudo guardar la meta: ' + err.message) }
    setGuardando(false)
  }
  return (
    <div ref={caja} className="bg-white rounded-[18px] p-4 md:p-5 grid gap-5 md:grid-cols-2 scroll-mt-24" style={{ boxShadow: `inset 0 0 0 2.5px ${C.tinta}` }}>
      <div className="flex flex-col gap-2 min-w-0">
        <span className="text-[11.5px] font-extrabold uppercase tracking-wider" style={{ color: C.gris }}>{k.nombre}</span>
        <h3 className="text-xl font-extrabold" style={titulo}>{r.texto} · {(r.metaTexto || textoMeta(k, metaN)).replace(/^Meta: /, 'meta ')}</h3>
        <span className="text-[13px]" style={{ color: C.gris }}>{r.sig}</span>
        <span className="text-[11.5px] font-extrabold uppercase tracking-wider pt-2" style={{ color: C.gris }}>Acción recomendada</span>
        <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: estado === 'verde' ? C.verdeF : C.ambarF }}>{k.hacer(r, metaN)}</div>
        {!k.metaPropia && (
          <div className="flex gap-2 items-center flex-wrap pt-1">
            <input inputMode="decimal" value={nueva} onChange={e => setNueva(e.target.value)} placeholder={metaN != null ? `Meta actual: ${metaN.toLocaleString('es-CO')}` : 'Poner la meta'}
              aria-label={`Meta de ${k.nombre}`} className="flex-1 min-w-[160px] h-10 rounded-xl border-2 px-3 font-bold bg-white" style={{ borderColor: C.linea }} />
            <span className="text-xs" style={{ color: C.gris }}>{k.unidad === '%' ? '%' : k.unidad === '$100' ? 'de cada $100' : k.unidad === '$' ? 'pesos' : k.unidad === 'h' ? 'horas' : k.unidad === 'días' ? 'días' : ''}</span>
            <button type="button" disabled={!nueva || guardando || usuario?.rol !== 'admin'} onClick={guardar} className="h-10 rounded-xl px-4 text-sm font-bold disabled:opacity-40" style={{ background: C.suave }}>{metaN != null ? 'Cambiar la meta' : 'Poner meta'}</button>
          </div>
        )}
        <button type="button" onClick={onQuitar} className="self-start text-[13px] font-bold underline pt-1" style={{ color: C.gris }}>Quitar del tablero</button>
      </div>
      <div className="flex flex-col gap-2 min-w-0">
        <span className="text-[11.5px] font-extrabold uppercase tracking-wider" style={{ color: C.gris }}>Cómo va cada uno</span>
        {r.filas?.length ? (
          <div className="flex flex-col">
            {r.filas.map(([n, v], i) => <div key={i} className="flex justify-between gap-3 py-2 border-t first:border-t-0 text-sm" style={{ borderColor: C.linea }}><span className="min-w-0">{n}</span><b className="tabular-nums text-right">{v}</b></div>)}
          </div>
        ) : <span className="text-sm" style={{ color: C.gris }}>Sin detalle en el periodo.</span>}
      </div>
      <div className="md:col-span-2 flex flex-col gap-2 min-w-0">
        <div className="flex justify-between gap-2 flex-wrap items-center">
          <span className="text-[11.5px] font-extrabold uppercase tracking-wider" style={{ color: C.gris }}>{k.soloHoy ? 'Cómo está hoy' : k.grafica === 'puntos' ? 'Lote por lote' : 'Resultados anteriores'}</span>
          <span className="flex gap-2 flex-wrap">
            {!k.soloMes && !k.soloHoy && k.grafica !== 'puntos' && <Segmento opciones={[['meses', 'Por mes'], ['semanas', 'Por semana']]} valor={escala} onCambio={setEscala} etiqueta="Escala" />}
            {(k.grafica === 'linea' || k.grafica === 'barras') && <Segmento opciones={[['linea', 'Línea'], ['barras', 'Barras']]} valor={tipo || k.grafica} onCambio={setTipo} etiqueta="Tipo de gráfica" />}
          </span>
        </div>
        {k.soloHoy ? (r.partes ? <Apilada partes={r.partes} /> : null)
          : k.grafica === 'puntos' ? <Puntos valores={r.puntos || []} estandar={k.id === 'telas' && r.estado !== 'gris' ? null : null} />
          : !datos ? <p className="text-sm py-8 text-center" style={{ color: C.gris }}>Calculando…</p>
          : <Grafica datos={datos} tipo={tipo || k.grafica} meta={k.id === 'meta_mes' ? 100 : metaN} sentido={k.sentido} unidad={k.unidad} />}
      </div>
    </div>
  )
}

const fmtV = (v, u) => u === '$' ? '$' + Math.round(v).toLocaleString('es-CO') : u === '$100' ? '$' + Math.round(v) : u === 'h' ? (Math.round(v * 10) / 10).toLocaleString('es-CO') + ' h' : u === 'días' ? (Math.round(v * 10) / 10).toLocaleString('es-CO') + ' d' : (Math.round(v * 10) / 10).toLocaleString('es-CO') + (u === '%' ? '%' : '')

function Grafica({ datos, tipo, meta, sentido, unidad }) {
  const l = datos.filter(d => d.valor != null)
  if (!l.length) return <p className="text-sm py-8 text-center" style={{ color: C.gris }}>Sin resultados anteriores</p>
  const W = 680, H = 230, ml = 60, mr = 14, mt = 18, mb = 28
  const vals = l.map(d => d.valor)
  const max = Math.max(...vals, meta ?? -Infinity, 0) * 1.12 || 1, min = Math.min(0, ...vals)
  const paso = (W - ml - mr) / datos.length
  const y = (v) => mt + (max - v) * (H - mt - mb) / (max - min || 1)
  const cx = (i) => ml + paso * (i + 0.5)
  const bien = (v) => meta == null ? null : sentido === 'mas' ? v >= meta : v <= meta
  const ticks = [0, 1, 2, 3, 4].map(i => min + (max - min) * i / 4)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Resultados: ${l.map(d => `${d.etiqueta} ${fmtV(d.valor, unidad)}`).join(', ')}`}>
      {ticks.map((v, i) => <g key={i}><line x1={ml} x2={W - mr} y1={y(v)} y2={y(v)} stroke={C.linea} /><text x={ml - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill={C.gris}>{fmtV(v, unidad)}</text></g>)}
      {datos.map((d, i) => <text key={i} x={cx(i)} y={H - 8} textAnchor="middle" fontSize="11" fill={C.gris}>{d.etiqueta}</text>)}
      {tipo === 'barras' ? datos.map((d, i) => d.valor == null ? null : (
        <rect key={i} x={cx(i) - paso * 0.3} y={Math.min(y(d.valor), y(0))} width={paso * 0.6} height={Math.max(1, Math.abs(y(0) - y(d.valor)))} rx="4"
          fill={d.valor < 0 ? C.rojo : bien(d.valor) == null ? C.tinta : bien(d.valor) ? C.verde : C.rojo}><title>{`${d.etiqueta}: ${fmtV(d.valor, unidad)}`}</title></rect>
      )) : (
        <>
          <polyline fill="none" stroke={C.rojo} strokeWidth="2.5" points={datos.map((d, i) => d.valor == null ? null : `${cx(i)},${y(d.valor)}`).filter(Boolean).join(' ')} />
          {datos.map((d, i) => d.valor == null ? null : <circle key={i} cx={cx(i)} cy={y(d.valor)} r={i === datos.length - 1 ? 5 : 3.5} fill={C.rojo} stroke="#fff" strokeWidth="2"><title>{`${d.etiqueta}: ${fmtV(d.valor, unidad)}`}</title></circle>)}
        </>
      )}
      {meta != null && <><line x1={ml} x2={W - mr} y1={y(meta)} y2={y(meta)} stroke={C.tinta} strokeWidth="1.5" strokeDasharray="6 5" /><text x={W - mr} y={y(meta) - 6} textAnchor="end" fontSize="11.5" fontWeight="700" fill={C.tinta}>Meta {fmtV(meta, unidad)}</text></>}
      {(() => { const i = datos.map(d => d.valor != null).lastIndexOf(true); return i >= 0 ? <text x={cx(i)} y={y(datos[i].valor) - 10} textAnchor="middle" fontSize="12" fontWeight="800" fill={C.tinta}>{fmtV(datos[i].valor, unidad)}</text> : null })()}
    </svg>
  )
}

function Apilada({ partes }) {
  if (!partes) return null
  const COL = { 'Al día': C.verde, '1 a 15 días': C.amarillo, '16 a 30 días': '#E08A3C', 'Más de 30': C.rojo }
  const total = Object.values(partes).reduce((s, v) => s + v, 0) || 1
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-7 rounded-lg overflow-hidden gap-0.5" role="img" aria-label={Object.entries(partes).map(([n, v]) => `${n} ${Math.round(v / total * 100)}%`).join(', ')}>
        {Object.entries(partes).map(([n, v]) => v > 0 && <i key={n} style={{ flex: v, background: COL[n] }} title={`${n}: $${Math.round(v).toLocaleString('es-CO')}`} />)}
      </div>
      <div className="flex gap-4 flex-wrap text-[13px]" style={{ color: C.gris }}>
        {Object.entries(partes).map(([n, v]) => <span key={n} className="inline-flex items-center gap-1.5"><i className="w-3 h-3 rounded-[3px]" style={{ background: COL[n] }} />{n} · <b className="tabular-nums" style={{ color: C.tinta }}>{Math.round(v / total * 100)}%</b></span>)}
      </div>
    </div>
  )
}

function Puntos({ valores }) {
  if (!valores.length) return <p className="text-sm py-8 text-center" style={{ color: C.gris }}>Sin lotes cerrados</p>
  const W = 680, H = 210, ml = 44, mr = 14, mt = 14, mb = 26
  const n = Math.max(26, valores.length), lo = Math.floor((Math.min(...valores) - 5) / 5) * 5, hi = Math.ceil((Math.max(...valores) + 5) / 5) * 5
  const x = (i) => ml + (i + 0.5) * (W - ml - mr) / n, y = (v) => mt + (hi - v) * (H - mt - mb) / (hi - lo)
  const prom = valores.reduce((s, v) => s + v, 0) / valores.length
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Telas por bulto de ${valores.length} lotes`}>
      {[lo, (lo + hi) / 2, hi].map(v => <g key={v}><line x1={ml} x2={W - mr} y1={y(v)} y2={y(v)} stroke={C.linea} /><text x={ml - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill={C.gris}>{Math.round(v)}</text></g>)}
      <line x1={ml} x2={W - mr} y1={y(prom)} y2={y(prom)} stroke={C.tinta} strokeWidth="1.5" strokeDasharray="6 5" />
      <text x={W - mr} y={y(prom) - 6} textAnchor="end" fontSize="11.5" fontWeight="700" fill={C.tinta}>Promedio {Math.round(prom)}</text>
      {Array.from({ length: n }, (_, i) => i >= valores.length && <circle key={'v' + i} cx={x(i)} cy={H - mb - 4} r="2" fill={C.linea} />)}
      {valores.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="5" fill={C.tinta} stroke="#fff" strokeWidth="2"><title>{`Lote ${i + 1}: ${Math.round(v)}`}</title></circle>)}
      <text x={x(0)} y={H - 6} fontSize="11" fill={C.gris}>lote 1</text><text x={x(n - 1)} y={H - 6} textAnchor="end" fontSize="11" fill={C.gris}>lote {n}</text>
    </svg>
  )
}
