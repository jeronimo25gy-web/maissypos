'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { puedeVerModulo } from '@/lib/permisos'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { cargarFlota, atencion } from '@/lib/vehiculos'
import { PageHeader } from '@/components/ui'
import SelectorEmpresa from '@/components/SelectorEmpresa'
import { C, Pestanas, Boton, Pill, Tarjeta, H2 } from '../gastos/ui'
import Flota from './Flota'
import Preoperacionales from './Preoperacionales'
import Conductores from './Conductores'
import Activos from './Activos'

// Vehículos y activos de la empresa activa: flota con documentos,
// mantenimiento, combustible y entregas; preoperacional diario (antes
// FR-SST-001 en papel); licencias y carnés de los conductores; activos fijos.
// La pantalla de antes quedó en /vehiculos-anterior.
const TABS = [['vehiculos', 'Vehículos'], ['preop', 'Preoperacional'], ['conductores', 'Conductores'], ['activos', 'Activos fijos']]

export default function VehiculosActivos() {
  const router = useRouter()
  const hoy = obtenerFechaActual()
  const [usuario, setUsuario] = useState(null)
  const [empresa, setEmpresa] = useState(null)
  const [tab, setTab] = useState('vehiculos')
  const [flota, setFlota] = useState(null)
  const [sel, setSel] = useState(null)
  const [verTodo, setVerTodo] = useState(false)
  const nuevoRef = useRef(null)

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')
    if (!u) { router.push('/'); return }
    if (!puedeVerModulo(u, 'vehiculos', ['admin'])) { router.push('/despacho'); return }
    setUsuario(u)
    supabase.from('empresas').select('id, nombre, logo_url').eq('id', getEmpresaId()).maybeSingle().then(({ data }) => setEmpresa(data))
  }, [router])
  const cargar = useCallback(async () => {
    try { setFlota(await cargarFlota(getEmpresaId(), hoy)) } catch (e) { alert('No se pudieron cargar los vehículos: ' + e.message) }
  }, [hoy])
  useEffect(() => {
    if (!usuario) return
    cargar()
    const buscar = new URLSearchParams(window.location.search).get('buscar')
    if (buscar) supabase.from('vehiculos').select('id').eq('empresa_id', getEmpresaId()).eq('placa', buscar).maybeSingle().then(({ data }) => data && setSel(data.id))
  }, [usuario, cargar])

  if (!usuario) return null
  const avisos = flota ? atencion(flota, hoy) : []
  const nuevo = { vehiculos: '+ Vehículo', activos: '+ Activo' }[tab]
  return (
    <div style={{ background: C.fondo, color: C.tinta }} className="min-h-screen">
      <div className="no-imprimir"><PageHeader title="Vehículos y activos" subtitle={empresa?.nombre} actions={nuevo ? <Boton tono="rojo" onClick={() => { if (tab !== 'vehiculos' && tab !== 'activos') return; nuevoRef.current?.() }}>{nuevo}</Boton> : null} /></div>
      <div className="p-4 max-w-6xl mx-auto flex flex-col gap-4">
        <div className="no-imprimir flex flex-col gap-4">
          <SelectorEmpresa usuario={usuario} />
          {avisos.length > 0 && (
            <Tarjeta>
              <div className="flex justify-between gap-2 items-center"><H2>Requiere atención</H2>{avisos.length > 4 && <Boton onClick={() => setVerTodo(!verTodo)}>{verTodo ? 'Ver menos' : `Ver los ${avisos.length}`}</Boton>}</div>
              {(verTodo ? avisos : avisos.slice(0, 4)).map((a, i) => (
                <button key={i} type="button" onClick={() => { if (a.vehiculo) { setTab('vehiculos'); setSel(a.vehiculo) } else if (a.conductor) setTab('conductores') }} className="grid gap-2.5 items-center pt-2.5 text-left" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', borderTop: i ? `1px solid ${C.linea}` : 0 }}>
                  <span className="min-w-0"><b>{a.titulo}</b>{a.detalle && <span className="block text-[13px]" style={{ color: C.gris }}>{a.detalle}</span>}</span>
                  <Pill tono={a.tono}>{a.tono === 'rojo' ? 'Urgente' : 'Pronto'}</Pill>
                </button>
              ))}
            </Tarjeta>
          )}
          <Pestanas opciones={TABS} valor={tab} onCambio={(v) => { nuevoRef.current = null; setTab(v) }} />
        </div>
        {!flota ? <p className="text-sm" style={{ color: C.gris }}>Cargando…</p> : (<>
          {tab === 'vehiculos' && <Flota flota={flota} usuario={usuario} recargar={cargar} sel={sel} setSel={setSel} nuevoRef={nuevoRef} />}
          {tab === 'preop' && <Preoperacionales flota={flota} empresa={empresa} />}
          {tab === 'conductores' && <Conductores flota={flota} recargar={cargar} />}
          {tab === 'activos' && <Activos usuario={usuario} nuevoRef={nuevoRef} />}
        </>)}
      </div>
    </div>
  )
}
