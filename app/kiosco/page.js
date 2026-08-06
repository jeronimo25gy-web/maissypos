'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '../../lib/supabase'
import { cerrarSesionUsuario } from '../../lib/sesion'
import { getEmpresaId } from '../../lib/empresa'
import { obtenerFechaActual } from '../../lib/supabase-helpers'
import { crearAlertaAdmin } from '../../lib/alertas-admin'

const UMBRAL_ALERTA_DIFERENCIA = 50000

export default function Kiosco() {
  const [usuario, setUsuario] = useState(null)
  const [vendedor, setVendedor] = useState(null)
  const [vendedores, setVendedores] = useState([])
  const [productosMap, setProductosMap] = useState({})
  const [despachos, setDespachos] = useState([])
  const [despachoSel, setDespachoSel] = useState(null)
  const [metaRuta, setMetaRuta] = useState(null)
  const [detalle, setDetalle] = useState([])
  const [transRecibidas, setTransRecibidas] = useState([])
  const [base, setBase] = useState(0)
  const [devoluciones, setDevoluciones] = useState({})
  const [cambios, setCambios] = useState({})
  const [mercEnviada, setMercEnviada] = useState([{ vendedor_id: '', sku: '', cantidad: '' }])
  const [efectivo, setEfectivo] = useState('')
  const [transferencias, setTransferencias] = useState('')
 const [fiados, setFiados] = useState([{ nombre: '', valor: '', fecha_pago: '' }])
  const [fiadosPendientes, setFiadosPendientes] = useState([])
  const [pagosFiados, setPagosFiados] = useState([{ cartera_fiados_id: '', nombre_manual: '', valor: '' }])
  const [categoriasGastos, setCategoriasGastos] = useState([])
  const AUTORIZADORES_OBSEQUIOS = ['Jero', 'Kathe']
  const [gastos, setGastos] = useState([{ categoria: '', concepto: '', valor: '' }])
  const [descuentos, setDescuentos] = useState([{ sku: '', concepto: '', valor: '' }])
  const [obsequios, setObsequios] = useState([{ sku: '', cantidad: '', autorizado_por: '' }])
  const [consumoPropio, setConsumoPropio] = useState([{ sku: '', cantidad: '' }])
  const [paso, setPaso] = useState(1)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [pendientesConfirmar, setPendientesConfirmar] = useState([])
  const [productosNombres, setProductosNombres] = useState({})
  const [procesandoConfirmacion, setProcesandoConfirmacion] = useState(false)
  const [transEnviadasHoy, setTransEnviadasHoy] = useState([])
  const [nuevoRecibo, setNuevoRecibo] = useState({ vendedor_id: '', sku: '', cantidad: '' })
  const [guardandoRecibo, setGuardandoRecibo] = useState(false)
  const [errorRecibo, setErrorRecibo] = useState('')
  const [avisosTransferencias, setAvisosTransferencias] = useState([])
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (parsed.rol !== 'vendedor') { router.push('/despacho'); return }
    setUsuario(parsed)
    cargarVendedores()
    cargarVendedorYDespachos(parsed.vendedor_nombre)
    cargarCategoriasGastos()
  }, [])

  const cargarCategoriasGastos = async () => {
    const { data } = await supabase.from('categorias_gasto').select('nombre').eq('tipo', 'ruta').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    if (data) setCategoriasGastos(data.map(c => c.nombre))
  }

  const cargarVendedores = async () => {
    const { data } = await supabase.from('vendedores').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    if (data) setVendedores(data)
  }

  const cargarVendedorYDespachos = async (vendedor_nombre) => {
    const { data: vend } = await supabase.from('vendedores').select('*').eq('nombre', vendedor_nombre).eq('empresa_id', getEmpresaId()).single()
    if (vend) {
      setVendedor(vend)
      const { data } = await supabase
        .from('despachos_encab')
        .select('*, rutas(nombre)')
        .eq('estado', 'despachado')
        .eq('vendedor_id', vend.id)
        .eq('empresa_id', getEmpresaId())
        .order('fecha', { ascending: true })
      if (data) setDespachos(data)
      cargarPendientesConfirmar(vend.id)
      cargarPendientesConfirmarComoDestino(vend.id)
      return vend
    }
    return null
  }

  // Pendientes donde el vendedor logueado es quien RECIBIO segun el otro (origen_registro='emisor'):
  // el otro declaro un envio, este vendedor debe confirmar/rechazar que en verdad le llego.
  const cargarPendientesConfirmarComoDestino = async (vendId) => {
    const { data } = await supabase.from('transferencias_mercancia').select('*, origen:vendedor_origen_id(nombre)')
      .eq('vendedor_destino_id', vendId).eq('origen_registro', 'emisor').eq('estado', 'pendiente_confirmacion')
      .eq('empresa_id', getEmpresaId()).order('created_at', { ascending: true })
    setAvisosTransferencias(data || [])
    const skus = [...new Set((data || []).map(t => t.sku))]
    if (skus.length > 0) {
      const { data: prods } = await supabase.from('productos').select('sku, nombre').in('sku', skus).eq('empresa_id', getEmpresaId())
      setProductosNombres(prev => { const pn = { ...prev }; (prods || []).forEach(p => { pn[p.sku] = p.nombre }); return pn })
    }
  }

  // Pendientes donde el vendedor logueado es quien ENVIO segun el otro (origen_registro='receptor'):
  // el otro declaro haber recibido, este vendedor debe confirmar/rechazar que en verdad se lo mando.
  const cargarPendientesConfirmar = async (vendId) => {
    const { data } = await supabase
      .from('transferencias_mercancia')
      .select('*, destino:vendedor_destino_id(nombre)')
      .eq('vendedor_origen_id', vendId)
      .eq('origen_registro', 'receptor')
      .eq('estado', 'pendiente_confirmacion')
      .eq('empresa_id', getEmpresaId())
      .order('created_at', { ascending: true })
    setPendientesConfirmar(data || [])
    const skus = [...new Set((data || []).map(t => t.sku))]
    if (skus.length > 0) {
      const { data: prods } = await supabase.from('productos').select('sku, nombre').in('sku', skus).eq('empresa_id', getEmpresaId())
      setProductosNombres(prev => { const pn = { ...prev }; (prods || []).forEach(p => { pn[p.sku] = p.nombre }); return pn })
    }
  }

  // esOrigen: el vendedor logueado es quien envio (le piden confirmar/rechazar lo que otro dijo haber recibido).
  // Se determina por origen_registro, no por estado -- ahora ambas direcciones pueden estar 'pendiente_confirmacion'.
  const aceptarItemConfirmacion = async (t) => {
    setProcesandoConfirmacion(true)
    const esOrigen = t.origen_registro === 'receptor'
    const { error } = await supabase.from('transferencias_mercancia').update({ estado: 'aplicada' }).eq('id', t.id).eq('empresa_id', getEmpresaId())
    if (error) { alert('Error: ' + error.message); setProcesandoConfirmacion(false); return }
    if (esOrigen) setPendientesConfirmar(prev => prev.filter(p => p.id !== t.id))
    else setAvisosTransferencias(prev => prev.filter(p => p.id !== t.id))
    setProcesandoConfirmacion(false)
  }

  const rechazarItemConfirmacion = async (t) => {
    setProcesandoConfirmacion(true)
    const empresaId = getEmpresaId()
    const esOrigen = t.origen_registro === 'receptor'
    const { error } = await supabase.from('transferencias_mercancia').update({ estado: 'rechazada' }).eq('id', t.id).eq('empresa_id', empresaId)
    if (error) { alert('Error: ' + error.message); setProcesandoConfirmacion(false); return }
    const nombreProd = productosNombres[t.sku] || t.sku
    const mensaje = esOrigen
      ? `${vendedor?.nombre || 'Un vendedor'} rechazo la transferencia de ${t.cantidad} ${nombreProd} que ${t.destino?.nombre || 'otro vendedor'} dijo haber recibido`
      : `${vendedor?.nombre || 'Un vendedor'} rechazo la transferencia de ${t.cantidad} ${nombreProd} que ${t.origen?.nombre || 'otro vendedor'} dijo haberle enviado`
    const { error: errAlerta } = await crearAlertaAdmin({
      empresaId,
      tipo: 'transferencia_rechazada',
      mensaje,
      referenciaTipo: 'transferencia_mercancia',
      referenciaId: t.id
    })
    if (errAlerta) console.error('Error creando alerta admin:', errAlerta)
    if (esOrigen) setPendientesConfirmar(prev => prev.filter(p => p.id !== t.id))
    else setAvisosTransferencias(prev => prev.filter(p => p.id !== t.id))
    setProcesandoConfirmacion(false)
  }

  const cargarTransRecibidas = async (vendId, fecha) => {
    const { data: trans, error: transError } = await supabase
      .from('transferencias_mercancia')
      .select('*, origen:vendedor_origen_id(nombre)')
      .eq('vendedor_destino_id', vendId)
      .eq('fecha', fecha)
      .eq('empresa_id', getEmpresaId())
      .order('created_at', { ascending: false })
    if (transError) { console.error('Error cargando transferencias recibidas:', transError); return }
    setTransRecibidas(trans || [])
  }

  const cargarTransEnviadasHoy = async (vendId, fecha) => {
    const { data } = await supabase
      .from('transferencias_mercancia')
      .select('*, destino:vendedor_destino_id(nombre)')
      .eq('vendedor_origen_id', vendId)
      .eq('fecha', fecha)
      .eq('empresa_id', getEmpresaId())
      .order('created_at', { ascending: false })
    setTransEnviadasHoy(data || [])
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
      .eq('vendedor_destino_id', vendedor.id)
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
      vendedor_origen_id: nuevoRecibo.vendedor_id, vendedor_destino_id: vendedor.id,
      sku: nuevoRecibo.sku, cantidad, valor_unitario: precio, valor_total: cantidad * precio,
      estado: 'pendiente_confirmacion', aplicada: false, origen_registro: 'receptor'
    })
    if (error) { setErrorRecibo('Error: ' + error.message); setGuardandoRecibo(false); return }
    const nombreOrigen = vendedores.find(v => v.id === nuevoRecibo.vendedor_id)?.nombre || 'un vendedor'
    const nombreProd = productosMap[nuevoRecibo.sku]?.nombre || nuevoRecibo.sku
    await crearAlertaAdmin({
      empresaId,
      tipo: 'transferencia_pendiente',
      mensaje: `${vendedor?.nombre || 'Un vendedor'} registro haber recibido ${cantidad} ${nombreProd} de ${nombreOrigen}, pendiente de que ${nombreOrigen} lo confirme`,
      referenciaTipo: 'transferencia_mercancia',
    })
    setNuevoRecibo({ vendedor_id: '', sku: '', cantidad: '' })
    setGuardandoRecibo(false)
    await cargarTransRecibidas(vendedor.id, fecha)
  }

  const cargarMetaRuta = async (rutaId) => {
    if (!rutaId) { setMetaRuta(null); return }
    const hoy = obtenerFechaActual()
    const inicioMes = hoy.slice(0, 7) + '-01'

    const { data: metaRow } = await supabase.from('metas_ventas').select('meta').eq('mes', hoy.slice(0, 7)).eq('ruta_id', rutaId).eq('empresa_id', getEmpresaId()).maybeSingle()
    if (!metaRow) { setMetaRuta(null); return }

    const { data: despachosMes } = await supabase.from('despachos_encab').select('id').eq('ruta_id', rutaId).gte('fecha', inicioMes).lte('fecha', hoy).eq('empresa_id', getEmpresaId())
    const ids = (despachosMes || []).map(x => x.id)
    let ventasMes = 0
    if (ids.length > 0) {
      const { data: liqs } = await supabase.from('liquidaciones').select('efectivo_esperado').in('despacho_id', ids).eq('empresa_id', getEmpresaId())
      ventasMes = (liqs || []).reduce((s, l) => s + (l.efectivo_esperado || 0), 0)
    }
    const pct = metaRow.meta > 0 ? Math.min(100, (ventasMes / metaRow.meta) * 100) : 0
    setMetaRuta({ meta: metaRow.meta, ventasMes, pct })
  }

  const seleccionarDespacho = async (d, vend) => {
    setDespachoSel(d)
    cargarMetaRuta(d.ruta_id)
    const { data: det } = await supabase.from('despachos_detalle').select('*').eq('despacho_id', d.id).eq('empresa_id', getEmpresaId())
    const { data: prods } = await supabase.from('productos').select('sku, nombre, precio_venta').eq('empresa_id', getEmpresaId()).order('nombre')
    const { data: config } = await supabase.from('configuracion').select('valor').eq('parametro', 'base_despacho_' + d.id).eq('empresa_id', getEmpresaId()).single()
    if (det && prods) {
      const pm = {}
      prods.forEach(p => { pm[p.sku] = p })
      setProductosMap(pm)
      const merged = det.map(item => ({ ...item, producto: pm[item.sku] || {} }))
      setDetalle(merged)
      const devs = {}
      const cams = {}
      merged.forEach(item => { devs[item.sku] = '0'; cams[item.sku] = '0' })
      setDevoluciones(devs)
      setCambios(cams)
      setBase(config ? parseFloat(config.valor) : 0)
      const vendId = vend?.id
      if (vendId) {
        await cargarTransRecibidas(vendId, d.fecha)
        await cargarTransEnviadasHoy(vendId, d.fecha)

        const { data: fiadosPend } = await supabase
          .from('cartera_fiados')
          .select('id, nombre_cliente, saldo')
          .eq('vendedor_id', vendId)
          .eq('estado', 'pendiente')
          .eq('empresa_id', getEmpresaId())
          .order('nombre_cliente')
        setFiadosPendientes(fiadosPend || [])
      }
      setPaso(2)
    }
  }

  const getPrecio = (sku) => productosMap[sku]?.precio_venta || 0

  const transRecibidasContables = () => transRecibidas.filter(t => t.estado === 'aplicada' && !t.aplicada)
  const hayPendientesRecibidos = () => transRecibidas.some(t => t.estado === 'pendiente_confirmacion')

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
      if (mapa[t.sku]) mapa[t.sku].enviados.push({ cantidad: t.cantidad, nombre: t.destino?.nombre || 'otro vendedor' })
    })
    mercEnviada.filter(m => m.sku && parseFloat(m.cantidad) > 0).forEach(m => {
      if (mapa[m.sku]) {
        const vend = vendedores.find(v => v.id === m.vendedor_id)
        mapa[m.sku].enviados.push({ cantidad: parseFloat(m.cantidad), nombre: vend?.nombre || 'otro vendedor' })
      }
    })
    return Object.values(mapa).map(l => {
      const totalRecibido = l.recibidos.reduce((s, r) => s + r.cantidad, 0)
      const totalEnviado = l.enviados.reduce((s, e) => s + e.cantidad, 0)
      const despachadoEfectivo = l.despachadoPropio + totalRecibido - totalEnviado
      const devuelto = parseFloat(devoluciones[l.sku] || 0)
      const cambio = parseFloat(cambios[l.sku] || 0)
      const vendidoNeto = despachadoEfectivo - devuelto - cambio
      const precio = getPrecio(l.sku)
      return { ...l, despachadoEfectivo, devuelto, cambio, vendidoNeto, precio, efectivoEsperado: vendidoNeto * precio }
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
  const totalAEntregar = () => totalVendidoValor() + base - totalFiados() + totalPagosFiados() - totalDescuentos() - totalObsequios() - totalConsumoPropio()
  const totalEntregado = () => parseFloat(efectivo || 0) + parseFloat(transferencias || 0) + totalGastos()
  const diferencia = () => totalEntregado() - totalAEntregar()

    const guardarLiquidacion = async () => {
    if (guardando) return
    if (hayPendientesRecibidos()) {
      alert('Tienes transferencias recibidas pendientes de confirmacion. Deben ser confirmadas por quien te las envio (desde su Kiosco) o por un administrador (modulo Transferencias) antes de poder cerrar el dia.')
      return
    }
    setGuardando(true)
    const fecha = despachoSel.fecha
    const empresaId = getEmpresaId()

    const registros = lineasMezcladas().map(l => ({
      empresa_id: empresaId,
      fecha,
      despacho_id: despachoSel.id,
      vendedor_id: vendedor.id,
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

      const { error: errDespacho } = await supabase.from('despachos_encab').update({ estado: 'liquidado' }).eq('id', despachoSel.id)
      if (errDespacho) fallos.push('estado del despacho')

      const { error: errDetalle } = await supabase.from('liquidaciones_detalle').insert({
        empresa_id: empresaId,
        fecha,
        despacho_id: despachoSel.id,
        vendedor_id: vendedor.id,
        efectivo: parseFloat(efectivo || 0),
        transferencias_bancarias: parseFloat(transferencias || 0),
        total_fiados: totalFiados(),
        total_pagos_fiados: totalPagosFiados(),
        total_gastos: totalGastos(),
        total_merc_enviada: totalMercEnviadaInfo(),
        total_merc_recibida: totalMercRecibidaInfo(),
        diferencia: diferencia()
      })
      if (errDetalle) fallos.push('resumen de la liquidacion (cuadre de caja)')

      const movimientosCaja = []
      if (parseFloat(efectivo || 0) > 0) {
        const { data: cuentaEfectivo } = await supabase.from('cuentas').select('id').eq('tipo', 'efectivo').eq('empresa_id', empresaId).maybeSingle()
        movimientosCaja.push({
          empresa_id: empresaId, cuenta_id: cuentaEfectivo?.id || null, fecha, tipo: 'entrada',
          monto: parseFloat(efectivo), concepto: `Liquidacion ${despachoSel.rutas?.nombre || ''}`,
          referencia_tipo: 'liquidacion', referencia_id: despachoSel.id
        })
      }
      if (parseFloat(transferencias || 0) > 0) {
        const { data: rutaInfo } = await supabase.from('rutas').select('cuenta_id').eq('id', despachoSel.ruta_id).maybeSingle()
        movimientosCaja.push({
          empresa_id: empresaId, cuenta_id: rutaInfo?.cuenta_id || null, fecha, tipo: 'entrada',
          monto: parseFloat(transferencias), concepto: `Liquidacion ${despachoSel.rutas?.nombre || ''}`,
          referencia_tipo: 'liquidacion', referencia_id: despachoSel.id
        })
      }
      if (movimientosCaja.length > 0) {
        const { error: errTesoreria } = await supabase.from('movimientos_tesoreria').insert(movimientosCaja)
        if (errTesoreria) fallos.push('movimientos de caja/bancos')
      }

      const fiadosReg = fiados.filter(f => f.nombre && f.valor).map(f => ({
        empresa_id: empresaId, fecha, despacho_id: despachoSel.id, vendedor_id: vendedor.id,
        nombre_cliente: f.nombre, valor: parseFloat(f.valor), tipo: 'fiado'
      }))
      const pagosReg = pagosFiados.filter(p => p.valor && (p.cartera_fiados_id || p.nombre_manual)).map(p => {
        const fiadoLigado = p.cartera_fiados_id ? fiadosPendientes.find(f => f.id === p.cartera_fiados_id) : null
        return {
          empresa_id: empresaId, fecha, despacho_id: despachoSel.id, vendedor_id: vendedor.id,
          nombre_cliente: fiadoLigado?.nombre_cliente || p.nombre_manual,
          valor: parseFloat(p.valor), tipo: 'pago_fiado',
          cartera_fiados_id: fiadoLigado?.id || null
        }
      })
      if ([...fiadosReg, ...pagosReg].length > 0) {
        const { error: errFiados } = await supabase.from('liquidaciones_fiados').insert([...fiadosReg, ...pagosReg])
        if (errFiados) fallos.push('fiados y pagos de fiados')
      }

      for (const p of pagosReg) {
        if (!p.cartera_fiados_id) continue
        const fiadoLigado = fiadosPendientes.find(f => f.id === p.cartera_fiados_id)
        const nuevoSaldo = Math.max(0, (fiadoLigado?.saldo || 0) - p.valor)
        const { error: errSaldo } = await supabase.from('cartera_fiados')
          .update({ saldo: nuevoSaldo, estado: nuevoSaldo <= 0 ? 'pagado' : 'pendiente', fecha_pagado: nuevoSaldo <= 0 ? new Date().toISOString() : null })
          .eq('id', p.cartera_fiados_id).eq('empresa_id', empresaId)
        if (errSaldo) fallos.push(`saldo de cartera (${fiadoLigado?.nombre_cliente || ''})`)
      }

      const cartFiados = fiados.filter(f => f.nombre && f.valor).map(f => ({
        empresa_id: empresaId,
        ruta_id: despachoSel.ruta_id,
        vendedor_id: vendedor.id,
        nombre_cliente: f.nombre,
        valor_original: parseFloat(f.valor),
        saldo: parseFloat(f.valor),
        fecha_fiado: fecha,
        fecha_pago: f.fecha_pago || null,
        estado: 'pendiente'
      }))
      if (cartFiados.length > 0) {
        const { error: errCartera } = await supabase.from('cartera_fiados').insert(cartFiados)
        if (errCartera) fallos.push('cartera de fiados')
      }

      const gastosReg = gastos.filter(g => g.categoria && g.valor).map(g => ({
        empresa_id: empresaId, fecha, despacho_id: despachoSel.id, vendedor_id: vendedor.id,
        categoria: g.categoria, concepto: g.concepto, valor: parseFloat(g.valor)
      }))
      if (gastosReg.length > 0) {
        const { error: errGastos } = await supabase.from('liquidaciones_gastos').insert(gastosReg)
        if (errGastos) fallos.push('gastos de ruta')
      }

      const descuentosReg = descuentos.filter(d => d.concepto && d.valor).map(d => ({
        empresa_id: empresaId, fecha, despacho_id: despachoSel.id, vendedor_id: vendedor.id,
        concepto: d.concepto, valor: parseFloat(d.valor)
      }))
      if (descuentosReg.length > 0) {
        const { error: errDescuentos } = await supabase.from('liquidaciones_descuentos').insert(descuentosReg)
        if (errDescuentos) fallos.push('descuentos')
      }

      const cambiosReportados = lineasMezcladas().filter(l => l.cambio > 0)
      if (cambiosReportados.length > 0) {
        const novedadesReg = cambiosReportados.map(l => ({
          empresa_id: empresaId, fecha, vendedor_id: vendedor.id,
          sku: l.sku, cantidad: l.cambio,
          tipo: 'mano_a_mano', momento: 'en_ruta', quien_registra: 'vendedor',
          motivo: 'Reportado en liquidacion del kiosco', revisado: false
        }))
        const { error: errNovedades } = await supabase.from('novedades').insert(novedadesReg)
        if (errNovedades) fallos.push('registrar los cambios para revision de bodega/admin')
      }

      const transEnviadas = mercEnviada.filter(m => m.vendedor_id && m.sku && m.cantidad).map(m => ({
        empresa_id: empresaId, fecha, created_at: new Date().toISOString(),
        vendedor_origen_id: vendedor.id, vendedor_destino_id: m.vendedor_id,
        sku: m.sku, cantidad: parseFloat(m.cantidad),
        valor_unitario: getPrecio(m.sku), valor_total: parseFloat(m.cantidad) * getPrecio(m.sku),
        estado: 'pendiente_confirmacion', origen_registro: 'emisor'
      }))
      if (transEnviadas.length > 0) {
        const { error: errTransEnv } = await supabase.from('transferencias_mercancia').insert(transEnviadas)
        if (errTransEnv) fallos.push('mercancia transferida a otro vendedor')
      }

      const idsAplicar = transRecibidasContables().map(t => t.id)
      if (idsAplicar.length > 0) {
        const { error: errTransRec } = await supabase.from('transferencias_mercancia').update({ aplicada: true }).in('id', idsAplicar).eq('empresa_id', empresaId)
        if (errTransRec) fallos.push('marcar como aplicada la mercancia recibida')
      }

      const obsequiosReg = obsequios.filter(o => o.sku && parseFloat(o.cantidad) > 0 && o.autorizado_por).map(o => ({
        empresa_id: empresaId, fecha, despacho_id: despachoSel.id, vendedor_id: vendedor.id,
        sku: o.sku, cantidad: parseFloat(o.cantidad),
        valor_unitario: getPrecio(o.sku), autorizado_por: o.autorizado_por
      }))
      if (obsequiosReg.length > 0) {
        const { error: errObsequios } = await supabase.from('obsequios').insert(obsequiosReg)
        if (errObsequios) fallos.push('obsequios')
      }

      const consumoPropioValido = consumoPropio.filter(c => c.sku && parseFloat(c.cantidad) > 0)
      if (consumoPropioValido.length > 0) {
        const { data: empleadoLigado } = await supabase.from('empleados').select('id').eq('vendedor_id', vendedor.id).eq('empresa_id', empresaId).maybeSingle()
        const consumosReg = consumoPropioValido.map(c => ({
          empresa_id: empresaId, empleado_id: empleadoLigado?.id || null, vendedor_id: vendedor.id, despacho_id: despachoSel.id,
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
          mensaje: `${vendedor?.nombre || 'Un vendedor'} cerro su liquidacion del ${fecha} con una diferencia de ${diferencia() >= 0 ? '+' : ''}$${diferencia().toLocaleString('es-CO')}`,
          referenciaTipo: 'despacho_encab',
          referenciaId: despachoSel.id,
        })
      }

      if (fallos.length > 0) {
        alert('El dia se guardo, pero algo fallo en: ' + fallos.join(', ') + '. Avisale al admin para que lo revise.')
      }
      setGuardado(true)
    } else {
      alert('Error: ' + error.message)
    }
    setGuardando(false)
  }

  if (guardado) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-8">
      <div className="text-center">
        <div className="text-8xl mb-6">ok</div>
        <h2 className="text-4xl font-black text-white mb-2">Listo!</h2>
        <p className="text-gray-400 text-xl mb-4">{despachoSel?.rutas?.nombre}</p>
        <div className="bg-gray-800 p-6 rounded-2xl mb-8">
          <p className="text-gray-400 mb-1">Diferencia</p>
          <p className={`text-5xl font-black ${diferencia() >= 0 ? 'text-white' : 'text-brand'}`}>
            {diferencia() >= 0 ? '+' : ''}{diferencia().toLocaleString('es-CO')}
          </p>
        </div>
        <p className="text-gray-500 text-lg mb-6">Podes irte. Hasta manana!</p>
        <button onClick={async () => { await cerrarSesionUsuario(usuario?.id); localStorage.removeItem('maissy_usuario'); router.push('/') }}
          className="bg-gray-700 text-white px-8 py-4 rounded-2xl font-bold text-lg">
          Cerrar sesion
        </button>
      </div>
    </div>
  )

  const colaConfirmacion = [...pendientesConfirmar, ...avisosTransferencias]
  if (colaConfirmacion.length > 0) {
    const t = colaConfirmacion[0]
    const esOrigen = t.origen_registro === 'receptor'
    const nombreProd = productosNombres[t.sku] || t.sku
    const otraParte = esOrigen ? (t.destino?.nombre || 'Un vendedor') : (t.origen?.nombre || 'Un vendedor')
    return (
      <div className="min-h-screen bg-red-600 flex items-center justify-center p-8">
        <div className="max-w-lg text-center">
          <p className="text-white/80 font-bold text-sm uppercase tracking-wide mb-4">Confirmacion de transferencia</p>
          <h2 className="text-3xl font-black text-white mb-8">
            {esOrigen
              ? <>{otraParte} registro que le enviaste {t.cantidad} de {nombreProd}. Confirmas?</>
              : <>{otraParte} registro que te envio {t.cantidad} de {nombreProd}. Confirmas?</>}
          </h2>
          <div className="flex gap-4">
            <button onClick={() => rechazarItemConfirmacion(t)} disabled={procesandoConfirmacion}
              className="flex-1 bg-red-700 border-2 border-white text-white font-black py-5 rounded-2xl text-lg disabled:opacity-50">
              Rechazar
            </button>
            <button onClick={() => aceptarItemConfirmacion(t)} disabled={procesandoConfirmacion}
              className="flex-1 bg-white text-red-600 font-black py-5 rounded-2xl text-lg disabled:opacity-50">
              Confirmar
            </button>
          </div>
          {colaConfirmacion.length > 1 && (
            <p className="text-white/70 text-sm mt-6">{colaConfirmacion.length - 1} mas pendiente(s) despues de esta</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900" style={{ colorScheme: 'dark', accentColor: '#C41230' }}>
      <div className="bg-gray-800 px-8 py-5 flex justify-between items-center">
        <div>
          <div className="cursor-pointer" onClick={() => router.push('/kiosco')}>
            <Image src="/maissypos-logo-oscuro.png" width={135} height={49} alt="MaissyPOS"
              style={{ background: 'transparent', width: '135px', height: 'auto' }} />
          </div>
          {usuario && <p className="text-gray-400 text-sm">{usuario.nombre}</p>}
        </div>
        <div className="text-right">
          <p className="text-gray-400 text-sm mb-2">{new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <button onClick={async () => { await cerrarSesionUsuario(usuario?.id); localStorage.removeItem('maissy_usuario'); router.push('/') }}
            className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold px-4 py-2 rounded-xl">
            Cerrar sesion
          </button>
        </div>
      </div>

      <div className="p-6 max-w-3xl mx-auto">
        {paso === 1 && (
          <div>
            <h2 className="text-3xl font-black text-white mb-2 text-center">Hola, {usuario ? usuario.nombre : ''}!</h2>
            <p className="text-gray-400 text-center mb-8">Selecciona el despacho a liquidar</p>
            {despachos.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-gray-400 text-xl">No tenes despachos pendientes por liquidar</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {despachos.map(d => (
                  <button key={d.id} onClick={() => seleccionarDespacho(d, vendedor)}
                    className="bg-gray-800 hover:bg-brand rounded-2xl p-6 text-left transition-all">
                    <p className="text-2xl font-black text-white">{d.rutas?.nombre}</p>
                    <p className="text-gray-400 mt-1">{d.total_und} unidades · {new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {paso === 2 && (
          <div>
            <h2 className="text-2xl font-black text-white mb-2">Cuadre del dia</h2>
            <p className="text-gray-400 mb-4">Resuelve transferencias y registra lo que traes de vuelta</p>

            {metaRuta && (
              <div className="bg-gray-800 rounded-2xl p-5 mb-4">
                <p className="text-gray-400 text-sm mb-2">Meta de la ruta este mes</p>
                <p className="text-4xl font-black text-brand mb-3">{metaRuta.pct.toFixed(0)}%</p>
                <div className="w-full bg-gray-700 rounded-full h-3">
                  <div className="h-3 rounded-full bg-brand" style={{ width: `${metaRuta.pct}%` }} />
                </div>
              </div>
            )}

            <div className="mb-6">
              <p className="text-white font-black text-lg mb-3">Transferencias recibidas</p>

              <div className="bg-gray-800 rounded-2xl p-5 mb-4">
                <p className="text-gray-300 font-bold text-sm mb-3">+ Registrar mercancia recibida</p>
                <select value={nuevoRecibo.vendedor_id}
                  onChange={e => setNuevoRecibo({ ...nuevoRecibo, vendedor_id: e.target.value })}
                  className="w-full bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-brand mb-2">
                  <option value="">De quien recibi</option>
                  {vendedores.filter(v => v.id !== vendedor?.id).map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                </select>
                <div className="flex gap-2 mb-2">
                  <select value={nuevoRecibo.sku}
                    onChange={e => setNuevoRecibo({ ...nuevoRecibo, sku: e.target.value })}
                    className="flex-1 bg-gray-700 text-white border border-gray-600 rounded-xl px-3 py-3 text-base focus:outline-none focus:border-brand">
                    <option value="">Selecciona producto</option>
                    {Object.values(productosMap).map(p => <option key={p.sku} value={p.sku}>{p.nombre} ({p.sku})</option>)}
                  </select>
                  <input type="number" placeholder="Cant" value={nuevoRecibo.cantidad}
                    onChange={e => setNuevoRecibo({ ...nuevoRecibo, cantidad: e.target.value })}
                    className="w-24 bg-gray-700 text-white border border-gray-600 rounded-xl px-3 py-3 text-lg font-bold focus:outline-none focus:border-brand" />
                </div>
                {errorRecibo && <p className="text-brand text-sm mb-2">{errorRecibo}</p>}
                <button onClick={registrarMercanciaRecibida} disabled={guardandoRecibo}
                  className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-xl disabled:opacity-50">
                  {guardandoRecibo ? 'Guardando...' : 'Registrar'}
                </button>
              </div>

              {transRecibidas.length === 0 ? (
                <p className="text-gray-500 text-sm">Sin transferencias recibidas para este despacho</p>
              ) : (
                <div className="space-y-2">
                  {transRecibidas.map(t => (
                    <div key={t.id} className="bg-gray-800 border border-gray-600 rounded-xl p-4 flex justify-between items-center">
                      <div>
                        <p className="text-white font-bold">{productosMap[t.sku]?.nombre || t.sku} · {t.cantidad} und</p>
                        <p className="text-gray-500 text-xs">De {t.origen?.nombre || 'otro vendedor'}</p>
                      </div>
                      <p className={`text-xs font-bold ${t.estado === 'aplicada' ? 'text-green-400' : t.estado === 'rechazada' ? 'text-red-400' : 'text-amber-400'}`}>
                        {t.estado === 'aplicada' ? 'Confirmada, sumada abajo' : t.estado === 'rechazada' ? 'Rechazada por el emisor' : 'Pendiente de confirmacion'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-6">
              <p className="text-white font-black text-lg mb-3">Transferencias enviadas</p>

              {transEnviadasHoy.length > 0 && (
                <div className="mb-3">
                  {transEnviadasHoy.map(t => (
                    <div key={t.id} className="bg-gray-800 rounded-2xl p-4 mb-2 flex justify-between items-center">
                      <div>
                        <p className="text-white font-bold">{productosMap[t.sku]?.nombre || t.sku} · {t.cantidad} und</p>
                        <p className="text-gray-400 text-sm">A {t.destino?.nombre || 'vendedor'}</p>
                      </div>
                      <p className={`text-xs font-bold ${t.estado === 'aplicada' ? 'text-green-400' : t.estado === 'rechazada' ? 'text-red-400' : 'text-amber-400'}`}>
                        {t.estado === 'aplicada' ? 'Confirmada' : t.estado === 'rechazada' ? 'Rechazada' : 'Pendiente'}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-gray-800 rounded-2xl p-5">
                <div className="flex justify-between items-center mb-3">
                  <label className="text-white font-black text-lg">Declarar nuevo envio</label>
                  <button onClick={() => setMercEnviada([...mercEnviada, { vendedor_id: '', sku: '', cantidad: '' }])}
                    className="bg-gray-700 text-gray-300 px-4 py-2 rounded-xl font-bold">+ Agregar</button>
                </div>
                {mercEnviada.map((m, i) => (
                  <div key={i} className="mb-3">
                    <select value={m.vendedor_id}
                      onChange={e => { const n=[...mercEnviada]; n[i].vendedor_id=e.target.value; setMercEnviada(n) }}
                      className="w-full bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-brand mb-2">
                      <option value="">A quien le envio</option>
                      {vendedores.filter(v => v.id !== vendedor?.id).map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <select value={m.sku}
                        onChange={e => { const n=[...mercEnviada]; n[i].sku=e.target.value; setMercEnviada(n) }}
                        className="flex-1 bg-gray-700 text-white border border-gray-600 rounded-xl px-3 py-3 text-base focus:outline-none focus:border-brand">
                        <option value="">Selecciona producto</option>
                        {lineasMezcladas().map(l => <option key={l.sku} value={l.sku}>{l.producto.nombre} ({l.sku})</option>)}
                      </select>
                      <input type="number" placeholder="Cant" value={m.cantidad}
                        onChange={e => { const n=[...mercEnviada]; n[i].cantidad=e.target.value; setMercEnviada(n) }}
                        className="w-24 bg-gray-700 text-white border border-gray-600 rounded-xl px-3 py-3 text-lg font-bold focus:outline-none focus:border-brand" />
                    </div>
                    {m.sku && m.cantidad && <p className="text-right text-brand text-sm mt-1">-${(parseFloat(m.cantidad) * getPrecio(m.sku)).toLocaleString('es-CO')}</p>}
                  </div>
                ))}
                {totalMercEnviadaInfo() > 0 && <p className="text-right text-brand font-black">Total enviado: -${totalMercEnviadaInfo().toLocaleString('es-CO')}</p>}
              </div>
            </div>

            <div className="mb-6">
              <p className="text-white font-black text-lg mb-3">Devoluciones y Cambios</p>
              {lineasMezcladas().map(l => (
                <div key={l.sku} className="bg-gray-800 rounded-2xl p-5 mb-4">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-white font-bold text-lg">{l.producto.nombre}</p>
                      <p className="text-gray-500 text-sm">{l.sku}</p>
                      <p className="text-gray-400">Despachado: {l.despachadoEfectivo} und</p>
                      {l.recibidos.map((r, i) => (
                        <p key={'r'+i} className="text-green-400 text-xs">+{r.cantidad} de {r.nombre}</p>
                      ))}
                      {l.enviados.map((e, i) => (
                        <p key={'e'+i} className="text-brand text-xs">-{e.cantidad} a {e.nombre}</p>
                      ))}
                    </div>
                    <p className="text-white font-black text-lg">{l.vendidoNeto} vendido</p>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-gray-300 font-bold text-sm block mb-2">Devolucion</label>
                      <input type="number" min="0" placeholder="0" value={devoluciones[l.sku] ?? ''}
                        onChange={e => setDevoluciones(prev => ({ ...prev, [l.sku]: e.target.value }))}
                        className="w-full text-center bg-gray-700 text-white border-2 border-gray-500 rounded-xl py-3 text-2xl font-black focus:border-brand focus:outline-none" />
                    </div>
                    <div className="flex-1">
                      <label className="text-brand font-bold text-sm block mb-2">Cambio</label>
                      <input type="number" min="0" placeholder="0" value={cambios[l.sku] ?? ''}
                        onChange={e => setCambios(prev => ({ ...prev, [l.sku]: e.target.value }))}
                        className="w-full text-center bg-gray-700 text-white border-2 border-brand rounded-xl py-3 text-2xl font-black focus:border-brand focus:outline-none" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-gray-800 rounded-2xl p-5 mb-6">
              <div className="flex justify-between mb-2">
                <p className="text-gray-400">Vendido</p>
                <p className="text-white font-black">${totalVendidoValor().toLocaleString('es-CO')}</p>
              </div>
              <div className="flex justify-between mb-2">
                <p className="text-gray-400">Base entregada</p>
                <p className="text-white font-black">+${base.toLocaleString('es-CO')}</p>
              </div>
              <div className="border-t border-gray-600 mt-3 pt-3 flex justify-between">
                <p className="text-white font-black text-lg">Total a entregar</p>
                <p className="text-white font-black text-2xl">${totalAEntregar().toLocaleString('es-CO')}</p>
              </div>
            </div>
            {hayPendientesRecibidos() && (
              <p className="text-amber-400 text-sm text-center mb-3">
                Tienes transferencias recibidas pendientes de confirmacion. Deben ser confirmadas por quien te las envio (desde su Kiosco) o por un administrador (modulo Transferencias) antes de poder cerrar el dia.
              </p>
            )}
            <button onClick={() => setPaso(3)} disabled={hayPendientesRecibidos()}
              className="w-full bg-brand hover:bg-brand-dark text-white font-black py-5 rounded-2xl text-xl disabled:opacity-50">
              Continuar al cuadre de caja
            </button>
          </div>
        )}

        {paso === 3 && (
          <div>
            <h2 className="text-2xl font-black text-white mb-2">Cuadre de Caja</h2>
            <div className="bg-brand-dark rounded-2xl p-4 mb-6">
              <p className="text-white/70 text-sm">Total a entregar</p>
              <p className="text-white font-black text-3xl">${totalAEntregar().toLocaleString('es-CO')}</p>
            </div>

            <div className="bg-gray-800 rounded-2xl p-5 mb-4">
              <label className="text-white font-black text-lg block mb-3">Efectivo</label>
              <input type="number" min="0" value={efectivo} onChange={e => setEfectivo(e.target.value)}
                className="w-full text-center bg-gray-700 text-white border-2 border-gray-600 rounded-xl py-4 text-3xl font-black focus:border-brand focus:outline-none" placeholder="0" />
            </div>

            <div className="bg-gray-800 rounded-2xl p-5 mb-4">
              <label className="text-white font-black text-lg block mb-3">Transferencias bancarias</label>
              <input type="number" min="0" value={transferencias} onChange={e => setTransferencias(e.target.value)}
                className="w-full text-center bg-gray-700 text-white border-2 border-gray-600 rounded-xl py-4 text-3xl font-black focus:border-brand focus:outline-none" placeholder="0" />
            </div>
           <div className="bg-gray-800 rounded-2xl p-5 mb-4">
  <div className="flex justify-between items-center mb-3">
    <label className="text-white font-black text-lg">Descuentos</label>
    <button onClick={() => setDescuentos([...descuentos, { sku: '', concepto: '', valor: '' }])} className="bg-gray-700 text-gray-300 px-4 py-2 rounded-xl font-bold">+ Agregar</button>
  </div>
  {descuentos.map((d, i) => (
    <div key={i} className="mb-3">
      <select value={d.sku}
        onChange={e => { const n=[...descuentos]; n[i].sku=e.target.value; n[i].concepto=e.target.value; setDescuentos(n) }}
        className="w-full bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-brand mb-2">
        <option value="">Selecciona producto</option>
        {lineasMezcladas().map(l => <option key={l.sku} value={l.sku}>{l.producto.nombre} ({l.sku})</option>)}
      </select>
      <div className="flex gap-2">
        <input type="text" placeholder="Motivo (opcional)" value={d.concepto}
          onChange={e => { const n=[...descuentos]; n[i].concepto=e.target.value; setDescuentos(n) }}
          className="flex-1 bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-brand" />
        <input type="number" placeholder="Valor" value={d.valor}
          onChange={e => { const n=[...descuentos]; n[i].valor=e.target.value; setDescuentos(n) }}
          className="w-36 bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-lg font-bold focus:outline-none focus:border-brand" />
      </div>
      {d.valor && <p className="text-right text-brand text-sm mt-1">-${parseFloat(d.valor).toLocaleString('es-CO')}</p>}
    </div>
  ))}
  {totalDescuentos() > 0 && <p className="text-right text-brand font-black">-${totalDescuentos().toLocaleString('es-CO')}</p>}
</div>

            <div className="bg-gray-800 rounded-2xl p-5 mb-4">
              <div className="flex justify-between items-center mb-3">
                <label className="text-white font-black text-lg">Fiados</label>
                <button onClick={() => setFiados([...fiados, { nombre: '', valor: '' }])} className="bg-gray-700 text-gray-300 px-4 py-2 rounded-xl font-bold">+ Agregar</button>
              </div>
              {fiados.map((f, i) => (
                <div key={i} className="flex gap-3 mb-3">
                  <input type="text" placeholder="Nombre cliente" value={f.nombre}
                    onChange={e => { const n=[...fiados]; n[i].nombre=e.target.value; setFiados(n) }}
                    className="flex-1 bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-brand" />
                  <input type="number" placeholder="Valor" value={f.valor}
                    onChange={e => { const n=[...fiados]; n[i].valor=e.target.value; setFiados(n) }}
                    className="w-36 bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-lg font-bold focus:outline-none focus:border-brand" />
                                      <input type="date" value={f.fecha_pago} onChange={e => { const n=[...fiados]; n[i].fecha_pago=e.target.value; setFiados(n) }} className="w-36 bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-brand" />
                </div>
              ))}
              {totalFiados() > 0 && <p className="text-right text-gray-300 font-black">Fiados: ${totalFiados().toLocaleString('es-CO')}</p>}
            </div>

            <div className="bg-gray-800 rounded-2xl p-5 mb-4">
              <div className="flex justify-between items-center mb-3">
                <label className="text-white font-black text-lg">Pagos fiados recibidos</label>
                <button onClick={() => setPagosFiados([...pagosFiados, { cartera_fiados_id: '', nombre_manual: '', valor: '' }])} className="bg-gray-700 text-gray-300 px-4 py-2 rounded-xl font-bold">+ Agregar</button>
              </div>
              {pagosFiados.map((p, i) => (
                <div key={i} className="mb-3">
                  <select value={p.cartera_fiados_id}
                    onChange={e => { const n=[...pagosFiados]; n[i].cartera_fiados_id=e.target.value; n[i].nombre_manual=''; setPagosFiados(n) }}
                    className="w-full bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-brand mb-2">
                    <option value="">Selecciona el fiado que esta pagando</option>
                    {fiadosPendientes.map(f => <option key={f.id} value={f.id}>{f.nombre_cliente} (debe ${(f.saldo || 0).toLocaleString('es-CO')})</option>)}
                    <option value="__otro__">Otro (no esta en la lista)</option>
                  </select>
                  <div className="flex gap-3">
                    {p.cartera_fiados_id === '__otro__' && (
                      <input type="text" placeholder="Nombre cliente" value={p.nombre_manual}
                        onChange={e => { const n=[...pagosFiados]; n[i].nombre_manual=e.target.value; setPagosFiados(n) }}
                        className="flex-1 bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-brand" />
                    )}
                    <input type="number" placeholder="Valor" value={p.valor}
                      onChange={e => { const n=[...pagosFiados]; n[i].valor=e.target.value; setPagosFiados(n) }}
                      className="w-36 bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-lg font-bold focus:outline-none focus:border-brand" />
                  </div>
                </div>
              ))}
              {totalPagosFiados() > 0 && <p className="text-right text-white font-black">+${totalPagosFiados().toLocaleString('es-CO')}</p>}
            </div>

            <div className="bg-gray-800 rounded-2xl p-5 mb-4">
              <div className="flex justify-between items-center mb-3">
                <label className="text-white font-black text-lg">Gastos</label>
                <button onClick={() => setGastos([...gastos, { categoria: '', concepto: '', valor: '' }])} className="bg-gray-700 text-gray-300 px-4 py-2 rounded-xl font-bold">+ Agregar</button>
              </div>
              {gastos.map((g, i) => (
                <div key={i} className="mb-3">
                  <select value={g.categoria}
                    onChange={e => { const n=[...gastos]; n[i].categoria=e.target.value; setGastos(n) }}
                    className="w-full bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-brand mb-2">
                    <option value="">Selecciona categoria</option>
                    {categoriasGastos.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div className="flex gap-3">
                    <input type="text" placeholder="Nota (opcional)" value={g.concepto}
                      onChange={e => { const n=[...gastos]; n[i].concepto=e.target.value; setGastos(n) }}
                      className="flex-1 bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-brand" />
                    <input type="number" placeholder="Valor" value={g.valor}
                      onChange={e => { const n=[...gastos]; n[i].valor=e.target.value; setGastos(n) }}
                      className="w-36 bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-lg font-bold focus:outline-none focus:border-brand" />
                  </div>
                </div>
              ))}
              {totalGastos() > 0 && <p className="text-right text-brand font-black">Gastos: ${totalGastos().toLocaleString('es-CO')}</p>}
            </div>

            <div className="bg-gray-800 rounded-2xl p-5 mb-4">
              <div className="flex justify-between items-center mb-3">
                <label className="text-white font-black text-lg">Obsequios</label>
                <button onClick={() => setObsequios([...obsequios, { sku: '', cantidad: '', autorizado_por: '' }])} className="bg-gray-700 text-gray-300 px-4 py-2 rounded-xl font-bold">+ Agregar</button>
              </div>
              {obsequios.map((o, i) => (
                <div key={i} className="mb-3">
                  <select value={o.sku}
                    onChange={e => { const n=[...obsequios]; n[i].sku=e.target.value; setObsequios(n) }}
                    className="w-full bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-brand mb-2">
                    <option value="">Selecciona producto</option>
                    {lineasMezcladas().map(l => <option key={l.sku} value={l.sku}>{l.producto.nombre} ({l.sku})</option>)}
                  </select>
                  <div className="flex gap-3">
                    <input type="number" placeholder="Cantidad" value={o.cantidad}
                      onChange={e => { const n=[...obsequios]; n[i].cantidad=e.target.value; setObsequios(n) }}
                      className="w-32 bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-lg font-bold focus:outline-none focus:border-brand" />
                    <select value={o.autorizado_por}
                      onChange={e => { const n=[...obsequios]; n[i].autorizado_por=e.target.value; setObsequios(n) }}
                      className="flex-1 bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-brand">
                      <option value="">Autorizo</option>
                      {AUTORIZADORES_OBSEQUIOS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                </div>
              ))}
              {totalObsequios() > 0 && <p className="text-right text-brand font-black">Obsequios: -${totalObsequios().toLocaleString('es-CO')} (se resta del total a entregar)</p>}
            </div>

            <div className="bg-gray-800 rounded-2xl p-5 mb-4">
              <div className="flex justify-between items-center mb-3">
                <label className="text-white font-black text-lg">Consumo propio</label>
                <button onClick={() => setConsumoPropio([...consumoPropio, { sku: '', cantidad: '' }])} className="bg-gray-700 text-gray-300 px-4 py-2 rounded-xl font-bold">+ Agregar</button>
              </div>
              {consumoPropio.map((c, i) => (
                <div key={i} className="mb-3">
                  <select value={c.sku}
                    onChange={e => { const n=[...consumoPropio]; n[i].sku=e.target.value; setConsumoPropio(n) }}
                    className="w-full bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-brand mb-2">
                    <option value="">Selecciona producto</option>
                    {lineasMezcladas().map(l => <option key={l.sku} value={l.sku}>{l.producto.nombre} ({l.sku})</option>)}
                  </select>
                  <input type="number" placeholder="Cantidad" value={c.cantidad}
                    onChange={e => { const n=[...consumoPropio]; n[i].cantidad=e.target.value; setConsumoPropio(n) }}
                    className="w-32 bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-lg font-bold focus:outline-none focus:border-brand" />
                </div>
              ))}
              {totalConsumoPropio() > 0 && <p className="text-right text-brand font-black">Consumo propio: -${totalConsumoPropio().toLocaleString('es-CO')} (se resta del total a entregar)</p>}
            </div>

            <div className="bg-gray-800 rounded-2xl p-5 mb-6">
              <div className="flex justify-between mb-2">
                <p className="text-gray-300">Total a entregar</p>
                <p className="text-white font-bold">${totalAEntregar().toLocaleString('es-CO')}</p>
              </div>
                            <div className="flex justify-between mb-2">
                <p className="text-gray-300">Efectivo + Transf</p>
                <p className="text-white font-bold">${(parseFloat(efectivo||0)+parseFloat(transferencias||0)).toLocaleString('es-CO')}</p>
              </div>
              <div className="flex justify-between mb-2">
                <p className="text-gray-300">Descuentos</p>
                <p className="text-brand font-bold">-${totalDescuentos().toLocaleString('es-CO')}</p>
              </div>
              <div className="flex justify-between mb-2">
                <p className="text-gray-300">Fiados nuevos</p>
                <p className="text-gray-300 font-bold">-${totalFiados().toLocaleString('es-CO')}</p>
              </div>
              <div className="flex justify-between mb-2">
                <p className="text-gray-300">Pagos fiados recibidos</p>
                <p className="text-white font-bold">+${totalPagosFiados().toLocaleString('es-CO')}</p>
              </div>
              <div className="flex justify-between mb-2">
                <p className="text-gray-300">Gastos ruta</p>
                <p className="text-brand font-bold">-${totalGastos().toLocaleString('es-CO')}</p>
              </div>
              {totalMercRecibidaInfo() !== totalMercEnviadaInfo() && (
                <div className="flex justify-between mb-2">
                  <p className="text-gray-400">Transferencias, neto (ya incluido arriba)</p>
                  <p className="text-gray-400 font-bold">
                    {totalMercRecibidaInfo() - totalMercEnviadaInfo() >= 0 ? '+' : '-'}${Math.abs(totalMercRecibidaInfo() - totalMercEnviadaInfo()).toLocaleString('es-CO')}
                  </p>
                </div>
              )}
              {totalObsequios() > 0 && (
                <div className="flex justify-between mb-2">
                  <p className="text-gray-300">Obsequios (−)</p>
                  <p className="text-brand font-bold">-${totalObsequios().toLocaleString('es-CO')}</p>
                </div>
              )}
              {totalConsumoPropio() > 0 && (
                <div className="flex justify-between mb-2">
                  <p className="text-gray-300">Consumo propio (−)</p>
                  <p className="text-brand font-bold">-${totalConsumoPropio().toLocaleString('es-CO')}</p>
                </div>
              )}
              <div className="border-t border-gray-600 mt-3 pt-3 flex justify-between">
                <p className="text-white font-black text-xl">Diferencia</p>
                <p className={`font-black text-3xl ${diferencia() >= 0 ? 'text-white' : 'text-brand'}`}>
                  {diferencia() >= 0 ? '+' : ''}{diferencia().toLocaleString('es-CO')}
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <button onClick={() => setPaso(2)} className="flex-1 bg-gray-700 text-white font-bold py-5 rounded-2xl text-lg">Atras</button>
              <button onClick={guardarLiquidacion} disabled={guardando}
                className="flex-1 bg-brand hover:bg-brand-dark text-white font-black py-5 rounded-2xl text-xl disabled:opacity-50">
                {guardando ? 'Guardando...' : 'Cerrar dia'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
