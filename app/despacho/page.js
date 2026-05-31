'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function Despacho() {
  const [usuario, setUsuario] = useState(null)
  const [rutas, setRutas] = useState([])
  const [rutaSeleccionada, setRutaSeleccionada] = useState(null)
  const [productos, setProductos] = useState([])
  const [cantidades, setCantidades] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    setUsuario(JSON.parse(u))
    cargarRutas()
    cargarProductos()
  }, [])

  const cargarRutas = async () => {
    const { data } = await supabase.from('rutas').select('*').eq('estado', true).order('nombre')
    if (data) setRutas(data)
  }

  const cargarProductos = async () => {
    const { data } = await supabase.from('productos').select('*').eq('estado', true).order('categoria')
    if (data) {
      setProductos(data)
      const initial = {}
      data.forEach(p => { initial[p.sku] = { viejo: '0', nuevo: '0' } })
      setCantidades(initial)
    }
  }

  const totalUnidades = () => {
    return productos.reduce((sum, p) => {
      const v = parseFloat(cantidades[p.sku]?.viejo || 0)
      const n = parseFloat(cantidades[p.sku]?.nuevo || 0)
      return sum + v + n
    }, 0)
  }

  const totalValor = () => {
    return productos.reduce((sum, p) => {
      const v = parseFloat(cantidades[p.sku]?.viejo || 0)
      const n = parseFloat(cantidades[p.sku]?.nuevo || 0)
      return sum + (v + n) * (p.precio_venta || 0)
    }, 0)
  }

  const guardarDespacho = async () => {
    if (!rutaSeleccionada) { alert('Selecciona una ruta'); return }
    const productosConCantidad = productos.filter(p => {
      const v = parseFloat(cantidades[p.sku]?.viejo || 0)
      const n = parseFloat(cantidades[p.sku]?.nuevo || 0)
      return v + n > 0
    })
    if (productosConCantidad.length === 0) { alert('Ingresa al menos un producto'); return }
    setGuardando(true)
    const fecha = new Date().toISOString().split('T')[0]
    const { data: encab, error: errEncab } = await supabase
      .from('despachos_encab')
      .insert({
        empresa_id: productos[0].empresa_id,
        fecha,
        ruta_id: rutaSeleccionada.id,
        estado: 'despachado',
        total_und: totalUnidades(),
        total_valor: totalValor(),
        hora_cargue: new Date().toISOString()
      })
      .select()
      .single()
    if (errEncab) { alert('Error: ' + errEncab.message); setGuardando(false); return }
    const detalles = productosConCantidad.map(p => ({
      empresa_id: p.empresa_id,
      despacho_id: encab.id,
      sku: p.sku,
      lote_viejo_x: parseFloat(cantidades[p.sku]?.viejo || 0),
      lote_nuevo_y: parseFloat(cantidades[p.sku]?.nuevo || 0),
      total: parseFloat(cantidades[p.sku]?.viejo || 0) + parseFloat(cantidades[p.sku]?.nuevo || 0),
      precio_unitario: p.precio_venta
    }))
    const { error: errDet } = await supabase.from('despachos_detalle').insert(detalles)
    if (errDet) { alert('Error detalle: ' + errDet.message); setGuardando(false); return }
    setGuardado(true)
    setGuardando(false)
  }

  const categorias = [...new Set(productos.map(p => p.categoria))]

  if (guardado) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-md w-full">
        <div className="text-6xl mb-4">🚚</div>
        <h2 className="text-2xl font-black text-gray-800">Despacho registrado</h2>
        <p className="text-gray-500 mt-2">{rutaSeleccionada?.nombre}</p>
        <p className="text-3xl font-black text-orange-500 mt-4">{totalUnidades()} unidades</p>
        <p className="text-gray-500">${totalValor().toLocaleString('es-CO')}</p>
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
          <h1 className="text-xl font-black text-orange-500">Despacho</h1>
          <p className="text-xs text-gray-500">{new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 text-sm">Cancelar</button>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <label className="text-sm font-bold text-gray-600 block mb-2">Selecciona la ruta</label>
          <div className="grid grid-cols-2 gap-2">
            {rutas.map(r => (
              <button
                key={r.id}
                onClick={() => setRutaSeleccionada(r)}
                className={`p-3 rounded-xl border-2 text-sm font-semibold transition-all ${rutaSeleccionada?.id === r.id ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-600'}`}
              >
                {r.nombre}
              </button>
            ))}
          </div>
        </div>

        {rutaSeleccionada && (
          <>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4">
              <p className="text-orange-700 text-sm font-medium">X = Stock viejo (FIFO primero) · Y = Stock nuevo</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex justify-between">
              <div className="text-center">
                <p className="text-2xl font-black text-gray-800">{totalUnidades()}</p>
                <p className="text-xs text-gray-500">Unidades</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-orange-500">${totalValor().toLocaleString('es-CO')}</p>
                <p className="text-xs text-gray-500">Valor total</p>
              </div>
            </div>

            {categorias.map(cat => (
              <div key={cat} className="mb-4">
                <h3 className="font-bold text-gray-600 text-sm uppercase tracking-wide mb-2 px-1">{cat}</h3>
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  {productos.filter(p => p.categoria === cat).map((p, i, arr) => (
                    <div key={p.sku} className={`px-4 py-3 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                      <div className="flex justify-between items-center mb-2">
                        <div>
                          <p className="font-medium text-gray-800 text-sm">{p.nombre}</p>
                          <p className="text-xs text-gray-400">{p.sku} · ${p.precio_venta?.toLocaleString('es-CO')}</p>
                        </div>
                        <p className="font-black text-gray-700">
                          {parseFloat(cantidades[p.sku]?.viejo || 0) + parseFloat(cantidades[p.sku]?.nuevo || 0)} und
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="text-xs text-gray-400 block mb-1">X Viejo</label>
                          <input
                            type="number" min="0"
                            value={cantidades[p.sku]?.viejo}
                            onChange={e => setCantidades(prev => ({ ...prev, [p.sku]: { ...prev[p.sku], viejo: e.target.value } }))}
                            className="w-full text-center border-2 border-gray-200 rounded-lg py-2 font-bold focus:border-orange-500 focus:outline-none"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-gray-400 block mb-1">Y Nuevo</label>
                          <input
                            type="number" min="0"
                            value={cantidades[p.sku]?.nuevo}
                            onChange={e => setCantidades(prev => ({ ...prev, [p.sku]: { ...prev[p.sku], nuevo: e.target.value } }))}
                            className="w-full text-center border-2 border-gray-200 rounded-lg py-2 font-bold focus:border-orange-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <button
              onClick={guardarDespacho}
              disabled={guardando}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-xl text-lg mt-4 disabled:opacity-50"
            >
              {guardando ? 'Guardando...' : 'Registrar Despacho'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
