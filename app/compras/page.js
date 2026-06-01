'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function Compras() {
  const [usuario, setUsuario] = useState(null)
  const [productos, setProductos] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [items, setItems] = useState([{ sku: '', proveedor_id: '', cantidad: '', precio_unitario: '' }])
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    setUsuario(JSON.parse(u))
    cargarDatos()
  }, [])

  const cargarDatos = async () => {
    const { data: prods } = await supabase.from('productos').select('sku, nombre, categoria').eq('estado', true).order('nombre')
    const { data: provs } = await supabase.from('proveedores').select('*').eq('estado', true).order('nombre')
    if (prods) setProductos(prods)
    if (provs) setProveedores(provs)
  }

  const agregarItem = () => setItems([...items, { sku: '', proveedor_id: '', cantidad: '', precio_unitario: '' }])

  const eliminarItem = (i) => {
    if (items.length === 1) return
    setItems(items.filter((_, idx) => idx !== i))
  }

  const totalCompra = () => items.reduce((sum, item) => {
    return sum + parseFloat(item.cantidad || 0) * parseFloat(item.precio_unitario || 0)
  }, 0)

  const guardarCompra = async () => {
    const validos = items.filter(i => i.sku && i.cantidad && i.precio_unitario)
    if (validos.length === 0) { alert('Ingresa al menos un producto con cantidad y precio'); return }
    setGuardando(true)
    const fecha = new Date().toISOString().split('T')[0]
    const empresa_id = productos[0]?.empresa_id
    const registros = validos.map(item => ({
      empresa_id,
      fecha,
      proveedor_id: item.proveedor_id || null,
      sku: item.sku,
      cantidad: parseFloat(item.cantidad),
      precio_unitario: parseFloat(item.precio_unitario),
      total: parseFloat(item.cantidad) * parseFloat(item.precio_unitario),
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
        <div className="text-6xl mb-4">🛒</div>
        <h2 className="text-2xl font-black text-gray-800">Compra registrada</h2>
        <p className="text-3xl font-black text-purple-500 mt-4">${totalCompra().toLocaleString('es-CO')}</p>
        <p className="text-gray-500 text-sm mt-1">{items.filter(i => i.sku).length} productos</p>
        <button onClick={() => router.push('/dashboard')} className="mt-6 bg-orange-500 text-white px-6 py-3 rounded-xl font-bold w-full">
          Volver al inicio
        </button>
        <button onClick={() => { setGuardado(false); setItems([{ sku: '', proveedor_id: '', cantidad: '', precio_unitario: '' }]) }}
          className="mt-3 bg-purple-500 text-white px-6 py-3 rounded-xl font-bold w-full">
          Registrar otra compra
        </button>
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
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
          <p className="text-purple-700 text-sm font-medium">Registra los productos que compraste hoy. Puedes agregar varios en una sola compra.</p>
        </div>

        {items.map((item, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm p-4 mb-3">
            <div className="flex justify-between items-center mb-3">
              <p className="font-black text-gray-700">Producto {i + 1}</p>
              {items.length > 1 && (
                <button onClick={() => eliminarItem(i)} className="text-red-400 text-sm font-bold">Eliminar</button>
              )}
            </div>

            <div className="mb-3">
              <label className="text-xs font-bold text-gray-600 block mb-1">Producto</label>
              <select value={item.sku}
                onChange={e => { const n=[...items]; n[i].sku=e.target.value; setItems(n) }}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-purple-500 focus:outline-none">
                <option value="">Selecciona un producto</option>
                {productos.map(p => (
                  <option key={p.sku} value={p.sku}>{p.nombre} ({p.sku})</option>
                ))}
              </select>
            </div>

            <div className="mb-3">
              <label className="text-xs font-bold text-gray-600 block mb-1">Proveedor</label>
              <select value={item.proveedor_id}
                onChange={e => { const n=[...items]; n[i].proveedor_id=e.target.value; setItems(n) }}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-purple-500 focus:outline-none">
                <option value="">Sin proveedor registrado</option>
                {proveedores.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs font-bold text-gray-600 block mb-1">Cantidad</label>
                <input type="number" min="0" placeholder="0" value={item.cantidad}
                  onChange={e => { const n=[...items]; n[i].cantidad=e.target.value; setItems(n) }}
                  className="w-full text-center border-2 border-gray-200 rounded-lg py-2 font-bold focus:border-purple-500 focus:outline-none" />
              </div>
              <div className="flex-1">
                <label className="text-xs font-bold text-gray-600 block mb-1">Precio unitario</label>
                <input type="number" min="0" placeholder="0" value={item.precio_unitario}
                  onChange={e => { const n=[...items]; n[i].precio_unitario=e.target.value; setItems(n) }}
                  className="w-full text-center border-2 border-gray-200 rounded-lg py-2 font-bold focus:border-purple-500 focus:outline-none" />
              </div>
            </div>

            {item.cantidad && item.precio_unitario && (
              <p className="text-right text-sm font-black text-purple-600 mt-2">
                Subtotal: ${(parseFloat(item.cantidad) * parseFloat(item.precio_unitario)).toLocaleString('es-CO')}
              </p>
            )}
          </div>
        ))}

        <button onClick={agregarItem} className="w-full border-2 border-dashed border-purple-300 text-purple-600 font-bold py-3 rounded-xl mb-4 hover:bg-purple-50 transition-colors">
          + Agregar otro producto
        </button>

        <div className="bg-white rounded-xl p-4 shadow-sm mb-4 flex justify-between">
          <p className="font-bold text-gray-600">Total compra</p>
          <p className="font-black text-purple-600 text-xl">${totalCompra().toLocaleString('es-CO')}</p>
        </div>

        <button onClick={guardarCompra} disabled={guardando}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-black py-4 rounded-xl text-lg disabled:opacity-50">
          {guardando ? 'Guardando...' : 'Registrar Compra'}
        </button>
      </div>
    </div>
  )
}
