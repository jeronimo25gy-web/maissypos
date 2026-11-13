'use client'
import { useEffect } from 'react'
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
        : <span className="cifra-caja"><span className="cifra font-extrabold tabular-nums" style={{ ...titulo, '--cifra-max': '26px' }}>{valor}</span></span>}
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

// --- Pantallas de planta (rediseño): fondo oscuro, alto contraste, todo grande ---
// Se leen a dos o tres metros, con vapor y luz de lámparas, y se tocan con las
// manos con masa: botones de 72 px o más, separados, y sin teclado del sistema.
// Colores: amarillo = lo que está pasando o lo escogido; verde = listo (con la
// palabra); gris = lo que falta; rojo = la acción que confirma.
export const P = {
  fondo: '#0E0E0D', panel: '#1D1C19', panel2: '#2A2824', linea: '#3B3933',
  texto: '#F6F4EE', gris: '#B5B0A5', tenue: '#8C877C',
  amarillo: '#F2B21B', verde: '#5DBB78', verdeF: '#18351F', rojo: '#C41230', rojoTxt: '#FF7A7A', ambar: '#F2B21B',
}
export const fuenteTitulo = 'var(--font-titulo), Georgia, serif'

export function BotonP({ tono = 'oscuro', alto = 76, className = '', style, ...p }) {
  const t = {
    rojo: { background: P.rojo, color: '#fff' },
    blanco: { background: P.texto, color: P.fondo },
    amarillo: { background: P.amarillo, color: P.fondo },
    oscuro: { background: P.panel2, color: P.texto },
    verde: { background: P.verdeF, color: P.verde },
  }[tono]
  return <button type="button" {...p}
    className={`rounded-[18px] font-extrabold px-5 text-[22px] leading-tight disabled:opacity-35 enabled:hover:brightness-110 active:scale-[.97] transition select-none cursor-pointer disabled:cursor-default ${className}`}
    style={{ minHeight: alto, ...t, ...style }} />
}

export function Rotulo({ children, color = P.gris, className = '' }) {
  return <span className={`block text-[15px] font-extrabold uppercase tracking-[.09em] ${className}`} style={{ color }}>{children}</span>
}

// Hoja que se abre encima de la pantalla para un paso con datos (montar, sacar,
// pesar, cerrar). Se cierra con Cancelar; nunca se pierde lo que estaba atrás.
export function Hoja({ titulo, onCancelar, children }) {
  useEffect(() => {
    const f = (e) => { if (e.key === 'Escape') onCancelar?.() }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [onCancelar])
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto" style={{ background: P.fondo, color: P.texto }} role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="max-w-[980px] mx-auto px-4 md:px-6 py-5 flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="m-0 text-[34px] md:text-[40px] leading-tight font-extrabold" style={{ fontFamily: fuenteTitulo }}>{titulo}</h2>
          <BotonP onClick={onCancelar} alto={64}>Cancelar <Tecla>Esc</Tecla></BotonP>
        </div>
        {children}
      </div>
    </div>
  )
}

// Teclado numérico en pantalla, para el mouse. Si el equipo tiene teclado, los
// números, la coma, Borrar y Enter también sirven.
export function Teclado({ valor, onCambio, onEnter, decimales = true }) {
  const tocar = (k) => {
    if (k === 'borrar') return onCambio(valor.slice(0, -1))
    if (k === ',') return decimales && !valor.includes(',') && onCambio((valor || '0') + ',')
    if (valor.replace(',', '').length >= 6) return
    onCambio(valor === '0' ? k : valor + k)
  }
  useEffect(() => {
    const f = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); tocar(e.key) }
      else if (e.key === ',' || e.key === '.') { e.preventDefault(); tocar(',') }
      else if (e.key === 'Backspace') { e.preventDefault(); tocar('borrar') }
      else if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter() }
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  })
  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', decimales ? ',' : '', '0', 'borrar']
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {teclas.map((k, i) => k === '' ? <span key={i} /> : (
        <button key={i} type="button" onClick={() => tocar(k)} aria-label={k === 'borrar' ? 'Borrar' : k}
          className="rounded-[18px] min-h-[76px] text-[34px] font-extrabold hover:brightness-125 active:scale-[.96] transition select-none cursor-pointer"
          style={{ background: k === 'borrar' ? P.panel : P.panel2, color: P.texto, fontFamily: fuenteTitulo }}>
          {k === 'borrar' ? <span className="text-[20px]">Borrar</span> : k}
        </button>
      ))}
    </div>
  )
}

// Casilla de un dato que se llena con el Teclado: se toca para escogerla.
export function Casilla({ rotulo, valor, unidad, activa, tono, onClick }) {
  const borde = activa ? P.amarillo : tono || P.linea
  return (
    <button type="button" onClick={onClick} className="rounded-[18px] px-4 py-3 text-left flex flex-col gap-1 min-w-0"
      style={{ background: P.panel, boxShadow: `inset 0 0 0 ${activa ? 4 : 3}px ${borde}` }}>
      <span className="text-[16px] font-bold" style={{ color: P.gris }}>{rotulo}</span>
      <span className="text-[40px] leading-none font-extrabold tabular-nums truncate" style={{ fontFamily: fuenteTitulo, color: valor ? P.texto : P.tenue }}>
        {valor || '—'}{unidad && <span className="text-[20px] ml-1.5" style={{ color: P.gris }}>{unidad}</span>}
      </span>
    </button>
  )
}

// Tecla del teclado que hace lo mismo que el botón.
export function Tecla({ children, oscura }) {
  return <kbd className="inline-flex items-center justify-center min-w-[30px] h-[28px] px-2 ml-2 rounded-[8px] text-[14px] font-extrabold align-middle"
    style={{ fontFamily: 'inherit', boxShadow: `inset 0 0 0 2px ${oscura ? 'rgba(14,14,13,.45)' : 'rgba(246,244,238,.4)'}`, color: 'inherit' }}>{children}</kbd>
}

// Puntero grande y amarillo: el mouse se ve desde lejos en el monitor.
export const PUNTERO = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><path d="M4 3 L4 36 L13 28 L19 41 L25 38 L19 26 L31 26 Z" fill="#F2B21B" stroke="#0E0E0D" stroke-width="3" stroke-linejoin="round"/></svg>')}") 4 3, auto`

export const numP = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : NaN }
export const textoNum = (n) => String(Math.round(n * 100) / 100).replace('.', ',')
export const cortoRef = (p) => (p?.nombre || '').replace(/^Arepa (de Maíz )?/i, '')
