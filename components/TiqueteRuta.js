'use client'
// Tiquete de una venta de ruta (Mi ruta) visto desde la oficina: el mismo que
// recibió el cliente por WhatsApp, para revisarlo o reenviárselo.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { textoTicket } from '@/app/mi-ruta/Vender'
import { imagenTicket } from '@/lib/ticket-imagen'
import { conCuenta, cuentaDeRuta } from '@/lib/cuenta-pago'

const TINTA = '#1C1B19', GRIS = '#5A5750', SUAVE = '#EFEDE6'

export default function TiqueteRuta({ ventaId, cliente, onCerrar }) {
  const [ticket, setTicket] = useState(null)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let vivo = true
    const empresaId = getEmpresaId()
    Promise.all([
      supabase.from('ventas_ruta').select('id, numero, created_at, total, forma_pago, estado, nombre_cliente, ruta_id, valor_domicilio, vendedores(nombre), rutas(nombre), ventas_ruta_detalle(sku, nombre, cantidad, subtotal)').eq('id', ventaId).eq('empresa_id', empresaId).maybeSingle(),
      supabase.from('empresas').select('nombre, nit, telefono, logo_url').eq('id', empresaId).maybeSingle(),
    ]).then(async ([{ data: v, error: e }, { data: emp }]) => {
      if (!vivo) return
      if (e || !v) { setError('No se encontró el tiquete.'); return }
      const cuenta = conCuenta(v.forma_pago) ? await cuentaDeRuta(v.ruta_id, empresaId).catch(() => null) : null
      if (!vivo) return
      setTicket({
        id: v.id, numero: v.numero, created_at: v.created_at, estado: v.estado,
        empresa: emp || { nombre: 'Maissy' }, cuenta,
        cliente: v.nombre_cliente || cliente?.nombre || 'Cliente',
        direccion: [cliente?.edificio, cliente?.apto, cliente?.direccion, cliente?.barrio].filter(Boolean).join(' · '),
        vendedor: v.vendedores?.nombre || v.rutas?.nombre || 'Ruta',
        telefono: cliente?.telefono || '',
        lineas: (v.ventas_ruta_detalle || []).map(x => ({ sku: x.sku, nombre: x.nombre || x.sku, cantidad: Number(x.cantidad || 0), subtotal: Number(x.subtotal || 0) })),
        total: Number(v.total || 0), valor_domicilio: Number(v.valor_domicilio || 0), forma_pago: v.forma_pago, saldoAnterior: 0,
      })
    })
    return () => { vivo = false }
  }, [ventaId, cliente])

  const enviar = async () => {
    if (!ticket) return
    setEnviando(true)
    const tel = String(cliente?.telefono || '').replace(/\D/g, '').slice(-10)
    const wa = (tel.length === 10 ? `https://wa.me/57${tel}` : 'https://wa.me/') + '?text=' + encodeURIComponent(textoTicket(ticket))
    try {
      const archivo = await imagenTicket(ticket)
      if (archivo && navigator.canShare?.({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: `Ticket #${String(ticket.numero).padStart(6, '0')}` })
        setEnviando(false)
        return
      }
    } catch (e) {
      if (e?.name === 'AbortError') { setEnviando(false); return }
    }
    window.open(wa, '_blank')
    setEnviando(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3" style={{ background: 'rgba(28,27,25,.55)' }} role="dialog" aria-modal="true" aria-label="Tiquete de la venta" onClick={onCerrar}>
      <div className="bg-white rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-4 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        {error ? <p className="text-[14px]" style={{ color: GRIS }}>{error}</p> : !ticket ? <p className="text-[14px]" style={{ color: GRIS }}>Cargando tiquete…</p> : (
          <>
            {ticket.estado === 'anulada' && <p className="text-[13px] font-bold rounded-xl px-3 py-2" style={{ background: SUAVE, color: TINTA }}>Este tiquete fue anulado.</p>}
            <pre className="text-[12.5px] leading-relaxed whitespace-pre-wrap rounded-xl p-3" style={{ background: SUAVE, color: TINTA, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>
              {textoTicket(ticket).replace(/\*/g, '').replace(/_/g, '')}
            </pre>
          </>
        )}
        <div className="flex gap-2">
          {ticket && <button type="button" onClick={enviar} disabled={enviando} className="flex-1 rounded-xl min-h-[44px] font-bold text-[14px] text-white disabled:opacity-50" style={{ background: 'var(--primario)' }}>{enviando ? 'Preparando…' : 'Enviar por WhatsApp'}</button>}
          <button type="button" onClick={onCerrar} className="flex-1 rounded-xl min-h-[44px] font-bold text-[14px]" style={{ background: SUAVE, color: TINTA }}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
