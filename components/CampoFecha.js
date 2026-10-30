'use client'
import { useRef } from 'react'

// Campo de fecha de MaissyPOS: muestra la fecha escrita ("jue 29 oct 2026"),
// centrada en su caja y con el icono del calendario. Encima va el selector
// nativo transparente, así en el celular abre el calendario del teléfono y
// onChange entrega el mismo evento de siempre (e.target.value = 'AAAA-MM-DD').
const escrita = (f) => {
  if (!f) return null
  const d = new Date(f + 'T12:00:00')
  if (isNaN(d)) return f
  const dia = d.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '')
  const mes = d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '')
  return `${dia} ${d.getDate()} ${mes} ${d.getFullYear()}`
}

export default function CampoFecha({ value, onChange, className = '', style, min, max, disabled, placeholder = 'Escoger fecha', ...resto }) {
  const campo = useRef(null)
  const abrir = () => { try { campo.current?.showPicker?.() } catch { /* el navegador abre el suyo */ } }
  return (
    <div className={`${className} relative !flex items-center gap-2 cursor-pointer`} style={{ ...style, opacity: disabled ? 0.55 : style?.opacity }} onClick={disabled ? undefined : abrir}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="shrink-0" style={{ opacity: 0.55 }}>
        <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" />
      </svg>
      <span className="flex-1 min-w-0 truncate tabular-nums whitespace-nowrap" style={value ? undefined : { opacity: 0.5 }}>{escrita(value) || placeholder}</span>
      <input ref={campo} type="date" value={value || ''} onChange={onChange} min={min} max={max} disabled={disabled} {...resto}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" style={{ colorScheme: 'light' }} />
    </div>
  )
}
