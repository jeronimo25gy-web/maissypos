'use client'
import { useEmpresas, cambiarEmpresa } from '@/lib/empresas-ui'

// Unico selector de empresa del sistema: va en la primera fila de cada modulo
// (lo pone PageHeader). Cambiar aqui cambia toda la sesion.
export default function SelectorEmpresa({ usuario }) {
  const { empresas, actual } = useEmpresas(usuario)
  if (empresas.length < 2) return null
  return (
    <div className="flex gap-2 max-w-full flex-wrap" role="group" aria-label="Empresa">
      {empresas.map(e => {
        const activa = e.id === actual?.id
        return (
          <button key={e.id} type="button" aria-pressed={activa} onClick={() => cambiarEmpresa(e)}
            className="opcion rounded-full min-h-[44px] pl-1 pr-4 text-[14px] font-bold inline-flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {e.logo ? <img src={e.logo} alt="" className="max-w-[31px] max-h-[31px] w-auto" /> : <b className="text-[12px]" style={{ color: 'var(--rojo)' }}>{e.corto?.slice(0, 2)}</b>}
            </span>
            {e.nombre}
          </button>
        )
      })}
    </div>
  )
}
