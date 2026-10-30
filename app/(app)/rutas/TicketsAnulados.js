'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { marcarAlertaVista } from '@/lib/pendientes'

// Tickets que los vendedores anularon en Mi ruta y la oficina no ha revisado.
// Son los avisos que suman en el numero de Rutas del menu y en la campanita.
const C = { tinta: '#1C1B19', gris: '#5A5750', linea: '#E3E1D8', suave: '#EFEDE6', rojo: '#C41230', rojoF: '#FBE9E9' }
const fmt = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
const cuando = (iso) => new Date(iso).toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export default function TicketsAnulados({ onCambio }) {
  const [lista, setLista] = useState([])
  const [abierto, setAbierto] = useState(null)

  const cargar = async () => {
    const empresaId = getEmpresaId()
    const { data: alertas } = await supabase.from('alertas_admin').select('id, mensaje, created_at, referencia_id')
      .eq('tipo', 'venta_anulada').eq('leida', false).eq('empresa_id', empresaId).order('created_at', { ascending: false })
    const ids = (alertas || []).map(a => a.referencia_id).filter(Boolean)
    const { data: ventas } = ids.length
      ? await supabase.from('ventas_ruta').select('id, numero, nombre_cliente, total, forma_pago, created_at, rutas(nombre), vendedores(nombre), ventas_ruta_detalle(sku, nombre, cantidad, subtotal)').in('id', ids).eq('empresa_id', empresaId)
      : { data: [] }
    const porId = Object.fromEntries((ventas || []).map(v => [v.id, v]))
    setLista((alertas || []).map(a => ({ ...a, venta: porId[a.referencia_id] || null })))
  }

  useEffect(() => { cargar() }, [])

  const visto = async (ids) => {
    await Promise.all(ids.map(id => marcarAlertaVista(id)))
    setLista(prev => prev.filter(a => !ids.includes(a.id)))
    onCambio?.()
  }

  if (!lista.length) return null
  const total = lista.reduce((s, a) => s + Number(a.venta?.total || 0), 0)

  return (
    <div className="bg-white rounded-[18px] p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <b className="block text-[16px]">{lista.length === 1 ? '1 ticket anulado' : `${lista.length} tickets anulados`} por revisar</b>
          <span className="text-[13px]" style={{ color: C.gris }}>{fmt(total)} en total</span>
        </div>
        <button type="button" onClick={() => visto(lista.map(a => a.id))} className="rounded-xl min-h-[40px] px-3.5 text-[13.5px] font-bold" style={{ background: C.suave }}>Marcar todos como vistos</button>
      </div>
      <div className="flex flex-col">
        {lista.map(a => {
          const v = a.venta
          const sel = abierto === a.id
          return (
            <div key={a.id} className="flex flex-col gap-2 py-2.5" style={{ borderTop: `1px solid ${C.linea}` }}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <button type="button" onClick={() => setAbierto(sel ? null : a.id)} aria-expanded={sel} className="flex-1 min-w-[220px] text-left">
                  {v ? (
                    <>
                      <span className="block font-bold">Ticket #{String(v.numero).padStart(6, '0')} · {v.nombre_cliente || 'Cliente'} · <span className="tabular-nums">{fmt(v.total)}</span></span>
                      <span className="block text-[13px]" style={{ color: C.gris }}>{[v.vendedores?.nombre, v.rutas?.nombre, `vendido ${cuando(v.created_at)}`, `anulado ${cuando(a.created_at)}`].filter(Boolean).join(' · ')}</span>
                    </>
                  ) : <span className="block">{a.mensaje}</span>}
                </button>
                <button type="button" onClick={() => visto([a.id])} className="rounded-xl min-h-[36px] px-3 text-[13px] font-bold" style={{ background: C.suave }}>Visto</button>
              </div>
              {sel && v && (
                <div className="rounded-xl px-3 py-2 text-[13.5px] flex flex-col gap-1" style={{ background: C.suave }}>
                  {(v.ventas_ruta_detalle || []).map((d, k) => (
                    <div key={k} className="flex justify-between gap-3"><span className="min-w-0">{Number(d.cantidad).toLocaleString('es-CO')} {d.nombre || d.sku}</span><span className="tabular-nums whitespace-nowrap">{fmt(d.subtotal)}</span></div>
                  ))}
                  <span style={{ color: C.gris }}>Pago: {v.forma_pago === 'credito' ? 'crédito' : v.forma_pago}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
