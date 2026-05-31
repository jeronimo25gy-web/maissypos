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
  const [efectivoReal, setEfectivoReal] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
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
    const { data: det } = await supabase
      .from('despachos_detalle')
      .select('*')
      .eq('despacho_id', d.id)
    const { data: prods } = await supabase
      .from('productos')
      .select('sku, nombre, precio_venta, presentacion')
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
    }
  }

  const vendidoNeto = (item) => {
    const despachado = item.total || 0
    const dev = parseFloat(devoluciones[item.sku] || 0)
    const cam = parseFloat(cambios[item.sku] || 0)
    return despachado - dev - cam
  }

  const efectivoEsperado = () => {
    return detalle.reduce((sum, item) => {
      return sum + vendidoNeto(item) * (item.producto?.precio_venta || 0)
    }, 0)
  }

  const diferencia = () => parseFloat(efectivoReal || 0) - efectivoEsperado()

  const guardarLiquidacion = async () => {
    if (!efectivoReal) { alert('Ingresa el efectivo recibido'); return }
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
      efectivo_real: parseFloat(efectivoReal)
    }))
    const { error } = await supabase.from('liquidaciones').insert(registros)
    if (error) { alert('Error: ' + error.message); setGuardando(false); return }
    await supabase.from('despachos_encab').update({ estado: 'liquidado' }).eq('id', despachoSel.id)
    setGuardado(true)
    setGuardando(false)
  }

  if (guardado) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-md w-full">
        <div className="text-6xl mb-4">💰</div>
        <h2 className="text-2xl font-black text-gray-800">Liquidacion guardada</h2>
        <p className="text-gray-500 mt-2">{despachoSel?.rutas?.nombre}</p>
        <div className={`mt-4 p-4 rounded-xl ${diferencia() === 0 ? 'bg-green-50' : diferencia() > 0 ? 'bg-blue-50' : 'bg-red-50'}`}>
          <p className="text-sm text-gray-600">Diferencia</p>
          <p className={`text-3xl font-black ${diferencia() === 0 ? 'text-green-600' : diferencia() > 0 ? 'text-blue-600' : 'text-red-600'}`}>
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
          <p className="text-xs text-gray-500">{new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 text-sm">Cancelar</button>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {!despachoSel ? (
          <>
            <p className="text-sm font-bold text-gray-600 mb-3">Selecciona el despacho a liquidar</p>
            {despachos.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center shadow-sm">
                <p className="text-4xl mb-3">📭</p>
                <p className="text-gray-500">No hay despachos pendientes de liquidar hoy</p>
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
        ) : (
          <>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
              <p className="font-black text-green-700">{despachoSel.rutas?.nombre}</p>
              <p className="text-sm text-green-600">Ingresa devoluciones y cambios por producto</p>
            </div>

            {detalle.map(item => (
              <div key={item.sku} className="bg-white rounded-xl shadow-sm p-4 mb-3">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-bold text-gray-800">{item.producto?.nombre}</p>
                    <p className="text-xs text-gray-400">{item.sku} · Despachado: {item.total} und</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-gray-800">{vendidoNeto(item)} vendido</p>
                    <p className="text-xs text-green-600">${(vendidoNeto(item) * (item.producto?.precio_venta || 0)).toLocaleString('es-CO')}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-yellow-600 font-bold block mb-1">Devolucion</label>
                    <input type="number" min="0" max={item.total}
                      value={devoluciones[item.sku]}
                      onChange={e => setDevoluciones(prev => ({ ...prev, [item.sku]: e.target.value }))}
                      className="w-full text-center border-2 border-yellow-200 rounded-lg py-2 font-bold focus:border-yellow-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-red-600 font-bold block mb-1">Cambio</label>
                    <input type="number" min="0" max={item.total}
                      value={cambios[item.sku]}
                      onChange={e => setCambios(prev => ({ ...prev, [item.sku]: e.target.value }))}
                      className="w-full text-center border-2 border-red-200 rounded-lg py-2 font-bold focus:border-red-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}

            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <div className="flex justify-between mb-2">
                <p className="text-gray-600">Efectivo esperado</p>
                <p className="font-black text-gray-800">${efectivoEsperado().toLocaleString('es-CO')}</p>
              </div>
              <label className="text-sm font-bold text-gray-600 block mb-2">Efectivo recibido</label>
              <input type="number" min="0"
                value={efectivoReal}
                onChange={e => setEfectivoReal(e.target.value)}
                className="w-full text-center border-2 border-green-200 rounded-xl py-3 text-2xl font-black focus:border-green-500 focus:outline-none"
                placeholder="0"
              />
              {efectivoReal && (
                <div className={`mt-3 p-3 rounded-lg text-center ${diferencia() === 0 ? 'bg-green-50' : diferencia() > 0 ? 'bg-blue-50' : 'bg-red-50'}`}>
                  <p className="text-sm text-gray-600">Diferencia</p>
                  <p className={`text-xl font-black ${diferencia() === 0 ? 'text-green-600' : diferencia() > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {diferencia() >= 0 ? '+' : ''}${diferencia().toLocaleString('es-CO')}
                  </p>
                </div>
              )}
            </div>

            <button onClick={guardarLiquidacion} disabled={guardando}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-black py-4 rounded-xl text-lg disabled:opacity-50">
              {guardando ? 'Guardando...' : 'Cerrar Liquidacion'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
