'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'

const TABS = [
  { id: 'productos', nombre: 'Productos' },
  { id: 'proveedores', nombre: 'Proveedores' },
  { id: 'rutas', nombre: 'Rutas' },
  { id: 'vendedores', nombre: 'Vendedores' },
]

export default function Maestros() {
  const [usuario, setUsuario] = useState(null)
  const [vista, setVista] = useState('productos')
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (parsed.rol !== 'admin') { router.push('/dashboard'); return }
    setUsuario(parsed)
  }, [])

  if (!usuario) return null

  return (
    <div>
      <div className="bg-white shadow-sm px-6 py-4 sticky top-0 z-10">
        <h1 className="text-xl font-black text-gray-900">Maestros</h1>
        <p className="text-xs text-gray-500">Productos, proveedores, rutas y vendedores</p>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setVista(t.id)}
              className={`px-3 py-2 rounded-xl text-sm font-bold whitespace-nowrap ${vista === t.id ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              {t.nombre}
            </button>
          ))}
        </div>

        {vista === 'productos' && <TabProductos />}
        {vista === 'proveedores' && <TabProveedores />}
        {vista === 'rutas' && <TabRutas />}
        {vista === 'vendedores' && <TabVendedores />}
      </div>
    </div>
  )
}

const CATEGORIAS_PRODUCTO = ['Arepas Maissy', 'Arepas Velmar', 'Arepas La Guantona', 'Arepas TAT', 'Panaderia', 'Lacteos', 'Carnicos', 'Huevos']

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
            className="w-full text-center border-2 border-gray-200 rounded-lg py-2 font-bold text-gray-800 focus:border-brand focus:outline-none"
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
            className="w-full text-center border-2 border-gray-200 rounded-lg py-2 font-bold text-gray-800 focus:border-brand focus:outline-none"
            placeholder="%" />
        </div>
      </div>
      {data.costo_compra && data.margen_deseado && (
        <div className="bg-gray-100 rounded-lg p-2 mb-2 text-center">
          <p className="text-xs text-gray-500">Precio sugerido</p>
          <p className="font-black text-gray-900 text-lg">${precioSugerido(data.costo_compra, data.margen_deseado)?.toLocaleString('es-CO')}</p>
        </div>
      )}
      <div>
        <label className="text-xs text-gray-500 block mb-1">Precio de venta final</label>
        <input type="number" min="0" value={data.precio_venta || ''}
          onChange={e => onChange({ ...data, precio_venta: e.target.value, margen_deseado: '' })}
          className="w-full text-center border-2 border-gray-200 rounded-lg py-2 text-xl font-black text-gray-800 focus:border-brand focus:outline-none"
          placeholder="0" />
      </div>
      {data.precio_venta && data.costo_compra && (
        <div className="bg-gray-100 rounded-lg p-3 mt-2 flex justify-around">
          <div className="text-center">
            <p className="text-xs text-gray-500">Utilidad</p>
            <p className="font-black text-gray-900">${(parseFloat(data.precio_venta) - parseFloat(data.costo_compra)).toLocaleString('es-CO')}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500">Margen real</p>
            <p className="font-black text-gray-900">{margenResultante(data.precio_venta, data.costo_compra)}%</p>
          </div>
        </div>
      )}
    </div>
  )
}

function FormNuevoProducto({ productos, onGuardar, onCancelar, guardando }) {
  const inicial = (cat) => ({
    sku: generarSku(cat, productos),
    nombre: '',
    categoria: cat,
    presentacion: '',
    precio_venta: '',
    costo_compra: '',
    margen_deseado: '',
    stock_minimo: 0,
    dias_cobertura: 7
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
          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
          {CATEGORIAS_PRODUCTO.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="mb-2">
        <label className="text-xs font-bold text-gray-600 block mb-1">SKU (generado automaticamente)</label>
        <input type="text" value={data.sku}
          onChange={e => setData({ ...data, sku: e.target.value.toUpperCase() })}
          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm font-black text-brand focus:border-brand focus:outline-none uppercase" />
      </div>
      <div className="mb-2">
        <label className="text-xs font-bold text-gray-600 block mb-1">Nombre</label>
        <input type="text" value={data.nombre} onChange={e => setData({ ...data, nombre: e.target.value })}
          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
      </div>
      <div className="mb-3">
        <label className="text-xs font-bold text-gray-600 block mb-1">Presentacion</label>
        <input type="text" value={data.presentacion} onChange={e => setData({ ...data, presentacion: e.target.value })}
          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none"
          placeholder="Ej: x5 und" />
      </div>
      <div className="flex gap-2 mb-3">
        <div className="flex-1">
          <label className="text-xs font-bold text-gray-600 block mb-1">Stock minimo</label>
          <input type="number" min="0" value={data.stock_minimo} onChange={e => setData({ ...data, stock_minimo: e.target.value })}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
        </div>
        <div className="flex-1">
          <label className="text-xs font-bold text-gray-600 block mb-1">Dias de cobertura</label>
          <input type="number" min="0" value={data.dias_cobertura} onChange={e => setData({ ...data, dias_cobertura: e.target.value })}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
        </div>
      </div>
      <Calculadora data={data} onChange={setData} />
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-gray-600">Estado del producto</p>
        <button
          onClick={() => setData({ ...data, estado: !data.estado })}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${data.estado ? 'bg-gray-200 text-gray-800' : 'bg-brand/10 text-brand'}`}>
          {data.estado ? 'Activo' : 'Inactivo'}
        </button>
      </div>
      <div className="flex gap-2">
        <button onClick={onCancelar} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-lg">Cancelar</button>
        <button onClick={() => onGuardar(data)} disabled={guardando}
          className="flex-1 bg-brand text-white font-bold py-2 rounded-lg disabled:opacity-50">
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

function FormEditarProducto({ producto, onGuardar, onCancelar, guardando }) {
  const [data, setData] = useState({ ...producto, margen_deseado: '' })
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
      <p className="text-xs text-gray-400 font-bold mb-3">{producto.sku} — {producto.categoria}</p>
      <div className="mb-2">
        <label className="text-xs font-bold text-gray-600 block mb-1">Nombre</label>
        <input type="text" value={data.nombre} onChange={e => setData({ ...data, nombre: e.target.value })}
          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
      </div>
      <div className="mb-3">
        <label className="text-xs font-bold text-gray-600 block mb-1">Presentacion</label>
        <input type="text" value={data.presentacion || ''} onChange={e => setData({ ...data, presentacion: e.target.value })}
          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
      </div>
      <div className="flex gap-2 mb-3">
        <div className="flex-1">
          <label className="text-xs font-bold text-gray-600 block mb-1">Stock minimo</label>
          <input type="number" min="0" value={data.stock_minimo ?? 0} onChange={e => setData({ ...data, stock_minimo: e.target.value })}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
        </div>
        <div className="flex-1">
          <label className="text-xs font-bold text-gray-600 block mb-1">Dias de cobertura</label>
          <input type="number" min="0" value={data.dias_cobertura ?? 7} onChange={e => setData({ ...data, dias_cobertura: e.target.value })}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
        </div>
      </div>
      <Calculadora data={data} onChange={setData} />
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-gray-600">Estado del producto</p>
        <button
          onClick={() => setData({ ...data, estado: !data.estado })}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${data.estado ? 'bg-gray-200 text-gray-800' : 'bg-brand/10 text-brand'}`}>
          {data.estado ? 'Activo' : 'Inactivo'}
        </button>
      </div>
      <div className="flex gap-2">
        <button onClick={onCancelar} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-lg">Cancelar</button>
        <button onClick={() => onGuardar(data)} disabled={guardando}
          className="flex-1 bg-brand text-white font-bold py-2 rounded-lg disabled:opacity-50">
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

function TabProductos() {
  const [productos, setProductos] = useState([])
  const [editandoId, setEditandoId] = useState(null)
  const [agregando, setAgregando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todas')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { cargarProductos() }, [])

  const cargarProductos = async () => {
    const { data } = await supabase.from('productos').select('*').eq('empresa_id', getEmpresaId()).order('categoria').order('nombre')
    if (data) setProductos(data)
  }

  const guardarProducto = async (data) => {
    setGuardando(true)
    const { error } = await supabase.from('productos').update({
      nombre: data.nombre,
      precio_venta: parseFloat(data.precio_venta || 0),
      costo_compra: parseFloat(data.costo_compra || 0),
      presentacion: data.presentacion,
      stock_minimo: parseInt(data.stock_minimo || 0),
      dias_cobertura: parseInt(data.dias_cobertura || 0),
    }).eq('id', data.id)
    if (!error) { await cargarProductos(); setEditandoId(null) }
    else alert('Error: ' + error.message)
    setGuardando(false)
  }

  const agregarProducto = async (data) => {
    if (!data.sku || !data.nombre || !data.precio_venta) { alert('SKU, nombre y precio son obligatorios'); return }
    setGuardando(true)
    const empresa_id = getEmpresaId()
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
      estado: true,
      stock_minimo: parseInt(data.stock_minimo || 0),
      dias_cobertura: parseInt(data.dias_cobertura || 7),
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
    <div>
      <div className="flex justify-between items-center mb-3">
        <p className="text-xs text-gray-500">{productos.length} productos registrados</p>
        <button onClick={() => { setAgregando(true); setEditandoId(null) }}
          className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-lg text-sm font-bold">+ Nuevo</button>
      </div>

      {agregando && (
        <FormNuevoProducto productos={productos} onGuardar={agregarProducto} onCancelar={() => setAgregando(false)} guardando={guardando} />
      )}

      <input type="text" placeholder="Buscar por nombre o SKU..." value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 mb-3 text-gray-800 focus:border-brand focus:outline-none" />

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {categorias.map(cat => (
          <button key={cat} onClick={() => setCategoriaFiltro(cat)}
            className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${categoriaFiltro === cat ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            {cat}
          </button>
        ))}
      </div>

      {productosFiltrados.map(p => (
        <div key={p.id}>
          {editandoId === p.id ? (
            <FormEditarProducto producto={p} onGuardar={guardarProducto} onCancelar={() => setEditandoId(null)} guardando={guardando} />
          ) : (
            <div className="bg-white rounded-xl shadow-sm p-4 mb-3 flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-bold text-gray-800 text-sm">{p.nombre}</p>
                  {!p.estado && <span className="text-xs bg-brand/10 text-brand px-2 py-0.5 rounded-full">Inactivo</span>}
                </div>
                <p className="text-xs text-gray-400">{p.sku} · {p.presentacion}</p>
                <div className="flex gap-3 mt-1">
                  <p className="text-xs text-gray-600">Venta: <span className="font-bold">${p.precio_venta?.toLocaleString('es-CO')}</span></p>
                  {p.costo_compra ? (
                    <>
                      <p className="text-xs text-gray-600">Costo: <span className="font-bold">${p.costo_compra?.toLocaleString('es-CO')}</span></p>
                      <p className="text-xs font-black text-gray-900">{margenResultante(p.precio_venta, p.costo_compra)}%</p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-500 font-bold">Sin costo</p>
                  )}
                </div>
              </div>
              <button onClick={() => { setEditandoId(p.id); setAgregando(false) }}
                className="ml-3 bg-gray-100 hover:bg-brand/5 text-gray-600 hover:text-brand px-3 py-2 rounded-lg text-sm font-bold transition-colors">
                Editar
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function TabProveedores() {
  const [proveedores, setProveedores] = useState([])
  const [proveedorForm, setProveedorForm] = useState(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    const { data } = await supabase.from('proveedores').select('*').eq('empresa_id', getEmpresaId()).order('nombre')
    if (data) setProveedores(data)
  }

  const guardarProveedor = async () => {
    if (!proveedorForm.nombre) { alert('Ingresa el nombre del proveedor'); return }
    setGuardando(true)
    const payload = {
      nombre: proveedorForm.nombre,
      contacto: proveedorForm.contacto || null,
      telefono: proveedorForm.telefono || null,
      productos: proveedorForm.productos || null,
      frecuencia: proveedorForm.frecuencia || null,
    }
    const { error } = proveedorForm.id
      ? await supabase.from('proveedores').update(payload).eq('id', proveedorForm.id)
      : await supabase.from('proveedores').insert({ ...payload, estado: true, empresa_id: getEmpresaId() })
    setGuardando(false)
    if (error) { alert('Error: ' + error.message); return }
    setProveedorForm(null)
    cargar()
  }

  const toggleEstado = async (p) => {
    await supabase.from('proveedores').update({ estado: !p.estado }).eq('id', p.id)
    cargar()
  }

  return (
    <>
      <div className="flex justify-between items-center mb-3">
        <p className="text-xs text-gray-500">{proveedores.length} proveedores registrados</p>
        <button onClick={() => setProveedorForm({ nombre: '', contacto: '', telefono: '', productos: '', frecuencia: '' })}
          className="text-xs bg-brand hover:bg-brand-dark text-white px-3 py-2 rounded-lg font-bold">
          + Nuevo proveedor
        </button>
      </div>

      {proveedorForm && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <p className="font-bold text-gray-700 mb-3">{proveedorForm.id ? 'Editar proveedor' : 'Nuevo proveedor'}</p>
          <div className="mb-2">
            <label className="text-xs font-bold text-gray-600 block mb-1">Nombre</label>
            <input type="text" value={proveedorForm.nombre} onChange={e => setProveedorForm({ ...proveedorForm, nombre: e.target.value })}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
          </div>
          <div className="flex gap-2 mb-2">
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-600 block mb-1">Contacto</label>
              <input type="text" value={proveedorForm.contacto || ''} onChange={e => setProveedorForm({ ...proveedorForm, contacto: e.target.value })}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
            </div>
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-600 block mb-1">Telefono</label>
              <input type="text" value={proveedorForm.telefono || ''} onChange={e => setProveedorForm({ ...proveedorForm, telefono: e.target.value })}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
            </div>
          </div>
          <div className="mb-2">
            <label className="text-xs font-bold text-gray-600 block mb-1">Productos que provee</label>
            <input type="text" value={proveedorForm.productos || ''} onChange={e => setProveedorForm({ ...proveedorForm, productos: e.target.value })}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
          </div>
          <div className="mb-3">
            <label className="text-xs font-bold text-gray-600 block mb-1">Frecuencia de entrega</label>
            <input type="text" placeholder="Ej: Diaria, Semanal" value={proveedorForm.frecuencia || ''} onChange={e => setProveedorForm({ ...proveedorForm, frecuencia: e.target.value })}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setProveedorForm(null)} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-lg">Cancelar</button>
            <button onClick={guardarProveedor} disabled={guardando}
              className="flex-1 bg-brand hover:bg-brand-dark text-white font-bold py-2 rounded-lg disabled:opacity-50">
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
        {proveedores.map(p => (
          <div key={p.id} className="p-4 flex justify-between items-center">
            <div>
              <p className="font-bold text-gray-800 text-sm">{p.nombre}</p>
              <p className="text-xs text-gray-500">{[p.contacto, p.telefono, p.frecuencia].filter(Boolean).join(' · ') || 'Sin detalles'}</p>
              {p.productos && <p className="text-xs text-gray-400">{p.productos}</p>}
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-1 rounded-lg ${p.estado ? 'bg-gray-200 text-gray-800' : 'bg-brand/10 text-brand'}`}>
                {p.estado ? 'Activo' : 'Inactivo'}
              </span>
              <button onClick={() => setProveedorForm({ ...p })} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg font-bold">Editar</button>
              <button onClick={() => toggleEstado(p)} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg font-bold">
                {p.estado ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function TabRutas() {
  const [rutas, setRutas] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [rutaForm, setRutaForm] = useState(null)
  const [asignando, setAsignando] = useState(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    const [{ data: r }, { data: v }] = await Promise.all([
      supabase.from('rutas').select('*').eq('empresa_id', getEmpresaId()).order('nombre'),
      supabase.from('vendedores').select('id, nombre, ruta_id').eq('empresa_id', getEmpresaId()).order('nombre'),
    ])
    if (r) setRutas(r)
    if (v) setVendedores(v)
  }

  const vendedorDeRuta = (rutaId) => vendedores.find(v => v.ruta_id === rutaId)

  const guardarRuta = async () => {
    if (!rutaForm.nombre) { alert('Ingresa el nombre de la ruta'); return }
    setGuardando(true)
    const payload = {
      nombre: rutaForm.nombre,
      zona: rutaForm.zona || null,
      hora_cargue: rutaForm.hora_cargue || null,
      dias_operacion: rutaForm.dias_operacion || null,
    }
    const { error } = rutaForm.id
      ? await supabase.from('rutas').update(payload).eq('id', rutaForm.id)
      : await supabase.from('rutas').insert({ ...payload, estado: true, empresa_id: getEmpresaId() })
    setGuardando(false)
    if (error) { alert('Error: ' + error.message); return }
    setRutaForm(null)
    cargar()
  }

  const toggleEstado = async (r) => {
    await supabase.from('rutas').update({ estado: !r.estado }).eq('id', r.id)
    cargar()
  }

  const asignarVendedor = async (rutaId, vendedorId) => {
    setGuardando(true)
    const actual = vendedorDeRuta(rutaId)
    if (actual && actual.id !== vendedorId) {
      await supabase.from('vendedores').update({ ruta_id: null }).eq('id', actual.id)
    }
    if (vendedorId) {
      await supabase.from('vendedores').update({ ruta_id: rutaId }).eq('id', vendedorId)
    }
    setGuardando(false)
    setAsignando(null)
    cargar()
  }

  return (
    <>
      <div className="flex justify-between items-center mb-3">
        <p className="text-xs text-gray-500">{rutas.length} rutas registradas</p>
        <button onClick={() => setRutaForm({ nombre: '', zona: '', hora_cargue: '', dias_operacion: '' })}
          className="text-xs bg-brand hover:bg-brand-dark text-white px-3 py-2 rounded-lg font-bold">
          + Nueva ruta
        </button>
      </div>

      {rutaForm && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <p className="font-bold text-gray-700 mb-3">{rutaForm.id ? 'Editar ruta' : 'Nueva ruta'}</p>
          <div className="mb-2">
            <label className="text-xs font-bold text-gray-600 block mb-1">Nombre</label>
            <input type="text" value={rutaForm.nombre} onChange={e => setRutaForm({ ...rutaForm, nombre: e.target.value })}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
          </div>
          <div className="mb-2">
            <label className="text-xs font-bold text-gray-600 block mb-1">Zona</label>
            <input type="text" value={rutaForm.zona || ''} onChange={e => setRutaForm({ ...rutaForm, zona: e.target.value })}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
          </div>
          <div className="flex gap-2 mb-3">
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-600 block mb-1">Hora de cargue</label>
              <input type="time" value={(rutaForm.hora_cargue || '').slice(0, 5)} onChange={e => setRutaForm({ ...rutaForm, hora_cargue: e.target.value })}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
            </div>
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-600 block mb-1">Dias de operacion</label>
              <input type="text" placeholder="Ej: Lun-Sab" value={rutaForm.dias_operacion || ''} onChange={e => setRutaForm({ ...rutaForm, dias_operacion: e.target.value })}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setRutaForm(null)} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-lg">Cancelar</button>
            <button onClick={guardarRuta} disabled={guardando}
              className="flex-1 bg-brand hover:bg-brand-dark text-white font-bold py-2 rounded-lg disabled:opacity-50">
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
        {rutas.map(r => {
          const vend = vendedorDeRuta(r.id)
          return (
            <div key={r.id} className="p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-bold text-gray-800 text-sm">{r.nombre}</p>
                  <p className="text-xs text-gray-500">{[r.zona, r.hora_cargue?.slice(0, 5), r.dias_operacion].filter(Boolean).join(' · ') || 'Sin detalles'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Vendedor: {vend?.nombre || 'Sin asignar'}</p>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${r.estado ? 'bg-gray-200 text-gray-800' : 'bg-brand/10 text-brand'}`}>
                  {r.estado ? 'Activa' : 'Inactiva'}
                </span>
              </div>

              {asignando === r.id && (
                <div className="flex gap-2 mb-2">
                  <select defaultValue={vend?.id || ''} onChange={e => asignarVendedor(r.id, e.target.value || null)} disabled={guardando}
                    className="flex-1 border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
                    <option value="">Sin asignar</option>
                    {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                  </select>
                  <button onClick={() => setAsignando(null)} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg font-bold">Cerrar</button>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setAsignando(asignando === r.id ? null : r.id)} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg font-bold">
                  Asignar vendedor
                </button>
                <button onClick={() => setRutaForm({ ...r })} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg font-bold">Editar</button>
                <button onClick={() => toggleEstado(r)} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg font-bold">
                  {r.estado ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function TabVendedores() {
  const [vendedores, setVendedores] = useState([])
  const [rutas, setRutas] = useState([])
  const [vendedorForm, setVendedorForm] = useState(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    const [{ data: v }, { data: r }] = await Promise.all([
      supabase.from('vendedores').select('*, rutas(nombre)').eq('empresa_id', getEmpresaId()).order('nombre'),
      supabase.from('rutas').select('id, nombre').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre'),
    ])
    if (v) setVendedores(v)
    if (r) setRutas(r)
  }

  const guardarVendedor = async () => {
    if (!vendedorForm.nombre) { alert('Ingresa el nombre del vendedor'); return }
    setGuardando(true)
    const payload = {
      nombre: vendedorForm.nombre,
      telefono: vendedorForm.telefono || null,
      ruta_id: vendedorForm.ruta_id || null,
    }
    const { error } = vendedorForm.id
      ? await supabase.from('vendedores').update(payload).eq('id', vendedorForm.id)
      : await supabase.from('vendedores').insert({ ...payload, estado: true, empresa_id: getEmpresaId() })
    setGuardando(false)
    if (error) { alert('Error: ' + error.message); return }
    setVendedorForm(null)
    cargar()
  }

  const toggleEstado = async (v) => {
    await supabase.from('vendedores').update({ estado: !v.estado }).eq('id', v.id)
    cargar()
  }

  return (
    <>
      <div className="flex justify-between items-center mb-3">
        <p className="text-xs text-gray-500">{vendedores.length} vendedores registrados</p>
        <button onClick={() => setVendedorForm({ nombre: '', telefono: '', ruta_id: '' })}
          className="text-xs bg-brand hover:bg-brand-dark text-white px-3 py-2 rounded-lg font-bold">
          + Nuevo vendedor
        </button>
      </div>

      {vendedorForm && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <p className="font-bold text-gray-700 mb-3">{vendedorForm.id ? 'Editar vendedor' : 'Nuevo vendedor'}</p>
          <div className="mb-2">
            <label className="text-xs font-bold text-gray-600 block mb-1">Nombre</label>
            <input type="text" value={vendedorForm.nombre} onChange={e => setVendedorForm({ ...vendedorForm, nombre: e.target.value })}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
          </div>
          <div className="mb-2">
            <label className="text-xs font-bold text-gray-600 block mb-1">Telefono</label>
            <input type="text" value={vendedorForm.telefono || ''} onChange={e => setVendedorForm({ ...vendedorForm, telefono: e.target.value })}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
          </div>
          <div className="mb-3">
            <label className="text-xs font-bold text-gray-600 block mb-1">Ruta asignada</label>
            <select value={vendedorForm.ruta_id || ''} onChange={e => setVendedorForm({ ...vendedorForm, ruta_id: e.target.value })}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
              <option value="">Sin asignar</option>
              {rutas.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setVendedorForm(null)} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-lg">Cancelar</button>
            <button onClick={guardarVendedor} disabled={guardando}
              className="flex-1 bg-brand hover:bg-brand-dark text-white font-bold py-2 rounded-lg disabled:opacity-50">
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
        {vendedores.map(v => (
          <div key={v.id} className="p-4 flex justify-between items-center">
            <div>
              <p className="font-bold text-gray-800 text-sm">{v.nombre}</p>
              <p className="text-xs text-gray-500">{v.telefono || 'Sin telefono'} · Ruta: {v.rutas?.nombre || 'Sin asignar'}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-1 rounded-lg ${v.estado ? 'bg-gray-200 text-gray-800' : 'bg-brand/10 text-brand'}`}>
                {v.estado ? 'Activo' : 'Inactivo'}
              </span>
              <button onClick={() => setVendedorForm({ ...v, ruta_id: v.ruta_id || '' })} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg font-bold">Editar</button>
              <button onClick={() => toggleEstado(v)} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg font-bold">
                {v.estado ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
