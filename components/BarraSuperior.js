'use client'
import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useSidebar } from '@/contexts/SidebarContext'
import Campanita from '@/components/Campanita'
import { abrirBuscador } from '@/components/Buscador'
import { cerrarSesionUsuario } from '@/lib/sesion'
import { nombreRol } from '@/lib/permisos'
import { TEMAS, aplicarTema, temaGuardado } from '@/lib/tema'

// Barra superior del marco: nombre del modulo (lo sube PageHeader a
// #ranura-titulo), buscador general al centro, avisos y la cuenta a la derecha.
export default function BarraSuperior({ usuario }) {
  const router = useRouter()
  const { setAbierto } = useSidebar()
  const [cuenta, setCuenta] = useState(false)
  const [tema, setTema] = useState('rojo')
  const caja = useRef(null)

  useEffect(() => { const t = temaGuardado(); setTema(t); aplicarTema(t) }, [])

  useEffect(() => {
    if (!cuenta) return
    const cerrar = (e) => { if (caja.current && !caja.current.contains(e.target)) setCuenta(false) }
    document.addEventListener('pointerdown', cerrar)
    return () => document.removeEventListener('pointerdown', cerrar)
  }, [cuenta])

  const salir = async () => {
    await cerrarSesionUsuario(usuario?.id)
    localStorage.removeItem('maissy_usuario')
    router.push('/entrar')
  }

  return (
    <header className="barra-superior print:hidden">
      <button type="button" onClick={() => setAbierto(true)} aria-label="Abrir el menú" className="boton-m md:hidden" style={{ gridArea: 'menu' }}>
        <Image src="/Maissy_M_Registrada.png" width={76} height={76} alt="" className="sin-dorado" priority />
        <Image src="/maissy-dorado-m.png" width={32} height={32} alt="" className="solo-dorado" />
      </button>
      <div id="ranura-titulo" className="min-w-0" style={{ gridArea: 'titulo' }} />
      <button type="button" onClick={() => abrirBuscador()} aria-label="Buscar en MaissyPOS (Ctrl K)" className="barra-buscar" style={{ gridArea: 'buscar' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <span className="flex-1 text-left truncate">Buscar</span>
        <kbd className="hidden lg:inline text-[12px] font-bold">Ctrl K</kbd>
      </button>
      <div className="flex items-center justify-end gap-2.5" style={{ gridArea: 'acciones' }}>
        <Campanita />
        <div ref={caja} className="relative">
          <button type="button" onClick={() => setCuenta(!cuenta)} aria-expanded={cuenta} aria-label="Mi cuenta"
            className="w-[46px] h-[46px] rounded-full flex items-center justify-center font-extrabold text-[16px]" style={{ background: 'var(--avatar)', color: 'var(--avatar-texto)' }}>
            {(usuario?.nombre || '?').charAt(0).toUpperCase()}
          </button>
          {cuenta && (
            <div className="absolute right-0 top-[54px] z-50 bg-white rounded-2xl p-2 w-[230px]" style={{ color: '#1C1B19', boxShadow: '0 16px 40px rgba(28,27,25,.18)' }}>
              <div className="px-2.5 py-2">
                <b className="block text-[15px] truncate">{usuario?.nombre}</b>
                <span className="block text-[13px]" style={{ color: '#5A5750' }}>{nombreRol(usuario)}</span>
              </div>
              <div role="group" aria-label="Tema" className="flex gap-1 p-1 mx-1 mb-1 rounded-full" style={{ background: '#EFEDE6' }}>
                {TEMAS.map(([id, nombre]) => (
                  <button key={id} type="button" aria-pressed={tema === id} onClick={() => { setTema(id); aplicarTema(id) }} className="flex-1 rounded-full min-h-[36px] text-[13.5px] font-bold"
                    style={tema === id ? { background: '#1C1B19', color: '#fff' } : { color: '#5A5750' }}>{nombre}</button>
                ))}
              </div>
              <button type="button" onClick={salir} className="w-full text-left rounded-xl px-2.5 min-h-[42px] text-[14px] font-bold hover:bg-[#F3F1EA]">Cerrar sesión</button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
