'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import MiDia from '@/app/mi-ruta/MiDia'

// Rutas > Recaudos: lo mismo que el vendedor ve en "Recaudos del día" de Mi
// ruta (transferencias, créditos, abonos, gastos y efectivo esperado), en solo
// lectura, para seguir la ruta desde la oficina. Toma el despacho de hoy de la
// ruta; si hay varios (dos vendedores o dos cargues), se escoge cuál ver.
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: 'var(--hoja)' }
const ESTADO = { despachado: 'En ruta', por_aprobar: 'Cierre enviado', liquidado: 'Liquidado' }

export default function RecaudosRuta({ rutaId }) {
  const [despachos, setDespachos] = useState(null)
  const [sel, setSel] = useState(null)

  useEffect(() => {
    setDespachos(null); setSel(null)
    supabase.from('despachos_encab').select('id, estado, hora_cargue, created_at, vendedores(nombre)')
      .eq('ruta_id', rutaId).eq('fecha', obtenerFechaActual()).eq('empresa_id', getEmpresaId()).order('created_at')
      .then(({ data }) => { setDespachos(data || []); setSel((data || [])[0]?.id || null) })
  }, [rutaId])

  if (!despachos) return <p className="text-sm" style={{ color: C.gris }}>Cargando…</p>
  if (despachos.length === 0) return <p className="text-sm" style={{ color: C.gris }}>Esta ruta no tiene despacho para el día de hoy.</p>

  return (
    <div className="flex flex-col gap-3">
      {despachos.length > 1 && (
        <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Despacho">
          {despachos.map(d => (
            <button key={d.id} type="button" aria-pressed={sel === d.id} onClick={() => setSel(d.id)} className="rounded-full min-h-[38px] px-3.5 text-sm font-bold"
              style={sel === d.id ? { background: C.tinta, color: '#fff' } : { background: C.fondo, color: C.gris }}>
              {d.vendedores?.nombre || 'Sin vendedor'} · {ESTADO[d.estado] || d.estado}
            </button>
          ))}
        </div>
      )}
      <div className="rounded-2xl p-3" style={{ background: C.fondo }}>
        {sel && <MiDia key={sel} despachoId={sel} soloLectura />}
      </div>
    </div>
  )
}
