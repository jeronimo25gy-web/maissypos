'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useDestino } from '@/lib/destino'
import { puedeVerModulo } from '@/lib/permisos'
import { PageHeader } from '@/components/ui'
import { fmtNum } from '@/lib/planta'
import { cargarProduccion, resumenHoy } from '@/lib/produccion-admin'
import { C, titulo, Hoy, Lotes, Rendimiento, Estandares } from './Paneles'
import AnotarAMano from './AnotarAMano'
import PlanDia from './Plan'
import PlanSugerido from './PlanSugerido'

// Producción para el admin: qué está pasando en la planta, cuánto rinde el
// bulto y qué estándares ya están medidos. La planta registra desde la tablet
// (/planta); anotar a mano queda como plan B para un día sin tablet.
const TABS = [['hoy', 'Hoy'], ['planear', 'Planear'], ['resultados', 'Resultados'], ['ajustes', 'Ajustes']]
// Dentro de cada pestaña, lo que antes eran pestañas sueltas (también las usa el buscador).
const VISTAS = { sugerido: ['planear', 'lote'], plan: ['planear', 'plan'], rinde: ['resultados', 'rinde'], lotes: ['resultados', 'lotes'], std: ['ajustes', 'std'], mano: ['ajustes', 'mano'] }
const PARTES = { planear: [['lote', 'Calcular lote'], ['plan', 'Plan para la planta']], resultados: [['rinde', 'Rendimiento'], ['lotes', 'Lotes de cocción']], ajustes: [['std', 'Estándares'], ['mano', 'Anotar a mano']] }

export default function Produccion() {
  const router = useRouter()
  const [usuario, setUsuario] = useState(null)
  const [e, setE] = useState(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('hoy')
  const [parte, setParte] = useState({ planear: 'lote', resultados: 'rinde', ajustes: 'std' })
  useDestino('vista', (v) => {
    if (VISTAS[v]) { setTab(VISTAS[v][0]); setParte(p => ({ ...p, [VISTAS[v][0]]: VISTAS[v][1] })) }
    else if (TABS.some(t => t[0] === v)) setTab(v)
  })

  const cargar = useCallback(async () => {
    try { setE(await cargarProduccion()); setError('') } catch (err) { setError(err.message) }
  }, [])

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')
    if (!u) { router.push('/entrar'); return }
    if (!puedeVerModulo(u, 'produccion', ['admin', 'auxiliar'])) { router.push('/despacho'); return }
    setUsuario(u)
    cargar()
    const t = setInterval(cargar, 60000)
    return () => clearInterval(t)
  }, [router, cargar])

  if (!usuario) return null
  const r = e ? resumenHoy(e) : null
  const maizTxt = r ? e.maices.filter(m => r.maiz[m.id]).map(m => `${fmtNum(r.maiz[m.id], r.maiz[m.id] % 1 ? 1 : 0)} ${m.nombre.replace(/^Maíz /, '').toLowerCase()}`).join(' · ') : ''
  const totalMaiz = r ? Object.values(r.maiz).reduce((s, n) => s + n, 0) : 0

  return (
    <div style={{ background: C.fondo, color: C.tinta }} className="min-h-screen">
      <PageHeader title="Producción" subtitle={new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
        actions={<button onClick={() => router.push('/planta')} className="px-4 min-h-[42px] rounded-xl text-sm font-bold text-white" style={{ background: 'var(--primario)' }}>Abrir pantalla de planta</button>} />
      <div className="p-4 max-w-6xl mx-auto flex flex-col gap-4">
        {error && <div className="rounded-2xl px-4 py-3 text-sm font-bold" style={{ background: C.rojoF, color: C.rojo }}>No se pudo cargar: {error}</div>}
        {!e && !error && <p className="text-center py-16" style={{ color: C.gris }}>Cargando…</p>}
        {e && (
          <>
            <div className="flex gap-1 bg-white rounded-full p-1 w-max max-w-full overflow-x-auto" role="tablist">
              {TABS.map(([id, n]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                  className="rounded-full min-h-[40px] px-4 text-sm font-bold whitespace-nowrap"
                  style={tab === id ? { background: C.tinta, color: '#fff' } : { color: C.gris }}>{n}</button>
              ))}
            </div>

            {PARTES[tab] && (
              <div className="flex gap-2 flex-wrap" role="group" aria-label="Sección">
                {PARTES[tab].map(([id, n]) => (
                  <button key={id} type="button" aria-pressed={parte[tab] === id} onClick={() => setParte(p => ({ ...p, [tab]: id }))} className="rounded-full min-h-[40px] px-4 text-sm font-bold"
                    style={parte[tab] === id ? { background: '#fff', boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: C.suave, color: C.gris }}>{n}</button>
                ))}
              </div>
            )}

            {tab === 'hoy' && <>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <Kpi rotulo="Maíz puesto hoy" valor={totalMaiz ? `${fmtNum(totalMaiz, totalMaiz % 1 ? 1 : 0)} bultos` : '0 bultos'} nota={maizTxt || 'Todavía no se ha montado nada'} />
                <Kpi rotulo="Empacado hoy" valor={`${r.empacadoTotal.toLocaleString('es-CO')} paq.`} nota={`${r.enBodegaHoy.toLocaleString('es-CO')} ya en bodega${r.porPasar ? ` · ${r.porPasar} por pasar` : ''}`} />
              </div>
              <Hoy e={e} />
            </>}
            {tab === 'planear' && parte.planear === 'lote' && <PlanSugerido e={e} />}
            {tab === 'planear' && parte.planear === 'plan' && <PlanDia e={e} usuario={usuario} />}
            {tab === 'resultados' && parte.resultados === 'rinde' && <Rendimiento e={e} />}
            {tab === 'resultados' && parte.resultados === 'lotes' && <Lotes e={e} />}
            {tab === 'ajustes' && parte.ajustes === 'std' && <Estandares e={e} usuario={usuario} recargar={cargar} />}
            {tab === 'ajustes' && parte.ajustes === 'mano' && <AnotarAMano />}
          </>
        )}
      </div>
    </div>
  )
}

function Kpi({ rotulo, valor, nota, rojo }) {
  return (
    <div className="bg-white rounded-[18px] p-4 flex flex-col gap-0.5 min-w-0">
      <span className="text-[13px] font-bold" style={{ color: C.gris }}>{rotulo}</span>
      <span className="cifra-caja"><span className="cifra font-extrabold tabular-nums" style={{ ...titulo, color: rojo ? C.rojo : C.tinta, '--cifra-max': '28px' }}>{valor}</span></span>
      <span className="text-[13px] truncate" style={{ color: C.gris }}>{nota}</span>
    </div>
  )
}
