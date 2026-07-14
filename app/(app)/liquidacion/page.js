'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'

export default function Liquidacion() {
  const [usuario, setUsuario] = useState(null)
  const [vendedores, setVendedores] = useState([])
  const [despachos, setDespachos] = useState([])
  const [despachoSel, setDespachoSel] = useState(null)
  const [detalle, setDetalle] = useState([])
  const [transRecibidas, setTransRecibidas] = useState([])
  const [productosMap, setProductosMap] = useState({})
  const [base, setBase] = useState(0)
  const [devoluciones, setDevoluciones] = useState({})
  const [cambios, setCambios] = useState({})
  const [efectivo, setEfectivo] = useState('')
  const [transferencias, setTransferencias] = useState('')
  const [fiados, setFiados] = useState([{ nombre: '', valor: '', fecha_pago: '', cartera_fiados_id: '' }])
  const [pagosFiados, setPagosFiados] = useState([{ cartera_fiados_id: '', nombre_manual: '', valor: '' }])
  const [fiadosPendientes, setFiadosPendientes] = useState([])
  const CATEGORIAS_GASTOS = ['Gasolina', 'Viaticos', 'Prestamo al vendedor', 'Bolsas', 'Parqueadero', 'Otro']
  const [gastos, setGastos] = useState([{ categoria: '', concepto: '', valor: '' }])
  const [descuentos, setDescuentos] = useState([{ sku: '', concepto: '', valor: '' }])
  const [mercEnviada, setMercEnviada] = useState([{ vendedor_id: '', sku: '', cantidad: '' }])
  const [paso, setPaso] = useState(1)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [cargadoDeKiosco, setCargadoDeKiosco] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    setUsuario(JSON.parse(u))
    cargarDespachos()
    cargarVendedores()
  }, [])

  const cargarVendedores = async () => {
    const { data } = await supabase.from('vendedores').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    if (data) setVendedores(data)
  }

  const cargarDespachos = async () => {
    const fecha = obtenerFechaActual()
    const { data } = await supabase
      .from('despachos_encab')
      .select('*, rutas(nombre), vendedores(nombre)')
      .eq('fecha', fecha)
      .in('estado', ['despachado', 'liquidado'])
      .eq('empresa_id', getEmpresaId())
      .order('created_at', { ascending: false })
    if (data) setDespachos(data)
  }

  const seleccionarDespacho = async (d) => {
    setDespachoSel(d)
    const fecha = obtenerFechaActual()
    const { data: det } = await supabase.from('despachos_detalle').select('*').eq('despacho_id', d.id).eq('empresa_id', getEmpresaId())
    const { data: prods } = await supabase.from('productos').select('sku, nombre, precio_venta').eq('empresa_id', getEmpresaId())
    const { data: config } = await supabase.from('configuracion').select('valor').eq('parametro', 'base_despacho_' + d.id).eq('empresa_id', getEmpresaId()).single()
    if (det && prods) {
      const pm = {}
      prods.forEach(p => { pm[p.sku] = p })
      setProductosMap(pm)
      const merged = det.map(item => ({ ...item, producto: pm[item.sku] || {} }))
      setDetalle(merged)
      setBase(config ? parseFloat(config.valor) : 0)

      // Cargar transferencias recibidas
      const { data: trans, error: transError } = await supabase
        .from('transferencias_mercancia')
        .select('*')
        .eq('vendedor_destino_id', d.vendedor_id)
        .eq('aplicada', false)
        .eq('empresa_id', getEmpresaId())
        .gte('created_at', new Date(obtenerFechaActual() + 'T05:00:00.000Z').toISOString())
      if (transError) console.error('Error cargando transferencias recibidas:', transError)
      if (trans && trans.length > 0) setTransRecibidas(trans)

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
        liq.forEach(l => {
          devs[l.sku] = String(l.devuelto || 0)
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
        setTransferencias(String(liqDet.transferencias_bancarias || ''))
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
    }
    setPaso(2)
  }

  const getPrecio = (sku) => {
    const p = detalle.find(d => d.sku === sku)
    return p ? p.producto?.precio_venta || 0 : 0
  }

  const vendidoNeto = (item) => (item.total || 0) - parseFloat(devoluciones[item.sku] || 0) - parseFloat(cambios[item.sku] || 0)
  const totalVendidoPropio = () => detalle.reduce((sum, item) => sum + vendidoNeto(item) * (item.producto?.precio_venta || 0), 0)
  const totalVendidoTrans = () => transRecibidas.reduce((sum, t) => sum + (t.cantidad || 0) * (t.valor_unitario || 0), 0)
  const totalVendidoValor = () => totalVendidoPropio() + totalVendidoTrans()
  const totalFiados = () => fiados.reduce((sum, f) => sum + parseFloat(f.valor || 0), 0)
  const totalPagosFiados = () => pagosFiados.reduce((sum, p) => sum + parseFloat(p.valor || 0), 0)
  const totalGastos = () => gastos.reduce((sum, g) => sum + parseFloat(g.valor || 0), 0)
  const totalDescuentos = () => descuentos.reduce((sum, d) => sum + parseFloat(d.valor || 0), 0)
  const totalMercEnviada = () => mercEnviada.reduce((sum, m) => sum + parseFloat(m.cantidad || 0) * getPrecio(m.sku), 0)
  const totalAEntregar = () => totalVendidoValor() + base - totalFiados() + totalPagosFiados() - totalDescuentos() - totalMercEnviada()
  const totalEntregado = () => parseFloat(efectivo || 0) + parseFloat(transferencias || 0) + totalGastos()
  const diferencia = () => totalEntregado() - totalAEntregar()

  const guardarLiquidacion = async () => {
    setGuardando(true)
    const fecha = obtenerFechaActual()
    const empresaId = getEmpresaId()

    // Revertir el efecto de los pagos de fiados guardados en un intento anterior de esta misma liquidacion,
    // antes de borrar y reinsertar (si no, al recorregir se restaria el pago dos veces del saldo del cliente)
    const { data: pagosPrevios } = await supabase
      .from('liquidaciones_fiados')
      .select('cartera_fiados_id, valor')
      .eq('despacho_id', despachoSel.id).eq('fecha', fecha).eq('empresa_id', empresaId)
      .eq('tipo', 'pago_fiado')
    for (const pp of (pagosPrevios || [])) {
      if (!pp.cartera_fiados_id) continue
      const { data: cf } = await supabase.from('cartera_fiados').select('saldo, valor_original').eq('id', pp.cartera_fiados_id).eq('empresa_id', empresaId).single()
      if (cf) {
        const saldoRevertido = Math.min(cf.valor_original, (cf.saldo || 0) + pp.valor)
        await supabase.from('cartera_fiados').update({ saldo: saldoRevertido, estado: 'pendiente', fecha_pagado: null }).eq('id', pp.cartera_fiados_id).eq('empresa_id', empresaId)
      }
    }

    // Borrar liquidación previa si existe (para permitir correcciones)
    await supabase.from('liquidaciones').delete().eq('despacho_id', despachoSel.id).eq('fecha', fecha).eq('empresa_id', empresaId)
    await supabase.from('liquidaciones_detalle').delete().eq('despacho_id', despachoSel.id).eq('fecha', fecha).eq('empresa_id', empresaId)
    await supabase.from('liquidaciones_fiados').delete().eq('despacho_id', despachoSel.id).eq('fecha', fecha).eq('empresa_id', empresaId)
    await supabase.from('liquidaciones_gastos').delete().eq('despacho_id', despachoSel.id).eq('fecha', fecha).eq('empresa_id', empresaId)
    await supabase.from('liquidaciones_descuentos').delete().eq('despacho_id', despachoSel.id).eq('fecha', fecha).eq('empresa_id', empresaId)

    const registros = detalle.map(item => ({
      empresa_id: empresaId,
      fecha,
      despacho_id: despachoSel.id,
      vendedor_id: despachoSel.vendedor_id,
      sku: item.sku,
      despachado: item.total,
      devuelto: parseFloat(devoluciones[item.sku] || 0),
      cambio: parseFloat(cambios[item.sku] || 0),
      vendido_neto: vendidoNeto(item),
      efectivo_esperado: vendidoNeto(item) * (item.producto?.precio_venta || 0),
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
        vendedor_id: despachoSel.vendedor_id,
        efectivo: parseFloat(efectivo || 0),
        transferencias_bancarias: parseFloat(transferencias || 0),
        total_fiados: totalFiados(),
        total_pagos_fiados: totalPagosFiados(),
        total_gastos: totalGastos(),
        total_merc_enviada: totalMercEnviada(),
        total_merc_recibida: totalVendidoTrans(),
        diferencia: diferencia()
      })
      if (errDetalle) fallos.push('resumen de la liquidacion (cuadre de caja)')

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
        if (errFiados) fallos.push('fiados y pagos de fiados')
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
          if (errUpdCart) fallos.push('cartera de fiados (actualizar)')
        } else {
          const { error: errInsCart } = await supabase.from('cartera_fiados').insert({
            empresa_id: empresaId, despacho_id: despachoSel.id, ruta_id: despachoSel.ruta_id, vendedor_id: despachoSel.vendedor_id,
            nombre_cliente: f.nombre, valor_original: parseFloat(f.valor), saldo: parseFloat(f.valor),
            fecha_fiado: fecha, fecha_pago: f.fecha_pago || null, estado: 'pendiente'
          })
          if (errInsCart) fallos.push('cartera de fiados (nuevo)')
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

      const transEnviadas = mercEnviada.filter(m => m.vendedor_id && m.sku && m.cantidad).map(m => ({
        empresa_id: empresaId, fecha, created_at: new Date().toISOString(),
        vendedor_origen_id: despachoSel.vendedor_id, vendedor_destino_id: m.vendedor_id,
        sku: m.sku, cantidad: parseFloat(m.cantidad),
        valor_unitario: getPrecio(m.sku), valor_total: parseFloat(m.cantidad) * getPrecio(m.sku)
      }))
      if (transEnviadas.length > 0) {
        const { error: errTransEnv } = await supabase.from('transferencias_mercancia').insert(transEnviadas)
        if (errTransEnv) fallos.push('mercancia transferida a otro vendedor')
      }

      if (transRecibidas.length > 0) {
        const ids = transRecibidas.map(t => t.id)
        const { error: errTransRec } = await supabase.from('transferencias_mercancia').update({ aplicada: true }).in('id', ids).eq('empresa_id', empresaId)
        if (errTransRec) fallos.push('marcar como aplicada la mercancia recibida')
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
            {diferencia() >= 0 ? '+' : ''}${diferencia().toLocaleString('es-CO')}
          </p>
        </div>
        <button onClick={() => router.push('/dashboard')} className="mt-6 bg-brand hover:bg-brand-dark text-white px-6 py-3 rounded-xl font-bold w-full">
          Volver al inicio
        </button>
      </div>
    </div>
  )

  return (
    <div>
      <div className="bg-white shadow-sm px-6 py-4 sticky top-0 z-10">
        <h1 className="text-xl font-black text-gray-900">Liquidacion Auxiliar</h1>
        {despachoSel && <p className="text-xs text-gray-500">{despachoSel.rutas?.nombre} · Paso {paso} de 3</p>}
      </div>

      <div className="p-4 max-w-2xl mx-auto">

        {paso === 1 && (
          <>
            <p className="text-sm font-bold text-gray-600 mb-3">Selecciona el despacho a liquidar</p>
            {despachos.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center shadow-sm">
                <p className="text-4xl mb-3">📭</p>
                <p className="text-gray-500">No hay despachos hoy</p>
              </div>
            ) : (
              despachos.map(d => (
                <button key={d.id} onClick={() => seleccionarDespacho(d)}
                  className="w-full bg-white rounded-xl p-4 shadow-sm mb-3 text-left hover:shadow-md transition-all">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-black text-gray-800">{d.rutas?.nombre}</p>
                      <p className="text-sm text-gray-500">{d.vendedores?.nombre} · {d.total_und} unidades</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${d.estado === 'liquidado' ? 'bg-gray-200 text-gray-800' : 'bg-brand/10 text-brand'}`}>
                      {d.estado === 'liquidado' ? 'Del kiosco' : 'Pendiente'}
                    </span>
                  </div>
                </button>
              ))
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
              <p className="font-black text-gray-900">{despachoSel?.rutas?.nombre} — {despachoSel?.vendedores?.nombre}</p>
              <p className="text-sm text-gray-600">Paso 2: Devoluciones y Cambios</p>
            </div>
            {detalle.map(item => (
              <div key={item.sku} className="bg-white rounded-xl shadow-sm p-4 mb-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-bold text-gray-800 text-sm">{item.producto?.nombre}</p>
                    <p className="text-xs text-gray-400">{item.sku} · Despachado: {item.total} · Vendido: {vendidoNeto(item)}</p>
                  </div>
                  <p className="text-sm font-black text-gray-900">${(vendidoNeto(item) * (item.producto?.precio_venta || 0)).toLocaleString('es-CO')}</p>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-600 font-bold block mb-1">Devolucion</label>
                    <input type="number" min="0" value={devoluciones[item.sku] || '0'}
                      onChange={e => setDevoluciones(prev => ({ ...prev, [item.sku]: e.target.value }))}
                      className="w-full text-center border-2 border-gray-200 rounded-lg py-2 font-bold text-gray-800 focus:border-brand focus:outline-none" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-brand font-bold block mb-1">Cambio</label>
                    <input type="number" min="0" value={cambios[item.sku] || '0'}
                      onChange={e => setCambios(prev => ({ ...prev, [item.sku]: e.target.value }))}
                      className="w-full text-center border-2 border-gray-200 rounded-lg py-2 font-bold text-gray-800 focus:border-brand focus:outline-none" />
                  </div>
                </div>
              </div>
            ))}
            {transRecibidas.length > 0 && (
              <div className="bg-gray-100 border border-gray-300 rounded-xl p-4 mb-4">
                <p className="font-bold text-gray-800 text-sm mb-2">Mercancia recibida de otros vendedores</p>
                {transRecibidas.map((t, i) => (
                  <p key={i} className="text-sm text-gray-700">{productosMap[t.sku]?.nombre || t.sku} · {t.cantidad} und · ${(t.cantidad * t.valor_unitario).toLocaleString('es-CO')}</p>
                ))}
              </div>
            )}
            <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
              <div className="flex justify-between mb-1">
                <p className="text-gray-600 text-sm">Vendido propio</p>
                <p className="font-black text-gray-900">${totalVendidoPropio().toLocaleString('es-CO')}</p>
              </div>
              {transRecibidas.length > 0 && (
                <div className="flex justify-between mb-1">
                  <p className="text-gray-600 text-sm">Vendido transferencias</p>
                  <p className="font-black text-gray-900">+${totalVendidoTrans().toLocaleString('es-CO')}</p>
                </div>
              )}
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

            <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
              <label className="text-sm font-black text-gray-700 block mb-2">Transferencias bancarias</label>
              <input type="number" min="0" value={transferencias} onChange={e => setTransferencias(e.target.value)}
                className="w-full text-center border-2 border-gray-200 rounded-xl py-3 text-2xl font-black text-gray-800 focus:border-brand focus:outline-none" placeholder="0" />
            </div>

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
                    {detalle.map(d => <option key={d.sku} value={d.sku}>{d.producto?.nombre} ({d.sku})</option>)}
                  </select>
                  <div className="flex gap-2">
                    <input type="text" placeholder="Motivo (opcional)" value={d.concepto}
                      onChange={e => { const n=[...descuentos]; n[i].concepto=e.target.value; setDescuentos(n) }}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand" />
                    <input type="number" placeholder="Valor" value={d.valor}
                      onChange={e => { const n=[...descuentos]; n[i].valor=e.target.value; setDescuentos(n) }}
                      className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 focus:outline-none focus:border-brand" />
                  </div>
                  {d.valor && <p className="text-right text-brand text-xs mt-1">-${parseFloat(d.valor).toLocaleString('es-CO')}</p>}
                </div>
              ))}
              {totalDescuentos() > 0 && <p className="text-right text-sm font-black text-brand">-${totalDescuentos().toLocaleString('es-CO')}</p>}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-black text-gray-700">Fiados</label>
                <button onClick={() => setFiados([...fiados, { nombre: '', valor: '', fecha_pago: '', cartera_fiados_id: '' }])} className="text-xs bg-gray-100 px-3 py-1 rounded-lg font-bold text-gray-600">+ Agregar</button>
              </div>
              {fiados.map((f, i) => (
                <div key={i} className="mb-3">
                  <div className="flex gap-2 mb-1">
                    <input type="text" placeholder="Nombre cliente" value={f.nombre}
                      onChange={e => { const n=[...fiados]; n[i].nombre=e.target.value; setFiados(n) }}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand" />
                    <input type="number" placeholder="Valor" value={f.valor}
                      onChange={e => { const n=[...fiados]; n[i].valor=e.target.value; setFiados(n) }}
                      className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 focus:outline-none focus:border-brand" />
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
                <label className="text-sm font-black text-gray-700">Pagos fiados recibidos</label>
                <button onClick={() => setPagosFiados([...pagosFiados, { cartera_fiados_id: '', nombre_manual: '', valor: '' }])} className="text-xs bg-gray-100 px-3 py-1 rounded-lg font-bold text-gray-600">+ Agregar</button>
              </div>
              {pagosFiados.map((p, i) => (
                <div key={i} className="mb-2">
                  <select value={p.cartera_fiados_id}
                    onChange={e => { const n=[...pagosFiados]; n[i].cartera_fiados_id=e.target.value; n[i].nombre_manual=''; setPagosFiados(n) }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand mb-1">
                    <option value="">Selecciona el fiado que esta pagando</option>
                    {fiadosPendientes.map(f => <option key={f.id} value={f.id}>{f.nombre_cliente} (debe ${(f.saldo || 0).toLocaleString('es-CO')})</option>)}
                    <option value="__otro__">Otro (no esta en la lista)</option>
                  </select>
                  <div className="flex gap-2">
                    {p.cartera_fiados_id === '__otro__' && (
                      <input type="text" placeholder="Nombre cliente" value={p.nombre_manual}
                        onChange={e => { const n=[...pagosFiados]; n[i].nombre_manual=e.target.value; setPagosFiados(n) }}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand" />
                    )}
                    <input type="number" placeholder="Valor" value={p.valor}
                      onChange={e => { const n=[...pagosFiados]; n[i].valor=e.target.value; setPagosFiados(n) }}
                      className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 focus:outline-none focus:border-brand" />
                  </div>
                </div>
              ))}
              {totalPagosFiados() > 0 && <p className="text-right text-sm font-black text-gray-900">+${totalPagosFiados().toLocaleString('es-CO')}</p>}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-black text-gray-700">Mercancia enviada</label>
                <button onClick={() => setMercEnviada([...mercEnviada, { vendedor_id: '', sku: '', cantidad: '' }])} className="text-xs bg-gray-100 px-3 py-1 rounded-lg font-bold text-gray-600">+ Agregar</button>
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
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand">
                      <option value="">Producto</option>
                      {detalle.map(d => <option key={d.sku} value={d.sku}>{d.producto?.nombre} ({d.sku})</option>)}
                    </select>
                    <input type="number" placeholder="Cant" value={m.cantidad}
                      onChange={e => { const n=[...mercEnviada]; n[i].cantidad=e.target.value; setMercEnviada(n) }}
                      className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 focus:outline-none focus:border-brand" />
                  </div>
                  {m.sku && m.cantidad && <p className="text-right text-brand text-xs mt-1">-${(parseFloat(m.cantidad) * getPrecio(m.sku)).toLocaleString('es-CO')}</p>}
                </div>
              ))}
              {totalMercEnviada() > 0 && <p className="text-right text-sm font-black text-brand">-${totalMercEnviada().toLocaleString('es-CO')}</p>}
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
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand" />
                    <input type="number" placeholder="Valor" value={g.valor}
                      onChange={e => { const n=[...gastos]; n[i].valor=e.target.value; setGastos(n) }}
                      className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 focus:outline-none focus:border-brand" />
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
                <p className="text-sm text-gray-600">Efectivo + Transf</p>
                <p className="font-bold">${(parseFloat(efectivo||0)+parseFloat(transferencias||0)).toLocaleString('es-CO')}</p>
              </div>
              {transRecibidas.length > 0 && (
                <div className="flex justify-between mb-1">
                  <p className="text-sm text-gray-600">Merc recibida</p>
                  <p className="font-bold text-gray-900">+${totalVendidoTrans().toLocaleString('es-CO')}</p>
                </div>
              )}
              <div className="flex justify-between mb-1">
                <p className="text-sm text-gray-600">Descuentos</p>
                <p className="font-bold text-brand">-${totalDescuentos().toLocaleString('es-CO')}</p>
              </div>
              <div className="flex justify-between mb-1">
                <p className="text-sm text-gray-600">Fiados nuevos</p>
                <p className="font-bold text-brand">-${totalFiados().toLocaleString('es-CO')}</p>
              </div>
              <div className="flex justify-between mb-1">
                <p className="text-sm text-gray-600">Pagos fiados recibidos</p>
                <p className="font-bold text-gray-900">+${totalPagosFiados().toLocaleString('es-CO')}</p>
              </div>
              <div className="flex justify-between mb-1">
                <p className="text-sm text-gray-600">Gastos ruta</p>
                <p className="font-bold text-brand">-${totalGastos().toLocaleString('es-CO')}</p>
              </div>
              <div className="flex justify-between mb-1">
                <p className="text-sm text-gray-600">Merc enviada</p>
                <p className="font-bold text-brand">-${totalMercEnviada().toLocaleString('es-CO')}</p>
              </div>
              <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between">
                <p className="font-black text-gray-700">Diferencia</p>
                <p className={`text-xl font-black ${diferencia() >= 0 ? 'text-gray-900' : 'text-brand'}`}>
                  {diferencia() >= 0 ? '+' : ''}${diferencia().toLocaleString('es-CO')}
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
