'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function Liquidacion() {
  const [usuario, setUsuario] = useState(null)
  const [despachos, setDespachos] = useState([])
  const [despachoSel, setDespachoSel] = useState(null)
  const [detalle, setDetalle] = useState([])
  const [devoluciones, setDevoluciones] = useState({})
  const [cambios, setCambios] = useState({})
  const [efectivo, setEfectivo] = useState('')
  const [transferencias, setTransferencias] = useState('')
  const [baseDevuelta, setBaseDevuelta] = useState('')
  const [fiados, setFiados] = useState([{ nombre: '', direccion: '', valor: '' }])
  const [descuentos, setDescuentos] = useState([{ motivo: '', valor: '' }])
  const [gastos, setGastos] = useState([{ concepto: '', valor: '' }])
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [paso, setPaso] = useState(1)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    setUsuario(JSON.parse(u))
    cargarDespachos()
  }, [])

  const cargarDespachos = async () => {
    const fecha = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('despachos_encab')
      .select('*, rutas(nombre)')
      .eq('fecha', fecha)
      .eq('estado', 'despachado')
    if (data) setDespachos(data)
  }

  const seleccionarDespacho = async (d) => {
    setDespachoSel(d)
    const { data: det } = await supabase.from('despachos_detalle').select('*').eq('despacho_id', d.id)
    const { data: prods } = await supabase.from('productos').select('sku, nombre, precio_venta')
    if (det && prods) {
      const prodsMap = {}
      prods.forEach(p => { prodsMap[p.sku] = p })
      const merged = det.map(item => ({ ...item, producto: prodsMap[item.sku] || {} }))
      setDetalle(merged)
      const devs = {}
      const cams = {}
      merged.forEach(item => { devs[item.sku] = '0'; cams[item.sku] = '0' })
      setDevoluciones(devs)
      setCambios(cams)
      setPaso(2)
    }
  }

  const vendidoNeto = (item) => {
    return (item.total || 0) - parseFloat(devoluciones[item.sku] || 0) - parseFloat(cambios[item.sku] || 0)
  }

  const totalVendidoValor = () => detalle.reduce((sum, item) => sum + vendidoNeto(item) * (item.producto?.precio_venta || 0), 0)

  const totalFiados = () => fiados.reduce((sum, f) => sum + parseFloat(f.valor || 0), 0)
  const totalDescuentos = () => descuentos.reduce((sum, d) => sum + parseFloat(d.valor || 0), 0)
  const totalGastos = () => gastos.reduce((sum, g) => sum + parseFloat(g.valor || 0), 0)

  const totalRecaudado = () => {
    return parseFloat(efectivo || 0) + parseFloat(transferencias || 0) + totalFiados() + totalDescuentos()
  }

  const diferencia = () => totalRecaudado() - totalGastos() - parseFloat(baseDevuelta || 0) - totalVendidoValor()

  const agregarFiado = () => setFiados([...fiados, { nombre: '', direccion: '', valor: '' }])
  const agregarDescuento = () => setDescuentos([...descuentos, { motivo: '', valor: '' }])
  const agregarGasto = () => setGastos([...gastos, { concepto: '', valor: '' }])

  const guardarLiquidacion = async () => {
    setGuardando(true)
    const fecha = new Date().toISOString().split('T')[0]
    const registros = detalle.map(item => ({
      empresa_id: item.empresa_id,
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
      setGuardado(true)
    } else {
      alert('Error: ' + error.message)
    }
    setGuardando(false)
  }

  if (guardado) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-md w-full">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-2xl font-black text-gray-800">Liquidacion completa</h2>
        <p className="text-gray-500 mt-1">{despachoSel?.rutas?.nombre}</p>
        <div className={`mt-4 p-4 rounded-xl ${Math.abs(diferencia()) < 100 ? 'bg-green-50' : 'bg-red-50'}`}>
          <p className="text-sm text-gray-500">Diferencia</p>
          <p className={`text-3xl font-black ${Math.abs(diferencia()) < 100 ? 'text-green-600' : 'text-red-600'}`}>
            {diferencia() >= 0 ? '+' : ''}${diferencia().toLocaleString('es-CO')}
          </p>
        </div>
        <button onClick={() => router.push('/dashboard')} className="mt-6 bg-orange-500 text-white px-6 py-3 rounded-xl font-bold w-full">
          Volver al inicio
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow-sm px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-black text-green-600">Liquidacion</h1>
          {despachoSel && <p className="text-xs text-gray-500">{despachoSel.rutas?.nombre} · Paso {paso} de 3</p>}
        </div>
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 text-sm">Cancelar</button>
      </div>

      <div className="p-4 max-w-2xl mx-auto">

        {/* PASO 1 - Seleccionar ruta */}
        {paso === 1 && (
          <>
            <p className="text-sm font-bold text-gray-600 mb-3">Selecciona tu ruta</p>
            {despachos.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center shadow-sm">
                <p className="text-4xl mb-3">📭</p>
                <p className="text-gray-500">No hay despachos pendientes hoy</p>
              </div>
            ) : (
              despachos.map(d => (
                <button key={d.id} onClick={() => seleccionarDespacho(d)}
                  className="w-full bg-white rounded-xl p-4 shadow-sm mb-3 text-left hover:shadow-md transition-all">
                  <p className="font-black text-gray-800">{d.rutas?.nombre}</p>
                  <p className="text-sm text-gray-500">{d.total_und} unidades · ${d.total_valor?.toLocaleString('es-CO')}</p>
                </button>
              ))
            )}
          </>
        )}

        {/* PASO 2 - Devoluciones y cambios */}
        {paso === 2 && (
          <>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
              <p className="font-black text-green-700">Paso 2: Devoluciones y Cambios</p>
              <p className="text-sm text-green-600">Ingresa lo que trajo de vuelta el vendedor</p>
            </div>
            {detalle.map(item => (
              <div key={item.sku} className="bg-white rounded-xl shadow-sm p-4 mb-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-bold text-gray-800 text-sm">{item.producto?.nombre}</p>
                    <p className="text-xs text-gray-400">Despachado: {item.total} und · Vendido: {vendidoNeto(item)} und</p>
                  </div>
                  <p className="text-sm font-black text-green-600">${(vendidoNeto(item) * (item.producto?.precio_venta || 0)).toLocaleString('es-CO')}</p>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-yellow-600 font-bold block mb-1">↩ Devolucion</label>
                    <input type="number" min="0" max={item.total} value={devoluciones[item.sku]}
                      onChange={e => setDevoluciones(prev => ({ ...prev, [item.sku]: e.target.value }))}
                      className="w-full text-center border-2 border-yellow-200 rounded-lg py-2 font-bold focus:border-yellow-500 focus:outline-none" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-red-600 font-bold block mb-1">🔄 Cambio</label>
                    <input type="number" min="0" max={item.total} value={cambios[item.sku]}
                      onChange={e => setCambios(prev => ({ ...prev, [item.sku]: e.target.value }))}
                      className="w-full text-center border-2 border-red-200 rounded-lg py-2 font-bold focus:border-red-500 focus:outline-none" />
                  </div>
                </div>
              </div>
            ))}
            <div className="bg-white rounded-xl p-4 shadow-sm mb-4 flex justify-between">
              <p className="font-bold text-gray-600">Total vendido</p>
              <p className="font-black text-green-600 text-xl">${totalVendidoValor().toLocaleString('es-CO')}</p>
            </div>
            <button onClick={() => setPaso(3)} className="w-full bg-green-600 text-white font-black py-4 rounded-xl text-lg">
              Continuar al cuadre de caja →
            </button>
          </>
        )}

        {/* PASO 3 - Cuadre de caja */}
        {paso === 3 && (
          <>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
              <p className="font-black text-green-700">Paso 3: Cuadre de Caja</p>
              <p className="text-sm text-green-600">Total a cuadrar: <span className="font-black">${totalVendidoValor().toLocaleString('es-CO')}</span></p>
            </div>

            {/* Efectivo */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
              <label className="text-sm font-black text-gray-700 block mb-2">💵 Efectivo recibido</label>
              <input type="number" min="0" value={efectivo} onChange={e => setEfectivo(e.target.value)}
                className="w-full text-center border-2 border-gray-200 rounded-xl py-3 text-2xl font-black focus:border-green-500 focus:outline-none"
                placeholder="0" />
            </div>

            {/* Transferencias */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
              <label className="text-sm font-black text-gray-700 block mb-2">📱 Transferencias</label>
              <input type="number" min="0" value={transferencias} onChange={e => setTransferencias(e.target.value)}
                className="w-full text-center border-2 border-gray-200 rounded-xl py-3 text-2xl font-black focus:border-green-500 focus:outline-none"
                placeholder="0" />
            </div>

            {/* Fiados */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-black text-gray-700">📋 Fiados</label>
                <button onClick={agregarFiado} className="text-xs bg-gray-100 px-3 py-1 rounded-lg font-bold text-gray-600">+ Agregar</button>
              </div>
              {fiados.map((f, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input type="text" placeholder="Nombre cliente" value={f.nombre}
                    onChange={e => { const n=[...fiados]; n[i].nombre=e.target.value; setFiados(n) }}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500" />
                  <input type="number" placeholder="Valor" value={f.valor}
                    onChange={e => { const n=[...fiados]; n[i].valor=e.target.value; setFiados(n) }}
                    className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:border-green-500" />
                </div>
              ))}
              {totalFiados() > 0 && <p className="text-right text-sm font-black text-gray-600">Total: ${totalFiados().toLocaleString('es-CO')}</p>}
            </div>

            {/* Descuentos */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-black text-gray-700">🏷️ Descuentos</label>
                <button onClick={agregarDescuento} className="text-xs bg-gray-100 px-3 py-1 rounded-lg font-bold text-gray-600">+ Agregar</button>
              </div>
              {descuentos.map((d, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input type="text" placeholder="Motivo" value={d.motivo}
                    onChange={e => { const n=[...descuentos]; n[i].motivo=e.target.value; setDescuentos(n) }}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500" />
                  <input type="number" placeholder="Valor" value={d.valor}
                    onChange={e => { const n=[...descuentos]; n[i].valor=e.target.value; setDescuentos(n) }}
                    className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:border-green-500" />
                </div>
              ))}
              {totalDescuentos() > 0 && <p className="text-right text-sm font-black text-gray-600">Total: ${totalDescuentos().toLocaleString('es-CO')}</p>}
            </div>

            {/* Gastos */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-black text-gray-700">🚗 Gastos de ruta</label>
                <button onClick={agregarGasto} className="text-xs bg-gray-100 px-3 py-1 rounded-lg font-bold text-gray-600">+ Agregar</button>
              </div>
              {gastos.map((g, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input type="text" placeholder="Concepto" value={g.concepto}
                    onChange={e => { const n=[...gastos]; n[i].concepto=e.target.value; setGastos(n) }}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500" />
                  <input type="number" placeholder="Valor" value={g.valor}
                    onChange={e => { const n=[...gastos]; n[i].valor=e.target.value; setGastos(n) }}
                    className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:border-green-500" />
                </div>
              ))}
              {totalGastos() > 0 && <p className="text-right text-sm font-black text-gray-600">Total: ${totalGastos().toLocaleString('es-CO')}</p>}
            </div>

            {/* Base devuelta */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
              <label className="text-sm font-black text-gray-700 block mb-2">💰 Base devuelta (sencillo)</label>
              <input type="number" min="0" value={baseDevuelta} onChange={e => setBaseDevuelta(e.target.value)}
                className="w-full text-center border-2 border-gray-200 rounded-xl py-3 text-2xl font-black focus:border-green-500 focus:outline-none"
                placeholder="0" />
            </div>

            {/* Resumen cuadre */}
            <div className={`rounded-xl p-4 mb-4 ${Math.abs(diferencia()) < 100 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="flex justify-between mb-1">
                <p className="text-sm text-gray-600">Vendido neto</p>
                <p className="font-bold">${totalVendidoValor().toLocaleString('es-CO')}</p>
              </div>
              <div className="flex justify-between mb-1">
                <p className="text-sm text-gray-600">Recaudado</p>
                <p className="font-bold">${totalRecaudado().toLocaleString('es-CO')}</p>
              </div>
              <div className="flex justify-between mb-1">
                <p className="text-sm text-gray-600">Gastos + Base</p>
                <p className="font-bold">-${(totalGastos() + parseFloat(baseDevuelta || 0)).toLocaleString('es-CO')}</p>
              </div>
              <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between">
                <p className="font-black text-gray-700">Diferencia</p>
                <p className={`text-xl font-black ${Math.abs(diferencia()) < 100 ? 'text-green-600' : 'text-red-600'}`}>
                  {diferencia() >= 0 ? '+' : ''}${diferencia().toLocaleString('es-CO')}
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setPaso(2)} className="flex-1 bg-gray-200 text-gray-700 font-bold py-4 rounded-xl">
                ← Atras
              </button>
              <button onClick={guardarLiquidacion} disabled={guardando}
                className="flex-2 w-full bg-green-600 hover:bg-green-700 text-white font-black py-4 rounded-xl text-lg disabled:opacity-50">
                {guardando ? 'Guardando...' : 'Cerrar Liquidacion'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
