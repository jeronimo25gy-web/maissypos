'use client'
import { useState } from 'react'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import {
  nuevoId, ahora, estandar, lotesAbiertos, referencias, registrosDe, gramajeCrudo, planDeHoy, duracion, fmtHora, fmtNum, TEXTURAS,
  ultimoPesaje, rangoPaquete, estadoPeso,
} from '@/lib/planta'
import { P, fuenteTitulo, BotonP, Rotulo, Hoja, Teclado, Casilla, numP, textoNum, cortoRef } from './ui'

// Tablet de arriba: una sola pantalla. A la izquierda los tanques, cada uno con
// su estado, su reloj y el único botón que toca ahora (Montar, Apagar o Sacar).
// A la derecha la troqueladora: la referencia que está en el molde y los botones
// para cambiarla, en el orden del plan del día.

const POSICIONES = ['abajo', 'medio', 'arriba']
const esAmarillo = (m) => /amarill/i.test(m?.nombre || '')
const colorMaiz = (m) => esAmarillo(m) ? P.amarillo : '#E6DEC8'
const tipoMaiz = (m) => (m?.nombre || 'maíz').replace(/^Maíz /i, '').toLowerCase()
const esTroquelable = (p) => !/kilo de masa/i.test(p.nombre)
const nombreTanque = (t) => (t?.nombre || 'Tanque').replace(/\s*bultos?$/i, '')

// Cuando llega maíz nuevo se miden 2 lotes: el segundo queda marcado solo.
function falteSegundoLote(estado, maizId) {
  const lotes = Object.values(estado.cochadas || {}).filter(c => c.materia_prima_id === maizId && !c.anulada && c.hora_montada)
    .sort((a, b) => b.hora_montada.localeCompare(a.hora_montada))
  const corte = lotes.findIndex(c => !c.maiz_nuevo)
  return (corte < 0 ? lotes.length : corte) === 1
}

// Lotes que ya salieron del tanque y siguen abiertos: de ahí se muele. El que
// está en el molde es el del último cambio de referencia; si ninguno tiene, el
// último que se sacó.
export function lotesEnMolino(estado) {
  const sacados = lotesAbiertos(estado).filter(c => c.hora_sacada)
  const ultimo = (c) => registrosDe(estado, c.id, 'cambio_ref').pop()?.hora || ''
  const conMolde = sacados.filter(ultimo).sort((a, b) => ultimo(b).localeCompare(ultimo(a)))
  const sinMolde = sacados.filter(c => !ultimo(c)).sort((a, b) => b.hora_sacada.localeCompare(a.hora_sacada))
  return { sacados, enLinea: conMolde[0] || sinMolde[0] || null }
}

function Tanque({ cap, bultos, maiz, alto = 150 }) {
  const nivel = cap ? Math.min(100, bultos / cap * 100) : 0
  const rayas = Math.max(0, Math.min(cap, 12) - 1)
  return (
    <div className="relative shrink-0 overflow-hidden rounded-t-[10px] rounded-b-[28px]" style={{ width: alto * 0.64, height: alto, background: P.fondo, boxShadow: `inset 0 0 0 3px ${P.linea}` }} aria-hidden="true">
      <i className="absolute inset-x-[3px] bottom-[3px] rounded-b-[25px] transition-[height]" style={{ height: `calc(${nivel}% - 6px)`, background: colorMaiz(maiz) }} />
      {Array.from({ length: rayas }, (_, i) => <i key={i} className="absolute left-0 w-3 h-[2px]" style={{ bottom: `${(i + 1) / Math.min(cap, 12) * 100}%`, background: P.tenue }} />)}
      {bultos > 0 && <b className="absolute inset-0 flex items-center justify-center font-extrabold tabular-nums" style={{ fontFamily: fuenteTitulo, color: P.fondo, fontSize: Math.round(alto * 0.26) }}>{textoNum(bultos)}</b>}
    </div>
  )
}

export default function Arriba({ estado, usuario, puesto, accion, medir }) {
  const [montando, setMontando] = useState(null) // tanque
  const [sacando, setSacando] = useState(null) // lote
  const [bola, setBola] = useState(false)
  const abiertos = lotesAbiertos(estado)
  const enTanque = (t) => abiertos.filter(c => c.tanque_id === t.id && !c.hora_sacada).sort((a, b) => (b.hora_montada || '').localeCompare(a.hora_montada || ''))[0]
  const { sacados, enLinea } = lotesEnMolino(estado)
  const actualizar = (c, datos) => ({ op: 'update', tabla: 'produccion_cochadas', id: c.id, datos })
  const reg = (c, tipo, extra) => ({ op: 'insert', tabla: 'produccion_muestras_peso', datos: {
    id: nuevoId(), empresa_id: getEmpresaId(), cochada_id: c.id, tipo, hora: ahora(), puesto,
    registrado_por: usuario.nombre, anulado: false, ...extra,
  } })
  const anular = (op) => ({ op: 'update', tabla: 'produccion_muestras_peso', id: op.datos.id, datos: { anulado: true } })
  const medirLote = (c) => medir || !!c?.maiz_nuevo

  const apagar = (t, c) => accion(actualizar(c, { hora_apagado: ahora() }), { texto: `${nombreTanque(t)} apagado`, deshacer: actualizar(c, { hora_apagado: null }) })
  const sacar = (t, c) => {
    if (medirLote(c)) { setSacando(c); return }
    accion(actualizar(c, { hora_sacada: ahora() }), { texto: `${nombreTanque(t)} sacado`, deshacer: actualizar(c, { hora_sacada: null }) })
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <Molde estado={estado} sacados={sacados} enLinea={enLinea} />

      <div className="flex flex-col gap-4 min-w-0">
        <section className="flex flex-col gap-2.5" aria-label="Tanques">
          <Rotulo>Tanques</Rotulo>
          {(estado.tanques || []).map(t => {
            const c = enTanque(t)
            const cap = Number(t.capacidad_bultos) || 0
            const maiz = c && estado.maices?.find(m => m.id === c.materia_prima_id)
            const fase = !c ? 'libre' : !c.hora_apagado ? 'coccion' : 'reposo'
            return (
              <article key={t.id} className="rounded-[20px] px-4 py-3 flex items-center gap-4 min-w-0"
                style={{ background: P.panel, boxShadow: fase === 'libre' ? 'none' : `inset 0 0 0 3px ${P.amarillo}` }}>
                <Tanque cap={cap} bultos={c ? Number(c.cantidad) : 0} maiz={maiz} alto={80} />
                <div className="flex-1 min-w-0 flex flex-col">
                  <b className="text-[24px] leading-tight" style={{ fontFamily: fuenteTitulo }}>{nombreTanque(t)}</b>
                  {fase === 'libre'
                    ? <span className="text-[18px] font-bold" style={{ color: P.gris }}>Libre</span>
                    : <span className="text-[18px] font-extrabold leading-tight" style={{ color: P.amarillo }}>{fase === 'coccion' ? 'Cocinando' : 'Reposando'} · {textoNum(Number(c.cantidad))} {tipoMaiz(maiz)}{c.maiz_nuevo ? ' · nuevo' : ''}</span>}
                </div>
                {c && <span className="text-[44px] leading-none font-extrabold tabular-nums" style={{ fontFamily: fuenteTitulo }}>{duracion(fase === 'coccion' ? c.hora_montada : c.hora_apagado)}</span>}
                <BotonP tono={fase === 'libre' ? 'oscuro' : 'blanco'} alto={68} className="w-[140px] shrink-0 text-[22px]"
                  onClick={() => fase === 'libre' ? setMontando(t) : fase === 'coccion' ? apagar(t, c) : sacar(t, c)}>
                  {fase === 'libre' ? 'Montar' : fase === 'coccion' ? 'Apagar' : 'Sacar'}
                </BotonP>
              </article>
            )
          })}
        </section>

        <CambiarMolde estado={estado} sacados={sacados} enLinea={enLinea} medir={medirLote(enLinea)} accion={accion} reg={reg} anular={anular} onBola={() => setBola(true)} />
      </div>

      {montando && <Montar estado={estado} t={montando} usuario={usuario} medir={medir} onCancelar={() => setMontando(null)}
        onEmpezar={(ops, deshacer, texto) => { accion(ops, { texto, deshacer }); setMontando(null) }} />}
      {sacando && <Sacar estado={estado} c={sacando} onCancelar={() => setSacando(null)}
        onListo={(datos) => {
          const t = estado.tanques.find(x => x.id === sacando.tanque_id)
          accion(actualizar(sacando, { hora_sacada: ahora(), ...datos }), { texto: `${nombreTanque(t)} sacado`, deshacer: actualizar(sacando, { hora_sacada: null }) })
          setSacando(null)
        }} />}
      {bola && enLinea && <Bola estado={estado} c={enLinea} onCancelar={() => setBola(false)}
        onListo={(kg) => { const op = reg(enLinea, 'bola', { cantidad: kg }); accion(op, { texto: `Bola de ${textoNum(kg)} kg`, deshacer: anular(op) }); setBola(false) }} />}
    </div>
  )
}

// --- Lo que se ve desde la troqueladora: referencia y peso en crudo, en grande ---

function Molde({ estado, enLinea }) {
  const r = enLinea ? referencias(estado, enLinea) : {}
  const actual = estado.referencias.find(p => p.id === r.arriba?.producto_id)
  const g = gramajeCrudo(estado, actual)
  const plan = planDeHoy(estado, actual?.id)
  const fila = plan.filas.find(f => f.producto_id === actual?.id)
  const pesaje = actual && ultimoPesaje(estado, actual.id)
  const rango = actual && rangoPaquete(estado, actual)
  const g0 = pesaje ? Number(pesaje.peso_promedio_g) : null
  const est = pesaje && estadoPeso(estado, actual, g0)
  const sigueG = plan.sigue && gramajeCrudo(estado, plan.sigue.producto)
  const tanque = estado.tanques.find(t => t.id === enLinea?.tanque_id)
  const grande = { fontFamily: fuenteTitulo }

  if (!actual) return (
    <section className="rounded-[28px] p-8 flex flex-col items-center justify-center text-center gap-3 min-h-[420px]" style={{ background: P.panel }}>
      <b className="text-[clamp(40px,4vw,72px)] leading-none" style={{ ...grande, color: P.gris }}>{enLinea ? 'Escoja la referencia' : 'Sin maíz en el molino'}</b>
      <span className="text-[24px] font-bold" style={{ color: P.tenue }}>{enLinea ? 'Con el mouse, en Cambiar molde' : 'Al sacar un tanque se activa el molde'}</span>
    </section>
  )
  return (
    <section className="rounded-[28px] p-6 md:p-8 flex flex-col gap-5 min-w-0" style={{ background: P.panel }} aria-label="En el molde">
      <style>{`@media (prefers-reduced-motion: no-preference) { .recuerda { animation: recuerda 4s ease-in-out infinite } } @keyframes recuerda { 0%, 70%, 100% { opacity: 1 } 85% { opacity: .55 } }`}</style>
      <div>
        <Rotulo>En el molde{tanque ? ` · ${nombreTanque(tanque)}` : ''} · desde las {fmtHora(r.arriba.hora)}</Rotulo>
        <b className="block text-[clamp(56px,6vw,124px)] leading-[.95]" style={{ ...grande, color: P.amarillo }}>{cortoRef(actual)}</b>
        {fila && <span className="text-[24px] font-bold tabular-nums" style={{ color: P.gris }}>{fila.hecho.toLocaleString('es-CO')} de {fila.paquetes.toLocaleString('es-CO')} paquetes del plan</span>}
      </div>
      {g ? (
        <div>
          <Rotulo>Cada arepa cruda debe pesar{g.provisional ? ' · provisional' : ''}</Rotulo>
          <b className="block text-[clamp(64px,8.6vw,180px)] leading-none tabular-nums whitespace-nowrap" style={grande}>{g.min} a {g.max} g</b>
          <span className="text-[clamp(24px,2.2vw,36px)] font-bold tabular-nums" style={{ color: P.gris }}>5 juntas en la gramera: {g.min * 5} a {g.max * 5} g</span>
        </div>
      ) : <span className="text-[24px]" style={{ color: P.gris }}>Falta el gramaje en crudo de esta referencia en Estándares.</span>}
      <div className="recuerda rounded-[20px] px-6 py-3 text-[clamp(22px,2vw,36px)] font-extrabold" style={{ ...grande, background: P.rojo, color: '#fff' }}>Verifique el peso en la gramera</div>
      <div className="grid gap-4 md:grid-cols-2 mt-auto">
        <div className="rounded-[20px] p-5 flex flex-col gap-1" style={{ background: P.panel2 }}>
          <Rotulo>Abajo, última caja{pesaje ? ` · ${fmtHora(pesaje.hora)}` : ''}</Rotulo>
          {pesaje ? <>
            <b className="text-[clamp(30px,2.6vw,48px)] leading-tight tabular-nums" style={grande}>Paquetes en {Math.round(g0).toLocaleString('es-CO')} g</b>
            <b className="text-[22px]" style={{ color: est === 'bien' ? P.verde : est === 'bajo' ? P.rojoTxt : P.amarillo }}>
              {est === 'bien' ? 'Bien' : est === 'bajo' ? `${Math.round(rango.min - g0)} g por debajo · subir el gramaje` : est === 'alto' ? `${Math.round(g0 - rango.max)} g por encima · bajar el gramaje` : ''}
            </b>
          </> : <span className="text-[22px] font-bold" style={{ color: P.tenue }}>Todavía no han pesado cajas de {cortoRef(actual)}</span>}
        </div>
        {plan.sigue ? (
          <div className="rounded-[20px] p-5 flex flex-col gap-1" style={{ background: P.amarillo, color: P.fondo }}>
            <Rotulo color={P.fondo}>Sigue en el plan</Rotulo>
            <b className="text-[clamp(30px,2.6vw,48px)] leading-tight" style={grande}>{cortoRef(plan.sigue.producto)} · {plan.sigue.paquetes.toLocaleString('es-CO')}</b>
            {sigueG && <b className="text-[22px] tabular-nums">Cruda {sigueG.min} a {sigueG.max} g</b>}
          </div>
        ) : (
          <div className="rounded-[20px] p-5 flex flex-col gap-1" style={{ background: P.panel2 }}>
            <Rotulo>Sigue</Rotulo>
            <b className="text-[24px]" style={{ color: P.tenue }}>{plan.filas.length ? 'El plan de hoy va completo' : 'No hay plan de hoy'}</b>
          </div>
        )}
      </div>
    </section>
  )
}

// --- Cambiar molde: un botón por referencia, en el orden del plan --------------

function CambiarMolde({ estado, sacados, enLinea, medir, accion, reg, anular, onBola }) {
  const refs = estado.referencias.filter(esTroquelable)
  const r = enLinea ? referencias(estado, enLinea) : {}
  const actual = estado.referencias.find(p => p.id === r.arriba?.producto_id)
  const plan = planDeHoy(estado, actual?.id)
  const enPlan = new Map(plan.filas.map((f, i) => [f.producto_id, { ...f, n: i + 1 }]))
  // El plan primero, en su orden; después el resto. El orden no cambia al tocar.
  const orden = [...refs].sort((a, b) => (enPlan.get(a.id)?.n ?? 99) - (enPlan.get(b.id)?.n ?? 99) || a.sku.localeCompare(b.sku))
  const tanqueDe = (c) => estado.tanques.find(t => t.id === c?.tanque_id)
  const bolas = enLinea ? registrosDe(estado, enLinea.id, 'bola') : []
  const masa = bolas.reduce((s, b) => s + Number(b.cantidad), 0)
  const aceites = enLinea ? registrosDe(estado, enLinea.id, 'aceite') : []

  const cambiar = (p) => {
    if (!enLinea || p.id === actual?.id) return
    const op = reg(enLinea, 'cambio_ref', { producto_id: p.id })
    accion(op, { texto: `En el molde: ${cortoRef(p)}`, deshacer: anular(op) })
  }
  // Pasar el molino al maíz de otro tanque: sigue la misma referencia.
  const pasarA = (c) => {
    if (c.id === enLinea?.id) return
    const op = reg(c, 'cambio_ref', { producto_id: actual?.id || orden[0]?.id })
    accion(op, { texto: `Moliendo ${nombreTanque(tanqueDe(c))}`, deshacer: anular(op) })
  }
  if (!enLinea) return null

  return (
    <section className="flex flex-col gap-2.5 min-w-0" aria-label="Cambiar molde">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Rotulo>Cambiar molde</Rotulo>
        {sacados.length > 1 && (
          <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Maíz que se está moliendo">
            {sacados.map(c => {
              const si = c.id === enLinea?.id
              return <button key={c.id} type="button" role="radio" aria-checked={si} onClick={() => pasarA(c)} className="rounded-full min-h-[48px] px-5 text-[17px] font-extrabold cursor-pointer hover:brightness-110"
                style={si ? { background: P.amarillo, color: P.fondo } : { background: P.panel2, color: P.texto }}>{nombreTanque(tanqueDe(c))}</button>
            })}
          </div>
        )}
      </div>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 170px), 1fr))' }} role="radiogroup" aria-label="Referencia en el molde">
        {orden.map(p => {
          const si = p.id === actual?.id
          const f = enPlan.get(p.id)
          return (
            <button key={p.id} type="button" role="radio" aria-checked={si} onClick={() => cambiar(p)}
              className="rounded-[18px] min-h-[76px] px-4 py-2 text-left flex flex-col justify-center gap-0.5 cursor-pointer hover:brightness-125 active:scale-[.97] transition"
              style={si ? { background: P.amarillo, color: P.fondo } : { background: P.panel2, color: P.texto }}>
              <b className="text-[20px] leading-tight" style={{ fontFamily: fuenteTitulo }}>{cortoRef(p)}</b>
              {f && <span className="text-[15px] font-bold tabular-nums" style={{ color: si ? P.fondo : f.listo ? P.verde : P.gris }}>
                {f.listo ? 'Listo' : `${f.n}.º · ${f.hecho.toLocaleString('es-CO')} de ${f.paquetes.toLocaleString('es-CO')}`}
              </span>}
            </button>
          )
        })}
      </div>
      {medir && (
        <div className="grid gap-2.5 grid-cols-2">
          <BotonP onClick={onBola} alto={72} className="flex flex-col items-start justify-center text-left text-[19px]">
            <span>Pesar bola de masa</span>
            <span className="text-[15px] font-bold" style={{ color: P.gris }}>{bolas.length ? `${bolas.length} · ${fmtNum(masa)} kg` : 'Ninguna'}</span>
          </BotonP>
          <BotonP alto={72} onClick={() => { const op = reg(enLinea, 'aceite', { cantidad: 1 }); accion(op, { texto: 'Atomizador llenado', deshacer: anular(op) }) }} className="flex flex-col items-start justify-center text-left text-[19px]">
            <span>Llené el atomizador</span>
            <span className="text-[15px] font-bold" style={{ color: P.gris }}>{aceites.length ? `${aceites.length} · última ${fmtHora(aceites[aceites.length - 1].hora)}` : 'Ninguna vez'}</span>
          </BotonP>
        </div>
      )}
    </section>
  )
}

// --- Montar un tanque ---------------------------------------------------------

function Montar({ estado, t, usuario, medir, onCancelar, onEmpezar }) {
  const maices = estado.maices?.length ? estado.maices : (estado.maiz ? [estado.maiz] : [])
  const cap = Number(t.capacidad_bultos) || 0
  const inicial = maices.find(m => m.id === t.materia_prima_id) || maices[0]
  const [maizId, setMaizId] = useState(inicial?.id || '')
  const [bultos, setBultos] = useState(cap || 1)
  const [nuevo, setNuevo] = useState(() => falteSegundoLote(estado, inicial?.id))
  const [agua, setAgua] = useState('')
  const [teclado, setTeclado] = useState(null) // 'bultos' | 'agua'
  const [bultosTxt, setBultosTxt] = useState('')
  const porBulto = Number(estandar(estado, 'conservante_g_bulto')?.valor) || null
  const maiz = maices.find(m => m.id === maizId)
  const medirEste = medir || nuevo

  const empezar = () => {
    if (!maiz || !(bultos > 0)) return
    const empresaId = getEmpresaId()
    const fecha = obtenerFechaActual()
    const id = nuevoId()
    const ops = [
      { op: 'insert', tabla: 'produccion_cochadas', datos: {
        id, empresa_id: empresaId, fecha, materia_prima_id: maiz.id, cantidad: bultos,
        registrado_por: usuario.nombre, estado: 'abierto', tanque_id: t.id,
        hora_montada: ahora(), agua_l: numP(agua) > 0 ? numP(agua) : null, conservante_g: porBulto ? Math.round(porBulto * bultos) : null, maiz_kg: null,
        testigos: medirEste ? POSICIONES.map(pos => ({ pos, kg: null })) : null, anulada: false, maiz_nuevo: !!nuevo,
      } },
      { op: 'insert', tabla: 'inventario_mov', datos: {
        id: nuevoId(), empresa_id: empresaId, sku: maiz.sku, cantidad: bultos, fecha, tipo_movimiento: 'salida',
        referencia: `Cochada: ${maiz.nombre} puesto en produccion · ${t.nombre}`,
      } },
    ]
    // Deshacer: el lote queda anulado y el maíz vuelve a la bodega.
    const deshacer = [
      { op: 'update', tabla: 'produccion_cochadas', id, datos: { anulada: true, anulada_por: usuario.nombre } },
      { op: 'insert', tabla: 'inventario_mov', datos: {
        id: nuevoId(), empresa_id: empresaId, sku: maiz.sku, cantidad: bultos, fecha, tipo_movimiento: 'entrada',
        referencia: `Cochada anulada: ${maiz.nombre} · ${t.nombre}`,
      } },
    ]
    onEmpezar(ops, deshacer, `${nombreTanque(t)} montado · ${textoNum(bultos)} ${tipoMaiz(maiz)}`)
  }

  return (
    <Hoja titulo={`Montar ${nombreTanque(t)}`} onCancelar={onCancelar}>
      <div className="grid gap-5 md:grid-cols-[auto_minmax(0,1fr)] items-start">
        <div className="flex md:flex-col items-center gap-4">
          <Tanque cap={cap} bultos={bultos} maiz={maiz} alto={210} />
          <span className="text-[18px] font-bold" style={{ color: P.gris }}>Caben {cap}</span>
        </div>
        <div className="flex flex-col gap-5 min-w-0">
          {maices.length > 1 && (
            <div className="flex flex-col gap-2">
              <Rotulo>Maíz</Rotulo>
              <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Maíz">
                {maices.map(m => {
                  const si = m.id === maizId
                  return <button key={m.id} type="button" role="radio" aria-checked={si} onClick={() => { setMaizId(m.id); setNuevo(falteSegundoLote(estado, m.id)) }}
                    className="rounded-[18px] min-h-[92px] text-[26px] font-extrabold flex items-center justify-center gap-3"
                    style={si ? { background: P.amarillo, color: P.fondo } : { background: P.panel2, color: P.texto }}>
                    <i className="w-7 h-7 rounded-full" style={{ background: colorMaiz(m), boxShadow: `inset 0 0 0 2px ${P.fondo}` }} />{m.nombre.replace(/^Maíz /i, '')}
                  </button>
                })}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Rotulo>Bultos</Rotulo>
            <div className="grid gap-2.5" style={{ gridTemplateColumns: '96px minmax(0,1fr) 96px' }}>
              <BotonP alto={104} className="text-[40px] !px-0" onClick={() => setBultos(b => Math.max(0.5, b - 0.5))} aria-label="Medio bulto menos">−</BotonP>
              <button type="button" onClick={() => { setBultosTxt(textoNum(bultos)); setTeclado('bultos') }} aria-label="Escribir los bultos"
                className="rounded-[18px] text-[64px] leading-none font-extrabold tabular-nums" style={{ background: P.panel, fontFamily: fuenteTitulo, boxShadow: `inset 0 0 0 3px ${bultos > cap && cap ? P.rojoTxt : P.linea}` }}>{textoNum(bultos)}</button>
              <BotonP alto={104} className="text-[40px] !px-0" onClick={() => setBultos(b => b + 0.5)} aria-label="Medio bulto más">+</BotonP>
            </div>
            {bultos > cap && cap > 0 && <b className="text-[19px]" style={{ color: P.rojoTxt }}>Pasa la capacidad por {textoNum(bultos - cap)} bultos</b>}
          </div>

          <button type="button" aria-pressed={nuevo} onClick={() => setNuevo(!nuevo)} className="rounded-[18px] min-h-[80px] px-5 flex items-center justify-between gap-3 text-left"
            style={nuevo ? { background: P.amarillo, color: P.fondo } : { background: P.panel2, color: P.texto }}>
            <span><b className="block text-[24px]">Maíz nuevo</b><span className="text-[16px] font-bold" style={{ color: nuevo ? P.fondo : P.gris }}>Primeros 2 lotes de una compra: se mide todo</span></span>
            <b className="text-[20px]">{nuevo ? 'Sí' : 'No'}</b>
          </button>

          {medirEste && <Casilla rotulo="Agua" valor={agua} unidad="litros" activa={teclado === 'agua'} onClick={() => setTeclado('agua')} />}

          {teclado === 'agua' && <Teclado valor={agua} onCambio={setAgua} />}
          {teclado === 'bultos' && (
            <div className="flex flex-col gap-2.5">
              <Teclado valor={bultosTxt} onCambio={(v) => { setBultosTxt(v); if (numP(v) > 0) setBultos(numP(v)) }} />
            </div>
          )}

          <div className="rounded-[20px] p-4 flex items-center gap-4 flex-wrap" style={{ background: P.panel }}>
            <span className="flex-1 min-w-[200px]">
              <b className="block text-[26px] leading-tight" style={{ fontFamily: fuenteTitulo }}>{textoNum(bultos)} {bultos === 1 ? 'bulto' : 'bultos'} {tipoMaiz(maiz)}</b>
              {porBulto && <span className="text-[19px] font-extrabold" style={{ color: P.amarillo }}>Conservante {Math.round(porBulto * bultos).toLocaleString('es-CO')} g</span>}
            </span>
            <BotonP tono="rojo" alto={96} className="min-w-[260px] text-[26px]" disabled={!(bultos > 0) || !maiz} onClick={empezar}>Empezar cocción</BotonP>
          </div>
        </div>
      </div>
    </Hoja>
  )
}

// --- Sacar con medición: textura y bolsas testigo ------------------------------

function Sacar({ estado, c, onCancelar, onListo }) {
  const t = estado.tanques.find(x => x.id === c.tanque_id)
  const [textura, setTextura] = useState(c.textura || null)
  const posiciones = (c.testigos || []).map(x => x.pos)
  const [pesos, setPesos] = useState(() => Object.fromEntries(posiciones.map(p => [p, ''])))
  const [activa, setActiva] = useState(posiciones[0] || null)
  const listo = () => onListo({
    textura,
    testigos: posiciones.length ? posiciones.map(pos => ({ pos, kg: numP(pesos[pos]) > 0 ? numP(pesos[pos]) : null })) : null,
  })
  const abs = posiciones.map(p => numP(pesos[p])).filter(v => v > 0)
  return (
    <Hoja titulo={`Sacar ${nombreTanque(t)}`} onCancelar={onCancelar}>
      <div className="flex flex-col gap-2">
        <Rotulo>Cómo quedó el maíz · aplaste un grano</Rotulo>
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))' }} role="radiogroup" aria-label="Textura">
          {TEXTURAS.map(x => {
            const si = textura === x.n
            return <button key={x.n} type="button" role="radio" aria-checked={si} onClick={() => setTextura(x.n)} className="rounded-[18px] min-h-[120px] px-4 py-3 text-left flex flex-col gap-1"
              style={si ? { background: P.amarillo, color: P.fondo } : { background: P.panel2, color: P.texto }}>
              <b className="text-[40px] leading-none" style={{ fontFamily: fuenteTitulo }}>{x.n}</b>
              <b className="text-[21px] leading-tight">{x.nombre}</b>
              <span className="text-[15px] font-bold leading-snug" style={{ color: si ? P.fondo : P.gris }}>{x.detalle}</span>
            </button>
          })}
        </div>
      </div>
      {posiciones.length > 0 && (
        <div className="flex flex-col gap-2">
          <Rotulo>Bolsas testigo · entraron de 1 kg</Rotulo>
          <div className="grid gap-2.5 grid-cols-3">
            {posiciones.map(p => <Casilla key={p} rotulo={p[0].toUpperCase() + p.slice(1)} valor={pesos[p]} unidad="kg" activa={activa === p} onClick={() => setActiva(p)} />)}
          </div>
          {activa && <Teclado valor={pesos[activa]} onCambio={(v) => setPesos({ ...pesos, [activa]: v })} />}
          {abs.length > 0 && <span className="text-[20px] font-bold">Absorción <b className="text-[28px] tabular-nums" style={{ fontFamily: fuenteTitulo }}>{fmtNum(abs.reduce((s, v) => s + v - 1, 0) / abs.length * 100, 0)}%</b></span>}
        </div>
      )}
      <div className="flex gap-3 justify-end flex-wrap">
        <BotonP alto={88} onClick={() => onListo({})}>Sacar sin medir</BotonP>
        <BotonP tono="rojo" alto={88} className="min-w-[260px]" disabled={!textura} onClick={listo}>Listo, sacado</BotonP>
      </div>
    </Hoja>
  )
}

// --- Bola de masa a la salida de los rodillos -------------------------------------

function Bola({ estado, c, onCancelar, onListo }) {
  const [kg, setKg] = useState('')
  const bolas = registrosDe(estado, c.id, 'bola')
  const total = bolas.reduce((s, b) => s + Number(b.cantidad), 0)
  return (
    <Hoja titulo="Peso de la bola de masa" onCancelar={onCancelar}>
      <div className="grid gap-5 md:grid-cols-2 items-start">
        <div className="flex flex-col gap-3">
          <Casilla rotulo="Esta bola" valor={kg} unidad="kg" activa />
          <Teclado valor={kg} onCambio={setKg} />
        </div>
        <div className="flex flex-col gap-3">
          <div className="rounded-[18px] p-4" style={{ background: P.panel }}>
            <Rotulo>Masa de este lote</Rotulo>
            <b className="text-[48px] leading-none tabular-nums" style={{ fontFamily: fuenteTitulo }}>{fmtNum(total)} kg</b>
            <span className="block text-[18px] font-bold" style={{ color: P.gris }}>{bolas.length} {bolas.length === 1 ? 'bola' : 'bolas'}</span>
          </div>
          <BotonP tono="rojo" alto={96} disabled={!(numP(kg) > 0)} onClick={() => onListo(numP(kg))}>Guardar bola</BotonP>
        </div>
      </div>
    </Hoja>
  )
}
