'use client'
import { useState, useEffect } from 'react'
import Image from 'next/image'
import Acceso from '@/components/Acceso'

// Acceso flotante de la pagina comercial: el formulario sale en un panel en
// la mitad de la pantalla (en el celular sube desde abajo) y la pagina queda
// detras, borrosa. Se abre con abrirAcceso() o con maissypos.com/#entrar.
export const abrirAcceso = () => window.dispatchEvent(new Event('maissy:acceso'))

export default function PanelAcceso() {
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    const abrir = () => setAbierto(true)
    const tecla = (e) => { if (e.key === 'Escape') setAbierto(false) }
    if (window.location.hash === '#entrar') setAbierto(true)
    window.addEventListener('maissy:acceso', abrir)
    window.addEventListener('keydown', tecla)
    return () => { window.removeEventListener('maissy:acceso', abrir); window.removeEventListener('keydown', tecla) }
  }, [])

  // La pagina de atras no se mueve mientras el panel esta abierto.
  useEffect(() => {
    document.body.style.overflow = abierto ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [abierto])

  if (!abierto) return null
  return (
    <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center" onClick={() => setAbierto(false)}
      style={{ background: 'rgba(243,241,234,.35)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
      <div role="dialog" aria-modal="true" aria-label="Entrar a MaissyPOS" onClick={e => e.stopPropagation()}
        className="w-full md:max-w-[440px] max-h-[92vh] overflow-y-auto rounded-t-[28px] md:rounded-[28px] px-5 pt-4 md:p-7 flex flex-col gap-2 items-center"
        style={{ background: '#F3F1EA', boxShadow: '0 16px 40px rgba(28,27,25,.18)', fontFamily: 'var(--font-texto), system-ui, sans-serif', paddingBottom: 'max(24px, calc(env(safe-area-inset-bottom, 0px) + 16px))' }}>
        <div className="md:hidden w-10 h-1 rounded-full mb-1" style={{ background: '#E3E1D8' }} />
        <div className="w-full max-w-[380px] flex items-center justify-between gap-3">
          <Image src="/maissypos-logo.png" width={150} height={56} alt="MaissyPOS" style={{ width: '150px', height: 'auto' }} />
          <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="w-11 h-11 rounded-full flex items-center justify-center bg-white" style={{ color: '#1C1B19' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <Acceso enPanel />
      </div>
    </div>
  )
}
