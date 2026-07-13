'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '../../lib/supabase'
import { cerrarSesionUsuario } from '../../lib/sesion'
import { getEmpresaId } from '../../lib/empresa'
import { obtenerFechaActual } from '../../lib/supabase-helpers'

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
  const [devTransfer, setDevTransfer] = useState({})
  const [camTransfer, setCamTransfer] = useState({})
  const [mercEnviada, setMercEnviada] = useState([{ vendedor_id: '', sku: '', cantidad: '' }])
  const [efectivo, setEfectivo] = useState('')
  const [transferencias, setTransferencias] = useState('')
 const [fiados, setFiados] = useState([{ nombre: '', valor: '', fecha_pago: '' }])
  const [pagosFiados, setPagosFiados] = useState([{ nombre: '', valor: '' }])
  const [categoriasGastos, setCategoriasGastos] = useState([])
  const AUTORIZADORES_OBSEQUIOS = ['Jero', 'Kathe']
  const [gastos, setGastos] = useState([{ categoria: '', concepto: '', valor: '' }])
  const [descuentos, setDescuentos] = useState([{ sku: '', concepto: '', valor: '' }])
  const [obsequios, setObsequios] = useState([{ sku: '', cantidad: '', autorizado_por: '' }])
  const [paso, setPaso] = useState(1)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (parsed.rol !== 'vendedor') { router.push('/dashboard'); return }
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
      return vend
    }
    return null
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
    const { data: prods } = await supabase.from('productos').select('sku, nombre, precio_venta').eq('empresa_id', getEmpresaId())
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
        const { data: trans, error: transError } = await supabase
          .from('transferencias_mercancia')
          .select('*')
          .eq('vendedor_destino_id', vendId)
          .eq('aplicada', false)
          .eq('empresa_id', getEmpresaId())
          .gte('created_at', new Date(obtenerFechaActual() + 'T05:00:00.000Z').toISOString())
        if (transError) console.error('Error cargando transferencias recibidas:', transError)
        if (trans && trans.length > 0) {
          setTransRecibidas(trans)
          const dt = {}
          const ct = {}
          trans.forEach(t => { dt[t.id] = '0'; ct[t.id] = '0' })
          setDevTransfer(dt)
          setCamTransfer(ct)
        }
      }
      setPaso(2)
    }
  }

  const cargarProductosVendedor = async (vendedor_id, index) => {
    const fecha = obtenerFechaActual()
    const { data: desp } = await supabase.from('despachos_encab').select('id').eq('fecha', fecha).eq('vendedor_id', vendedor_id).eq('empresa_id', getEmpresaId()).limit(1)
    if (desp && desp.length > 0) {
      const { data: det } = await supabase.from('despachos_detalle').select('sku, total').eq('despacho_id', desp[0].id).eq('empresa_id', getEmpresaId())
      if (det) {
        const n = [...mercEnviada]
        n[index].productosDisp = det.map(d => ({ sku: d.sku, nombre: productosMap[d.sku]?.nombre || d.sku }))
        n[index].sku = ''
        setMercEnviada(n)
      }
    } else {
      const n = [...mercEnviada]
      n[index].productosDisp = []
      n[index].sku = ''
      setMercEnviada(n)
    }
  }

  const getPrecio = (sku) => productosMap[sku]?.precio_venta || 0

  const vendidoNeto = (item) => (item.total || 0) - parseFloat(devoluciones[item.sku] || 0) - parseFloat(cambios[item.sku] || 0)
  const vendidoNetoTrans = (t) => t.cantidad - parseFloat(devTransfer[t.id] || 0) - parseFloat(camTransfer[t.id] || 0)
  const totalVendidoPropio = () => detalle.reduce((sum, item) => sum + vendidoNeto(item) * getPrecio(item.sku), 0)
  const totalVendidoTrans = () => transRecibidas.reduce((sum, t) => sum + vendidoNetoTrans(t) * (t.valor_unitario || 0), 0)
  const totalVendidoValor = () => totalVendidoPropio() + totalVendidoTrans()
  const totalMercEnviada = () => mercEnviada.reduce((sum, m) => sum + parseFloat(m.cantidad || 0) * getPrecio(m.sku), 0)
  const totalFiados = () => fiados.reduce((sum, f) => sum + parseFloat(f.valor || 0), 0)
  const totalPagosFiados = () => pagosFiados.reduce((sum, p) => sum + parseFloat(p.valor || 0), 0)
  const totalGastos = () => gastos.reduce((sum, g) => sum + parseFloat(g.valor || 0), 0)
  const totalDescuentos = () => descuentos.reduce((sum, d) => sum + parseFloat(d.valor || 0), 0)
  const totalObsequios = () => obsequios.reduce((sum, o) => sum + parseFloat(o.cantidad || 0) * getPrecio(o.sku), 0)
  const totalAEntregar = () => totalVendidoValor() + base - totalFiados() + totalPagosFiados() - totalDescuentos() - totalMercEnviada()
  const totalEntregado = () => parseFloat(efectivo || 0) + parseFloat(transferencias || 0) + totalGastos()
  const diferencia = () => totalEntregado() - totalAEntregar()

    const guardarLiquidacion = async () => {
    setGuardando(true)
    const fecha = despachoSel.fecha
    const empresaId = getEmpresaId()

    const registros = detalle.map(item => ({
      empresa_id: empresaId,
      fecha,
      despacho_id: despachoSel.id,
      vendedor_id: vendedor.id,
      sku: item.sku,
      despachado: item.total,
      devuelto: parseFloat(devoluciones[item.sku] || 0),
      cambio: parseFloat(cambios[item.sku] || 0),
      vendido_neto: vendidoNeto(item),
      efectivo_esperado: vendidoNeto(item) * getPrecio(item.sku),
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
        total_merc_enviada: totalMercEnviada(),
        total_merc_recibida: totalVendidoTrans(),
        diferencia: diferencia()
      })
      if (errDetalle) fallos.push('resumen de la liquidacion (cuadre de caja)')

      const fiadosReg = fiados.filter(f => f.nombre && f.valor).map(f => ({
        empresa_id: empresaId, fecha, despacho_id: despachoSel.id, vendedor_id: vendedor.id,
        nombre_cliente: f.nombre, valor: parseFloat(f.valor), tipo: 'fiado'
      }))
      const pagosReg = pagosFiados.filter(p => p.nombre && p.valor).map(p => ({
        empresa_id: empresaId, fecha, despacho_id: despachoSel.id, vendedor_id: vendedor.id,
        nombre_cliente: p.nombre, valor: parseFloat(p.valor), tipo: 'pago_fiado'
      }))
      if ([...fiadosReg, ...pagosReg].length > 0) {
        const { error: errFiados } = await supabase.from('liquidaciones_fiados').insert([...fiadosReg, ...pagosReg])
        if (errFiados) fallos.push('fiados y pagos de fiados')
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

      const transEnviadas = mercEnviada.filter(m => m.vendedor_id && m.sku && m.cantidad).map(m => ({
        empresa_id: empresaId, fecha, created_at: new Date().toISOString(),
        vendedor_origen_id: vendedor.id, vendedor_destino_id: m.vendedor_id,
        sku: m.sku, cantidad: parseFloat(m.cantidad),
        valor_unitario: getPrecio(m.sku), valor_total: parseFloat(m.cantidad) * getPrecio(m.sku)
      }))
      if (transEnviadas.length > 0) {
        const { error: errTransEnv } = await supabase.from('transferencias_mercancia').insert(transEnviadas)
        if (errTransEnv) fallos.push('mercancia transferida a otro vendedor')
      }

      if (transRecibidas.length > 0) {
        const idsAplicar = transRecibidas.map(t => t.id)
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

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="bg-gray-800 px-8 py-5 flex justify-between items-center">
        <div>
          <div className="cursor-pointer" onClick={() => router.push('/dashboard')}>
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
            <h2 className="text-2xl font-black text-white mb-2">Devoluciones y Cambios</h2>
            <p className="text-gray-400 mb-4">Ingresa lo que traes de vuelta</p>

            {metaRuta && (
              <div className="bg-gray-800 rounded-2xl p-5 mb-4">
                <p className="text-gray-400 text-sm mb-2">Meta de la ruta este mes</p>
                <p className="text-4xl font-black text-brand mb-3">{metaRuta.pct.toFixed(0)}%</p>
                <div className="w-full bg-gray-700 rounded-full h-3">
                  <div className="h-3 rounded-full bg-brand" style={{ width: `${metaRuta.pct}%` }} />
                </div>
              </div>
            )}

            {detalle.map(item => (
              <div key={item.sku} className="bg-gray-800 rounded-2xl p-5 mb-4">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-white font-bold text-lg">{item.producto.nombre}</p>
                    <p className="text-gray-500 text-sm">{item.sku}</p>
                    <p className="text-gray-400">Despachado: {item.total} und</p>
                  </div>
                  <p className="text-white font-black text-lg">{vendidoNeto(item)} vendido</p>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-gray-300 font-bold text-sm block mb-2">Devolucion</label>
                    <input type="number" min="0" value={devoluciones[item.sku]}
                      onChange={e => setDevoluciones(prev => ({ ...prev, [item.sku]: e.target.value }))}
                      className="w-full text-center bg-gray-700 text-white border-2 border-gray-500 rounded-xl py-3 text-2xl font-black focus:border-brand focus:outline-none" />
                  </div>
                  <div className="flex-1">
                    <label className="text-brand font-bold text-sm block mb-2">Cambio</label>
                    <input type="number" min="0" value={cambios[item.sku]}
                      onChange={e => setCambios(prev => ({ ...prev, [item.sku]: e.target.value }))}
                      className="w-full text-center bg-gray-700 text-white border-2 border-brand rounded-xl py-3 text-2xl font-black focus:border-brand focus:outline-none" />
                  </div>
                </div>
              </div>
            ))}

            {transRecibidas.length > 0 && (
              <div className="mb-4">
                <p className="text-white font-black text-lg mb-3">Mercancia recibida de otros vendedores</p>
                {transRecibidas.map(t => (
                  <div key={t.id} className="bg-gray-800 border border-gray-600 rounded-2xl p-5 mb-4">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-white font-bold text-lg">{productosMap[t.sku]?.nombre || t.sku}</p>
                        <p className="text-gray-500 text-sm">{t.sku}</p>
                        <p className="text-gray-300 text-sm">Recibido: {t.cantidad} und · ${(t.valor_unitario || 0).toLocaleString('es-CO')} c/u</p>
                      </div>
                      <p className="text-white font-black text-lg">{vendidoNetoTrans(t)} vendido</p>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="text-gray-300 font-bold text-sm block mb-2">Devolucion</label>
                        <input type="number" min="0" value={devTransfer[t.id]}
                          onChange={e => setDevTransfer(prev => ({ ...prev, [t.id]: e.target.value }))}
                          className="w-full text-center bg-gray-700 text-white border-2 border-gray-500 rounded-xl py-3 text-2xl font-black focus:border-brand focus:outline-none" />
                      </div>
                      <div className="flex-1">
                        <label className="text-brand font-bold text-sm block mb-2">Cambio</label>
                        <input type="number" min="0" value={camTransfer[t.id]}
                          onChange={e => setCamTransfer(prev => ({ ...prev, [t.id]: e.target.value }))}
                          className="w-full text-center bg-gray-700 text-white border-2 border-brand rounded-xl py-3 text-2xl font-black focus:border-brand focus:outline-none" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-gray-800 rounded-2xl p-5 mb-4">
              <div className="flex justify-between items-center mb-3">
                <label className="text-white font-black text-lg">Mercancia enviada a otro vendedor</label>
                <button onClick={() => setMercEnviada([...mercEnviada, { vendedor_id: '', sku: '', cantidad: '', productosDisp: [] }])}
                  className="bg-gray-700 text-gray-300 px-4 py-2 rounded-xl font-bold">+ Agregar</button>
              </div>
              {mercEnviada.map((m, i) => (
                <div key={i} className="mb-3">
                  <select value={m.vendedor_id}
                    onChange={e => { const n=[...mercEnviada]; n[i].vendedor_id=e.target.value; setMercEnviada(n); cargarProductosVendedor(e.target.value, i) }}
                    className="w-full bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-brand mb-2">
                    <option value="">A quien le envio</option>
                    {vendedores.filter(v => v.id !== vendedor?.id).map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <select value={m.sku}
                      onChange={e => { const n=[...mercEnviada]; n[i].sku=e.target.value; setMercEnviada(n) }}
                      className="flex-1 bg-gray-700 text-white border border-gray-600 rounded-xl px-3 py-3 text-base focus:outline-none focus:border-brand">
                      <option value="">Selecciona producto</option>
                      {detalle.map(d => <option key={d.sku} value={d.sku}>{d.producto.nombre} ({d.sku})</option>)}
{transRecibidas.map(t => <option key={'t-'+t.sku} value={t.sku}>{t.productos?.nombre} ({t.sku})</option>)}
                    </select>
                    <input type="number" placeholder="Cant" value={m.cantidad}
                      onChange={e => { const n=[...mercEnviada]; n[i].cantidad=e.target.value; setMercEnviada(n) }}
                      className="w-24 bg-gray-700 text-white border border-gray-600 rounded-xl px-3 py-3 text-lg font-bold focus:outline-none focus:border-brand" />
                  </div>
                  {m.sku && m.cantidad && <p className="text-right text-brand text-sm mt-1">-${(parseFloat(m.cantidad) * getPrecio(m.sku)).toLocaleString('es-CO')}</p>}
                </div>
              ))}
              {totalMercEnviada() > 0 && <p className="text-right text-brand font-black">Total enviado: -${totalMercEnviada().toLocaleString('es-CO')}</p>}
            </div>

            <div className="bg-gray-800 rounded-2xl p-5 mb-6">
              <div className="flex justify-between mb-2">
                <p className="text-gray-400">Vendido propio</p>
                <p className="text-white font-black">${totalVendidoPropio().toLocaleString('es-CO')}</p>
              </div>
              {transRecibidas.length > 0 && (
                <div className="flex justify-between mb-2">
                  <p className="text-gray-400">Vendido transferencias</p>
                  <p className="text-white font-black">+${totalVendidoTrans().toLocaleString('es-CO')}</p>
                </div>
              )}
              <div className="flex justify-between mb-2">
                <p className="text-gray-400">Base entregada</p>
                <p className="text-white font-black">+${base.toLocaleString('es-CO')}</p>
              </div>
                            {totalMercEnviada() > 0 && (
                <div className="flex justify-between mb-2">
                  <p className="text-gray-400">Merc enviada</p>
                  <p className="text-brand font-black">-${totalMercEnviada().toLocaleString('es-CO')}</p>
                </div>
              )}
              <div className="border-t border-gray-600 mt-3 pt-3 flex justify-between">
                <p className="text-white font-black text-lg">Total a entregar</p>
                <p className="text-white font-black text-2xl">${totalAEntregar().toLocaleString('es-CO')}</p>
              </div>
            </div>
            <button onClick={() => setPaso(3)}
              className="w-full bg-brand hover:bg-brand-dark text-white font-black py-5 rounded-2xl text-xl">
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
        {detalle.map(d => <option key={d.sku} value={d.sku}>{d.producto.nombre} ({d.sku})</option>)}
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
                <button onClick={() => setPagosFiados([...pagosFiados, { nombre: '', valor: '' }])} className="bg-gray-700 text-gray-300 px-4 py-2 rounded-xl font-bold">+ Agregar</button>
              </div>
              {pagosFiados.map((p, i) => (
                <div key={i} className="flex gap-3 mb-3">
                  <input type="text" placeholder="Nombre cliente" value={p.nombre}
                    onChange={e => { const n=[...pagosFiados]; n[i].nombre=e.target.value; setPagosFiados(n) }}
                    className="flex-1 bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-brand" />
                  <input type="number" placeholder="Valor" value={p.valor}
                    onChange={e => { const n=[...pagosFiados]; n[i].valor=e.target.value; setPagosFiados(n) }}
                    className="w-36 bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-lg font-bold focus:outline-none focus:border-brand" />
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
                    {detalle.map(d => <option key={d.sku} value={d.sku}>{d.producto.nombre} ({d.sku})</option>)}
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
              {totalObsequios() > 0 && <p className="text-right text-gray-300 font-black">Obsequios: ${totalObsequios().toLocaleString('es-CO')} (no afecta el total)</p>}
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
              <div className="flex justify-between mb-2">
                <p className="text-gray-300">Merc enviada</p>
                <p className="text-brand font-bold">-${totalMercEnviada().toLocaleString('es-CO')}</p>
              </div>
              {totalObsequios() > 0 && (
                <div className="flex justify-between mb-2">
                  <p className="text-gray-400">Obsequios (informativo, no afecta el total)</p>
                  <p className="text-gray-400 font-bold">${totalObsequios().toLocaleString('es-CO')}</p>
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
