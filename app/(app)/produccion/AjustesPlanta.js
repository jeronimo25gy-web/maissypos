'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { C, titulo } from './Paneles'

// Cómo trabaja la planta: en Simple solo se registran los pasos que mueven costos
// e inventario; en Completo, todas las mediciones. Se aplica en las tablets al
// sincronizar. El puesto Completo siempre ve todos los pasos.
const MODOS = [[false, 'Completo', 'Todas las mediciones'], [true, 'Simple', 'Montar, sacar, referencia y empaque']]

export default function AjustesPlanta() {
  const router = useRouter()
  const [simple, setSimple] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('empresas').select('planta_simple').eq('id', getEmpresaId()).maybeSingle()
      .then(({ data, error: err }) => { if (err) setError(err.message); else setSimple(!!data?.planta_simple) })
  }, [])

  const cambiar = async (valor) => {
    if (valor === simple) return
    setGuardando(true); setError('')
    const { data, error: err } = await supabase.from('empresas').update({ planta_simple: valor }).eq('id', getEmpresaId()).select('planta_simple')
    setGuardando(false)
    if (err || !data?.length) { setError('No se pudo guardar: ' + (err?.message || 'sin permiso')); return }
    setSimple(valor)
  }

  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <section className="bg-white rounded-[18px] p-4 flex flex-col gap-3" aria-label="Modo de la planta">
        <h2 className="text-[21px] font-extrabold m-0" style={titulo}>Modo de la planta</h2>
        {error && <b className="text-sm" style={{ color: C.rojo }}>{error}</b>}
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }} role="radiogroup" aria-label="Modo de la planta">
          {MODOS.map(([valor, nombre, detalle]) => {
            const si = simple === valor
            return (
              <button key={nombre} type="button" role="radio" aria-checked={si} disabled={simple === null || guardando} onClick={() => cambiar(valor)} className="rounded-2xl min-h-[84px] px-4 py-3 text-left disabled:opacity-60"
                style={si ? { background: C.tinta, color: '#fff' } : { background: C.suave, color: C.tinta }}>
                <b className="block text-[20px] leading-tight" style={titulo}>{nombre}</b>
                <span className="text-[14px]" style={si ? { color: '#D9D5CC' } : { color: C.gris }}>{detalle}</span>
              </button>
            )
          })}
        </div>
      </section>
      <section className="bg-white rounded-[18px] p-4 flex items-center justify-between gap-3 flex-wrap" aria-label="Hoja por puesto">
        <h2 className="text-[21px] font-extrabold m-0" style={titulo}>Hoja por puesto</h2>
        <button type="button" onClick={() => router.push('/planta/hoja')} className="rounded-xl min-h-[44px] px-4 font-bold text-white" style={{ background: C.tinta }}>Ver hoja para imprimir</button>
      </section>
    </div>
  )
}
