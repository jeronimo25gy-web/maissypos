'use client'
import { useState, useEffect } from 'react'
import { lotesAbiertos, referencias, empacado, planDeHoy, rangoPaquete } from '@/lib/planta'

// Pantalla de abajo (televisor o monitor): qué está bajando, cuánto debe pesar
// el paquete, qué sigue y cuánto se ha empacado. Nadie la toca; se actualiza sola.
const corto = (p) => (p?.nombre || '').replace(/^Arepa (de Maíz )?/i, '')
const pesoTxt = (r) => `${r.min.toLocaleString('es-CO')} a ${r.max.toLocaleString('es-CO')} g`

export default function Monitor({ estado, sinSenal, onSalir }) {
  const [hora, setHora] = useState('')
  useEffect(() => {
    const f = () => setHora(new Date().toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' }))
    f(); const t = setInterval(f, 15000); return () => clearInterval(t)
  }, [])
  const nombre = (id) => corto(estado.referencias.find(p => p.id === id))
  // El lote que está en troqueladora o empaque: el del cambio de referencia más reciente.
  const lotes = lotesAbiertos(estado).map(c => ({ c, r: referencias(estado, c) })).filter(x => x.r.arriba)
  lotes.sort((a, b) => (b.r.arriba.hora || '').localeCompare(a.r.arriba.hora || ''))
  const actual = lotes[0]
  const tanque = actual && estado.tanques.find(t => t.id === actual.c.tanque_id)
  const emp = actual ? empacado(estado, actual.c) : {}
  const plan = planDeHoy(estado, actual?.r.bajando?.producto_id)
  const producto = (id) => estado.referencias.find(p => p.id === id)
  const pBaja = producto(actual?.r.bajando?.producto_id)
  const rango = pBaja && rangoPaquete(estado, pBaja)
  const rangoSigue = rangoPaquete(estado, actual?.r.sigue ? producto(actual.r.sigue.producto_id) : plan.sigue?.producto)

  return (
    <div className="min-h-screen p-5 md:p-8 flex flex-col gap-5" style={{ background: '#141414', color: '#F4F2EC' }}>
      <style>{`@media (prefers-reduced-motion: no-preference) { .recuerda { animation: recuerda 4s ease-in-out infinite } } @keyframes recuerda { 0%, 70%, 100% { opacity: 1 } 85% { opacity: .55 } }`}</style>
      <div className="flex justify-between gap-4 text-lg font-bold" style={{ color: '#A9A59B' }}>
        <span>Empaque · {tanque ? tanque.nombre : 'sin lote en troqueladora'}</span>
        <span className="flex items-center gap-4">{sinSenal ? 'Sin señal · ' : ''}{hora}
          {onSalir && <button type="button" onClick={onSalir} className="text-sm font-bold rounded-xl px-3 min-h-[36px]" style={{ background: '#262421', color: '#A9A59B' }}>Cambiar pantalla</button>}
        </span>
      </div>
      {!actual ? (
        <div className="flex-1 flex items-center justify-center text-3xl font-bold" style={{ color: '#A9A59B' }}>Todavía no hay nada en troqueladora.</div>
      ) : (
        <div className="flex-1 grid gap-5 md:grid-cols-[1.3fr_1fr]">
          <div className="rounded-3xl p-6 md:p-10 flex flex-col justify-center gap-4" style={{ background: '#262421' }}>
            <div>
              <span className="text-base font-extrabold uppercase tracking-[.08em]" style={{ color: '#A9A59B' }}>Bajando ahora</span>
              <div className="font-extrabold leading-none" style={{ fontFamily: 'var(--font-titulo), Georgia, serif', fontSize: 'clamp(48px, 8vw, 110px)' }}>{actual.r.bajando ? nombre(actual.r.bajando.producto_id) : '—'}</div>
            </div>
            {rango ? (
              <>
                <div>
                  <span className="text-base font-extrabold uppercase tracking-[.08em]" style={{ color: '#A9A59B' }}>Cada paquete debe pesar{rango.fijo ? '' : ' · provisional'}</span>
                  <div className="font-extrabold leading-none tabular-nums" style={{ fontFamily: 'var(--font-titulo), Georgia, serif', fontSize: 'clamp(56px, 10vw, 140px)' }}>{pesoTxt(rango)}</div>
                </div>
                <div className="recuerda rounded-2xl px-5 py-4 font-extrabold text-[clamp(22px,3vw,36px)]" style={{ background: '#C41230', color: '#fff', fontFamily: 'var(--font-titulo), Georgia, serif' }}>Verifique el peso en la gramera</div>
              </>
            ) : pBaja && <span className="text-2xl" style={{ color: '#A9A59B' }}>Falta el peso de esta referencia en Estándares.</span>}
          </div>
          {actual.r.sigue ? (
            <div className="rounded-3xl p-6 md:p-10 flex flex-col justify-center gap-2" style={{ background: '#F2B21B', color: '#1C1B19' }}>
              <span className="text-base font-extrabold uppercase tracking-[.08em]">Sigue · llega en unos {actual.r.sigue.faltan} min</span>
              <span className="font-extrabold leading-none" style={{ fontFamily: 'var(--font-titulo), Georgia, serif', fontSize: 'clamp(44px, 7vw, 96px)' }}>{nombre(actual.r.sigue.producto_id)}</span>
              <span className="text-2xl font-bold">Preparar empaque de {nombre(actual.r.sigue.producto_id)}</span>
              {rangoSigue && <span className="text-2xl font-bold tabular-nums">Paquete {pesoTxt(rangoSigue)}</span>}
            </div>
          ) : plan.sigue ? (
            <div className="rounded-3xl p-6 md:p-10 flex flex-col justify-center gap-2" style={{ background: '#262421' }}>
              <span className="text-base font-extrabold uppercase tracking-[.08em]" style={{ color: '#A9A59B' }}>Sigue en el plan</span>
              <span className="font-extrabold leading-none" style={{ fontFamily: 'var(--font-titulo), Georgia, serif', fontSize: 'clamp(40px, 6vw, 84px)' }}>{corto(plan.sigue.producto)}</span>
              <span className="text-2xl font-bold" style={{ color: '#A9A59B' }}>{plan.sigue.paquetes.toLocaleString('es-CO')} paquetes · preparar empaque</span>
              {rangoSigue && <span className="text-2xl font-bold tabular-nums" style={{ color: '#A9A59B' }}>Paquete {pesoTxt(rangoSigue)}</span>}
            </div>
          ) : (
            <div className="rounded-3xl p-6 md:p-10 flex flex-col justify-center gap-2" style={{ background: '#262421', color: '#A9A59B' }}>
              <span className="text-base font-extrabold uppercase tracking-[.08em]">Sigue</span>
              <span className="text-3xl font-bold">Sin cambio programado</span>
            </div>
          )}
        </div>
      )}
      {actual && (
        <div className="flex flex-col gap-2">
          <span className="text-base font-extrabold uppercase tracking-[.08em]" style={{ color: '#A9A59B' }}>Empacado de este lote</span>
          <div className="flex gap-6 flex-wrap text-2xl tabular-nums">
            {Object.entries(emp).filter(([, n]) => n > 0).map(([pid, n]) => <span key={pid}><b>{nombre(pid)}</b> {n.toLocaleString('es-CO')}</span>)}
            {!Object.values(emp).some(n => n > 0) && <span style={{ color: '#A9A59B' }}>Nada todavía</span>}
          </div>
        </div>
      )}
    </div>
  )
}
