'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getEmpresaId } from '@/lib/empresa'
import { cargarPendientes } from '@/lib/pendientes'

// Campanita de pendientes en el encabezado de cada pantalla (admin y
// auxiliar): el numero total y la lista corta, por urgencia.
const COLOR = { alta: 'var(--rojo)', hoy: 'var(--acento)', semana: '#8C877C' }

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
    let vivo = true, intentos = 0, espera
    // La empresa la guarda el menu al cargar: si todavia no esta, se espera un momento.
    const cargar = () => {
      const empresa = getEmpresaId()
      if (!empresa) { if (intentos++ < 10) espera = setTimeout(cargar, 500); return }
      cargarPendientes([empresa]).then(it => { if (vivo) setItems(it) }).catch(() => {})
    }
    cargar()
    return () => { vivo = false; clearTimeout(espera) }
  }, [habilitada, pathname])

  useEffect(() => {
    if (!abierta) return
    const cerrar = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierta(false) }
    document.addEventListener('pointerdown', cerrar)
    return () => document.removeEventListener('pointerdown', cerrar)
  }, [abierta])

  if (!habilitada) return null
  // Cuenta pendientes (como el Inicio), no unidades: 3 cambios sin clasificar es 1 pendiente.
  const total = items.length
  const altas = items.filter(it => it.prioridad === 'alta').length

  return (
    <div ref={caja} className="relative shrink-0">
      <button onClick={() => setAbierta(!abierta)} aria-label={`Pendientes: ${total}`} aria-expanded={abierta}
        className="relative w-[46px] h-[46px] rounded-full flex items-center justify-center transition-colors" style={{ background: 'var(--marco-2)', color: 'var(--sobre-marco)' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {total > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-full text-[12px] font-extrabold flex items-center justify-center"
            style={altas ? { background: 'var(--alerta-marco)', color: 'var(--alerta-marco-texto)' } : { background: 'var(--acento)', color: '#1C1B19' }}>{total > 99 ? '99+' : total}</span>
        )}
      </button>
      {abierta && (
        <div className="absolute right-0 top-[54px] z-50 bg-white rounded-2xl p-2 text-left" style={{ width: 'min(360px, calc(100vw - 24px))', color: '#1C1B19', boxShadow: '0 16px 40px rgba(28,27,25,.18)' }}>
          <p className="px-2 pt-1 pb-2 font-extrabold" style={{ fontFamily: 'var(--font-titulo), Georgia, serif' }}>Tareas</p>
          {items.length === 0 && <p className="px-2 pb-3 text-sm text-gray-500">Todo al día.</p>}
          <div className="max-h-[60vh] overflow-y-auto">
            {items.slice(0, 8).map(it => (
              <Link key={it.clave} href={it.href} onClick={() => setAbierta(false)} className="flex gap-2.5 px-2 py-2 rounded-xl hover:bg-[#F3F1EA]">
                <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5" style={{ background: COLOR[it.prioridad] }} />
                <span className="min-w-0 text-[13.5px] leading-snug">
                  <b className="font-bold text-gray-900">{it.titulo}</b>
                  {it.detalle && <span className="block text-xs text-gray-500 truncate">{it.detalle}</span>}
                </span>
              </Link>
            ))}
          </div>
          {items.length > 0 && (
            <Link href="/tareas" onClick={() => setAbierta(false)} className="block mt-1 px-2 py-2 text-sm font-bold underline underline-offset-4 text-gray-900">Ver todas las tareas</Link>
          )}
        </div>
      )}
    </div>
  )
}
