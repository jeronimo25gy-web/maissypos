'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'

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
  const [fiados, setFiados] = useState([{ nombre: '', valor: '', fecha_pago: '' }])
  const [pagosFiados, setPagosFiados] = useState([{ nombre: '', valor: '' }])
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
    const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
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
    const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const { data: det } = await supabase.from('despachos_detalle').select('*').eq('despacho_id', d.id)
    const { data: prods } = await supabase.from('productos').select('sku, nombre, precio_venta').eq('empresa_id', getEmpresaId())
    const { data: config } = await supabase.from('configuracion').select('valor').eq('parametro', 'base_despacho_' + d.id).single()
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
        .gte('created_at', new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) + 'T05:00:00.000Z').toISOString())
      if (transError) console.error('Error cargando transferencias recibidas:', transError)
      if (trans && trans.length > 0) setTransRecibidas(trans)

      // Intentar cargar datos del kiosco
      const { data: liq } = await supabase
        .from('liquidaciones')
        .select('*')
        .eq('despacho_id', d.id)
        .eq('fecha', fecha)
      const { data: liqDet } = await supabase
        .from('liquidaciones_detalle')
        .select('*')
        .eq('despacho_id', d.id)
        .eq('fecha', fecha)
        .single()
      const { data: liqFiados } = await supabase
        .from('liquidaciones_fiados')
        .select('*')
        .eq('despacho_id', d.id)
        .eq('fecha', fecha)
      const { data: liqGastos } = await supabase
        .from('liquidaciones_gastos')
        .select('*')
        .eq('despacho_id', d.id)
        .eq('fecha', fecha)
      const { data: liqDesc } = await supabase
        .from('liquidaciones_descuentos')
        .select('*')
        .eq('despacho_id', d.id)
        .eq('fecha', fecha)

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
      if (liqFiados && liqFiados.length > 0) {
        const fiadosData = liqFiados.filter(f => f.tipo === 'fiado').map(f => ({ nombre: f.nombre_cliente, valor: String(f.valor), fecha_pago: f.fecha_pago || '' }))
        const pagosData = liqFiados.filter(f => f.tipo === 'pago_fiado').map(f => ({ nombre: f.nombre_cliente, valor: String(f.valor) }))
        if (fiadosData.length > 0) setFiados(fiadosData)
        if (pagosData.length > 0) setPagosFiados(pagosData)
      }
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
    const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const empresaId = detalle[0]?.empresa_id

    // Borrar liquidación previa si existe (para permitir correcciones)
    await supabase.from('liquidaciones').delete().eq('despacho_id', despachoSel.id).eq('fecha', fecha)
    await supabase.from('liquidaciones_detalle').delete().eq('despacho_id', despachoSel.id).eq('fecha', fecha)
    await supabase.from('liquidaciones_fiados').delete().eq('despacho_id', despachoSel.id).eq('fecha', fecha)
    await supabase.from('liquidaciones_gastos').delete().eq('despacho_id', despachoSel.id).eq('fecha', fecha)
    await supabase.from('liquidaciones_descuentos').delete().eq('despacho_id', despachoSel.id).eq('fecha', fecha)

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
      await supabase.from('despachos_encab').update({ estado: 'liquidado' }).eq('id', despachoSel.id)

      await supabase.from('liquidaciones_detalle').insert({
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

      const fiadosReg = fiados.filter(f => f.nombre && f.valor).map(f => ({
        empresa_id: empresaId, fecha, despacho_id: despachoSel.id, vendedor_id: despachoSel.vendedor_id,
        nombre_cliente: f.nombre, valor: parseFloat(f.valor), tipo: 'fiado', fecha_pago: f.fecha_pago || null
      }))
      const pagosReg = pagosFiados.filter(p => p.nombre && p.valor).map(p => ({
        empresa_id: empresaId, fecha, despacho_id: despachoSel.id, vendedor_id: despachoSel.vendedor_id,
        nombre_cliente: p.nombre, valor: parseFloat(p.valor), tipo: 'pago_fiado'
      }))
      if ([...fiadosReg, ...pagosReg].length > 0) await supabase.from('liquidaciones_fiados').insert([...fiadosReg, ...pagosReg])

      const cartFiados = fiados.filter(f => f.nombre && f.valor).map(f => ({
        empresa_id: empresaId,
        ruta_id: despachoSel.ruta_id,
        vendedor_id: despachoSel.vendedor_id,
        nombre_cliente: f.nombre,
        valor_original: parseFloat(f.valor),
        saldo: parseFloat(f.valor),
        fecha_fiado: fecha,
        fecha_pago: f.fecha_pago || null,
        estado: 'pendiente'
      }))
      if (cartFiados.length > 0) await supabase.from('cartera_fiados').insert(cartFiados)

      const gastosReg = gastos.filter(g => g.categoria && g.valor).map(g => ({
        empresa_id: empresaId, fecha, despacho_id: despachoSel.id, vendedor_id: despachoSel.vendedor_id,
        categoria: g.categoria, concepto: g.concepto, valor: parseFloat(g.valor)
      }))
      if (gastosReg.length > 0) await supabase.from('liquidaciones_gastos').insert(gastosReg)

      const descuentosReg = descuentos.filter(d => d.valor).map(d => ({
        empresa_id: empresaId, fecha, despacho_id: despachoSel.id, vendedor_id: despachoSel.vendedor_id,
        sku: d.sku || null, concepto: d.concepto, valor: parseFloat(d.valor)
      }))
      if (descuentosReg.length > 0) await supabase.from('liquidaciones_descuentos').insert(descuentosReg)

      const transEnviadas = mercEnviada.filter(m => m.vendedor_id && m.sku && m.cantidad).map(m => ({
        empresa_id: empresaId, fecha, created_at: new Date().toISOString(),
        vendedor_origen_id: despachoSel.vendedor_id, vendedor_destino_id: m.vendedor_id,
        sku: m.sku, cantidad: parseFloat(m.cantidad),
        valor_unitario: getPrecio(m.sku), valor_total: parseFloat(m.cantidad) * getPrecio(m.sku)
      }))
      if (transEnviadas.length > 0) await supabase.from('transferencias_mercancia').insert(transEnviadas)

      if (transRecibidas.length > 0) {
        const ids = transRecibidas.map(t => t.id)
        await supabase.from('transferencias_mercancia').update({ aplicada: true }).in('id', ids)
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
                <button onClick={() => setFiados([...fiados, { nombre: '', valor: '', fecha_pago: '' }])} className="text-xs bg-gray-100 px-3 py-1 rounded-lg font-bold text-gray-600">+ Agregar</button>
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
                <button onClick={() => setPagosFiados([...pagosFiados, { nombre: '', valor: '' }])} className="text-xs bg-gray-100 px-3 py-1 rounded-lg font-bold text-gray-600">+ Agregar</button>
              </div>
              {pagosFiados.map((p, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input type="text" placeholder="Nombre cliente" value={p.nombre}
                    onChange={e => { const n=[...pagosFiados]; n[i].nombre=e.target.value; setPagosFiados(n) }}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand" />
                  <input type="number" placeholder="Valor" value={p.valor}
                    onChange={e => { const n=[...pagosFiados]; n[i].valor=e.target.value; setPagosFiados(n) }}
                    className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 focus:outline-none focus:border-brand" />
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
