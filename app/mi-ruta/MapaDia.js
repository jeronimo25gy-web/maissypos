'use client'
import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { linkComoLlegar } from '@/lib/rutero'

// El rutero del día en el mapa: paradas numeradas con su estado, dónde va el
// vendedor, la siguiente parada, cuánto lleva en ruta y la navegación por
// tramos (Google Maps recibe hasta 10 paradas por vez).
const MapaRuta = dynamic(() => import('@/components/MapaRuta'), { ssr: false, loading: () => <div style={{ height: 360, borderRadius: 18, background: '#E8E4D8' }} /> })
const TINTA = '#1C1B19', GRIS = '#5A5750', FONDO = '#F3F1EA', LINEA = '#E3E1D8'
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const POR_TRAMO = 10
const hora = (d) => d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })
const duracion = (min) => min >= 60 ? `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}` : `${Math.round(min)} min`

// Punto de una parada: el cliente, o el primer apartamento del edificio con ubicación.
const puntoDe = (p) => p.filas.map(f => f.clientes).find(c => c?.lat != null) || null
const nombreDe = (p) => p.edificio?.nombre || p.fila?.clientes?.nombre || 'Cliente'

export default function MapaDia({ paradas, visitas, esHoy, rutaId, onAbrir }) {
  const [seleccion, setSeleccion] = useState(null)
  const [yo, setYo] = useState(null)
  const [tiempos, setTiempos] = useState(null)
  const [ultima, setUltima] = useState(null) // última ubicación guardada hoy, mientras el GPS responde

  // Dónde va el vendedor, mientras el mapa está abierto.
  useEffect(() => {
    if (!esHoy || typeof navigator === 'undefined' || !navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(p => setYo({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}, { enableHighAccuracy: true, maximumAge: 30000 })
    return () => navigator.geolocation.clearWatch(id)
  }, [esHoy])

  useEffect(() => {
    if (!esHoy) return
    supabase.from('ubicaciones_ruta').select('lat, lng').eq('ruta_id', rutaId).eq('fecha', obtenerFechaActual()).eq('empresa_id', getEmpresaId())
      .order('created_at', { ascending: false }).limit(1).maybeSingle().then(({ data }) => setUltima(data || null))
  }, [esHoy, rutaId])

  // Cuánto lleva: desde la primera visita de hoy hasta ahora.
  useEffect(() => {
    if (!esHoy) return
    supabase.from('visitas_ruta').select('created_at').eq('ruta_id', rutaId).eq('fecha', obtenerFechaActual()).eq('empresa_id', getEmpresaId()).order('created_at')
      .then(({ data }) => setTiempos((data || []).map(v => new Date(v.created_at))))
  }, [esHoy, rutaId, Object.keys(visitas).length]) // eslint-disable-line react-hooks/exhaustive-deps

  const lista = useMemo(() => {
    let siguienteMarcada = false
    return paradas.map((p, i) => {
      const filas = p.filas
      const vistas = esHoy ? filas.filter(f => visitas[f.cliente_id]).length : 0
      const compro = esHoy && filas.some(f => visitas[f.cliente_id]?.resultado === 'compro')
      const hecha = esHoy && vistas === filas.length
      let estado = compro && hecha ? 'compro' : hecha ? 'visitado' : 'pendiente'
      if (esHoy && !hecha && !siguienteMarcada) { estado = 'siguiente'; siguienteMarcada = true }
      const c = puntoDe(p)
      return { clave: p.clave, n: i + 1, lat: c?.lat ?? null, lng: c?.lng ?? null, titulo: nombreDe(p), estado, compro, hecha, p, cliente: c || filas[0]?.clientes }
    })
  }, [paradas, visitas, esHoy])

  const siguiente = lista.find(x => x.estado === 'siguiente')
  const elegida = lista.find(x => x.clave === seleccion) || siguiente || lista[0]
  const pendientes = lista.filter(x => !x.hecha)
  const sinUbicacion = pendientes.filter(x => x.lat == null).length
  const conUbicacion = lista.filter(x => x.lat != null).length

  // Tramos de 10 paradas pendientes con ubicación, en orden.
  const tramos = []
  pendientes.filter(x => x.lat != null).forEach((x, i) => { (tramos[Math.floor(i / POR_TRAMO)] = tramos[Math.floor(i / POR_TRAMO)] || []).push(x) })
  const tramo = tramos[0]
  const linkTramo = (t) => {
    const puntos = t.map(x => `${x.lat},${x.lng}`)
    const destino = puntos.pop()
    return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${destino}${puntos.length ? `&waypoints=${encodeURIComponent(puntos.join('|'))}` : ''}`
  }

  // Ritmo: minutos por parada desde la primera visita de hoy.
  const ahora = new Date()
  const enRuta = tiempos?.length ? (ahora - tiempos[0]) / 60000 : 0
  const visitadas = lista.filter(x => x.hecha).length
  const porParada = tiempos?.length >= 3 && visitadas ? enRuta / visitadas : null
  const termina = porParada ? new Date(ahora.getTime() + pendientes.length * porParada * 60000) : null

  const kpi = (et, va) => (
    <div className="bg-white rounded-2xl p-2.5 flex flex-col min-w-0">
      <span className="text-[11.5px] font-bold" style={{ color: GRIS }}>{et}</span>
      <span className="font-extrabold text-[18px] tabular-nums leading-tight" style={titulo}>{va}</span>
    </div>
  )
  const PILL = { compro: ['Compró', '#2E5E3A', '#E6F0E8'], visitado: ['Visitado', GRIS, '#EFEDE6'], siguiente: ['Siguiente', '#C41230', '#FBE9E9'], pendiente: ['Pendiente', GRIS, '#EFEDE6'] }

  return (
    <div className="flex flex-col gap-3">
      {esHoy && (
        <div className="grid grid-cols-3 gap-2">
          {kpi('En ruta', tiempos?.length ? duracion(enRuta) : '—')}
          {kpi('Por parada', porParada ? `${porParada.toLocaleString('es-CO', { maximumFractionDigits: 1 })} min` : '—')}
          {kpi('Termina cerca de', termina ? hora(termina) : '—')}
        </div>
      )}

      <MapaRuta paradas={lista} seleccion={elegida?.clave} onSeleccion={setSeleccion} van={esHoy ? (yo || ultima) : null} alto={380} />
      <p className="text-[12.5px] px-1" style={{ color: GRIS }}>{conUbicacion} de {lista.length} paradas con ubicación. Las demás se ubican solas la primera vez que se visitan, o con "Fijar ubicación aquí" en la ficha del cliente.</p>

      {elegida && (
        <div className="bg-white rounded-2xl p-3 flex flex-col gap-2" style={{ boxShadow: '0 6px 18px rgba(28,27,25,.08)' }}>
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0"><span className="text-[11.5px] font-extrabold uppercase tracking-wider" style={{ color: GRIS }}>Parada {elegida.n}</span><b className="block text-[16px] leading-snug">{elegida.titulo}</b></span>
            {esHoy && <span className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full" style={{ color: PILL[elegida.estado][1], background: PILL[elegida.estado][2] }}>{PILL[elegida.estado][0]}</span>}
          </div>
          <span className="text-[13px]" style={{ color: GRIS }}>{[elegida.p.edificio?.direccion || elegida.cliente?.direccion, elegida.p.filas.length > 1 ? `${elegida.p.filas.length} clientes` : null, elegida.lat == null ? 'sin ubicación en el mapa' : null].filter(Boolean).join(' · ') || 'Sin dirección'}</span>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => onAbrir(elegida.p)} className="min-h-[48px] rounded-xl font-bold text-sm text-white bg-brand">Abrir en la lista</button>
            <a href={elegida.lat != null ? `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${elegida.lat},${elegida.lng}` : linkComoLlegar(elegida.cliente || {})} target="_blank" rel="noreferrer"
              className="min-h-[48px] rounded-xl font-bold text-sm flex items-center justify-center" style={{ background: FONDO }}>Cómo llegar</a>
          </div>
        </div>
      )}

      {esHoy && tramo && (
        <>
          <a href={linkTramo(tramo)} target="_blank" rel="noreferrer" className="min-h-[54px] rounded-2xl font-bold text-[15.5px] text-white flex items-center justify-center text-center px-3" style={{ background: TINTA }}>
            Navegar {tramo.length === 1 ? `a la parada ${tramo[0].n}` : `paradas ${tramo[0].n} a ${tramo[tramo.length - 1].n}`}
          </a>
          <p className="text-[12.5px] text-center -mt-1" style={{ color: GRIS }}>Abre Google Maps con {tramo.length} {tramo.length === 1 ? 'parada' : 'paradas'} en orden{tramos.length > 1 ? ` · después quedan ${tramos.length - 1} ${tramos.length - 1 === 1 ? 'tramo' : 'tramos'}` : ''}{sinUbicacion ? ` · ${sinUbicacion} sin ubicación se ven en la lista` : ''}</p>
        </>
      )}
      {esHoy && !pendientes.length && lista.length > 0 && <p className="text-center font-bold py-2" style={{ color: '#2E5E3A' }}>Todas las paradas del día están visitadas.</p>}
      {!lista.length && <p className="text-center py-6" style={{ color: GRIS }}>Este día no tiene paradas.</p>}
      <div className="h-2" style={{ borderColor: LINEA }} />
    </div>
  )
}
