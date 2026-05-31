'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function Devoluciones() {
  const [usuario, setUsuario] = useState(null)
  const [despachos, setDespachos] = useState([])
  const [despachoSel, setDespachoSel] = useState(null)
  const [detalle, setDetalle] = useState([])
  const [devoluciones, setDevoluciones] = useState({})
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
      .in('estado', ['despachado', 'liquidado'])
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
      merged.forEach(item => { devs[item.sku] = '0' })
      setDevoluciones(devs)
    }
  }

  const totalDevuelto = () => {
    return Object.values(devoluciones).reduce((sum, v) => sum + parseFloat(v || 0), 0)
  }

  const guardarDevoluciones = async () => {
    const conDevolucion = detalle.filter(item => parseFloat(devoluciones[item.sku] || 0) > 0)
    if (conDevolucion.length === 0) { alert('Ingresa al menos una devolucion'); return }
    setGuardando(true)
    const fecha = new Date().toISOString().split('T')[0]
    const movimientos = conDevolucion.map(item => ({
      empresa_id: item.empresa_id,
      fecha,
      sku: item.sku,
      tipo_movimiento: 'devolucion',
      cantidad: parseFloat(devoluciones[item.sku]),
      saldo_anterior: 0,
      saldo_nuevo: 0,
      referencia: `Devolucion ruta ${despachoSel.rutas?.nombre} - despacho ${despachoSel.id}`
    }))
    const { error } = await supabase.from('inventario_mov').insert(movimientos)
    if (error) { alert('Error: ' + error.message); setGuardando(false); return }
    setGuardado(true)
    setGuardando(false)
  }

  if (guardado) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-md w-full">
        <div className="text-6xl mb-4">↩️</div>
        <h2 className="text-2xl font-black text-gray-800">Devoluciones registradas</h2>
        <p className="text-gray-500 mt-2">{despachoSel?.rutas?.nombre}</p>
        <p className="text-3xl font-black text-yellow-500 mt-4">{totalDevuelto()} unidades</p>
        <p className="text-sm text-gray-500 mt-1">Vuelven a stock normal vendible</p>
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
          <h1 className="text-xl font-black text-yellow-500">Devoluciones</h1>
          <p className="text-xs text-gray-500">Unidades que regresan a stock normal</p>
        </div>
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 text-sm">Cancelar</button>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {!despachoSel ? (
          <>
            <p className="text-sm font-bold text-gray-600 mb-3">Selecciona la ruta</p>
            {despachos.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center shadow-sm">
                <p className="text-4xl mb-3">📭</p>
                <p className="text-gray-500">No hay despachos de hoy</p>
              </div>
            ) : (
              despachos.map(d => (
                <button key={d.id} onClick={() => seleccionarDespacho(d)}
                  className="w-full bg-white rounded-xl p-4 shadow-sm mb-3 text-left hover:shadow-md transition-all">
                  <p className="font-black text-gray-800">{d.rutas?.nombre}</p>
                  <p className="text-sm text-gray-500">{d.total_und} unidades despachadas</p>
                </button>
              ))
            )}
          </>
        ) : (
          <>
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
              <p className="font-black text-yellow-700">{despachoSel.rutas?.nombre}</p>
              <p className="text-sm text-yellow-600">Ingresa cuantas unidades devolvio el vendedor de cada producto. Estas vuelven a stock normal.</p>
            </div>

            {detalle.map(item => (
              <div key={item.sku} className="bg-white rounded-xl shadow-sm p-4 mb-3 flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-bold text-gray-800">{item.producto?.nombre}</p>
                  <p className="text-xs text-gray-400">{item.sku} · Despachado: {item.total} und</p>
                </div>
                <input
                  type="number" min="0" max={item.total}
                  value={devoluciones[item.sku]}
                  onChange={e => setDevoluciones(prev => ({ ...prev, [item.sku]: e.target.value }))}
                  className="w-20 text-center border-2 border-yellow-200 rounded-lg py-2 text-lg font-bold focus:border-yellow-500 focus:outline-none ml-3"
                />
              </div>
            ))}

            <div className="bg-white rounded-xl p-4 shadow-sm mb-4 flex justify-between items-center">
              <p className="font-bold text-gray-600">Total a devolver</p>
              <p className="text-2xl font-black text-yellow-500">{totalDevuelto()} und</p>
            </div>

            <button onClick={guardarDevoluciones} disabled={guardando}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-black py-4 rounded-xl text-lg disabled:opacity-50">
              {guardando ? 'Guardando...' : 'Registrar Devoluciones'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
