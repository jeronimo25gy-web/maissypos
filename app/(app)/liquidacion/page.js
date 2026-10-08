'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { crearAlertaAdmin } from '@/lib/alertas-admin'
import { puedeVerModulo } from '@/lib/permisos'
import { PageHeader } from '@/components/ui'
import ComprobantesTransferencia, { totalesComprobantes, comprobanteDesdeFila, comprobanteEditable } from '@/components/ComprobantesTransferencia'

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
  const [fechaLiquidados, setFechaLiquidados] = useState(obtenerFechaActual())
  const [nuevoRecibo, setNuevoRecibo] = useState({ vendedor_id: '', sku: '', cantidad: '' })
  const [guardandoRecibo, setGuardandoRecibo] = useState(false)
  const [errorRecibo, setErrorRecibo] = useState('')
  const [pendientesComoOrigen, setPendientesComoOrigen] = useState([])
  const [pendientesComoDestino, setPendientesComoDestino] = useState([])
  const [procesandoConfirmacion, setProcesandoConfirmacion] = useState(false)
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
      .eq('estado', 'despachado')
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
  }

  const seleccionarDespacho = async (d) => {
    setDespachoSel(d)
    const grupoIds = d._grupoIds && d._grupoIds.length > 0 ? d._grupoIds : [d.id]
    setGrupoDespachoIds(grupoIds)
    const fecha = d.fecha
    const { data: detRaw } = await supabase.from('despachos_detalle').select('*').in('despacho_id', grupoIds).eq('empresa_id', getEmpresaId())
    const { data: prods } = await supabase.from('productos').select('sku, nombre, precio_venta').eq('empresa_id', getEmpresaId()).order('nombre')
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
        const pagosData = liqFiados.filter(f => f.tipo === 'pago_fiado').map(f => ({
          cartera_fiados_id: f.cartera_fiados_id || '__otro__',
          nombre_manual: f.cartera_fiados_id ? '' : f.nombre_cliente,
          valor: String(f.valor)
        }))
        if (fiadosData.length > 0) setFiados(fiadosData)
        if (pagosData.length > 0) setPagosFiados(pagosData)
      }

      const { data: fiadosPend } = await supabase
        .from('cartera_fiados')
        .select('id, nombre_cliente, saldo, valor_original, estado')
        .eq('vendedor_id', d.vendedor_id)
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
    setPaso(2)
  }

  const getPrecio = (sku) => {
    const p = detalle.find(d => d.sku === sku)
    return (p && p.producto?.precio_venta) || productosMap[sku]?.precio_venta || 0
  }

  const transRecibidasContables = () => transRecibidas.filter(t => t.estado === 'aplicada' && !t.aplicada)

  const lineasMezcladas = () => {
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
    return Object.values(mapa).map(l => {
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
      return { ...l, despachadoEfectivo, devuelto, devueltoContado, enviadoDeDevolucion, cambio, vendidoNeto, precio, efectivoEsperado: vendidoNeto * precio }
    })
  }

  const totalVendidoValor = () => lineasMezcladas().reduce((sum, l) => sum + l.efectivoEsperado, 0)
  const totalMercEnviadaInfo = () =>
    mercEnviada.reduce((sum, m) => sum + parseFloat(m.cantidad || 0) * getPrecio(m.sku), 0) +
    transEnviadasHoy.filter(t => t.estado !== 'rechazada').reduce((sum, t) => sum + (t.valor_total || 0), 0)
  const totalMercRecibidaInfo = () => transRecibidasContables().reduce((sum, t) => sum + (t.valor_total || 0), 0)
  const totalFiados = () => fiados.reduce((sum, f) => sum + parseFloat(f.valor || 0), 0)
  const totalPagosFiados = () => pagosFiados.reduce((sum, p) => sum + parseFloat(p.valor || 0), 0)
  const totalGastos = () => gastos.reduce((sum, g) => sum + parseFloat(g.valor || 0), 0)
  const totalDescuentos = () => descuentos.reduce((sum, d) => sum + parseFloat(d.valor || 0), 0)
  const totalObsequios = () => obsequios.reduce((sum, o) => sum + parseFloat(o.cantidad || 0) * getPrecio(o.sku), 0)
  const totalConsumoPropio = () => consumoPropio.reduce((sum, c) => sum + parseFloat(c.cantidad || 0) * getPrecio(c.sku), 0)
  const transfVerificadas = () => totalesComprobantes(comprobantes).verificadas
  const transfPorVerificar = () => totalesComprobantes(comprobantes).porVerificar
  // Lo "por verificar" se trata como un credito: no es plata que entrega hoy,
  // queda como deuda del vendedor hasta que llegue o se le descuente.
  const totalAEntregar = () => totalVendidoValor() + base - totalFiados() + totalPagosFiados() - totalDescuentos() - totalObsequios() - totalConsumoPropio() - transfPorVerificar()
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
      .eq('motivo', 'Reportado en liquidacion del kiosco').eq('revisado', false)
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
        const novedadesReg = cambiosReportados.filter(l => !skusYaReportados.has(l.sku)).map(l => ({
          empresa_id: empresaId, fecha, vendedor_id: despachoSel.vendedor_id,
          sku: l.sku, cantidad: l.cambio,
          tipo: 'mano_a_mano', momento: 'en_ruta', quien_registra: 'vendedor',
          motivo: 'Reportado en liquidacion del kiosco', revisado: false
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
            .update({ nombre_cliente: f.nombre, valor_original: nuevoValor, saldo: nuevoSaldo, fecha_pago: f.fecha_pago || null })
            .eq('id', f.cartera_fiados_id).eq('empresa_id', empresaId)
          if (errUpdCart) fallos.push('cartera de créditos (actualizar)')
        } else {
          const { error: errInsCart } = await supabase.from('cartera_fiados').insert({
            empresa_id: empresaId, despacho_id: despachoSel.id, ruta_id: despachoSel.ruta_id, vendedor_id: despachoSel.vendedor_id,
            nombre_cliente: f.nombre, valor_original: parseFloat(f.valor), saldo: parseFloat(f.valor),
            fecha_fiado: fecha, fecha_pago: f.fecha_pago || null, estado: 'pendiente'
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
        valor_unitario: getPrecio(o.sku), autorizado_por: o.autorizado_por
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

  if (guardado) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-md w-full">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-2xl font-black text-gray-800">Liquidacion confirmada</h2>
        <p className="text-gray-500 mt-1">{despachoSel?.rutas?.nombre}</p>
        <div className={`mt-4 p-4 rounded-xl ${diferencia() >= 0 ? 'bg-gray-100 border border-gray-300' : 'bg-brand/10 border border-brand'}`}>
          <p className="text-sm text-gray-500">Diferencia</p>
          <p className={`text-3xl font-black ${diferencia() >= 0 ? 'text-gray-900' : 'text-brand'}`}>
            {diferencia() >= 0 ? '+' : '-'}${Math.abs(diferencia()).toLocaleString('es-CO')}
          </p>
        </div>
        <button onClick={() => router.push('/despacho')} className="mt-6 bg-brand hover:bg-brand-dark text-white px-6 py-3 rounded-xl font-bold w-full">
          Volver al inicio
        </button>
      </div>
    </div>
  )

  return (
    <div>
      <PageHeader title="Liquidacion Auxiliar" subtitle={despachoSel ? `${despachoSel.rutas?.nombre} · Paso ${paso} de 3` : undefined} />

      <div className="p-4 max-w-2xl mx-auto">

        {paso === 1 && (
          <>
            <p className="text-sm font-bold text-gray-600 mb-3">Selecciona el despacho a liquidar</p>
            <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
              <label className="text-xs font-bold text-gray-500 block mb-1">Ver liquidados del kiosco de este dia</label>
              <input type="date" value={fechaLiquidados}
                onChange={e => { setFechaLiquidados(e.target.value); cargarDespachos(e.target.value) }}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
              <p className="text-xs text-gray-400 mt-1">Los despachos pendientes de liquidar aparecen siempre, sin importar la fecha. El despacho puede haberse liquidado un dia distinto al de su fecha (ej. se despacha en la noche y se liquida al dia siguiente).</p>
            </div>
            {despachos.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center shadow-sm">
                <p className="text-4xl mb-3">📭</p>
                <p className="text-gray-500">No hay despachos pendientes ni liquidados en esa fecha</p>
              </div>
            ) : (
              despachos.map(d => {
                const esGrupo = d._grupoIds?.length > 1
                const expandido = gruposExpandidos.has(d.id)
                return (
                  <div key={d.id} className="mb-3">
                    <button onClick={() => seleccionarDespacho(d)}
                      className="w-full bg-white rounded-xl p-4 shadow-sm text-left hover:shadow-md transition-all">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-black text-gray-800">{(d._rutasNombres || [d.rutas?.nombre]).filter(Boolean).join(' + ')}</p>
                          <p className="text-sm text-gray-500">
                            {d.vendedores?.nombre} · {d.total_und} unidades · {new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}
                            {esGrupo && ` · ${d._grupoIds.length} despachos juntos`}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                            d.estado === 'liquidado' ? 'bg-gray-200 text-gray-800'
                            : d.fecha !== obtenerFechaActual() ? 'bg-red-100 text-red-700'
                            : 'bg-brand/10 text-brand'
                          }`}>
                            {d.estado === 'liquidado' ? 'Del kiosco' : 'Pendiente'}
                          </span>
                        </div>
                      </div>
                    </button>
                    {esGrupo && (
                      <div className="px-2">
                        <button
                          onClick={() => setGruposExpandidos(prev => {
                            const n = new Set(prev)
                            n.has(d.id) ? n.delete(d.id) : n.add(d.id)
                            return n
                          })}
                          className="text-xs text-gray-500 underline mt-1 mb-1">
                          {expandido ? 'Ocultar despachos individuales' : '¿Son turnos o personas diferentes? Liquidar cada uno por separado'}
                        </button>
                        {expandido && (
                          <div className="flex flex-col gap-2 mb-2">
                            {d._todos.map(t => (
                              <button key={t.id} onClick={() => seleccionarDespacho(t)}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-left hover:border-brand transition-all flex justify-between items-center">
                                <div>
                                  <p className="text-sm font-bold text-gray-700">{t.rutas?.nombre}</p>
                                  <p className="text-xs text-gray-400">{t.total_und} unidades{t.created_at && ` · ${new Date(t.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`}</p>
                                </div>
                                <span className="text-xs font-bold text-brand">Liquidar solo este</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </>
        )}

        {paso === 2 && (
          <>
            {cargadoDeKiosco && (
              <div className="bg-gray-100 border border-gray-300 rounded-xl p-3 mb-4">
                <p className="text-gray-800 text-sm font-bold">✓ Datos cargados del kiosco — revisa y corrige si es necesario</p>
              </div>
            )}
            <div className="bg-gray-100 border border-gray-300 rounded-xl p-4 mb-4">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <p className="font-black text-gray-900">{(despachoSel?._rutasNombres || [despachoSel?.rutas?.nombre]).filter(Boolean).join(' + ')} — {despachoSel?.vendedores?.nombre}</p>
                  <p className="text-sm text-gray-600">Paso 2: Devoluciones y Cambios</p>
                  {grupoDespachoIds.length > 1 && (
                    <p className="text-xs text-brand font-bold mt-1">{grupoDespachoIds.length} despachos de hoy consolidados en esta liquidacion</p>
                  )}
                </div>
                {despachoSel?.estado === 'liquidado' && usuario?.rol === 'admin' && (
                  <button onClick={reabrirLiquidacion} disabled={guardando}
                    className="text-xs bg-brand/10 text-brand hover:bg-brand/20 px-3 py-2 rounded-lg font-bold whitespace-nowrap disabled:opacity-50">
                    Reabrir liquidacion
                  </button>
                )}
              </div>
            </div>
            {(pendientesComoOrigen.length > 0 || pendientesComoDestino.length > 0) && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-4">
                <p className="font-black text-amber-900 mb-2">Transferencias pendientes de confirmar</p>
                {pendientesComoOrigen.map(t => (
                  <div key={t.id} className="bg-white rounded-lg p-3 mb-2 flex justify-between items-center gap-2">
                    <p className="text-sm text-gray-800">{t.destino?.nombre || 'Un vendedor'} dice que recibió {t.cantidad} {productosMap[t.sku]?.nombre || t.sku} de {despachoSel?.vendedores?.nombre}. ¿Confirmas que se lo enviaron?</p>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => rechazarPendiente(t, true)} disabled={procesandoConfirmacion} className="text-xs bg-gray-100 text-gray-600 px-3 py-2 rounded-lg font-bold disabled:opacity-50">Rechazar</button>
                      <button onClick={() => confirmarPendiente(t, true)} disabled={procesandoConfirmacion} className="text-xs bg-brand text-white px-3 py-2 rounded-lg font-bold disabled:opacity-50">Confirmar</button>
                    </div>
                  </div>
                ))}
                {pendientesComoDestino.map(t => (
                  <div key={t.id} className="bg-white rounded-lg p-3 mb-2 flex justify-between items-center gap-2">
                    <p className="text-sm text-gray-800">{t.origen?.nombre || 'Un vendedor'} dice que le envió {t.cantidad} {productosMap[t.sku]?.nombre || t.sku} a {despachoSel?.vendedores?.nombre}. ¿Confirmas que lo recibió?</p>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => rechazarPendiente(t, false)} disabled={procesandoConfirmacion} className="text-xs bg-gray-100 text-gray-600 px-3 py-2 rounded-lg font-bold disabled:opacity-50">Rechazar</button>
                      <button onClick={() => confirmarPendiente(t, false)} disabled={procesandoConfirmacion} className="text-xs bg-brand text-white px-3 py-2 rounded-lg font-bold disabled:opacity-50">Confirmar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <p className="font-black text-gray-700 mb-3">Registrar mercancía recibida</p>
              <select value={nuevoRecibo.vendedor_id}
                onChange={e => setNuevoRecibo({ ...nuevoRecibo, vendedor_id: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand mb-2">
                <option value="">De quién recibió</option>
                {vendedores.filter(v => v.id !== despachoSel?.vendedor_id).map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
              <div className="flex gap-2 mb-2">
                <select value={nuevoRecibo.sku}
                  onChange={e => setNuevoRecibo({ ...nuevoRecibo, sku: e.target.value })}
                  className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand">
                  <option value="">Selecciona producto</option>
                  {Object.values(productosMap).map(p => <option key={p.sku} value={p.sku}>{p.nombre} ({p.sku})</option>)}
                </select>
                <input type="number" placeholder="Cant" value={nuevoRecibo.cantidad}
                  onChange={e => setNuevoRecibo({ ...nuevoRecibo, cantidad: e.target.value })}
                  className="w-24 shrink-0 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 focus:outline-none focus:border-brand" />
              </div>
              {errorRecibo && <p className="text-brand text-sm mb-2">{errorRecibo}</p>}
              <button onClick={registrarMercanciaRecibida} disabled={guardandoRecibo}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2 rounded-lg disabled:opacity-50">
                {guardandoRecibo ? 'Guardando...' : 'Registrar'}
              </button>
            </div>

            {lineasMezcladas().map(l => (
              <div key={l.sku} className="bg-white rounded-xl shadow-sm p-4 mb-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-bold text-gray-800 text-sm">{l.producto?.nombre}</p>
                    <p className="text-xs text-gray-400">{l.sku} · Despachado: {l.despachadoEfectivo} · Vendido: {l.vendidoNeto}</p>
                    {l.recibidos.map((r, i) => <p key={'r'+i} className="text-xs text-green-600">+{r.cantidad} de {r.nombre}</p>)}
                    {l.enviados.map((e, i) => <p key={'e'+i} className="text-xs text-brand">-{e.cantidad} a {e.nombre}{e.deDevolucion ? ' (de la devolución)' : ''}</p>)}
                  </div>
                  <p className="text-sm font-black text-gray-900">${l.efectivoEsperado.toLocaleString('es-CO')}</p>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-600 font-bold block mb-1">Devolucion</label>
                    <input type="number" min="0" placeholder="0" value={devoluciones[l.sku] ?? ''}
                      onChange={e => setDevoluciones(prev => ({ ...prev, [l.sku]: e.target.value }))}
                      className="w-full text-center border-2 border-gray-200 rounded-lg py-2 font-bold text-gray-800 focus:border-brand focus:outline-none" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-brand font-bold block mb-1">Cambio</label>
                    <input type="number" min="0" placeholder="0" value={cambios[l.sku] ?? ''}
                      onChange={e => setCambios(prev => ({ ...prev, [l.sku]: e.target.value }))}
                      className="w-full text-center border-2 border-gray-200 rounded-lg py-2 font-bold text-gray-800 focus:border-brand focus:outline-none" />
                  </div>
                </div>
              </div>
            ))}
            <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
              <div className="flex justify-between mb-1">
                <p className="text-gray-600 text-sm">Vendido</p>
                <p className="font-black text-gray-900">${totalVendidoValor().toLocaleString('es-CO')}</p>
              </div>
              <div className="flex justify-between mb-1">
                <p className="text-gray-600 text-sm">Base entregada</p>
                <p className="font-black text-gray-900">+${base.toLocaleString('es-CO')}</p>
              </div>
              <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between">
                <p className="font-black text-gray-700">Total a entregar</p>
                <p className="font-black text-gray-900 text-xl">${totalAEntregar().toLocaleString('es-CO')}</p>
              </div>
            </div>
            <button onClick={() => setPaso(3)} className="w-full bg-brand hover:bg-brand-dark text-white font-black py-4 rounded-xl text-lg">
              Continuar al cuadre de caja
            </button>
          </>
        )}

        {paso === 3 && (
          <>
            <div className="bg-gray-100 border border-gray-300 rounded-xl p-4 mb-4">
              <p className="font-black text-gray-900">Paso 3: Cuadre de Caja</p>
              <p className="text-sm text-gray-600">Total a entregar: <span className="font-black text-gray-900">${totalAEntregar().toLocaleString('es-CO')}</span></p>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
              <label className="text-sm font-black text-gray-700 block mb-2">Efectivo</label>
              <input type="number" min="0" value={efectivo} onChange={e => setEfectivo(e.target.value)}
                className="w-full text-center border-2 border-gray-200 rounded-xl py-3 text-2xl font-black text-gray-800 focus:border-brand focus:outline-none" placeholder="0" />
            </div>

            <ComprobantesTransferencia comprobantes={comprobantes} setComprobantes={setComprobantes}
              esAdmin={usuario?.rol === 'admin'} fechaLiquidacion={despachoSel?.fecha} />

            <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-black text-gray-700">Descuentos</label>
                <button onClick={() => setDescuentos([...descuentos, { sku: '', concepto: '', valor: '' }])} className="text-xs bg-gray-100 px-3 py-1 rounded-lg font-bold text-gray-600">+ Agregar</button>
              </div>
              {descuentos.map((d, i) => (
                <div key={i} className="mb-3">
                  <select value={d.sku}
                    onChange={e => { const n=[...descuentos]; n[i].sku=e.target.value; n[i].concepto=e.target.value; setDescuentos(n) }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand mb-1">
                    <option value="">Selecciona producto</option>
                    {lineasMezcladas().map(l => <option key={l.sku} value={l.sku}>{l.producto?.nombre} ({l.sku})</option>)}
                  </select>
                  <div className="flex gap-2">
                    <input type="text" placeholder="Motivo (opcional)" value={d.concepto}
                      onChange={e => { const n=[...descuentos]; n[i].concepto=e.target.value; setDescuentos(n) }}
                      className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand" />
                    <input type="number" placeholder="Valor" value={d.valor}
                      onChange={e => { const n=[...descuentos]; n[i].valor=e.target.value; setDescuentos(n) }}
                      className="w-28 shrink-0 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 focus:outline-none focus:border-brand" />
                  </div>
                  {d.valor && <p className="text-right text-brand text-xs mt-1">-${parseFloat(d.valor).toLocaleString('es-CO')}</p>}
                </div>
              ))}
              {totalDescuentos() > 0 && <p className="text-right text-sm font-black text-brand">-${totalDescuentos().toLocaleString('es-CO')}</p>}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-black text-gray-700">Obsequios</label>
                <button onClick={() => setObsequios([...obsequios, { sku: '', cantidad: '', autorizado_por: '' }])} className="text-xs bg-gray-100 px-3 py-1 rounded-lg font-bold text-gray-600">+ Agregar</button>
              </div>
              {obsequios.map((o, i) => (
                <div key={i} className="mb-3">
                  <select value={o.sku}
                    onChange={e => { const n=[...obsequios]; n[i].sku=e.target.value; setObsequios(n) }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand mb-1">
                    <option value="">Selecciona producto</option>
                    {lineasMezcladas().map(l => <option key={l.sku} value={l.sku}>{l.producto?.nombre} ({l.sku})</option>)}
                  </select>
                  <div className="flex gap-2">
                    <input type="number" placeholder="Cantidad" value={o.cantidad}
                      onChange={e => { const n=[...obsequios]; n[i].cantidad=e.target.value; setObsequios(n) }}
                      className="w-28 shrink-0 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 focus:outline-none focus:border-brand" />
                    <select value={o.autorizado_por}
                      onChange={e => { const n=[...obsequios]; n[i].autorizado_por=e.target.value; setObsequios(n) }}
                      className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand">
                      <option value="">Autorizo</option>
                      {AUTORIZADORES_OBSEQUIOS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                </div>
              ))}
              {totalObsequios() > 0 && <p className="text-right text-sm font-black text-brand">-${totalObsequios().toLocaleString('es-CO')}</p>}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-black text-gray-700">Consumo propio</label>
                <button onClick={() => setConsumoPropio([...consumoPropio, { sku: '', cantidad: '' }])} className="text-xs bg-gray-100 px-3 py-1 rounded-lg font-bold text-gray-600">+ Agregar</button>
              </div>
              {consumoPropio.map((c, i) => (
                <div key={i} className="mb-3">
                  <select value={c.sku}
                    onChange={e => { const n=[...consumoPropio]; n[i].sku=e.target.value; setConsumoPropio(n) }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand mb-1">
                    <option value="">Selecciona producto</option>
                    {lineasMezcladas().map(l => <option key={l.sku} value={l.sku}>{l.producto?.nombre} ({l.sku})</option>)}
                  </select>
                  <input type="number" placeholder="Cantidad" value={c.cantidad}
                    onChange={e => { const n=[...consumoPropio]; n[i].cantidad=e.target.value; setConsumoPropio(n) }}
                    className="w-28 shrink-0 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 focus:outline-none focus:border-brand" />
                </div>
              ))}
              {totalConsumoPropio() > 0 && <p className="text-right text-sm font-black text-brand">-${totalConsumoPropio().toLocaleString('es-CO')}</p>}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-black text-gray-700">Créditos</label>
                <button onClick={() => setFiados([...fiados, { nombre: '', valor: '', fecha_pago: '', cartera_fiados_id: '' }])} className="text-xs bg-gray-100 px-3 py-1 rounded-lg font-bold text-gray-600">+ Agregar</button>
              </div>
              {fiados.map((f, i) => (
                <div key={i} className="mb-3">
                  <div className="flex gap-2 mb-1">
                    <input type="text" placeholder="Nombre cliente" value={f.nombre}
                      onChange={e => { const n=[...fiados]; n[i].nombre=e.target.value; setFiados(n) }}
                      className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand" />
                    <input type="number" placeholder="Valor" value={f.valor}
                      onChange={e => { const n=[...fiados]; n[i].valor=e.target.value; setFiados(n) }}
                      className="w-28 shrink-0 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 focus:outline-none focus:border-brand" />
                  </div>
                  <input type="date" value={f.fecha_pago}
                    onChange={e => { const n=[...fiados]; n[i].fecha_pago=e.target.value; setFiados(n) }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand" />
                </div>
              ))}
              {totalFiados() > 0 && <p className="text-right text-sm font-black text-brand">-${totalFiados().toLocaleString('es-CO')}</p>}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-black text-gray-700">Pagos de créditos recibidos</label>
                <button onClick={() => setPagosFiados([...pagosFiados, { cartera_fiados_id: '', nombre_manual: '', valor: '' }])} className="text-xs bg-gray-100 px-3 py-1 rounded-lg font-bold text-gray-600">+ Agregar</button>
              </div>
              {pagosFiados.map((p, i) => (
                <div key={i} className="mb-2">
                  <select value={p.cartera_fiados_id}
                    onChange={e => { const n=[...pagosFiados]; n[i].cartera_fiados_id=e.target.value; n[i].nombre_manual=''; setPagosFiados(n) }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand mb-1">
                    <option value="">Selecciona el crédito que está pagando</option>
                    {fiadosPendientes.map(f => <option key={f.id} value={f.id}>{f.nombre_cliente} (debe ${(f.saldo || 0).toLocaleString('es-CO')})</option>)}
                    <option value="__otro__">Otro (no esta en la lista)</option>
                  </select>
                  <div className="flex gap-2">
                    {p.cartera_fiados_id === '__otro__' && (
                      <input type="text" placeholder="Nombre cliente" value={p.nombre_manual}
                        onChange={e => { const n=[...pagosFiados]; n[i].nombre_manual=e.target.value; setPagosFiados(n) }}
                        className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand" />
                    )}
                    <input type="number" placeholder="Valor" value={p.valor}
                      onChange={e => { const n=[...pagosFiados]; n[i].valor=e.target.value; setPagosFiados(n) }}
                      className="w-28 shrink-0 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 focus:outline-none focus:border-brand" />
                  </div>
                </div>
              ))}
              {totalPagosFiados() > 0 && <p className="text-right text-sm font-black text-gray-900">+${totalPagosFiados().toLocaleString('es-CO')}</p>}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-black text-gray-700">Mercancia enviada</label>
                <button onClick={() => setMercEnviada([...mercEnviada, { vendedor_id: '', sku: '', cantidad: '', momento: 'ruta' }])} className="text-xs bg-gray-100 px-3 py-1 rounded-lg font-bold text-gray-600">+ Agregar</button>
              </div>
              {mercEnviada.map((m, i) => (
                <div key={i} className="mb-2">
                  <select value={m.vendedor_id}
                    onChange={e => { const n=[...mercEnviada]; n[i].vendedor_id=e.target.value; setMercEnviada(n) }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand mb-1">
                    <option value="">A quien le envio</option>
                    {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <select value={m.sku}
                      onChange={e => { const n=[...mercEnviada]; n[i].sku=e.target.value; setMercEnviada(n) }}
                      className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand">
                      <option value="">Producto</option>
                      {lineasMezcladas().map(l => <option key={l.sku} value={l.sku}>{l.producto?.nombre} ({l.sku})</option>)}
                    </select>
                    <input type="number" placeholder="Cant" value={m.cantidad}
                      onChange={e => { const n=[...mercEnviada]; n[i].cantidad=e.target.value; setMercEnviada(n) }}
                      className="w-20 shrink-0 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 focus:outline-none focus:border-brand" />
                  </div>
                  <div className="flex gap-2 mt-1">
                    {[{ id: 'ruta', nombre: 'Durante la ruta' }, { id: 'devolucion', nombre: 'De la devolución (al llegar)' }].map(op => (
                      <button key={op.id} type="button"
                        onClick={() => { const n=[...mercEnviada]; n[i].momento=op.id; setMercEnviada(n) }}
                        className={`flex-1 text-xs font-bold py-1.5 rounded-lg ${ (m.momento || 'ruta') === op.id ? 'bg-secondary text-white' : 'bg-gray-100 text-gray-600'}`}>
                        {op.nombre}
                      </button>
                    ))}
                  </div>
                  {m.sku && m.cantidad && (
                    <p className="text-right text-xs mt-1 text-gray-500">
                      {(m.momento || 'ruta') === 'devolucion'
                        ? `Sale de la devolución contada: no se le resta de lo vendido`
                        : <span className="text-brand">-${(parseFloat(m.cantidad) * getPrecio(m.sku)).toLocaleString('es-CO')} de lo vendido</span>}
                    </p>
                  )}
                </div>
              ))}
              <p className="text-[11px] text-gray-400 mt-1">"Durante la ruta": se lo pasó en la calle (sale de lo que vendió). "De la devolución": al llegar le entregó a otro vendedor parte de lo que trajo de vuelta, que ya se contó como devolución en el paso 2.</p>
              {totalMercEnviadaInfo() > 0 && <p className="text-right text-xs font-bold text-gray-500">Total enviado: ${totalMercEnviadaInfo().toLocaleString('es-CO')} (se le carga a quien lo recibe)</p>}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-black text-gray-700">Gastos de ruta</label>
                <button onClick={() => setGastos([...gastos, { categoria: '', concepto: '', valor: '' }])} className="text-xs bg-gray-100 px-3 py-1 rounded-lg font-bold text-gray-600">+ Agregar</button>
              </div>
              {gastos.map((g, i) => (
                <div key={i} className="mb-2">
                  <select value={g.categoria}
                    onChange={e => { const n=[...gastos]; n[i].categoria=e.target.value; setGastos(n) }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand mb-1">
                    <option value="">Selecciona categoria</option>
                    {CATEGORIAS_GASTOS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <input type="text" placeholder="Nota (opcional)" value={g.concepto}
                      onChange={e => { const n=[...gastos]; n[i].concepto=e.target.value; setGastos(n) }}
                      className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand" />
                    <input type="number" placeholder="Valor" value={g.valor}
                      onChange={e => { const n=[...gastos]; n[i].valor=e.target.value; setGastos(n) }}
                      className="w-28 shrink-0 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 focus:outline-none focus:border-brand" />
                  </div>
                </div>
              ))}
              {totalGastos() > 0 && <p className="text-right text-sm font-black text-brand">-${totalGastos().toLocaleString('es-CO')}</p>}
            </div>

            <div className={`rounded-xl p-4 mb-4 ${diferencia() >= 0 ? 'bg-gray-100 border border-gray-300' : 'bg-brand/10 border border-brand'}`}>
              <div className="flex justify-between mb-1">
                <p className="text-sm text-gray-600">Total a entregar</p>
                <p className="font-bold">${totalAEntregar().toLocaleString('es-CO')}</p>
              </div>
              <div className="flex justify-between mb-1">
                <p className="text-sm text-gray-600">Efectivo + Transf. verificadas</p>
                <p className="font-bold">${(parseFloat(efectivo||0)+transfVerificadas()).toLocaleString('es-CO')}</p>
              </div>
              {transfPorVerificar() > 0 && (
                <div className="flex justify-between mb-1">
                  <p className="text-sm text-gray-600">Transf. por verificar (deuda del vendedor)</p>
                  <p className="font-bold text-amber-700">-${transfPorVerificar().toLocaleString('es-CO')}</p>
                </div>
              )}
              <div className="flex justify-between mb-1">
                <p className="text-sm text-gray-600">Descuentos</p>
                <p className="font-bold text-brand">-${totalDescuentos().toLocaleString('es-CO')}</p>
              </div>
              <div className="flex justify-between mb-1">
                <p className="text-sm text-gray-600">Obsequios</p>
                <p className="font-bold text-brand">-${totalObsequios().toLocaleString('es-CO')}</p>
              </div>
              <div className="flex justify-between mb-1">
                <p className="text-sm text-gray-600">Consumo propio</p>
                <p className="font-bold text-brand">-${totalConsumoPropio().toLocaleString('es-CO')}</p>
              </div>
              <div className="flex justify-between mb-1">
                <p className="text-sm text-gray-600">Créditos nuevos</p>
                <p className="font-bold text-brand">-${totalFiados().toLocaleString('es-CO')}</p>
              </div>
              <div className="flex justify-between mb-1">
                <p className="text-sm text-gray-600">Pagos de créditos recibidos</p>
                <p className="font-bold text-gray-900">+${totalPagosFiados().toLocaleString('es-CO')}</p>
              </div>
              <div className="flex justify-between mb-1">
                <p className="text-sm text-gray-600">Gastos ruta</p>
                <p className="font-bold text-brand">-${totalGastos().toLocaleString('es-CO')}</p>
              </div>
              {totalMercRecibidaInfo() !== totalMercEnviadaInfo() && (
                <div className="flex justify-between mb-1">
                  <p className="text-sm text-gray-500">Transferencias, neto (ya incluido arriba)</p>
                  <p className="font-bold text-gray-500">
                    {totalMercRecibidaInfo() - totalMercEnviadaInfo() >= 0 ? '+' : '-'}${Math.abs(totalMercRecibidaInfo() - totalMercEnviadaInfo()).toLocaleString('es-CO')}
                  </p>
                </div>
              )}
              <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between">
                <p className="font-black text-gray-700">Diferencia</p>
                <p className={`text-xl font-black ${diferencia() >= 0 ? 'text-gray-900' : 'text-brand'}`}>
                  {diferencia() >= 0 ? '+' : '-'}${Math.abs(diferencia()).toLocaleString('es-CO')}
                </p>
              </div>
            </div>

            <div className="flex gap-3 mb-8">
              <button onClick={() => setPaso(2)} className="flex-1 bg-gray-200 text-gray-700 font-bold py-4 rounded-xl">Atras</button>
              <button onClick={guardarLiquidacion} disabled={guardando}
                className="flex-1 bg-brand hover:bg-brand-dark text-white font-black py-4 rounded-xl text-lg disabled:opacity-50">
                {guardando ? 'Guardando...' : 'Confirmar Liquidacion'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
