'use client'
// Gerencia: despachos de otro día para corregirlos (ej. faltó anotar un
// producto y se vio al día siguiente). La corrección la hace Corregir.js,
// también si la ruta ya se liquidó.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import CampoFecha from '@/components/CampoFecha'

const C = { tinta: '#1C1B19', gris: '#5A5750', linea: '#E3E1D8', suave: '#EFEDE6' }
const ESTADO = { despachado: 'Sin liquidar', por_aprobar: 'Por aprobar', liquidado: 'Liquidada' }
const ayer = () => { const d = new Date(obtenerFechaActual() + 'T12:00:00'); d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-CA') }

export default function OtroDia({ onCorregir, onCerrar }) {
  const [fecha, setFecha] = useState(ayer)
  const [lista, setLista] = useState(null)
  useEffect(() => {
    let vivo = true
    supabase.from('despachos_encab').select('*, rutas(nombre), vendedores(nombre)').eq('fecha', fecha).in('estado', ['despachado', 'por_aprobar', 'liquidado'])
      .eq('empresa_id', getEmpresaId()).order('created_at')
      .then(({ data }) => { if (vivo) setLista(data || []) })
    return () => { vivo = false }
  }, [fecha])

  return (
    <section className="bg-white rounded-[18px] p-4 flex flex-col gap-3" aria-label="Corregir un despacho de otro día">
      <div className="flex justify-between gap-2 items-center flex-wrap">
        <h2 className="font-extrabold text-[19px] m-0" style={{ fontFamily: 'var(--font-titulo), Georgia, serif' }}>Corregir un despacho de otro día</h2>
        <button type="button" onClick={onCerrar} className="rounded-xl min-h-[40px] px-4 text-sm font-bold" style={{ background: C.suave }}>Cerrar</button>
      </div>
      <label className="flex items-center gap-2 text-[13px] font-bold" style={{ color: C.gris }}>Fecha
        <CampoFecha value={fecha} onChange={e => setFecha(e.target.value)} max={obtenerFechaActual()} className="rounded-xl min-h-[42px] px-3 text-[15px] bg-white border-[1.5px]" style={{ borderColor: C.linea, color: C.tinta }} />
      </label>
      {lista === null ? <p className="text-[13.5px]" style={{ color: C.gris }}>Cargando…</p>
        : !lista.length ? <p className="text-[13.5px]" style={{ color: C.gris }}>No hay despachos ese día.</p>
        : (
          <div className="flex flex-col">
            {lista.map(d => (
              <div key={d.id} className="flex items-center justify-between gap-3 py-2" style={{ borderTop: `1px solid ${C.linea}` }}>
                <span className="min-w-0"><b className="block text-[14.5px]">{d.rutas?.nombre || 'Ruta'}</b>
                  <span className="text-[12.5px]" style={{ color: C.gris }}>{d.vendedores?.nombre || ''} · {ESTADO[d.estado] || d.estado} · {Number(d.total_und || 0).toLocaleString('es-CO')} und</span></span>
                <button type="button" onClick={() => onCorregir(d)} className="shrink-0 rounded-xl min-h-[40px] px-4 text-[13.5px] font-bold" style={{ background: C.suave, color: C.tinta }}>Corregir</button>
              </div>
            ))}
          </div>
        )}
    </section>
  )
}
