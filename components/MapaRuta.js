'use client'
import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'

// Mapa de la ruta (OpenStreetMap, sin claves): las paradas numeradas con el
// color de cómo van, el punto del vendedor, la vansita de Maissy y el
// recorrido del día. Lo usan Mi ruta y Rutas.
// paradas: [{ clave, n, lat, lng, titulo, estado: 'pendiente'|'compro'|'visitado'|'siguiente' }]
const COLOR = {
  compro: { fondo: '#2E5E3A', texto: '#fff', borde: '#fff' },
  visitado: { fondo: '#5A5750', texto: '#fff', borde: '#fff' },
  pendiente: { fondo: '#fff', texto: '#1C1B19', borde: '#1C1B19' },
  siguiente: { fondo: '#C41230', texto: '#fff', borde: '#fff' },
}

const pin = (n, estado, elegido) => {
  const c = COLOR[estado] || COLOR.pendiente
  const t = estado === 'siguiente' || elegido ? 30 : 24
  return `<div style="width:${t}px;height:${t}px;border-radius:50%;background:${c.fondo};color:${c.texto};border:${elegido ? 3 : 2}px solid ${elegido ? '#F2B21B' : c.borde};display:flex;align-items:center;justify-content:center;font:800 ${n > 99 ? 10 : 11.5}px Figtree,system-ui,sans-serif;box-shadow:0 1px 4px rgba(28,27,25,.35)">${n}</div>`
}

// La vansita de Maissy: carrocería blanca, franja roja y la M amarilla.
export const VAN_SVG = `<svg width="54" height="34" viewBox="0 0 54 34" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="27" cy="31" rx="22" ry="2.6" fill="#1C1B19" opacity=".18"/>
  <path d="M4 7.5a3 3 0 0 1 3-3h25a3 3 0 0 1 3 3V10h6.4a3 3 0 0 1 2.3 1.1l5.2 6.3a3 3 0 0 1 .7 1.9V25a2.5 2.5 0 0 1-2.5 2.5H6.5A2.5 2.5 0 0 1 4 25z" fill="#fff" stroke="#1C1B19" stroke-width="1.6"/>
  <path d="M36 12.5h5.1l4.6 5.7H36z" fill="#CFE0E8" stroke="#1C1B19" stroke-width="1.2"/>
  <rect x="4.8" y="15.5" width="30.4" height="5" fill="#C41230"/>
  <circle cx="13" cy="10.2" r="3.6" fill="#F2B21B"/>
  <path d="M11 12V8.6l2 2.3 2-2.3V12" fill="none" stroke="#1C1B19" stroke-width="1.3" stroke-linejoin="round"/>
  <circle cx="14" cy="27.5" r="4.2" fill="#1C1B19"/><circle cx="14" cy="27.5" r="1.7" fill="#F2B21B"/>
  <circle cx="40" cy="27.5" r="4.2" fill="#1C1B19"/><circle cx="40" cy="27.5" r="1.7" fill="#F2B21B"/>
</svg>`

export default function MapaRuta({ paradas = [], seleccion, onSeleccion, yo, van, recorrido, alto = 360 }) {
  const caja = useRef(null)
  const mapa = useRef(null)
  const capas = useRef(null)
  const leaflet = useRef(null)
  const encuadrado = useRef(false)
  // Lo último que llegó por props: el mapa carga después del primer render.
  const actual = useRef({})
  actual.current = { paradas, seleccion, onSeleccion, yo, van, recorrido }

  useEffect(() => {
    let vivo = true
    import('leaflet').then(({ default: L }) => {
      if (!vivo || !caja.current || mapa.current) return
      leaflet.current = L
      mapa.current = L.map(caja.current, { zoomControl: true, attributionControl: true }).setView([6.2442, -75.5812], 13)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(mapa.current)
      capas.current = L.layerGroup().addTo(mapa.current)
      dibujar()
    })
    return () => { vivo = false; if (mapa.current) { mapa.current.remove(); mapa.current = null } }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const dibujar = () => {
    const L = leaflet.current
    if (!L || !mapa.current) return
    const { paradas, seleccion, onSeleccion, yo, van, recorrido } = actual.current
    capas.current.clearLayers()
    if (recorrido?.length > 1) L.polyline(recorrido, { color: '#C41230', weight: 3, opacity: 0.7, dashArray: '6 6' }).addTo(capas.current)
    const puntos = []
    paradas.forEach(p => {
      if (p.lat == null || p.lng == null) return
      const elegido = p.clave === seleccion
      const t = p.estado === 'siguiente' || elegido ? 30 : 24
      const m = L.marker([p.lat, p.lng], { icon: L.divIcon({ html: pin(p.n, p.estado, elegido), className: '', iconSize: [t, t], iconAnchor: [t / 2, t / 2] }), zIndexOffset: elegido ? 1000 : p.estado === 'siguiente' ? 900 : 0, title: p.titulo })
      if (onSeleccion) m.on('click', () => onSeleccion(p.clave))
      m.addTo(capas.current)
      puntos.push([p.lat, p.lng])
    })
    if (yo?.lat != null) {
      L.circleMarker([yo.lat, yo.lng], { radius: 7, color: '#fff', weight: 3, fillColor: '#2A78D6', fillOpacity: 1 }).addTo(capas.current)
      puntos.push([yo.lat, yo.lng])
    }
    if (van?.lat != null) {
      L.marker([van.lat, van.lng], { icon: L.divIcon({ html: VAN_SVG, className: '', iconSize: [54, 34], iconAnchor: [27, 30] }), zIndexOffset: 2000, title: van.etiqueta || 'Vehículo' }).addTo(capas.current)
      puntos.push([van.lat, van.lng])
    }
    // Se encuadra una vez (cuando llegan los datos); después el usuario mueve el mapa a su gusto.
    if (!encuadrado.current && puntos.length) {
      mapa.current.fitBounds(L.latLngBounds(puntos).pad(0.15), { maxZoom: 16 })
      encuadrado.current = true
    }
  }

  useEffect(() => { dibujar() }, [paradas, seleccion, yo?.lat, yo?.lng, van?.lat, van?.lng, recorrido]) // eslint-disable-line react-hooks/exhaustive-deps

  // Al escoger una parada se centra en ella.
  useEffect(() => {
    const p = paradas.find(x => x.clave === seleccion)
    if (p?.lat != null && mapa.current) mapa.current.panTo([p.lat, p.lng])
  }, [seleccion]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={caja} style={{ height: alto, width: '100%', borderRadius: 18, overflow: 'hidden', background: '#E8E4D8', zIndex: 0 }} className="mapa-ruta" role="region" aria-label="Mapa de la ruta" />
}
