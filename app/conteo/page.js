'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function Conteo() {
  const [usuario, setUsuario] = useState(null)
  const [productos, setProductos] = useState([])
  const [conteos, setConteos] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    setUsuario(JSON.parse(u))
    cargarProductos()
  }, [])

  const cargarProductos = async () => {
    const { data } = await supabase
      .from('productos')
      .select('*')
      .eq('estado', true)
      .order('categoria')
    if (data) {
      setProductos(data)
      const initial = {}
      data.forEach(p => { initial[p.sku] = '0' })
      setConteos(initial)
    }
  }

  const guardarConteo = async () => {
    const vacios = productos.filter(p => conteos[p.sku] === '')
    if (vacios.length > 0) {
      alert('Debes ingresar cantidad para todos los productos. Pon 0 si no hay.')
      return
    }
    setGuardando(true)
    const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const registros = productos.map(p => ({
      empresa_id: p.empresa_id,
      fecha,
      sku: p.sku,
      cantidad_sistema: 0,
      cantidad_fisica: parseFloat(conteos[p.sku]),
      diferencia: parseFloat(conteos[p.sku]),
      completado: true,
      usuario: usuario.nombre
    }))
    const { error } = await supabase.from('conteo_fisico').insert(registros)
    if (error) {
      alert('Error al guardar: ' + error.message)
    } else {
      setGuardado(true)
    }
    setGuardando(false)
  }

  const categorias = [...new Set(productos.map(p => p.categoria))]

  if (guardado) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-md w-full">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-2xl font-black text-gray-800">Conteo guardado</h2>
        <p className="text-gray-500 mt-2">El conteo de hoy quedo registrado correctamente.</p>
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
          <h1 className="text-xl font-black text-blue-600">Conteo de Inventario</h1>
          <p className="text-xs text-gray-500">{new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 text-sm">Cancelar</button>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
          <p className="text-blue-700 text-sm font-medium">Ingresa la cantidad fisica de cada producto. Pon 0 si no hay unidades.</p>
        </div>

        {categorias.map(cat => (
          <div key={cat} className="mb-4">
            <h3 className="font-bold text-gray-600 text-sm uppercase tracking-wide mb-2 px-1">{cat}</h3>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              {productos.filter(p => p.categoria === cat).map((p, i, arr) => (
                <div key={p.sku} className={`flex items-center justify-between px-4 py-3 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                  <div className="flex-1">
                    <p className="font-medium text-gray-800 text-sm">{p.nombre}</p>
                    <p className="text-xs text-gray-400">{p.sku} · {p.presentacion}</p>
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={conteos[p.sku]}
                    onChange={e => setConteos(prev => ({ ...prev, [p.sku]: e.target.value }))}
                    className="w-20 text-center border-2 border-gray-200 rounded-lg py-2 text-lg font-bold focus:border-blue-500 focus:outline-none"
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <button
          onClick={guardarConteo}
          disabled={guardando}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl text-lg mt-4 disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : 'Guardar Conteo del Dia'}
        </button>
      </div>
    </div>
  )
}
