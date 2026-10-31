'use client'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { volverAtras } from '@/lib/navegacion'
import { useEmpresas } from '@/lib/empresas-ui'
import SelectorEmpresa from '@/components/SelectorEmpresa'
import BuscadorModulo from '@/components/BuscadorModulo'

// Encabezado de cada modulo: el nombre sube a la barra superior del marco (la
// pinta BarraSuperior) y aqui queda la primera fila de la hoja, con el selector
// de empresa y las acciones del modulo.
export default function PageHeader({ title, subtitle, actions, filters, backHref, onBack, showBack = true, buscar, sinEmpresa }) {
  const router = useRouter()
  const volver = onBack || (() => backHref ? router.push(backHref) : volverAtras(router))
  const { empresas, actual } = useEmpresas()
  const [ranura, setRanura] = useState(null)
  useEffect(() => { setRanura(document.getElementById('ranura-titulo')) }, [])

  // El nombre de la empresa ya se ve en el selector: no se repite.
  const contexto = actual?.nombre ? String(subtitle || '').replace(actual.nombre, '').replace(/^\s*·\s*|\s*·\s*$/g, '') : subtitle
  const verEmpresa = empresas.length > 1 && !sinEmpresa

  return (
    <>
      {ranura && createPortal(
        <div className="flex items-center gap-2 min-w-0">
          {showBack && (
            <button onClick={volver} aria-label="Volver" className="hidden md:flex w-9 h-9 -ml-1 rounded-full items-center justify-center shrink-0 transition-colors hover:bg-[var(--marco-2)]" style={{ color: 'var(--sobre-marco)' }}>
              <ArrowLeftIcon className="w-5 h-5" strokeWidth={2} />
            </button>
          )}
          <h1 className="titulo-modulo min-w-0 truncate">{title}</h1>
        </div>, ranura)}
      {(verEmpresa || actions || filters || contexto || buscar) && (
        <div className="px-4 md:px-6 pt-4 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 min-w-0">
              {verEmpresa && <SelectorEmpresa />}
              {contexto && <span className="text-[13.5px] font-medium" style={{ color: '#5A5750' }}>{contexto}</span>}
            </div>
            {(actions || buscar) && (
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                {buscar && <BuscadorModulo nombre={buscar} />}
                {actions}
              </div>
            )}
          </div>
          {filters && <div className="mt-3">{filters}</div>}
        </div>
      )}
    </>
  )
}
