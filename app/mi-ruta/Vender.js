'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { grupoDespacho } from '@/lib/orden-productos'

// Venta en ruta a un cliente: escoge de lo que lleva en el carro, como paga, y
// sale el ticket para mandarlo por WhatsApp. No mueve caja ni cartera: eso se
// cuadra en la liquidacion, que el admin aprueba (de aqui salen precargados
// los creditos y las transferencias de ese dia).
const TINTA = '#1C1B19', GRIS = '#5A5750', FONDO = '#F3F1EA', LINEA = '#E3E1D8', VERDE = '#2E5E3A'
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const fmt = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO')
const PAGOS = [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['credito', 'Crédito']]
const nombrePago = (f) => PAGOS.find(p => p[0] === f)?.[1] || f
const sumarDias = (fecha, dias) => { const d = new Date(fecha + 'T12:00:00'); d.setDate(d.getDate() + dias); return d.toLocaleDateString('en-CA') }
const soloDigitos = (t) => (t || '').replace(/\D/g, '')

export const textoTicket = (t) => [
  `*${t.empresa.nombre}*`,
  t.empresa.nit ? `NIT ${t.empresa.nit}` : null,
  t.empresa.telefono ? `WhatsApp ${t.empresa.telefono}` : null,
  '',
  `Ticket #${String(t.numero).padStart(6, '0')} · ${new Date(t.created_at).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
  `Cliente: ${t.cliente}`,
  t.direccion ? t.direccion : null,
  `Vendedor: ${t.vendedor}`,
  '------------------------------',
  ...t.lineas.map(l => `${l.cantidad} x ${l.nombre}  ${fmt(l.subtotal)}`),
  '------------------------------',
  `*TOTAL: ${fmt(t.total)}*`,
  `Pagó en: ${nombrePago(t.forma_pago)}${t.forma_pago === 'transferencia' ? ' (por verificar)' : ''}`,
  t.forma_pago === 'credito' && t.fecha_pago ? `Paga el: ${new Date(t.fecha_pago + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })}` : null,
  t.saldoAnterior > 0 ? `Saldo anterior: ${fmt(t.saldoAnterior)}` : null,
  '',
  'Gracias por preferir Maissy',
  '_Documento de control, no es factura electrónica_',
].filter(l => l !== null).join('\n')

export function Vender({ cliente, carro, vendedor, usuario, debe, onVolver, onVendido }) {
  const [cant, setCant] = useState({})
  const [grupo, setGrupo] = useState('Todo')
  const [pago, setPago] = useState('efectivo')
  const [fechaPago, setFechaPago] = useState(sumarDias(obtenerFechaActual(), cliente.frecuencia_dias || 7))
  const [guardando, setGuardando] = useState(false)

  const grupos = ['Todo', ...new Set(carro.productos.map(p => grupoDespacho(p)))]
  const visibles = grupo === 'Todo' ? carro.productos : carro.productos.filter(p => grupoDespacho(p) === grupo)
  const lineas = carro.productos.filter(p => (cant[p.sku] || 0) > 0).map(p => ({ sku: p.sku, nombre: p.nombre, cantidad: cant[p.sku], precio: p.precio, subtotal: cant[p.sku] * p.precio }))
  const total = lineas.reduce((s, l) => s + l.subtotal, 0)
  const unidades = lineas.reduce((s, l) => s + l.cantidad, 0)
  const sumar = (sku, n) => setCant(c => ({ ...c, [sku]: Math.max(0, (c[sku] || 0) + n) }))

  const registrar = async () => {
    if (lineas.length === 0) return
    setGuardando(true)
    const empresaId = getEmpresaId()
    const hoy = obtenerFechaActual()
    const { data: v, error } = await supabase.from('ventas_ruta').insert({
      empresa_id: empresaId, despacho_id: carro.despachoId, vendedor_id: vendedor.id, ruta_id: vendedor.ruta_id,
      cliente_id: cliente.id, nombre_cliente: cliente.nombre, fecha: hoy, total, forma_pago: pago,
      fecha_pago: pago === 'credito' ? fechaPago || null : null, registrado_por: usuario.nombre,
    }).select('id, numero, created_at').single()
    if (error) { setGuardando(false); alert('No se pudo registrar la venta: ' + error.message); return }
    const { error: e2 } = await supabase.from('ventas_ruta_detalle').insert(lineas.map(l => ({ ...l, venta_id: v.id, empresa_id: empresaId })))
    if (e2) alert('La venta quedó sin el detalle de productos: ' + e2.message + '. Avísale al admin.')
    await supabase.from('visitas_ruta').upsert({
      empresa_id: empresaId, fecha: hoy, cliente_id: cliente.id, ruta_id: vendedor.ruta_id, vendedor_id: vendedor.id, resultado: 'compro', venta_id: v.id,
    }, { onConflict: 'cliente_id,fecha' })
    setGuardando(false)
    onVendido({ ...v, lineas, total, forma_pago: pago, fecha_pago: pago === 'credito' ? fechaPago : null, saldoAnterior: debe })
  }

  return (
    <div className="max-w-md mx-auto flex flex-col min-h-[calc(100vh-56px)]">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10" style={{ borderColor: LINEA }}>
        <button onClick={onVolver} aria-label="Volver al rutero" className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: FONDO }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <div className="min-w-0">
          <p className="font-extrabold text-xl leading-tight truncate" style={titulo}>{cliente.nombre}</p>
          <p className="text-[13px] truncate" style={{ color: debe > 0 ? '#C41230' : GRIS }}>{[cliente.edificio, cliente.apto, cliente.barrio].filter(Boolean).join(' · ')}{debe > 0 ? ` · debe ${fmt(debe)}` : ''}</p>
        </div>
      </div>

      {carro.productos.length === 0 ? (
        <p className="text-center px-6 py-12" style={{ color: GRIS }}>No tienes un despacho abierto hoy, así que no hay productos para vender. Cuando te despachen, aquí aparece lo que llevas.</p>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto px-4 pt-3">
            {grupos.map(g => (
              <button key={g} onClick={() => setGrupo(g)} className="shrink-0 px-3 min-h-[38px] rounded-full text-[13px] font-bold"
                style={g === grupo ? { background: TINTA, color: '#fff' } : { background: '#fff', color: GRIS }}>{g === 'Todo' ? 'Lo que llevo' : g}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2.5 p-4 pb-64">
            {visibles.map(p => {
              const n = cant[p.sku] || 0
              const quedan = p.quedan - n
              return (
                <div key={p.sku} className="bg-white rounded-2xl p-3 flex flex-col gap-1 border-2" style={{ borderColor: n > 0 ? '#C41230' : 'transparent' }}>
                  <span className="text-xs tabular-nums" style={{ color: quedan < 0 ? '#C41230' : GRIS }}>Quedan {quedan}</span>
                  <span className="font-bold text-[15px] leading-snug">{p.nombre}</span>
                  <span className="font-extrabold text-xl text-brand tabular-nums" style={titulo}>{fmt(p.precio)}</span>
                  <div className="flex-1" />
                  {n === 0 ? (
                    <button onClick={() => sumar(p.sku, 1)} className="mt-1.5 min-h-[44px] rounded-xl font-bold text-white" style={{ background: TINTA }}>Agregar</button>
                  ) : (
                    <div className="mt-1.5 flex items-center justify-between rounded-xl" style={{ background: FONDO }}>
                      <button onClick={() => sumar(p.sku, -1)} aria-label={`Quitar un ${p.nombre}`} className="w-11 h-11 text-2xl font-bold">−</button>
                      <input type="number" inputMode="numeric" value={n} aria-label={`Cantidad de ${p.nombre}`} onFocus={e => e.target.select()}
                        onChange={e => setCant(c => ({ ...c, [p.sku]: Math.max(0, Number(e.target.value) || 0) }))}
                        className="w-12 text-center font-extrabold text-lg bg-transparent tabular-nums" />
                      <button onClick={() => sumar(p.sku, 1)} aria-label={`Agregar un ${p.nombre}`} className="w-11 h-11 text-2xl font-bold">+</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="fixed bottom-0 inset-x-0 bg-white border-t z-20" style={{ borderColor: LINEA, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <div className="max-w-md mx-auto px-4 pt-3 pb-4 flex flex-col gap-2.5">
              <fieldset className="grid grid-cols-3 gap-1.5">
                <legend className="text-[13px] font-bold mb-1.5" style={{ color: GRIS }}>¿Cómo paga?</legend>
                {PAGOS.map(([id, t]) => (
                  <button key={id} type="button" onClick={() => setPago(id)} aria-pressed={pago === id} className="min-h-[44px] rounded-xl font-bold text-sm"
                    style={pago === id ? { background: TINTA, color: '#fff' } : { background: FONDO }}>{t}</button>
                ))}
              </fieldset>
              {pago === 'credito' && (
                <label className="flex items-center justify-between gap-2 text-sm font-bold" style={{ color: GRIS }}>¿Cuándo paga?
                  <input type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)} className="border-2 rounded-xl px-2 min-h-[44px]" style={{ borderColor: LINEA, color: TINTA }} />
                </label>
              )}
              <button onClick={registrar} disabled={guardando || lineas.length === 0}
                className="min-h-[56px] rounded-2xl px-4 flex items-center justify-between text-white font-bold text-[17px] disabled:opacity-40" style={{ background: VERDE }}>
                <span className="tabular-nums">{unidades} {unidades === 1 ? 'producto' : 'productos'} · {fmt(total)}</span>
                <span>{guardando ? 'Guardando...' : 'Generar ticket'}</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export function Ticket({ ticket, cliente, onSiguiente, onAnular }) {
  const [anulando, setAnulando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const texto = textoTicket(ticket)
  const tel = soloDigitos(cliente.telefono).slice(-10)
  const wa = (tel.length === 10 ? `https://wa.me/57${tel}` : 'https://wa.me/') + '?text=' + encodeURIComponent(texto)

  const anular = async () => {
    setAnulando(true)
    const { error } = await supabase.from('ventas_ruta').update({ estado: 'anulada' }).eq('id', ticket.id).eq('empresa_id', getEmpresaId())
    if (!error) await supabase.from('visitas_ruta').delete().eq('venta_id', ticket.id).eq('empresa_id', getEmpresaId())
    setAnulando(false)
    if (error) { alert('No se pudo anular: ' + error.message); return }
    onAnular()
  }

  return (
    <div className="min-h-[calc(100vh-56px)] flex flex-col" style={{ background: TINTA }}>
      <div className="max-w-md w-full mx-auto px-4 pt-5 pb-28 flex flex-col gap-4">
        <div className="flex items-center gap-2.5 text-white">
          <span className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: VERDE }} aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
          </span>
          <span className="font-extrabold text-xl" style={titulo}>Venta registrada</span>
        </div>

        <div className="bg-white mx-2 px-5 py-5 rounded flex flex-col gap-2.5 text-[13px] leading-relaxed" style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>
          <div className="text-center flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {ticket.empresa.logo_url && <img src={ticket.empresa.logo_url} alt="" className="h-14 w-auto object-contain mb-1" />}
            <span className="font-bold">{ticket.empresa.nombre}</span>
            {ticket.empresa.nit && <span>NIT {ticket.empresa.nit}</span>}
            {ticket.empresa.telefono && <span>WhatsApp {ticket.empresa.telefono}</span>}
          </div>
          <div className="border-t border-dashed" style={{ borderColor: TINTA }} />
          <div className="flex flex-col">
            <span>Ticket #{String(ticket.numero).padStart(6, '0')}</span>
            <span>{new Date(ticket.created_at).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            <span>Cliente: {ticket.cliente}</span>
            {ticket.direccion && <span>{ticket.direccion}</span>}
            <span>Vendedor: {ticket.vendedor}</span>
          </div>
          <div className="border-t border-dashed" style={{ borderColor: TINTA }} />
          <div className="flex flex-col gap-1">
            {ticket.lineas.map(l => (
              <div key={l.sku} className="flex justify-between gap-3"><span>{l.cantidad} {l.nombre}</span><span className="tabular-nums">{Math.round(l.subtotal).toLocaleString('es-CO')}</span></div>
            ))}
          </div>
          <div className="border-t border-dashed" style={{ borderColor: TINTA }} />
          <div className="flex justify-between font-bold text-base"><span>TOTAL</span><span className="tabular-nums">{fmt(ticket.total)}</span></div>
          <div className="flex justify-between"><span>Pagó en</span><span>{nombrePago(ticket.forma_pago)}</span></div>
          {ticket.forma_pago === 'credito' && ticket.fecha_pago && <div className="flex justify-between"><span>Paga el</span><span>{new Date(ticket.fecha_pago + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}</span></div>}
          {ticket.saldoAnterior > 0 && <div className="flex justify-between"><span>Saldo anterior</span><span className="tabular-nums">{fmt(ticket.saldoAnterior)}</span></div>}
          <div className="border-t border-dashed" style={{ borderColor: TINTA }} />
          <span className="text-center">Gracias por preferir Maissy</span>
          <span className="text-center text-[11px]">Documento de control, no es factura electrónica</span>
        </div>

        <a href={wa} target="_blank" rel="noreferrer" className="min-h-[56px] rounded-2xl flex items-center justify-center gap-2.5 font-bold text-[17px]" style={{ background: '#25D366', color: '#0B2E17' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.9A8 8 0 1 1 21 12z" /></svg>
          {tel.length === 10 ? 'Enviar por WhatsApp' : 'Enviar por WhatsApp (escoges el contacto)'}
        </a>
        <div className="grid grid-cols-2 gap-2.5">
          <span className="min-h-[48px] rounded-2xl flex items-center justify-center font-bold text-sm" style={{ background: '#34322E', color: '#B9B5AA' }}>Imprimir · pronto</span>
          <button onClick={onSiguiente} className="min-h-[48px] rounded-2xl bg-white font-bold text-sm">Siguiente cliente</button>
        </div>
        {!confirmar ? (
          <button onClick={() => setConfirmar(true)} className="text-sm font-bold underline self-center py-2" style={{ color: '#B9B5AA' }}>Me equivoqué: anular esta venta</button>
        ) : (
          <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: '#34322E' }}>
            <p className="text-white text-sm">¿Anular el ticket #{String(ticket.numero).padStart(6, '0')}? El admin lo ve como anulado.</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setConfirmar(false)} className="min-h-[44px] rounded-xl bg-white font-bold text-sm">No</button>
              <button onClick={anular} disabled={anulando} className="min-h-[44px] rounded-xl bg-brand text-white font-bold text-sm disabled:opacity-50">{anulando ? 'Anulando...' : 'Sí, anular'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
