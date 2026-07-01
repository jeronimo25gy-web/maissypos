'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function Compras() {
  const [usuario, setUsuario] = useState(null)
  const [proveedores, setProveedores] = useState([])
  const [proveedorSel, setProveedorSel] = useState(null)
  const [productos, setProductos] = useState([])
  const [cantidades, setCantidades] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    setUsuario(JSON.parse(u))
    cargarProveedores()
  }, [])

  const cargarProveedores = async () => {
    const { data } = await supabase.from('proveedores').select('*').eq('estado', true).order('nombre')
    if (data) setProveedores(data)
  }

  const seleccionarProveedor = async (prov) => {
    setProveedorSel(prov)
    setGuardado(false)
    const { data } = await supabase
      .from('productos')
      .select('*')
      .eq('proveedor_id', prov.id)
      .eq('estado', true)
      .order('nombre')
    if (data) {
      setProductos(data)
      const initial = {}
      data.forEach(p => { initial[p.sku] = '' })
      setCantidades(initial)
    }
  }

  const totalCompra = () => {
    return productos.reduce((sum, p) => {
      const cant = parseFloat(cantidades[p.sku] || 0)
      return sum + cant * (p.costo_compra || 0)
    }, 0)
  }

  const guardarCompra = async () => {
    const conCantidad = productos.filter(p => parseFloat(cantidades[p.sku] || 0) > 0)
    if (conCantidad.length === 0) { alert('Ingresa al menos una cantidad'); return }
    setGuardando(true)
    const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const registros = conCantidad.map(p => ({
      empresa_id: p.empresa_id,
      fecha,
      proveedor_id: proveedorSel.id,
      sku: p.sku,
      cantidad: parseFloat(cantidades[p.sku]),
      precio_unitario: p.costo_compra || 0,
      total: parseFloat(cantidades[p.sku]) * (p.costo_compra || 0),
      tipo_soporte: 'registro_manual'
    }))
    const { error } = await supabase.from('compras').insert(registros)
    if (!error) {
      setGuardado(true)
    } else {
      alert('Error: ' + error.message)
    }
    setGuardando(false)
  }

  if (guardado) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-md w-full">
        <div className="text-6xl mb-4">ok</div>
        <h2 className="text-2xl font-black text-gray-800">Compra registrada</h2>
        <p className="text-gray-500 mt-1">{proveedorSel?.nombre}</p>
        <p className="text-3xl font-black text-purple-500 mt-4">${totalCompra().toLocaleString('es-CO')}</p>
        <div className="flex gap-3 mt-6">
          <button onClick={() => { setProveedorSel(null); setProductos([]); setGuardado(false) }}
            className="flex-1 bg-purple-500 text-white px-4 py-3 rounded-xl font-bold">
            Nueva compra
          </button>
          <button onClick={() => router.push('/dashboard')}
            className="flex-1 bg-gray-100 text-gray-600 px-4 py-3 rounded-xl font-bold">
            Inicio
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow-sm px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-black text-purple-600">Compras</h1>
          <p className="text-xs text-gray-500">{new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 text-sm">Cancelar</button>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {!proveedorSel ? (
          <div>
            <p className="text-sm font-bold text-gray-600 mb-3">Selecciona el proveedor</p>
            <div className="grid grid-cols-1 gap-2">
              {proveedores.map(p => (
                <button key={p.id} onClick={() => seleccionarProveedor(p)}
                  className="bg-white rounded-xl p-4 shadow-sm text-left hover:shadow-md transition-all flex justify-between items-center">
                  <div>
                    <p className="font-black text-gray-800">{p.nombre}</p>
                    <p className="text-xs text-gray-400">{p.productos}</p>
                  </div>
                  <span className="text-gray-400">→</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4 flex justify-between items-center">
              <div>
                <p className="font-black text-purple-700">{proveedorSel.nombre}</p>
                <p className="text-sm text-purple-500">Ingresa las cantidades recibidas</p>
              </div>
              <button onClick={() => { setProveedorSel(null); setProductos([]) }}
                className="text-purple-400 text-sm font-bold">Cambiar</button>
            </div>

            {productos.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center shadow-sm">
                <p className="text-4xl mb-3">X</p>
                <p className="text-gray-500">Este proveedor no tiene productos asignados</p>
              </div>
            ) : (
              <div>
                <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-4">
                  {productos.map((p, i) => (
                    <div key={p.sku} className={`flex items-center px-4 py-3 ${i < productos.length - 1 ? 'border-b border-gray-100' : ''}`}>
                      <div className="flex-1">
                        <p className="font-medium text-gray-800 text-sm">{p.nombre}</p>
                        <p className="text-xs text-gray-400">
                          {p.presentacion}
                          {p.costo_compra ? ' · $' + p.costo_compra.toLocaleString('es-CO') : ' · Sin costo'}
                        </p>
                      </div>
                      <input
                        type="number" min="0"
                        value={cantidades[p.sku]}
                        onChange={e => setCantidades(prev => ({ ...prev, [p.sku]: e.target.value }))}
                        className="w-20 text-center border-2 border-gray-200 rounded-lg py-2 font-bold focus:border-purple-500 focus:outline-none ml-3"
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>

                <div className="bg-white rounded-xl p-4 shadow-sm mb-4 flex justify-between items-center">
                  <p className="font-bold text-gray-600">Total compra</p>
                  <p className="font-black text-purple-600 text-xl">${totalCompra().toLocaleString('es-CO')}</p>
                </div>

                <button onClick={guardarCompra} disabled={guardando}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-black py-4 rounded-xl text-lg disabled:opacity-50">
                  {guardando ? 'Guardando...' : 'Registrar Compra'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
