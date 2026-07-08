'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'

export default function Devoluciones() {
  const [usuario, setUsuario] = useState(null)
  const [vendedores, setVendedores] = useState([])
  const [vendedorPropio, setVendedorPropio] = useState(null)
  const [vendedorId, setVendedorId] = useState('')
  const [productos, setProductos] = useState([])
  const [items, setItems] = useState([{ sku: '', cantidad: '', motivo: '' }])
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (!['admin', 'auxiliar', 'vendedor'].includes(parsed.rol)) { router.push('/dashboard'); return }
    setUsuario(parsed)
    cargarProductos()
    if (parsed.rol === 'vendedor') {
      resolverVendedorPropio(parsed.vendedor_nombre)
    } else {
      cargarVendedores()
    }
  }, [])

  const cargarVendedores = async () => {
    const { data } = await supabase.from('vendedores').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    if (data) setVendedores(data)
  }

  const resolverVendedorPropio = async (nombre) => {
    const { data } = await supabase.from('vendedores').select('*').eq('nombre', nombre).eq('empresa_id', getEmpresaId()).single()
    if (data) { setVendedorPropio(data); setVendedorId(data.id) }
  }

  const cargarProductos = async () => {
    const { data } = await supabase.from('productos').select('sku, nombre').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    if (data) setProductos(data)
  }

  const agregarItem = () => setItems([...items, { sku: '', cantidad: '', motivo: '' }])
  const quitarItem = (i) => setItems(items.filter((_, idx) => idx !== i))
  const actualizarItem = (i, campo, valor) => {
    const n = [...items]
    n[i][campo] = valor
    setItems(n)
  }

  const guardarDevoluciones = async () => {
    if (!vendedorId) { alert('Selecciona el vendedor'); return }
    const validos = items.filter(it => it.sku && parseFloat(it.cantidad) > 0)
    if (validos.length === 0) { alert('Ingresa al menos un producto con cantidad'); return }
    setGuardando(true)
    const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const registros = validos.map(it => ({
      empresa_id: getEmpresaId(),
      fecha,
      vendedor_id: vendedorId,
      sku: it.sku,
      cantidad: parseFloat(it.cantidad),
      tipo: 'devolucion',
      motivo: it.motivo || null
    }))
    const { error } = await supabase.from('novedades').insert(registros)
    if (error) { alert('Error: ' + error.message); setGuardando(false); return }
    setGuardado(true)
    setGuardando(false)
  }

  if (!usuario) return null

  if (guardado) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-md w-full">
        <h2 className="text-2xl font-black text-gray-800">Devolución registrada</h2>
        <p className="text-gray-500 mt-2">Se guardaron {items.filter(it => it.sku && parseFloat(it.cantidad) > 0).length} producto(s) en devoluciones.</p>
        <div className="flex gap-3 mt-6">
          <button onClick={() => { setItems([{ sku: '', cantidad: '', motivo: '' }]); setGuardado(false) }}
            className="flex-1 bg-brand hover:bg-brand-dark text-white px-4 py-3 rounded-xl font-bold">
            Nueva devolución
          </button>
          <button onClick={() => router.push('/dashboard')} className="flex-1 bg-gray-100 text-gray-600 px-4 py-3 rounded-xl font-bold">
            Inicio
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <div className="bg-white shadow-sm px-6 py-4 sticky top-0 z-10">
        <h1 className="text-xl font-black text-gray-900">Devoluciones</h1>
        <p className="text-xs text-gray-500">Productos que regresan a bodega</p>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <label className="text-xs font-bold text-gray-600 block mb-1">Vendedor</label>
          {usuario.rol === 'vendedor' ? (
            <p className="font-bold text-gray-800">{vendedorPropio?.nombre || 'Cargando...'}</p>
          ) : (
            <select value={vendedorId} onChange={e => setVendedorId(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
              <option value="">Selecciona vendedor</option>
              {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <p className="font-black text-gray-700">Productos</p>
            <button onClick={agregarItem} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg font-bold">+ Agregar</button>
          </div>
          {items.map((it, i) => (
            <div key={i} className="mb-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0 last:mb-0">
              <div className="flex gap-2 mb-2">
                <select value={it.sku} onChange={e => actualizarItem(i, 'sku', e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand">
                  <option value="">Selecciona producto</option>
                  {productos.map(p => <option key={p.sku} value={p.sku}>{p.nombre}</option>)}
                </select>
                <input type="number" min="0" placeholder="Cant" value={it.cantidad}
                  onChange={e => actualizarItem(i, 'cantidad', e.target.value)}
                  className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 focus:outline-none focus:border-brand" />
                {items.length > 1 && (
                  <button onClick={() => quitarItem(i)} className="text-brand text-sm px-2">✕</button>
                )}
              </div>
              <input type="text" placeholder="Motivo (opcional)" value={it.motivo}
                onChange={e => actualizarItem(i, 'motivo', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand" />
            </div>
          ))}
        </div>

        <button onClick={guardarDevoluciones} disabled={guardando}
          className="w-full bg-brand hover:bg-brand-dark text-white font-black py-4 rounded-xl text-lg disabled:opacity-50">
          {guardando ? 'Guardando...' : 'Registrar devolución'}
        </button>
      </div>
    </div>
  )
}
