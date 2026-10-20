'use client'
import { useState, useEffect, useRef } from 'react'
import { getEmpresaId } from '@/lib/empresa'
import { subirSoporte } from '@/lib/soportes'
import {
  nuevoId, ahora, registrosDe, referencias, empacado, enBodega, telasPorBulto, estandar, unidadesPaquete,
  fmtHora, fmtNum, duracion, TEXTURAS, MOTIVOS_REPROCESO, NOMBRE_PASO, pasoActual, gramajeCrudo, planDeHoy, cajasDe, estadoPeso, rangoPaquete,
} from '@/lib/planta'
import { C, titulo, Boton, Opcion, Campo, Etiqueta, Dato, Pill, Tarjeta, horaInput, isoDesdeHora } from './ui'

const PASOS = {
  arriba: [['coccion', 'Cocción'], ['masa', 'Masa'], ['troqueladora', 'Molde']],
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
      {paso === 'troqueladora' && <Molde {...props} />}
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

// --- Molde: arriba solo avisa el cambio de molde; no anota pesos ------------------------

export function Molde({ estado, c, registrar, reg }) {
  const refs = estado.referencias.filter(esTroquelable)
  const { arriba } = referencias(estado, c)
  const actual = estado.referencias.find(p => p.id === arriba?.producto_id)
  const g = gramajeCrudo(estado, actual)
  const plan = planDeHoy(estado, actual?.id)
  const aceites = registrosDe(estado, c.id, 'aceite')
  const cambiar = (p) => { if (p.id !== actual?.id) registrar(reg('cambio_ref', { producto_id: p.id })) }

  return (
    <Tarjeta>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h3 className="text-[22px] font-extrabold" style={titulo}>{actual ? `Estás haciendo ${corto(actual)}` : '¿Qué molde pusiste?'}</h3>
        {actual && <span className="text-[13px]" style={{ color: C.gris }}>Desde las {fmtHora(arriba.hora)} · toca otro cuando cambies el molde</span>}
      </div>
      {g && (
        <div className="rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap" style={{ background: C.fondo }}>
          <span className="flex-1 min-w-[200px]"><span className="text-[13px]" style={{ color: C.gris }}>Cada arepa cruda debe pesar{g.provisional ? ' · provisional' : ''}</span><br />
            <b className="text-[34px] leading-none tabular-nums" style={titulo}>{g.min} a {g.max} g</b></span>
          <span className="text-sm" style={{ color: C.gris }}>5 juntas: {g.min * 5} a {g.max * 5} g</span>
        </div>
      )}
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        {refs.map(p => <Opcion key={p.id} sel={p.id === actual?.id} onClick={() => cambiar(p)} className="min-h-[76px]"><b className="text-xl" style={titulo}>{corto(p)}</b></Opcion>)}
      </div>
      <p className="text-[13px]" style={{ color: C.gris }}>Un toque y ya: el monitor de arriba y la tablet y el monitor de abajo cambian solos.</p>
      {plan.filas.length > 0 && <PlanLista plan={plan} actualId={actual?.id} />}
      <div className="rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap" style={{ background: C.fondo }}>
        <span className="flex-1 min-w-[200px]"><b>Aceite de la lona</b><br /><span className="text-[13px]" style={{ color: C.gris }}>{aceites.length ? `Atomizador llenado ${aceites.length} ${aceites.length === 1 ? 'vez' : 'veces'} en este lote · la última a las ${fmtHora(aceites[aceites.length - 1].hora)}` : 'Toca cada vez que llenes el atomizador'}</span></span>
        <Boton tipo="blanco" onClick={() => registrar(reg('aceite', { cantidad: 1 }))}>Llené el atomizador</Boton>
      </div>
    </Tarjeta>
  )
}

// Plan del día: en orden, lo hecho contra lo pedido.
export function PlanLista({ plan, actualId }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between gap-2 flex-wrap"><b>Plan de hoy</b><span className="text-[13px] tabular-nums" style={{ color: C.gris }}>{plan.hechos.toLocaleString('es-CO')} de {plan.pedidos.toLocaleString('es-CO')} paquetes</span></div>
      {plan.filas.map((f, i) => {
        const ahora = f.producto_id === actualId
        return (
          <div key={f.producto_id} className="grid items-center gap-3 rounded-xl px-3 py-2" style={{ gridTemplateColumns: '30px minmax(0,1fr) auto', background: ahora ? '#fff' : C.fondo, boxShadow: ahora ? `inset 0 0 0 2.5px ${C.tinta}` : 'none', opacity: f.listo && !ahora ? 0.6 : 1 }}>
            <span className="w-[30px] h-[30px] rounded-lg flex items-center justify-center font-extrabold" style={{ ...titulo, background: ahora ? C.tinta : '#fff', color: ahora ? '#fff' : C.tinta }}>{i + 1}</span>
            <span className="min-w-0 flex flex-col gap-1"><span className="font-bold">{corto(f.producto)} <span className="font-normal tabular-nums" style={{ color: C.gris }}>· {f.hecho.toLocaleString('es-CO')} de {f.paquetes.toLocaleString('es-CO')}</span></span>
              <span className="h-2 rounded-full overflow-hidden" style={{ background: C.linea }}><i className="block h-full" style={{ width: `${Math.min(100, f.hecho / f.paquetes * 100)}%`, background: C.verde }} /></span></span>
            {f.listo ? <Pill tono="verde">Listo</Pill> : ahora ? <Pill tono="ambar">Ahora</Pill> : plan.sigue?.producto_id === f.producto_id ? <span className="text-[13px] font-bold" style={{ color: C.gris }}>Sigue</span> : <span />}
          </div>
        )
      })}
    </div>
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
  const [cerrando, setCerrando] = useState(false)
  const pBaja = estado.referencias.find(p => p.id === bajando?.producto_id)
  const plan = planDeHoy(estado, bajando?.producto_id)

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

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <div className="rounded-[20px] p-4 bg-white flex flex-col gap-1">
          <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: C.gris }}>Bajando ahora</span>
          <span className="text-4xl font-extrabold" style={titulo}>{bajando ? nombre(bajando.producto_id) : '—'}</span>
          {rangoPaquete(estado, pBaja) && <span className="text-sm" style={{ color: C.gris }}>El paquete debe pesar <b style={{ color: C.tinta }}>{rangoPaquete(estado, pBaja).min.toLocaleString('es-CO')} a {rangoPaquete(estado, pBaja).max.toLocaleString('es-CO')} g</b>{unidadesPaquete(pBaja) ? ` · ${unidadesPaquete(pBaja)} arepas` : ''}</span>}
        </div>
        <div className="rounded-[20px] p-4 flex flex-col gap-2" style={sigue ? { background: C.amarillo, color: C.tinta } : { background: '#fff' }}>
          <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: sigue ? C.tinta : C.gris }}>{sigue ? `Sigue · llega en unos ${sigue.faltan} min` : 'Sigue'}</span>
          {sigue ? <>
            <span className="text-3xl font-extrabold" style={titulo}>{nombre(sigue.producto_id)} · alisten bolsas</span>
            <Boton tipo="blanco" onClick={() => registrar(reg('llego_ref', { producto_id: sigue.producto_id }))}>Ya llegó {nombre(sigue.producto_id)}</Boton>
          </> : plan.sigue ? <>
            <span className="text-2xl font-extrabold" style={titulo}>En el plan: {corto(plan.sigue.producto)} · {plan.sigue.paquetes.toLocaleString('es-CO')} paquetes</span>
            <span className="text-sm" style={{ color: C.gris }}>Tengan listas las bolsas</span>
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

      {pBaja && <PesarCaja estado={estado} c={c} p={pBaja} registrar={registrar} reg={reg} />}

      <Tarjeta>
        {!cerrando ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm flex-1 min-w-[220px]" style={{ color: C.gris }}>Cuando se empaque lo último de este lote, ciérralo. Lo que falte pasa solo a bodega.</span>
            <Boton tipo="rojo" grande onClick={() => setCerrando(true)}>Cerrar lote</Boton>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <b className="text-lg">¿Cerrar el lote? Ya no se pueden contar más paquetes en él.</b>
            {!c.hora_sacada && <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: C.ambarF, color: C.ambar }}><b style={{ color: C.tinta }}>Falta un paso:</b> no se marcó la hora en que se sacó del tanque. El lote se cierra igual y queda sin el tiempo de reposo.</div>}
            <div className="flex gap-2 justify-end flex-wrap"><Boton onClick={() => setCerrando(false)}>No, seguir</Boton><Boton tipo="rojo" onClick={cerrar}>Sí, cerrar</Boton></div>
          </div>
        )}
      </Tarjeta>
    </div>
  )
}

// Pesar 3 paquetes de cada caja: escribe el peso, Enter y pasa al siguiente.
function PesarCaja({ estado, c, p, registrar, reg }) {
  const [pesos, setPesos] = useState(['', '', ''])
  const refs = [useRef(null), useRef(null), useRef(null)]
  const cajas = cajasDe(estado, c, p)
  const std = Number(p.peso_estandar_g) || null
  const rango = rangoPaquete(estado, p)
  const hoyRef = cajas.pesadas.flatMap(r => r.pesos_individuales || [])
  const prom = hoyRef.length ? hoyRef.reduce((s, v) => s + Number(v), 0) / hoyRef.length : null
  const fuera = hoyRef.filter(v => estadoPeso(estado, p, Number(v)) !== 'bien').length
  const tono = (v) => ({ bien: C.verde, bajo: C.rojo, alto: C.amarillo })[estadoPeso(estado, p, num(v))] || C.linea
  const est = estadoPeso(estado, p, prom)
  const guardar = (ps) => {
    registrar(reg('paquete', { producto_id: p.id, pesos_individuales: ps, peso_promedio_g: ps.reduce((s, v) => s + v, 0) / ps.length, peso_estandar_g: std }))
    setPesos(['', '', '']); refs[0].current?.focus()
  }
  const enter = (i) => {
    if (!(num(pesos[i]) > 0)) return
    if (i < 2) { refs[i + 1].current?.focus(); return }
    const ps = pesos.map(num)
    if (ps.every(v => v > 0)) guardar(ps)
  }
  const n = cajas.pesadas.length + 1
  return (
    <Tarjeta>
      {cajas.faltan > 1 && <div className="rounded-2xl px-4 py-3 text-sm font-bold" style={{ background: C.ambarF, color: C.ambar }}>Hay {cajas.faltan} cajas llenas sin pesar.</div>}
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h3 className="text-[22px] font-extrabold" style={titulo}>Caja {n} de {corto(p)}: pesa 3 paquetes</h3>
        <span className="text-[13px]" style={{ color: C.gris }}>{cajas.porCaja ? `${cajas.porCaja} paquetes por caja` : 'Una vez por caja'}{rango ? ` · entre ${rango.min.toLocaleString('es-CO')} y ${rango.max.toLocaleString('es-CO')} g` : ''}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {pesos.map((v, i) => (
          <label key={i} className="flex flex-col gap-1"><span className="text-[13px] font-bold" style={{ color: C.gris }}>Paquete {i + 1}</span>
            <input ref={refs[i]} inputMode="decimal" enterKeyHint={i < 2 ? 'next' : 'done'} placeholder="g" value={v}
              onChange={e => setPesos(pesos.map((x, j) => j === i ? e.target.value : x))} onKeyDown={e => e.key === 'Enter' && enter(i)}
              className="h-16 rounded-2xl border-[3px] bg-white text-center text-2xl font-extrabold" style={{ borderColor: tono(v), ...titulo }} /></label>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[13px]" style={{ color: C.gris }}>Escribe el peso y Enter: pasa solo al siguiente. Verde: en el rango · rojo: liviano · ámbar: pesado.</span>
        <Boton tipo="verde" disabled={!pesos.every(v => num(v) > 0)} onClick={() => guardar(pesos.map(num))}>Guardar caja</Boton>
      </div>
      {prom != null && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <Dato rotulo={`${corto(p)} en este lote`} valor={`${fmtNum(prom, 0)} g`} nota={`${hoyRef.length} paquetes pesados · ${cajas.pesadas.length} ${cajas.pesadas.length === 1 ? 'caja' : 'cajas'}`} />
          <Dato rotulo="Fuera del rango" valor={`${fuera} de ${hoyRef.length}`} nota={est === 'bajo' ? 'El promedio está liviano: arriba ven que suban el gramaje' : est === 'alto' ? 'El promedio está pesado: se está regalando masa' : 'El promedio está bien'} />
        </div>
      )}
    </Tarjeta>
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
