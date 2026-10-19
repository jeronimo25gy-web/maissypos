'use client'
import { useState, useEffect } from 'react'
import { lotesAbiertos, referencias, empacado } from '@/lib/planta'

// Pantalla de abajo (televisor o monitor): qué está bajando, qué sigue y
// cuánto se ha empacado. Nadie la toca; se actualiza sola.
const corto = (p) => (p?.nombre || '').replace(/^Arepa (de Maíz )?/i, '')

export default function Monitor({ estado, sinSenal }) {
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

  return (
    <div className="min-h-screen p-5 md:p-8 flex flex-col gap-5" style={{ background: '#141414', color: '#F4F2EC' }}>
      <div className="flex justify-between gap-4 text-lg font-bold" style={{ color: '#A9A59B' }}>
        <span>Empaque · {tanque ? tanque.nombre : 'sin lote en troqueladora'}</span>
        <span>{sinSenal ? 'Sin señal · ' : ''}{hora}</span>
      </div>
      {!actual ? (
        <div className="flex-1 flex items-center justify-center text-3xl font-bold" style={{ color: '#A9A59B' }}>Todavía no hay nada en troqueladora.</div>
      ) : (
        <div className="flex-1 grid gap-5 md:grid-cols-[1.3fr_1fr]">
          <div className="rounded-3xl p-6 md:p-10 flex flex-col justify-center gap-2" style={{ background: '#262421' }}>
            <span className="text-base font-extrabold uppercase tracking-[.08em]" style={{ color: '#A9A59B' }}>Bajando ahora</span>
            <span className="font-extrabold leading-none" style={{ fontFamily: 'var(--font-titulo), Georgia, serif', fontSize: 'clamp(56px, 10vw, 140px)' }}>{actual.r.bajando ? nombre(actual.r.bajando.producto_id) : '—'}</span>
          </div>
          {actual.r.sigue ? (
            <div className="rounded-3xl p-6 md:p-10 flex flex-col justify-center gap-2" style={{ background: '#F2B21B', color: '#1C1B19' }}>
              <span className="text-base font-extrabold uppercase tracking-[.08em]">Sigue · llega en unos {actual.r.sigue.faltan} min</span>
              <span className="font-extrabold leading-none" style={{ fontFamily: 'var(--font-titulo), Georgia, serif', fontSize: 'clamp(44px, 7vw, 96px)' }}>{nombre(actual.r.sigue.producto_id)}</span>
              <span className="text-2xl font-bold">Alisten bolsas de {nombre(actual.r.sigue.producto_id)}</span>
            </div>
          ) : (
            <div className="rounded-3xl p-6 md:p-10 flex flex-col justify-center gap-2" style={{ background: '#262421', color: '#A9A59B' }}>
              <span className="text-base font-extrabold uppercase tracking-[.08em]">Sigue</span>
              <span className="text-3xl font-bold">Sin cambio en camino</span>
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
