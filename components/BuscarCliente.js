'use client'
// Buscador de clientes con lupa para todo el sistema: se escribe parte del
// nombre, apartamento, edificio, barrio, teléfono o NIT y se escoge de la lista.
// Reemplaza las listas desplegables con todos los clientes (con mil o dos mil
// clientes era imposible encontrar uno).
//
// Props:
//   clientes: [{ id, nombre, apto?, edificio?, direccion?, barrio?, telefono?, nit?, rutas?: { nombre } }]
//   value: id escogido ('' o null si ninguno)
//   onChange(id, cliente): al escoger o al quitar (id = '')
//   libre / onLibre(texto): opcional. Si se pasa, lo escrito sin escoger queda
//     como nombre de un cliente sin registrar. Al escribir solo se llama
//     onLibre (quien lo usa quita lo escogido); al escoger, solo onChange.
//   detalle(c): texto gris debajo del nombre (opcional)
//   extras: [{ id, nombre, detalle }] opciones fijas al final (ej. "Otro")

import { useId, useMemo, useRef, useState } from 'react'

const TINTA = '#1c1b19'
const GRIS = '#5a5750'
const LINEA = '#e4e1d8'
const SUAVE = '#f4f2ec'

export const normalizarTexto = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const detalleBase = (c) => [[c.edificio, c.apto].filter(Boolean).filter(t => !String(c.nombre || '').includes(t)).join(' '), c.barrio, c.rutas?.nombre].filter(Boolean).join(' · ')

export default function BuscarCliente({ clientes = [], value, onChange, libre, onLibre, placeholder = 'Buscar cliente', detalle, extras = [], className = '', style, ariaLabel = 'Buscar cliente', maximo = 40 }) {
  const elegido = value ? (clientes.find(c => c.id === value) || extras.find(x => x.id === value)) : null
  const [q, setQ] = useState(null)
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(0)
  const caja = useRef(null)
  const idLista = useId()
  const texto = q ?? (elegido ? elegido.nombre : (libre || ''))

  const indice = useMemo(() => clientes.map(c => ({ c, k: normalizarTexto([c.nombre, c.apto, c.edificio, c.direccion, c.barrio, c.telefono, c.nit, c.rutas?.nombre].filter(Boolean).join(' ')) })), [clientes])
  const resultados = useMemo(() => {
    const palabras = normalizarTexto(q || '').split(' ').filter(Boolean)
    const lista = palabras.length ? indice.filter(x => palabras.every(p => x.k.includes(p))).map(x => x.c) : indice.map(x => x.c)
    return lista.slice(0, maximo)
  }, [indice, q, maximo])
  const total = resultados.length + extras.length

  const escoger = (c) => {
    setQ(null); setAbierto(false)
    onChange?.(c.id, c)
  }
  const escribir = (t) => {
    setQ(t); setAbierto(true); setActivo(0)
    if (onLibre) onLibre(t)
    else if (value) onChange?.('', null)
  }
  const tecla = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAbierto(true); setActivo(a => Math.min(a + 1, total - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && abierto && total > 0) {
      e.preventDefault()
      escoger(activo < resultados.length ? resultados[activo] : extras[activo - resultados.length])
    } else if (e.key === 'Escape') { setAbierto(false) }
  }

  return (
    <div ref={caja} className="relative min-w-0" onBlur={e => { if (!caja.current?.contains(e.relatedTarget)) { setAbierto(false); setQ(null) } }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: GRIS }}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input type="text" value={texto} placeholder={placeholder} aria-label={ariaLabel} autoComplete="off"
        role="combobox" aria-expanded={abierto} aria-controls={idLista} aria-autocomplete="list"
        onChange={e => escribir(e.target.value)} onFocus={e => { setAbierto(true); setActivo(0); if (elegido) { setQ(''); e.target.select() } }} onKeyDown={tecla}
        className={className + ' w-full'} style={{ ...style, paddingLeft: 36, paddingRight: value ? 34 : undefined, fontWeight: elegido ? 700 : undefined }} />
      {value && (
        <button type="button" onClick={() => { onChange?.('', null); setQ(''); setAbierto(true) }} aria-label="Quitar cliente"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-[15px] leading-none" style={{ color: GRIS, background: SUAVE }}>×</button>
      )}
      {abierto && (
        <div id={idLista} role="listbox" className="absolute z-30 left-0 right-0 mt-1 bg-white rounded-xl overflow-y-auto" style={{ maxHeight: 300, border: `1px solid ${LINEA}`, boxShadow: '0 10px 30px rgba(28,27,25,.14)' }}>
          {resultados.length === 0 && (
            <p className="px-3 py-2.5 text-[13.5px]" style={{ color: GRIS }}>
              {onLibre && (q || '').trim() ? `No hay clientes con "${q.trim()}". Se guarda como cliente sin registrar.` : 'No hay clientes con ese nombre.'}
            </p>
          )}
          {[...resultados, ...extras].map((c, i) => {
            const sub = c.detalle ?? (detalle ? detalle(c) : detalleBase(c))
            return (
              <button key={c.id} type="button" role="option" aria-selected={c.id === value} tabIndex={-1}
                onMouseDown={e => e.preventDefault()} onClick={() => escoger(c)} onMouseEnter={() => setActivo(i)}
                className="w-full text-left px-3 py-2 flex flex-col" style={{ background: i === activo ? SUAVE : 'transparent', borderTop: i ? `1px solid ${SUAVE}` : 0 }}>
                <span className="text-[14px] font-bold" style={{ color: TINTA }}>{c.nombre}</span>
                {sub ? <span className="text-[12.5px]" style={{ color: GRIS }}>{sub}</span> : null}
              </button>
            )
          })}
          {clientes.length > maximo && resultados.length === maximo && (
            <p className="px-3 py-2 text-[12.5px]" style={{ color: GRIS, borderTop: `1px solid ${SUAVE}` }}>Escriba más letras para ver los demás.</p>
          )}
        </div>
      )}
    </div>
  )
}
