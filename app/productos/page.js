'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

const CATEGORIAS = ['Arepas Maissy', 'Arepas Velmar', 'Arepas La Guantona', 'Arepas TAT', 'Panaderia', 'Lacteos', 'Carnicos', 'Huevos']

const PREFIJOS = {
  'Arepas Maissy': 'ARE',
  'Arepas Velmar': 'VEL',
  'Arepas La Guantona': 'GUA',
  'Arepas TAT': 'TAT',
  'Panaderia': 'PAN',
  'Lacteos': 'LAC',
  'Carnicos': 'CAR',
  'Huevos': 'HUE',
}

function generarSku(categoria, productos) {
  const prefijo = PREFIJOS[categoria] || 'PRD'
  const existentes = productos.filter(p => p.sku.startsWith(prefijo))
  const numeros = existentes.map(p => parseInt(p.sku.split('-')[1] || '0')).filter(n => !isNaN(n))
  const siguiente = numeros.length > 0 ? Math.max(...numeros) + 1 : 1
  return `${prefijo}-${String(siguiente).padStart(3, '0')}`
}

function precioSugerido(costo, margen) {
  if (!costo || !margen) return ''
  return Math.round(parseFloat(costo) / (1 - parseFloat(margen) / 100))
}

function margenResultante(precio, costo) {
  if (!precio || !costo || parseFloat(precio) === 0) return null
  return ((parseFloat(precio) - parseFloat(costo)) / parseFloat(precio) * 100).toFixed(1)
}

function Calculadora({ data, onChange }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 mb-3">
      <p className="text-xs font-black text-gray-600 mb-2">Calculadora de precio</p>
      <div className="flex gap-2 mb-2">
        <div className="flex-1">
          <label className="text-xs text-gray-500 block mb-1">Costo compra</label>
          <input type="number" min="0" value={data.costo_compra || ''}
            onChange={e => onChange({ ...data, costo_compra: e.target.value })}
            className="w-full text-center border-2 border-gray-200 rounded-lg py-2 font-bold focus:border-pink-500 focus:outline-none"
            placeholder="0" />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-500 block mb-1">% Margen deseado</label>
          <input type="number" min="0" max="100" value={data.margen_deseado || ''}
            onChange={e => {
              const margen = e.target.value
              const sugerido = precioSugerido(data.costo_compra, margen)
              onChange({ ...data, margen_deseado: margen, precio_venta: sugerido || data.precio_venta })
            }}
            className="w-full text-center border-2 border-purple-200 rounded-lg py-2 font-bold focus:border-purple-500 focus:outline-none"
            placeholder="%" />
        </div>
      </div>
      {data.costo_compra && data.margen_deseado && (
        <div className="bg-purple-50 rounded-lg p-2 mb-2 text-center">
          <p className="text-xs text-gray-500">Precio sugerido</p>
          <p className="font-black text-purple-600 text-lg">${precioSugerido(data.costo_compra, data.margen_deseado)?.toLocaleString('es-CO')}</p>
        </div>
      )}
      <div>
        <label className="text-xs text-gray-500 block mb-1">Precio de venta final</label>
        <input type="number" min="0" value={data.precio_venta || ''}
          onChange={e => onChange({ ...data, precio_venta: e.target.value, margen_deseado: '' })}
          className="w-full text-center border-2 border-green-200 rounded-lg py-2 text-xl font-black focus:border-green-500 focus:outline-none"
          placeholder="0" />
      </div>
      {data.precio_venta && data.costo_compra && (
        <div className="bg-green-50 rounded-lg p-3 mt-2 flex justify-around">
          <div className="text-center">
            <p className="text-xs text-gray-500">Utilidad</p>
            <p className="font-black text-green-600">${(parseFloat(data.precio_venta) - parseFloat(data.costo_compra)).toLocaleString('es-CO')}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500">Margen real</p>
            <p className="font-black text-green-600">{margenResultante(data.precio_venta, data.costo_compra)}%</p>
          </div>
        </div>
      )}
    </div>
  )
}

function FormNuevo({ productos, onGuardar, onCancelar, guardando }) {
  const inicial = (cat) => ({
    sku: generarSku(cat, productos),
    nombre: '',
    categoria: cat,
    presentacion: '',
    precio_venta: '',
    costo_compra: '',
    margen_deseado: ''
  })
  const [data, setData] = useState(inicial('Arepas Maissy'))

  const handleCategoria = (cat) => {
    setData({ ...data, categoria: cat, sku: generarSku(cat, productos) })
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
      <p className="font-black text-gray-700 mb-3">Nuevo producto</p>
      <div className="mb-2">
        <label className="text-xs font-bold text-gray-600 block mb-1">Categoria</label>
        <select value={data.categoria} onChange={e => handleCategoria(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-pink-500 focus:outline-none">
          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="mb-2">
        <label className="text-xs font-bold text-gray-600 block mb-1">SKU (generado automaticamente)</label>
        <div className="flex gap-2">
          <input type="text" value={data.sku}
            onChange={e => setData({...data, sku: e.target.value.toUpperCase()})}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm font-black text-pink-600 focus:border-pink-500 focus:outline-none uppercase" />
        </div>
      </div>
      <div className="mb-2">
        <label className="text-xs font-bold text-gray-600 block mb-1">Nombre</label>
        <input type="text" value={data.nombre} onChange={e => setData({...data, nombre: e.target.value})}
          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-pink-500 focus:outline-none" />
      </div>
      <div className="mb-3">
        <label className="text-xs font-bold text-gray-600 block mb-1">Presentacion</label>
        <input type="text" value={data.presentacion} onChange={e => setData({...data, presentacion: e.target.value})}
          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-pink-500 focus:outline-none"
          placeholder="Ej: x5 und" />
      </div>
      <Calculadora data={data} onChange={setData} />
      <div className="flex gap-2">
        <button onClick={onCancelar} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-lg">Cancelar</button>
        <button onClick={() => onGuardar(data)} disabled={guardando}
          className="flex-1 bg-pink-500 text-white font-bold py-2 rounded-lg disabled:opacity-50">
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

function FormEditar({ producto, onGuardar, onCancelar, guardando }) {
  const [data, setData] = useState({ ...producto, margen_deseado: '' })
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
      <p className="text-xs text-gray-400 font-bold mb-3">{producto.sku} — {producto.categoria}</p>
      <div className="mb-2">
        <label className="text-xs font-bold text-gray-600 block mb-1">Nombre</label>
        <input type="text" value={data.nombre} onChange={e => setData({...data, nombre: e.target.value})}
          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-pink-500 focus:outline-none" />
      </div>
      <div className="mb-3">
        <label className="text-xs font-bold text-gray-600 block mb-1">Presentacion</label>
        <input type="text" value={data.presentacion || ''} onChange={e => setData({...data, presentacion: e.target.value})}
          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-pink-500 focus:outline-none" />
      </div>
      <Calculadora data={data} onChange={setData} />
      <div className="flex gap-2">
        <button onClick={onCancelar} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-lg">Cancelar</button>
        <button onClick={() => onGuardar(data)} disabled={guardando}
          className="flex-1 bg-pink-500 text-white font-bold py-2 rounded-lg disabled:opacity-50">
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

export default function Productos() {
  const [usuario, setUsuario] = useState(null)
  const [productos, setProductos] = useState([])
  const [editandoId, setEditandoId] = useState(null)
  const [agregando, setAgregando] = useState(false)
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

  const guardarProducto = async (data) => {
    setGuardando(true)
    const { error } = await supabase.from('productos').update({
      nombre: data.nombre,
      precio_venta: parseFloat(data.precio_venta || 0),
      costo_compra: parseFloat(data.costo_compra || 0),
      presentacion: data.presentacion,
    }).eq('id', data.id)
    if (!error) { await cargarProductos(); setEditandoId(null) }
    else alert('Error: ' + error.message)
    setGuardando(false)
  }

  const agregarProducto = async (data) => {
    if (!data.sku || !data.nombre || !data.precio_venta) { alert('SKU, nombre y precio son obligatorios'); return }
    setGuardando(true)
    const empresa_id = productos[0]?.empresa_id
    const { error } = await supabase.from('productos').insert({
      empresa_id,
      sku: data.sku.toUpperCase(),
      nombre: data.nombre,
      categoria: data.categoria,
      presentacion: data.presentacion,
      precio_venta: parseFloat(data.precio_venta),
      costo_compra: data.costo_compra ? parseFloat(data.costo_compra) : null,
      perecedero: true,
      origen: ['Arepas Maissy', 'Arepas TAT'].includes(data.categoria) ? 'propio' : 'tercero',
      estado: true
    })
    if (!error) { await cargarProductos(); setAgregando(false) }
    else alert('Error: ' + error.message)
    setGuardando(false)
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
        <div className="flex gap-2 items-center">
          <button onClick={() => { setAgregando(true); setEditandoId(null) }}
            className="bg-pink-500 text-white px-4 py-2 rounded-lg text-sm font-bold">+ Nuevo</button>
          <button onClick={() => router.push('/dashboard')} className="text-gray-400 text-sm px-2">Volver</button>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {agregando && (
          <FormNuevo
            productos={productos}
            onGuardar={agregarProducto}
            onCancelar={() => setAgregando(false)}
            guardando={guardando}
          />
        )}

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
          <div key={p.id}>
            {editandoId === p.id ? (
              <FormEditar
                producto={p}
                onGuardar={guardarProducto}
                onCancelar={() => setEditandoId(null)}
                guardando={guardando}
              />
            ) : (
              <div className="bg-white rounded-xl shadow-sm p-4 mb-3 flex items-center justify-between">
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
                        <p className="text-xs font-black text-green-600">{margenResultante(p.precio_venta, p.costo_compra)}%</p>
                      </>
                    ) : (
                      <p className="text-xs text-orange-500 font-bold">Sin costo</p>
                    )}
                  </div>
                </div>
                <button onClick={() => { setEditandoId(p.id); setAgregando(false) }}
                  className="ml-3 bg-gray-100 hover:bg-pink-50 text-gray-600 hover:text-pink-600 px-3 py-2 rounded-lg text-sm font-bold transition-colors">
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