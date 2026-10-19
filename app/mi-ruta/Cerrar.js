'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { crearAlertaAdmin } from '@/lib/alertas-admin'
import { totalesComprobantes, sincronizarPagoTransferencia } from '@/components/ComprobantesTransferencia'
import InputDinero from '@/components/InputDinero'
import { ordenarPorDespacho } from '@/lib/orden-productos'
import { cargarPromos, promoVigente, precioConPromo, valorVendido, ticketsPorSku } from '@/lib/promociones'
import { subirSoporte, leerComprobante } from '@/lib/soportes'

// Cerrar mi ruta: la autoliquidacion del vendedor dentro de Mi ruta (antes
// era el kiosco). Misma logica y mismos datos que el kiosco: lo que se envia
// queda como borrador "por aprobar" y nada mueve caja, cartera ni inventario
// hasta que admin o auxiliar lo apruebe en Liquidacion. Lo que el vendedor
// anota en el dia (transferencias, fiados del PdV) llega en el borrador
// "en curso" y lo vendido con ticket llega solo.
const TINTA = '#1C1B19', GRIS = '#5A5750', FONDO = '#F3F1EA', LINEA = '#E3E1D8', ROJO = '#C41230', SUAVE = '#EFEDE6'
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const fmt = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
const AUTORIZADORES_OBSEQUIOS = ['Jero', 'Kathe']
const sumarDias = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }
let cont = 0
const nuevaKey = () => `m${Date.now()}${cont++}`
const input = 'w-full rounded-xl px-3 min-h-[46px] text-[15px] bg-white border outline-none focus:border-[#1C1B19]'
const btn = 'min-h-[48px] rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2 px-3'

const TARJETA = 'bg-white rounded-2xl p-3.5 flex flex-col gap-2'
const X = ({ onClick }) => <button type="button" onClick={onClick} aria-label="Quitar" className="w-9 h-9 shrink-0 rounded-xl text-lg font-bold" style={{ background: SUAVE }}>×</button>
const Seccion = ({ nombre, total, signo = '−', onAgregar, children, vacio }) => (
  <section className={TARJETA}>
    <div className="flex items-center justify-between gap-2">
      <h3 className="font-extrabold text-[16px]" style={titulo}>{nombre}</h3>
      {total > 0 && <b className="tabular-nums text-[15px]" style={{ color: signo === '−' ? ROJO : TINTA }}>{signo}{fmt(total)}</b>}
    </div>
    {children}
    {vacio && <p className="text-[13px]" style={{ color: GRIS }}>{vacio}</p>}
    <button type="button" onClick={onAgregar} className="min-h-[42px] rounded-xl text-[14px] font-bold" style={{ background: SUAVE }}>+ Agregar</button>
  </section>
)
const Paso = ({ n }) => (
  <div className="flex gap-1.5" aria-label={`Paso ${n} de 3`}>{[1, 2, 3].map(i => <span key={i} className="flex-1 h-[5px] rounded-full" style={{ background: i <= n ? TINTA : LINEA }} />)}</div>
)
const Stepper = ({ valor, onCambio, etiqueta }) => (
  <div className="flex items-center gap-1 shrink-0">
    <button type="button" aria-label={`Menos ${etiqueta}`} onClick={() => onCambio(String(Math.max(0, (parseFloat(valor) || 0) - 1)))} className="w-10 h-10 rounded-xl text-xl font-extrabold" style={{ background: SUAVE }}>−</button>
    <input type="text" inputMode="decimal" value={valor ?? ''} placeholder="0" aria-label={etiqueta} onFocus={e => e.target.select()}
      onChange={e => onCambio(e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''))}
      className="w-12 h-10 text-center rounded-xl font-extrabold text-[17px] bg-white border outline-none focus:border-[#1C1B19]" style={{ ...titulo, borderColor: LINEA }} />
    <button type="button" aria-label={`Más ${etiqueta}`} onClick={() => onCambio(String((parseFloat(valor) || 0) + 1))} className="w-10 h-10 rounded-xl text-xl font-extrabold" style={{ background: SUAVE }}>+</button>
  </div>
)


export default function Cerrar({ usuario, vendedor, onVolver, onEnviado }) {
  const empresaId = getEmpresaId()
  const [despachos, setDespachos] = useState(null)
  const [despachoSel, setDespachoSel] = useState(null)
  const [paso, setPaso] = useState(0) // 0 elegir · 1 devolucion · 2 plata · 3 revisar · 4 enviada
  const [cargando, setCargando] = useState(false)
  const [productosMap, setProductosMap] = useState({})
  const [detalle, setDetalle] = useState([])
  const [base, setBase] = useState(0)
  const [ventasTicket, setVentasTicket] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [clientesRuta, setClientesRuta] = useState([])
  const [fiadosPendientes, setFiadosPendientes] = useState([])
  const [categoriasGastos, setCategoriasGastos] = useState([])
  const [transRecibidas, setTransRecibidas] = useState([])
  const [transEnviadasHoy, setTransEnviadasHoy] = useState([])
  const [porConfirmar, setPorConfirmar] = useState([]) // transferencias de mercancia que este vendedor debe confirmar
  const [devoluciones, setDevoluciones] = useState({})
  const [cambios, setCambios] = useState({})
  const [verCambios, setVerCambios] = useState(false)
  const [efectivo, setEfectivo] = useState('')
  const [comprobantes, setComprobantes] = useState([])
  const [fiados, setFiados] = useState([])
  const [pagosFiados, setPagosFiados] = useState([])
  const [gastos, setGastos] = useState([])
  const [obsequios, setObsequios] = useState([])
  const [consumoPropio, setConsumoPropio] = useState([])
  const [mercEnviada, setMercEnviada] = useState([])
  const [recibo, setRecibo] = useState(null) // { vendedor_id, sku, cantidad, error }
  const [leyendo, setLeyendo] = useState(false)
  const [subiendo, setSubiendo] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [estadoEnviado, setEstadoEnviado] = useState(null)

  useEffect(() => {
    supabase.from('despachos_encab').select('id, fecha, estado, ruta_id, vendedor_id, created_at, rutas(nombre)')
      .eq('vendedor_id', vendedor.id).in('estado', ['despachado', 'por_aprobar']).eq('empresa_id', empresaId)
      .order('fecha', { ascending: true }).order('created_at', { ascending: true })
      .then(({ data }) => {
        setDespachos(data || [])
        if ((data || []).length === 1) elegir(data[0])
      })
    supabase.from('vendedores').select('id, nombre').eq('estado', true).eq('empresa_id', empresaId).order('nombre').then(({ data }) => setVendedores(data || []))
    supabase.from('categorias_gasto').select('nombre').eq('tipo', 'ruta').eq('estado', true).eq('empresa_id', empresaId).order('nombre').then(({ data }) => setCategoriasGastos((data || []).map(c => c.nombre)))
  }, [])

  const cargarTransferencias = async (fecha) => {
    const [{ data: rec }, { data: env }, { data: c1 }, { data: c2 }] = await Promise.all([
      supabase.from('transferencias_mercancia').select('*, origen:vendedor_origen_id(nombre)').eq('vendedor_destino_id', vendedor.id).eq('fecha', fecha).eq('empresa_id', empresaId),
      supabase.from('transferencias_mercancia').select('*, destino:vendedor_destino_id(nombre)').eq('vendedor_origen_id', vendedor.id).eq('fecha', fecha).eq('empresa_id', empresaId),
      // Otro dijo que recibio de mi: yo confirmo que se lo pase.
      supabase.from('transferencias_mercancia').select('*, otro:vendedor_destino_id(nombre)').eq('vendedor_origen_id', vendedor.id).eq('origen_registro', 'receptor').eq('estado', 'pendiente_confirmacion').eq('empresa_id', empresaId),
      // Otro dijo que me paso: yo confirmo que me llego.
      supabase.from('transferencias_mercancia').select('*, otro:vendedor_origen_id(nombre)').eq('vendedor_destino_id', vendedor.id).eq('origen_registro', 'emisor').eq('estado', 'pendiente_confirmacion').eq('empresa_id', empresaId),
    ])
    setTransRecibidas(rec || [])
    setTransEnviadasHoy(env || [])
    setPorConfirmar([...(c1 || []).map(t => ({ ...t, yoEnvie: true })), ...(c2 || [])])
  }

  const elegir = async (d) => {
    setCargando(true)
    setDespachoSel(d)
    const [{ data: det }, { data: prods }, { data: conf }, { data: preciosRuta }, { data: vt }, { data: cls }, { data: fp }, { data: borr }] = await Promise.all([
      supabase.from('despachos_detalle').select('*').eq('despacho_id', d.id).eq('empresa_id', empresaId),
      supabase.from('productos').select('sku, nombre, precio_venta, orden_despacho').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('configuracion').select('valor').eq('parametro', 'base_despacho_' + d.id).eq('empresa_id', empresaId).maybeSingle(),
      d.ruta_id ? supabase.from('rutas_precios').select('sku, precio_especial').eq('ruta_id', d.ruta_id).eq('empresa_id', empresaId) : Promise.resolve({ data: [] }),
      supabase.from('ventas_ruta').select('id, numero, nombre_cliente, cliente_id, total, forma_pago, fecha_pago, valor_domicilio, ventas_ruta_detalle(sku, cantidad, subtotal)').eq('despacho_id', d.id).eq('estado', 'activa').eq('empresa_id', empresaId),
      d.ruta_id ? supabase.from('clientes').select('id, nombre, apto, edificio').eq('ruta_id', d.ruta_id).eq('estado', true).eq('empresa_id', empresaId).order('nombre') : Promise.resolve({ data: [] }),
      supabase.from('cartera_fiados').select('id, nombre_cliente, saldo').or(d.ruta_id ? `vendedor_id.eq.${vendedor.id},ruta_id.eq.${d.ruta_id}` : `vendedor_id.eq.${vendedor.id}`).eq('estado', 'pendiente').eq('empresa_id', empresaId).order('nombre_cliente'),
      supabase.from('liquidaciones_borrador').select('datos, estado').eq('despacho_id', d.id).in('estado', ['en_curso', 'por_aprobar']).eq('empresa_id', empresaId).maybeSingle(),
    ])
    const pm = {}
    ;(prods || []).forEach(p => { pm[p.sku] = p })
    ;(preciosRuta || []).forEach(pr => { if (pm[pr.sku]) pm[pr.sku] = { ...pm[pr.sku], precio_venta: pr.precio_especial } })
    const promos = await cargarPromos(empresaId)
    Object.keys(pm).forEach(sku => {
      const promo = promoVigente(promos, sku, d.ruta_id, d.fecha)
      if (promo) pm[sku] = { ...pm[sku], precio_venta: precioConPromo(pm[sku].precio_venta, promo), promo }
    })
    setProductosMap(pm)
    setDetalle((det || []).map(item => ({ ...item, producto: pm[item.sku] || {} })))
    setBase(conf ? parseFloat(conf.valor) : 0)
    setVentasTicket(vt || [])
    setClientesRuta(cls || [])
    setFiadosPendientes(fp || [])
    await cargarTransferencias(d.fecha)

    // Lo que ya habia: el borrador (en curso o enviado) y lo de los tickets.
    const b = borr?.datos || {}
    setDevoluciones(b.devoluciones || {})
    setCambios(b.cambios || {})
    setEfectivo(b.efectivo || '')
    let comps = b.comprobantes || []
    let fia = (b.fiados || []).filter(f => f.nombre || f.valor)
    if (borr?.estado !== 'por_aprobar') {
      // Lo vendido con ticket a credito o por transferencia llega anotado.
      ;(vt || []).forEach(v => {
        if (v.forma_pago === 'credito' && !fia.some(f => f.ticket === v.id))
          fia.push({ nombre: v.nombre_cliente, valor: String(v.total), fecha_pago: v.fecha_pago || '', cliente_id: v.cliente_id, ticket: v.id })
        if (v.forma_pago === 'transferencia' && !comps.some(c => c.key === 'venta-' + v.id))
          comps.push({ key: 'venta-' + v.id, valor: String(v.total), referencia: `Ticket #${v.numero} ${v.nombre_cliente}`, banco: '', estado: 'por_verificar', fecha_limite: '', origen: 'manual' })
      })
    }
    setComprobantes(comps)
    setFiados(fia)
    setPagosFiados((b.pagosFiados || []).filter(p => p.cartera_fiados_id || p.valor))
    setGastos((b.gastos || []).filter(g => g.categoria || g.valor))
    setObsequios((b.obsequios || []).filter(o => o.sku || o.cantidad))
    setConsumoPropio((b.consumoPropio || []).filter(c => c.sku || c.cantidad))
    setMercEnviada((b.mercEnviada || []).filter(m => m.sku || m.cantidad))
    setVerCambios(Object.values(b.cambios || {}).some(v => parseFloat(v) > 0))
    setCargando(false)
    setPaso(1)
  }

  // ---- calculos (los mismos del kiosco y de Liquidacion) ----
  const getPrecio = (sku) => productosMap[sku]?.precio_venta || 0
  const transRecibidasContables = () => transRecibidas.filter(t => t.estado === 'aplicada' && !t.aplicada)
  const hayPendientesRecibidos = () => transRecibidas.some(t => t.estado === 'pendiente_confirmacion')
  const lineas = () => {
    const tickets = ticketsPorSku(ventasTicket)
    const mapa = {}
    detalle.forEach(item => { mapa[item.sku] = { sku: item.sku, producto: item.producto, despachadoPropio: item.total || 0, recibidos: [], enviados: [] } })
    transRecibidasContables().forEach(t => {
      if (!mapa[t.sku]) mapa[t.sku] = { sku: t.sku, producto: productosMap[t.sku] || { sku: t.sku, nombre: t.sku }, despachadoPropio: 0, recibidos: [], enviados: [] }
      mapa[t.sku].recibidos.push({ cantidad: t.cantidad, nombre: t.origen?.nombre || 'otro vendedor' })
    })
    transEnviadasHoy.filter(t => t.estado !== 'rechazada').forEach(t => {
      if (mapa[t.sku]) mapa[t.sku].enviados.push({ cantidad: t.cantidad, nombre: t.destino?.nombre || 'otro vendedor', deDevolucion: !!t.de_devolucion })
    })
    mercEnviada.filter(m => m.sku && parseFloat(m.cantidad) > 0).forEach(m => {
      if (mapa[m.sku]) mapa[m.sku].enviados.push({ cantidad: parseFloat(m.cantidad), nombre: vendedores.find(v => v.id === m.vendedor_id)?.nombre || 'otro vendedor', deDevolucion: m.momento === 'devolucion' })
    })
    return ordenarPorDespacho(Object.values(mapa)).map(l => {
      const totalRecibido = l.recibidos.reduce((s, r) => s + r.cantidad, 0)
      const totalEnviado = l.enviados.reduce((s, e) => s + e.cantidad, 0)
      const despachadoEfectivo = l.despachadoPropio + totalRecibido - totalEnviado
      const enviadoDeDevolucion = l.enviados.filter(e => e.deDevolucion).reduce((s, e) => s + e.cantidad, 0)
      const devueltoContado = parseFloat(devoluciones[l.sku] || 0)
      const devuelto = devueltoContado - enviadoDeDevolucion
      const cambio = parseFloat(cambios[l.sku] || 0)
      const vendidoNeto = despachadoEfectivo - devuelto - cambio
      const precio = getPrecio(l.sku)
      return { ...l, despachadoEfectivo, devuelto, devueltoContado, enviadoDeDevolucion, cambio, vendidoNeto, precio, efectivoEsperado: valorVendido(vendidoNeto, precio, tickets[l.sku]) }
    })
  }
  const ls = despachoSel ? lineas() : []
  const totalVendido = ls.reduce((s, l) => s + l.efectivoEsperado, 0)
  const totalFiados = fiados.reduce((s, f) => s + parseFloat(f.valor || 0), 0)
  const totalPagos = pagosFiados.reduce((s, p) => s + parseFloat(p.valor || 0), 0)
  const totalGastos = gastos.reduce((s, g) => s + parseFloat(g.valor || 0), 0)
  const totalObsequios = obsequios.reduce((s, o) => s + parseFloat(o.cantidad || 0) * getPrecio(o.sku), 0)
  const totalConsumo = consumoPropio.reduce((s, c) => s + parseFloat(c.cantidad || 0) * getPrecio(c.sku), 0)
  const { verificadas: transfVerificadas, porVerificar: transfPorVerificar } = totalesComprobantes(comprobantes)
  const totalDomicilios = ventasTicket.reduce((s, v) => s + Number(v.valor_domicilio || 0), 0)
  const aEntregar = totalVendido + totalDomicilios + base - totalFiados + totalPagos - totalObsequios - totalConsumo - transfPorVerificar
  const entregado = parseFloat(efectivo || 0) + transfVerificadas + totalGastos
  const diferencia = entregado - aEntregar

  // ---- mercancia entre vendedores ----
  const confirmar = async (t, ok) => {
    const { error } = await supabase.from('transferencias_mercancia').update({ estado: ok ? 'aplicada' : 'rechazada' }).eq('id', t.id).eq('empresa_id', empresaId)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    if (!ok) await crearAlertaAdmin({ empresaId, tipo: 'transferencia_rechazada', referenciaTipo: 'transferencia_mercancia', referenciaId: t.id,
      mensaje: `${vendedor.nombre} rechazó la transferencia de ${t.cantidad} ${productosMap[t.sku]?.nombre || t.sku} ${t.yoEnvie ? `que ${t.otro?.nombre || 'otro vendedor'} dijo haber recibido` : `que ${t.otro?.nombre || 'otro vendedor'} dijo haberle enviado`}` })
    await cargarTransferencias(despachoSel.fecha)
  }
  const registrarRecibo = async () => {
    const cantidad = parseFloat(recibo.cantidad || 0)
    if (!recibo.vendedor_id || !recibo.sku || !cantidad) { setRecibo({ ...recibo, error: 'Escoge quién, qué producto y cuántos' }); return }
    const { data: ya } = await supabase.from('transferencias_mercancia').select('id').eq('vendedor_origen_id', recibo.vendedor_id).eq('vendedor_destino_id', vendedor.id).eq('sku', recibo.sku).eq('fecha', despachoSel.fecha).eq('empresa_id', empresaId)
    if (ya?.length) { setRecibo({ ...recibo, error: 'Ya anotaste ese producto de esa persona hoy' }); return }
    const precio = getPrecio(recibo.sku)
    const { error } = await supabase.from('transferencias_mercancia').insert({
      empresa_id: empresaId, fecha: despachoSel.fecha, created_at: new Date().toISOString(), vendedor_origen_id: recibo.vendedor_id, vendedor_destino_id: vendedor.id,
      sku: recibo.sku, cantidad, valor_unitario: precio, valor_total: cantidad * precio, estado: 'pendiente_confirmacion', aplicada: false, origen_registro: 'receptor',
    })
    if (error) { setRecibo({ ...recibo, error: error.message }); return }
    const otro = vendedores.find(v => v.id === recibo.vendedor_id)?.nombre || 'un vendedor'
    await crearAlertaAdmin({ empresaId, tipo: 'transferencia_pendiente', referenciaTipo: 'transferencia_mercancia',
      mensaje: `${vendedor.nombre} registró haber recibido ${cantidad} ${productosMap[recibo.sku]?.nombre || recibo.sku} de ${otro}, pendiente de que ${otro} lo confirme` })
    setRecibo(null)
    await cargarTransferencias(despachoSel.fecha)
  }

  // ---- transferencias de plata ----
  const fotoTransferencia = async (file) => {
    if (!file) return
    setLeyendo(true)
    try {
      const [lectura, foto] = await Promise.all([leerComprobante(file), subirSoporte(file, 'transferencias').catch(() => null)])
      setComprobantes(prev => [...prev, { key: nuevaKey(), ...lectura, foto, estado: 'por_verificar', fecha_limite: '' }])
    } catch (e) { alert(e.message) }
    setLeyendo(false)
  }
  const nombrePago = (p) => p.cartera_fiados_id === '__otro__' ? p.nombre_manual : (fiadosPendientes.find(f => f.id === p.cartera_fiados_id)?.nombre_cliente || '')
  const actualizarPago = (i, campos) => {
    const antes = pagosFiados[i]
    const pago = sincronizarPagoTransferencia(antes, { ...antes, ...campos }, nombrePago({ ...antes, ...campos }), comprobantes, setComprobantes)
    setPagosFiados(prev => prev.map((p, j) => j === i ? pago : p))
  }
  const quitarPago = (i) => {
    const p = pagosFiados[i]
    if (p.compKey) setComprobantes(prev => prev.filter(c => c.key !== p.compKey))
    setPagosFiados(prev => prev.filter((_, j) => j !== i))
  }
  const fotoGasto = async (i, file) => {
    if (!file) return
    setSubiendo(i)
    try { const ruta = await subirSoporte(file, 'gastos'); setGastos(prev => prev.map((g, j) => j === i ? { ...g, foto: ruta } : g)) }
    catch (e) { alert('No se pudo subir la foto: ' + e.message) }
    setSubiendo(null)
  }

  // ---- enviar ----
  const enviar = async () => {
    if (guardando) return
    if (hayPendientesRecibidos()) { alert('Tienes mercancía recibida sin confirmar. Quien te la pasó (o un administrador) la tiene que confirmar antes de cerrar.'); return }
    const mal = ls.filter(l => l.devuelto < 0)
    if (mal.length) { alert('Pasaste "de la devolución" más de lo que contaste que trajiste:\n' + mal.map(l => `${l.producto?.nombre || l.sku}: trajiste ${l.devueltoContado}, pasaste ${l.enviadoDeDevolucion}`).join('\n')); return }
    if (obsequios.some(o => (o.sku || parseFloat(o.cantidad) > 0) && !(o.sku && parseFloat(o.cantidad) > 0 && o.autorizado_por))) { alert('Cada obsequio necesita producto, cantidad y quién lo autorizó.'); return }
    const regalado = {}
    ;[...obsequios, ...consumoPropio].forEach(o => { if (o.sku) regalado[o.sku] = (regalado[o.sku] || 0) + (parseFloat(o.cantidad) || 0) })
    const excedidos = ls.filter(l => (regalado[l.sku] || 0) > l.vendidoNeto + 0.0001)
    if (excedidos.length) { alert('Obsequios y consumo propio no pueden ser más de lo que salió y no volvió:\n' + excedidos.map(l => `${l.producto?.nombre || l.sku}`).join('\n')); return }
    if (fiados.some(f => parseFloat(f.valor) > 0 && !(f.nombre || '').trim())) { alert('Cada crédito necesita el nombre del cliente.'); return }
    if (gastos.some(g => parseFloat(g.valor) > 0 && !g.categoria)) { alert('Cada gasto necesita su categoría.'); return }
    setGuardando(true)
    // Transferencias por verificar sin fecha limite: dos dias despues del despacho.
    const comps = comprobantes.map(c => c.estado === 'por_verificar' && !c.fecha_limite ? { ...c, fecha_limite: sumarDias(despachoSel.fecha, 2) } : c)
    const lleno = (lista, ok) => lista.filter(ok)
    const datos = {
      devoluciones, cambios, efectivo, comprobantes: comps,
      fiados: lleno(fiados, f => parseFloat(f.valor) > 0),
      pagosFiados: lleno(pagosFiados, p => parseFloat(p.valor) > 0),
      gastos: lleno(gastos, g => parseFloat(g.valor) > 0),
      descuentos: [],
      obsequios: lleno(obsequios, o => o.sku && parseFloat(o.cantidad) > 0),
      consumoPropio: lleno(consumoPropio, c => c.sku && parseFloat(c.cantidad) > 0),
      mercEnviada: lleno(mercEnviada, m => m.sku && parseFloat(m.cantidad) > 0),
      resumen: { vendido: totalVendido, base, aEntregar, entregado, diferencia },
    }
    const { error } = await supabase.from('liquidaciones_borrador').upsert({
      empresa_id: empresaId, despacho_id: despachoSel.id, vendedor_id: vendedor.id, fecha: despachoSel.fecha, datos,
      efectivo_declarado: parseFloat(efectivo || 0), diferencia, estado: 'por_aprobar',
      enviado_por: usuario?.nombre || null, enviado_at: new Date().toISOString(),
    }, { onConflict: 'despacho_id' })
    if (error) { alert('No se pudo enviar: ' + error.message); setGuardando(false); return }
    const { error: e2 } = await supabase.from('despachos_encab').update({ estado: 'por_aprobar' }).eq('id', despachoSel.id).eq('empresa_id', empresaId)
    if (e2) alert('Se envió, pero el despacho no quedó marcado como por aprobar (' + e2.message + '). Avísale al administrador.')
    await crearAlertaAdmin({ empresaId, tipo: 'liquidacion_por_aprobar', referenciaTipo: 'despacho_encab', referenciaId: despachoSel.id,
      mensaje: `${vendedor.nombre} envió su cierre del ${despachoSel.fecha} (${despachoSel.rutas?.nombre || ''}) para aprobar: declara ${fmt(efectivo)} en efectivo, diferencia ${diferencia >= 0 ? '+' : '−'}${fmt(Math.abs(diferencia))}` })
    setComprobantes(comps)
    setEstadoEnviado({ efectivo: parseFloat(efectivo || 0), diferencia })
    setGuardando(false)
    setPaso(4)
    onEnviado?.()
  }

  // ---- piezas de pantalla ----
  const tarjeta = 'bg-white rounded-2xl p-3.5 flex flex-col gap-2'
  const et = 'text-[13px] font-bold'
  const productosOpc = ls.map(l => <option key={l.sku} value={l.sku}>{l.producto?.nombre || l.sku}</option>)
  const quitar = (set, i) => set(prev => prev.filter((_, j) => j !== i))
  const cambiar = (set, i, campos) => set(prev => prev.map((x, j) => j === i ? { ...x, ...campos } : x))
  const cabecera = (texto, atras) => (
    <div className="flex items-center justify-between gap-2">
      <button onClick={atras} className="text-sm font-bold px-3 min-h-[40px] rounded-xl bg-white">← {paso <= 1 ? 'Salir' : 'Atrás'}</button>
      <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: GRIS }}>{texto}</span>
    </div>
  )

  if (!despachos || cargando) return <p className="text-center py-16" style={{ color: GRIS }}>Cargando…</p>

  // 0. Elegir despacho
  if (paso === 0) return (
    <div className="max-w-md mx-auto px-4 pt-4 flex flex-col gap-3">
      {cabecera('Cerrar mi ruta', onVolver)}
      <h2 className="font-extrabold text-[22px]" style={titulo}>¿Qué día vas a cerrar?</h2>
      {despachos.length === 0 && <div className={tarjeta}><p>No tienes despachos abiertos. Cuando te despachen, aquí cierras el día.</p></div>}
      {despachos.map(d => (
        <button key={d.id} onClick={() => elegir(d)} className="bg-white rounded-2xl p-4 text-left flex justify-between items-center gap-3">
          <span><b className="block">{d.rutas?.nombre}</b><span className="text-[13px]" style={{ color: GRIS }}>{new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })}</span></span>
          <span className="text-[12px] font-bold px-2 py-0.5 rounded-full" style={d.estado === 'por_aprobar' ? { background: '#FFF4CC', color: '#8A5A00' } : { background: SUAVE, color: GRIS }}>{d.estado === 'por_aprobar' ? 'Enviado · corregir' : 'Por cerrar'}</span>
        </button>
      ))}
    </div>
  )

  // 4. Enviada
  if (paso === 4) return (
    <div className="max-w-md mx-auto px-4 pt-10 flex flex-col items-center gap-3 text-center">
      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: '#E6F0E8' }} aria-hidden="true">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#2E5E3A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
      </div>
      <h2 className="font-extrabold text-[24px]" style={titulo}>Enviada</h2>
      <p style={{ color: GRIS }}>Tu cierre del {new Date(despachoSel.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })} quedó esperando aprobación. Entrega la plata y la devolución al encargado.</p>
      <span className="text-[12.5px] font-bold px-3 py-1 rounded-full" style={{ background: '#FFF4CC', color: '#8A5A00' }}>Esperando aprobación</span>
      <div className={tarjeta + ' w-full text-left'}>
        <div className="flex justify-between"><span>Efectivo</span><b className="tabular-nums">{fmt(estadoEnviado?.efectivo)}</b></div>
        <div className="flex justify-between"><span>Diferencia</span><b className="tabular-nums" style={{ color: estadoEnviado?.diferencia < 0 ? ROJO : TINTA }}>{estadoEnviado?.diferencia >= 0 ? '+' : '−'}{fmt(Math.abs(estadoEnviado?.diferencia || 0))}</b></div>
      </div>
      <button onClick={() => setPaso(2)} className={btn + ' w-full bg-white'}>Corregir antes de que la aprueben</button>
      <button onClick={onVolver} className={btn + ' w-full text-white'} style={{ background: ROJO }}>Volver al inicio</button>
    </div>
  )

  const nombreDia = new Date(despachoSel.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })

  // 1. Devolucion
  if (paso === 1) return (
    <div className="max-w-md mx-auto px-4 pt-4 flex flex-col gap-3">
      {cabecera(`Paso 1 de 3 · ${nombreDia}`, () => despachos.length > 1 ? setPaso(0) : onVolver())}
      <Paso n={1} />
      <div>
        <h2 className="font-extrabold text-[22px]" style={titulo}>¿Qué traes de vuelta?</h2>
        <p className="text-[14px]" style={{ color: GRIS }}>Cuenta lo que queda en el carro, producto por producto.</p>
      </div>

      {porConfirmar.length > 0 && (
        <div className="rounded-2xl p-3.5 flex flex-col gap-2" style={{ background: '#FFF4CC' }}>
          <b className="text-[14px]" style={{ color: '#8A5A00' }}>Confirma esta mercancía</b>
          {porConfirmar.map(t => (
            <div key={t.id} className="bg-white rounded-xl p-3 flex flex-col gap-2">
              <p className="text-[14px]">{t.yoEnvie ? `${t.otro?.nombre || 'Otro vendedor'} dice que le pasaste` : `${t.otro?.nombre || 'Otro vendedor'} dice que te pasó`} <b>{t.cantidad} {productosMap[t.sku]?.nombre || t.sku}</b>.</p>
              <div className="flex gap-2">
                <button onClick={() => confirmar(t, false)} className="flex-1 min-h-[40px] rounded-xl font-bold text-sm" style={{ background: SUAVE }}>No es cierto</button>
                <button onClick={() => confirmar(t, true)} className="flex-1 min-h-[40px] rounded-xl font-bold text-sm" style={{ background: '#E6F0E8', color: '#2E5E3A' }}>Sí, es cierto</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl px-3.5 py-1">
        {ls.map((l, i) => (
          <div key={l.sku} className="py-2.5 flex flex-col gap-1.5" style={{ borderTop: i ? `1px solid ${LINEA}` : 0 }}>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 leading-tight">
                <b className="text-[14.5px]">{l.producto?.nombre || l.sku}</b>
                <span className="block text-[12px]" style={{ color: GRIS }}>
                  salieron {l.despachadoEfectivo}
                  {l.recibidos.map((r, k) => <span key={'r' + k}> · +{r.cantidad} de {r.nombre}</span>)}
                  {l.enviados.map((e, k) => <span key={'e' + k}> · −{e.cantidad} a {e.nombre}</span>)}
                </span>
              </div>
              <Stepper valor={devoluciones[l.sku]} etiqueta={`trae de ${l.producto?.nombre || l.sku}`} onCambio={v => setDevoluciones(p => ({ ...p, [l.sku]: v }))} />
            </div>
            {verCambios && (
              <div className="flex items-center gap-2 pl-2">
                <span className="flex-1 text-[12.5px] font-bold" style={{ color: ROJO }}>Dañados (cambio)</span>
                <Stepper valor={cambios[l.sku]} etiqueta={`cambio de ${l.producto?.nombre || l.sku}`} onCambio={v => setCambios(p => ({ ...p, [l.sku]: v }))} />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setVerCambios(!verCambios)} className="min-h-[44px] rounded-xl font-bold text-[13.5px] bg-white">{verCambios ? 'Ocultar cambios' : '+ Anotar dañados'}</button>
        <button onClick={() => setRecibo(recibo ? null : { vendedor_id: '', sku: '', cantidad: '' })} className="min-h-[44px] rounded-xl font-bold text-[13.5px] bg-white">+ Me pasaron mercancía</button>
      </div>
      {recibo && (
        <div className={tarjeta}>
          <b className="text-[14px]">Mercancía que te pasó otro vendedor</b>
          <select value={recibo.vendedor_id} onChange={e => setRecibo({ ...recibo, vendedor_id: e.target.value })} className={input} style={{ borderColor: LINEA }}>
            <option value="">¿Quién te la pasó?</option>
            {vendedores.filter(v => v.id !== vendedor.id).map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
          </select>
          <div className="flex gap-2">
            <select value={recibo.sku} onChange={e => setRecibo({ ...recibo, sku: e.target.value })} className={input + ' flex-1 min-w-0'} style={{ borderColor: LINEA }}>
              <option value="">Producto</option>
              {Object.values(productosMap).map(p => <option key={p.sku} value={p.sku}>{p.nombre}</option>)}
            </select>
            <input type="number" inputMode="numeric" placeholder="Cant." value={recibo.cantidad} onChange={e => setRecibo({ ...recibo, cantidad: e.target.value })} className={input + ' w-24 text-center font-bold'} style={{ borderColor: LINEA }} />
          </div>
          {recibo.error && <p className="text-[13px]" style={{ color: ROJO }}>{recibo.error}</p>}
          <p className="text-[12.5px]" style={{ color: GRIS }}>Queda pendiente hasta que esa persona lo confirme en su Mi ruta.</p>
          <button onClick={registrarRecibo} className={btn} style={{ background: SUAVE, color: TINTA }}>Anotar</button>
        </div>
      )}
      <button onClick={() => setPaso(2)} className={btn + ' text-white min-h-[54px]'} style={{ background: ROJO }}>Seguir</button>
    </div>
  )

  // 2. La plata
  if (paso === 2) return (
    <div className="max-w-md mx-auto px-4 pt-4 flex flex-col gap-3">
      {cabecera(`Paso 2 de 3 · ${nombreDia}`, () => setPaso(1))}
      <Paso n={2} />
      <h2 className="font-extrabold text-[22px]" style={titulo}>La plata</h2>

      <label className={tarjeta} htmlFor="cerrar-efectivo">
        <span className={et} style={{ color: GRIS }}>Efectivo que entregas</span>
        <InputDinero id="cerrar-efectivo" value={efectivo} onChange={e => setEfectivo(e.target.value)} placeholder="$0"
          className="w-full text-center rounded-xl min-h-[58px] text-[28px] font-extrabold bg-white border outline-none focus:border-[#1C1B19]" style={{ ...titulo, borderColor: LINEA }} />
      </label>

      <section className={tarjeta}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-extrabold text-[16px]" style={titulo}>Transferencias</h3>
          {transfPorVerificar + transfVerificadas > 0 && <b className="tabular-nums">{fmt(transfPorVerificar + transfVerificadas)}</b>}
        </div>
        {comprobantes.length === 0 && <p className="text-[13px]" style={{ color: GRIS }}>Lo que te pagaron por Nequi, Bancolombia u otra cuenta.</p>}
        {comprobantes.map((c, i) => (
          <div key={c.key || i} className="flex items-center gap-2 py-1" style={{ borderTop: i ? `1px solid ${LINEA}` : 0 }}>
            <div className="flex-1 min-w-0 text-[13.5px] leading-snug">
              <b>{c.referencia?.startsWith('Ticket') || c.referencia?.startsWith('Pago crédito') ? c.referencia : [c.banco, c.cuenta_nombre ? `a ${c.cuenta_nombre}` : null].filter(Boolean).join(' ') || 'Transferencia'}</b>
              <span className="block text-[12px]" style={{ color: c.cuenta_maissy === false || c.repetida ? ROJO : GRIS }}>
                {c.foto ? 'con foto' : c.origen === 'foto' ? 'leída de foto' : 'anotada a mano'}{c.cuenta_maissy === false ? ' · no llegó a una cuenta de la empresa' : ''}{c.repetida ? ' · ya se había registrado' : ''}
              </span>
            </div>
            {c.key?.startsWith('venta-') || c.referencia?.startsWith('Pago crédito')
              ? <b className="tabular-nums">{fmt(c.valor)}</b>
              : <InputDinero value={c.valor} onChange={e => setComprobantes(prev => prev.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))} className="w-28 text-right rounded-xl min-h-[40px] px-2 font-bold bg-white border outline-none" style={{ borderColor: LINEA }} />}
            {!c.key?.startsWith('venta-') && !c.referencia?.startsWith('Pago crédito') && <X onClick={() => setComprobantes(prev => prev.filter((_, j) => j !== i))} />}
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2">
          <label className="min-h-[42px] rounded-xl text-[14px] font-bold flex items-center justify-center cursor-pointer" style={{ background: SUAVE }}>
            {leyendo ? 'Leyendo…' : 'Foto del comprobante'}
            <input type="file" accept="image/*" className="hidden" disabled={leyendo} onChange={e => { fotoTransferencia(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          <button type="button" onClick={() => setComprobantes(prev => [...prev, { key: nuevaKey(), valor: '', referencia: '', estado: 'por_verificar', fecha_limite: '', origen: 'manual' }])} className="min-h-[42px] rounded-xl text-[14px] font-bold" style={{ background: SUAVE }}>A mano</button>
        </div>
      </section>

      <Seccion nombre="Créditos que diste" total={totalFiados} onAgregar={() => setFiados(p => [...p, { nombre: '', valor: '', fecha_pago: '' }])}>
        <datalist id="cerrar-clientes">{clientesRuta.map(c => <option key={c.id} value={c.nombre} />)}</datalist>
        {fiados.map((f, i) => (
          <div key={i} className="flex flex-col gap-1.5 py-1" style={{ borderTop: i ? `1px solid ${LINEA}` : 0 }}>
            <div className="flex gap-2 items-center">
              {f.ticket ? <b className="flex-1 min-w-0 text-[14px]">{f.nombre} <span className="text-[11.5px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: SUAVE, color: GRIS }}>del ticket</span></b>
                : <input list="cerrar-clientes" placeholder="Cliente" value={f.nombre} onChange={e => { const c = clientesRuta.find(x => x.nombre.toLowerCase() === e.target.value.trim().toLowerCase()); cambiar(setFiados, i, { nombre: e.target.value, cliente_id: c?.id || null }) }} className={input + ' flex-1 min-w-0'} style={{ borderColor: LINEA }} />}
              {f.ticket ? <b className="tabular-nums">{fmt(f.valor)}</b> : <InputDinero placeholder="Valor" value={f.valor} onChange={e => cambiar(setFiados, i, { valor: e.target.value })} className={input + ' w-28 font-bold text-right'} style={{ borderColor: LINEA }} />}
              {!f.ticket && <X onClick={() => quitar(setFiados, i)} />}
            </div>
            {!f.ticket && <label className="flex items-center gap-2 text-[12.5px]" style={{ color: GRIS }}>Paga el<input type="date" value={f.fecha_pago || ''} onChange={e => cambiar(setFiados, i, { fecha_pago: e.target.value })} className="flex-1 rounded-xl px-2 min-h-[38px] bg-white border" style={{ borderColor: LINEA }} /></label>}
          </div>
        ))}
      </Seccion>

      <Seccion nombre="Abonos que cobraste" total={totalPagos} signo="+" onAgregar={() => setPagosFiados(p => [...p, { cartera_fiados_id: '', nombre_manual: '', valor: '', forma: 'efectivo' }])}>
        {pagosFiados.map((p, i) => (
          <div key={i} className="flex flex-col gap-1.5 py-1" style={{ borderTop: i ? `1px solid ${LINEA}` : 0 }}>
            <div className="flex gap-2 items-center">
              <select value={p.cartera_fiados_id} onChange={e => actualizarPago(i, { cartera_fiados_id: e.target.value, nombre_manual: '' })} className={input + ' flex-1 min-w-0'} style={{ borderColor: LINEA }}>
                <option value="">¿Quién pagó?</option>
                {fiadosPendientes.map(f => <option key={f.id} value={f.id}>{f.nombre_cliente} (debe {fmt(f.saldo)})</option>)}
                <option value="__otro__">Otro (no está en la lista)</option>
              </select>
              <X onClick={() => quitarPago(i)} />
            </div>
            {p.cartera_fiados_id === '__otro__' && <input placeholder="Nombre del cliente" value={p.nombre_manual} onChange={e => actualizarPago(i, { nombre_manual: e.target.value })} className={input} style={{ borderColor: LINEA }} />}
            <div className="flex gap-2">
              <InputDinero placeholder="Valor" value={p.valor} onChange={e => actualizarPago(i, { valor: e.target.value })} className={input + ' w-32 font-bold text-right'} style={{ borderColor: LINEA }} />
              {[['efectivo', 'Efectivo'], ['transferencia', 'Transferencia']].map(([id, t]) => (
                <button key={id} type="button" onClick={() => actualizarPago(i, { forma: id })} className="flex-1 rounded-xl text-[13px] font-bold"
                  style={(p.forma || 'efectivo') === id ? { background: '#fff', color: TINTA, boxShadow: `inset 0 0 0 2px ${TINTA}` } : { background: SUAVE, color: GRIS }}>{t}</button>
              ))}
            </div>
          </div>
        ))}
      </Seccion>

      <Seccion nombre="Gastos" total={totalGastos} onAgregar={() => setGastos(p => [...p, { categoria: '', concepto: '', valor: '' }])}>
        {gastos.map((g, i) => (
          <div key={i} className="flex flex-col gap-1.5 py-1" style={{ borderTop: i ? `1px solid ${LINEA}` : 0 }}>
            <div className="flex gap-2 items-center">
              <select value={g.categoria} onChange={e => cambiar(setGastos, i, { categoria: e.target.value })} className={input + ' flex-1 min-w-0'} style={{ borderColor: LINEA }}>
                <option value="">¿En qué?</option>
                {categoriasGastos.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <InputDinero placeholder="Valor" value={g.valor} onChange={e => cambiar(setGastos, i, { valor: e.target.value })} className={input + ' w-28 font-bold text-right'} style={{ borderColor: LINEA }} />
              <X onClick={() => quitar(setGastos, i)} />
            </div>
            <div className="flex gap-2">
              <input placeholder="Nota (opcional)" value={g.concepto} onChange={e => cambiar(setGastos, i, { concepto: e.target.value })} className={input + ' flex-1 min-w-0'} style={{ borderColor: LINEA }} />
              <label className="shrink-0 px-3 min-h-[46px] rounded-xl text-[13px] font-bold flex items-center cursor-pointer" style={g.foto ? { background: '#E6F0E8', color: '#2E5E3A' } : { background: SUAVE }}>
                {subiendo === i ? 'Subiendo…' : g.foto ? 'Recibo cargado' : 'Foto recibo'}
                <input type="file" accept="image/*" className="hidden" onChange={e => { fotoGasto(i, e.target.files?.[0]); e.target.value = '' }} />
              </label>
            </div>
          </div>
        ))}
      </Seccion>

      <Seccion nombre="Obsequios" total={totalObsequios} onAgregar={() => setObsequios(p => [...p, { sku: '', cantidad: '', autorizado_por: '' }])}>
        {obsequios.map((o, i) => (
          <div key={i} className="flex gap-2 items-center py-1 flex-wrap" style={{ borderTop: i ? `1px solid ${LINEA}` : 0 }}>
            <select value={o.sku} onChange={e => cambiar(setObsequios, i, { sku: e.target.value })} className={input + ' flex-1 min-w-[140px]'} style={{ borderColor: LINEA }}><option value="">Producto</option>{productosOpc}</select>
            <input type="number" inputMode="numeric" placeholder="Cant." value={o.cantidad} onChange={e => cambiar(setObsequios, i, { cantidad: e.target.value })} className={input + ' w-20 text-center font-bold'} style={{ borderColor: LINEA }} />
            <select value={o.autorizado_por} onChange={e => cambiar(setObsequios, i, { autorizado_por: e.target.value })} className={input + ' w-28'} style={{ borderColor: LINEA }}><option value="">Autorizó</option>{AUTORIZADORES_OBSEQUIOS.map(a => <option key={a} value={a}>{a}</option>)}</select>
            <X onClick={() => quitar(setObsequios, i)} />
          </div>
        ))}
      </Seccion>

      <Seccion nombre="Consumo propio" total={totalConsumo} onAgregar={() => setConsumoPropio(p => [...p, { sku: '', cantidad: '' }])} vacio={consumoPropio.length ? null : 'Lo que tú cogiste. Se descuenta en tu nómina.'}>
        {consumoPropio.map((c, i) => (
          <div key={i} className="flex gap-2 items-center py-1" style={{ borderTop: i ? `1px solid ${LINEA}` : 0 }}>
            <select value={c.sku} onChange={e => cambiar(setConsumoPropio, i, { sku: e.target.value })} className={input + ' flex-1 min-w-0'} style={{ borderColor: LINEA }}><option value="">Producto</option>{productosOpc}</select>
            <input type="number" inputMode="numeric" placeholder="Cant." value={c.cantidad} onChange={e => cambiar(setConsumoPropio, i, { cantidad: e.target.value })} className={input + ' w-20 text-center font-bold'} style={{ borderColor: LINEA }} />
            <X onClick={() => quitar(setConsumoPropio, i)} />
          </div>
        ))}
      </Seccion>

      <Seccion nombre="Mercancía que pasaste" total={0} onAgregar={() => setMercEnviada(p => [...p, { vendedor_id: '', sku: '', cantidad: '', momento: 'ruta' }])} vacio={mercEnviada.length ? null : 'Producto que le pasaste a otro vendedor.'}>
        {mercEnviada.map((m, i) => (
          <div key={i} className="flex flex-col gap-1.5 py-1" style={{ borderTop: i ? `1px solid ${LINEA}` : 0 }}>
            <div className="flex gap-2 items-center">
              <select value={m.vendedor_id} onChange={e => cambiar(setMercEnviada, i, { vendedor_id: e.target.value })} className={input + ' flex-1 min-w-0'} style={{ borderColor: LINEA }}>
                <option value="">¿A quién?</option>
                {vendedores.filter(v => v.id !== vendedor.id).map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
              <X onClick={() => quitar(setMercEnviada, i)} />
            </div>
            <div className="flex gap-2">
              <select value={m.sku} onChange={e => cambiar(setMercEnviada, i, { sku: e.target.value })} className={input + ' flex-1 min-w-0'} style={{ borderColor: LINEA }}><option value="">Producto</option>{productosOpc}</select>
              <input type="number" inputMode="numeric" placeholder="Cant." value={m.cantidad} onChange={e => cambiar(setMercEnviada, i, { cantidad: e.target.value })} className={input + ' w-20 text-center font-bold'} style={{ borderColor: LINEA }} />
            </div>
            <div className="flex gap-2">
              {[['ruta', 'En la ruta'], ['devolucion', 'Al llegar, de la devolución']].map(([id, t]) => (
                <button key={id} type="button" onClick={() => cambiar(setMercEnviada, i, { momento: id })} className="flex-1 min-h-[38px] rounded-xl text-[12.5px] font-bold"
                  style={(m.momento || 'ruta') === id ? { background: '#fff', color: TINTA, boxShadow: `inset 0 0 0 2px ${TINTA}` } : { background: SUAVE, color: GRIS }}>{t}</button>
              ))}
            </div>
          </div>
        ))}
      </Seccion>

      <button onClick={() => setPaso(3)} className={btn + ' text-white min-h-[54px] mb-6'} style={{ background: ROJO }}>Seguir</button>
    </div>
  )

  // 3. Revisar y enviar
  const fila = (t, v, color) => <div className="flex justify-between gap-3 py-1.5 text-[14.5px]" style={{ borderTop: `1px solid ${LINEA}` }}><span>{t}</span><b className="tabular-nums" style={{ color }}>{v}</b></div>
  return (
    <div className="max-w-md mx-auto px-4 pt-4 flex flex-col gap-3">
      {cabecera(`Paso 3 de 3 · ${nombreDia}`, () => setPaso(2))}
      <Paso n={3} />
      <h2 className="font-extrabold text-[22px]" style={titulo}>Revisa y envía</h2>
      <div className="bg-white rounded-2xl px-3.5 py-1.5">
        <div className="flex justify-between gap-3 py-1.5 text-[14.5px]"><span>Vendiste</span><b className="tabular-nums">{fmt(totalVendido)}</b></div>
        {totalDomicilios > 0 && fila('Domicilios cobrados', '+' + fmt(totalDomicilios))}
        {base > 0 && fila('Base', '+' + fmt(base))}
        {totalPagos > 0 && fila('Abonos cobrados', '+' + fmt(totalPagos))}
        {transfPorVerificar > 0 && fila('Transferencias', '−' + fmt(transfPorVerificar))}
        {totalFiados > 0 && fila('Créditos', '−' + fmt(totalFiados))}
        {totalObsequios > 0 && fila('Obsequios', '−' + fmt(totalObsequios))}
        {totalConsumo > 0 && fila('Consumo propio', '−' + fmt(totalConsumo))}
        {totalGastos > 0 && fila('Gastos', '−' + fmt(totalGastos))}
        <div className="flex justify-between gap-3 py-2 text-[15px] font-bold" style={{ borderTop: `1px solid ${LINEA}` }}><span>Debes entregar</span><span className="tabular-nums">{fmt(aEntregar - totalGastos - transfVerificadas)}</span></div>
        {fila('Entregas en efectivo', fmt(efectivo))}
      </div>
      {Math.abs(diferencia) < 1 ? (
        <div className="rounded-2xl p-3.5" style={{ background: '#E6F0E8' }}><b style={{ color: '#2E5E3A' }}>Cuadra.</b></div>
      ) : (
        <div className="rounded-2xl p-3.5 flex flex-col gap-1" style={{ background: diferencia < 0 ? '#FBE9E9' : '#FFF4CC' }}>
          <span className="text-[13px] font-bold" style={{ color: diferencia < 0 ? ROJO : '#8A5A00' }}>{diferencia < 0 ? 'Te faltan' : 'Te sobran'}</span>
          <span className="font-extrabold text-[28px] tabular-nums" style={{ ...titulo, color: diferencia < 0 ? ROJO : '#8A5A00' }}>{fmt(Math.abs(diferencia))}</span>
          <span className="text-[13px]" style={{ color: diferencia < 0 ? ROJO : '#8A5A00' }}>Revisa si te falta anotar una transferencia, un crédito o un gasto antes de enviar.</span>
        </div>
      )}
      <button onClick={enviar} disabled={guardando} className={btn + ' text-white min-h-[56px] disabled:opacity-50 mb-6'} style={{ background: ROJO }}>{guardando ? 'Enviando…' : 'Enviar para aprobar'}</button>
    </div>
  )
}
