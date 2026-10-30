'use client'
import { useEmpresas, cambiarEmpresa } from '@/lib/empresas-ui'

// Cambia la empresa con la que trabaja el módulo (la misma del menú lateral):
// cambiar aquí cambia toda la sesión. Cada empresa ve solo sus datos.
export default function SelectorEmpresa({ usuario }) {
  const { empresas, actual } = useEmpresas(usuario)
  if (empresas.length < 2) return null
  return (
    <div className="flex gap-1 rounded-full p-1 bg-white w-max max-w-full flex-wrap" role="group" aria-label="Empresa">
      {empresas.map(e => (
        <button key={e.id} type="button" aria-pressed={e.id === actual?.id} onClick={() => cambiarEmpresa(e)}
          className="rounded-full min-h-[40px] pl-1.5 pr-3.5 text-[13.5px] font-bold inline-flex items-center gap-2"
          style={e.id === actual?.id ? { background: '#F3F1EA', color: '#1C1B19', boxShadow: 'inset 0 0 0 2px #1C1B19' } : { color: '#5A5750' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {e.logo ? <img src={e.logo} alt="" className="h-[26px] w-auto max-w-[52px]" /> : null}
          {e.nombre}
        </button>
      ))}
    </div>
  )
}
