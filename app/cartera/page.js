'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

const diasVencido = (fecha_pago) => {
  if (!fecha_pago) return 0
  const hoy = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }))
  const pago = new Date(fecha_pago)
  return Math.floor((hoy - pago) / (24 * 60 * 60 * 1000))
}

const agruparPorVendedor = (lista) => {
  const grupos = {}
  lista.forEach(f => {
    const key = f.vendedores?.nombre || 'Sin vendedor'
    if (!grupos[key]) grupos[key] = { ruta: f.rutas?.nombre, items: [] }
    grupos[key].items.push(f)
  })
  return grupos
}

export default function Cartera() {
  const [usuario, setUsuario] = useState(null)
  const [vista, setVista] = useState('pendientes')
  const [fiados, setFiados] = useState([])
  const [historial, setHistorial] = useState([])
  const [cargando, setCargando] = useState(true)
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  const [marcandoId, setMarcandoId] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (parsed.rol !== 'admin' && parsed.rol !== 'auxiliar') { router.push('/dashboard'); return }
    setUsuario(parsed)
    cargarFiados()
  }, [])

  const cargarFiados = async () => {
    setCargando(true)
    const { data } = await supabase
      .from('cartera_fiados')
      .select('*, vendedores(nombre), rutas(nombre)')
      .eq('estado', 'pendiente')
      .order('fecha_pago')
    if (data) setFiados(data)
    setCargando(false)
  }

  const cargarHistorial = async () => {
    setCargandoHistorial(true)
    const { data } = await supabase
      .from('cartera_fiados')
      .select('*, vendedores(nombre), rutas(nombre)')
      .eq('estado', 'pagado')
      .order('fecha_pagado', { ascending: false })
    if (data) setHistorial(data)
    setCargandoHistorial(false)
  }

  const irAHistorial = () => {
    setVista('historial')
    cargarHistorial()
  }

  const marcarPagado = async (f) => {
    setMarcandoId(f.id)
    const { error } = await supabase.from('cartera_fiados')
      .update({ saldo: 0, estado: 'pagado', fecha_pagado: new Date().toISOString() })
      .eq('id', f.id)
    if (error) alert('Error: ' + error.message)
    else await cargarFiados()
    setMarcandoId(null)
  }

  if (!usuario) return null

  const busquedaLower = busqueda.toLowerCase()
  const fiadosFiltrados = fiados.filter(f => (f.nombre_cliente || '').toLowerCase().includes(busquedaLower))
  const historialFiltrado = historial.filter(f => (f.nombre_cliente || '').toLowerCase().includes(busquedaLower))
  const grupos = agruparPorVendedor(fiadosFiltrados)
  const gruposHistorial = agruparPorVendedor(historialFiltrado)

  const totalPendiente = fiados.reduce((sum, f) => sum + (f.saldo || 0), 0)
  const totalVencidos = fiados.filter(f => diasVencido(f.fecha_pago) > 0).length

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow-sm px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-black text-yellow-600">Cartera</h1>
          <p className="text-xs text-gray-500">${totalPendiente.toLocaleString('es-CO')} pendiente · {totalVencidos} vencido{totalVencidos !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 text-sm">Volver</button>
      </div>

      <div className="p-4 max-w-3xl mx-auto">
        <div className="flex gap-2 mb-4">
          <button onClick={() => setVista('pendientes')}
            className={`flex-1 py-2 rounded-xl text-sm font-bold ${vista === 'pendientes' ? 'bg-yellow-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            Pendientes
          </button>
          <button onClick={irAHistorial}
            className={`flex-1 py-2 rounded-xl text-sm font-bold ${vista === 'historial' ? 'bg-yellow-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            Historial
          </button>
        </div>

        <input type="text" placeholder="Buscar por nombre de cliente..." value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 mb-4 focus:border-yellow-500 focus:outline-none" />

        {vista === 'pendientes' ? (
          cargando ? (
            <p className="text-gray-400 text-center py-10">Cargando...</p>
          ) : Object.keys(grupos).length === 0 ? (
            <p className="text-gray-400 text-center py-10">{fiados.length === 0 ? 'No hay fiados pendientes' : 'Sin resultados para la busqueda'}</p>
          ) : (
            Object.entries(grupos).map(([vendedorNombre, grupo]) => (
              <div key={vendedorNombre} className="mb-6">
                <h2 className="font-black text-gray-700 mb-2">{vendedorNombre}{grupo.ruta ? ` · ${grupo.ruta}` : ''}</h2>
                <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
                  {grupo.items.map(f => {
                    const vencido = diasVencido(f.fecha_pago)
                    return (
                      <div key={f.id} className={`p-4 flex items-center justify-between ${vencido > 0 ? 'bg-red-50' : ''}`}>
                        <div className="flex-1">
                          <p className="font-bold text-gray-800 text-sm">{f.nombre_cliente}</p>
                          <p className="text-xs text-gray-500">Fiado: {f.fecha_fiado} {f.fecha_pago ? `· Pago acordado: ${f.fecha_pago}` : ''}</p>
                          {vencido > 0 && (
                            <p className="text-xs font-bold text-red-600">{vencido} dia{vencido !== 1 ? 's' : ''} vencido</p>
                          )}
                        </div>
                        <div className="flex gap-4 items-center">
                          <div className="text-center">
                            <p className="text-xs text-gray-400">Original</p>
                            <p className="font-bold text-gray-600">${(f.valor_original || 0).toLocaleString('es-CO')}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-400">Saldo</p>
                            <p className={`font-black ${vencido > 0 ? 'text-red-600' : 'text-gray-800'}`}>${(f.saldo || 0).toLocaleString('es-CO')}</p>
                          </div>
                          <button onClick={() => marcarPagado(f)} disabled={marcandoId === f.id}
                            className="bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50">
                            {marcandoId === f.id ? '...' : 'Marcar pagado'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )
        ) : (
          cargandoHistorial ? (
            <p className="text-gray-400 text-center py-10">Cargando...</p>
          ) : Object.keys(gruposHistorial).length === 0 ? (
            <p className="text-gray-400 text-center py-10">{historial.length === 0 ? 'No hay fiados pagados todavia' : 'Sin resultados para la busqueda'}</p>
          ) : (
            Object.entries(gruposHistorial).map(([vendedorNombre, grupo]) => (
              <div key={vendedorNombre} className="mb-6">
                <h2 className="font-black text-gray-700 mb-2">{vendedorNombre}{grupo.ruta ? ` · ${grupo.ruta}` : ''}</h2>
                <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
                  {grupo.items.map(f => (
                    <div key={f.id} className="p-4 flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-bold text-gray-800 text-sm">{f.nombre_cliente}</p>
                        <p className="text-xs text-gray-500">Fiado: {f.fecha_fiado}</p>
                        <p className="text-xs font-bold text-green-600">
                          Pagado: {f.fecha_pagado ? new Date(f.fecha_pagado).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : '—'}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-400">Original</p>
                        <p className="font-bold text-gray-600">${(f.valor_original || 0).toLocaleString('es-CO')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )
        )}
      </div>
    </div>
  )
}
