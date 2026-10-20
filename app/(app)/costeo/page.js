'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { puedeVerModulo } from '@/lib/permisos'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { PageHeader } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { cargarCostos } from '@/lib/costos'
import { cargarCostosDistri } from '@/lib/costos-distri'
import Exportar from '@/components/Exportar'
import CostosDistri, { reporteDistri } from './Distri'
import { PorPaquete, Insumos, reporteArepas } from './Paneles'
import ElMes from './ElMes'

// Costos: en una empresa que produce (Arepas) se arma desde la Tela blanca
// (Paneles.js); en una distribuidora (Distri), producto comprado + lo que
// cuesta repartir, por producto y por ruta (Distri.js).
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', rojo: '#C41230', rojoF: '#FBE9E9' }

export default function Costos() {
  const router = useRouter()
  const [usuario, setUsuario] = useState(null)
  const [tab, setTab] = useState('paquete')
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [telasSim, setTelasSim] = useState({}) // maizId -> Telas por bulto para simular
  const [bultosSim, setBultosSim] = useState(null)
  const [empresa, setEmpresa] = useState(null)

  const [produce, setProduce] = useState(null)
  const cargar = useCallback(async () => {
    try {
      const { data: emp } = await supabase.from('empresas').select('nombre, logo_url, modelos').eq('id', getEmpresaId()).maybeSingle()
      setEmpresa(emp)
      const esProduccion = (emp?.modelos || []).includes('produccion')
      setProduce(esProduccion)
      const mes = obtenerFechaActual().slice(0, 7)
      setD(esProduccion ? await cargarCostos(mes) : await cargarCostosDistri(mes))
      setError('')
    } catch (e) { setError(e.message) }
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
      <PageHeader title="Costos" subtitle={produce === false ? 'Por producto, por ruta y lo que queda en la calle' : 'Desde la Tela blanca, por referencia y por canal'}
        actions={d && produce != null ? <Exportar armar={() => produce ? reporteArepas(d, telasSim, bultosSim, empresa) : reporteDistri(d, empresa)} /> : null} />
      <div className="p-4 max-w-6xl mx-auto flex flex-col gap-4">
        {produce === false ? (
          <>
            {error && <div className="rounded-2xl px-4 py-3 text-sm font-bold" style={{ background: C.rojoF, color: C.rojo }}>No se pudo cargar: {error}</div>}
            {d ? <CostosDistri d={d} /> : !error && <p className="text-center py-16" style={{ color: C.gris }}>Cargando…</p>}
          </>
        ) : produce === null ? (error ? <div className="rounded-2xl px-4 py-3 text-sm font-bold" style={{ background: C.rojoF, color: C.rojo }}>No se pudo cargar: {error}</div> : <p className="text-center py-16" style={{ color: C.gris }}>Cargando…</p>) : (<>
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
          : <PorPaquete d={d} telasSim={telasSim} setTelasSim={setTelasSim} bultosSim={bultosSim} setBultosSim={setBultosSim} irInsumos={() => setTab('insumos')} />}
        </>)}
      </div>
    </div>
  )
}
