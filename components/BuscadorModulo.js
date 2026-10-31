'use client'
import { useEffect, useRef, useState } from 'react'

const normal = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Buscador dentro de un modulo: filtra lo que esta en pantalla marcado con
// data-fila, por cualquier texto de la fila. Sigue filtrando si la lista cambia.
export default function BuscadorModulo({ nombre }) {
  const [texto, setTexto] = useState('')
  const [vacio, setVacio] = useState(false)
  const caja = useRef(null)

  useEffect(() => {
    const raiz = caja.current?.closest('.hoja')
    if (!raiz) return
    const palabras = normal(texto).split(/\s+/).filter(Boolean)
    const filtrar = () => {
      let vistas = 0
      raiz.querySelectorAll('[data-fila]').forEach(el => {
        const ver = palabras.every(p => normal(el.textContent).includes(p))
        if (el.hidden === ver) el.hidden = !ver
        if (ver) vistas++
      })
      setVacio(palabras.length > 0 && vistas === 0)
    }
    filtrar()
    const vigia = new MutationObserver(filtrar)
    vigia.observe(raiz, { childList: true, subtree: true })
    return () => vigia.disconnect()
  }, [texto])

  return (
    <div ref={caja} className="flex items-center gap-2 min-w-0">
      {vacio && <span className="text-[13.5px] font-bold whitespace-nowrap" style={{ color: '#5A5750' }}>Sin resultados</span>}
      <label className="flex items-center gap-2 h-11 px-3.5 rounded-[13px] bg-white min-w-0 w-full sm:w-[260px]" style={{ color: '#5A5750' }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input type="search" value={texto} onChange={e => setTexto(e.target.value)} placeholder={`Buscar en ${nombre}`} aria-label={`Buscar en ${nombre}`}
          className="flex-1 min-w-0 bg-transparent outline-none text-[15px] font-medium" style={{ color: '#1C1B19' }} />
      </label>
    </div>
  )
}
