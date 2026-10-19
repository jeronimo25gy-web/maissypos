'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { puedeVerModulo } from '@/lib/permisos'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { PageHeader } from '@/components/ui'
import { cargarCostos } from '@/lib/costos'
import { PorPaquete, Insumos } from './Paneles'
import ElMes from './ElMes'

// Costos de Arepas Maissy con la Tela blanca como base (paneles en Paneles.js).
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', rojo: '#C41230', rojoF: '#FBE9E9' }

export default function Costos() {
  const router = useRouter()
  const [usuario, setUsuario] = useState(null)
  const [tab, setTab] = useState('paquete')
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [telasSim, setTelasSim] = useState({}) // maizId -> Telas por bulto para simular

  const cargar = useCallback(async () => {
    try { setD(await cargarCostos(obtenerFechaActual().slice(0, 7))); setError('') } catch (e) { setError(e.message) }
  }, [])

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')
    if (!u) { router.push('/'); return }
    if (!puedeVerModulo(u, 'costeo', ['admin'])) { router.push('/despacho'); return }
    setUsuario(u)
    cargar()
  }, [router, cargar])

  if (!usuario) return null

  return (
    <div style={{ background: C.fondo, color: C.tinta }} className="min-h-screen">
      <PageHeader title="Costos" subtitle="Desde la Tela blanca, por referencia y por canal" />
      <div className="p-4 max-w-6xl mx-auto flex flex-col gap-4">
        <div className="flex gap-1 bg-white rounded-full p-1 w-max max-w-full overflow-x-auto" role="tablist">
          {[['paquete', 'Por paquete'], ['insumos', 'Precios de insumos'], ['mes', 'El mes']].map(([id, n]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className="rounded-full min-h-[40px] px-4 text-sm font-bold whitespace-nowrap"
              style={tab === id ? { background: C.tinta, color: '#fff' } : { color: C.gris }}>{n}</button>
          ))}
        </div>
        {error && <div className="rounded-2xl px-4 py-3 text-sm font-bold" style={{ background: C.rojoF, color: C.rojo }}>No se pudo cargar: {error}</div>}
        {tab === 'mes' ? <ElMes /> : !d ? (!error && <p className="text-center py-16" style={{ color: C.gris }}>Cargando…</p>)
          : tab === 'insumos' ? <Insumos d={d} usuario={usuario} recargar={cargar} />
          : <PorPaquete d={d} telasSim={telasSim} setTelasSim={setTelasSim} irInsumos={() => setTab('insumos')} />}
      </div>
    </div>
  )
}
