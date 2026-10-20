'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { referencias, empacado, estandar, pasoActual, NOMBRE_PASO, registrosDe, fmtHora, fmtNum, duracion, TEXTURAS, gramajeCrudo, rangoPaquete } from '@/lib/planta'
import { corto, mediana, promedio, medirLote, resumenHoy, filasEstandares, DATOS_A_MANO, fijarEstandar, rendimientoPromedio } from '@/lib/produccion-admin'
import InformeProduccion from './InformeProduccion'

export const C = {
  tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', linea: '#E3E1D8', suave: '#EFEDE6', neutro: '#E9E4D6',
  rojo: '#C41230', rojoF: '#FBE9E9', amarillo: '#F2B21B', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8',
}
export const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const tarjeta = 'bg-white rounded-[18px] p-4'
const PILL = { gris: [C.suave, C.gris], ambar: [C.ambarF, C.ambar], verde: [C.verdeF, C.verde], rojo: [C.rojoF, C.rojo] }
export const Pill = ({ tono = 'gris', children }) => <span className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: PILL[tono][0], color: PILL[tono][1] }}>{children}</span>
const Fila = ({ k, v }) => (
  <div className="flex justify-between gap-3 py-2 border-t first:border-t-0 text-sm" style={{ borderColor: C.linea }}>
    <span style={{ color: C.gris }}>{k}</span><span className="font-bold tabular-nums text-right">{v ?? <span className="font-normal" style={{ color: C.gris }}>Sin dato</span>}</span>
  </div>
)
const nombreTanque = (e, id) => e.tanques.find(t => t.id === id)?.nombre || 'Lote'
const PASOS = ['coccion', 'reposo', 'masa', 'troqueladora', 'empaque']

// --- Hoy -------------------------------------------------------------------------

export function Hoy({ e }) {
  const r = resumenHoy(e)
  const filas = e.referencias.map(p => [p, r.empacadoHoy[p.id] || 0]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...filas.map(([, n]) => n))
  return (
    <div className="flex flex-col gap-3">
      {r.abiertos.length === 0 ? (
        <div className={tarjeta}><b>No hay lotes de cocción abiertos.</b><p className="text-sm" style={{ color: C.gris }}>Cuando en la planta monten un tanque, aparece aquí con su paso.</p></div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          {r.abiertos.map(c => {
            const paso = pasoActual(e, c)
            const idx = PASOS.indexOf(paso)
            const { arriba, sigue } = referencias(e, c)
            const emp = empacado(e, c)
            const m = medirLote(e, c)
            const muestras = registrosDe(e, c.id, 'crudo')
            const ultima = muestras[muestras.length - 1]
            const maiz = e.maices.find(x => x.id === c.materia_prima_id)
            return (
              <div key={c.id} className={tarjeta + ' flex flex-col gap-3'}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[17px] font-extrabold" style={titulo}>{nombreTanque(e, c.tanque_id)} · {fmtNum(c.cantidad, Number(c.cantidad) % 1 ? 1 : 0)} bultos {maiz ? maiz.nombre.replace(/^Maíz /, '').toLowerCase() : ''}</h3>
                  <Pill tono={paso === 'coccion' || paso === 'reposo' ? 'gris' : 'ambar'}>{NOMBRE_PASO[paso]}</Pill>
                </div>
                <div className="flex gap-1" role="img" aria-label={`Va en ${NOMBRE_PASO[paso]}`}>
                  {PASOS.map((p, i) => <i key={p} className="flex-1 h-1.5 rounded-full" style={{ background: i < idx ? C.verde : i === idx ? C.amarillo : C.suave }} />)}
                </div>
                <div>
                  <Fila k="Montado" v={`${new Date(c.hora_montada).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', timeZone: 'America/Bogota' })} · ${fmtHora(c.hora_montada)}`} />
                  {paso === 'coccion' && <Fila k="Lleva cocinando" v={duracion(c.hora_montada)} />}
                  {paso === 'reposo' && <Fila k="Reposando desde" v={`${fmtHora(c.hora_apagado)} · lleva ${duracion(c.hora_apagado)}`} />}
                  {arriba && <Fila k="Troquelando" v={`${corto(e.referencias.find(p => p.id === arriba.producto_id))}${sigue ? ' · baja en ' + sigue.faltan + ' min' : ''}`} />}
                  {Object.values(emp).some(n => n) && <Fila k="Empacado" v={Object.entries(emp).filter(([, n]) => n).map(([pid, n]) => `${n} ${corto(e.referencias.find(p => p.id === pid))}`).join(' · ')} />}
                  {m.rend && <Fila k="Telas por bulto hasta ahora" v={fmtNum(m.rend.telas, 0)} />}
                  {ultima && <Fila k="Última muestra cruda" v={`${fmtHora(ultima.hora)} · ${fmtNum(ultima.peso_promedio_g)} g`} />}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start">
        <div className={tarjeta}>
          <div className="flex items-baseline justify-between gap-2 pb-3"><h3 className="text-[17px] font-extrabold" style={titulo}>Empacado hoy por referencia</h3><span className="text-[13px]" style={{ color: C.gris }}>Paquetes</span></div>
          {filas.length === 0 ? <p className="text-sm" style={{ color: C.gris }}>Todavía no se ha empacado nada hoy.</p> : (
            <div className="flex flex-col gap-2">
              {filas.map(([p, n]) => (
                <div key={p.id} className="grid items-center gap-2.5 text-sm" style={{ gridTemplateColumns: '140px minmax(0,1fr) 64px' }}>
                  <span className="truncate">{corto(p)}</span>
                  <span className="h-3.5 rounded-r" style={{ width: `${n / max * 100}%`, background: C.neutro }} />
                  <span className="text-right font-extrabold tabular-nums">{n.toLocaleString('es-CO')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={tarjeta}>
          <h3 className="text-[17px] font-extrabold pb-1" style={titulo}>Para revisar</h3>
          {r.avisos.length === 0 ? <p className="text-sm py-2" style={{ color: C.gris }}>Nada por ahora.</p> : r.avisos.map((a, i) => (
            <div key={i} className="flex gap-2.5 py-2.5 border-t first:border-t-0 text-sm" style={{ borderColor: C.linea }}>
              <span className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ background: a.tono === 'rojo' ? C.rojo : a.tono === 'verde' ? C.verde : C.amarillo }} />
              <span><b>{a.titulo}</b><br /><span className="text-[13px]" style={{ color: C.gris }}>{a.detalle}</span></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// --- Lotes de cocción -----------------------------------------------------------------

export function Lotes({ e }) {
  const [abierto, setAbierto] = useState(null)
  if (!e.lista.length) return <div className={tarjeta}><b>Todavía no hay lotes de cocción.</b><p className="text-sm" style={{ color: C.gris }}>Se registran desde la pantalla de planta.</p></div>
  return (
    <div className={tarjeta}>
      <div className="hidden md:grid gap-3 pb-2 text-xs font-bold uppercase tracking-wide" style={{ color: C.gris, gridTemplateColumns: '1.4fr 1fr 1.2fr 1fr 1fr .8fr .8fr' }}>
        <span>Lote</span><span>Maíz</span><span>Cocción</span><span>Textura</span><span className="text-right">Empacado</span><span className="text-right">Telas/bulto</span><span>Estado</span>
      </div>
      {e.lista.map(c => {
        const m = medirLote(e, c)
        const emp = Object.values(empacado(e, c)).reduce((s, n) => s + n, 0)
        const textura = TEXTURAS.find(t => t.n === c.textura)
        const maiz = e.maices.find(x => x.id === c.materia_prima_id)
        const sinCerrar = c.estado === 'abierto' && c.hora_sacada && new Date(c.hora_sacada).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) < e.hoy
        return (
          <div key={c.id} className="border-t" style={{ borderColor: C.linea }}>
            <button type="button" onClick={() => setAbierto(abierto === c.id ? null : c.id)} aria-expanded={abierto === c.id}
              className="w-full text-left grid gap-x-3 gap-y-1 py-3 items-center text-sm grid-cols-2 md:grid-cols-[1.4fr_1fr_1.2fr_1fr_1fr_.8fr_.8fr]">
              <span className="col-span-2 md:col-span-1"><b>{nombreTanque(e, c.tanque_id)}</b><br /><span className="text-[13px]" style={{ color: C.gris }}>{new Date(c.hora_montada).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Bogota' })} · {fmtHora(c.hora_montada)}</span></span>
              <span>{fmtNum(c.cantidad, Number(c.cantidad) % 1 ? 1 : 0)} {maiz ? maiz.nombre.replace(/^Maíz /, '').toLowerCase() : ''}</span>
              <span>{m.coccion != null ? duracion(c.hora_montada, c.hora_apagado) : '—'}{m.reposo != null ? ` · reposó ${duracion(c.hora_apagado, c.hora_sacada)}` : ''}</span>
              <span>{textura ? `${textura.n} · ${textura.nombre}` : '—'}</span>
              <span className="md:text-right tabular-nums">{emp ? `${emp.toLocaleString('es-CO')} paq.` : '—'}</span>
              <span className="md:text-right tabular-nums font-bold">{m.rend ? fmtNum(m.rend.telas, 0) : '—'}{m.rend && c.estado === 'abierto' ? <span className="font-normal text-[12px]" style={{ color: C.gris }}> en curso</span> : ''}</span>
              <span><Pill tono={c.estado === 'cerrado' ? 'verde' : 'ambar'}>{c.estado === 'cerrado' ? 'Cerrado' : sinCerrar ? 'Sin cerrar' : 'Abierto'}</Pill></span>
            </button>
            {abierto === c.id && <DetalleLote e={e} c={c} m={m} />}
          </div>
        )
      })}
    </div>
  )
}

function DetalleLote({ e, c, m }) {
  const emp = empacado(e, c)
  const textura = TEXTURAS.find(t => t.n === c.textura)
  // Embudo de la masa: solo con lo medido.
  const barras = m.masa ? [
    ['Masa que salió', m.masa, C.neutro],
    ['Empacado, en crudo', m.crudoEmp, C.amarillo],
    ['Desecho', m.desecho || 0, C.gris],
    ['Masa sin explicar', m.sinExplicar, C.rojo],
  ] : null
  // Si se pesó menos masa de la que se empacó (faltaron bolas), la escala es lo empacado.
  const escala = Math.max(m.masa || 0, (m.crudoEmp || 0) + (m.desecho || 0)) || 1
  return (
    <div className="pb-4 grid gap-4 md:grid-cols-2">
      <div>
        <Fila k="Cocción" v={m.coccion != null ? duracion(c.hora_montada, c.hora_apagado) : null} />
        <Fila k="Reposo en el tanque" v={m.reposo != null ? duracion(c.hora_apagado, c.hora_sacada) : null} />
        <Fila k="Agua" v={c.agua_l != null ? `${fmtNum(c.agua_l, 0)} L` : null} />
        <Fila k="Conservante" v={c.conservante_g != null ? `${fmtNum(c.conservante_g, 0)} g` : null} />
        <Fila k="Maíz pesado" v={c.maiz_kg != null ? `${fmtNum(c.maiz_kg)} kg` : null} />
        <Fila k="Textura al sacar" v={textura ? `${textura.n} · ${textura.nombre}` : null} />
        <Fila k="Absorción" v={m.absorcion != null ? `${fmtNum(m.absorcion, 0)}%` : null} />
        <Fila k="Masa (bolas pesadas)" v={m.masa ? `${fmtNum(m.masa)} kg · ${m.bolas} bolas` : null} />
        <Fila k="Merma de crudo a frío" v={m.merma != null ? `${fmtNum(m.merma)}% · ${m.nMermas} ${m.nMermas === 1 ? 'medición' : 'mediciones'}` : null} />
      </div>
      <div>
        {Object.entries(emp).filter(([, n]) => n).map(([pid, n]) => <Fila key={pid} k={corto(e.referencias.find(p => p.id === pid))} v={`${n} paquetes`} />)}
        <Fila k="Kilos empacados" v={m.rend ? `${fmtNum(m.rend.kg)} kg` : null} />
        <Fila k="Telas por bulto" v={m.rend ? fmtNum(m.rend.telas, 0) : null} />
        <Fila k="Reproceso" v={`${fmtNum(m.reproceso || 0)} kg`} />
        <Fila k="Desecho" v={`${fmtNum(m.desecho || 0)} kg`} />
        <Fila k="Atomizador llenado" v={`${m.aceite} ${m.aceite === 1 ? 'vez' : 'veces'}`} />
        {barras && (
          <div className="pt-3 flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: C.gris }}>A dónde se fue la masa</span>
            {barras.map(([k, v, color]) => (
              <div key={k} className="grid items-center gap-2 text-[13px]" style={{ gridTemplateColumns: '130px minmax(0,1fr) 70px' }}>
                <span>{k}</span>
                {v == null ? <span className="h-3 rounded" style={{ background: `repeating-linear-gradient(45deg, ${C.suave} 0 5px, ${C.linea} 5px 10px)` }} />
                  : <span className="h-3 rounded-r" style={{ width: `${Math.min(100, Math.max(1, Math.max(0, v) / escala * 100))}%`, background: color }} />}
                <span className="text-right font-bold tabular-nums">{v == null ? 'Sin dato' : `${fmtNum(v, 0)} kg`}</span>
              </div>
            ))}
            {m.crudoEmp == null && <span className="text-[12px]" style={{ color: C.gris }}>Sin merma medida no se puede pasar lo empacado a crudo.</span>}
            {m.sinExplicar != null && m.sinExplicar < 0 && <span className="text-[12px] font-bold" style={{ color: C.ambar }}>No cuadra: se empacó más de la masa pesada. Seguramente faltaron bolas por pesar en este lote.</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// --- Rendimiento ----------------------------------------------------------------------

export function Rendimiento({ e }) {
  const usados = e.maices.filter(m => e.lista.some(c => c.materia_prima_id === m.id))
  const [maizId, setMaizId] = useState(usados[0]?.id || e.maices[0]?.id)
  const [verInforme, setVerInforme] = useState(false)
  const cerrados = e.lista.filter(c => c.estado === 'cerrado' && c.materia_prima_id === maizId)
    .map(c => ({ c, m: medirLote(e, c) })).filter(x => x.m.rend?.telas > 0)
    .sort((a, b) => a.c.hora_montada.localeCompare(b.c.hora_montada))
  const valores = cerrados.map(x => x.m.rend.telas)
  const rp = rendimientoPromedio(e)
  const porTanque = e.tanques.map(t => ({ t, v: mediana(cerrados.filter(x => x.c.tanque_id === t.id).map(x => x.m.rend.telas)), n: cerrados.filter(x => x.c.tanque_id === t.id).length })).filter(x => x.n)
  const regs = Object.values(e.registros)
  const mermaRef = e.referencias.map(p => ({ p, v: promedio(regs.filter(r => r.tipo === 'merma' && r.producto_id === p.id).map(r => { const q = r.pesos_individuales || []; const fin = q[2] || q[1]; return q[0] && fin ? (1 - fin / q[0]) * 100 : null }).filter(v => v != null)) })).filter(x => x.v != null)
  const crudoRef = e.referencias.map(p => {
    const v = regs.filter(r => r.tipo === 'crudo' && r.producto_id === p.id).flatMap(r => (r.pesos_individuales || []).map(Number))
    const fijo = Number(estandar(e, 'peso_crudo_g', { productoId: p.id })?.valor)
    return { p, prom: promedio(v), n: v.length, fijo }
  }).filter(x => x.n)

  return (
    <div className="flex flex-col gap-3">
      {usados.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {usados.map(m => <button key={m.id} type="button" onClick={() => setMaizId(m.id)} className="rounded-full min-h-[40px] px-4 font-bold text-sm"
            style={m.id === maizId ? { background: '#fff', boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: C.suave }}>{m.nombre}</button>)}
        </div>
      )}
      <div className={tarjeta}>
        <div className="flex items-baseline justify-between gap-2 pb-2 flex-wrap"><h3 className="text-[17px] font-extrabold" style={titulo}>Telas por bulto, lote por lote</h3><span className="text-[13px]" style={{ color: C.gris }}>Lotes cerrados · últimos 45 días</span></div>
        {cerrados.length === 0 ? <p className="text-sm py-6 text-center" style={{ color: C.gris }}>Todavía no hay lotes cerrados con paquetes contados.</p> : <Grafica valores={valores} formula={rp.listo ? rp.valor : null} />}
        <p className="text-[13px] pt-2" style={{ color: C.gris }}>Cada punto es un lote cerrado. {rp.listo ? `La línea punteada es el promedio de ${rp.n} lotes: el estándar contra el que se compara.` : `Se está midiendo: con ${rp.meta} lotes cerrados el promedio queda como estándar. Mientras tanto no se compara con nada.`}</p>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className={tarjeta + ' flex flex-col gap-1'}><span className="text-[13px] font-bold" style={{ color: C.gris }}>Promedio medido · todos los maíces</span>
          <span className="text-[28px] font-extrabold leading-tight tabular-nums" style={titulo}>{rp.valor != null ? fmtNum(rp.valor, 0) : 'Sin dato'}</span>
          <span className="text-[13px]" style={{ color: C.gris }}>{rp.listo ? `Estándar con ${rp.n} lotes cerrados` : `${rp.n} de ${rp.meta} lotes para el estándar`}</span>
          {!rp.listo && <span className="h-2 rounded-full overflow-hidden mt-1" style={{ background: C.linea }}><i className="block h-full" style={{ width: `${Math.min(100, rp.n / rp.meta * 100)}%`, background: C.verde }} /></span>}</div>
        <div className={tarjeta + ' flex flex-col gap-1'}><span className="text-[13px] font-bold" style={{ color: C.gris }}>Por tanque</span>
          {porTanque.length ? porTanque.map(x => <span key={x.t.id} className="text-[15px] tabular-nums"><b>{fmtNum(x.v, 0)}</b> <span style={{ color: C.gris }}>{x.t.nombre} · {x.n} {x.n === 1 ? 'lote' : 'lotes'}</span></span>) : <span className="text-lg font-bold" style={{ color: C.gris }}>Sin dato</span>}</div>
        <div className={tarjeta + ' flex flex-col gap-1'}><span className="text-[13px] font-bold" style={{ color: C.gris }}>Merma de crudo a frío</span>
          {mermaRef.length ? mermaRef.map(x => <span key={x.p.id} className="text-[15px] tabular-nums"><b>{fmtNum(x.v)}%</b> <span style={{ color: C.gris }}>{corto(x.p)}</span></span>) : <span className="text-lg font-bold" style={{ color: C.gris }}>Sin dato</span>}</div>
        <div className={tarjeta + ' flex flex-col gap-1'}><span className="text-[13px] font-bold" style={{ color: C.gris }}>Peso crudo en troqueladora</span>
          {crudoRef.length ? crudoRef.map(x => <span key={x.p.id} className="text-[15px] tabular-nums"><b>{fmtNum(x.prom)} g</b> <span style={{ color: C.gris }}>{corto(x.p)}{x.fijo ? ` · ${x.prom > x.fijo ? '+' : ''}${fmtNum((x.prom / x.fijo - 1) * 100)}% vs estándar` : ` · ${x.n} arepas`}</span></span>) : <span className="text-lg font-bold" style={{ color: C.gris }}>Sin dato</span>}</div>
      </div>
      <div className={tarjeta}>
        <button type="button" onClick={() => setVerInforme(!verInforme)} className="w-full flex justify-between items-center text-left font-bold">
          <span>Informe por fechas <span className="font-normal text-[13px]" style={{ color: C.gris }}>· incluye lo anotado a mano</span></span><span style={{ color: C.gris }}>{verInforme ? 'Cerrar' : 'Abrir'}</span>
        </button>
        {verInforme && <div className="pt-3"><InformeProduccion /></div>}
      </div>
    </div>
  )
}

function Grafica({ valores, formula }) {
  const W = 720, H = 240, ml = 44, mr = 16, mt = 18, mb = 28
  const todos = formula ? [...valores, formula] : valores
  const lo = Math.floor((Math.min(...todos) - 5) / 10) * 10, hi = Math.ceil((Math.max(...todos) + 5) / 10) * 10
  const x = (i) => valores.length === 1 ? (ml + W - mr) / 2 : ml + i * (W - ml - mr) / (valores.length - 1)
  const y = (v) => mt + (hi - v) * (H - mt - mb) / (hi - lo)
  const ticks = []; for (let v = lo; v <= hi; v += (hi - lo > 40 ? 20 : 10)) ticks.push(v)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Telas por bulto en ${valores.length} lotes`}>
      {ticks.map(v => <g key={v}><line x1={ml} x2={W - mr} y1={y(v)} y2={y(v)} stroke={C.linea} /><text x={ml - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill={C.gris}>{v}</text></g>)}
      {formula && <><line x1={ml} x2={W - mr} y1={y(formula)} y2={y(formula)} stroke="#8C877C" strokeWidth="2" strokeDasharray="6 5" /><text x={W - mr} y={y(formula) - 6} textAnchor="end" fontSize="11.5" fontWeight="700" fill={C.gris}>Fórmula {Math.round(formula)}</text></>}
      {valores.length > 1 && <polyline fill="none" stroke={C.rojo} strokeWidth="2" points={valores.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />}
      {valores.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="4.5" fill={C.rojo} stroke="#fff" strokeWidth="2"><title>{`Lote ${i + 1}: ${Math.round(v)} Telas por bulto`}</title></circle>)}
      <text x={x(valores.length - 1)} y={y(valores[valores.length - 1]) + 18} textAnchor="end" fontSize="11.5" fontWeight="700" fill={C.tinta}>{Math.round(valores[valores.length - 1])}</text>
    </svg>
  )
}

// --- Estándares -----------------------------------------------------------------------

export function Estandares({ e, usuario, recargar }) {
  const [guardando, setGuardando] = useState(false)
  const [manual, setManual] = useState({})
  const [ofrecer, setOfrecer] = useState(null) // { maizId, telas }
  const filas = filasEstandares(e)

  const fijar = async (f, valor) => {
    if (valor == null || !isFinite(valor)) return
    setGuardando(true)
    try {
      await fijarEstandar(f, valor, usuario)
      if (f.clave === 'telas_por_bulto' && f.extra?.productoId) setOfrecer({ maizId: f.extra.productoId, telas: Math.round(valor * 100) / 100 })
      await recargar()
    } catch (err) { alert('No se pudo guardar: ' + err.message) }
    setGuardando(false)
  }

  // Las fórmulas de las referencias de ese maíz pasan a rendir lo medido, por peso
  // contra la Tela. El Kilo de Masa no: es masa cruda y su fórmula va aparte.
  const actualizarFormulas = async () => {
    setGuardando(true)
    const tela = e.referencias.find(p => /tela/i.test(p.nombre) && !/mini|amarill/i.test(p.nombre))
    const { data: forms } = await supabase.from('formulas').select('id, producto_id, rendimiento, formulas_detalle(id, materia_prima_id, cantidad)').eq('activo', true).in('producto_id', e.referencias.map(p => p.id))
    let n = 0
    for (const f of forms || []) {
      const p = e.referencias.find(x => x.id === f.producto_id)
      if (!p?.peso_estandar_g || /kilo de masa/i.test(p.nombre)) continue
      const d = (f.formulas_detalle || []).find(x => x.materia_prima_id === ofrecer.maizId)
      if (!d) continue
      const cantidad = (f.rendimiento || 1) * (Number(p.peso_estandar_g) / Number(tela.peso_estandar_g)) / ofrecer.telas
      const { error } = await supabase.from('formulas_detalle').update({ cantidad: Math.round(cantidad * 1e6) / 1e6 }).eq('id', d.id)
      if (!error) n++
    }
    setGuardando(false)
    setOfrecer(null)
    alert(`${n} fórmulas actualizadas. Costos ya usa ${ofrecer.telas} Telas por bulto.`)
    recargar()
  }

  return (
    <div className="flex flex-col gap-3">
      {ofrecer && (
        <div className="rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap" style={{ background: C.verdeF, color: C.verde }}>
          <span className="flex-1 min-w-[240px] text-sm font-bold">¿Actualizar las fórmulas de las referencias de {e.maices.find(m => m.id === ofrecer.maizId)?.nombre} a {ofrecer.telas} Telas por bulto? Así Costos usa lo medido. El Kilo de Masa no se toca.</span>
          <button type="button" onClick={() => setOfrecer(null)} className="rounded-xl px-3 min-h-[40px] font-bold bg-white" style={{ color: C.tinta }}>Ahora no</button>
          <button type="button" disabled={guardando} onClick={actualizarFormulas} className="rounded-xl px-3 min-h-[40px] font-bold text-white disabled:opacity-50" style={{ background: C.verde }}>Actualizar fórmulas</button>
        </div>
      )}
      <div className={tarjeta + ' overflow-x-auto'}>
        <table className="w-full text-sm min-w-[600px]">
          <thead><tr className="text-left text-xs uppercase tracking-wide" style={{ color: C.gris }}><th className="py-2 pr-3">Estándar</th><th className="py-2 pr-3">Medido</th><th className="py-2 pr-3">Fijado</th><th className="py-2" /></tr></thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={4} className="py-3" style={{ color: C.gris }}>Todo por medir. Los estándares aparecen cuando la planta registre lotes.</td></tr>}
            {filas.map(f => (
              <tr key={f.nombre} className="border-t" style={{ borderColor: C.linea }}>
                <td className="py-2.5 pr-3 font-bold">{f.nombre}</td>
                <td className="py-2.5 pr-3 tabular-nums">{f.medido != null ? `${fmtNum(f.medido, f.dec)} ${f.unidad}` : '—'} <span className="text-xs" style={{ color: C.gris }}>{f.n ? `· ${f.n} ${f.n === 1 ? 'dato' : 'datos'}` : ''}</span></td>
                <td className="py-2.5 pr-3 tabular-nums">{f.fijo ? `${fmtNum(f.fijo.valor, f.dec)} ${f.unidad}` : <span style={{ color: C.gris }}>Por medir</span>}</td>
                <td className="py-2.5 text-right">{f.medido != null && (!f.fijo || Math.abs(f.fijo.valor - f.medido) >= Math.pow(10, -f.dec)) && (
                  <button type="button" disabled={guardando} onClick={() => fijar(f, f.medido)} className="rounded-lg px-3 min-h-[34px] text-xs font-bold disabled:opacity-40" style={{ background: C.verdeF, color: C.verde }}>Fijar {fmtNum(f.medido, f.dec)}{f.unidad && f.unidad !== 'min' ? ` ${f.unidad}` : ''}</button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={tarjeta}>
        <h3 className="text-[17px] font-extrabold" style={titulo}>Gramaje en crudo de cada referencia</h3>
        <p className="text-[13px] pb-2" style={{ color: C.gris }}>Lo que debe pesar cada arepa recién troquelada. Sale en el monitor de arriba como un rango de ese peso a 2 g más. Mientras no se fije, sale uno provisional: el peso frío más la merma.</p>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {e.referencias.filter(p => !/kilo de masa/i.test(p.nombre)).map(p => {
            const fijo = estandar(e, 'gramaje_crudo_g', { productoId: p.id })
            const g = gramajeCrudo(e, p)
            const k = 'crudo' + p.id
            return (
              <div key={p.id} className="rounded-xl p-3 flex flex-col gap-2" style={{ background: C.fondo }}>
                <span className="text-[13px] font-bold">{corto(p)} <span className="font-normal" style={{ color: C.gris }}>· {g ? `${g.min} a ${g.max} g${g.provisional ? ' · provisional' : ''}` : 'sin dato'}</span></span>
                <div className="flex gap-2">
                  <input inputMode="decimal" placeholder="Peso en crudo" value={manual[k] ?? ''} onChange={ev => setManual({ ...manual, [k]: ev.target.value })}
                    className="flex-1 min-w-0 h-10 rounded-xl border-2 px-3 font-bold bg-white" style={{ borderColor: C.linea }} />
                  <span className="self-center text-xs" style={{ color: C.gris }}>g</span>
                  <button type="button" disabled={guardando || !manual[k]} onClick={() => { fijar({ clave: 'gramaje_crudo_g', extra: { productoId: p.id }, fijo }, Number(String(manual[k]).replace(',', '.'))); setManual({ ...manual, [k]: '' }) }}
                    className="rounded-xl px-3 text-xs font-bold disabled:opacity-40" style={{ background: C.suave }}>Guardar</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className={tarjeta}>
        <h3 className="text-[17px] font-extrabold" style={titulo}>Peso permitido del paquete</h3>
        <p className="text-[13px] pb-2" style={{ color: C.gris }}>Abajo pesan 3 paquetes por caja: en el rango sale verde, más liviano rojo y más pesado ámbar. Sin rango fijado se usa el peso del paquete ± la tolerancia.</p>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {e.referencias.filter(p => !/kilo de masa/i.test(p.nombre)).map(p => {
            const r = rangoPaquete(e, p)
            return (
              <div key={p.id} className="rounded-xl p-3 flex flex-col gap-2" style={{ background: C.fondo }}>
                <span className="text-[13px] font-bold">{corto(p)} <span className="font-normal" style={{ color: C.gris }}>· {r ? `${r.min.toLocaleString('es-CO')} a ${r.max.toLocaleString('es-CO')} g${r.fijo ? '' : ' · por tolerancia'}` : 'sin peso'}</span></span>
                <div className="flex gap-2">
                  {[['paquete_min_g', 'Mínimo'], ['paquete_max_g', 'Máximo']].map(([clave, n]) => {
                    const k = clave + p.id
                    return <input key={clave} inputMode="decimal" placeholder={n} aria-label={`${n} de ${corto(p)}`} value={manual[k] ?? ''} onChange={ev => setManual({ ...manual, [k]: ev.target.value })}
                      className="flex-1 min-w-0 h-10 rounded-xl border-2 px-3 font-bold bg-white" style={{ borderColor: C.linea }} />
                  })}
                  <button type="button" disabled={guardando || !(manual['paquete_min_g' + p.id] || manual['paquete_max_g' + p.id])}
                    onClick={async () => {
                      for (const clave of ['paquete_min_g', 'paquete_max_g']) {
                        const v = manual[clave + p.id]
                        if (v) await fijar({ clave, extra: { productoId: p.id }, fijo: estandar(e, clave, { productoId: p.id }) }, Number(String(v).replace(/\./g, '').replace(',', '.')))
                      }
                      setManual(m => ({ ...m, ['paquete_min_g' + p.id]: '', ['paquete_max_g' + p.id]: '' }))
                    }}
                    className="rounded-xl px-3 text-xs font-bold disabled:opacity-40" style={{ background: C.suave }}>Guardar</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className={tarjeta}>
        <h3 className="text-[17px] font-extrabold pb-2" style={titulo}>Datos que se ponen a mano</h3>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {DATOS_A_MANO.map(f => {
            const fijo = estandar(e, f.clave, f.extra)
            return (
              <div key={f.clave} className="rounded-xl p-3 flex flex-col gap-2" style={{ background: C.fondo }}>
                <span className="text-[13px] font-bold">{f.nombre} <span className="font-normal" style={{ color: C.gris }}>· {fijo ? `${fmtNum(fijo.valor, fijo.valor % 1 ? 1 : 0)} ${f.unidad}` : 'sin dato'}</span></span>
                <div className="flex gap-2">
                  <input inputMode="decimal" placeholder="Nuevo valor" value={manual[f.clave] ?? ''} onChange={ev => setManual({ ...manual, [f.clave]: ev.target.value })}
                    className="flex-1 min-w-0 h-10 rounded-xl border-2 px-3 font-bold bg-white" style={{ borderColor: C.linea }} />
                  <span className="self-center text-xs" style={{ color: C.gris }}>{f.unidad}</span>
                  <button type="button" disabled={guardando || !manual[f.clave]} onClick={() => { fijar({ ...f, fijo }, Number(String(manual[f.clave]).replace(',', '.'))); setManual({ ...manual, [f.clave]: '' }) }}
                    className="rounded-xl px-3 text-xs font-bold disabled:opacity-40" style={{ background: C.suave }}>Guardar</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
