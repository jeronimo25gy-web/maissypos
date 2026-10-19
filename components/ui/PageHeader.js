'use client'
import { useRouter } from 'next/navigation'
import { ArrowLeftIcon, Bars3Icon } from '@heroicons/react/24/outline'
import { useSidebar } from '@/contexts/SidebarContext'
import Campanita from '@/components/Campanita'
import { volverAtras } from '@/lib/navegacion'
import { abrirBuscador } from '@/components/Buscador'

export default function PageHeader({ title, subtitle, actions, filters, backHref, onBack, showBack = true }) {
  const router = useRouter()
  const { setAbierto } = useSidebar()
  const volver = onBack || (() => backHref ? router.push(backHref) : volverAtras(router))

  return (
    <div className="bg-white shadow-sm px-4 md:px-6 py-3 md:py-4 sticky top-0 z-10">
      {/* Movil: back-izquierda / titulo-centro / hamburger-derecha, nunca superpuestos */}
      {/* Columnas laterales del mismo ancho: el titulo queda en el centro de verdad. */}
      <div className="grid md:hidden grid-cols-[84px_minmax(0,1fr)_84px] items-center gap-2">
        <div className="flex items-center">
          {showBack && (
            <button onClick={volver} aria-label="Volver" className="w-10 h-10 -ml-2 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors duration-150">
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
          )}
        </div>
        <h1 className={`min-w-0 font-black text-gray-900 text-center break-words line-clamp-2 ${String(title || '').length > 14 ? 'text-[15px] leading-tight' : 'text-lg'}`}>{title}</h1>
        <div className="flex items-center justify-end gap-1">
          <Campanita />
          <button onClick={() => setAbierto(true)} aria-label="Abrir menu" className="w-10 h-10 -mr-2 flex items-center justify-center text-gray-400 hover:text-gray-700">
            <Bars3Icon className="w-6 h-6" />
          </button>
        </div>
      </div>
      {subtitle && <p className="md:hidden text-xs text-gray-500 text-center mt-0.5 line-clamp-2 px-2">{subtitle}</p>}
      {actions && <div className="md:hidden mt-3 flex items-center justify-center gap-2 flex-wrap">{actions}</div>}

      {/* Desktop: sin hamburger, back+titulo a la izquierda, actions a la derecha */}
      <div className="hidden md:flex md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {showBack && (
            <button onClick={volver} aria-label="Volver"
              className="text-gray-400 hover:text-gray-700 transition-colors duration-150 flex-shrink-0">
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-black text-gray-900 truncate">{title}</h1>
            {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap md:flex-nowrap md:flex-shrink-0">
          <button type="button" onClick={() => abrirBuscador()} aria-label="Buscar en MaissyPOS (Ctrl K)"
            className="flex items-center gap-2 min-h-[40px] pl-3 pr-2 rounded-xl text-sm text-gray-500 hover:text-gray-800 lg:w-56" style={{ background: '#EFEDE6' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <span className="flex-1 text-left hidden lg:inline">Buscar…</span>
            <kbd className="hidden lg:inline text-[11px] font-bold rounded-md px-1.5 py-0.5 bg-white text-gray-500">Ctrl K</kbd>
          </button>
          {actions}
          <Campanita />
        </div>
      </div>

      {filters && <div className="mt-4">{filters}</div>}
    </div>
  )
}
