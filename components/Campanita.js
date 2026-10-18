'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getEmpresaId } from '@/lib/empresa'
import { cargarPendientes } from '@/lib/pendientes'

// Campanita de pendientes en el encabezado de cada pantalla (admin y
// auxiliar): el numero total y la lista corta, por urgencia.
const COLOR = { alta: '#C41230', hoy: '#F2B21B', semana: '#8C877C' }

export default function Campanita() {
  const pathname = usePathname()
  const [usuario, setUsuario] = useState(null)
  const [items, setItems] = useState([])
  const [abierta, setAbierta] = useState(false)
  const caja = useRef(null)

  useEffect(() => {
    try { setUsuario(JSON.parse(localStorage.getItem('maissy_usuario') || 'null')) } catch { setUsuario(null) }
  }, [])
  const habilitada = usuario && ['admin', 'auxiliar'].includes(usuario.rol)

  useEffect(() => {
    if (!habilitada) return
    let vivo = true
    cargarPendientes([getEmpresaId()]).then(it => { if (vivo) setItems(it) }).catch(() => {})
    return () => { vivo = false }
  }, [habilitada, pathname])

  useEffect(() => {
    if (!abierta) return
    const cerrar = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierta(false) }
    document.addEventListener('pointerdown', cerrar)
    return () => document.removeEventListener('pointerdown', cerrar)
  }, [abierta])

  if (!habilitada) return null
  const total = items.reduce((s, it) => s + (it.cantidad || 1), 0)
  const altas = items.filter(it => it.prioridad === 'alta').length

  return (
    <div ref={caja} className="relative shrink-0">
      <button onClick={() => setAbierta(!abierta)} aria-label={`Pendientes: ${total}`} aria-expanded={abierta}
        className="relative w-10 h-10 rounded-xl flex items-center justify-center text-gray-600 hover:bg-gray-100">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {total > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full text-[11px] font-extrabold flex items-center justify-center border-2 border-white"
            style={{ background: altas ? '#C41230' : '#F2B21B', color: altas ? '#fff' : '#1C1B19' }}>{total > 99 ? '99+' : total}</span>
        )}
      </button>
      {abierta && (
        <div className="absolute right-0 top-12 z-50 bg-white rounded-2xl p-2 text-left" style={{ width: 'min(360px, calc(100vw - 24px))', boxShadow: '0 16px 40px rgba(28,27,25,.18)' }}>
          <p className="px-2 pt-1 pb-2 font-extrabold" style={{ fontFamily: 'var(--font-titulo), Georgia, serif' }}>Pendientes</p>
          {items.length === 0 && <p className="px-2 pb-3 text-sm text-gray-500">Todo al día.</p>}
          <div className="max-h-[60vh] overflow-y-auto">
            {items.slice(0, usuario.rol === 'admin' ? 8 : 40).map(it => (
              <Link key={it.clave} href={it.href} onClick={() => setAbierta(false)} className="flex gap-2.5 px-2 py-2 rounded-xl hover:bg-[#F3F1EA]">
                <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5" style={{ background: COLOR[it.prioridad] }} />
                <span className="min-w-0 text-[13.5px] leading-snug">
                  <b className="font-bold text-gray-900">{it.titulo}</b>
                  {it.detalle && <span className="block text-xs text-gray-500 truncate">{it.detalle}</span>}
                </span>
              </Link>
            ))}
          </div>
          {usuario.rol === 'admin' && items.length > 0 && (
            <Link href="/ejecutivo" onClick={() => setAbierta(false)} className="block mt-1 px-2 py-2 text-sm font-bold text-[#C41230]">Ver todo en el Inicio</Link>
          )}
        </div>
      )}
    </div>
  )
}
