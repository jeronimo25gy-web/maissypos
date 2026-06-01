'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function Productos() {
  const [usuario, setUsuario] = useState(null)
  const [productos, setProductos] = useState([])
  const [editando, setEditando] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todas')
  const [guardando, setGuardando] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (parsed.rol !== 'admin') { router.push('/dashboard'); return }
    setUsuario(parsed)
    cargarProductos()
  }, [])

  const cargarProductos = async () => {
    const { data } = await supabase.from('productos').select('*').order('categoria').order('nombre')
    if (data) setProductos(data)
  }

  const guardarProducto = async () => {
    if (!editando) return
    setGuardando(true)
    const { error } = await supabase
      .from('productos')
      .update({
        nombre: editando.nombre,
        precio_venta: parseFloat(editando.precio_venta || 0),
        costo_compra: parseFloat(editando.costo_compra || 0),
        presentacion: editando.presentacion,
        estado: editando.estado
      })
      .eq('id', editando.id)
    if (!error) {
      await cargarProductos()
      setEditando(null)
    } else {
      alert('Error: ' + error.message)
    }
    setGuardando(false)
  }

  const margen = (p) => {
    if (!p.costo_compra || !p.precio_venta) return null
    return ((p.precio_venta - p.costo_compra) / p.precio_venta * 100).toFixed(1)
  }

  const categorias = ['Todas', ...new Set(productos.map(p => p.categoria))]

  const productosFiltrados = productos.filter(p => {
    const matchBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || p.sku.toLowerCase().includes(busqueda.toLowerCase())
    const matchCategoria = categoriaFiltro === 'Todas' || p.categoria === categoriaFiltro
    return matchBusqueda && matchCategoria
  })

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow-sm px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-black text-pink-600">Productos</h1>
          <p className="text-xs text-gray-500">{productos.length} productos registrados</p>
        </div>
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 text-sm">Volver</button>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        <input type="text" placeholder="Buscar por nombre o SKU..." value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 mb-3 focus:border-pink-500 focus:outline-none" />

        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {categorias.map(cat => (
            <button key={cat} onClick={() => setCategoriaFiltro(cat)}
              className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${categoriaFiltro === cat ? 'bg-pink-500 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              {cat}
            </button>
          ))}
        </div>

        {productosFiltrados.map(p => (
          <div key={p.id} className="bg-white rounded-xl shadow-sm p-4 mb-3">
            {editando?.id === p.id ? (
              <>
                <div className="flex justify-between items-center mb-3">
                  <p className="text-xs font-bold text-gray-400">{p.sku}</p>
                  <span className="text-xs bg-pink-100 text-pink-600 px-2 py-1 rounded-full font-bold">{p.categoria}</span>
                </div>
                <div className="mb-2">
                  <label className="text-xs font-bold text-gray-600 block mb-1">Nombre</label>
                  <input type="text" value={editando.nombre}
                    onChange={e => setEditando({...editando, nombre: e.target.value})}
                    className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-pink-500 focus:outline-none" />
                </div>
                <div className="mb-2">
                  <label className="text-xs font-bold text-gray-600 block mb-1">Presentacion</label>
                  <input type="text" value={editando.presentacion || ''}
                    onChange={e => setEditando({...editando, presentacion: e.target.value})}
                    className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-pink-500 focus:outline-none" />
                </div>
                <div className="flex gap-2 mb-3">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-gray-600 block mb-1">Precio venta</label>
                    <input type="number" min="0" value={editando.precio_venta || ''}
                      onChange={e => setEditando({...editando, precio_venta: e.target.value})}
                      className="w-full text-center border-2 border-gray-200 rounded-lg py-2 font-bold focus:border-pink-500 focus:outline-none" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-bold text-gray-600 block mb-1">Costo compra</label>
                    <input type="number" min="0" value={editando.costo_compra || ''}
                      onChange={e => setEditando({...editando, costo_compra: e.target.value})}
                      className="w-full text-center border-2 border-gray-200 rounded-lg py-2 font-bold focus:border-pink-500 focus:outline-none" />
                  </div>
                </div>
                {editando.precio_venta && editando.costo_compra && (
                  <div className="bg-green-50 rounded-lg p-3 mb-3 flex justify-between">
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Utilidad</p>
                      <p className="font-black text-green-600">${(parseFloat(editando.precio_venta) - parseFloat(editando.costo_compra)).toLocaleString('es-CO')}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500">Margen</p>
                      <p className="font-black text-green-600">{((parseFloat(editando.precio_venta) - parseFloat(editando.costo_compra)) / parseFloat(editando.precio_venta) * 100).toFixed(1)}%</p>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => setEditando(null)} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-lg">Cancelar</button>
                  <button onClick={guardarProducto} disabled={guardando} className="flex-1 bg-pink-500 text-white font-bold py-2 rounded-lg disabled:opacity-50">
                    {guardando ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold text-gray-800 text-sm">{p.nombre}</p>
                    {!p.estado && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Inactivo</span>}
                  </div>
                  <p className="text-xs text-gray-400">{p.sku} · {p.presentacion}</p>
                  <div className="flex gap-3 mt-1">
                    <p className="text-xs text-gray-600">Venta: <span className="font-bold">${p.precio_venta?.toLocaleString('es-CO')}</span></p>
                    {p.costo_compra ? (
                      <>
                        <p className="text-xs text-gray-600">Costo: <span className="font-bold">${p.costo_compra?.toLocaleString('es-CO')}</span></p>
                        <p className="text-xs font-black text-green-600">{margen(p)}%</p>
                      </>
                    ) : (
                      <p className="text-xs text-orange-500 font-bold">Sin costo</p>
                    )}
                  </div>
                </div>
                <button onClick={() => setEditando({...p})} className="ml-3 bg-gray-100 hover:bg-pink-50 text-gray-600 hover:text-pink-600 px-3 py-2 rounded-lg text-sm font-bold transition-colors">
                  Editar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
