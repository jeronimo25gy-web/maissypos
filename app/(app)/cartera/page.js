'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { puedeVerModulo } from '@/lib/permisos'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { PageHeader } from '@/components/ui'

const diasVencido = (fecha_pago) => {
  if (!fecha_pago) return 0
  const hoy = new Date(obtenerFechaActual())
  const pago = new Date(fecha_pago)
  return Math.floor((hoy - pago) / (24 * 60 * 60 * 1000))
}

// Agrupa por cliente (no por vendedor) -- si un cliente tiene varias
// facturas fiadas, se ven juntas con su total, pero cada factura sigue
// pudiendose pagar por separado (no obliga a pagar todo junto).
const agruparPorCliente = (lista) => {
  const grupos = {}
  lista.forEach(f => {
    const key = (f.nombre_cliente || 'Sin nombre').trim() || 'Sin nombre'
    if (!grupos[key]) grupos[key] = { nombre: f.nombre_cliente || 'Sin nombre', items: [] }
    grupos[key].items.push(f)
  })
  return Object.entries(grupos)
    .map(([key, g]) => ({
      key,
      nombre: g.nombre,
      items: g.items,
      total: g.items.reduce((s, f) => s + (f.saldo || 0), 0),
      maxVencido: Math.max(0, ...g.items.map(f => diasVencido(f.fecha_pago))),
    }))
    .sort((a, b) => b.maxVencido - a.maxVencido || b.total - a.total)
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
    if (!puedeVerModulo(parsed, 'cartera', ['admin', 'auxiliar'])) { router.push('/despacho'); return }
    setUsuario(parsed)
    cargarFiados()
  }, [])

  const cargarFiados = async () => {
    setCargando(true)
    const { data } = await supabase
      .from('cartera_fiados')
      .select('*, vendedores(nombre), rutas(nombre)')
      .eq('estado', 'pendiente')
      .eq('empresa_id', getEmpresaId())
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
      .eq('empresa_id', getEmpresaId())
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
      .eq('empresa_id', getEmpresaId())
    if (error) alert('Error: ' + error.message)
    else await cargarFiados()
    setMarcandoId(null)
  }

  const marcarPagadoGrupo = async (grupo) => {
    if (!confirm(`¿Marcar como pagadas las ${grupo.items.length} facturas de ${grupo.nombre} (total $${grupo.total.toLocaleString('es-CO')})?`)) return
    setMarcandoId(grupo.key)
    const { error } = await supabase.from('cartera_fiados')
      .update({ saldo: 0, estado: 'pagado', fecha_pagado: new Date().toISOString() })
      .in('id', grupo.items.map(f => f.id))
      .eq('empresa_id', getEmpresaId())
    if (error) alert('Error: ' + error.message)
    else await cargarFiados()
    setMarcandoId(null)
  }

  if (!usuario) return null

  const busquedaLower = busqueda.toLowerCase()
  const fiadosFiltrados = fiados.filter(f => (f.nombre_cliente || '').toLowerCase().includes(busquedaLower))
  const historialFiltrado = historial.filter(f => (f.nombre_cliente || '').toLowerCase().includes(busquedaLower))
  const grupos = agruparPorCliente(fiadosFiltrados)
  const gruposHistorial = agruparPorCliente(historialFiltrado)

  const totalPendiente = fiados.reduce((sum, f) => sum + (f.saldo || 0), 0)
  const totalVencidos = fiados.filter(f => diasVencido(f.fecha_pago) > 0).length

  return (
    <div>
      <PageHeader title="Cartera" subtitle={`$${totalPendiente.toLocaleString('es-CO')} pendiente · ${totalVencidos} vencido${totalVencidos !== 1 ? 's' : ''}`} />

      <div className="p-4 max-w-3xl mx-auto">
        <div className="flex gap-2 mb-4">
          <button onClick={() => setVista('pendientes')}
            className={`flex-1 py-2 rounded-xl text-sm font-bold ${vista === 'pendientes' ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            Pendientes
          </button>
          <button onClick={irAHistorial}
            className={`flex-1 py-2 rounded-xl text-sm font-bold ${vista === 'historial' ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            Historial
          </button>
        </div>

        <input type="text" placeholder="Buscar por nombre de cliente..." value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 mb-4 text-gray-800 focus:border-brand focus:outline-none" />

        {vista === 'pendientes' ? (
          cargando ? (
            <p className="text-gray-400 text-center py-10">Cargando...</p>
          ) : grupos.length === 0 ? (
            <p className="text-gray-400 text-center py-10">{fiados.length === 0 ? 'No hay fiados pendientes' : 'Sin resultados para la busqueda'}</p>
          ) : (
            grupos.map(grupo => (
              <div key={grupo.key} className="mb-6">
                <div className="flex items-center justify-between mb-2 gap-3">
                  <h2 className="font-black text-gray-700">
                    {grupo.nombre}
                    {grupo.items.length > 1 && <span className="text-xs font-bold text-gray-400 ml-2">{grupo.items.length} facturas</span>}
                    {grupo.maxVencido > 0 && <span className="text-xs font-bold text-brand ml-2">vencido</span>}
                  </h2>
                  <div className="flex items-center gap-2 shrink-0">
                    <p className="font-black text-gray-900">${grupo.total.toLocaleString('es-CO')}</p>
                    {grupo.items.length > 1 && (
                      <button onClick={() => marcarPagadoGrupo(grupo)} disabled={marcandoId === grupo.key}
                        className="bg-gray-800 hover:bg-black text-white text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50">
                        {marcandoId === grupo.key ? '...' : 'Pagar todo'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
                  {grupo.items.map(f => {
                    const vencido = diasVencido(f.fecha_pago)
                    return (
                      <div key={f.id} className={`p-4 flex items-center justify-between ${vencido > 0 ? 'bg-brand/5' : ''}`}>
                        <div className="flex-1">
                          <p className="text-xs text-gray-500">
                            {f.vendedores?.nombre ? `${f.vendedores.nombre}${f.rutas?.nombre ? ' · ' + f.rutas.nombre : ''}` : 'Mostrador'}
                          </p>
                          <p className="text-xs text-gray-500">Fiado: {f.fecha_fiado} {f.fecha_pago ? `· Pago acordado: ${f.fecha_pago}` : ''}</p>
                          {vencido > 0 && (
                            <p className="text-xs font-bold text-brand">{vencido} dia{vencido !== 1 ? 's' : ''} vencido</p>
                          )}
                        </div>
                        <div className="flex gap-4 items-center">
                          <div className="text-center">
                            <p className="text-xs text-gray-400">Original</p>
                            <p className="font-bold text-gray-600">${(f.valor_original || 0).toLocaleString('es-CO')}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-400">Saldo</p>
                            <p className={`font-black ${vencido > 0 ? 'text-brand' : 'text-gray-800'}`}>${(f.saldo || 0).toLocaleString('es-CO')}</p>
                          </div>
                          <button onClick={() => marcarPagado(f)} disabled={marcandoId === f.id}
                            className="bg-brand hover:bg-brand-dark text-white text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50">
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
          ) : gruposHistorial.length === 0 ? (
            <p className="text-gray-400 text-center py-10">{historial.length === 0 ? 'No hay fiados pagados todavia' : 'Sin resultados para la busqueda'}</p>
          ) : (
            gruposHistorial.map(grupo => (
              <div key={grupo.key} className="mb-6">
                <div className="flex items-center justify-between mb-2 gap-3">
                  <h2 className="font-black text-gray-700">
                    {grupo.nombre}
                    {grupo.items.length > 1 && <span className="text-xs font-bold text-gray-400 ml-2">{grupo.items.length} facturas</span>}
                  </h2>
                </div>
                <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
                  {grupo.items.map(f => (
                    <div key={f.id} className="p-4 flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-xs text-gray-500">
                          {f.vendedores?.nombre ? `${f.vendedores.nombre}${f.rutas?.nombre ? ' · ' + f.rutas.nombre : ''}` : 'Mostrador'}
                        </p>
                        <p className="text-xs text-gray-500">Fiado: {f.fecha_fiado}</p>
                        <p className="text-xs font-bold text-gray-900">
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
