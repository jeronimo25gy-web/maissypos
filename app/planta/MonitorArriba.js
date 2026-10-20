'use client'
import { useState, useEffect } from 'react'
import { loteEnLinea, referencias, gramajeCrudo, planDeHoy, ultimoPesaje, estadoPeso, rangoPaquete, fmtHora } from '@/lib/planta'

// Pantalla de arriba (televisor frente a la troqueladora): qué se está haciendo,
// cuánto debe pesar cada arepa cruda, cómo están saliendo los paquetes abajo y
// qué sigue en el plan. Nadie la toca; se actualiza sola.
const corto = (p) => (p?.nombre || '').replace(/^Arepa (de Maíz )?/i, '')
const T = { fondo: '#141414', caja: '#262421', texto: '#F4F2EC', gris: '#A9A59B', amarillo: '#F2B21B', rojo: '#C41230', verde: '#7FB58C', titulo: 'var(--font-titulo), Georgia, serif' }

export default function MonitorArriba({ estado, sinSenal, onSalir }) {
  const [hora, setHora] = useState('')
  useEffect(() => {
    const f = () => setHora(new Date().toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' }))
    f(); const t = setInterval(f, 15000); return () => clearInterval(t)
  }, [])
  const c = loteEnLinea(estado)
  const { arriba } = c ? referencias(estado, c) : {}
  const p = estado.referencias.find(x => x.id === arriba?.producto_id)
  const g = gramajeCrudo(estado, p)
  const plan = planDeHoy(estado, p?.id)
  const fila = plan.filas.find(f => f.producto_id === p?.id)
  const pesaje = p && ultimoPesaje(estado, p.id)
  const rango = p && rangoPaquete(estado, p)
  const g0 = pesaje ? Number(pesaje.peso_promedio_g) : null
  const est = pesaje && estadoPeso(estado, p, g0)
  const sigueG = plan.sigue && gramajeCrudo(estado, plan.sigue.producto)
  const tanque = c && estado.tanques.find(t => t.id === c.tanque_id)

  return (
    <div className="min-h-screen p-5 md:p-8 flex flex-col gap-5" style={{ background: T.fondo, color: T.texto }}>
      <style>{`@media (prefers-reduced-motion: no-preference) { .recuerda { animation: recuerda 4s ease-in-out infinite } } @keyframes recuerda { 0%, 70%, 100% { opacity: 1 } 85% { opacity: .55 } }`}</style>
      <div className="flex justify-between gap-4 text-lg font-bold" style={{ color: T.gris }}>
        <span>Troqueladora · {tanque ? tanque.nombre : 'sin lote en línea'}</span>
        <span className="flex items-center gap-4">{sinSenal ? 'Sin señal · ' : ''}{hora}
          {onSalir && <button type="button" onClick={onSalir} className="text-sm font-bold rounded-xl px-3 min-h-[36px]" style={{ background: T.caja, color: T.gris }}>Cambiar pantalla</button>}
        </span>
      </div>
      {!p ? (
        <div className="flex-1 flex items-center justify-center text-3xl font-bold text-center" style={{ color: T.gris }}>Cuando cambien el molde en la tablet, aquí sale qué se está haciendo y cuánto debe pesar.</div>
      ) : (
        <div className="flex-1 grid gap-5 md:grid-cols-[1.4fr_1fr]">
          <div className="rounded-3xl p-6 md:p-10 flex flex-col justify-center gap-4" style={{ background: T.caja }}>
            <div>
              <span className="text-base font-extrabold uppercase tracking-[.08em]" style={{ color: T.gris }}>Estás haciendo</span>
              <div className="font-extrabold leading-none" style={{ fontFamily: T.titulo, fontSize: 'clamp(48px, 8vw, 110px)' }}>{corto(p)}</div>
              {fila && <span className="text-xl tabular-nums" style={{ color: T.gris }}>{fila.hecho.toLocaleString('es-CO')} de {fila.paquetes.toLocaleString('es-CO')} paquetes del plan</span>}
            </div>
            {g ? (
              <div>
                <span className="text-base font-extrabold uppercase tracking-[.08em]" style={{ color: T.gris }}>Cada arepa cruda debe pesar{g.provisional ? ' · provisional' : ''}</span>
                <div className="font-extrabold leading-none tabular-nums" style={{ fontFamily: T.titulo, fontSize: 'clamp(56px, 10vw, 140px)' }}>{g.min} a {g.max} g</div>
                <span className="text-2xl tabular-nums" style={{ color: T.gris }}>5 juntas en la gramera: {g.min * 5} a {g.max * 5} g</span>
              </div>
            ) : <span className="text-2xl" style={{ color: T.gris }}>Falta el gramaje en crudo de esta referencia en Estándares.</span>}
            <div className="recuerda rounded-2xl px-5 py-4 font-extrabold text-[clamp(22px,3vw,36px)]" style={{ background: T.rojo, color: '#fff', fontFamily: T.titulo }}>Recuerda seguir pesando en la gramera</div>
          </div>
          <div className="flex flex-col gap-5">
            <div className="rounded-3xl p-6 flex flex-col gap-1" style={{ background: T.caja }}>
              <span className="text-base font-extrabold uppercase tracking-[.08em]" style={{ color: T.gris }}>Abajo, última caja{pesaje ? ` · ${fmtHora(pesaje.hora)}` : ''}</span>
              {pesaje ? <>
                <span className="font-extrabold text-[clamp(32px,4vw,56px)] leading-tight tabular-nums" style={{ fontFamily: T.titulo }}>Paquetes en {Math.round(pesaje.peso_promedio_g).toLocaleString('es-CO')} g</span>
                <span className="text-2xl font-bold" style={{ color: est === 'bien' ? T.verde : T.amarillo }}>
                  {est === 'bien' ? `Bien · entre ${rango.min.toLocaleString('es-CO')} y ${rango.max.toLocaleString('es-CO')} g`
                    : est === 'bajo' ? `${Math.round(rango.min - g0)} g por debajo del mínimo · sube el gramaje`
                    : est === 'alto' ? `${Math.round(g0 - rango.max)} g por encima del máximo · baja un poco el gramaje` : ''}
                </span>
              </> : <span className="text-2xl" style={{ color: T.gris }}>Todavía no han pesado cajas de {corto(p)}</span>}
            </div>
            {plan.sigue ? (
              <div className="rounded-3xl p-6 flex flex-col gap-1" style={{ background: T.amarillo, color: '#1C1B19' }}>
                <span className="text-base font-extrabold uppercase tracking-[.08em]">Sigue en el plan</span>
                <span className="font-extrabold text-[clamp(32px,4vw,56px)] leading-tight" style={{ fontFamily: T.titulo }}>{corto(plan.sigue.producto)} · {plan.sigue.paquetes.toLocaleString('es-CO')}</span>
                {sigueG && <span className="text-2xl font-bold tabular-nums">Cruda {sigueG.min} a {sigueG.max} g · ajusta el molde cuando cambies</span>}
              </div>
            ) : (
              <div className="rounded-3xl p-6 flex flex-col gap-1" style={{ background: T.caja, color: T.gris }}>
                <span className="text-base font-extrabold uppercase tracking-[.08em]">Sigue</span>
                <span className="text-2xl font-bold">{plan.filas.length ? 'El plan de hoy va completo' : 'No hay plan de hoy'}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
