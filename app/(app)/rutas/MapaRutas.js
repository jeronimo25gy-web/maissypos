'use client'
import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { DIAS } from '@/lib/rutero'
import { armarParadas } from '@/lib/paradas'

// Rutas > Mapa: las paradas del día en el mapa, la vansita donde va el
// vendedor (ubicación del celular mientras Mi ruta está abierta), el
// recorrido de hoy y los tiempos reales de los últimos días iguales.
const MapaRuta = dynamic(() => import('@/components/MapaRuta'), { ssr: false, loading: () => <div style={{ height: 460, borderRadius: 18, background: '#E8E4D8' }} /> })
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: 'var(--hoja)', linea: '#E3E1D8', suave: '#EFEDE6', verde: '#2E5E3A', verdeF: '#E6F0E8', rojo: 'var(--rojo)', rojoF: 'var(--rojo-suave)' }
const hora = (iso) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })
const hace = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : `hace ${Math.floor(m / 60)} h ${m % 60} min` }
const diaDe = (fecha) => { const d = new Date(fecha + 'T12:00:00').getDay(); return d === 0 ? 7 : d }

export default function MapaRutas({ rutaId, filas, edificios, dia, setDia, vendedor }) {
  const [hoyDatos, setHoyDatos] = useState({ visitas: {}, ubic: [] })
  const [historial, setHistorial] = useState([])
  const [seleccion, setSeleccion] = useState(null)
  // Ubicar a mano desde la oficina: se escoge la parada, se toca el punto exacto y se guarda.
  const [ubicando, setUbicando] = useState(null) // clave de la parada
  const [marca, setMarca] = useState(null)
  const [ubicados, setUbicados] = useState({}) // cliente_id -> { lat, lng } guardados en esta sesion
  const [guardandoUbic, setGuardandoUbic] = useState(false)
  const hoy = obtenerFechaActual()
  const esHoy = diaDe(hoy) === dia

  useEffect(() => {
    const empresaId = getEmpresaId()
    const desde = new Date(Date.now() - 35 * 864e5).toLocaleDateString('en-CA')
    const cargar = async () => {
      const [{ data: vis }, { data: ubic }, { data: hist }] = await Promise.all([
        supabase.from('visitas_ruta').select('cliente_id, resultado, created_at, lat, lng').eq('ruta_id', rutaId).eq('fecha', hoy).eq('empresa_id', empresaId),
        supabase.from('ubicaciones_ruta').select('lat, lng, created_at').eq('ruta_id', rutaId).eq('fecha', hoy).eq('empresa_id', empresaId).order('created_at'),
        supabase.from('visitas_ruta').select('fecha, created_at').eq('ruta_id', rutaId).gte('fecha', desde).in('resultado', ['compro', 'no_compro', 'no_estaba']).eq('empresa_id', empresaId),
      ])
      setHoyDatos({ visitas: Object.fromEntries((vis || []).map(v => [v.cliente_id, v])), visitasLista: vis || [], ubic: ubic || [] })
      setHistorial(hist || [])
    }
    cargar()
    const t = setInterval(cargar, 120000)
    return () => clearInterval(t)
  }, [rutaId]) // eslint-disable-line react-hooks/exhaustive-deps

  const paradas = useMemo(() => armarParadas(filas.filter(f => f.dia_semana === dia && f.clientes?.estado !== false).sort((a, b) => a.orden - b.orden), edificios), [filas, dia, edificios])
  const lista = paradas.map((p, i) => {
    const c = p.filas.map(f => ubicados[f.cliente_id] || f.clientes).find(x => x?.lat != null)
    const vistas = esHoy ? p.filas.filter(f => hoyDatos.visitas[f.cliente_id]).length : 0
    const compro = esHoy && p.filas.some(f => hoyDatos.visitas[f.cliente_id]?.resultado === 'compro')
    const hecha = esHoy && vistas === p.filas.length
    return { clave: p.clave, n: i + 1, lat: c?.lat ?? null, lng: c?.lng ?? null, titulo: p.edificio?.nombre || p.fila?.clientes?.nombre || 'Cliente', estado: compro && hecha ? 'compro' : hecha ? 'visitado' : 'pendiente', p, filas: p.filas.length }
  })

  // La vansita: la última ubicación del celular hoy (o la última visita con GPS).
  const ultimaUbic = hoyDatos.ubic[hoyDatos.ubic.length - 1]
  const ultimaVisita = (hoyDatos.visitasLista || []).filter(v => v.lat != null).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  const posicion = ultimaUbic || ultimaVisita
  const van = esHoy && posicion ? { lat: posicion.lat, lng: posicion.lng, etiqueta: `${vendedor || 'Vehículo'} · ${hace(posicion.created_at)}` } : null
  const recorrido = esHoy ? hoyDatos.ubic.map(u => [u.lat, u.lng]) : null

  // Tiempos reales: los últimos días iguales a este.
  const dias = Object.values(historial.reduce((m, v) => {
    if (diaDe(v.fecha) !== dia) return m
    const x = (m[v.fecha] = m[v.fecha] || { fecha: v.fecha, n: 0, primera: v.created_at, ultima: v.created_at })
    x.n++; if (v.created_at < x.primera) x.primera = v.created_at; if (v.created_at > x.ultima) x.ultima = v.created_at
    return m
  }, {})).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5)

  const elegida = lista.find(x => x.clave === seleccion)
  const sinUbicacion = lista.filter(x => x.lat == null)
  const empezarUbicar = (x) => { setSeleccion(x.clave); setUbicando(x.clave); setMarca(x.lat != null ? { lat: x.lat, lng: x.lng } : null) }
  const cancelarUbicar = () => { setUbicando(null); setMarca(null) }
  // Queda como ubicacion manual: el sistema ya no la cambia con las visitas.
  const guardarUbicacion = async () => {
    const x = lista.find(y => y.clave === ubicando)
    if (!x || !marca) return
    setGuardandoUbic(true)
    const ids = x.p.filas.map(f => f.cliente_id)
    const { error } = await supabase.from('clientes').update({ lat: marca.lat, lng: marca.lng, ubicacion_fuente: 'manual', ubicacion_at: new Date().toISOString() })
      .in('id', ids).eq('empresa_id', getEmpresaId())
    setGuardandoUbic(false)
    if (error) { alert('No fue posible guardar la ubicación: ' + error.message); return }
    setUbicados(u => ({ ...u, ...Object.fromEntries(ids.map(id => [id, { lat: marca.lat, lng: marca.lng }])) }))
    cancelarUbicar()
  }
  const conUbic = lista.filter(x => x.lat != null).length
  const visitadas = lista.filter(x => x.estado !== 'pendiente').length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-1 rounded-full p-1 flex-wrap" style={{ background: C.fondo }} role="group" aria-label="Día">
          {DIAS.map(d => <button key={d.n} type="button" aria-pressed={d.n === dia} onClick={() => { setDia(d.n); setSeleccion(null) }} className="rounded-full min-h-[36px] px-3 text-[13.5px] font-bold"
            style={d.n === dia ? { background: '#fff', boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { color: C.gris }}>{d.corto}</button>)}
        </div>
        <span className="text-[13px]" style={{ color: C.gris }}>{conUbic} de {lista.length} paradas con ubicación{esHoy ? ` · ${visitadas} visitadas` : ''}</span>
      </div>

      {esHoy && (
        <div className="rounded-2xl px-3 py-2.5 text-sm flex flex-wrap gap-x-4 gap-y-1" style={{ background: van ? C.verdeF : C.suave, color: van ? C.verde : C.gris }}>
          {van ? <><b>{vendedor || 'El vendedor'} · {hace(posicion.created_at)}</b><span>Ubicación del celular con Mi ruta abierta{hoyDatos.ubic.length > 1 ? ` · recorrido desde las ${hora(hoyDatos.ubic[0].created_at)}` : ''}</span></> : <span>Sin ubicación hoy</span>}
        </div>
      )}

      {ubicando && (
        <div className="rounded-2xl px-3 py-2.5 text-sm flex flex-wrap gap-2 items-center justify-between" style={{ background: '#FFF4CC', color: '#5C3D00' }}>
          <span><b>Ubicar {lista.find(x => x.clave === ubicando)?.titulo}:</b> {marca ? 'verifique el alfiler y guarde, o toque otro punto para moverlo.' : 'toque en el mapa el punto exacto de la entrada.'}</span>
          <span className="flex gap-2">
            <button type="button" onClick={cancelarUbicar} className="min-h-[38px] px-3 rounded-xl font-bold bg-white">Cancelar</button>
            <button type="button" onClick={guardarUbicacion} disabled={!marca || guardandoUbic} className="min-h-[38px] px-3 rounded-xl font-bold text-white disabled:opacity-50" style={{ background: C.tinta }}>{guardandoUbic ? 'Guardando…' : 'Guardar ubicación'}</button>
          </span>
        </div>
      )}

      <MapaRuta paradas={lista} seleccion={seleccion} onSeleccion={ubicando ? undefined : setSeleccion} van={van} recorrido={recorrido} alto={460}
        onClicMapa={ubicando ? setMarca : undefined} marca={ubicando ? marca : null} />

      {elegida && (
        <div className="rounded-2xl p-3 flex flex-wrap justify-between gap-2 items-center" style={{ boxShadow: `inset 0 0 0 1.5px ${C.linea}` }}>
          <span><b>{elegida.n} · {elegida.titulo}</b><br /><span className="text-[13px]" style={{ color: C.gris }}>{[elegida.p.edificio?.direccion || elegida.p.fila?.clientes?.direccion, elegida.filas > 1 ? `${elegida.filas} clientes` : null, elegida.lat == null ? 'sin ubicación' : null].filter(Boolean).join(' · ')}</span></span>
          {!ubicando && <button type="button" onClick={() => empezarUbicar(elegida)} className="min-h-[38px] px-3 rounded-xl font-bold text-sm" style={{ background: C.suave }}>{elegida.lat == null ? 'Ubicar en el mapa' : 'Corregir ubicación'}</button>}
          {esHoy && <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={elegida.estado === 'compro' ? { background: C.verdeF, color: C.verde } : { background: C.suave, color: C.gris }}>{elegida.estado === 'compro' ? 'Compró' : elegida.estado === 'visitado' ? 'Visitado' : 'Pendiente'}</span>}
        </div>
      )}

      {sinUbicacion.length > 0 && !ubicando && (
        <div className="flex flex-col gap-1.5">
          <b>Paradas sin ubicación · {sinUbicacion.length}</b>
          <div className="flex flex-wrap gap-1.5">
            {sinUbicacion.map(x => (
              <button key={x.clave} type="button" onClick={() => empezarUbicar(x)} className="text-left rounded-xl px-3 py-2 text-[13px]" style={{ background: C.suave }}>
                <b>{x.n} · {x.titulo}</b>
                <span className="block" style={{ color: C.gris }}>{x.p.edificio?.direccion || x.p.fila?.clientes?.direccion || 'Sin dirección'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <b>Tiempos de los últimos {DIAS.find(d => d.n === dia)?.nombre.toLowerCase()}</b>
        {dias.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px] tabular-nums">
              <thead><tr className="text-left text-xs uppercase tracking-wide" style={{ color: C.gris }}><th className="py-2 pr-2">Día</th><th className="py-2 pr-2 text-right">Visitas</th><th className="py-2 pr-2 text-right">Primera</th><th className="py-2 pr-2 text-right">Última</th><th className="py-2 pr-2 text-right">En ruta</th><th className="py-2 text-right">Por parada</th></tr></thead>
              <tbody>
                {dias.map(d => {
                  const min = (new Date(d.ultima) - new Date(d.primera)) / 60000
                  return (
                    <tr key={d.fecha} className="border-t" style={{ borderColor: C.linea }}>
                      <td className="py-2 pr-2">{new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                      <td className="py-2 pr-2 text-right">{d.n}</td>
                      <td className="py-2 pr-2 text-right">{hora(d.primera)}</td>
                      <td className="py-2 pr-2 text-right">{hora(d.ultima)}</td>
                      <td className="py-2 pr-2 text-right">{(min / 60).toLocaleString('es-CO', { maximumFractionDigits: 1 })} h</td>
                      <td className="py-2 text-right">{d.n > 1 ? `${(min / d.n).toLocaleString('es-CO', { maximumFractionDigits: 1 })} min` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <span className="text-[13px]" style={{ color: C.gris }}>Sin visitas este día</span>}
      </div>
    </div>
  )
}
