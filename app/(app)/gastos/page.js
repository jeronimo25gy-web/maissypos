'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'

const hoy = obtenerFechaActual

export default function GastosAdmin() {
  const [usuario, setUsuario] = useState(null)
  const [fecha, setFecha] = useState(hoy())
  const [categoria, setCategoria] = useState('')
  const [categorias, setCategorias] = useState([])
  const [descripcion, setDescripcion] = useState('')
  const [valor, setValor] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [gastos, setGastos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todas')
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (parsed.rol !== 'admin' && parsed.rol !== 'auxiliar') { router.push('/dashboard'); return }
    setUsuario(parsed)
    cargarGastos()
    cargarCategorias()
  }, [])

  const cargarCategorias = async () => {
    const { data } = await supabase.from('categorias_gasto').select('nombre').eq('tipo', 'admin').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    if (data) setCategorias(data.map(c => c.nombre))
  }

  const cargarGastos = async () => {
    setCargando(true)
    const mes = hoy().slice(0, 7)
    const { data } = await supabase
      .from('gastos_admin')
      .select('*')
      .gte('fecha', `${mes}-01`)
      .lte('fecha', `${mes}-31`)
      .eq('empresa_id', getEmpresaId())
      .order('fecha', { ascending: false })
    if (data) setGastos(data)
    setCargando(false)
  }

  const guardarGasto = async () => {
    if (!categoria || !valor) { alert('Selecciona una categoria e ingresa el valor'); return }
    setGuardando(true)
    const { error } = await supabase.from('gastos_admin').insert({
      empresa_id: getEmpresaId(),
      fecha,
      categoria,
      descripcion: descripcion || null,
      valor: parseFloat(valor),
      registrado_por: usuario.nombre
    })
    if (error) { alert('Error: ' + error.message); setGuardando(false); return }
    setCategoria('')
    setDescripcion('')
    setValor('')
    setFecha(hoy())
    await cargarGastos()
    setGuardando(false)
  }

  if (!usuario) return null

  const gastosFiltrados = categoriaFiltro === 'Todas' ? gastos : gastos.filter(g => g.categoria === categoriaFiltro)
  const total = gastosFiltrados.reduce((s, g) => s + (g.valor || 0), 0)

  return (
    <div>
      <div className="bg-white shadow-sm px-6 py-4 sticky top-0 z-10">
        <h1 className="text-xl font-black text-gray-900">Gastos administrativos</h1>
        <p className="text-xs text-gray-500">{new Date().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })}</p>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <p className="font-black text-gray-700 mb-3">Registrar gasto</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Categoria</label>
              <select value={categoria} onChange={e => setCategoria(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
                <option value="">Selecciona</option>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="mb-3">
            <label className="text-xs font-bold text-gray-600 block mb-1">Descripcion</label>
            <input type="text" placeholder="Detalle (opcional)" value={descripcion} onChange={e => setDescripcion(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
          </div>
          <div className="mb-3">
            <label className="text-xs font-bold text-gray-600 block mb-1">Valor</label>
            <input type="number" min="0" placeholder="0" value={valor} onChange={e => setValor(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-lg font-black text-gray-800 focus:border-brand focus:outline-none" />
          </div>
          <div className="flex justify-between items-center mb-3">
            <p className="text-xs text-gray-500">Registrado por</p>
            <p className="text-sm font-bold text-gray-700">{usuario.nombre}</p>
          </div>
          <button onClick={guardarGasto} disabled={guardando}
            className="w-full bg-brand hover:bg-brand-dark text-white font-black py-3 rounded-xl disabled:opacity-50">
            {guardando ? 'Guardando...' : 'Registrar gasto'}
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
          {['Todas', ...categorias].map(c => (
            <button key={c} onClick={() => setCategoriaFiltro(c)}
              className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${categoriaFiltro === c ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              {c}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex justify-between items-center">
          <p className="font-black text-gray-700">Total {categoriaFiltro === 'Todas' ? 'del mes' : categoriaFiltro}</p>
          <p className="text-2xl font-black text-brand">${total.toLocaleString('es-CO')}</p>
        </div>

        {cargando ? (
          <p className="text-gray-400 text-center py-10">Cargando...</p>
        ) : gastosFiltrados.length === 0 ? (
          <p className="text-gray-400 text-center py-10">Sin gastos registrados</p>
        ) : (
          <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
            {gastosFiltrados.map(g => (
              <div key={g.id} className="p-4 flex justify-between items-center">
                <div>
                  <p className="font-bold text-gray-800 text-sm">{g.categoria}</p>
                  {g.descripcion && <p className="text-xs text-gray-500">{g.descripcion}</p>}
                  <p className="text-xs text-gray-400">{g.fecha} · {g.registrado_por}</p>
                </div>
                <p className="font-black text-gray-900">${g.valor.toLocaleString('es-CO')}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
