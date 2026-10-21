'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId, setEmpresaId } from '@/lib/empresa'

// Cambia la empresa con la que trabaja el módulo (la misma del menú lateral).
// Cada empresa ve solo sus datos; no se mezclan.
export default function SelectorEmpresa({ usuario }) {
  const [empresas, setEmpresas] = useState([])
  useEffect(() => {
    supabase.from('empresas').select('id, nombre').eq('activo', true).order('nombre').then(({ data }) => {
      setEmpresas((data || []).filter(e => !usuario?.empresas || usuario.empresas.includes(e.id)))
    })
  }, [usuario])
  if (empresas.length < 2) return null
  const actual = getEmpresaId()
  return (
    <div className="flex gap-1 rounded-full p-1 bg-white w-max max-w-full flex-wrap" role="group" aria-label="Empresa">
      {empresas.map(e => (
        <button key={e.id} type="button" aria-pressed={e.id === actual}
          onClick={() => { if (e.id !== actual) { setEmpresaId(e.id); window.location.reload() } }}
          className="rounded-full min-h-[36px] px-3.5 text-[13.5px] font-bold"
          style={e.id === actual ? { background: '#fff', color: '#1C1B19', boxShadow: 'inset 0 0 0 2px #1C1B19' } : { color: '#5A5750' }}>
          {e.nombre}
        </button>
      ))}
    </div>
  )
}
