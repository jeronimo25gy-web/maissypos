'use client'
import { useRouter } from 'next/navigation'
import { ArrowLeftIcon, Bars3Icon } from '@heroicons/react/24/outline'
import { useSidebar } from '@/contexts/SidebarContext'

export default function PageHeader({ title, subtitle, actions, filters, backHref = '/despacho', onBack, showBack = true }) {
  const router = useRouter()
  const { setAbierto } = useSidebar()
  const volver = onBack || (() => router.push(backHref))

  return (
    <div className="bg-white shadow-sm px-6 py-4 sticky top-0 z-10">
      {/* Movil: back-izquierda / titulo-centro / hamburger-derecha, nunca superpuestos */}
      <div className="flex md:hidden items-center gap-3">
        {showBack ? (
          <button onClick={volver} aria-label="Volver" className="text-gray-400 hover:text-gray-700 transition-colors duration-150 shrink-0">
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
        ) : <span className="w-5 shrink-0" />}
        <h1 className="flex-1 min-w-0 text-lg font-black text-gray-900 truncate text-center">{title}</h1>
        <button onClick={() => setAbierto(true)} aria-label="Abrir menu" className="text-gray-400 hover:text-gray-700 shrink-0">
          <Bars3Icon className="w-6 h-6" />
        </button>
      </div>
      {subtitle && <p className="md:hidden text-xs text-gray-500 truncate text-center mt-1">{subtitle}</p>}
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
        {actions && <div className="flex items-center gap-2 flex-wrap md:flex-nowrap md:flex-shrink-0">{actions}</div>}
      </div>

      {filters && <div className="mt-4">{filters}</div>}
    </div>
  )
}
