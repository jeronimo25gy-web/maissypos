'use client'
import { useState, useEffect, useRef } from 'react'
import { getEmpresaId } from '@/lib/empresa'
import { subirSoporte } from '@/lib/soportes'
import {
  nuevoId, ahora, registrosDe, referencias, empacado, enBodega, telasPorBulto, estandar, unidadesPaquete,
  fmtHora, fmtNum, duracion, TEXTURAS, MOTIVOS_REPROCESO, MINUTOS_MUESTRA, NOMBRE_PASO, pasoActual,
} from '@/lib/planta'
import { C, titulo, Boton, Opcion, Campo, Etiqueta, Dato, Pill, Tarjeta, horaInput, isoDesdeHora, pitar } from './ui'

const PASOS = {
  arriba: [['coccion', 'Cocción'], ['masa', 'Masa'], ['troqueladora', 'Troqueladora'], ['horno', 'Horno']],
  abajo: [['empaque', 'Empaque'], ['reproceso', 'Reproceso y desecho']],
}
const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : NaN }
const esTroquelable = (p) => !/kilo de masa/i.test(p.nombre)
const corto = (p) => (p?.nombre || '').replace(/^Arepa (de Maíz )?/i, '')

export default function Lote({ estado, c, usuario, puesto, registrar, onVolver }) {
  const pasos = puesto === 'completo' ? [...PASOS.arriba, ...PASOS.abajo] : PASOS[puesto] || PASOS.arriba
  const sugerido = () => {
    if (puesto === 'abajo') return 'empaque'
    const p = pasoActual(estado, c)
    return p === 'reposo' ? 'coccion' : (pasos.find(([k]) => k === p) ? p : pasos[0][0])
  }
  const [paso, setPaso] = useState(sugerido)
  const tanque = estado.tanques.find(t => t.id === c.tanque_id)

  const reg = (tipo, extra) => ({ op: 'insert', tabla: 'produccion_muestras_peso', datos: {
    id: nuevoId(), empresa_id: getEmpresaId(), cochada_id: c.id, tipo, hora: ahora(), puesto,
    registrado_por: usuario.nombre, anulado: false, ...extra,
  } })
  const actualizar = (datos) => ({ op: 'update', tabla: 'produccion_cochadas', id: c.id, datos })
  const anular = (r) => ({ op: 'update', tabla: 'produccion_muestras_peso', id: r.id, datos: { anulado: true } })
  const props = { estado, c, usuario, puesto, registrar, reg, actualizar, anular }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <Boton onClick={onVolver}>Lotes</Boton>
        <h2 className="text-2xl font-extrabold flex-1 min-w-0" style={titulo}>{tanque?.nombre || 'Lote'} · {fmtNum(c.cantidad, Number(c.cantidad) % 1 ? 1 : 0)} bultos</h2>
        <Pill>Montado {new Date(c.hora_montada || c.created_at).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', timeZone: 'America/Bogota' })} · {fmtHora(c.hora_montada)}</Pill>
      </div>
      <nav className="flex gap-1.5 overflow-x-auto pb-0.5" aria-label="Pasos del lote">
        {pasos.map(([k, n]) => (
          <button key={k} type="button" onClick={() => setPaso(k)} aria-current={paso === k ? 'step' : undefined}
            className="shrink-0 rounded-xl min-h-[48px] px-4 font-bold whitespace-nowrap"
            style={paso === k ? { background: C.tinta, color: '#fff' } : { background: C.suave, color: C.gris }}>{n}</button>
        ))}
      </nav>
      {paso === 'coccion' && <Coccion {...props} />}
      {paso === 'masa' && <Masa {...props} />}
      {paso === 'troqueladora' && <Troqueladora {...props} />}
      {paso === 'horno' && <Horno {...props} />}
      {paso === 'empaque' && <Empaque {...props} />}
      {paso === 'reproceso' && <Reproceso {...props} />}
    </div>
  )
}

// --- Cocción, reposo y sacada ----------------------------------------------------

function Coccion({ estado, c, registrar, actualizar }) {
  const [, tic] = useState(0)
  useEffect(() => { const t = setInterval(() => tic(x => x + 1), 30000); return () => clearInterval(t) }, [])
  const [sacando, setSacando] = useState(false)
  const tiempoStd = estandar(estado, 'tiempo_coccion_min', { tanqueId: c.tanque_id })
  const corregir = (campo, hhmm) => hhmm && registrar(actualizar({ [campo]: isoDesdeHora(c[campo], hhmm) }))

  return (
    <Tarjeta>
      <h3 className="text-[22px] font-extrabold" style={titulo}>Cocción</h3>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="rounded-2xl px-4 py-3 flex flex-col gap-1" style={{ background: C.fondo }}>
          <span className="text-[13px]" style={{ color: C.gris }}>{c.hora_apagado ? 'Cocinó' : 'Lleva cocinando'}</span>
          <span className="text-[52px] leading-none font-extrabold tabular-nums" style={titulo}>{duracion(c.hora_montada, c.hora_apagado)}</span>
          <span className="text-[13px]" style={{ color: C.gris }}>Tiempo del tanque: {tiempoStd ? `${tiempoStd.valor} min` : <b>por medir</b>}</span>
        </div>
        <label className="flex flex-col gap-2"><Etiqueta>Hora de montada</Etiqueta>
          <input type="time" defaultValue={horaInput(c.hora_montada)} onBlur={e => corregir('hora_montada', e.target.value)}
            className="h-16 rounded-2xl border-2 bg-white px-4 text-2xl font-extrabold" style={{ borderColor: C.linea, ...titulo }} />
        </label>
        {c.hora_apagado && <label className="flex flex-col gap-2"><Etiqueta>Hora de apagado</Etiqueta>
          <input type="time" defaultValue={horaInput(c.hora_apagado)} onBlur={e => corregir('hora_apagado', e.target.value)}
            className="h-16 rounded-2xl border-2 bg-white px-4 text-2xl font-extrabold" style={{ borderColor: C.linea, ...titulo }} />
        </label>}
        <label className="flex flex-col gap-2"><Etiqueta extra="Opcional, si hay termómetro">Temperatura</Etiqueta>
          <Campo unidad="°C" placeholder="—" defaultValue={c.temperatura_c ?? ''} onBlur={e => e.target.value && registrar(actualizar({ temperatura_c: num(e.target.value) }))} />
        </label>
      </div>

      {!c.hora_apagado && (
        <div className="flex justify-end"><Boton tipo="rojo" grande className="min-w-[240px]" onClick={() => registrar(actualizar({ hora_apagado: ahora() }))}>Apagar el tanque</Boton></div>
      )}

      {c.hora_apagado && !c.hora_sacada && !sacando && (
        <>
          <div className="rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap" style={{ background: C.fondo }}>
            <span className="flex-1 min-w-[200px]"><b>Reposando en el tanque</b><br /><span className="text-[13px]" style={{ color: C.gris }}>Apagado a las {fmtHora(c.hora_apagado)} · lleva {duracion(c.hora_apagado)}</span></span>
          </div>
          <div className="flex justify-end"><Boton tipo="rojo" grande className="min-w-[240px]" onClick={() => setSacando(true)}>Sacar del tanque</Boton></div>
        </>
      )}

      {(sacando || c.hora_sacada) && <Sacar c={c} registrar={registrar} actualizar={actualizar} onListo={() => setSacando(false)} />}
    </Tarjeta>
  )
}

function Sacar({ c, registrar, actualizar, onListo }) {
  const yaSacado = !!c.hora_sacada
  const [textura, setTextura] = useState(c.textura || null)
  const [pesos, setPesos] = useState(() => Object.fromEntries((c.testigos || []).map(t => [t.pos, t.kg ?? ''])))
  const [foto, setFoto] = useState(c.textura_foto || null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')

  const subirFoto = async (file) => {
    if (!file) return
    setSubiendo(true); setError('')
    try { setFoto(await subirSoporte(file, 'produccion')) }
    catch (e) { setError('No se pudo subir la foto (¿hay señal?): ' + e.message) }
    setSubiendo(false)
  }
  const guardar = () => {
    if (!textura) { setError('Escoge cómo quedó el maíz.'); return }
    const testigos = (c.testigos || []).map(t => ({ pos: t.pos, kg: pesos[t.pos] === '' ? null : num(pesos[t.pos]) }))
    registrar(actualizar({ hora_sacada: c.hora_sacada || ahora(), textura, testigos: testigos.length ? testigos : null, textura_foto: foto }))
    onListo()
  }
  const abs = (c.testigos || []).map(t => ({ pos: t.pos, kg: num(pesos[t.pos]) })).filter(t => t.kg > 0)

  return (
    <div className="flex flex-col gap-4 pt-1">
      {yaSacado && <p className="text-sm" style={{ color: C.gris }}>Sacado a las <b>{fmtHora(c.hora_sacada)}</b>. Reposó {duracion(c.hora_apagado, c.hora_sacada)}.</p>}
      <Etiqueta extra="Aplasta un grano entre los dedos">¿Cómo quedó el maíz?</Etiqueta>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {TEXTURAS.map(t => (
          <Opcion key={t.n} sel={textura === t.n} onClick={() => setTextura(t.n)}>
            <b className="text-xl" style={titulo}>{t.n} · {t.nombre}</b>
            <span className="text-[12.5px]" style={{ color: C.gris }}>{t.detalle}</span>
          </Opcion>
        ))}
      </div>
      <label className="flex items-center gap-3 flex-wrap">
        <span className="rounded-2xl min-h-[52px] px-5 font-bold flex items-center cursor-pointer" style={{ background: C.suave }}>{subiendo ? 'Subiendo…' : foto ? 'Cambiar foto' : 'Tomar foto del grano'}</span>
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => subirFoto(e.target.files?.[0])} />
        {foto && <Pill tono="verde">Foto guardada</Pill>}
      </label>
      {(c.testigos || []).length > 0 && (
        <>
          <Etiqueta extra="Entraron de 1 kg">Peso de las bolsas testigo al sacarlas</Etiqueta>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            {c.testigos.map(t => (
              <label key={t.pos} className="flex flex-col gap-1.5"><span className="text-sm capitalize">{t.pos}</span>
                <Campo unidad="kg" placeholder="0,000" value={pesos[t.pos] ?? ''} onChange={e => setPesos({ ...pesos, [t.pos]: e.target.value })} />
              </label>
            ))}
          </div>
          {abs.length > 0 && <Dato rotulo="Absorción del maíz" valor={`${fmtNum(abs.reduce((s, t) => s + (t.kg - 1), 0) / abs.length * 100, 0)}%`}
            nota={abs.map(t => `${t.pos} ${fmtNum((t.kg - 1) * 100, 0)}%`).join(' · ')} />}
        </>
      )}
      {error && <p className="text-sm font-bold" style={{ color: C.rojo }}>{error}</p>}
      <div className="flex justify-end"><Boton tipo={yaSacado ? 'suave' : 'rojo'} grande className="min-w-[240px]" onClick={guardar}>{yaSacado ? 'Guardar cambios' : 'Listo, sacado'}</Boton></div>
    </div>
  )
}

// --- Masa: cada bola que sale de los rodillos ---------------------------------------

function Masa({ estado, c, registrar, reg, anular }) {
  const [kg, setKg] = useState('')
  const ref = useRef(null)
  const bolas = registrosDe(estado, c.id, 'bola')
  const total = bolas.reduce((s, b) => s + Number(b.cantidad), 0)
  const pesoBulto = estandar(estado, 'peso_bulto_kg')
  const sumar = () => {
    const v = num(kg)
    if (!(v > 0)) { ref.current?.focus(); return }
    registrar(reg('bola', { cantidad: v }))
    setKg(''); ref.current?.focus()
  }
  return (
    <Tarjeta>
      <h3 className="text-[22px] font-extrabold" style={titulo}>Masa: pesa cada bola que sale de los rodillos</h3>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <div className="flex flex-col gap-3">
          <Etiqueta>Peso de la bola</Etiqueta>
          <Campo ref={ref} unidad="kg" placeholder="0,0" value={kg} onChange={e => setKg(e.target.value)} onKeyDown={e => e.key === 'Enter' && sumar()} />
          <Boton tipo="tinta" className="min-h-[72px] text-2xl" onClick={sumar}>+ bola</Boton>
          <p className="text-[13px]" style={{ color: C.gris }}>El retal y la arepa cruda que vuelven a los rodillos no se pesan otra vez.</p>
        </div>
        <div className="flex flex-col gap-3">
          <Dato rotulo="Masa de este lote" valor={`${fmtNum(total)} kg`} nota={bolas.length ? `${bolas.length} bolas · la última ${fmtNum(bolas[bolas.length - 1].cantidad)} kg` : 'Todavía no hay bolas'} />
          <Dato rotulo="Masa por kg de maíz" sinDato={!pesoBulto || !total} valor={pesoBulto && total ? `${fmtNum(total / (Number(c.cantidad) * Number(pesoBulto.valor)), 2)} kg` : ''}
            nota={pesoBulto ? 'Va subiendo mientras salen bolas' : 'Falta pesar bultos con la báscula de plataforma'} />
          {bolas.length > 0 && <Boton onClick={() => registrar(anular(bolas[bolas.length - 1]))}>Borrar la última bola</Boton>}
        </div>
      </div>
    </Tarjeta>
  )
}

// --- Troqueladora: referencia actual, muestras de 5 arepas crudas y aceite ---------------

function Troqueladora({ estado, c, registrar, reg }) {
  const [, tic] = useState(0)
  useEffect(() => { const t = setInterval(() => tic(x => x + 1), 30000); return () => clearInterval(t) }, [])
  const refs = estado.referencias.filter(esTroquelable)
  const { arriba } = referencias(estado, c)
  const actual = estado.referencias.find(p => p.id === arriba?.producto_id)
  const muestras = registrosDe(estado, c.id, 'crudo')
  const ultima = muestras[muestras.length - 1]
  const desde = [ultima?.hora, arriba?.hora].filter(Boolean).sort().pop()
  const minDesde = desde ? Math.floor((Date.now() - new Date(desde).getTime()) / 60000) : null
  const toca = actual && (!ultima || ultima.hora < arriba.hora || minDesde >= MINUTOS_MUESTRA)
  const [pesos, setPesos] = useState(['', '', '', '', ''])
  const avisado = useRef(null)
  useEffect(() => {
    const clave = `${actual?.id}-${ultima?.id}-${minDesde >= MINUTOS_MUESTRA}`
    if (toca && avisado.current !== clave) { avisado.current = clave; pitar() }
  })
  const aceites = registrosDe(estado, c.id, 'aceite')
  const mismaRef = muestras.filter(m => m.producto_id === actual?.id)

  const cambiar = (p) => { if (p.id !== actual?.id) { registrar(reg('cambio_ref', { producto_id: p.id })); setPesos(['', '', '', '', '']) } }
  const listos = pesos.every(v => num(v) > 0)
  const prom = listos ? pesos.reduce((s, v) => s + num(v), 0) / 5 : null
  const guardar = () => {
    if (!listos) return
    const ps = pesos.map(num)
    registrar(reg('crudo', { producto_id: actual.id, pesos_individuales: ps, peso_promedio_g: ps.reduce((s, v) => s + v, 0) / ps.length }))
    setPesos(['', '', '', '', ''])
  }

  return (
    <Tarjeta>
      {toca && (
        <div className="rounded-2xl px-4 py-3" role="status" style={{ background: C.ambarF, color: C.ambar }}>
          <span className="text-sm font-bold">{ultima && ultima.hora >= arriba.hora ? `Hace ${minDesde} min fue la última muestra` : 'Cambiaron de referencia'}</span><br />
          <b className="text-2xl" style={{ ...titulo, color: C.tinta }}>Pesa 5 arepas de: {corto(actual)}</b>
        </div>
      )}
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h3 className="text-[22px] font-extrabold" style={titulo}>{actual ? `Ahora se está haciendo: ${corto(actual)}` : '¿Qué se está troquelando?'}</h3>
        <span className="text-[13px]" style={{ color: C.gris }}>{actual ? `Desde las ${fmtHora(arriba.hora)} · toca otra si cambiaron el molde` : 'Toca la referencia para empezar'}</span>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {refs.map(p => <Opcion key={p.id} sel={p.id === actual?.id} onClick={() => cambiar(p)}><b className="text-lg" style={titulo}>{corto(p)}</b></Opcion>)}
      </div>
      <p className="text-[13px]" style={{ color: C.gris }}>Al cambiar de referencia, la pantalla de empaque avisa sola qué viene bajando.</p>

      {actual && (
        <>
          <Etiqueta extra="Recién troqueladas, antes del horno">Peso de 5 arepas crudas de {corto(actual)}</Etiqueta>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {pesos.map((v, i) => (
              <input key={i} inputMode="decimal" placeholder="g" value={v} aria-label={`Arepa ${i + 1}`}
                onChange={e => setPesos(pesos.map((x, j) => j === i ? e.target.value : x))}
                className="h-16 rounded-2xl border-2 bg-white text-center text-2xl font-extrabold" style={{ borderColor: C.linea, ...titulo }} />
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm">{prom ? <>Promedio <b>{fmtNum(prom)} g</b></> : 'Escribe los 5 pesos en gramos'}</span>
            <Boton tipo="verde" disabled={!listos} onClick={guardar}>Guardar muestra</Boton>
          </div>
          {mismaRef.length > 0 && (
            <div className="flex flex-col">
              {mismaRef.slice(-6).reverse().map(m => (
                <div key={m.id} className="flex justify-between gap-3 py-2 border-t text-sm" style={{ borderColor: C.linea }}>
                  <b>{fmtHora(m.hora)}</b><span className="tabular-nums" style={{ color: C.gris }}>{(m.pesos_individuales || []).join(' · ')} g · prom {fmtNum(m.peso_promedio_g)} g</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap" style={{ background: C.fondo }}>
        <span className="flex-1 min-w-[200px]"><b>Aceite de la lona</b><br /><span className="text-[13px]" style={{ color: C.gris }}>{aceites.length ? `Atomizador llenado ${aceites.length} ${aceites.length === 1 ? 'vez' : 'veces'} en este lote · la última a las ${fmtHora(aceites[aceites.length - 1].hora)}` : 'Toca cada vez que llenes el atomizador'}</span></span>
        <Boton tipo="blanco" onClick={() => registrar(reg('aceite', { cantidad: 1 }))}>Llené el atomizador</Boton>
      </div>
    </Tarjeta>
  )
}

// --- Horno: merma de 10 arepas (crudas, al salir y frías) ----------------------------------

function Horno({ estado, c, registrar, reg }) {
  const { arriba } = referencias(estado, c)
  const [prodId, setProdId] = useState(arriba?.producto_id || '')
  const [g, setG] = useState({ crudo: '', asado: '', frio: '' })
  const mermas = registrosDe(estado, c.id, 'merma')
  const p = estado.referencias.find(x => x.id === prodId)
  const cr = num(g.crudo), as = num(g.asado), fr = num(g.frio)
  const guardar = () => {
    if (!p || !(cr > 0) || !(as > 0)) return
    registrar(reg('merma', { producto_id: p.id, pesos_individuales: [cr, as, fr > 0 ? fr : null].filter(v => v != null), peso_promedio_g: cr / 10 }))
    setG({ crudo: '', asado: '', frio: '' })
  }
  return (
    <Tarjeta>
      <h3 className="text-[22px] font-extrabold" style={titulo}>Horno y enfriamiento: merma</h3>
      <p className="text-sm" style={{ color: C.gris }}>Pesa 10 arepas crudas juntas, otra vez al salir del horno y una última vez frías. Es agua que se evapora, no pérdida. Dos veces al día.</p>
      <div className="flex gap-2 flex-wrap">
        {estado.referencias.filter(esTroquelable).map(x => (
          <button key={x.id} type="button" onClick={() => setProdId(x.id)} className="rounded-full min-h-[48px] px-4 font-bold"
            style={x.id === prodId ? { background: '#fff', boxShadow: `inset 0 0 0 2.5px ${C.tinta}` } : { background: C.suave }}>{corto(x)}</button>
        ))}
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <label className="flex flex-col gap-1.5"><Etiqueta>10 crudas</Etiqueta><Campo unidad="g" value={g.crudo} onChange={e => setG({ ...g, crudo: e.target.value })} /></label>
        <label className="flex flex-col gap-1.5"><Etiqueta>Al salir del horno</Etiqueta><Campo unidad="g" value={g.asado} onChange={e => setG({ ...g, asado: e.target.value })} /></label>
        <label className="flex flex-col gap-1.5"><Etiqueta>Frías</Etiqueta><Campo unidad="g" value={g.frio} onChange={e => setG({ ...g, frio: e.target.value })} /></label>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <Dato rotulo="En el horno" sinDato={!(cr > 0 && as > 0)} valor={`${fmtNum((cr - as) / 10)} g`} nota="por arepa" />
        <Dato rotulo="Enfriando" sinDato={!(as > 0 && fr > 0)} valor={`${fmtNum((as - fr) / 10)} g`} nota="por arepa" />
        <Dato rotulo="Merma total" sinDato={!(cr > 0 && (fr > 0 || as > 0))} valor={`${fmtNum((1 - (fr > 0 ? fr : as) / cr) * 100)}%`} nota={fr > 0 ? 'De crudo a frío' : 'Solo horno, falta frío'} />
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Pill tono={mermas.length >= 2 ? 'verde' : 'ambar'}>{mermas.length} de 2 mediciones en este lote</Pill>
        <Boton tipo="verde" disabled={!p || !(cr > 0) || !(as > 0)} onClick={guardar}>Guardar medición</Boton>
      </div>
    </Tarjeta>
  )
}

// --- Abajo: empaque, llegó la referencia, pasar a bodega y cerrar -------------------------

function Empaque({ estado, c, usuario, registrar, reg, actualizar }) {
  const [, tic] = useState(0)
  useEffect(() => { const t = setInterval(() => tic(x => x + 1), 30000); return () => clearInterval(t) }, [])
  const { bajando, sigue } = referencias(estado, c)
  const nombre = (id) => corto(estado.referencias.find(p => p.id === id))
  const emp = empacado(estado, c)
  const bod = enBodega(estado, c)
  // Lo que está bajando va primero; el resto en orden fijo para que los botones no se muevan al tocar.
  const orden = [...estado.referencias].sort((a, b) => (b.id === bajando?.producto_id) - (a.id === bajando?.producto_id))
  const pendiente = Object.entries(emp).reduce((s, [pid, n]) => s + Math.max(0, n - (bod[pid] || 0)), 0)
  const rend = telasPorBulto(estado, c)
  const [revision, setRevision] = useState(['', '', ''])
  const [cerrando, setCerrando] = useState(false)
  const pRev = estado.referencias.find(p => p.id === bajando?.producto_id)

  const sumar = (p, n) => {
    if ((emp[p.id] || 0) + n < 0) return
    registrar(reg('empaque', { producto_id: p.id, cantidad: n }))
  }
  const pasar = () => registrar({ op: 'rpc', rpc: 'produccion_pasar_a_bodega', args: { p_cochada_id: c.id, p_usuario: usuario.nombre } })
  const cerrar = () => {
    registrar([
      { op: 'rpc', rpc: 'produccion_pasar_a_bodega', args: { p_cochada_id: c.id, p_usuario: usuario.nombre } },
      actualizar({ estado: 'cerrado', cerrado_at: ahora(), cerrado_por: usuario.nombre }),
    ])
  }
  const guardarRevision = () => {
    const ps = revision.map(num)
    if (!pRev || !ps.every(v => v > 0)) return
    registrar(reg('paquete', { producto_id: pRev.id, pesos_individuales: ps, peso_promedio_g: ps.reduce((s, v) => s + v, 0) / ps.length, peso_estandar_g: pRev.peso_estandar_g }))
    setRevision(['', '', ''])
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <div className="rounded-[20px] p-4 bg-white flex flex-col gap-1">
          <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: C.gris }}>Bajando ahora</span>
          <span className="text-4xl font-extrabold" style={titulo}>{bajando ? nombre(bajando.producto_id) : '—'}</span>
        </div>
        <div className="rounded-[20px] p-4 flex flex-col gap-2" style={sigue ? { background: C.amarillo, color: C.tinta } : { background: '#fff' }}>
          <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: sigue ? C.tinta : C.gris }}>{sigue ? `Sigue · llega en unos ${sigue.faltan} min` : 'Sigue'}</span>
          {sigue ? <>
            <span className="text-3xl font-extrabold" style={titulo}>{nombre(sigue.producto_id)} · alisten bolsas</span>
            <Boton tipo="blanco" onClick={() => registrar(reg('llego_ref', { producto_id: sigue.producto_id }))}>Ya llegó {nombre(sigue.producto_id)}</Boton>
          </> : <span className="font-bold" style={{ color: C.gris }}>Sin cambio en camino</span>}
        </div>
      </div>

      <Tarjeta>
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h3 className="text-[22px] font-extrabold" style={titulo}>Paquetes de este lote</h3>
          <span className="text-[13px]" style={{ color: C.gris }}>Solo se cuentan, no se pesan</span>
        </div>
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
          {orden.map(p => (
            <div key={p.id} className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: C.fondo, boxShadow: p.id === bajando?.producto_id ? `inset 0 0 0 2.5px ${C.tinta}` : 'none' }}>
              <div className="flex justify-between gap-2"><b>{corto(p)}</b><span className="text-xs" style={{ color: C.gris }}>{bod[p.id] ? `${bod[p.id]} en bodega` : ''}</span></div>
              <div className="flex items-center gap-2">
                <Boton className="!px-0 w-14" onClick={() => sumar(p, -10)} aria-label={`Restar 10 de ${corto(p)}`}>−10</Boton>
                <span className="flex-1 text-center text-3xl font-extrabold tabular-nums" style={titulo}>{emp[p.id] || 0}</span>
                <Boton className="!px-0 w-14" onClick={() => sumar(p, 1)} aria-label={`Sumar 1 a ${corto(p)}`}>+1</Boton>
                <Boton tipo="tinta" className="!px-0 w-16" onClick={() => sumar(p, 10)} aria-label={`Sumar 10 a ${corto(p)}`}>+10</Boton>
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <Dato rotulo="Telas por bulto en este lote" sinDato={!rend} valor={rend ? fmtNum(rend.telas, 0) : ''} nota={rend ? `${fmtNum(rend.kg)} kg empacados ÷ peso de la Tela ÷ ${fmtNum(c.cantidad, 0)} bultos` : 'Cuenta paquetes para verlo'} />
          <div className="rounded-2xl px-4 py-3 flex flex-col gap-2" style={{ background: C.fondo }}>
            <span className="text-[13px]" style={{ color: C.gris }}>Por pasar a bodega</span>
            <span className="text-[26px] font-extrabold leading-tight tabular-nums" style={titulo}>{pendiente} paquetes</span>
            <Boton tipo="blanco" disabled={!pendiente} onClick={pasar}>Pasar a bodega</Boton>
          </div>
        </div>
      </Tarjeta>

      {pRev && (
        <Tarjeta>
          <Etiqueta extra="Una vez al día, de lo que esté bajando">Revisión: 3 paquetes de {corto(pRev)} en la gramera</Etiqueta>
          <div className="grid grid-cols-3 gap-2">
            {revision.map((v, i) => <input key={i} inputMode="decimal" placeholder="g" value={v} aria-label={`Paquete ${i + 1}`}
              onChange={e => setRevision(revision.map((x, j) => j === i ? e.target.value : x))}
              className="h-16 rounded-2xl border-2 bg-white text-center text-2xl font-extrabold" style={{ borderColor: C.linea, ...titulo }} />)}
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm" style={{ color: C.gris }}>Debe pesar {pRev.peso_estandar_g ? `${fmtNum(pRev.peso_estandar_g)} g` : '—'}{unidadesPaquete(pRev) ? ` · ${unidadesPaquete(pRev)} arepas` : ''}</span>
            <Boton tipo="verde" disabled={!revision.every(v => num(v) > 0)} onClick={guardarRevision}>Guardar revisión</Boton>
          </div>
        </Tarjeta>
      )}

      <Tarjeta>
        {!cerrando ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm flex-1 min-w-[220px]" style={{ color: C.gris }}>Cuando se empaque lo último de este lote, ciérralo. Lo que falte pasa solo a bodega.</span>
            <Boton tipo="rojo" grande disabled={!c.hora_sacada} onClick={() => setCerrando(true)}>Cerrar lote</Boton>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <b className="text-lg">¿Cerrar el lote? Ya no se pueden contar más paquetes en él.</b>
            <div className="flex gap-2 justify-end flex-wrap"><Boton onClick={() => setCerrando(false)}>No, seguir</Boton><Boton tipo="rojo" onClick={cerrar}>Sí, cerrar</Boton></div>
          </div>
        )}
      </Tarjeta>
    </div>
  )
}

function Reproceso({ estado, c, registrar, reg, anular }) {
  const [motivo, setMotivo] = useState(MOTIVOS_REPROCESO[0])
  const [kg, setKg] = useState('')
  const [desecho, setDesecho] = useState('')
  const repro = registrosDe(estado, c.id, 'reproceso')
  const des = registrosDe(estado, c.id, 'desecho')
  const suma = (l) => l.reduce((s, r) => s + Number(r.cantidad), 0)
  const anotar = (tipo, v, extra) => { if (num(v) > 0) registrar(reg(tipo, { cantidad: num(v), ...extra })) }
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
      <Tarjeta>
        <h3 className="text-[22px] font-extrabold" style={titulo}>Reproceso</h3>
        <p className="text-sm" style={{ color: C.gris }}>Asadas malas que suben a molerse otra vez.</p>
        <div className="flex gap-2 flex-wrap">
          {MOTIVOS_REPROCESO.map(m => <button key={m} type="button" onClick={() => setMotivo(m)} className="rounded-full min-h-[48px] px-5 font-bold"
            style={m === motivo ? { background: '#fff', boxShadow: `inset 0 0 0 2.5px ${C.tinta}` } : { background: C.suave }}>{m}</button>)}
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex-1"><Campo unidad="kg" placeholder="0,0" value={kg} onChange={e => setKg(e.target.value)} /></div>
          <Boton grande onClick={() => { anotar('reproceso', kg, { motivo }); setKg('') }}>Anotar</Boton>
        </div>
        <Lista items={repro} etiqueta={r => r.motivo} total={suma(repro)} anular={r => registrar(anular(r))} />
      </Tarjeta>
      <Tarjeta>
        <h3 className="text-[22px] font-extrabold" style={titulo}>Desecho</h3>
        <p className="text-sm" style={{ color: C.gris }}>Lo que se bota.</p>
        <div className="flex gap-2 items-center">
          <div className="flex-1"><Campo unidad="kg" placeholder="0,0" value={desecho} onChange={e => setDesecho(e.target.value)} /></div>
          <Boton grande onClick={() => { anotar('desecho', desecho); setDesecho('') }}>Anotar</Boton>
        </div>
        <Lista items={des} etiqueta={() => 'Desecho'} total={suma(des)} anular={r => registrar(anular(r))} />
      </Tarjeta>
    </div>
  )
}

function Lista({ items, etiqueta, total, anular }) {
  if (!items.length) return null
  return (
    <div className="flex flex-col text-sm">
      {items.map(r => (
        <div key={r.id} className="flex items-center justify-between gap-3 py-2 border-t" style={{ borderColor: C.linea }}>
          <span>{fmtHora(r.hora)} · {etiqueta(r)}</span>
          <span className="flex items-center gap-3"><b className="tabular-nums">{fmtNum(r.cantidad)} kg</b>
            <button type="button" onClick={() => anular(r)} className="text-xs font-bold underline" style={{ color: C.gris }}>Quitar</button></span>
        </div>
      ))}
      <div className="flex justify-between gap-3 py-2 border-t font-bold" style={{ borderColor: C.linea }}><span>Total</span><span className="tabular-nums">{fmtNum(total)} kg</span></div>
    </div>
  )
}

export { NOMBRE_PASO }
