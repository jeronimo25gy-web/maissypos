'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { puedeVerModulo } from '@/lib/permisos'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { PageHeader } from '@/components/ui'
import { cargarPromos, promoVigente, precioConPromo, armarLineas } from '@/lib/promociones'
import { ordenarPorDespacho } from '@/lib/orden-productos'
import { DIAS } from '@/lib/rutero'
import InputDinero from '@/components/InputDinero'
import { imagenTicket } from '@/lib/ticket-imagen'
import { conCuenta, cuentaDeRuta, cuentaMostrador } from '@/lib/cuenta-pago'
import { textoTicket } from '@/app/mi-ruta/Vender'
import { direccionNormalizada } from '@/lib/rutero'
import { pasoDe, leerCantidad, sumarPaso, textoCantidad } from '@/lib/cantidades'
import CampoFecha from '@/components/CampoFecha'

// Domicilios: se toma el pedido (telefono o WhatsApp). "Con la ruta" le llega
// al vendedor en Mi ruta (burbuja) y lo entrega desde el carro con ticket.
// "Express" lo lleva un domiciliario aparte, sin Mi ruta: el ticket se manda
// desde aqui y al entregarse se registra como venta normal (descuenta bodega).
const fmt = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO')
const sinTildes = (t) => (t || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const NUEVO = { nombre: '', telefono: '', direccion: '', edificio: '', apto: '', barrio: '' }
const ESTADO = { pendiente: ['Por entregar', 'bg-gray-100 text-gray-700'], entregado: ['Entregado', 'bg-emerald-50 text-emerald-800'], no_entregado: ['No se pudo', 'bg-red-50 text-red-800'], cancelado: ['Cancelado', 'bg-gray-100 text-gray-400 line-through'] }
const hora = (iso) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })

export default function Domicilios() {
  const router = useRouter()
  const [usuario, setUsuario] = useState(null)
  const [clientes, setClientes] = useState([])
  const [rutas, setRutas] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [productos, setProductos] = useState([])
  const [preciosRuta, setPreciosRuta] = useState([])
  const [promos, setPromos] = useState([])
  const [lista, setLista] = useState([])
  const [busca, setBusca] = useState('')
  const [cliente, setCliente] = useState(null)
  const [nuevo, setNuevo] = useState(null)
  const [pactados, setPactados] = useState({})
  const [ajuste, setAjuste] = useState(null) // { d, cant: { sku: n }, pact }
  const [verDom, setVerDom] = useState(null) // domicilio con el detalle abierto
  const [items, setItems] = useState([])
  const [agregar, setAgregar] = useState('')
  const [pedido, setPedido] = useState({ fecha: obtenerFechaActual(), cuando: 'al_pasar', hora: '11:30', forma_pago: 'efectivo', nota: '', ruta_id: '', valor_domicilio: '', tipo: 'ruta', km: '', domiciliario: '', direccion: '', paga_con: '' })
  const [feeManual, setFeeManual] = useState(false)
  const [tarifas, setTarifas] = useState({})
  const [empresa, setEmpresa] = useState(null)
  const [cuentas, setCuentas] = useState([])
  const [entrega, setEntrega] = useState(null) // { d, forma, cuenta_id } al marcar entregado un express
  const [guardando, setGuardando] = useState(false)
  // Muchos son solo domicilio: el cliente se guarda pero no entra a la ruta,
  // salvo que se marque "Agregar a la ruta" con sus dias de visita.
  const [aRuta, setARuta] = useState({ activo: false, dias: [] })
  const [diasRutero, setDiasRutero] = useState([]) // [{ ruta_id, dia_semana }] del cliente escogido

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (!puedeVerModulo(parsed, 'domicilios', ['admin', 'auxiliar'])) { router.push('/despacho'); return }
    setUsuario(parsed)
    cargarTodo()
  }, [])

  const cargarTodo = async () => {
    const empresaId = getEmpresaId()
    const [{ data: cl }, { data: rs }, { data: vs }, { data: pr }, { data: rp }, pm] = await Promise.all([
      supabase.from('clientes').select('id, nombre, telefono, direccion, edificio, apto, barrio, ruta_id, solo_domicilio').eq('estado', true).eq('empresa_id', empresaId).order('nombre'),
      supabase.from('rutas').select('id, nombre').eq('estado', true).eq('empresa_id', empresaId).order('nombre'),
      supabase.from('vendedores').select('id, nombre, ruta_id').eq('estado', true).eq('empresa_id', empresaId),
      supabase.from('productos').select('sku, nombre, precio_venta, orden_despacho').eq('estado', true).neq('tipo', 'materia_prima').eq('empresa_id', empresaId),
      supabase.from('rutas_precios').select('ruta_id, sku, precio_especial').eq('empresa_id', empresaId),
      cargarPromos(empresaId),
    ])
    setClientes(cl || []); setRutas(rs || []); setVendedores(vs || []); setProductos(ordenarPorDespacho(pr || [])); setPreciosRuta(rp || []); setPromos(pm)
    const [{ data: conf }, { data: emp }, { data: cts }] = await Promise.all([
      supabase.from('configuracion').select('parametro, valor').eq('empresa_id', empresaId).in('parametro', ['bodega_direccion', 'domi_ruta_valor', 'domi_ruta_gratis_desde', 'domi_ruta_minimo', 'domi_express_base', 'domi_express_km_incluidos', 'domi_express_km_valor', 'domi_express_tope']),
      supabase.from('empresas').select('nombre, nit, telefono, logo_url').eq('id', empresaId).maybeSingle(),
      supabase.from('cuentas').select('id, nombre, tipo').eq('empresa_id', empresaId),
    ])
    setTarifas(Object.fromEntries((conf || []).map(c => [c.parametro, c.valor])))
    setEmpresa(emp || { nombre: 'Maissy' })
    setCuentas(cts || [])
    cargarLista()
  }

  const cargarLista = async () => {
    const hoy = obtenerFechaActual()
    const { data } = await supabase.from('domicilios').select('*, rutas(nombre), vendedores(nombre), domicilios_detalle(id, sku, nombre, cantidad, subtotal)')
      .eq('empresa_id', getEmpresaId()).or(`fecha.gte.${hoy},estado.eq.pendiente`).order('created_at', { ascending: false })
    setLista(data || [])
  }

  const escoger = async (c) => {
    setCliente(c); setNuevo(null); setBusca(''); setARuta({ activo: false, dias: [] })
    setPedido(p => ({ ...p, ruta_id: c.ruta_id || p.ruta_id, direccion: c.direccion || '' }))
    const [{ data }, { data: rt }] = await Promise.all([
      supabase.from('clientes_precios').select('sku, precio_especial').eq('cliente_id', c.id).eq('empresa_id', getEmpresaId()),
      supabase.from('rutero').select('ruta_id, dia_semana').eq('cliente_id', c.id).eq('empresa_id', getEmpresaId()),
    ])
    setPactados(Object.fromEntries((data || []).map(x => [x.sku, Number(x.precio_especial)])))
    setDiasRutero(rt || [])
  }

  // Lo deja de ultimo en el rutero de esos dias de la ruta.
  const agregarAlRutero = async (clienteId, rutaId, dias) => {
    const empresaId = getEmpresaId()
    for (const d of dias) {
      const { count } = await supabase.from('rutero').select('id', { count: 'exact', head: true }).eq('ruta_id', rutaId).eq('dia_semana', d).eq('empresa_id', empresaId)
      await supabase.from('rutero').insert({ empresa_id: empresaId, cliente_id: clienteId, ruta_id: rutaId, dia_semana: d, orden: (count || 0) + 1 })
    }
  }

  // Mismo precio que vera el vendedor en Mi ruta: pactado del cliente, si no
  // el de la ruta con su promo.
  const productoConPrecio = (sku) => {
    const p = productos.find(x => x.sku === sku)
    if (!p) return null
    if (pactados[sku]) return { ...p, precio: pactados[sku], promo: null }
    const rutaPrecio = pedido.tipo === 'express' ? null : pedido.ruta_id
    const base = Number(preciosRuta.find(r => r.ruta_id === rutaPrecio && r.sku === sku)?.precio_especial ?? p.precio_venta ?? 0)
    const promo = promoVigente(promos, sku, rutaPrecio, pedido.fecha, { sinFecha: true })
    return { ...p, precio: precioConPromo(base, promo), promo }
  }
  const lineas = items.flatMap(it => { const p = productoConPrecio(it.sku); return p ? armarLineas(p, Number(it.cantidad) || 0, p.promo) : [] })
  const totalProductos = lineas.reduce((s, l) => s + l.subtotal, 0)
  // Tarifa: con la ruta no cobra domicilio (el vendedor pasa por ahi) pero
  // el pedido tiene un minimo; express va por
  // km desde la bodega: base hasta X km, mas un valor por km (tope 0 = sin tope).
  const t = (k, d) => Number(tarifas[k] ?? d)
  const tarifaSugerida = pedido.tipo === 'express'
    ? Math.min(t('domi_express_tope', 0) || Infinity, t('domi_express_base', 5000) + Math.max(0, Math.ceil((parseFloat(pedido.km) || 0) - t('domi_express_km_incluidos', 3))) * t('domi_express_km_valor', 1000))
    : (totalProductos >= t('domi_ruta_gratis_desde', 50000) ? 0 : t('domi_ruta_valor', 0))
  const minimoRuta = t('domi_ruta_minimo', 20000)
  const valorDomicilio = feeManual ? (parseFloat(pedido.valor_domicilio) || 0) : tarifaSugerida
  const bodega = tarifas.bodega_direccion || 'Carrera 34A #71-81'
  // A donde se lleva: la direccion de entrega (por defecto la del cliente).
  const direccionEntrega = (pedido.direccion || (nuevo ? nuevo.direccion : '') || '').trim()
  const linkKm = direccionEntrega ? 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + encodeURIComponent(`${direccionNormalizada(bodega)}, Medellín, Antioquia, Colombia`) + '&destination=' + encodeURIComponent(`${direccionNormalizada(direccionEntrega)}, Medellín, Antioquia, Colombia`) : null
  const total = totalProductos + valorDomicilio

  const q = sinTildes(busca).split(/\s+/).filter(Boolean)
  const resultados = q.length ? clientes.filter(c => { const t = sinTildes([c.nombre, c.edificio, c.apto, c.direccion, c.barrio, c.telefono].join(' ')); return q.every(w => t.includes(w)) }).slice(0, 8) : []
  const vendedorDe = (rutaId) => vendedores.find(v => v.ruta_id === rutaId)

  const limpiar = () => { setCliente(null); setNuevo(null); setItems([]); setPactados({}); setDiasRutero([]); setARuta({ activo: false, dias: [] }); setPedido(p => ({ ...p, nota: '', forma_pago: 'efectivo', cuando: p.tipo === 'express' ? 'ya' : 'al_pasar', valor_domicilio: '', km: '', domiciliario: '', direccion: '', paga_con: '' })); setFeeManual(false) }

  const enviar = async () => {
    if (!cliente && !nuevo?.nombre.trim()) { alert('Escoge el cliente o escribe el nombre del nuevo'); return }
    if (lineas.length === 0) { alert('Agrega al menos un producto'); return }
    const express = pedido.tipo === 'express'
    if (!express && !pedido.ruta_id) { alert('Escoge qué ruta lo lleva'); return }
    if (!express && totalProductos < minimoRuta) { alert(`Con la ruta el pedido mínimo es ${fmt(minimoRuta)}. Este va en ${fmt(totalProductos)}: agrega productos o mándalo express.`); return }
    if (!express && aRuta.activo && aRuta.dias.length === 0) { alert('Escoge qué días se le visita, o quita "Agregar a la ruta"'); return }
    setGuardando(true)
    const empresaId = getEmpresaId()
    let c = cliente
    if (!c) {
      const datos = Object.fromEntries(Object.entries(nuevo).map(([k, v]) => [k, v.trim() || null]))
      const deRuta = !express && aRuta.activo
      const { data, error } = await supabase.from('clientes').insert({ ...datos, empresa_id: empresaId, ruta_id: deRuta ? pedido.ruta_id : null, vendedor_id: deRuta ? vendedorDe(pedido.ruta_id)?.id || null : null, estado: true, solo_domicilio: !deRuta })
        .select('id, nombre, telefono, direccion, edificio, apto, barrio, ruta_id').single()
      if (error) { setGuardando(false); alert('No se pudo crear el cliente: ' + error.message); return }
      c = data
    } else if (!express && aRuta.activo) {
      await supabase.from('clientes').update({ solo_domicilio: false, ...(c.ruta_id ? {} : { ruta_id: pedido.ruta_id, vendedor_id: vendedorDe(pedido.ruta_id)?.id || null }) }).eq('id', c.id).eq('empresa_id', empresaId)
    }
    if (!express && aRuta.activo) await agregarAlRutero(c.id, pedido.ruta_id, aRuta.dias)
    const { data: d, error } = await supabase.from('domicilios').insert({
      empresa_id: empresaId, fecha: pedido.fecha, cliente_id: c.id, nombre_cliente: c.nombre,
      telefono: c.telefono, direccion: direccionEntrega || c.direccion, edificio: c.edificio, apto: c.apto, barrio: c.barrio,
      tipo: pedido.tipo, km: express ? parseFloat(pedido.km) || null : null, domiciliario: express ? pedido.domiciliario.trim() || null : null,
      ruta_id: express ? null : pedido.ruta_id, vendedor_id: express ? null : vendedorDe(pedido.ruta_id)?.id || null,
      hora_limite: pedido.cuando === 'antes' ? pedido.hora : null, forma_pago: pedido.forma_pago,
      nota: [express && pedido.forma_pago === 'efectivo' && parseFloat(pedido.paga_con) > total ? `Paga con ${fmt(parseFloat(pedido.paga_con))}: llevar ${fmt(parseFloat(pedido.paga_con) - total)} de vueltas` : null, pedido.nota.trim()].filter(Boolean).join(' · ') || null,
      total, valor_domicilio: valorDomicilio, tomado_por: usuario?.nombre || null,
    }).select('id').single()
    if (error) { setGuardando(false); alert('No se pudo guardar: ' + error.message); return }
    const porSku = {}
    lineas.forEach(l => { const x = (porSku[l.sku] = porSku[l.sku] || { sku: l.sku, nombre: productos.find(p => p.sku === l.sku)?.nombre, cantidad: 0, subtotal: 0 }); x.cantidad += l.cantidad; x.subtotal += l.subtotal })
    await supabase.from('domicilios_detalle').insert(Object.values(porSku).map(x => ({ ...x, domicilio_id: d.id, empresa_id: empresaId })))
    setGuardando(false)
    limpiar()
    if (!cliente || aRuta.activo) cargarTodo(); else cargarLista()
  }

  // Ticket del express: como el de Mi ruta, pero lo manda la oficina (al
  // cliente o al domiciliario, que no tiene Mi ruta).
  const datosTicket = (d) => ({
    empresa: empresa || { nombre: 'Maissy' }, numero: d.numero, created_at: d.created_at, cliente: d.nombre_cliente,
    direccion: [d.edificio, d.apto, d.direccion, d.barrio].filter(Boolean).join(' · '), vendedor: d.tipo === 'express' ? (d.domiciliario || 'Entrega express') : (d.vendedores?.nombre || d.rutas?.nombre || 'Ruta'),
    lineas: (d.domicilios_detalle || []).map(x => ({ sku: x.sku, nombre: x.nombre || x.sku, cantidad: x.cantidad, subtotal: Number(x.subtotal || 0) })),
    total: Number(d.total), valor_domicilio: Number(d.valor_domicilio || 0), forma_pago: d.forma_pago, saldoAnterior: 0,
    telefono: d.telefono || '', observaciones: d.nota || '',
  })
  const enviarTicket = async (d) => {
    const t = datosTicket(d)
    // Cuenta para transferir: la de la ruta, o la del mostrador si es express.
    if (conCuenta(d.forma_pago)) t.cuenta = d.tipo === 'express' || !d.ruta_id ? await cuentaMostrador(getEmpresaId()) : await cuentaDeRuta(d.ruta_id, getEmpresaId())
    const tel = (d.telefono || '').replace(/\D/g, '').slice(-10)
    const wa = (tel.length === 10 ? `https://wa.me/57${tel}` : 'https://wa.me/') + '?text=' + encodeURIComponent(textoTicket(t))
    try {
      const archivo = await imagenTicket(t)
      if (archivo && navigator.canShare?.({ files: [archivo] })) { await navigator.share({ files: [archivo], title: `Domicilio #${d.numero}` }); return }
      if (archivo) { const url = URL.createObjectURL(archivo); const a = document.createElement('a'); a.href = url; a.download = archivo.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000) }
    } catch (e) { if (e?.name === 'AbortError') return }
    window.open(wa, '_blank')
  }

  // Express entregado: se registra como venta de bodega (como Ventas):
  // descuenta inventario y la plata entra a caja/banco, o a cartera si es credito.
  const registrarEntregaExpress = async () => {
    const { d, forma, cuenta_id } = entrega
    const efectivo = cuentas.find(c => c.tipo === 'efectivo')
    if (forma === 'transferencia' && !cuenta_id) { alert('Escoge la cuenta que recibió la transferencia'); return }
    if (forma === 'efectivo' && !efectivo) { alert('No hay cuenta de efectivo configurada'); return }
    setGuardando(true)
    const empresaId = getEmpresaId()
    const fecha = obtenerFechaActual()
    const total = Number(d.total)
    const { data: venta, error } = await supabase.from('ventas_encab').insert({
      empresa_id: empresaId, fecha, cliente_id: d.cliente_id, cliente_nombre: d.nombre_cliente, cliente_telefono: d.telefono || null,
      cliente_direccion: [d.direccion, d.apto, d.barrio].filter(Boolean).join(', ') || null,
      forma_pago: forma === 'credito' ? 'fiado' : forma, cuenta_id: forma === 'transferencia' ? cuenta_id : forma === 'efectivo' ? efectivo.id : null,
      total, valor_recibido: forma === 'efectivo' ? total : null, registrado_por: usuario?.nombre || null, estado: 'confirmada',
      observaciones: `Domicilio express #${d.numero}${Number(d.valor_domicilio) > 0 ? ` · incluye domicilio ${fmt(d.valor_domicilio)}` : ''}${d.domiciliario ? ` · lo llevó ${d.domiciliario}` : ''}`,
    }).select('id').single()
    if (error) { setGuardando(false); alert('No se pudo registrar la venta: ' + error.message); return }
    const det = (d.domicilios_detalle || []).filter(x => Number(x.cantidad) > 0)
    await supabase.from('ventas_detalle').insert(det.map(x => ({ empresa_id: empresaId, venta_id: venta.id, sku: x.sku, cantidad: x.cantidad, precio_unitario: Number(x.subtotal || 0) / Number(x.cantidad), descuento: 0, subtotal: Number(x.subtotal || 0) })))
    const { error: eInv } = await supabase.from('inventario_mov').insert(det.map(x => ({ empresa_id: empresaId, sku: x.sku, cantidad: x.cantidad, fecha, tipo_movimiento: 'salida' })))
    if (eInv) alert('La venta quedó, pero no se descontó el inventario: ' + eInv.message)
    if (forma === 'credito') {
      await supabase.from('cartera_fiados').insert({ empresa_id: empresaId, venta_id: venta.id, cliente_id: d.cliente_id, nombre_cliente: d.nombre_cliente, valor_original: total, saldo: total, fecha_fiado: fecha, estado: 'pendiente' })
    } else {
      await supabase.from('movimientos_tesoreria').insert({ empresa_id: empresaId, cuenta_id: forma === 'efectivo' ? efectivo.id : cuenta_id, fecha, tipo: 'entrada', monto: total, concepto: `Domicilio express #${d.numero} · ${d.nombre_cliente}`, referencia_tipo: 'venta', referencia_id: venta.id })
    }
    await supabase.from('domicilios').update({ estado: 'entregado', venta_encab_id: venta.id, forma_pago: forma, resuelto_at: new Date().toISOString() }).eq('id', d.id).eq('empresa_id', empresaId)
    setGuardando(false)
    setEntrega(null)
    cargarLista()
  }

  const noSePudoExpress = async (d) => {
    const motivo = prompt('¿Por qué no se pudo entregar?') || 'Sin motivo'
    await supabase.from('domicilios').update({ estado: 'no_entregado', motivo, resuelto_at: new Date().toISOString() }).eq('id', d.id).eq('empresa_id', getEmpresaId())
    cargarLista()
  }

  // Ajustar un pedido pendiente (el cliente no deja todo): cantidades nuevas con
  // el mismo precio del pedido (pactado, de la ruta o promo).
  const abrirAjuste = async (d) => {
    const { data } = d.cliente_id ? await supabase.from('clientes_precios').select('sku, precio_especial').eq('cliente_id', d.cliente_id).eq('empresa_id', getEmpresaId()) : { data: [] }
    setAjuste({ d, cant: Object.fromEntries((d.domicilios_detalle || []).map(x => [x.sku, Number(x.cantidad)])), pact: Object.fromEntries((data || []).map(x => [x.sku, Number(x.precio_especial)])) })
  }
  const lineasDe = (a) => Object.entries(a.cant).flatMap(([sku, n]) => {
    const p = productos.find(x => x.sku === sku)
    if (!p || !(n > 0)) return []
    if (a.pact[sku]) return armarLineas({ ...p, precio: a.pact[sku] }, n, null)
    const rutaPrecio = a.d.tipo === 'express' ? null : a.d.ruta_id
    const base = Number(preciosRuta.find(r => r.ruta_id === rutaPrecio && r.sku === sku)?.precio_especial ?? p.precio_venta ?? 0)
    const promo = promoVigente(promos, sku, rutaPrecio, a.d.fecha, { sinFecha: true })
    return armarLineas({ ...p, precio: precioConPromo(base, promo) }, n, promo)
  })
  const guardarAjuste = async () => {
    const { d } = ajuste
    const lineas = lineasDe(ajuste)
    if (!lineas.length) { alert('El pedido quedó sin productos. Si no deja nada, use Cancelar o No se pudo.'); return }
    setGuardando(true)
    const empresaId = getEmpresaId()
    const porSku = {}
    lineas.forEach(l => { const x = (porSku[l.sku] = porSku[l.sku] || { cantidad: 0, subtotal: 0 }); x.cantidad += l.cantidad; x.subtotal += l.subtotal })
    const antes = (d.domicilios_detalle || []).map(x => `${x.cantidad} ${x.nombre || x.sku}`).join(', ')
    for (const x of d.domicilios_detalle || []) {
      const nuevo = porSku[x.sku]
      if (!nuevo) await supabase.from('domicilios_detalle').delete().eq('id', x.id).eq('empresa_id', empresaId)
      else await supabase.from('domicilios_detalle').update({ cantidad: nuevo.cantidad, subtotal: nuevo.subtotal }).eq('id', x.id).eq('empresa_id', empresaId)
    }
    const total = Object.values(porSku).reduce((s, x) => s + x.subtotal, 0) + Number(d.valor_domicilio || 0)
    const { error } = await supabase.from('domicilios').update({ total, nota: [d.nota, `Ajustado: antes ${antes}`].filter(Boolean).join(' · ') }).eq('id', d.id).eq('empresa_id', empresaId)
    setGuardando(false)
    if (error) { alert('No se pudo ajustar: ' + error.message); return }
    setAjuste(null)
    cargarLista()
  }

  const cancelar = async (d) => {
    if (!confirm(`¿Cancelar el domicilio de ${d.nombre_cliente}? Se le quita al vendedor.`)) return
    await supabase.from('domicilios').update({ estado: 'cancelado', resuelto_at: new Date().toISOString() }).eq('id', d.id).eq('empresa_id', getEmpresaId())
    cargarLista()
  }

  if (!usuario) return null
  // Mismo look del boceto y de Mi ruta: fondo crema, tarjetas blancas, Bricolage en titulos y cifras.
  const TINTA = '#1C1B19', GRIS = '#5A5750', FONDO = '#F3F1EA', LINEA = '#E3E1D8'
  const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
  const campo = 'block w-full min-w-0 max-w-full border-2 rounded-xl px-3 min-h-[46px] text-[15px] bg-white focus:outline-none focus:border-[#1C1B19]'
  const etiqueta = 'flex flex-col gap-1.5 min-w-0 text-[13px] font-bold'
  const pendientes = lista.filter(d => d.estado === 'pendiente').length
  const detalleDe = (c) => [c.edificio, c.apto, c.direccion, c.barrio].filter(Boolean).filter(t => !c.nombre.includes(t)).join(' · ')
  const PILL = { pendiente: { color: GRIS, background: FONDO }, entregado: { color: '#2E5E3A', background: '#E6F0E8' }, no_entregado: { color: '#8E1117', background: '#FBE9E9' }, cancelado: { color: '#9A968C', background: FONDO, textDecoration: 'line-through' } }
  const rutaSel = rutas.find(r => r.id === pedido.ruta_id)

  return (
    <div style={{ background: FONDO, color: TINTA, minHeight: '100vh' }}>
      <PageHeader title="Domicilios" />
      <div className="p-4 max-w-6xl mx-auto grid gap-4 md:grid-cols-2 items-start">
        <div className="bg-white rounded-[20px] p-[18px] flex flex-col gap-3.5 min-w-0">
          <p className="font-extrabold text-[22px]" style={titulo}>Tomar pedido</p>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Tipo de domicilio">
            {[['ruta', 'Con la ruta', 'Lo lleva el vendedor'], ['express', 'Entrega express', 'Domiciliario aparte']].map(([v, tt, sub]) => (
              <button key={v} type="button" onClick={() => { setPedido({ ...pedido, tipo: v, cuando: v === 'express' ? 'ya' : 'al_pasar' }); setFeeManual(false) }} aria-pressed={pedido.tipo === v}
                className="rounded-xl px-3 py-2.5 text-left border-2" style={pedido.tipo === v ? { background: '#fff', color: TINTA, borderColor: TINTA } : { borderColor: LINEA }}>
                <span className="block font-bold text-[15px]">{tt}</span><span className="block text-xs opacity-80">{sub}</span>
              </button>
            ))}
          </div>

          {!cliente && !nuevo && (
            <>
              <label className={etiqueta} style={{ color: GRIS }}>Cliente
                <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nombre, apto, edificio, barrio o teléfono" className={campo} style={{ borderColor: busca ? TINTA : LINEA, color: TINTA, fontWeight: 400 }} autoFocus />
              </label>
              {resultados.length > 0 && (
                <div className="border rounded-xl overflow-hidden" style={{ borderColor: LINEA }}>
                  {resultados.map((c, i) => (
                    <button key={c.id} onClick={() => escoger(c)} className="w-full text-left px-3 py-2.5 flex justify-between gap-3 text-sm hover:bg-[#FFF4CC]" style={i ? { borderTop: `1px solid ${LINEA}` } : undefined}>
                      <span className="min-w-0"><b>{c.nombre}</b> <span style={{ color: GRIS }}>{detalleDe(c)}</span></span>
                      <span className="text-xs shrink-0" style={{ color: GRIS }}>{c.solo_domicilio ? 'Solo domicilio' : rutas.find(r => r.id === c.ruta_id)?.nombre || 'Sin ruta'}</span>
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setNuevo({ ...NUEVO, nombre: busca })} className="self-start text-sm font-bold text-brand">+ Cliente nuevo</button>
            </>
          )}

          {cliente && (
            <div className="rounded-xl px-3 py-2.5 flex justify-between gap-3 text-sm" style={{ background: '#FFF4CC' }}>
              <span className="min-w-0"><b>{cliente.nombre}</b> <span style={{ color: GRIS }}>{detalleDe(cliente)}{cliente.telefono ? ` · ${cliente.telefono}` : ''}</span>
                {Object.keys(pactados).length > 0 && <span className="block text-xs font-bold" style={{ color: '#8A5A00' }}>Tiene descuento: se le cobra su precio pactado</span>}
              </span>
              <button onClick={() => { setCliente(null); setPactados({}) }} className="text-xs font-bold shrink-0 text-brand">Cambiar</button>
            </div>
          )}

          {nuevo && (
            <div className="rounded-xl p-3 flex flex-col gap-2 border" style={{ borderColor: LINEA }}>
              <div className="flex justify-between items-center"><p className="text-sm font-bold">Cliente nuevo</p><button onClick={() => setNuevo(null)} className="text-xs font-bold text-brand">Buscar otro</button></div>
              <input value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Nombre" className={campo} style={{ borderColor: LINEA }} />
              <div className="grid grid-cols-2 gap-2">
                {[['telefono', 'Teléfono'], ['direccion', 'Dirección'], ['edificio', 'Edificio o negocio'], ['apto', 'Apto / piso'], ['barrio', 'Barrio']].map(([k, t]) => (
                  <input key={k} value={nuevo[k]} onChange={e => setNuevo({ ...nuevo, [k]: e.target.value })} placeholder={t} inputMode={k === 'telefono' ? 'tel' : undefined} className={campo} style={{ borderColor: LINEA }} />
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-bold" style={{ color: GRIS }}>Productos</p>
            {items.map((it, i) => {
              const p = productoConPrecio(it.sku)
              const ls = p ? armarLineas(p, Number(it.cantidad) || 0, p.promo) : []
              const paq = ls.find(l => l.paquetes)?.paquetes
              return (
                <div key={it.sku} className="flex items-center gap-2 text-[15px]">
                  <span className="flex-1 min-w-0">{p?.nombre || it.sku}
                    {paq ? <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color: '#2E5E3A', background: '#E6F0E8' }}>= {paq} promo{paq > 1 ? 's' : ''}</span> : null}
                    {pactados[it.sku] ? <span className="ml-2 text-xs font-bold" style={{ color: '#8A5A00' }}>pactado</span> : null}
                  </span>
                  <input type="number" min="0" step={pasoDe(it.sku)} inputMode={pasoDe(it.sku) < 1 ? 'decimal' : 'numeric'} value={it.cantidad} onFocus={e => e.target.select()} aria-label={`Cantidad de ${p?.nombre || it.sku}`}
                    onChange={e => setItems(items.map((x, j) => j === i ? { ...x, cantidad: e.target.value } : x))}
                    className="w-16 border-2 rounded-[10px] py-2 text-center font-bold" style={{ borderColor: LINEA }} />
                  <b className="w-20 text-right tabular-nums">{fmt(ls.reduce((s, l) => s + l.subtotal, 0))}</b>
                  <button onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Quitar" style={{ color: GRIS }}>✕</button>
                </div>
              )
            })}
            <select value={agregar} onChange={e => { const sku = e.target.value; if (sku && !items.some(x => x.sku === sku)) setItems([...items, { sku, cantidad: '1' }]); setAgregar('') }} className={campo + ' font-bold text-brand'} style={{ borderColor: LINEA }}>
              <option value="">+ Agregar producto</option>
              {productos.filter(p => !items.some(x => x.sku === p.sku)).map(p => <option key={p.sku} value={p.sku}>{p.nombre}</option>)}
            </select>
          </div>

          <label className={etiqueta} style={{ color: GRIS }}>Dirección de entrega
            <input value={pedido.direccion || (nuevo ? nuevo.direccion : '')} onChange={e => setPedido({ ...pedido, direccion: e.target.value })}
              placeholder={cliente || nuevo ? 'Escribe la dirección (ej: Carrera 67B #48D-67)' : 'Primero escoge el cliente'} className={campo} style={{ borderColor: LINEA, color: TINTA, fontWeight: 400 }} />
            <span className="font-normal text-xs">{cliente && pedido.direccion && pedido.direccion !== cliente.direccion ? 'Se entrega en otra dirección (la del cliente no cambia).' : 'Es la del cliente; cámbiala si la entrega es en otro lado.'}</span>
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <label className={etiqueta} style={{ color: GRIS }}>Fecha
              <CampoFecha value={pedido.fecha} onChange={e => setPedido({ ...pedido, fecha: e.target.value })} className={campo} style={{ borderColor: LINEA, color: TINTA }} />
            </label>
            <label className={etiqueta} style={{ color: GRIS }}>¿Para cuándo?
              <select value={pedido.cuando} onChange={e => setPedido({ ...pedido, cuando: e.target.value })} className={campo} style={{ borderColor: LINEA, color: TINTA }}>
                {pedido.tipo === 'express' ? <option value="ya">Lo antes posible</option> : <option value="al_pasar">Cuando pase</option>}
                <option value="antes">Antes de una hora</option>
              </select>
            </label>
            {pedido.cuando === 'antes' && (
              <label className={etiqueta + ' col-span-2'} style={{ color: GRIS }}>Antes de las
                <input type="time" value={pedido.hora} onChange={e => setPedido({ ...pedido, hora: e.target.value })} className={campo} style={{ borderColor: LINEA, color: TINTA }} />
              </label>
            )}
            <label className={etiqueta} style={{ color: GRIS }}>Paga con
              <select value={pedido.forma_pago} onChange={e => setPedido({ ...pedido, forma_pago: e.target.value })} className={campo} style={{ borderColor: LINEA, color: TINTA }}>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="credito">Crédito</option>
              </select>
            </label>
            {pedido.tipo === 'ruta' ? (
              <label className={etiqueta} style={{ color: GRIS }}>Lo lleva la ruta
                <select value={pedido.ruta_id} onChange={e => setPedido({ ...pedido, ruta_id: e.target.value })} className={campo} style={{ borderColor: LINEA, color: TINTA }}>
                  <option value="">Escoge</option>
                  {rutas.map(r => <option key={r.id} value={r.id}>{r.nombre}{vendedorDe(r.id) ? ` · ${vendedorDe(r.id).nombre}` : ''}</option>)}
                </select>
              </label>
            ) : (
              <label className={etiqueta} style={{ color: GRIS }}>Lo lleva
                <input value={pedido.domiciliario} onChange={e => setPedido({ ...pedido, domiciliario: e.target.value })} placeholder="Domiciliario" className={campo} style={{ borderColor: LINEA, color: TINTA, fontWeight: 400 }} />
              </label>
            )}
            {pedido.tipo === 'express' && (
              <label className={etiqueta + ' col-span-2'} style={{ color: GRIS }}>Km desde la bodega
                <div className="flex gap-2">
                  <input type="number" inputMode="decimal" min="0" step="0.1" value={pedido.km} onChange={e => { setPedido({ ...pedido, km: e.target.value }); setFeeManual(false) }} placeholder="Ej: 6.5" className={campo} style={{ borderColor: LINEA, color: TINTA }} />
                  {linkKm
                    ? <a href={linkKm} target="_blank" rel="noreferrer" className="shrink-0 px-3 rounded-xl font-bold text-sm flex items-center" style={{ background: FONDO, color: TINTA }}>Ver km en Maps</a>
                    : <span className="shrink-0 px-3 rounded-xl text-xs flex items-center" style={{ background: FONDO }}>Pon la dirección de entrega</span>}
                </div>
                <span className="font-normal text-xs">Desde {bodega} hasta la dirección de entrega: use «Ver km en Maps» y registre los km. Base {fmt(t('domi_express_base', 5000))} hasta {t('domi_express_km_incluidos', 3)} km, {fmt(t('domi_express_km_valor', 1000))} por km adicional{t('domi_express_tope', 0) ? `, tope ${fmt(t('domi_express_tope', 0))}` : ''}.</span>
              </label>
            )}
          </div>
          <label className={etiqueta} style={{ color: GRIS }}>Valor del domicilio
            <InputDinero value={feeManual ? pedido.valor_domicilio : String(tarifaSugerida)} onChange={e => { setFeeManual(true); setPedido({ ...pedido, valor_domicilio: e.target.value }) }} placeholder="0 si no se cobra" className={campo} style={{ borderColor: LINEA, color: TINTA }} />
            <span className="font-normal text-xs">{feeManual ? <>Lo pusiste a mano · <button type="button" onClick={() => setFeeManual(false)} className="underline font-bold">usar la tarifa ({fmt(tarifaSugerida)})</button></> : pedido.tipo === 'express' ? 'Calculado por km.' : tarifaSugerida === 0 ? `Con la ruta no se cobra domicilio · pedido mínimo ${fmt(minimoRuta)}.` : `Tarifa con la ruta · pedido mínimo ${fmt(minimoRuta)}.`}</span>
          </label>
          {items.length > 0 && (
            <div className="rounded-xl px-3 py-2.5 text-sm flex flex-col gap-1" style={{ background: FONDO }}>
              <div className="flex justify-between"><span>Productos</span><b className="tabular-nums">{fmt(totalProductos)}</b></div>
              <div className="flex justify-between"><span>Domicilio</span><b className="tabular-nums">{fmt(valorDomicilio)}</b></div>
              <div className="flex justify-between pt-1 border-t" style={{ borderColor: LINEA }}><span className="font-bold">Total a cobrar</span><b className="tabular-nums text-base" style={titulo}>{fmt(total)}</b></div>
            </div>
          )}
          {pedido.tipo === 'express' && pedido.forma_pago === 'efectivo' && (
            <label className={etiqueta} style={{ color: GRIS }}>¿Con cuánto paga?
              <InputDinero value={pedido.paga_con} onChange={e => setPedido({ ...pedido, paga_con: e.target.value })} placeholder="Ej: 50.000 (para llevar las vueltas)" className={campo} style={{ borderColor: LINEA, color: TINTA }} />
              {parseFloat(pedido.paga_con) > 0 && <span className="font-normal text-xs">{parseFloat(pedido.paga_con) >= total ? <>Llevar <b>{fmt(parseFloat(pedido.paga_con) - total)}</b> de vueltas.</> : <b style={{ color: '#8E1117' }}>Es menos que el total ({fmt(total)}).</b>}</span>}
            </label>
          )}
          {/* Observaciones de la entrega: las ve quien lleva el pedido (vendedor en Mi ruta o domiciliario). */}
          <div className={etiqueta} style={{ color: GRIS }}>
            <label htmlFor="obs-entrega">Observaciones de la entrega</label>
            <div className="flex flex-wrap gap-1.5">
              {['Llamar al llegar', 'Dejar en portería', 'Timbrar', 'Subir al apto', 'Torre / interior', 'Referencia: '].map(o => (
                <button key={o} type="button" onClick={() => setPedido({ ...pedido, nota: [pedido.nota.trim(), o].filter(Boolean).join(pedido.nota.trim() ? ' · ' : '') })}
                  className="px-2.5 min-h-[34px] rounded-lg text-xs font-bold" style={{ background: FONDO, color: TINTA }}>+ {o.replace(': ', '')}</button>
              ))}
            </div>
            <textarea id="obs-entrega" rows={3} value={pedido.nota} onChange={e => setPedido({ ...pedido, nota: e.target.value })}
              placeholder="Torre 2 apto 1203, timbrar al 401, el portero recibe, tiene perro, al lado de la panadería…"
              className={campo + ' py-2.5 resize-y'} style={{ borderColor: LINEA, color: TINTA, fontWeight: 400 }} />
            <span className="font-normal text-xs">Las ve {pedido.tipo === 'express' ? 'el domiciliario en el ticket' : 'el vendedor en Mi ruta'}.</span>
          </div>
          {pedido.tipo === 'ruta' && rutaSel && (
            <div className="rounded-xl px-3 py-2.5 text-sm" style={{ background: FONDO }}>
              Lo lleva <b>{vendedorDe(rutaSel.id)?.nombre || 'el vendedor'}</b> · {rutaSel.nombre}{cliente?.ruta_id === rutaSel.id ? ' (la del cliente)' : ''}
            </div>
          )}
          {pedido.tipo === 'ruta' && (cliente || nuevo) && pedido.ruta_id && (() => {
            const yaDias = diasRutero.filter(r => r.ruta_id === pedido.ruta_id).map(r => DIAS.find(d => d.n === r.dia_semana)?.corto).filter(Boolean)
            if (cliente && yaDias.length) return <p className="text-xs" style={{ color: GRIS }}>Ya está en el rutero de esta ruta: {yaDias.join(', ')}.</p>
            return (
              <div className="rounded-xl border-2 p-3" style={{ borderColor: aRuta.activo ? TINTA : LINEA }}>
                <label className="flex items-center gap-2 text-sm font-bold">
                  <input type="checkbox" checked={aRuta.activo} onChange={e => setARuta({ ...aRuta, activo: e.target.checked })} className="w-5 h-5 accent-[#1C1B19]" />
                  Agregar a la ruta {rutaSel?.nombre}
                </label>
                {!aRuta.activo
                  ? <p className="text-xs mt-1" style={{ color: GRIS }}>Si no lo marcas, queda como <b>solo domicilio</b>: se guarda aparte para encontrarlo después, sin entrar al rutero.</p>
                  : (
                    <div className="mt-2">
                      <p className="text-xs mb-1.5" style={{ color: GRIS }}>¿Qué días se le visita? Entra de último en el rutero de esos días.</p>
                      <div className="flex flex-wrap gap-1.5">
                        {DIAS.map(d => {
                          const on = aRuta.dias.includes(d.n)
                          return <button key={d.n} type="button" onClick={() => setARuta({ ...aRuta, dias: on ? aRuta.dias.filter(x => x !== d.n) : [...aRuta.dias, d.n] })} aria-pressed={on}
                            className="px-3 min-h-[38px] rounded-xl text-sm font-bold" style={on ? { background: '#fff', color: TINTA, boxShadow: `inset 0 0 0 2px ${TINTA}` } : { background: FONDO }}>{d.corto}</button>
                        })}
                      </div>
                    </div>
                  )}
              </div>
            )
          })()}
          <button onClick={enviar} disabled={guardando} className="min-h-[54px] rounded-2xl bg-brand text-white font-bold text-base disabled:opacity-50">
            {guardando ? 'Enviando...' : pedido.tipo === 'ruta' && items.length > 0 && totalProductos < minimoRuta ? `Pedido mínimo ${fmt(minimoRuta)} · faltan ${fmt(minimoRuta - totalProductos)}` : pedido.tipo === 'express' ? `Guardar express · ${fmt(total)}` : `Enviar a Mi ruta · ${fmt(total)}`}
          </button>
        </div>

        <div className="bg-white rounded-[20px] p-[18px] min-w-0">
          <div className="flex justify-between items-center gap-2">
            <p className="font-extrabold text-[22px]" style={titulo}>Domicilios de hoy</p>
            <button onClick={cargarLista} className="text-sm font-bold px-3 min-h-[40px] rounded-xl" style={{ background: FONDO }}>Actualizar</button>
          </div>
          <p className="text-sm mb-2" style={{ color: GRIS }}>{lista.length} hoy · {pendientes} por entregar</p>
          {lista.length === 0 && <p className="text-sm py-6 text-center" style={{ color: GRIS }}>Todavía no hay domicilios hoy</p>}
          <div>
            {lista.map((d, i) => (
              <div key={d.id} className="py-3 grid grid-cols-[52px_1fr_auto] gap-2.5 items-start text-sm" style={i ? { borderTop: `1px solid #EFEDE6` } : undefined}>
                <span className="tabular-nums" style={{ color: GRIS }}>{hora(d.created_at)}</span>
                <div className="min-w-0">
                  <p><b>{d.nombre_cliente}</b> <span style={{ color: GRIS }}>· {d.tipo === 'express' ? <b style={{ color: '#C41230' }}>Express{d.km ? ` ${d.km} km` : ''}{d.domiciliario ? ` · ${d.domiciliario}` : ''}</b> : <>{d.rutas?.nombre}{d.vendedores?.nombre ? ` · ${d.vendedores.nombre}` : ''}</>}</span></p>
                  <p style={{ color: GRIS }}>{(d.domicilios_detalle || []).map(x => `${x.cantidad} ${x.nombre || x.sku}`).join(' · ')}{Number(d.valor_domicilio) > 0 ? ` · domicilio ${fmt(d.valor_domicilio)}` : ''} · <b style={{ color: TINTA }}>{fmt(d.total)}</b></p>
                  <p className="text-xs mt-0.5" style={{ color: '#9A968C' }}>{d.fecha !== obtenerFechaActual() ? `Para el ${d.fecha} · ` : ''}{d.hora_limite ? `antes de ${d.hora_limite.slice(0, 5)}` : d.tipo === 'express' ? 'lo antes posible' : 'cuando pase'}{d.nota ? ` · ${d.nota}` : ''} · {d.forma_pago}{d.tomado_por ? ` · lo tomó ${d.tomado_por}` : ''}{d.motivo ? ` · ${d.motivo}` : ''}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs font-bold px-2.5 py-1.5 rounded-full whitespace-nowrap" style={PILL[d.estado]}>{ESTADO[d.estado][0]}{d.estado === 'entregado' && d.resuelto_at ? ' ' + hora(d.resuelto_at) : ''}</span>
                  <button onClick={() => setVerDom(verDom === d.id ? null : d.id)} className="text-xs font-bold underline" style={{ color: TINTA }}>{verDom === d.id ? 'Ocultar detalle' : 'Ver detalle'}</button>
                  {d.estado === 'pendiente' && <button onClick={() => abrirAjuste(d)} className="text-xs font-bold underline" style={{ color: TINTA }}>Ajustar pedido</button>}
                  {d.estado === 'pendiente' && <button onClick={() => cancelar(d)} className="text-xs underline" style={{ color: GRIS }}>Cancelar</button>}
                </div>
                {verDom === d.id && (
                  <div className="col-span-3 rounded-xl p-3 flex flex-col gap-1.5 text-sm" style={{ background: FONDO }}>
                    <div className="flex justify-between gap-2 flex-wrap"><b>Domicilio #{d.numero} · {d.nombre_cliente}</b><span style={{ color: GRIS }}>{d.fecha}{d.hora_limite ? ` · antes de ${d.hora_limite.slice(0, 5)}` : ''}</span></div>
                    {[d.telefono && `Teléfono ${d.telefono}`, [d.direccion, d.apto, d.barrio].filter(Boolean).join(', ')].filter(Boolean).map((x, i) => <span key={i} style={{ color: GRIS }}>{x}</span>)}
                    <div className="flex flex-col pt-1" style={{ borderTop: `1px solid ${LINEA}` }}>
                      {(d.domicilios_detalle || []).map(x => <div key={x.sku} className="flex justify-between gap-2 py-1"><span>{x.cantidad} × {x.nombre || x.sku}</span><b className="tabular-nums">{fmt(x.subtotal)}</b></div>)}
                      {Number(d.valor_domicilio) > 0 && <div className="flex justify-between gap-2 py-1"><span>Domicilio</span><b className="tabular-nums">{fmt(d.valor_domicilio)}</b></div>}
                      <div className="flex justify-between gap-2 py-1 font-bold" style={{ borderTop: `1.5px solid ${TINTA}` }}><span>Total · {d.forma_pago}</span><span className="tabular-nums">{fmt(d.total)}</span></div>
                    </div>
                    <span style={{ color: GRIS }}>{d.tipo === 'express' ? `Express${d.domiciliario ? ` · lo lleva ${d.domiciliario}` : ''}` : `Con la ruta ${d.rutas?.nombre || ''}${d.vendedores?.nombre ? ` · ${d.vendedores.nombre}` : ''}`}{d.tomado_por ? ` · lo tomó ${d.tomado_por}` : ''}</span>
                    {d.nota && <span>Nota: {d.nota}</span>}
                    {d.motivo && <span style={{ color: '#8E1117' }}>Motivo: {d.motivo}</span>}
                    <div className="flex gap-2 pt-1"><button onClick={() => enviarTicket(d)} className="min-h-[40px] px-4 rounded-xl font-bold text-sm" style={{ background: '#25D366', color: '#0B2E17' }}>Enviar ticket</button></div>
                  </div>
                )}
                {ajuste?.d.id === d.id && (
                  <div className="col-span-3 rounded-xl p-3 flex flex-col gap-2" style={{ background: FONDO }}>
                    <p className="text-sm font-bold">Ajustar el pedido de {d.nombre_cliente}: deje solo lo que sí recibe.</p>
                    {(d.domicilios_detalle || []).map(x => {
                      const n = ajuste.cant[x.sku] || 0
                      const sub = lineasDe({ ...ajuste, cant: { [x.sku]: n } }).reduce((s, l) => s + l.subtotal, 0)
                      return (
                        <div key={x.sku} className="flex items-center gap-2 text-sm">
                          <span className="flex-1 min-w-0">{x.nombre || x.sku}</span>
                          <div className="flex items-center rounded-xl bg-white">
                            <button type="button" onClick={() => setAjuste({ ...ajuste, cant: { ...ajuste.cant, [x.sku]: sumarPaso(n, x.sku, -1) } })} aria-label={`Quitar un ${x.nombre}`} className="w-10 h-10 text-xl font-bold">−</button>
                            <input inputMode="decimal" value={textoCantidad(n)} onChange={e => setAjuste({ ...ajuste, cant: { ...ajuste.cant, [x.sku]: leerCantidad(e.target.value, x.sku) } })} aria-label={`Cantidad de ${x.nombre}`} className="w-12 text-center font-bold bg-transparent" />
                            <button type="button" onClick={() => setAjuste({ ...ajuste, cant: { ...ajuste.cant, [x.sku]: sumarPaso(n, x.sku, 1) } })} aria-label={`Agregar un ${x.nombre}`} className="w-10 h-10 text-xl font-bold">+</button>
                          </div>
                          <b className="w-24 text-right tabular-nums">{fmt(sub)}</b>
                        </div>
                      )
                    })}
                    <p className="text-sm text-right">Nuevo total {Number(d.valor_domicilio) > 0 ? `con domicilio ` : ''}<b>{fmt(lineasDe(ajuste).reduce((s, l) => s + l.subtotal, 0) + Number(d.valor_domicilio || 0))}</b> · antes {fmt(d.total)}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => setAjuste(null)} className="min-h-[42px] rounded-xl font-bold text-sm bg-white">Cancelar</button>
                      <button onClick={guardarAjuste} disabled={guardando} className="min-h-[42px] rounded-xl font-bold text-sm text-white disabled:opacity-50" style={{ background: TINTA }}>{guardando ? 'Guardando...' : 'Guardar ajuste'}</button>
                    </div>
                  </div>
                )}
                {d.tipo === 'express' && d.estado === 'pendiente' && (
                  <div className="col-span-3 flex flex-col gap-2">
                    {entrega?.d.id !== d.id ? (
                      <div className="grid grid-cols-3 gap-2">
                        <button onClick={() => enviarTicket(d)} className="min-h-[42px] rounded-xl font-bold text-sm" style={{ background: '#25D366', color: '#0B2E17' }}>Ticket</button>
                        <button onClick={() => setEntrega({ d, forma: d.forma_pago, cuenta_id: '' })} className="min-h-[42px] rounded-xl font-bold text-sm text-white" style={{ background: '#2E5E3A' }}>Entregado</button>
                        <button onClick={() => noSePudoExpress(d)} className="min-h-[42px] rounded-xl font-bold text-sm" style={{ background: '#FBE9E9', color: '#8E1117' }}>No se pudo</button>
                      </div>
                    ) : (
                      <div className="rounded-xl p-3 flex flex-col gap-2" style={{ background: FONDO }}>
                        <p className="text-sm font-bold">¿Cómo pagó {fmt(d.total)}? Se registra como venta y sale de bodega.</p>
                        <div className="grid grid-cols-3 gap-2">
                          {[['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['credito', 'Crédito']].map(([f, tt]) => (
                            <button key={f} type="button" onClick={() => setEntrega({ ...entrega, forma: f })} aria-pressed={entrega.forma === f}
                              className="min-h-[40px] rounded-xl font-bold text-sm" style={entrega.forma === f ? { background: '#fff', color: TINTA, boxShadow: `inset 0 0 0 2px ${TINTA}` } : { background: '#fff' }}>{tt}</button>
                          ))}
                        </div>
                        {entrega.forma === 'transferencia' && (
                          <select value={entrega.cuenta_id} onChange={e => setEntrega({ ...entrega, cuenta_id: e.target.value })} className={campo} style={{ borderColor: LINEA }}>
                            <option value="">¿A qué cuenta llegó?</option>
                            {cuentas.filter(c => c.tipo !== 'efectivo').map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                          </select>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => setEntrega(null)} className="min-h-[42px] rounded-xl font-bold text-sm bg-white">Cancelar</button>
                          <button onClick={registrarEntregaExpress} disabled={guardando} className="min-h-[42px] rounded-xl font-bold text-sm text-white disabled:opacity-50" style={{ background: '#2E5E3A' }}>{guardando ? 'Guardando...' : 'Confirmar entrega'}</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
