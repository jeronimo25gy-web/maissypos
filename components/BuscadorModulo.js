'use client'
import { useEffect, useRef, useState } from 'react'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { leerFechaTexto } from '@/lib/leer-fecha'
import { abrirBuscador } from '@/components/Buscador'

const normal = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Buscador dentro de un modulo: filtra lo que esta en pantalla marcado con
// data-fila, por cualquier texto de la fila. Sigue filtrando si la lista cambia.
// Con `alFecha` también entiende fechas: filtra por data-fecha y avisa al módulo
// para que cargue ese día. Si nada coincide, Enter lleva el texto al buscador general.
export default function BuscadorModulo({ nombre, alFecha, ayuda }) {
  const [texto, setTexto] = useState('')
  const [vacio, setVacio] = useState(false)
  const caja = useRef(null)
  const fecha = alFecha ? leerFechaTexto(texto, obtenerFechaActual()) : null
  const avisar = useRef(alFecha)
  avisar.current = alFecha
  const primera = useRef(true)

  useEffect(() => {
    if (primera.current) { primera.current = false; return }
    avisar.current?.(fecha)
  }, [fecha])

  useEffect(() => {
    const raiz = caja.current?.closest('.hoja')
    if (!raiz) return
    const palabras = normal(texto).split(/\s+/).filter(Boolean)
    const filtrar = () => {
      let vistas = 0
      raiz.querySelectorAll('[data-fila]:not([data-grilla])').forEach(el => {
        const ver = fecha ? el.dataset.fecha === fecha : palabras.every(p => normal(el.textContent).includes(p))
        if (el.hidden === ver) el.hidden = !ver
        if (ver) vistas++
      })
      setVacio(palabras.length > 0 && vistas === 0)
    }
    filtrar()
    const vigia = new MutationObserver(filtrar)
    vigia.observe(raiz, { childList: true, subtree: true })
    return () => vigia.disconnect()
  }, [texto, fecha])

  return (
    <div ref={caja} className="flex items-center gap-2 min-w-0">
      {vacio && <span className="text-[13.5px] font-bold whitespace-nowrap" style={{ color: '#5A5750' }}>Sin resultados</span>}
      <label className="caja-busqueda flex-1">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input type="search" value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && vacio && !fecha) abrirBuscador(texto) }}
          placeholder={ayuda || `Buscar en ${nombre}`} aria-label={`Buscar en ${nombre}`}
          className="flex-1 min-w-0 bg-transparent outline-none text-[15px] font-medium" style={{ color: '#1C1B19' }} />
      </label>
    </div>
  )
}
