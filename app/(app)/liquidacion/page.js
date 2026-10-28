'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { inicioDelRol } from '@/lib/navegacion'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { crearAlertaAdmin } from '@/lib/alertas-admin'
import { puedeVerModulo } from '@/lib/permisos'
import { PageHeader } from '@/components/ui'
import { verSoporte } from '@/lib/soportes'
import ComprobantesTransferencia, { totalesComprobantes, comprobanteDesdeFila, comprobanteEditable, sincronizarPagoTransferencia, ligarPagosConComprobantes } from '@/components/ComprobantesTransferencia'
import InputDinero from '@/components/InputDinero'
import { proveedorParaReponer } from '@/lib/inventario-helpers'
import { ordenarPorDespacho } from '@/lib/orden-productos'
import { cargarPromos, promoVigente, precioConPromo, valorVendido, ticketsPorSku } from '@/lib/promociones'

const UMBRAL_ALERTA_DIFERENCIA = 50000
const AUTORIZADORES_OBSEQUIOS = ['Jero', 'Kathe']

export default function Liquidacion() {
  const [usuario, setUsuario] = useState(null)
  const [vendedores, setVendedores] = useState([])
  const [despachos, setDespachos] = useState([])
  const [despachoSel, setDespachoSel] = useState(null)
  const [grupoDespachoIds, setGrupoDespachoIds] = useState([])
  const [gruposExpandidos, setGruposExpandidos] = useState(new Set())
  const [detalle, setDetalle] = useState([])
  const [transRecibidas, setTransRecibidas] = useState([])
  const [transEnviadasHoy, setTransEnviadasHoy] = useState([])
  const [productosMap, setProductosMap] = useState({})
  const [base, setBase] = useState(0)
  const [devoluciones, setDevoluciones] = useState({})
  const [cambios, setCambios] = useState({})
  const [efectivo, setEfectivo] = useState('')
  // Transferencias comprobante por comprobante: solo las verificadas cuentan
  // como plata entregada; las "por verificar" quedan como deuda del vendedor.
  const [comprobantes, setComprobantes] = useState([])
  const [fiados, setFiados] = useState([{ nombre: '', valor: '', fecha_pago: '', cartera_fiados_id: '' }])
  const [pagosFiados, setPagosFiados] = useState([{ cartera_fiados_id: '', nombre_manual: '', valor: '' }])
  const [fiadosPendientes, setFiadosPendientes] = useState([])
  // Clientes de la ruta, para fiar escogiendo el cliente (queda ligado a su cartera).
  const [clientesRuta, setClientesRuta] = useState([])
  const opcionCliente = (c) => [c.nombre, [c.edificio, c.apto].filter(Boolean).filter(t => !c.nombre.includes(t)).join(' ')].filter(Boolean).join(' · ')
  const clienteDeOpcion = (texto) => clientesRuta.find(c => opcionCliente(c).toLowerCase() === (texto || '').trim().toLowerCase())
  const CATEGORIAS_GASTOS = ['Gasolina', 'Viaticos', 'Prestamo al vendedor', 'Bolsas', 'Parqueadero', 'Otro']
  const [gastos, setGastos] = useState([{ categoria: '', concepto: '', valor: '' }])
  const [descuentos, setDescuentos] = useState([{ sku: '', concepto: '', valor: '' }])
  const [obsequios, setObsequios] = useState([{ sku: '', cantidad: '', autorizado_por: '' }])
  const [consumoPropio, setConsumoPropio] = useState([{ sku: '', cantidad: '' }])
  // momento: 'ruta' = lo entrego durante el recorrido (sale de lo vendido);
  // 'devolucion' = al llegar, de lo que trajo de vuelta (sale de la devolucion).
  const [mercEnviada, setMercEnviada] = useState([{ vendedor_id: '', sku: '', cantidad: '', momento: 'ruta' }])
  const [paso, setPaso] = useState(1)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [cargadoDeKiosco, setCargadoDeKiosco] = useState(false)
  // Liquidacion que el vendedor envio desde el kiosco y espera aprobacion.
  const [borrador, setBorrador] = useState(null)
  const [ventasRuta, setVentasRuta] = useState([])
  const [fechaLiquidados, setFechaLiquidados] = useState(obtenerFechaActual())
  const [nuevoRecibo, setNuevoRecibo] = useState({ vendedor_id: '', sku: '', cantidad: '' })
  const [guardandoRecibo, setGuardandoRecibo] = useState(false)
  const [errorRecibo, setErrorRecibo] = useState('')
  const [pendientesComoOrigen, setPendientesComoOrigen] = useState([])
  const [pendientesComoDestino, setPendientesComoDestino] = useState([])
  const [procesandoConfirmacion, setProcesandoConfirmacion] = useState(false)
  // Bandeja: lo que declaro el vendedor (por aprobar) y como quedaron las liquidadas.
  const [infoBandeja, setInfoBandeja] = useState({ borr: {}, liq: {} })
  const [pestana, setPestana] = useState('devolucion')
  const [abiertas, setAbiertas] = useState(new Set())
  const [verRecibo, setVerRecibo] = useState(false)
  const [sinEmpleado, setSinEmpleado] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (!puedeVerModulo(parsed, 'liquidacion', ['admin', 'auxiliar'])) { router.push('/kiosco'); return }
    setUsuario(parsed)
    cargarDespachos(obtenerFechaActual())
    cargarVendedores()
  }, [])

  const cargarVendedores = async () => {
    const { data } = await supabase.from('vendedores').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    if (data) setVendedores(data)
  }

  // El vendedor que se esta liquidando aca no tiene sesion propia de Kiosco, asi que el
  // admin/auxiliar confirma o rechaza en su nombre las transferencias pendientes -- mismo
  // patron de app/kiosco/page.js (cargarPendientesConfirmar / cargarPendientesConfirmarComoDestino).
  const cargarPendientesComoOrigen = async (vendId) => {
    const { data } = await supabase.from('transferencias_mercancia').select('*, destino:vendedor_destino_id(nombre)')
      .eq('vendedor_origen_id', vendId).eq('origen_registro', 'receptor').eq('estado', 'pendiente_confirmacion')
      .eq('empresa_id', getEmpresaId()).order('created_at', { ascending: true })
    setPendientesComoOrigen(data || [])
  }

  const cargarPendientesComoDestino = async (vendId) => {
    const { data } = await supabase.from('transferencias_mercancia').select('*, origen:vendedor_origen_id(nombre)')
      .eq('vendedor_destino_id', vendId).eq('origen_registro', 'emisor').eq('estado', 'pendiente_confirmacion')
      .eq('empresa_id', getEmpresaId()).order('created_at', { ascending: true })
    setPendientesComoDestino(data || [])
  }

  const confirmarPendiente = async (t, esOrigen) => {
    setProcesandoConfirmacion(true)
    const { error } = await supabase.from('transferencias_mercancia').update({ estado: 'aplicada' }).eq('id', t.id).eq('empresa_id', getEmpresaId())
    setProcesandoConfirmacion(false)
    if (error) { alert('Error: ' + error.message); return }
    if (esOrigen) setPendientesComoOrigen(prev => prev.filter(p => p.id !== t.id))
    else setPendientesComoDestino(prev => prev.filter(p => p.id !== t.id))
    seleccionarDespacho(despachoSel)
  }

  const rechazarPendiente = async (t, esOrigen) => {
    setProcesandoConfirmacion(true)
    const empresaId = getEmpresaId()
    const { error } = await supabase.from('transferencias_mercancia').update({ estado: 'rechazada' }).eq('id', t.id).eq('empresa_id', empresaId)
    if (error) { alert('Error: ' + error.message); setProcesandoConfirmacion(false); return }
    const nombreProd = productosMap[t.sku]?.nombre || t.sku
    const mensaje = esOrigen
      ? `${despachoSel?.vendedores?.nombre || 'Un vendedor'} rechazo la transferencia de ${t.cantidad} ${nombreProd} que ${t.destino?.nombre || 'otro vendedor'} dijo haber recibido`
      : `${despachoSel?.vendedores?.nombre || 'Un vendedor'} rechazo la transferencia de ${t.cantidad} ${nombreProd} que ${t.origen?.nombre || 'otro vendedor'} dijo haberle enviado`
    await crearAlertaAdmin({
      empresaId, tipo: 'transferencia_rechazada', mensaje,
      referenciaTipo: 'transferencia_mercancia', referenciaId: t.id
    })
    setProcesandoConfirmacion(false)
    if (esOrigen) setPendientesComoOrigen(prev => prev.filter(p => p.id !== t.id))
    else setPendientesComoDestino(prev => prev.filter(p => p.id !== t.id))
  }

  const registrarMercanciaRecibida = async () => {
    if (!nuevoRecibo.vendedor_id || !nuevoRecibo.sku || !parseFloat(nuevoRecibo.cantidad || 0)) {
      setErrorRecibo('Completa vendedor, producto y cantidad')
      return
    }
    setGuardandoRecibo(true)
    setErrorRecibo('')
    const empresaId = getEmpresaId()
    const fecha = despachoSel.fecha
    const { data: existente } = await supabase
      .from('transferencias_mercancia')
      .select('id')
      .eq('vendedor_origen_id', nuevoRecibo.vendedor_id)
      .eq('vendedor_destino_id', despachoSel.vendedor_id)
      .eq('sku', nuevoRecibo.sku)
      .eq('fecha', fecha)
      .eq('empresa_id', empresaId)
    if (existente && existente.length > 0) {
      setErrorRecibo('Ya hay una transferencia registrada para este producto en este despacho')
      setGuardandoRecibo(false)
      return
    }
    const cantidad = parseFloat(nuevoRecibo.cantidad)
    const precio = getPrecio(nuevoRecibo.sku)
    const { error } = await supabase.from('transferencias_mercancia').insert({
      empresa_id: empresaId, fecha, created_at: new Date().toISOString(),
      vendedor_origen_id: nuevoRecibo.vendedor_id, vendedor_destino_id: despachoSel.vendedor_id,
      sku: nuevoRecibo.sku, cantidad, valor_unitario: precio, valor_total: cantidad * precio,
      estado: 'pendiente_confirmacion', aplicada: false, origen_registro: 'receptor'
    })
    if (error) { setErrorRecibo('Error: ' + error.message); setGuardandoRecibo(false); return }
    const nombreOrigen = vendedores.find(v => v.id === nuevoRecibo.vendedor_id)?.nombre || 'un vendedor'
    const nombreProd = productosMap[nuevoRecibo.sku]?.nombre || nuevoRecibo.sku
    await crearAlertaAdmin({
      empresaId,
      tipo: 'transferencia_pendiente',
      mensaje: `${despachoSel.vendedores?.nombre || 'Un vendedor'} registro haber recibido ${cantidad} ${nombreProd} de ${nombreOrigen}, pendiente de que ${nombreOrigen} lo confirme`,
      referenciaTipo: 'transferencia_mercancia',
    })
    setNuevoRecibo({ vendedor_id: '', sku: '', cantidad: '' })
    setGuardandoRecibo(false)
    seleccionarDespacho(despachoSel)
  }

  // Un vendedor puede tener varios despachos_encab el mismo dia (se le agrego producto
  // a mitad de jornada) -- se agrupan por vendedor_id+fecha para liquidarlos juntos.
  // El "ancla" del grupo (mas antiguo por created_at) es el despacho_id al que quedan
  // ligados liquidaciones/liquidaciones_detalle/etc, igual que si fuera uno solo.
  const agruparPorVendedorYFecha = (rows) => {
    const grupos = {}
    rows.forEach(d => {
      const key = `${d.vendedor_id}_${d.fecha}`
      if (!grupos[key]) {
        grupos[key] = { ...d, _grupoIds: [d.id], _rutasNombres: d.rutas?.nombre ? [d.rutas.nombre] : [], _todos: [d] }
      } else {
        const g = grupos[key]
        g._grupoIds.push(d.id)
        g._todos.push(d)
        g.total_und = (g.total_und || 0) + (d.total_und || 0)
        g.total_valor = (g.total_valor || 0) + (d.total_valor || 0)
        if (d.rutas?.nombre && !g._rutasNombres.includes(d.rutas.nombre)) g._rutasNombres.push(d.rutas.nombre)
        if (d.created_at && g.created_at && d.created_at < g.created_at) {
          grupos[key] = { ...d, _grupoIds: g._grupoIds, _rutasNombres: g._rutasNombres, total_und: g.total_und, total_valor: g.total_valor, _todos: g._todos }
        }
      }
    })
    return Object.values(grupos)
  }

  const cargarDespachos = async (fechaLiq) => {
    const { data: pendientes } = await supabase
      .from('despachos_encab')
      .select('*, rutas(nombre), vendedores(nombre)')
      .in('estado', ['despachado', 'por_aprobar'])
      .eq('empresa_id', getEmpresaId())
      .order('fecha', { ascending: true })
    const { data: liquidados } = await supabase
      .from('despachos_encab')
      .select('*, rutas(nombre), vendedores(nombre)')
      .eq('fecha', fechaLiq)
      .eq('estado', 'liquidado')
      .eq('empresa_id', getEmpresaId())
      .order('created_at', { ascending: false })
    setDespachos([...agruparPorVendedorYFecha(pendientes || []), ...agruparPorVendedorYFecha(liquidados || [])])
    const idsPend = (pendientes || []).filter(d => d.estado === 'por_aprobar').map(d => d.id)
    const idsLiq = (liquidados || []).map(d => d.id)
    const [{ data: bs }, { data: ds }] = await Promise.all([
      idsPend.length ? supabase.from('liquidaciones_borrador').select('despacho_id, efectivo_declarado, diferencia, enviado_at, enviado_por').in('despacho_id', idsPend).eq('estado', 'por_aprobar').eq('empresa_id', getEmpresaId()) : Promise.resolve({ data: [] }),
      idsLiq.length ? supabase.from('liquidaciones_detalle').select('despacho_id, efectivo, diferencia').in('despacho_id', idsLiq).eq('empresa_id', getEmpresaId()) : Promise.resolve({ data: [] }),
    ])
    setInfoBandeja({ borr: Object.fromEntries((bs || []).map(b => [b.despacho_id, b])), liq: Object.fromEntries((ds || []).map(x => [x.despacho_id, x])) })
  }

  // Consumo propio solo llega a nomina si el vendedor tiene un empleado ligado.
  useEffect(() => {
    if (!despachoSel?.vendedor_id) { setSinEmpleado(false); return }
    supabase.from('empleados').select('id', { count: 'exact', head: true }).eq('vendedor_id', despachoSel.vendedor_id).eq('empresa_id', getEmpresaId())
      .then(({ count }) => setSinEmpleado(!count))
  }, [despachoSel?.vendedor_id])

  const seleccionarDespacho = async (d) => {
    // Cada liquidacion arranca con el formulario vacio: abajo solo se rellena
    // lo que esta ruta tenga guardado. Antes quedaban creditos, pagos, gastos,
    // etc. de la ultima ruta abierta cuando esta no tenia nada propio.
    setDevoluciones({})
    setCambios({})
    setEfectivo('')
    setComprobantes([])
    setFiados([{ nombre: '', valor: '', fecha_pago: '', cartera_fiados_id: '' }])
    setPagosFiados([{ cartera_fiados_id: '', nombre_manual: '', valor: '' }])
    setFiadosPendientes([])
    setGastos([{ categoria: '', concepto: '', valor: '' }])
    setDescuentos([{ sku: '', concepto: '', valor: '' }])
    setObsequios([{ sku: '', cantidad: '', autorizado_por: '' }])
    setConsumoPropio([{ sku: '', cantidad: '' }])
    setMercEnviada([{ vendedor_id: '', sku: '', cantidad: '', momento: 'ruta' }])
    setBorrador(null)
    setVentasRuta([])
    setDespachoSel(d)
    setClientesRuta([])
    if (d.ruta_id) supabase.from('clientes').select('id, nombre, apto, edificio').eq('ruta_id', d.ruta_id).eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre').then(({ data }) => setClientesRuta(data || []))
    const grupoIds = d._grupoIds && d._grupoIds.length > 0 ? d._grupoIds : [d.id]
    setGrupoDespachoIds(grupoIds)
    const fecha = d.fecha
    const { data: detRaw } = await supabase.from('despachos_detalle').select('*').in('despacho_id', grupoIds).eq('empresa_id', getEmpresaId())
    const { data: prods } = await supabase.from('productos').select('sku, nombre, precio_venta, orden_despacho').eq('empresa_id', getEmpresaId()).order('nombre')
    const { data: configRows } = await supabase.from('configuracion').select('valor').in('parametro', grupoIds.map(id => 'base_despacho_' + id)).eq('empresa_id', getEmpresaId())
    if (detRaw && prods) {
      const pm = {}
      prods.forEach(p => { pm[p.sku] = p })
      // Precio especial por ruta (Maestros > Rutas): pisa el precio_venta de
      // catalogo aqui, antes de que getPrecio() y todo lo que suma "vendido"
      // en esta pantalla lo lea -- es el unico punto donde se arma este mapa.
      if (d.ruta_id) {
        const { data: preciosRuta } = await supabase.from('rutas_precios').select('sku, precio_especial').eq('ruta_id', d.ruta_id).eq('empresa_id', getEmpresaId())
        ;(preciosRuta || []).forEach(pr => { if (pm[pr.sku]) pm[pr.sku] = { ...pm[pr.sku], precio_venta: pr.precio_especial } })
      }
      // Promociones (ej. tela 6 x $14.000): desde que rigen, la unidad va a
      // precio de suelta y lo vendido con ticket se cobra como dice el ticket.
      const promos = await cargarPromos(getEmpresaId())
      Object.keys(pm).forEach(sku => {
        const promo = promoVigente(promos, sku, d.ruta_id, d.fecha)
        if (promo) pm[sku] = { ...pm[sku], precio_venta: precioConPromo(pm[sku].precio_venta, promo), promo }
      // Antes de que la promo empiece, todo se liquida al precio de siempre
      // aunque el ticket diga otra cosa (Mi ruta ya arma las promos en el ticket).
      else if (promoVigente(promos, sku, d.ruta_id, d.fecha, { sinFecha: true })) pm[sku] = { ...pm[sku], sinTicket: true }
      })
      setProductosMap(pm)
      const detPorSku = {}
      detRaw.forEach(item => {
        if (!detPorSku[item.sku]) detPorSku[item.sku] = { sku: item.sku, total: 0 }
        detPorSku[item.sku].total += item.total || 0
      })
      const merged = Object.values(detPorSku).map(item => ({ ...item, producto: pm[item.sku] || {} }))
      setDetalle(merged)
      const baseSuma = (configRows || []).reduce((s, c) => s + parseFloat(c.valor || 0), 0)
      setBase(baseSuma)

      // Cargar transferencias recibidas confirmadas por el emisor, aun no contadas en una liquidacion previa
      const { data: trans, error: transError } = await supabase
        .from('transferencias_mercancia')
        .select('*, origen:vendedor_origen_id(nombre)')
        .eq('vendedor_destino_id', d.vendedor_id)
        .eq('estado', 'aplicada')
        .eq('fecha', d.fecha)
        .eq('empresa_id', getEmpresaId())
      if (transError) console.error('Error cargando transferencias recibidas:', transError)
      // Al corregir una liquidacion ya guardada (confirmada o reabierta), lo
      // recibido ya quedo marcado como contado (aplicada) en ese guardado, pero
      // sigue siendo parte de esta misma liquidacion: hay que volver a contarlo.
      const { count: lineasGuardadas } = await supabase.from('liquidaciones').select('id', { count: 'exact', head: true })
        .eq('despacho_id', d.id).eq('empresa_id', getEmpresaId())
      const reeditando = d.estado === 'liquidado' || (lineasGuardadas || 0) > 0
      setTransRecibidas((trans || []).filter(t => reeditando || !t.aplicada).map(t => ({ ...t, aplicada: reeditando ? false : t.aplicada })))

      // Cargar transferencias ya enviadas por este vendedor para este despacho
      const { data: enviadas } = await supabase
        .from('transferencias_mercancia')
        .select('*, destino:vendedor_destino_id(nombre)')
        .eq('vendedor_origen_id', d.vendedor_id)
        .eq('fecha', d.fecha)
        .eq('empresa_id', getEmpresaId())
      setTransEnviadasHoy(enviadas || [])
      cargarPendientesComoOrigen(d.vendedor_id)
      cargarPendientesComoDestino(d.vendedor_id)

      // Intentar cargar datos del kiosco
      const { data: liq } = await supabase
        .from('liquidaciones')
        .select('*')
        .eq('despacho_id', d.id)
        .eq('fecha', fecha)
        .eq('empresa_id', getEmpresaId())
      const { data: liqDet } = await supabase
        .from('liquidaciones_detalle')
        .select('*')
        .eq('despacho_id', d.id)
        .eq('fecha', fecha)
        .eq('empresa_id', getEmpresaId())
        .single()
      const { data: liqFiados } = await supabase
        .from('liquidaciones_fiados')
        .select('*')
        .eq('despacho_id', d.id)
        .eq('fecha', fecha)
        .eq('empresa_id', getEmpresaId())
      const { data: liqGastos } = await supabase
        .from('liquidaciones_gastos')
        .select('*')
        .eq('despacho_id', d.id)
        .eq('fecha', fecha)
        .eq('empresa_id', getEmpresaId())
      const { data: liqDesc } = await supabase
        .from('liquidaciones_descuentos')
        .select('*')
        .eq('despacho_id', d.id)
        .eq('fecha', fecha)
        .eq('empresa_id', getEmpresaId())
      const { data: liqObsequios } = await supabase
        .from('obsequios')
        .select('*')
        .eq('despacho_id', d.id)
        .eq('fecha', fecha)
        .eq('empresa_id', getEmpresaId())
      const { data: liqConsumo } = await supabase
        .from('consumos_empleado')
        .select('*')
        .eq('despacho_id', d.id)
        .eq('fecha', fecha)
        .eq('empresa_id', getEmpresaId())
      const { data: cartDespacho } = await supabase
        .from('cartera_fiados')
        .select('*')
        .eq('despacho_id', d.id)
        .eq('empresa_id', getEmpresaId())

      if (liq && liq.length > 0) {
        // Pre-cargar devoluciones y cambios del kiosco
        const devs = {}
        const cams = {}
        merged.forEach(item => { devs[item.sku] = '0'; cams[item.sku] = '0' })
        // Lo guardado es la devolucion neta; lo que se envio "de la devolucion"
        // se vuelve a sumar para mostrar lo que se conto.
        const enviadoDeDevolucion = {}
        ;(enviadas || []).filter(t => t.de_devolucion && t.estado !== 'rechazada').forEach(t => {
          enviadoDeDevolucion[t.sku] = (enviadoDeDevolucion[t.sku] || 0) + Number(t.cantidad || 0)
        })
        liq.forEach(l => {
          devs[l.sku] = String(Number(l.devuelto || 0) + (enviadoDeDevolucion[l.sku] || 0))
          cams[l.sku] = String(l.cambio || 0)
        })
        setDevoluciones(devs)
        setCambios(cams)
        setCargadoDeKiosco(true)
      } else {
        const devs = {}
        const cams = {}
        merged.forEach(item => { devs[item.sku] = '0'; cams[item.sku] = '0' })
        setDevoluciones(devs)
        setCambios(cams)
        setCargadoDeKiosco(false)
      }

      if (liqDet) {
        setEfectivo(String(liqDet.efectivo || ''))
      }
      const { data: transfRuta } = await supabase.from('transferencias_ruta').select('*')
        .eq('despacho_id', d.id).eq('empresa_id', getEmpresaId()).order('created_at')
      if (transfRuta && transfRuta.length > 0) {
        setComprobantes(transfRuta.map(comprobanteDesdeFila))
      } else if (liqDet && Number(liqDet.transferencias_bancarias) > 0) {
        // Liquidaciones de antes de los comprobantes: un solo total, ya contado.
        setComprobantes([{ key: 'legado', legado: true, valor: String(liqDet.transferencias_bancarias), referencia: 'Registrado antes como total', estado: 'verificada' }])
      } else {
        setComprobantes([])
      }
      const disponiblesCart = [...(cartDespacho || [])]
      if (liqFiados && liqFiados.length > 0) {
        const fiadosData = liqFiados.filter(f => f.tipo === 'fiado').map(f => {
          const idx = disponiblesCart.findIndex(c => c.nombre_cliente === f.nombre_cliente && c.valor_original === f.valor)
          let cartera_fiados_id = ''
          let fecha_pago = ''
          if (idx >= 0) { cartera_fiados_id = disponiblesCart[idx].id; fecha_pago = disponiblesCart[idx].fecha_pago || ''; disponiblesCart.splice(idx, 1) }
          return { nombre: f.nombre_cliente, valor: String(f.valor), fecha_pago, cartera_fiados_id }
        })
        const pagosData = ligarPagosConComprobantes(liqFiados.filter(f => f.tipo === 'pago_fiado').map(f => ({
          cartera_fiados_id: f.cartera_fiados_id || '__otro__',
          nombre_manual: f.cartera_fiados_id ? '' : f.nombre_cliente,
          valor: String(f.valor),
          nombreCliente: f.nombre_cliente,
        })), (transfRuta || []).map(comprobanteDesdeFila)).map(({ nombreCliente, ...p }) => p)
        if (fiadosData.length > 0) setFiados(fiadosData)
        if (pagosData.length > 0) setPagosFiados(pagosData)
      }

      const { data: fiadosPend } = await supabase
        .from('cartera_fiados')
        .select('id, nombre_cliente, saldo, valor_original, estado')
        .or(d.ruta_id ? `vendedor_id.eq.${d.vendedor_id},ruta_id.eq.${d.ruta_id}` : `vendedor_id.eq.${d.vendedor_id}`)
        .eq('estado', 'pendiente')
        .eq('empresa_id', getEmpresaId())
      const idsPagosPrevios = (liqFiados || []).filter(f => f.tipo === 'pago_fiado' && f.cartera_fiados_id).map(f => f.cartera_fiados_id)
      let fiadosYaTocados = []
      if (idsPagosPrevios.length > 0) {
        const { data } = await supabase.from('cartera_fiados').select('id, nombre_cliente, saldo, valor_original, estado').in('id', idsPagosPrevios).eq('empresa_id', getEmpresaId())
        fiadosYaTocados = data || []
      }
      const mapaFiadosPend = {}
      ;[...(fiadosPend || []), ...fiadosYaTocados].forEach(f => { mapaFiadosPend[f.id] = f })
      setFiadosPendientes(Object.values(mapaFiadosPend))
      if (liqGastos && liqGastos.length > 0) {
        setGastos(liqGastos.map(g => ({ categoria: g.categoria || '', concepto: g.concepto, valor: String(g.valor) })))
      }
      if (liqDesc && liqDesc.length > 0) {
        setDescuentos(liqDesc.map(d => ({ sku: d.sku || '', concepto: d.concepto, valor: String(d.valor) })))
      }
      if (liqObsequios && liqObsequios.length > 0) {
        setObsequios(liqObsequios.map(o => ({ sku: o.sku || '', cantidad: String(o.cantidad), autorizado_por: o.autorizado_por || '' })))
      }
      if (liqConsumo && liqConsumo.length > 0) {
        setConsumoPropio(liqConsumo.map(c => ({ sku: c.sku || '', cantidad: String(c.cantidad) })))
      }
    }
    // Lo que el vendedor envio desde el kiosco: se precarga para revisarlo
    // contra la devolucion y la plata reales. Nada de esto esta en firme aun.
    const { data: borrs } = await supabase.from('liquidaciones_borrador').select('*')
      .in('despacho_id', grupoIds).in('estado', ['por_aprobar', 'en_curso']).eq('empresa_id', getEmpresaId())
    const b = (borrs || []).find(x => x.estado === 'por_aprobar')
    // Lo que el vendedor anoto en el dia sin enviar todavia (PdV: transferencias y fiados).
    const enCurso = (borrs || []).find(x => x.estado === 'en_curso')?.datos || {}
    if (b?.datos) {
      const x = b.datos
      setBorrador({ ...b, cuantos: borrs.length })
      if (x.devoluciones) setDevoluciones(prev => ({ ...prev, ...x.devoluciones }))
      if (x.cambios) setCambios(prev => ({ ...prev, ...x.cambios }))
      setEfectivo(x.efectivo || '')
      // Lo que llega del vendedor nunca viene verificado: eso lo hace el admin mirando el banco.
      if (x.comprobantes) setComprobantes(x.comprobantes.map(c => ({ ...c, estado: c.estado === 'verificada' ? 'por_verificar' : c.estado })))
      if (x.fiados?.length) setFiados(x.fiados.map(f => ({ cartera_fiados_id: '', ...f })))
      if (x.pagosFiados?.length) setPagosFiados(x.pagosFiados)
      if (x.gastos?.length) setGastos(x.gastos)
      if (x.descuentos?.length) setDescuentos(x.descuentos)
      if (x.obsequios?.length) setObsequios(x.obsequios)
      if (x.consumoPropio?.length) setConsumoPropio(x.consumoPropio)
      if (x.mercEnviada?.length) setMercEnviada(x.mercEnviada)
      setCargadoDeKiosco(false)
    }
    // Ventas con ticket en la calle: resumen para cruzar, y si la liquidacion
    // arranca de cero, sus creditos y transferencias precargados.
    const { data: vr } = await supabase.from('ventas_ruta').select('id, numero, nombre_cliente, cliente_id, total, valor_domicilio, forma_pago, fecha_pago, ventas_ruta_detalle(sku, cantidad, subtotal)')
      .in('despacho_id', grupoIds).eq('estado', 'activa').eq('empresa_id', getEmpresaId())
    setVentasRuta(vr || [])
    const { count: yaGuardada } = await supabase.from('liquidaciones').select('id', { count: 'exact', head: true }).eq('despacho_id', d.id).eq('empresa_id', getEmpresaId())
    if (!b?.datos && !yaGuardada) {
      const cred = [...(enCurso.fiados || []).map(f => ({ cartera_fiados_id: '', ...f })),
        ...(vr || []).filter(v => v.forma_pago === 'credito').map(v => ({ nombre: v.nombre_cliente, valor: String(v.total), fecha_pago: v.fecha_pago || '', cartera_fiados_id: '', cliente_id: v.cliente_id }))]
      if (cred.length) setFiados(cred)
      const tr = [...(enCurso.comprobantes || []).map(c => ({ ...c, estado: c.estado === 'verificada' ? 'por_verificar' : c.estado })),
        ...(vr || []).filter(v => v.forma_pago === 'transferencia').map(v => ({ key: 'venta-' + v.id, valor: String(v.total), referencia: `Ticket #${v.numero} ${v.nombre_cliente}`, banco: '', estado: 'por_verificar', fecha_limite: '', origen: 'manual' }))]
      if (tr.length) setComprobantes(tr)
    }
    setPestana('devolucion'); setAbiertas(new Set()); setVerRecibo(false)
    setPaso(2)
  }

  // Navegacion tipo Excel en la grilla de devoluciones/cambios.
  const navegarGrilla = (e, col, fila) => {
    const ir = (c, f) => {
      const el = document.querySelector(`[data-grilla="${c}"][data-fila="${f}"]`)
      if (el) { e.preventDefault(); el.focus() }
    }
    if (e.key === 'Enter' || e.key === 'ArrowDown') ir(col, fila + 1)
    else if (e.key === 'ArrowUp') ir(col, fila - 1)
    else if (e.key === 'ArrowRight' && col === 'dev') ir('cam', fila)
    else if (e.key === 'ArrowLeft' && col === 'cam') ir('dev', fila)
  }

  const getPrecio = (sku) => {
    const p = detalle.find(d => d.sku === sku)
    return (p && p.producto?.precio_venta) || productosMap[sku]?.precio_venta || 0
  }

  const transRecibidasContables = () => transRecibidas.filter(t => t.estado === 'aplicada' && !t.aplicada)

  const lineasMezcladas = () => {
    const tickets = ticketsPorSku(ventasRuta)
    const mapa = {}
    detalle.forEach(item => {
      mapa[item.sku] = { sku: item.sku, producto: item.producto, despachadoPropio: item.total || 0, recibidos: [], enviados: [] }
    })
    transRecibidasContables().forEach(t => {
      if (!mapa[t.sku]) mapa[t.sku] = { sku: t.sku, producto: productosMap[t.sku] || { sku: t.sku, nombre: t.sku }, despachadoPropio: 0, recibidos: [], enviados: [] }
      mapa[t.sku].recibidos.push({ cantidad: t.cantidad, nombre: t.origen?.nombre || 'otro vendedor' })
    })
    transEnviadasHoy.filter(t => t.estado !== 'rechazada').forEach(t => {
      if (mapa[t.sku]) mapa[t.sku].enviados.push({ cantidad: t.cantidad, nombre: t.destino?.nombre || 'otro vendedor', deDevolucion: !!t.de_devolucion })
    })
    mercEnviada.filter(m => m.sku && parseFloat(m.cantidad) > 0).forEach(m => {
      if (mapa[m.sku]) {
        const vend = vendedores.find(v => v.id === m.vendedor_id)
        mapa[m.sku].enviados.push({ cantidad: parseFloat(m.cantidad), nombre: vend?.nombre || 'otro vendedor', deDevolucion: m.momento === 'devolucion' })
      }
    })
    return ordenarPorDespacho(Object.values(mapa)).map(l => {
      const totalRecibido = l.recibidos.reduce((s, r) => s + r.cantidad, 0)
      const totalEnviado = l.enviados.reduce((s, e) => s + e.cantidad, 0)
      const despachadoEfectivo = l.despachadoPropio + totalRecibido - totalEnviado
      // Lo que entrego al llegar ya estaba contado en la devolucion: sale de
      // ahi (no vuelve a bodega) y no de lo vendido. Antes se restaba en los
      // dos lados y al vendedor le quedaba "vendido" de menos.
      const enviadoDeDevolucion = l.enviados.filter(e => e.deDevolucion).reduce((s, e) => s + e.cantidad, 0)
      const devueltoContado = parseFloat(devoluciones[l.sku] || 0)
      const devuelto = devueltoContado - enviadoDeDevolucion
      const cambio = parseFloat(cambios[l.sku] || 0)
      const vendidoNeto = despachadoEfectivo - devuelto - cambio
      const precio = getPrecio(l.sku)
      return { ...l, despachadoEfectivo, devuelto, devueltoContado, enviadoDeDevolucion, cambio, vendidoNeto, precio, efectivoEsperado: valorVendido(vendidoNeto, precio, (l.producto || productosMap[l.sku])?.sinTicket ? null : tickets[l.sku]) }
    })
  }

  const totalVendidoValor = () => lineasMezcladas().reduce((sum, l) => sum + l.efectivoEsperado, 0)
  const totalMercEnviadaInfo = () =>
    mercEnviada.reduce((sum, m) => sum + parseFloat(m.cantidad || 0) * getPrecio(m.sku), 0) +
    transEnviadasHoy.filter(t => t.estado !== 'rechazada').reduce((sum, t) => sum + (t.valor_total || 0), 0)
  const totalMercRecibidaInfo = () => transRecibidasContables().reduce((sum, t) => sum + (t.valor_total || 0), 0)
  const totalFiados = () => fiados.reduce((sum, f) => sum + parseFloat(f.valor || 0), 0)
  const totalPagosFiados = () => pagosFiados.reduce((sum, p) => sum + parseFloat(p.valor || 0), 0)
  const nombrePago = (p) => p.cartera_fiados_id === '__otro__' ? p.nombre_manual : (fiadosPendientes.find(f => f.id === p.cartera_fiados_id)?.nombre_cliente || '')
  // Cambia un pago de credito; si es por transferencia, su comprobante en
  // Transferencias se crea/actualiza/quita junto con el.
  const actualizarPago = (i, campos) => {
    const antes = pagosFiados[i]
    const pago = sincronizarPagoTransferencia(antes, { ...antes, ...campos }, nombrePago({ ...antes, ...campos }), comprobantes, setComprobantes)
    setPagosFiados(prev => prev.map((p, j) => j === i ? pago : p))
  }
  const totalGastos = () => gastos.reduce((sum, g) => sum + parseFloat(g.valor || 0), 0)
  const totalDescuentos = () => descuentos.reduce((sum, d) => sum + parseFloat(d.valor || 0), 0)
  const totalObsequios = () => obsequios.reduce((sum, o) => sum + parseFloat(o.cantidad || 0) * getPrecio(o.sku), 0)
  const totalConsumoPropio = () => consumoPropio.reduce((sum, c) => sum + parseFloat(c.cantidad || 0) * getPrecio(c.sku), 0)
  const transfVerificadas = () => totalesComprobantes(comprobantes).verificadas
  const transfPorVerificar = () => totalesComprobantes(comprobantes).porVerificar
  // Lo "por verificar" se trata como un credito: no es plata que entrega hoy,
  // queda como deuda del vendedor hasta que llegue o se le descuente.
  // Domicilios cobrados con ticket: no son producto, pero la plata se entrega.
  const totalDomicilios = () => ventasRuta.reduce((s, v) => s + Number(v.valor_domicilio || 0), 0)
  const totalAEntregar = () => totalVendidoValor() + totalDomicilios() + base - totalFiados() + totalPagosFiados() - totalDescuentos() - totalObsequios() - totalConsumoPropio() - transfPorVerificar()
  const totalEntregado = () => parseFloat(efectivo || 0) + transfVerificadas() + totalGastos()
  const diferencia = () => totalEntregado() - totalAEntregar()

  // Revertir el efecto de los pagos de fiados guardados en un intento anterior de esta misma liquidacion,
  // antes de borrar y reinsertar (si no, al recorregir se restaria el pago dos veces del saldo del cliente).
  // Compartida entre guardarLiquidacion (recorrige) y reabrirLiquidacion (deshace del todo).
  const revertirPagosFiadosPrevios = async (despachoId, fecha, empresaId) => {
    const { data: pagosPrevios } = await supabase
      .from('liquidaciones_fiados')
      .select('cartera_fiados_id, valor')
      .eq('despacho_id', despachoId).eq('fecha', fecha).eq('empresa_id', empresaId)
      .eq('tipo', 'pago_fiado')
    for (const pp of (pagosPrevios || [])) {
      if (!pp.cartera_fiados_id) continue
      const { data: cf } = await supabase.from('cartera_fiados').select('saldo, valor_original').eq('id', pp.cartera_fiados_id).eq('empresa_id', empresaId).single()
      if (cf) {
        const saldoRevertido = Math.min(cf.valor_original, (cf.saldo || 0) + pp.valor)
        await supabase.from('cartera_fiados').update({ saldo: saldoRevertido, estado: 'pendiente', fecha_pagado: null }).eq('id', pp.cartera_fiados_id).eq('empresa_id', empresaId)
      }
    }
  }

  const borrarLiquidacionPrevia = async (despachoId, fecha, empresaId, vendedorId) => {
    await supabase.from('liquidaciones').delete().eq('despacho_id', despachoId).eq('fecha', fecha).eq('empresa_id', empresaId)
    await supabase.from('liquidaciones_detalle').delete().eq('despacho_id', despachoId).eq('fecha', fecha).eq('empresa_id', empresaId)
    await supabase.from('liquidaciones_fiados').delete().eq('despacho_id', despachoId).eq('fecha', fecha).eq('empresa_id', empresaId)
    await supabase.from('liquidaciones_gastos').delete().eq('despacho_id', despachoId).eq('fecha', fecha).eq('empresa_id', empresaId)
    await supabase.from('liquidaciones_descuentos').delete().eq('despacho_id', despachoId).eq('fecha', fecha).eq('empresa_id', empresaId)
    // Obsequios y consumo propio no se borraban aqui -- si se reabria y se
    // rehacia una liquidacion con obsequios/consumo propio ya registrados,
    // quedaban duplicados. Se corrige aqui mismo, no solo se limita a agregar
    // las secciones nuevas.
    await supabase.from('obsequios').delete().eq('despacho_id', despachoId).eq('fecha', fecha).eq('empresa_id', empresaId)
    await supabase.from('consumos_empleado').delete().eq('despacho_id', despachoId).eq('fecha', fecha).eq('empresa_id', empresaId)
    await supabase.from('novedades').delete()
      .eq('vendedor_id', vendedorId).eq('fecha', fecha).eq('empresa_id', empresaId)
      .eq('motivo', 'Reportado en liquidacion del kiosco').eq('revisado', false).is('repuesto_at', null)
  }

  // Reabrir ya no borra nada: el despacho vuelve a pendientes con todo lo
  // guardado (devoluciones, plata, creditos, comprobantes) y solo se
  // reemplaza cuando se confirma de nuevo. Antes borraba la liquidacion de
  // una vez y, si el navegador se trababa, habia que digitar todo otra vez.
  const reabrirLiquidacion = async () => {
    if (!confirm('El despacho vuelve a pendientes con todo lo guardado. Nada se borra hasta que confirmes de nuevo. ¿Continuar?')) return
    setGuardando(true)
    const empresaId = getEmpresaId()
    const ids = grupoDespachoIds.length > 0 ? grupoDespachoIds : [despachoSel.id]
    const { error } = await supabase.from('despachos_encab').update({ estado: 'despachado' }).in('id', ids).eq('empresa_id', empresaId)
    setGuardando(false)
    if (error) { alert('Error: ' + error.message); return }
    // Se queda en el formulario con los datos cargados para corregir.
    setDespachoSel({ ...despachoSel, estado: 'despachado' })
    cargarDespachos(fechaLiquidados)
  }


  const guardarLiquidacion = async () => {
    const sinFecha = comprobantes.filter(c => comprobanteEditable(c, usuario?.rol === 'admin') && c.estado === 'por_verificar' && (!parseFloat(c.valor) || !c.fecha_limite))
    if (sinFecha.length > 0) {
      alert('Cada transferencia por verificar necesita valor y fecha limite (la que se acordo con el vendedor).')
      return
    }
    const malDevolucion = lineasMezcladas().filter(l => l.devuelto < 0)
    if (malDevolucion.length > 0) {
      alert('Se envio a otro vendedor "de la devolucion" mas de lo que se conto como devuelto:\n' +
        malDevolucion.map(l => `${l.producto?.nombre || l.sku}: devuelto ${l.devueltoContado}, enviado de la devolucion ${l.enviadoDeDevolucion}`).join('\n') +
        '\n\nRevisa la devolucion (paso 2) o marca ese envio como "Durante la ruta".')
      return
    }
    // Un obsequio a medio llenar (sin quien lo autorizo) igual se restaba del
    // total a entregar pero no se guardaba: al reabrir desaparecia y el
    // vendedor quedaba con descuadre. Tampoco puede regalarse mas de lo que
    // salio y no volvio.
    const obsequiosIncompletos = obsequios.filter(o => (o.sku || parseFloat(o.cantidad) > 0) && !(o.sku && parseFloat(o.cantidad) > 0 && o.autorizado_por))
    if (obsequiosIncompletos.length > 0) {
      alert('Hay obsequios incompletos: cada uno necesita producto, cantidad y quien lo autorizo. Completalos o borra la cantidad.')
      return
    }
    const regaladoPorSku = {}
    ;[...obsequios, ...consumoPropio].forEach(o => { if (o.sku) regaladoPorSku[o.sku] = (regaladoPorSku[o.sku] || 0) + (parseFloat(o.cantidad) || 0) })
    const excedidos = lineasMezcladas().filter(l => (regaladoPorSku[l.sku] || 0) > l.vendidoNeto + 0.0001)
    if (excedidos.length > 0) {
      alert('Obsequios + consumo propio superan lo que salio y no volvio:\n' +
        excedidos.map(l => `${l.producto?.nombre || l.sku}: vendido ${l.vendidoNeto}, obsequios + consumo ${regaladoPorSku[l.sku]}`).join('\n') +
        '\n\nLo que el vendedor trajo de vuelta va en la devolucion, no en obsequios.')
      return
    }
    setGuardando(true)
    const fecha = despachoSel.fecha
    const empresaId = getEmpresaId()

    await revertirPagosFiadosPrevios(despachoSel.id, fecha, empresaId)
    await borrarLiquidacionPrevia(despachoSel.id, fecha, empresaId, despachoSel.vendedor_id)

    const registros = lineasMezcladas().map(l => ({
      empresa_id: empresaId,
      fecha,
      despacho_id: despachoSel.id,
      vendedor_id: despachoSel.vendedor_id,
      sku: l.sku,
      despachado: l.despachadoEfectivo,
      devuelto: l.devuelto,
      cambio: l.cambio,
      vendido_neto: l.vendidoNeto,
      efectivo_esperado: l.efectivoEsperado,
      efectivo_real: parseFloat(efectivo || 0)
    }))

    const { error } = await supabase.from('liquidaciones').insert(registros)
    if (!error) {
      const fallos = []

      const idsGrupo = grupoDespachoIds.length > 0 ? grupoDespachoIds : [despachoSel.id]
      const { error: errDespacho } = await supabase.from('despachos_encab').update({ estado: 'liquidado' }).in('id', idsGrupo)
      if (errDespacho) fallos.push('estado del despacho')
      const { error: errBorrador } = await supabase.from('liquidaciones_borrador')
        .update({ estado: 'aprobado', aprobado_por: usuario?.nombre || null, aprobado_at: new Date().toISOString() })
        .in('despacho_id', idsGrupo).in('estado', ['por_aprobar', 'en_curso']).eq('empresa_id', empresaId)
      if (errBorrador) fallos.push('marcar como aprobada la liquidacion enviada por el vendedor')

      const { error: errDetalle } = await supabase.from('liquidaciones_detalle').insert({
        empresa_id: empresaId,
        fecha,
        despacho_id: despachoSel.id,
        vendedor_id: despachoSel.vendedor_id,
        efectivo: parseFloat(efectivo || 0),
        transferencias_bancarias: transfVerificadas(),
        total_fiados: totalFiados(),
        total_pagos_fiados: totalPagosFiados(),
        total_gastos: totalGastos(),
        total_merc_enviada: totalMercEnviadaInfo(),
        total_merc_recibida: totalMercRecibidaInfo(),
        diferencia: diferencia()
      })
      if (errDetalle) fallos.push('resumen de la liquidacion (cuadre de caja)')

      const cambiosReportados = lineasMezcladas().filter(l => l.cambio > 0)
      if (cambiosReportados.length > 0) {
        // borrarLiquidacionPrevia solo borra los reportes aun no revisados -- si bodega
        // ya clasifico uno, sigue existiendo aca. No volver a reportarlo o se duplicaria
        // el credito al proveedor / el gasto de perdida cuando se clasifique otra vez.
        const { data: novedadesExistentes } = await supabase.from('novedades').select('sku')
          .eq('empresa_id', empresaId).eq('vendedor_id', despachoSel.vendedor_id).eq('fecha', fecha)
          .eq('motivo', 'Reportado en liquidacion del kiosco')
        const skusYaReportados = new Set((novedadesExistentes || []).map(n => n.sku))
        const nuevos = cambiosReportados.filter(l => !skusYaReportados.has(l.sku))
        const reponer = await proveedorParaReponer(empresaId, nuevos.map(l => l.sku))
        const novedadesReg = nuevos.map(l => ({
          empresa_id: empresaId, fecha, vendedor_id: despachoSel.vendedor_id,
          sku: l.sku, cantidad: l.cambio,
          tipo: 'mano_a_mano', momento: 'en_ruta', quien_registra: 'vendedor',
          motivo: 'Reportado en liquidacion del kiosco', revisado: false,
          pendiente_reponer: !!reponer, proveedor_id: reponer?.[l.sku] || null,
        }))
        if (novedadesReg.length > 0) {
          const { error: errNovedades } = await supabase.from('novedades').insert(novedadesReg)
          if (errNovedades) fallos.push('registrar los cambios para revision de bodega/admin')
        }
      }

      const movimientosCaja = []
      if (parseFloat(efectivo || 0) > 0) {
        const { data: cuentaEfectivo } = await supabase.from('cuentas').select('id').eq('tipo', 'efectivo').eq('empresa_id', empresaId).maybeSingle()
        movimientosCaja.push({ cuenta_id: cuentaEfectivo?.id || null, monto: parseFloat(efectivo) })
      }
      const { data: rutaInfo } = await supabase.from('rutas').select('cuenta_id').eq('id', despachoSel.ruta_id).maybeSingle()
      // Las verificadas entran a la cuenta a la que llegaron (la del comprobante
      // si se identifico; si no, la de la ruta).
      const porCuenta = {}
      comprobantes.filter(c => c.estado === 'verificada' && parseFloat(c.valor) > 0).forEach(c => {
        const cid = c.cuenta_id || rutaInfo?.cuenta_id || null
        porCuenta[cid] = (porCuenta[cid] || 0) + parseFloat(c.valor)
      })
      Object.entries(porCuenta).forEach(([cid, monto]) => movimientosCaja.push({ cuenta_id: cid === 'null' ? null : cid, monto }))

      // Comprobantes: se reemplazan los que se pueden editar; los ya resueltos
      // (recibidos/descontados, o verificados si no es admin) no se tocan.
      const esAdmin = usuario?.rol === 'admin'
      const estadosEditables = esAdmin ? ['verificada', 'por_verificar'] : ['por_verificar']
      await supabase.from('transferencias_ruta').delete()
        .eq('despacho_id', despachoSel.id).eq('empresa_id', empresaId).in('estado', estadosEditables)
      const nuevosComprobantes = comprobantes.filter(c => comprobanteEditable(c, esAdmin) && parseFloat(c.valor) > 0).map(c => ({
        empresa_id: empresaId, despacho_id: despachoSel.id, vendedor_id: despachoSel.vendedor_id, ruta_id: despachoSel.ruta_id, fecha,
        valor: parseFloat(c.valor), referencia: c.referencia?.trim() || null, banco: c.banco || null,
        fecha_comprobante: c.fecha_comprobante || null, destino: c.destino || null, cuenta_maissy: c.cuenta_maissy ?? null,
        estado: c.estado, fecha_limite: c.estado === 'por_verificar' ? c.fecha_limite : null,
        cuenta_id: c.cuenta_id || (c.estado === 'verificada' ? rutaInfo?.cuenta_id || null : null),
        origen: c.origen || 'manual', registrado_por: usuario?.nombre || null,
        verificada_por: c.estado === 'verificada' ? usuario?.nombre || null : null,
        verificada_at: c.estado === 'verificada' ? new Date().toISOString() : null,
      }))
      if (nuevosComprobantes.length > 0) {
        const { error: errComp } = await supabase.from('transferencias_ruta').insert(nuevosComprobantes)
        if (errComp) fallos.push('comprobantes de transferencia (' + errComp.message + ')')
      }
      // Se rehacen las entradas de esta liquidacion (si se corrige y una cuenta
      // queda en 0, antes su movimiento viejo quedaba vivo).
      const { data: existentes } = await supabase.from('movimientos_tesoreria').select('id, cuenta_id')
        .eq('referencia_tipo', 'liquidacion').eq('referencia_id', despachoSel.id).eq('empresa_id', empresaId)
      for (const m of movimientosCaja) {
        const previo = (existentes || []).find(e => e.cuenta_id === m.cuenta_id)
        const { error: errTesoreria } = previo
          ? await supabase.from('movimientos_tesoreria').update({ monto: m.monto }).eq('id', previo.id)
          : await supabase.from('movimientos_tesoreria').insert({
              empresa_id: empresaId, cuenta_id: m.cuenta_id, fecha, tipo: 'entrada', monto: m.monto,
              concepto: `Liquidacion ${despachoSel.rutas?.nombre || ''}`, referencia_tipo: 'liquidacion', referencia_id: despachoSel.id
            })
        if (errTesoreria) fallos.push('movimientos de caja/bancos')
      }
      const sobrantes = (existentes || []).filter(e => !movimientosCaja.some(m => m.cuenta_id === e.cuenta_id))
      if (sobrantes.length > 0) await supabase.from('movimientos_tesoreria').delete().in('id', sobrantes.map(e => e.id))

      const fiadosReg = fiados.filter(f => f.nombre && f.valor).map(f => ({
        empresa_id: empresaId, fecha, despacho_id: despachoSel.id, vendedor_id: despachoSel.vendedor_id,
        nombre_cliente: f.nombre, valor: parseFloat(f.valor), tipo: 'fiado'
      }))
      const pagosReg = pagosFiados.filter(p => p.valor && (p.cartera_fiados_id || p.nombre_manual)).map(p => {
        const fiadoLigado = p.cartera_fiados_id && p.cartera_fiados_id !== '__otro__' ? fiadosPendientes.find(f => f.id === p.cartera_fiados_id) : null
        return {
          empresa_id: empresaId, fecha, despacho_id: despachoSel.id, vendedor_id: despachoSel.vendedor_id,
          nombre_cliente: fiadoLigado?.nombre_cliente || p.nombre_manual,
          valor: parseFloat(p.valor), tipo: 'pago_fiado',
          cartera_fiados_id: fiadoLigado?.id || null
        }
      })
      if ([...fiadosReg, ...pagosReg].length > 0) {
        const { error: errFiados } = await supabase.from('liquidaciones_fiados').insert([...fiadosReg, ...pagosReg])
        if (errFiados) fallos.push('créditos y pagos de créditos')
      }

      // Reconciliar cartera_fiados para los fiados nuevos de este despacho: actualizar los que ya existian
      // e insertar los que se agregaron. cartera_fiados no admite borrado (igual que despachos_detalle y
      // conteo_fisico en esta base de datos), asi que un fiado quitado del formulario no se puede eliminar
      // automaticamente de Cartera -- solo se avisa para que se revise a mano.
      const { data: cartDespachoActual } = await supabase.from('cartera_fiados').select('*').eq('despacho_id', despachoSel.id).eq('empresa_id', empresaId)
      const idsEnFormulario = fiados.filter(f => f.cartera_fiados_id).map(f => f.cartera_fiados_id)
      const yaNoEstan = (cartDespachoActual || []).filter(c => !idsEnFormulario.includes(c.id))

      for (const f of fiados.filter(f => f.nombre && f.valor)) {
        if (f.cartera_fiados_id) {
          const original = (cartDespachoActual || []).find(c => c.id === f.cartera_fiados_id)
          const nuevoValor = parseFloat(f.valor)
          const delta = original ? nuevoValor - original.valor_original : 0
          const nuevoSaldo = Math.max(0, (original?.saldo || 0) + delta)
          const { error: errUpdCart } = await supabase.from('cartera_fiados')
            .update({ nombre_cliente: f.nombre, valor_original: nuevoValor, saldo: nuevoSaldo, fecha_pago: f.fecha_pago || null, ...(f.cliente_id ? { cliente_id: f.cliente_id } : {}) })
            .eq('id', f.cartera_fiados_id).eq('empresa_id', empresaId)
          if (errUpdCart) fallos.push('cartera de créditos (actualizar)')
        } else {
          const { error: errInsCart } = await supabase.from('cartera_fiados').insert({
            empresa_id: empresaId, despacho_id: despachoSel.id, ruta_id: despachoSel.ruta_id, vendedor_id: despachoSel.vendedor_id,
            nombre_cliente: f.nombre, valor_original: parseFloat(f.valor), saldo: parseFloat(f.valor),
            fecha_fiado: fecha, fecha_pago: f.fecha_pago || null, estado: 'pendiente', cliente_id: f.cliente_id || null
          })
          if (errInsCart) fallos.push('cartera de créditos (nuevo)')
        }
      }
      if (yaNoEstan.length > 0) {
        fallos.push(`${yaNoEstan.length} fiado(s) se quitaron de este formulario pero siguen activos en Cartera (no se pueden borrar automaticamente, revisalos a mano)`)
      }

      for (const p of pagosReg) {
        if (!p.cartera_fiados_id) continue
        const fiadoLigado = fiadosPendientes.find(f => f.id === p.cartera_fiados_id)
        const { data: cfActual } = await supabase.from('cartera_fiados').select('saldo').eq('id', p.cartera_fiados_id).eq('empresa_id', empresaId).single()
        const saldoBase = cfActual ? cfActual.saldo : (fiadoLigado?.saldo || 0)
        const nuevoSaldo = Math.max(0, saldoBase - p.valor)
        const { error: errSaldo } = await supabase.from('cartera_fiados')
          .update({ saldo: nuevoSaldo, estado: nuevoSaldo <= 0 ? 'pagado' : 'pendiente', fecha_pagado: nuevoSaldo <= 0 ? new Date().toISOString() : null })
          .eq('id', p.cartera_fiados_id).eq('empresa_id', empresaId)
        if (errSaldo) fallos.push(`saldo de cartera (${fiadoLigado?.nombre_cliente || ''})`)
      }

      const gastosReg = gastos.filter(g => g.categoria && g.valor).map(g => ({
        empresa_id: empresaId, fecha, despacho_id: despachoSel.id, vendedor_id: despachoSel.vendedor_id,
        categoria: g.categoria, concepto: g.concepto, valor: parseFloat(g.valor)
      }))
      if (gastosReg.length > 0) {
        const { error: errGastos } = await supabase.from('liquidaciones_gastos').insert(gastosReg)
        if (errGastos) fallos.push('gastos de ruta')
      }

      const descuentosReg = descuentos.filter(d => d.valor).map(d => ({
        empresa_id: empresaId, fecha, despacho_id: despachoSel.id, vendedor_id: despachoSel.vendedor_id,
        sku: d.sku || null, concepto: d.concepto, valor: parseFloat(d.valor)
      }))
      if (descuentosReg.length > 0) {
        const { error: errDescuentos } = await supabase.from('liquidaciones_descuentos').insert(descuentosReg)
        if (errDescuentos) fallos.push('descuentos')
      }

      // Mismo chequeo que en Kiosco: si el otro vendedor ya registro esta
      // misma transferencia por su lado, no duplicarla aqui.
      const candidatasEnviadas = mercEnviada.filter(m => m.vendedor_id && m.sku && m.cantidad)
      const transEnviadas = []
      const enviadasDuplicadas = []
      for (const m of candidatasEnviadas) {
        const { data: existente } = await supabase.from('transferencias_mercancia').select('id')
          .eq('vendedor_origen_id', despachoSel.vendedor_id).eq('vendedor_destino_id', m.vendedor_id)
          .eq('sku', m.sku).eq('fecha', fecha).eq('empresa_id', empresaId)
        if (existente && existente.length > 0) {
          enviadasDuplicadas.push(m)
        } else {
          transEnviadas.push({
            empresa_id: empresaId, fecha, created_at: new Date().toISOString(),
            vendedor_origen_id: despachoSel.vendedor_id, vendedor_destino_id: m.vendedor_id,
            sku: m.sku, cantidad: parseFloat(m.cantidad),
            valor_unitario: getPrecio(m.sku), valor_total: parseFloat(m.cantidad) * getPrecio(m.sku),
            estado: 'pendiente_confirmacion', origen_registro: 'emisor', de_devolucion: m.momento === 'devolucion'
          })
        }
      }
      if (transEnviadas.length > 0) {
        const { error: errTransEnv } = await supabase.from('transferencias_mercancia').insert(transEnviadas)
        if (errTransEnv) fallos.push('mercancia transferida a otro vendedor')
      }
      if (enviadasDuplicadas.length > 0) {
        fallos.push(`ya habia una transferencia registrada para ${enviadasDuplicadas.map(m => productosMap[m.sku]?.nombre || m.sku).join(', ')} -- no se duplico, revisa en Transferencias`)
      }

      const idsAplicar = transRecibidasContables().map(t => t.id)
      if (idsAplicar.length > 0) {
        const { error: errTransRec } = await supabase.from('transferencias_mercancia').update({ aplicada: true }).in('id', idsAplicar).eq('empresa_id', empresaId)
        if (errTransRec) fallos.push('marcar como aplicada la mercancia recibida')
      }

      const obsequiosReg = obsequios.filter(o => o.sku && parseFloat(o.cantidad) > 0 && o.autorizado_por).map(o => ({
        empresa_id: empresaId, fecha, despacho_id: despachoSel.id, vendedor_id: despachoSel.vendedor_id,
        sku: o.sku, cantidad: parseFloat(o.cantidad),
        valor_unitario: getPrecio(o.sku), autorizado_por: o.autorizado_por, edificio_id: o.edificio_id || null
      }))
      if (obsequiosReg.length > 0) {
        const { error: errObsequios } = await supabase.from('obsequios').insert(obsequiosReg)
        if (errObsequios) fallos.push('obsequios')
      }

      const consumoPropioValido = consumoPropio.filter(c => c.sku && parseFloat(c.cantidad) > 0)
      if (consumoPropioValido.length > 0) {
        const { data: empleadoLigado } = await supabase.from('empleados').select('id').eq('vendedor_id', despachoSel.vendedor_id).eq('empresa_id', empresaId).maybeSingle()
        const consumosReg = consumoPropioValido.map(c => ({
          empresa_id: empresaId, empleado_id: empleadoLigado?.id || null, vendedor_id: despachoSel.vendedor_id, despacho_id: despachoSel.id,
          fecha, sku: c.sku, cantidad: parseFloat(c.cantidad),
          valor_unitario: getPrecio(c.sku), valor: parseFloat(c.cantidad) * getPrecio(c.sku)
        }))
        const { error: errConsumo } = await supabase.from('consumos_empleado').insert(consumosReg)
        if (errConsumo) fallos.push('consumo propio')
      }

      if (Math.abs(diferencia()) > UMBRAL_ALERTA_DIFERENCIA) {
        await crearAlertaAdmin({
          empresaId,
          tipo: 'descuadre_caja',
          mensaje: `${despachoSel.vendedores?.nombre || 'Un vendedor'} cerro la liquidacion del ${fecha} con una diferencia de ${diferencia() >= 0 ? '+' : '-'}$${Math.abs(diferencia()).toLocaleString('es-CO')}`,
          referenciaTipo: 'despacho_encab',
          referenciaId: despachoSel.id,
        })
      }

      if (fallos.length > 0) {
        alert('La liquidacion se guardo, pero algo fallo en: ' + fallos.join(', ') + '. Revisa esos datos antes de dar por cerrado el dia.')
      }
      setGuardado(true)
    } else {
      alert('Error: ' + error.message)
    }
    setGuardando(false)
  }

  // ---------- pantalla (linea de Mi ruta) ----------
  const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', linea: '#E3E1D8', suave: '#EFEDE6', rojo: '#C41230', rojoF: '#FBE9E9', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8' }
  const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
  const $ = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
  const conSigno = (n) => (n >= 0 ? '+' : '−') + $(Math.abs(n))
  const fechaLarga = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })
  const hoyStr = obtenerFechaActual()
  const diasDesde = (f) => Math.round((new Date(hoyStr + 'T12:00:00') - new Date(f + 'T12:00:00')) / 864e5)
  const campo = 'w-full rounded-xl px-3 min-h-[42px] text-[14.5px] bg-white border outline-none focus:border-[#1C1B19]'
  const tarjeta = 'bg-white rounded-[18px] p-3.5 min-w-0'
  const pill = (texto, color, fondo) => <span className="inline-flex items-center text-[12px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap" style={{ color, background: fondo }}>{texto}</span>
  const abrirFoto = async (ruta) => { const u = await verSoporte(ruta); if (u) window.open(u, '_blank', 'noopener') }

  if (guardado) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: C.fondo, color: C.tinta }}>
      <div className="bg-white rounded-[22px] p-7 text-center max-w-md w-full flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: C.verdeF }} aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={C.verde} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
        </div>
        <h2 className="font-extrabold text-[24px]" style={titulo}>{borrador ? 'Liquidación aprobada' : 'Liquidación guardada'}</h2>
        <p style={{ color: C.gris }}>{(despachoSel?._rutasNombres || [despachoSel?.rutas?.nombre]).filter(Boolean).join(' + ')} · {despachoSel?.vendedores?.nombre}</p>
        <div className="w-full rounded-2xl p-4" style={{ background: diferencia() < 0 ? C.rojoF : C.fondo }}>
          <p className="text-[13px] font-bold" style={{ color: diferencia() < 0 ? C.rojo : C.gris }}>Diferencia</p>
          <p className="font-extrabold text-[30px] tabular-nums" style={{ ...titulo, color: diferencia() < 0 ? C.rojo : C.tinta }}>{conSigno(diferencia())}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 w-full">
          <button onClick={() => { setGuardado(false); setBorrador(null); setDespachoSel(null); setPaso(1); cargarDespachos(fechaLiquidados) }} className="min-h-[48px] rounded-2xl font-bold" style={{ background: C.fondo }}>Otra liquidación</button>
          <button onClick={() => router.push(inicioDelRol())} className="min-h-[48px] rounded-2xl font-bold text-white" style={{ background: C.rojo }}>Ir al inicio</button>
        </div>
      </div>
    </div>
  )

  // ---------- 1. Bandeja ----------
  if (paso === 1) {
    const porAprobar = despachos.filter(d => d.estado === 'por_aprobar')
    const sinLiquidar = despachos.filter(d => d.estado === 'despachado')
    const liquidadas = despachos.filter(d => d.estado === 'liquidado')
    const nombreRuta = (d) => (d._rutasNombres || [d.rutas?.nombre]).filter(Boolean).join(' + ')
    const separar = (d) => d._grupoIds?.length > 1 && (
      <div className="px-1">
        <button onClick={() => setGruposExpandidos(prev => { const n = new Set(prev); n.has(d.id) ? n.delete(d.id) : n.add(d.id); return n })} className="text-[12.5px] underline" style={{ color: C.gris }}>
          {gruposExpandidos.has(d.id) ? 'Ocultar despachos sueltos' : `Son ${d._grupoIds.length} despachos juntos · liquidar por separado`}
        </button>
        {gruposExpandidos.has(d.id) && (
          <div className="flex flex-col gap-1.5 mt-1.5">
            {d._todos.map(t => (
              <button key={t.id} onClick={() => seleccionarDespacho(t)} className="bg-white rounded-xl px-3 py-2 text-left flex justify-between items-center gap-2 text-[13.5px]">
                <span><b>{t.rutas?.nombre}</b> · {t.total_und} und{t.created_at ? ` · ${new Date(t.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
                <span className="font-bold" style={{ color: C.rojo }}>Solo este</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
    const columna = (titulo_, color, fondo, lista, vacio, extra) => (
      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">{pill(`${titulo_} · ${lista.length}`, color, fondo)}{extra}</div>
        {lista.length === 0 && <p className="text-[13.5px] px-1 py-2" style={{ color: C.gris }}>{vacio}</p>}
        {lista.map(d => {
          const b = infoBandeja.borr[d.id], l = infoBandeja.liq[d.id]
          const atraso = d.estado !== 'liquidado' ? diasDesde(d.fecha) : 0
          return (
            <div key={d.id} className="flex flex-col gap-1">
              <button onClick={() => seleccionarDespacho(d)} className={tarjeta + ' text-left flex gap-3 items-start justify-between hover:ring-2 hover:ring-[#1C1B19]/10'}>
                <span className="min-w-0">
                  <b className="block text-[16px] leading-tight" style={titulo}>{nombreRuta(d)}</b>
                  <span className="block text-[13px]" style={{ color: C.gris }}>{d.vendedores?.nombre} · {fechaLarga(d.fecha)}{b?.enviado_at ? ` · envió ${new Date(b.enviado_at).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}` : d.total_und ? ` · ${d.total_und} und` : ''}</span>
                  {b && <span className="block text-[13px] mt-1">Declara <b className="tabular-nums">{$(b.efectivo_declarado)}</b> en efectivo</span>}
                </span>
                <span className="shrink-0 text-right flex flex-col items-end gap-1">
                  {d.estado === 'por_aprobar' && b && (Math.abs(Number(b.diferencia)) < 1 ? pill('Cuadra', C.verde, C.verdeF) : pill(`Diferencia ${conSigno(Number(b.diferencia))}`, Number(b.diferencia) < 0 ? C.rojo : C.ambar, Number(b.diferencia) < 0 ? C.rojoF : C.ambarF))}
                  {d.estado === 'despachado' && (atraso > 0 ? pill(`Hace ${atraso} día${atraso === 1 ? '' : 's'}`, C.rojo, C.rojoF) : pill('En la calle', C.tinta, '#E9E4D6'))}
                  {d.estado === 'liquidado' && l && <><b className="tabular-nums">{$(l.efectivo)}</b><span className="text-[12.5px] font-bold" style={{ color: Number(l.diferencia) < 0 ? C.rojo : Math.abs(Number(l.diferencia)) < 1 ? C.gris : C.verde }}>{Math.abs(Number(l.diferencia)) < 1 ? 'Cuadra' : conSigno(Number(l.diferencia))}</span></>}
                </span>
              </button>
              {separar(d)}
            </div>
          )
        })}
      </div>
    )
    return (
      <div style={{ background: C.fondo, minHeight: '100vh', color: C.tinta }}>
        <PageHeader title="Liquidación" subtitle={`${porAprobar.length} por aprobar · ${sinLiquidar.length} sin liquidar`}
          actions={<button onClick={() => router.push('/historial')} className="px-3 min-h-[40px] rounded-xl text-[13.5px] font-bold" style={{ background: '#EFEDE6', color: '#1C1B19' }}>Historial</button>} />
        <div className="p-4 max-w-6xl mx-auto flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-3 items-start">
            {columna('Por aprobar', C.ambar, C.ambarF, porAprobar, 'Ningún vendedor ha enviado su cierre.', <span className="text-[12.5px]" style={{ color: C.gris }}>Las envió el vendedor</span>)}
            {columna('Sin liquidar', C.tinta, '#E9E4D6', sinLiquidar, 'No hay despachos abiertos.', <span className="text-[12.5px]" style={{ color: C.gris }}>Todavía no han enviado</span>)}
            {columna('Liquidadas', C.gris, C.suave, liquidadas, 'Ninguna liquidada ese día.',
              <input type="date" value={fechaLiquidados} onChange={e => { setFechaLiquidados(e.target.value); cargarDespachos(e.target.value) }} aria-label="Ver liquidadas de otro día"
                className="rounded-full px-3 min-h-[32px] text-[13px] bg-white border outline-none" style={{ borderColor: C.linea }} />)}
          </div>
        </div>
      </div>
    )
  }

  // ---------- 2. Revisar una liquidacion ----------
  const ls = lineasMezcladas()
  const dif = diferencia()
  const ticketsDe = (sku) => ventasRuta.reduce((s, v) => s + (v.ventas_ruta_detalle || []).filter(x => x.sku === sku).reduce((a, x) => a + Number(x.cantidad || 0), 0), 0)
  const lleno = (lista, campos) => lista.some(x => campos.some(c => x[c] !== '' && x[c] != null && x[c] !== '0'))
  const visible = (nombre, lista, campos) => abiertas.has(nombre) || lleno(lista, campos)
  const abrirSeccion = (nombre, lista, setLista, vacio) => { setAbiertas(prev => new Set([...prev, nombre])); if (lista.length === 0) setLista([vacio]) }
  const declarado = borrador ? Number(borrador.efectivo_declarado || 0) : null
  const SECCIONES = [
    ['creditos', '+ Crédito', fiados, setFiados, { nombre: '', valor: '', fecha_pago: '', cartera_fiados_id: '' }, ['nombre', 'valor']],
    ['abonos', '+ Abono a crédito', pagosFiados, setPagosFiados, { cartera_fiados_id: '', nombre_manual: '', valor: '' }, ['cartera_fiados_id', 'valor']],
    ['gastos', '+ Gasto', gastos, setGastos, { categoria: '', concepto: '', valor: '' }, ['categoria', 'valor']],
    ['obsequios', '+ Obsequio', obsequios, setObsequios, { sku: '', cantidad: '', autorizado_por: '' }, ['sku', 'cantidad']],
    ['consumo', '+ Consumo propio', consumoPropio, setConsumoPropio, { sku: '', cantidad: '' }, ['sku', 'cantidad']],
    ['mercancia', '+ Mercancía enviada', mercEnviada, setMercEnviada, { vendedor_id: '', sku: '', cantidad: '', momento: 'ruta' }, ['sku', 'cantidad']],
    ['descuentos', '+ Descuento', descuentos, setDescuentos, { sku: '', concepto: '', valor: '' }, ['sku', 'valor']],
  ]
  const ver = Object.fromEntries(SECCIONES.map(([n, , l, , , c]) => [n, visible(n, l, c)]))
  const quitarFila = (set, i) => set(prev => prev.filter((_, j) => j !== i))
  const cambiarFila = (set, i, campos) => set(prev => prev.map((x, j) => j === i ? { ...x, ...campos } : x))
  const X = ({ onClick }) => <button type="button" onClick={onClick} aria-label="Quitar" className="w-9 h-[42px] shrink-0 rounded-xl text-lg font-bold" style={{ background: C.suave }}>×</button>
  const prodOpc = ls.map(l => <option key={l.sku} value={l.sku}>{l.producto?.nombre} ({l.sku})</option>)
  const cabSeccion = (nombre, total, signo = '−', color) => (
    <div className="flex items-center justify-between gap-2">
      <h3 className="font-extrabold text-[16px]" style={titulo}>{nombre}</h3>
      {total > 0 && <b className="tabular-nums" style={{ color: color || (signo === '−' ? C.rojo : C.tinta) }}>{signo}{$(total)}</b>}
    </div>
  )
  const agregarFila = (set, vacio) => <button type="button" onClick={() => set(prev => [...prev, vacio])} className="min-h-[38px] rounded-xl text-[13px] font-bold" style={{ background: C.suave }}>+ Agregar otro</button>
  const fotosVendedor = comprobantes.filter(c => c.foto)

  const cuadre = (
    <div className={tarjeta + ' flex flex-col gap-1.5'}>
      <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: C.gris }}>Cuadre en vivo</span>
      {[
        ['Vendido', $(totalVendidoValor())],
        totalDomicilios() > 0 && ['Domicilios cobrados', '+' + $(totalDomicilios())],
        totalPagosFiados() > 0 && ['Abonos a créditos', '+' + $(totalPagosFiados())],
        base > 0 && ['Base', '+' + $(base)],
        totalFiados() > 0 && ['Créditos', '−' + $(totalFiados()), C.rojo],
        transfPorVerificar() > 0 && ['Transf. por verificar', '−' + $(transfPorVerificar()), C.rojo],
        totalObsequios() > 0 && ['Obsequios', '−' + $(totalObsequios()), C.rojo],
        totalConsumoPropio() > 0 && ['Consumo propio', '−' + $(totalConsumoPropio()), C.rojo],
        totalDescuentos() > 0 && ['Descuentos', '−' + $(totalDescuentos()), C.rojo],
      ].filter(Boolean).map(([t, v, color]) => (
        <div key={t} className="flex justify-between gap-3 text-[14px]"><span style={{ color: C.gris }}>{t}</span><b className="tabular-nums" style={{ color }}>{v}</b></div>
      ))}
      <div className="flex justify-between gap-3 text-[14.5px] pt-1.5 mt-0.5" style={{ borderTop: `1px solid ${C.linea}` }}><b>Debe entregar</b><b className="tabular-nums">{$(totalAEntregar())}</b></div>
      <div className="flex justify-between gap-3 text-[14px]"><span style={{ color: C.gris }}>Efectivo</span><b className="tabular-nums">{$(efectivo)}</b></div>
      {transfVerificadas() > 0 && <div className="flex justify-between gap-3 text-[14px]"><span style={{ color: C.gris }}>Transf. verificadas</span><b className="tabular-nums">{$(transfVerificadas())}</b></div>}
      {totalGastos() > 0 && <div className="flex justify-between gap-3 text-[14px]"><span style={{ color: C.gris }}>Gastos</span><b className="tabular-nums">{$(totalGastos())}</b></div>}
      <div className="rounded-2xl px-3 py-2.5 mt-1 flex justify-between items-center gap-2" style={{ background: Math.abs(dif) < 1 ? C.verdeF : dif < 0 ? C.rojoF : C.ambarF }}>
        <span className="font-bold" style={{ color: Math.abs(dif) < 1 ? C.verde : dif < 0 ? C.rojo : C.ambar }}>Diferencia</span>
        <span className="font-extrabold text-[22px] tabular-nums" style={{ ...titulo, color: Math.abs(dif) < 1 ? C.verde : dif < 0 ? C.rojo : C.ambar }}>{Math.abs(dif) < 1 ? 'Cuadra' : conSigno(dif)}</span>
      </div>
      {borrador && <p className="text-[12.5px]" style={{ color: C.gris }}>{despachoSel?.vendedores?.nombre} declaró {Math.abs(Number(borrador.diferencia || 0)) < 1 ? 'que cuadraba' : `una diferencia de ${conSigno(Number(borrador.diferencia || 0))}`}.</p>}
      <button onClick={guardarLiquidacion} disabled={guardando} className="min-h-[50px] rounded-2xl font-bold text-white mt-1 disabled:opacity-50" style={{ background: C.rojo }}>
        {guardando ? 'Guardando…' : borrador ? 'Aprobar liquidación' : 'Guardar liquidación'}
      </button>
    </div>
  )

  return (
    <div style={{ background: C.fondo, minHeight: '100vh', color: C.tinta }}>
      <PageHeader title="Liquidación" subtitle={`${(despachoSel?._rutasNombres || [despachoSel?.rutas?.nombre]).filter(Boolean).join(' + ')} · ${despachoSel?.vendedores?.nombre || ''}`}
        onBack={() => { setPaso(1); setDespachoSel(null); setBorrador(null); cargarDespachos(fechaLiquidados) }} />
      <div className="p-4 max-w-6xl mx-auto flex flex-col gap-3 pb-28 lg:pb-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-extrabold text-[24px] leading-tight" style={titulo}>{(despachoSel?._rutasNombres || [despachoSel?.rutas?.nombre]).filter(Boolean).join(' + ')}</h1>
            <p style={{ color: C.gris }}>{despachoSel?.vendedores?.nombre} · {despachoSel ? fechaLarga(despachoSel.fecha) : ''}{grupoDespachoIds.length > 1 ? ` · ${grupoDespachoIds.length} despachos juntos` : ''}</p>
          </div>
          {despachoSel?.estado === 'liquidado' && usuario?.rol === 'admin' && (
            <button onClick={reabrirLiquidacion} disabled={guardando} className="px-3 min-h-[38px] rounded-xl text-[13px] font-bold bg-white disabled:opacity-50" style={{ color: C.rojo }}>Reabrir liquidación</button>
          )}
        </div>

        {borrador && (
          <div className="rounded-2xl px-3.5 py-3 text-[14px]" style={{ background: C.ambarF, color: C.ambar }}>
            <b>Por aprobar.</b> La envió {borrador.enviado_por || 'el vendedor'} el {new Date(borrador.enviado_at).toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}. Verifique la devolución y el recaudo, y corrija las diferencias. Hasta su aprobación no afecta caja, cartera ni inventario.
            {borrador.cuantos > 1 && <span className="block font-bold mt-1">Envió {borrador.cuantos} cierres para estos despachos; se cargó solo el primero. Liquídalos por separado.</span>}
          </div>
        )}
        {cargadoDeKiosco && <div className="rounded-2xl px-3.5 py-3 text-[14px] bg-white">Datos cargados de la liquidación guardada. Revisa y corrige si hace falta.</div>}

        <div className="flex gap-1 bg-white rounded-full p-1 self-start max-w-full overflow-x-auto" role="tablist">
          {[['devolucion', '1', 'Devolución y cambios'], ['plata', '2', 'Recaudo']].map(([id, n, t]) => (
            <button key={id} role="tab" aria-selected={pestana === id} onClick={() => setPestana(id)} className="px-4 min-h-[38px] rounded-full text-[13.5px] font-bold whitespace-nowrap flex items-center gap-2"
              style={pestana === id ? { background: C.tinta, color: '#fff' } : { color: C.gris }}>
              <span className="w-5 h-5 rounded-full inline-flex items-center justify-center text-[11px]" style={pestana === id ? { background: '#F2B21B', color: C.tinta } : { background: C.fondo }}>{n}</span>{t}
            </button>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_330px] items-start">
          <div className="flex flex-col gap-3 min-w-0">
            {pestana === 'devolucion' ? (
              <>
                {(pendientesComoOrigen.length > 0 || pendientesComoDestino.length > 0) && (
                  <div className="rounded-2xl p-3.5 flex flex-col gap-2" style={{ background: C.ambarF }}>
                    <b style={{ color: C.ambar }}>Mercancía entre vendedores por confirmar</b>
                    {[...pendientesComoOrigen.map(t => [t, true]), ...pendientesComoDestino.map(t => [t, false])].map(([t, esOrigen]) => (
                      <div key={t.id} className="bg-white rounded-xl p-3 flex flex-wrap justify-between items-center gap-2">
                        <p className="text-[14px] min-w-0 flex-1">{esOrigen
                          ? `${t.destino?.nombre || 'Un vendedor'} dice que recibió ${t.cantidad} ${productosMap[t.sku]?.nombre || t.sku} de ${despachoSel?.vendedores?.nombre}.`
                          : `${t.origen?.nombre || 'Un vendedor'} dice que le pasó ${t.cantidad} ${productosMap[t.sku]?.nombre || t.sku} a ${despachoSel?.vendedores?.nombre}.`}</p>
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => rechazarPendiente(t, esOrigen)} disabled={procesandoConfirmacion} className="px-3 min-h-[38px] rounded-xl text-[13px] font-bold disabled:opacity-50" style={{ background: C.suave }}>Rechazar</button>
                          <button onClick={() => confirmarPendiente(t, esOrigen)} disabled={procesandoConfirmacion} className="px-3 min-h-[38px] rounded-xl text-[13px] font-bold disabled:opacity-50" style={{ background: C.verdeF, color: C.verde }}>Confirmar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {ventasRuta.length > 0 && (() => {
                  const por = (f) => ventasRuta.filter(v => v.forma_pago === f).reduce((s, v) => s + Number(v.total || 0), 0)
                  return (
                    <div className={tarjeta + ' grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3'}>
                      {[[`${ventasRuta.length} tickets`, por('efectivo') + por('transferencia') + por('credito'), true], ['Efectivo', por('efectivo')], ['Transferencia', por('transferencia')], ['Crédito', por('credito')]].map(([et, va, total]) => (
                        <div key={et} className="flex flex-col min-w-0">
                          <span className="text-[11.5px] font-bold uppercase tracking-wide" style={{ color: C.gris }}>{et}</span>
                          <span className={`tabular-nums leading-tight ${total ? 'font-extrabold text-[18px]' : 'font-bold text-[16px]'}`}>{$(va)}</span>
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {/* Tipo hoja de calculo: Enter / flecha abajo baja, arriba sube,
                    izquierda/derecha cambia entre lo que trajo y el cambio. */}
                <div className={tarjeta + ' flex flex-col gap-2'}>
                  <div className="flex flex-wrap justify-between gap-2 items-baseline">
                    <h3 className="font-extrabold text-[17px]" style={titulo}>¿Qué trajo de vuelta?</h3>
                    {ventasRuta.length > 0 && <span className="text-[12.5px]" style={{ color: C.gris }}>Debería = salió − tickets</span>}
                  </div>
                  {/* Se acomoda al ancho: con espacio es tabla; en pantalla angosta
                      cada producto es una ficha con sus cantidades en dos filas. */}
                  {(() => {
                    const conTk = ventasRuta.length > 0
                    const cols = { '--cols': conTk ? 'minmax(0,1fr) 60px 68px 72px 88px 88px 104px' : 'minmax(0,1fr) 60px 88px 88px 104px', '--cols-sm': 'repeat(3,minmax(0,1fr))' }
                    const fila = 'grid gap-x-3 gap-y-2 items-start @2xl:items-center [grid-template-columns:var(--cols-sm)] @2xl:[grid-template-columns:var(--cols)]'
                    const et = (t, color) => <span className="@2xl:hidden block text-[11px] font-bold uppercase tracking-wide" style={{ color: color || C.gris }}>{t}</span>
                    const celda = 'flex flex-col items-center @2xl:block @2xl:text-center min-w-0'
                    const num = (v) => <span className="min-h-[40px] flex items-center @2xl:min-h-0 @2xl:block">{v}</span>
                    const input = 'w-full max-w-[88px] @2xl:max-w-none text-center rounded-xl min-h-[40px] font-bold bg-white border outline-none focus:border-[#1C1B19]'
                    return (
                      <div className="@container text-[14px] tabular-nums" style={cols}>
                        <div className={fila + ' hidden @2xl:grid text-[11.5px] uppercase tracking-wide font-bold py-2 whitespace-nowrap'} style={{ color: C.gris }}>
                          <span>Producto</span><span className="text-center">Salió</span>
                          {conTk && <span className="text-center">Tickets</span>}
                          {conTk && <span className="text-center">Debería</span>}
                          <span className="text-center">Trajo</span><span className="text-center" style={{ color: C.rojo }}>Cambio</span><span className="text-right">Vendido</span>
                        </div>
                        {ls.map((l, i) => {
                          const tk = conTk ? ticketsDe(l.sku) : null
                          const deberia = tk != null ? l.despachadoEfectivo - tk : null
                          const contado = parseFloat(devoluciones[l.sku] || 0)
                          const nota = deberia == null ? null : contado === deberia ? ['Coincide', C.gris] : contado < deberia ? [`Trajo ${deberia - contado} menos: vendidas sin ticket o faltante`, C.ambar] : ['Trajo más de lo que dicen los tickets', C.ambar]
                          return (
                            <div key={l.sku} className={fila + ' py-3'} style={{ borderTop: `1px solid ${C.linea}` }}>
                              <div className="col-span-full @2xl:col-span-1 min-w-0">
                                <b className="block leading-tight">{l.producto?.nombre}</b>
                                <span className="block text-[12px]" style={{ color: C.gris }}>
                                  {l.sku}{l.recibidos.map((r, k) => <span key={'r' + k}> · +{r.cantidad} de {r.nombre}</span>)}{l.enviados.map((e, k) => <span key={'e' + k}> · −{e.cantidad} a {e.nombre}{e.deDevolucion ? ' (de la devolución)' : ''}</span>)}
                                </span>
                                {nota && <span className="block text-[12px] font-bold mt-0.5" style={{ color: nota[1] }}>{nota[0]}</span>}
                              </div>
                              <div className={celda}>{et('Salió')}{num(l.despachadoEfectivo)}</div>
                              {tk != null && <div className={celda}>{et('Tickets')}{num(tk)}</div>}
                              {deberia != null && <div className={celda + ' font-bold'}>{et('Debería')}{num(deberia)}</div>}
                              <div className={celda}>
                                {et('Trajo')}
                                <input type="text" inputMode="decimal" placeholder="0" value={devoluciones[l.sku] ?? ''} data-grilla="dev" data-fila={i} aria-label={`Trajo ${l.producto?.nombre}`}
                                  onFocus={e => e.target.select()} onKeyDown={e => navegarGrilla(e, 'dev', i)}
                                  onChange={e => setDevoluciones(prev => ({ ...prev, [l.sku]: e.target.value.replace(',', '.').replace(/[^0-9.]/g, '') }))}
                                  className={input} style={{ borderColor: nota && nota[1] === C.ambar ? '#F2B21B' : C.linea }} />
                              </div>
                              <div className={celda}>
                                {et('Cambio', C.rojo)}
                                <input type="text" inputMode="decimal" placeholder="0" value={cambios[l.sku] ?? ''} data-grilla="cam" data-fila={i} aria-label={`Cambio ${l.producto?.nombre}`}
                                  onFocus={e => e.target.select()} onKeyDown={e => navegarGrilla(e, 'cam', i)}
                                  onChange={e => setCambios(prev => ({ ...prev, [l.sku]: e.target.value.replace(',', '.').replace(/[^0-9.]/g, '') }))}
                                  className={input} style={{ borderColor: C.rojoF }} />
                              </div>
                              <div className={`flex min-w-0 font-bold whitespace-nowrap @2xl:col-span-1 @2xl:block @2xl:text-right ${conTk ? 'flex-col items-center' : 'col-span-full justify-between items-baseline'}`}>{et('Vendido')}{$(l.efectivoEsperado)}</div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </div>

                <div className={tarjeta + ' flex flex-col gap-2'}>
                  <button onClick={() => setVerRecibo(!verRecibo)} className="flex justify-between items-center text-left">
                    <b className="text-[15px]">Mercancía que le pasó otro vendedor</b><span className="text-[13px] font-bold" style={{ color: C.gris }}>{verRecibo ? 'Ocultar' : 'Anotar'}</span>
                  </button>
                  {verRecibo && (
                    <>
                      <select value={nuevoRecibo.vendedor_id} onChange={e => setNuevoRecibo({ ...nuevoRecibo, vendedor_id: e.target.value })} className={campo} style={{ borderColor: C.linea }}>
                        <option value="">¿De quién lo recibió?</option>
                        {vendedores.filter(v => v.id !== despachoSel?.vendedor_id).map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                      </select>
                      <div className="flex gap-2">
                        <select value={nuevoRecibo.sku} onChange={e => setNuevoRecibo({ ...nuevoRecibo, sku: e.target.value })} className={campo + ' flex-1 min-w-0'} style={{ borderColor: C.linea }}>
                          <option value="">Producto</option>
                          {Object.values(productosMap).map(p => <option key={p.sku} value={p.sku}>{p.nombre} ({p.sku})</option>)}
                        </select>
                        <input type="number" placeholder="Cant." value={nuevoRecibo.cantidad} onChange={e => setNuevoRecibo({ ...nuevoRecibo, cantidad: e.target.value })} className={campo + ' w-24 text-center font-bold'} style={{ borderColor: C.linea }} />
                      </div>
                      {errorRecibo && <p className="text-[13px]" style={{ color: C.rojo }}>{errorRecibo}</p>}
                      <button onClick={registrarMercanciaRecibida} disabled={guardandoRecibo} className="min-h-[42px] rounded-xl font-bold disabled:opacity-50" style={{ background: C.suave, color: C.tinta }}>{guardandoRecibo ? 'Guardando…' : 'Registrar'}</button>
                    </>
                  )}
                </div>
                <button onClick={() => { setPestana('plata'); window.scrollTo(0, 0) }} className="min-h-[50px] rounded-2xl font-bold self-end px-6" style={{ background: C.suave, color: C.tinta }}>Seguir con la plata</button>
              </>
            ) : (
              <>
                <div className={tarjeta + ' grid gap-3 sm:grid-cols-2 items-center'}>
                  <label className="flex flex-col gap-1 text-[13px] font-bold" style={{ color: C.gris }} htmlFor="liq-efectivo">Efectivo que contaste
                    <InputDinero id="liq-efectivo" value={efectivo} onChange={e => setEfectivo(e.target.value)} placeholder="$0"
                      className="w-full text-center rounded-xl min-h-[56px] text-[28px] font-extrabold bg-white border outline-none focus:border-[#1C1B19]" style={{ ...titulo, borderColor: C.linea, color: C.tinta }} />
                  </label>
                  {declarado != null && (
                    <div className="rounded-2xl px-3.5 py-3 flex flex-col gap-0.5" style={{ background: C.fondo }}>
                      <span className="text-[13px]" style={{ color: C.gris }}>{despachoSel?.vendedores?.nombre} dijo</span>
                      <b className="text-[22px] tabular-nums" style={titulo}>{$(declarado)}</b>
                      {efectivo !== '' && Math.abs(parseFloat(efectivo || 0) - declarado) >= 1 && (
                        <span className="text-[13px] font-bold" style={{ color: parseFloat(efectivo || 0) < declarado ? C.rojo : C.ambar }}>
                          {parseFloat(efectivo || 0) < declarado ? `Faltan ${$(declarado - parseFloat(efectivo || 0))}` : `Sobran ${$(parseFloat(efectivo || 0) - declarado)}`} frente a lo que declaró
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <ComprobantesTransferencia comprobantes={comprobantes} setComprobantes={setComprobantes} esAdmin={usuario?.rol === 'admin'} fechaLiquidacion={despachoSel?.fecha} />
                {fotosVendedor.length > 0 && (
                  <div className={tarjeta + ' flex flex-wrap gap-2 items-center -mt-1'}>
                    <span className="text-[13px] font-bold" style={{ color: C.gris }}>Fotos que mandó el vendedor:</span>
                    {fotosVendedor.map((c, i) => <button key={c.key || i} onClick={() => abrirFoto(c.foto)} className="px-3 min-h-[34px] rounded-full text-[13px] font-bold" style={{ background: C.suave }}>{$(c.valor)}{c.banco ? ` · ${c.banco}` : ''}</button>)}
                  </div>
                )}

                {ver.creditos && (
                  <section className={tarjeta + ' flex flex-col gap-2'}>
                    {cabSeccion('Créditos que dio', totalFiados())}
                    <datalist id="clientes-ruta">{clientesRuta.map(c => <option key={c.id} value={opcionCliente(c)} />)}</datalist>
                    {fiados.map((f, i) => (
                      <div key={i} className="flex flex-wrap gap-2 py-1" style={{ borderTop: i ? `1px solid ${C.linea}` : 0 }}>
                        <input type="text" placeholder="Cliente (escribe y escoge)" value={f.nombre} list="clientes-ruta"
                          onChange={e => cambiarFila(setFiados, i, { nombre: e.target.value, cliente_id: clienteDeOpcion(e.target.value)?.id || null })} className={campo + ' flex-1 min-w-[180px]'} style={{ borderColor: C.linea }} />
                        <InputDinero placeholder="Valor" value={f.valor} onChange={e => cambiarFila(setFiados, i, { valor: e.target.value })} className={campo + ' w-32 font-bold text-right'} style={{ borderColor: C.linea }} />
                        <input type="date" value={f.fecha_pago} onChange={e => cambiarFila(setFiados, i, { fecha_pago: e.target.value })} aria-label="Fecha de pago" className={campo + ' w-40'} style={{ borderColor: C.linea }} />
                        <X onClick={() => quitarFila(setFiados, i)} />
                      </div>
                    ))}
                    {agregarFila(setFiados, { nombre: '', valor: '', fecha_pago: '', cartera_fiados_id: '' })}
                    <p className="text-[12px]" style={{ color: C.gris }}>Sin fecha de pago, vence con el plazo del cliente (7 días si no tiene).</p>
                  </section>
                )}

                {ver.abonos && (
                  <section className={tarjeta + ' flex flex-col gap-2'}>
                    {cabSeccion('Abonos a créditos', totalPagosFiados(), '+')}
                    {pagosFiados.map((p, i) => (
                      <div key={i} className="flex flex-col gap-1.5 py-1" style={{ borderTop: i ? `1px solid ${C.linea}` : 0 }}>
                        <div className="flex flex-wrap gap-2">
                          <select value={p.cartera_fiados_id} onChange={e => actualizarPago(i, { cartera_fiados_id: e.target.value, nombre_manual: '' })} className={campo + ' flex-1 min-w-[200px]'} style={{ borderColor: C.linea }}>
                            <option value="">¿Qué crédito está pagando?</option>
                            {fiadosPendientes.map(f => <option key={f.id} value={f.id}>{f.nombre_cliente} (debe {$(f.saldo)})</option>)}
                            <option value="__otro__">Otro (no está en la lista)</option>
                          </select>
                          {p.cartera_fiados_id === '__otro__' && <input type="text" placeholder="Nombre del cliente" value={p.nombre_manual} onChange={e => actualizarPago(i, { nombre_manual: e.target.value })} className={campo + ' flex-1 min-w-[160px]'} style={{ borderColor: C.linea }} />}
                          <InputDinero placeholder="Valor" value={p.valor} onChange={e => actualizarPago(i, { valor: e.target.value })} className={campo + ' w-32 font-bold text-right'} style={{ borderColor: C.linea }} />
                        </div>
                        <div className="flex gap-2">
                          {[['efectivo', 'Pagó en efectivo'], ['transferencia', 'Pagó por transferencia']].map(([id, t]) => (
                            <button key={id} type="button" onClick={() => actualizarPago(i, { forma: id })} className="flex-1 min-h-[36px] rounded-xl text-[13px] font-bold"
                              style={(p.forma || 'efectivo') === id ? { background: '#fff', color: C.tinta, boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: C.suave, color: C.gris }}>{t}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {agregarFila(setPagosFiados, { cartera_fiados_id: '', nombre_manual: '', valor: '' })}
                  </section>
                )}

                {ver.gastos && (
                  <section className={tarjeta + ' flex flex-col gap-2'}>
                    {cabSeccion('Gastos de ruta', totalGastos(), '', C.tinta)}
                    {gastos.map((g, i) => (
                      <div key={i} className="flex flex-wrap gap-2 py-1 items-center" style={{ borderTop: i ? `1px solid ${C.linea}` : 0 }}>
                        <select value={g.categoria} onChange={e => cambiarFila(setGastos, i, { categoria: e.target.value })} className={campo + ' w-44'} style={{ borderColor: C.linea }}>
                          <option value="">Categoría</option>
                          {[...new Set([...CATEGORIAS_GASTOS, g.categoria].filter(Boolean))].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <input type="text" placeholder="Nota (opcional)" value={g.concepto} onChange={e => cambiarFila(setGastos, i, { concepto: e.target.value })} className={campo + ' flex-1 min-w-[140px]'} style={{ borderColor: C.linea }} />
                        <InputDinero placeholder="Valor" value={g.valor} onChange={e => cambiarFila(setGastos, i, { valor: e.target.value })} className={campo + ' w-32 font-bold text-right'} style={{ borderColor: C.linea }} />
                        {g.foto && <button onClick={() => abrirFoto(g.foto)} className="px-3 min-h-[42px] rounded-xl text-[13px] font-bold" style={{ background: C.verdeF, color: C.verde }}>Ver recibo</button>}
                        <X onClick={() => quitarFila(setGastos, i)} />
                      </div>
                    ))}
                    {agregarFila(setGastos, { categoria: '', concepto: '', valor: '' })}
                  </section>
                )}

                {ver.obsequios && (
                  <section className={tarjeta + ' flex flex-col gap-2'}>
                    {cabSeccion('Obsequios', totalObsequios())}
                    {obsequios.map((o, i) => (
                      <div key={i} className="flex flex-wrap gap-2 py-1" style={{ borderTop: i ? `1px solid ${C.linea}` : 0 }}>
                        <select value={o.sku} onChange={e => cambiarFila(setObsequios, i, { sku: e.target.value })} className={campo + ' flex-1 min-w-[180px]'} style={{ borderColor: C.linea }}><option value="">Producto</option>{prodOpc}</select>
                        <input type="number" placeholder="Cant." value={o.cantidad} onChange={e => cambiarFila(setObsequios, i, { cantidad: e.target.value })} className={campo + ' w-24 text-center font-bold'} style={{ borderColor: C.linea }} />
                        <select value={o.autorizado_por} onChange={e => cambiarFila(setObsequios, i, { autorizado_por: e.target.value })} className={campo + ' w-32'} style={{ borderColor: C.linea }}>
                          <option value="">Autorizó</option>{AUTORIZADORES_OBSEQUIOS.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                        <X onClick={() => quitarFila(setObsequios, i)} />
                      </div>
                    ))}
                    {agregarFila(setObsequios, { sku: '', cantidad: '', autorizado_por: '' })}
                  </section>
                )}

                {ver.consumo && (
                  <section className={tarjeta + ' flex flex-col gap-2'}>
                    {cabSeccion('Consumo propio', totalConsumoPropio())}
                    {sinEmpleado && <p className="rounded-xl px-3 py-2 text-[13px] font-bold" style={{ background: C.ambarF, color: C.ambar }}>{despachoSel?.vendedores?.nombre} no tiene empleado ligado en Nómina: este consumo no se le va a descontar. Lígalo en Nómina.</p>}
                    {consumoPropio.map((c, i) => (
                      <div key={i} className="flex flex-wrap gap-2 py-1" style={{ borderTop: i ? `1px solid ${C.linea}` : 0 }}>
                        <select value={c.sku} onChange={e => cambiarFila(setConsumoPropio, i, { sku: e.target.value })} className={campo + ' flex-1 min-w-[180px]'} style={{ borderColor: C.linea }}><option value="">Producto</option>{prodOpc}</select>
                        <input type="number" placeholder="Cant." value={c.cantidad} onChange={e => cambiarFila(setConsumoPropio, i, { cantidad: e.target.value })} className={campo + ' w-24 text-center font-bold'} style={{ borderColor: C.linea }} />
                        <X onClick={() => quitarFila(setConsumoPropio, i)} />
                      </div>
                    ))}
                    {agregarFila(setConsumoPropio, { sku: '', cantidad: '' })}
                  </section>
                )}

                {ver.mercancia && (
                  <section className={tarjeta + ' flex flex-col gap-2'}>
                    {cabSeccion('Mercancía enviada', 0)}
                    {mercEnviada.map((m, i) => (
                      <div key={i} className="flex flex-col gap-1.5 py-1" style={{ borderTop: i ? `1px solid ${C.linea}` : 0 }}>
                        <div className="flex flex-wrap gap-2">
                          <select value={m.vendedor_id} onChange={e => cambiarFila(setMercEnviada, i, { vendedor_id: e.target.value })} className={campo + ' w-48'} style={{ borderColor: C.linea }}>
                            <option value="">¿A quién?</option>{vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                          </select>
                          <select value={m.sku} onChange={e => cambiarFila(setMercEnviada, i, { sku: e.target.value })} className={campo + ' flex-1 min-w-[160px]'} style={{ borderColor: C.linea }}><option value="">Producto</option>{prodOpc}</select>
                          <input type="number" placeholder="Cant." value={m.cantidad} onChange={e => cambiarFila(setMercEnviada, i, { cantidad: e.target.value })} className={campo + ' w-24 text-center font-bold'} style={{ borderColor: C.linea }} />
                          <X onClick={() => quitarFila(setMercEnviada, i)} />
                        </div>
                        <div className="flex gap-2">
                          {[['ruta', 'Durante la ruta'], ['devolucion', 'Al llegar, de la devolución']].map(([id, t]) => (
                            <button key={id} type="button" onClick={() => cambiarFila(setMercEnviada, i, { momento: id })} className="flex-1 min-h-[36px] rounded-xl text-[13px] font-bold"
                              style={(m.momento || 'ruta') === id ? { background: '#fff', color: C.tinta, boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: C.suave, color: C.gris }}>{t}</button>
                          ))}
                        </div>
                        {m.sku && m.cantidad && <p className="text-[12px] text-right" style={{ color: C.gris }}>{(m.momento || 'ruta') === 'devolucion' ? 'Sale de la devolución contada: no se resta de lo vendido' : `−${$(parseFloat(m.cantidad) * getPrecio(m.sku))} de lo vendido`}</p>}
                      </div>
                    ))}
                    {agregarFila(setMercEnviada, { vendedor_id: '', sku: '', cantidad: '', momento: 'ruta' })}
                    {totalMercEnviadaInfo() > 0 && <p className="text-[12px]" style={{ color: C.gris }}>Total enviado {$(totalMercEnviadaInfo())}: se le carga a quien lo recibe.</p>}
                  </section>
                )}

                {ver.descuentos && (
                  <section className={tarjeta + ' flex flex-col gap-2'}>
                    {cabSeccion('Descuentos', totalDescuentos())}
                    {descuentos.map((d, i) => (
                      <div key={i} className="flex flex-wrap gap-2 py-1" style={{ borderTop: i ? `1px solid ${C.linea}` : 0 }}>
                        <select value={d.sku} onChange={e => cambiarFila(setDescuentos, i, { sku: e.target.value, concepto: d.concepto || e.target.value })} className={campo + ' flex-1 min-w-[180px]'} style={{ borderColor: C.linea }}><option value="">Producto</option>{prodOpc}</select>
                        <input type="text" placeholder="Motivo" value={d.concepto} onChange={e => cambiarFila(setDescuentos, i, { concepto: e.target.value })} className={campo + ' w-40'} style={{ borderColor: C.linea }} />
                        <InputDinero placeholder="Valor" value={d.valor} onChange={e => cambiarFila(setDescuentos, i, { valor: e.target.value })} className={campo + ' w-32 font-bold text-right'} style={{ borderColor: C.linea }} />
                        <X onClick={() => quitarFila(setDescuentos, i)} />
                      </div>
                    ))}
                    {agregarFila(setDescuentos, { sku: '', concepto: '', valor: '' })}
                  </section>
                )}

                {SECCIONES.some(([n]) => !ver[n]) && (
                  <div className={tarjeta + ' flex flex-col gap-2'}>
                    <b className="text-[15px]">¿Algo más?</b>
                    <div className="flex flex-wrap gap-2">
                      {SECCIONES.filter(([n]) => !ver[n]).map(([n, t, l, set, vacio]) => (
                        <button key={n} onClick={() => abrirSeccion(n, l, set, vacio)} className="px-3 min-h-[38px] rounded-full text-[13px] font-bold border-[1.5px] border-dashed" style={{ borderColor: C.linea, color: C.gris }}>{t}</button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <aside className="hidden lg:block lg:sticky lg:top-24">{cuadre}</aside>
        </div>

        <div className="lg:hidden">{pestana === 'plata' && cuadre}</div>
      </div>

      <div className="lg:hidden fixed bottom-0 inset-x-0 z-20 px-4" style={{ paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="max-w-6xl mx-auto rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3" style={{ background: C.tinta, color: '#fff', boxShadow: '0 10px 30px rgba(28,27,25,.25)' }}>
          <span><span className="block text-[12px] opacity-75">Diferencia</span><b className="text-[20px] tabular-nums" style={{ ...titulo, color: Math.abs(dif) < 1 ? '#9FD3AC' : dif < 0 ? '#F7A5B1' : '#F2C56A' }}>{Math.abs(dif) < 1 ? 'Cuadra' : conSigno(dif)}</b></span>
          {pestana === 'devolucion'
            ? <button onClick={() => { setPestana('plata'); window.scrollTo(0, 0) }} className="px-4 min-h-[42px] rounded-xl font-bold" style={{ background: '#fff', color: C.tinta }}>Recaudo</button>
            : <button onClick={guardarLiquidacion} disabled={guardando} className="px-4 min-h-[42px] rounded-xl font-bold text-white disabled:opacity-50" style={{ background: C.rojo }}>{guardando ? 'Guardando…' : borrador ? 'Aprobar' : 'Guardar'}</button>}
        </div>
      </div>
    </div>
  )
}
