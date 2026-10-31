'use client'
import { useRouter } from 'next/navigation'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { volverAtras } from '@/lib/navegacion'
import { useEmpresas } from '@/lib/empresas-ui'
import SelectorEmpresa from '@/components/SelectorEmpresa'
import BuscadorModulo from '@/components/BuscadorModulo'

// Encabezado de cada modulo, dentro de la hoja: el nombre a la izquierda y el
// selector de empresa a la derecha; debajo, el buscador del modulo al centro y
// las acciones. El buscador de todo el sistema esta en la barra superior.
export default function PageHeader({ title, subtitle, actions, filters, backHref, onBack, showBack = true, buscar, alFecha, ayudaBuscar, sinEmpresa, encabezado }) {
  const router = useRouter()
  const volver = onBack || (() => backHref ? router.push(backHref) : volverAtras(router))
  const { empresas, actual } = useEmpresas()

  // El nombre de la empresa ya se ve en el selector: no se repite.
  const contexto = actual?.nombre ? String(subtitle || '').replace(actual.nombre, '').replace(/^\s*·\s*|\s*·\s*$/g, '') : subtitle
  const verEmpresa = empresas.length > 1 && !sinEmpresa

  return (
    <div className="px-4 md:px-6 pt-5 flex flex-col gap-3.5 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {showBack && (
            <button onClick={volver} aria-label="Volver" className="hidden md:flex w-9 h-9 -ml-1 rounded-full items-center justify-center shrink-0 transition-colors hover:bg-black/5" style={{ color: '#1C1B19' }}>
              <ArrowLeftIcon className="w-5 h-5" strokeWidth={2} />
            </button>
          )}
          {encabezado || <h1 className="titulo-modulo min-w-0">{title}</h1>}
        </div>
        {verEmpresa && <SelectorEmpresa />}
      </div>
      {(contexto || buscar || actions) && (
        <div className="fila-busqueda">
          <span className={contexto ? 'text-[13.5px] font-medium min-w-0' : 'hidden md:block'} style={{ color: '#5A5750' }}>{contexto}</span>
          {buscar ? <BuscadorModulo nombre={buscar} alFecha={alFecha} ayuda={ayudaBuscar} /> : <span className="hidden md:block" />}
          {actions && <div className="flex items-center md:justify-end gap-2 flex-wrap min-w-0">{actions}</div>}
        </div>
      )}
      {filters && <div>{filters}</div>}
    </div>
  )
}
