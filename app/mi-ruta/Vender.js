'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { grupoDespacho } from '@/lib/orden-productos'
import { imagenTicket } from '@/lib/ticket-imagen'
import { ubicacionActual } from '@/lib/ubicacion'
import { armarLineas } from '@/lib/promociones'
import { crearAlertaAdmin } from '@/lib/alertas-admin'
import { pasoDe, leerCantidad, sumarPaso, textoCantidad } from '@/lib/cantidades'
import InputDinero from '@/components/InputDinero'
import { lineasCartera } from '@/lib/cartera-ticket'
import CampoFecha from '@/components/CampoFecha'

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
const fechaCorta = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })

export const textoTicket = (t) => [
  `*${t.empresa.nombre}*`,
  t.empresa.nit ? `NIT ${t.empresa.nit}` : null,
  t.empresa.telefono ? `WhatsApp ${t.empresa.telefono}` : null,
  '',
  `Ticket #${String(t.numero).padStart(6, '0')} · ${new Date(t.created_at).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
  `Cliente: ${t.cliente}`,
  t.direccion ? t.direccion : null,
  `Vendedor: ${t.vendedor}`,
  t.telefono ? `Tel. cliente: ${t.telefono}` : null,
  t.observaciones ? `Entrega: ${t.observaciones}` : null,
  '------------------------------',
  ...t.lineas.map(l => `${l.paquetes || textoCantidad(l.cantidad)} x ${l.nombre}  ${fmt(l.subtotal)}`),
  t.valor_domicilio > 0 ? `Domicilio  ${fmt(t.valor_domicilio)}` : null,
  '------------------------------',
  `*TOTAL: ${fmt(t.total)}*`,
  `Pagó en: ${nombrePago(t.forma_pago)}${t.forma_pago === 'transferencia' ? ' (por verificar)' : ''}`,
  t.forma_pago === 'credito' && t.fecha_pago ? `Paga el: ${new Date(t.fecha_pago + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })}` : null,
  ...(lineasCartera(t).length ? ['------------------------------', ...lineasCartera(t).map(([a, b, fuerte]) => fuerte ? `*${a}: ${b}*` : `${a}: ${b}`)] : []),
  '',
  'Gracias por preferir Maissy',
  '_Documento de control, no es factura electrónica_',
].filter(l => l !== null).join('\n')

export function Vender({ cliente, carro: carroBase, vendedor, usuario, debe = 0, creditos = [], onCobrarCartera, precios, inicial, pagoInicial, valorDomicilio = 0, onVolver, onVendido }) {
  // Cliente con descuento habilitado por el admin: su precio pactado reemplaza
  // el normal (y la promo) en esos productos. Nadie mas tiene descuento.
  const carro = precios ? { ...carroBase, productos: carroBase.productos.map(p => precios[p.sku] ? { ...p, precio: precios[p.sku], promo: null, pactado: true } : p) } : carroBase
  // Domicilio: llega con lo que pidio el cliente (solo lo que hay en el carro).
  const [cant, setCant] = useState(() => inicial ? Object.fromEntries(Object.entries(inicial).filter(([sku]) => carroBase.productos.some(p => p.sku === sku)).map(([k, v]) => [k, Number(v)])) : {})
  const faltan = inicial ? Object.keys(inicial).filter(sku => !carroBase.productos.some(p => p.sku === sku)) : []
  const [grupo, setGrupo] = useState('Todo')
  const [pago, setPago] = useState(pagoInicial || 'efectivo')
  const [fechaPago, setFechaPago] = useState(sumarDias(obtenerFechaActual(), cliente.frecuencia_dias || 7))
  const [guardando, setGuardando] = useState(false)
  // Cartera: se puede cobrar (todo o un abono) en esta misma factura.
  const [cobrar, setCobrar] = useState(false)
  const [valorCobro, setValorCobro] = useState(debe > 0 ? String(debe) : '')
  const hoyFecha = obtenerFechaActual()
  const vencida = creditos.filter(f => (f.saldo || 0) > 0 && f.fecha_pago && f.fecha_pago < hoyFecha).map(f => f.fecha_pago).sort()[0]
  const proxima = creditos.filter(f => (f.saldo || 0) > 0 && f.fecha_pago && f.fecha_pago >= hoyFecha).map(f => f.fecha_pago).sort()[0]
  // Venta en la calle (sin cliente del rutero): el nombre es opcional.
  const [nombreCalle, setNombreCalle] = useState('')
  // La ubicacion se pide al abrir para no hacer esperar al guardar.
  const [geo, setGeo] = useState({})
  useEffect(() => { ubicacionActual().then(setGeo) }, [])

  const grupos = ['Todo', ...new Set(carro.productos.map(p => grupoDespacho(p)))]
  const visibles = grupo === 'Todo' ? carro.productos : carro.productos.filter(p => grupoDespacho(p) === grupo)
  // Las promos se arman solas: 8 telas = 1 promo x6 + 2 sueltas. El vendedor no escoge.
  const lineas = carro.productos.flatMap(p => armarLineas(p, cant[p.sku] || 0, p.promo))
  const totalProductos = lineas.reduce((s, l) => s + l.subtotal, 0)
  // El domicilio lo pone quien tomo el pedido; el vendedor no lo cambia.
  const total = totalProductos + (lineas.length ? valorDomicilio : 0)
  const cobro = cobrar && pago !== 'credito' && debe > 0 ? Math.min(debe, Math.max(0, parseFloat(valorCobro) || 0)) : 0
  const unidades = lineas.reduce((s, l) => s + l.cantidad, 0)
  const sumar = (sku, n) => setCant(c => ({ ...c, [sku]: Math.max(0, (c[sku] || 0) + n) }))
  // − y + van de a un paso: media canasta en los huevos, una unidad en lo demás.
  const paso = (sku, signo) => setCant(c => ({ ...c, [sku]: sumarPaso(c[sku], sku, signo) }))

  const registrar = async () => {
    if (lineas.length === 0) return
    setGuardando(true)
    const empresaId = getEmpresaId()
    const hoy = obtenerFechaActual()
    const { data: v, error } = await supabase.from('ventas_ruta').insert({
      empresa_id: empresaId, despacho_id: carro.despachoId, vendedor_id: vendedor.id, ruta_id: vendedor.ruta_id,
      cliente_id: cliente.id || null, nombre_cliente: cliente.id ? cliente.nombre : (nombreCalle.trim() || 'Venta en la calle'), fecha: hoy, total, valor_domicilio: valorDomicilio, forma_pago: pago,
      fecha_pago: pago === 'credito' ? fechaPago || null : null, registrado_por: usuario.nombre, ...geo,
    }).select('id, numero, created_at').single()
    if (error) { setGuardando(false); alert('No se pudo registrar la venta: ' + error.message); return }
    const { error: e2 } = await supabase.from('ventas_ruta_detalle').insert(lineas.map(l => ({ ...l, venta_id: v.id, empresa_id: empresaId })))
    if (e2) alert('La venta quedó sin el detalle de productos: ' + e2.message + '. Avísale al admin.')
    if (cliente.id) await supabase.from('visitas_ruta').upsert({
      empresa_id: empresaId, fecha: hoy, cliente_id: cliente.id, ruta_id: vendedor.ruta_id, vendedor_id: vendedor.id, resultado: 'compro', venta_id: v.id, ...geo,
    }, { onConflict: 'cliente_id,fecha' })
    let cobrado = 0
    if (cobro > 0 && onCobrarCartera) {
      const err = await onCobrarCartera(cobro, pago, v.id)
      if (err) alert('La venta quedó registrada, pero el abono a cartera no: ' + err + '. Regístrelo desde «Registrar abono».')
      else cobrado = cobro
    }
    setGuardando(false)
    onVendido({ ...v, lineas, total, valor_domicilio: valorDomicilio, forma_pago: pago, fecha_pago: pago === 'credito' ? fechaPago : null,
      saldoAnterior: debe, cobroCartera: cobrado, saldoPendiente: debe - cobrado + (pago === 'credito' ? total : 0),
      cliente: cliente.id ? cliente.nombre : (nombreCalle.trim() || 'Venta en la calle') })
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

      {cliente.id && debe > 0 && (
        <section className="mx-4 mt-3 rounded-2xl p-3.5 flex flex-col gap-2.5" style={{ background: '#FBE9E9' }} aria-label="Cartera pendiente">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-extrabold text-[15px]" style={{ color: '#8E1117' }}>Cartera pendiente</span>
            <b className="tabular-nums text-[18px]" style={{ ...titulo, color: '#8E1117' }}>{fmt(debe)}</b>
          </div>
          <span className="text-[13px] -mt-1.5" style={{ color: '#8E1117' }}>
            {vencida ? `Vencida desde el ${fechaCorta(vencida)}` : proxima ? `Vence el ${fechaCorta(proxima)}` : 'Sin fecha de vencimiento'}
          </span>
          {pago === 'credito' ? (
            <span className="text-[13px]" style={{ color: TINTA }}>Con pago a crédito no se cobra cartera; la factura mostrará el saldo total pendiente.</span>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Cobro de cartera">
                <button type="button" role="radio" aria-checked={!cobrar} onClick={() => setCobrar(false)} className="min-h-[44px] rounded-xl font-bold text-sm"
                  style={!cobrar ? { background: '#fff', color: TINTA, boxShadow: `inset 0 0 0 2px ${TINTA}` } : { background: 'rgba(255,255,255,.55)', color: TINTA }}>No cobrar</button>
                <button type="button" role="radio" aria-checked={cobrar} onClick={() => setCobrar(true)} className="min-h-[44px] rounded-xl font-bold text-sm"
                  style={cobrar ? { background: TINTA, color: '#fff' } : { background: 'rgba(255,255,255,.55)', color: TINTA }}>Cobrar en esta factura</button>
              </div>
              {cobrar && (
                <div className="flex gap-2 items-center">
                  <InputDinero value={valorCobro} onChange={e => setValorCobro(e.target.value)} placeholder="Valor del abono" aria-label="Valor a cobrar de la cartera"
                    className="flex-1 min-w-0 rounded-xl px-3 min-h-[46px] text-[16px] font-bold bg-white border outline-none" style={{ borderColor: LINEA }} />
                  <button type="button" onClick={() => setValorCobro(String(debe))} className="px-3 min-h-[46px] rounded-xl font-bold text-sm bg-white">Saldo total</button>
                </div>
              )}
              {cobrar && (parseFloat(valorCobro) || 0) > debe && <span className="text-[13px] font-bold" style={{ color: '#8E1117' }}>El abono no puede superar el saldo pendiente; se cobrará {fmt(debe)}.</span>}
            </>
          )}
        </section>
      )}
      {inicial && (
        <div className="mx-4 mt-3 rounded-xl px-3 py-2 text-sm" style={{ background: '#FFF4CC' }}>
          <b>Domicilio:</b> ya viene con lo que pidió. Si cambia algo en la puerta, ajústalo antes del ticket.
          {valorDomicilio > 0 && <span className="block">Se le cobra el domicilio: <b>{fmt(valorDomicilio)}</b> (ya va sumado al total).</span>}
          {faltan.length > 0 && <span className="block font-bold" style={{ color: '#8E1117' }}>No llevas en el carro: {faltan.join(', ')}</span>}
        </div>
      )}
      {!cliente.id && (
        <div className="px-4 pt-3">
          <input value={nombreCalle} onChange={e => setNombreCalle(e.target.value)} placeholder="Nombre del cliente (opcional)" aria-label="Nombre del cliente"
            className="w-full border-2 rounded-xl px-3 min-h-[48px] text-base bg-white focus:outline-none" style={{ borderColor: LINEA }} />
        </div>
      )}
      {carro.productos.length === 0 ? (
        <p className="text-center px-6 py-12" style={{ color: GRIS }}>No tienes un despacho abierto hoy, así que no hay productos para vender. Cuando te despachen, aquí aparece lo que llevas.</p>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto px-4 pt-3">
            {grupos.map(g => (
              <button key={g} onClick={() => setGrupo(g)} className="shrink-0 px-3 min-h-[38px] rounded-full text-[13px] font-bold"
                style={g === grupo ? { background: '#fff', color: TINTA, boxShadow: `inset 0 0 0 2px ${TINTA}` } : { background: '#fff', color: GRIS }}>{g === 'Todo' ? 'Lo que llevo' : g}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2.5 p-4 pb-64">
            {visibles.map(p => {
              const n = cant[p.sku] || 0
              const quedan = p.quedan - n
              return (
                <div key={p.sku} className="bg-white rounded-2xl p-3 flex flex-col gap-1 border-2" style={{ borderColor: n > 0 ? '#C41230' : 'transparent' }}>
                  <span className="text-xs tabular-nums" style={{ color: quedan < 0 ? '#C41230' : GRIS }}>Quedan {textoCantidad(quedan)}</span>
                  <span className="font-bold text-[15px] leading-snug">{p.nombre}</span>
                  <span className="font-extrabold text-xl text-brand tabular-nums" style={titulo}>{fmt(p.precio)}</span>
                  {p.pactado && <span className="text-xs font-bold" style={{ color: '#8A5A00' }}>Precio pactado del cliente</span>}
                  {p.promo && <span className="text-xs font-bold" style={{ color: VERDE }}>{p.promo.nombre}: {p.promo.cantidad} por {fmt(p.promo.precio)}</span>}
                  {p.promo && n > 0 && (() => {
                    const paq = Math.floor(n / p.promo.cantidad), sue = n % p.promo.cantidad
                    return <span className="text-xs" style={{ color: GRIS }}>{[paq ? `${paq} promo${paq > 1 ? 's' : ''}` : null, sue ? `${sue} suelta${sue > 1 ? 's' : ''}` : null].filter(Boolean).join(' + ')} · {fmt(armarLineas(p, n, p.promo).reduce((s, l) => s + l.subtotal, 0))}</span>
                  })()}
                  <div className="flex-1" />
                  {p.promo && (
                    <div className="mt-1.5 flex gap-1.5">
                      {n >= p.promo.cantidad && <button onClick={() => sumar(p.sku, -p.promo.cantidad)} aria-label={`Quitar una ${p.promo.nombre}`} className="min-h-[40px] px-3 rounded-xl font-bold text-sm" style={{ background: FONDO, color: TINTA }}>− promo</button>}
                      <button onClick={() => sumar(p.sku, p.promo.cantidad)} className="flex-1 min-h-[40px] rounded-xl font-bold text-sm" style={{ background: '#E6F0E8', color: VERDE }}>+ {p.promo.nombre}</button>
                    </div>
                  )}
                  {n === 0 ? (
                    <button onClick={() => sumar(p.sku, 1)} className="mt-1.5 min-h-[44px] rounded-xl font-bold" style={{ background: FONDO, color: TINTA }}>Agregar</button>
                  ) : (
                    <div className="mt-1.5 flex items-center justify-between rounded-xl" style={{ background: FONDO }}>
                      <button onClick={() => paso(p.sku, -1)} aria-label={pasoDe(p.sku) < 1 ? `Quitar media de ${p.nombre}` : `Quitar un ${p.nombre}`} className="w-11 h-11 text-2xl font-bold">−</button>
                      <input type="text" inputMode={pasoDe(p.sku) < 1 ? 'decimal' : 'numeric'} value={textoCantidad(n)} aria-label={`Cantidad de ${p.nombre}`} onFocus={e => e.target.select()}
                        onChange={e => setCant(c => ({ ...c, [p.sku]: leerCantidad(e.target.value, p.sku) }))}
                        className="w-12 text-center font-extrabold text-lg bg-transparent tabular-nums" />
                      <button onClick={() => paso(p.sku, 1)} aria-label={pasoDe(p.sku) < 1 ? `Agregar media de ${p.nombre}` : `Agregar un ${p.nombre}`} className="w-11 h-11 text-2xl font-bold">+</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="fixed bottom-0 inset-x-0 bg-white border-t z-20" style={{ borderColor: LINEA, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <div className="max-w-md mx-auto px-4 pt-3 pb-4 flex flex-col gap-2.5">
              <fieldset className={`grid gap-1.5 ${cliente.id ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <legend className="text-[13px] font-bold mb-1.5" style={{ color: GRIS }}>¿Cómo paga?</legend>
                {PAGOS.filter(([id]) => cliente.id || id !== 'credito').map(([id, t]) => (
                  <button key={id} type="button" onClick={() => setPago(id)} aria-pressed={pago === id} className="min-h-[44px] rounded-xl font-bold text-sm"
                    style={pago === id ? { background: '#fff', color: TINTA, boxShadow: `inset 0 0 0 2px ${TINTA}` } : { background: FONDO }}>{t}</button>
                ))}
              </fieldset>
              {pago === 'credito' && (
                <label className="flex items-center justify-between gap-2 text-sm font-bold" style={{ color: GRIS }}>¿Cuándo paga?
                  <CampoFecha value={fechaPago} onChange={e => setFechaPago(e.target.value)} className="border-2 rounded-xl px-2 min-h-[44px]" style={{ borderColor: LINEA, color: TINTA }} />
                </label>
              )}
              <button onClick={registrar} disabled={guardando || lineas.length === 0}
                className="min-h-[56px] rounded-2xl px-4 flex items-center justify-between text-white font-bold text-[17px] disabled:opacity-40" style={{ background: VERDE }}>
                <span className="tabular-nums text-left leading-tight">{textoCantidad(unidades)} {unidades === 1 ? 'producto' : 'productos'} · {fmt(total + cobro)}{cobro > 0 && <span className="block text-[12px] font-semibold opacity-85">Incluye abono a cartera de {fmt(cobro)}</span>}</span>
                <span>{guardando ? 'Guardando...' : 'Generar ticket'}</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export function Ticket({ ticket, cliente, onSiguiente, onAnular, reabierta }) {
  const [anulando, setAnulando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const texto = textoTicket(ticket)
  const tel = soloDigitos(cliente.telefono).slice(-10)
  const wa = (tel.length === 10 ? `https://wa.me/57${tel}` : 'https://wa.me/') + '?text=' + encodeURIComponent(texto)
  // La imagen del ticket se prepara apenas abre la pantalla: el celular solo
  // deja compartir si se hace en el mismo toque, sin esperas de por medio.
  const [archivo, setArchivo] = useState(null)
  const [aviso, setAviso] = useState('')
  useEffect(() => {
    let vivo = true
    imagenTicket(ticket).then(f => { if (vivo) setArchivo(f) }).catch(() => {})
    return () => { vivo = false }
  }, [ticket])
  const puedeCompartirFoto = archivo && typeof navigator !== 'undefined' && navigator.canShare?.({ files: [archivo] })

  // Manda la foto del ticket: se abre el menu de compartir, se escoge WhatsApp
  // y el chat del cliente. Donde no se puede compartir foto, se descarga y se
  // abre el chat con el texto.
  const enviarFoto = async () => {
    setAviso('')
    if (puedeCompartirFoto) {
      try {
        await navigator.share({ files: [archivo], title: `Ticket #${String(ticket.numero).padStart(6, '0')}` })
      } catch (e) {
        if (e?.name !== 'AbortError') setAviso('No se pudo compartir la foto. Usa "Enviar como texto".')
      }
      return
    }
    if (archivo) {
      const url = URL.createObjectURL(archivo)
      const a = document.createElement('a')
      a.href = url; a.download = archivo.name; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      setAviso('Este celular no deja compartir la foto directo: quedó descargada. Adjúntala en el chat del cliente.')
    }
  }

  const anular = async () => {
    setAnulando(true)
    const { error } = await supabase.from('ventas_ruta').update({ estado: 'anulada' }).eq('id', ticket.id).eq('empresa_id', getEmpresaId())
    if (!error) await supabase.from('visitas_ruta').delete().eq('venta_id', ticket.id).eq('empresa_id', getEmpresaId())
    // La oficina se entera de cada ticket anulado (campanita e Inicio).
    if (!error) await crearAlertaAdmin({ empresaId: getEmpresaId(), tipo: 'venta_anulada', referenciaTipo: 'venta_ruta', referenciaId: ticket.id,
      mensaje: `${ticket.vendedor || 'El vendedor'} anuló el ticket #${String(ticket.numero).padStart(6, '0')} de ${ticket.cliente || 'un cliente'} por ${fmt(ticket.total)} (${new Date(ticket.created_at).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}).` })
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
          <span className="font-extrabold text-xl" style={titulo}>{reabierta ? 'Factura' : 'Venta registrada'}</span>
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
            {ticket.lineas.map((l, i) => (
              <div key={i} className="flex justify-between gap-3"><span>{l.paquetes || textoCantidad(l.cantidad)} {l.nombre}</span><span className="tabular-nums">{Math.round(l.subtotal).toLocaleString('es-CO')}</span></div>
            ))}
          </div>
          <div className="border-t border-dashed" style={{ borderColor: TINTA }} />
          {ticket.valor_domicilio > 0 && <div className="flex justify-between"><span>Domicilio</span><span className="tabular-nums">{Math.round(ticket.valor_domicilio).toLocaleString('es-CO')}</span></div>}
          <div className="flex justify-between font-bold text-base"><span>TOTAL</span><span className="tabular-nums">{fmt(ticket.total)}</span></div>
          <div className="flex justify-between"><span>Pagó en</span><span>{nombrePago(ticket.forma_pago)}</span></div>
          {ticket.forma_pago === 'credito' && ticket.fecha_pago && <div className="flex justify-between"><span>Paga el</span><span>{new Date(ticket.fecha_pago + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}</span></div>}
          {lineasCartera(ticket).length > 0 && <div className="border-t border-dashed" style={{ borderColor: TINTA }} />}
          {lineasCartera(ticket).map(([a, b, fuerte]) => <div key={a} className={`flex justify-between ${fuerte ? 'font-bold text-base' : ''}`}><span>{a}</span><span className="tabular-nums">{b}</span></div>)}
          <div className="border-t border-dashed" style={{ borderColor: TINTA }} />
          <span className="text-center">Gracias por preferir Maissy</span>
          <span className="text-center text-[11px]">Documento de control, no es factura electrónica</span>
        </div>

        <button onClick={enviarFoto} disabled={!archivo} className="min-h-[56px] rounded-2xl flex items-center justify-center gap-2.5 font-bold text-[17px] disabled:opacity-60" style={{ background: '#25D366', color: '#0B2E17' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.9A8 8 0 1 1 21 12z" /></svg>
          {archivo ? 'Enviar ticket por WhatsApp' : 'Preparando el ticket...'}
        </button>
        {aviso && <p className="text-sm text-center" style={{ color: '#F2B21B' }}>{aviso}</p>}
        <a href={wa} target="_blank" rel="noreferrer" className="text-sm font-bold underline self-center py-1" style={{ color: '#B9B5AA' }}>
          Enviar como texto{tel.length === 10 ? ' al chat del cliente' : ''}
        </a>
        <div className="grid grid-cols-2 gap-2.5">
          <span className="min-h-[48px] rounded-2xl flex items-center justify-center font-bold text-sm" style={{ background: '#34322E', color: '#B9B5AA' }}>Imprimir · pronto</span>
          <button onClick={onSiguiente} className="min-h-[48px] rounded-2xl bg-white font-bold text-sm">{reabierta ? 'Volver al rutero' : 'Siguiente cliente'}</button>
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
