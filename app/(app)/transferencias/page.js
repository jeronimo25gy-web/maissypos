'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const fmt = (v) => `$${Math.round(v || 0).toLocaleString('es-CO')}`

export default function Transferencias() {
  const [usuario, setUsuario] = useState(null)
  const [fecha, setFecha] = useState(hoy())
  const [origenFiltro, setOrigenFiltro] = useState('')
  const [destinoFiltro, setDestinoFiltro] = useState('')
  const [vendedores, setVendedores] = useState([])
  const [transferencias, setTransferencias] = useState([])
  const [cargando, setCargando] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (parsed.rol !== 'admin' && parsed.rol !== 'auxiliar') { router.push('/dashboard'); return }
    setUsuario(parsed)
    cargarVendedores()
    cargarTransferencias(hoy(), '', '')
  }, [])

  const cargarVendedores = async () => {
    const { data } = await supabase.from('vendedores').select('*').eq('empresa_id', getEmpresaId()).order('nombre')
    if (data) setVendedores(data)
  }

  const cargarTransferencias = async (f, origenId, destinoId) => {
    setCargando(true)
    let query = supabase
      .from('transferencias_mercancia')
      .select('*, origen:vendedor_origen_id(nombre), destino:vendedor_destino_id(nombre)')
      .eq('fecha', f)
      .eq('empresa_id', getEmpresaId())
      .order('created_at', { ascending: false })
    if (origenId) query = query.eq('vendedor_origen_id', origenId)
    if (destinoId) query = query.eq('vendedor_destino_id', destinoId)
    const { data } = await query
    setTransferencias(data || [])
    setCargando(false)
  }

  const cambiarFecha = (f) => { setFecha(f); cargarTransferencias(f, origenFiltro, destinoFiltro) }
  const cambiarOrigen = (id) => { setOrigenFiltro(id); cargarTransferencias(fecha, id, destinoFiltro) }
  const cambiarDestino = (id) => { setDestinoFiltro(id); cargarTransferencias(fecha, origenFiltro, id) }

  if (!usuario) return null

  const totalValor = transferencias.reduce((s, t) => s + (t.valor_total || 0), 0)

  return (
    <div>
      <div className="bg-white shadow-sm px-6 py-4 sticky top-0 z-10">
        <h1 className="text-xl font-black text-gray-900">Transferencias de Mercancia</h1>
        <p className="text-xs text-gray-500">Historial de mercancia intercambiada entre vendedores</p>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <div className="mb-3">
            <label className="text-xs font-bold text-gray-500 block mb-1">Fecha</label>
            <input type="date" value={fecha} onChange={e => cambiarFecha(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 block mb-1">Vendedor origen</label>
              <select value={origenFiltro} onChange={e => cambiarOrigen(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
                <option value="">Todos</option>
                {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 block mb-1">Vendedor destino</label>
              <select value={destinoFiltro} onChange={e => cambiarDestino(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
                <option value="">Todos</option>
                {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <p className="text-xs text-gray-500 mb-1">Total transferido</p>
          <p className="text-3xl font-black text-brand">{fmt(totalValor)}</p>
        </div>

        {cargando ? (
          <p className="text-gray-400 text-center py-10">Cargando...</p>
        ) : transferencias.length === 0 ? (
          <p className="text-gray-400 text-center py-10">Sin transferencias para este filtro</p>
        ) : (
          <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
            {transferencias.map(t => (
              <div key={t.id} className="p-4 flex justify-between items-center">
                <div>
                  <p className="font-bold text-gray-800 text-sm">{t.sku} · {t.cantidad} und</p>
                  <p className="text-xs text-gray-500">{t.origen?.nombre || 'Sin vendedor'} → {t.destino?.nombre || 'Sin vendedor'}</p>
                  <p className="text-xs text-gray-400">{t.aplicada ? 'Aplicada' : 'Pendiente de aplicar'}</p>
                </div>
                <p className="font-black text-gray-900">{fmt(t.valor_total)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
