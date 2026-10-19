'use client'
// Piezas de la pantalla de planta: botones y campos grandes para tablet,
// colores del manual de marca (rojo solo para la acción principal).

export const C = {
  tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', linea: '#E3E1D8', suave: '#EFEDE6', neutro: '#E9E4D6',
  rojo: '#C41230', rojoF: '#FBE9E9', amarillo: '#F2B21B', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8',
}
export const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }

export function Boton({ tipo = 'suave', grande, className = '', style, ...p }) {
  const colores = {
    rojo: { background: C.rojo, color: '#fff' },
    verde: { background: C.verdeF, color: C.verde },
    tinta: { background: C.tinta, color: '#fff' },
    blanco: { background: '#fff', color: C.tinta },
    suave: { background: C.suave, color: C.tinta },
  }[tipo]
  return <button type="button" {...p}
    className={`rounded-2xl font-bold px-5 disabled:opacity-40 active:scale-[.98] transition-transform ${grande ? 'min-h-[64px] text-lg' : 'min-h-[52px] text-base'} ${className}`}
    style={{ ...colores, ...style }} />
}

// Opción seleccionable (tanque, referencia, textura): blanca con borde cuando está escogida.
export function Opcion({ sel, className = '', children, ...p }) {
  return <button type="button" {...p}
    className={`rounded-2xl text-left px-4 py-3 min-h-[64px] flex flex-col justify-center gap-0.5 ${className}`}
    style={sel ? { background: '#fff', boxShadow: `inset 0 0 0 2.5px ${C.tinta}`, color: C.tinta } : { background: C.suave, color: C.tinta }}>{children}</button>
}

export function Campo({ unidad, className = '', ...p }) {
  return (
    <div className="relative">
      <input inputMode="decimal" {...p}
        className={`w-full h-16 rounded-2xl border-2 bg-white px-4 text-[26px] font-extrabold focus:outline-none focus:border-[#1C1B19] ${unidad ? 'pr-20' : ''} ${className}`}
        style={{ borderColor: C.linea, color: C.tinta, ...titulo }} />
      {unidad && <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold" style={{ color: C.gris }}>{unidad}</span>}
    </div>
  )
}

export function Etiqueta({ children, extra }) {
  return <div className="flex items-baseline justify-between gap-2 flex-wrap text-sm font-bold">{children}{extra && <span className="text-xs font-bold" style={{ color: C.gris }}>{extra}</span>}</div>
}

export function Dato({ rotulo, valor, nota, sinDato }) {
  return (
    <div className="rounded-2xl px-4 py-3 flex flex-col gap-0.5" style={{ background: C.fondo }}>
      <span className="text-[13px]" style={{ color: C.gris }}>{rotulo}</span>
      {sinDato ? <span className="text-lg font-bold" style={{ color: C.gris }}>Sin dato</span>
        : <span className="text-[26px] font-extrabold leading-tight tabular-nums" style={titulo}>{valor}</span>}
      {nota && <span className="text-[13px]" style={{ color: C.gris }}>{nota}</span>}
    </div>
  )
}

export function Pill({ tono = 'gris', children }) {
  const t = { gris: [C.suave, C.gris], ambar: [C.ambarF, C.ambar], verde: [C.verdeF, C.verde], rojo: [C.rojoF, C.rojo] }[tono]
  return <span className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: t[0], color: t[1] }}>{children}</span>
}

export function Tarjeta({ className = '', children, style }) {
  return <div className={`bg-white rounded-[20px] p-4 md:p-5 flex flex-col gap-4 ${className}`} style={style}>{children}</div>
}

// Hora "HH:MM" de un ISO en Bogotá, y de vuelta a ISO con la fecha que ya tenía.
export const horaInput = (iso) => iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }) : ''
export const isoDesdeHora = (isoBase, hhmm) => {
  const fecha = new Date(isoBase || Date.now()).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  return new Date(`${fecha}T${hhmm}:00-05:00`).toISOString()
}

// Pitido corto para el aviso de pesar (solo suena si ya tocaron la pantalla).
let audio = null
export function pitar() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)()
    const o = audio.createOscillator(), g = audio.createGain()
    o.frequency.value = 880; g.gain.value = 0.15
    o.connect(g); g.connect(audio.destination)
    o.start(); o.stop(audio.currentTime + 0.35)
    navigator.vibrate?.(300)
  } catch {}
}
