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

// La vansita de Maissy: la Chevrolet N400 con la rotulación de Distri Maissy
// (frente y techo blancos, atrás amarilla, franja naranja, ola roja) y la M
// roja en cursiva con borde oscuro, como el logo.
export const VAN_SVG = `<svg width="64" height="40" viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs><clipPath id="carroceria-maissy"><path d="M6 6H40L50 15L57 17.5Q60 18.6 60 21.2V30Q60 32 58 32H6Q4 32 4 30V8Q4 6 6 6Z"/></clipPath></defs>
  <ellipse cx="32" cy="37" rx="27" ry="2.6" fill="#1C1B19" opacity=".18"/>
  <g clip-path="url(#carroceria-maissy)">
    <rect x="0" y="0" width="64" height="40" fill="#FFFFFF"/>
    <path d="M0 0H33C29 12 32 24 27 40H0Z" fill="#F5B21E"/>
    <path d="M33 0H38C34 12 37 25 32 40H27C32 24 29 12 33 0Z" fill="#E8892B"/>
    <path d="M38 0H42C38 12 41 26 36 40H32C37 25 34 12 38 0Z" fill="#C8232C"/>
    <path d="M0 23C9 21 17 26 27 33L27 40H0Z" fill="#C8232C"/>
    <path d="M44 22C50 21 56 20 64 18.5V22C56 23.5 50 24.5 44 25.5Z" fill="#C8232C"/>
  </g>
  <path d="M6 6H40L50 15L57 17.5Q60 18.6 60 21.2V30Q60 32 58 32H6Q4 32 4 30V8Q4 6 6 6Z" fill="none" stroke="#1C1B19" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M41 8.6L48.6 15.6H41Z" fill="#2B3440" stroke="#1C1B19" stroke-width="1" stroke-linejoin="round"/>
  <path d="M41 8.6V31" stroke="#1C1B19" stroke-width=".9" opacity=".55"/>
  <rect x="55.6" y="19.6" width="3.6" height="2.4" rx="1" fill="#F2B21B" stroke="#1C1B19" stroke-width=".7"/>
  <g transform="translate(11.5 9.5)" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1.5 12.5C2.6 8.4 4 3.6 5.6 2.6C6.8 1.9 6.2 7.2 6.9 8.6C8.2 6.6 9.7 2.4 11.3 2.4C12.6 2.4 11.4 8.4 11.6 11.6" stroke="#1C1B19" stroke-width="3.4"/>
    <path d="M1.5 12.5C2.6 8.4 4 3.6 5.6 2.6C6.8 1.9 6.2 7.2 6.9 8.6C8.2 6.6 9.7 2.4 11.3 2.4C12.6 2.4 11.4 8.4 11.6 11.6" stroke="#C8232C" stroke-width="2"/>
  </g>
  <circle cx="15" cy="32" r="5" fill="#1C1B19"/><circle cx="15" cy="32" r="2.2" fill="#C9CCD1"/>
  <circle cx="49" cy="32" r="5" fill="#1C1B19"/><circle cx="49" cy="32" r="2.2" fill="#C9CCD1"/>
</svg>`

// Para ubicar un cliente a mano: onClicMapa recibe { lat, lng } del punto tocado
// y marca es el punto que se esta escogiendo (se dibuja como alfiler rojo).
export default function MapaRuta({ paradas = [], seleccion, onSeleccion, yo, van, recorrido, alto = 360, onClicMapa, marca }) {
  const caja = useRef(null)
  const mapa = useRef(null)
  const capas = useRef(null)
  const leaflet = useRef(null)
  const encuadrado = useRef(false)
  // Lo último que llegó por props: el mapa carga después del primer render.
  const actual = useRef({})
  actual.current = { paradas, seleccion, onSeleccion, yo, van, recorrido, onClicMapa, marca }

  useEffect(() => {
    let vivo = true
    import('leaflet').then(({ default: L }) => {
      if (!vivo || !caja.current || mapa.current) return
      leaflet.current = L
      mapa.current = L.map(caja.current, { zoomControl: true, attributionControl: true }).setView([6.2442, -75.5812], 13)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(mapa.current)
      capas.current = L.layerGroup().addTo(mapa.current)
      mapa.current.on('click', (e) => actual.current.onClicMapa?.({ lat: e.latlng.lat, lng: e.latlng.lng }))
      dibujar()
    })
    return () => { vivo = false; if (mapa.current) { mapa.current.remove(); mapa.current = null } }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const dibujar = () => {
    const L = leaflet.current
    if (!L || !mapa.current) return
    const { paradas, seleccion, onSeleccion, yo, van, recorrido, marca } = actual.current
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
    if (marca?.lat != null) {
      const html = '<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M15 39C15 39 28 23.5 28 14A13 13 0 0 0 2 14C2 23.5 15 39 15 39Z" fill="#C41230" stroke="#fff" stroke-width="2.5"/><circle cx="15" cy="14" r="5" fill="#fff"/></svg>'
      L.marker([marca.lat, marca.lng], { icon: L.divIcon({ html, className: '', iconSize: [30, 40], iconAnchor: [15, 39] }), zIndexOffset: 3000, title: 'Ubicación escogida' }).addTo(capas.current)
    }
    if (van?.lat != null) {
      L.marker([van.lat, van.lng], { icon: L.divIcon({ html: VAN_SVG, className: '', iconSize: [64, 40], iconAnchor: [32, 36] }), zIndexOffset: 2000, title: van.etiqueta || 'Vehículo' }).addTo(capas.current)
      puntos.push([van.lat, van.lng])
    }
    // Se encuadra una vez (cuando llegan los datos); después el usuario mueve el mapa a su gusto.
    if (!encuadrado.current && puntos.length) {
      mapa.current.fitBounds(L.latLngBounds(puntos).pad(0.15), { maxZoom: 16 })
      encuadrado.current = true
    }
  }

  useEffect(() => { dibujar() }, [paradas, seleccion, yo?.lat, yo?.lng, van?.lat, van?.lng, recorrido, marca?.lat, marca?.lng]) // eslint-disable-line react-hooks/exhaustive-deps

  // Al escoger una parada se centra en ella.
  useEffect(() => {
    const p = paradas.find(x => x.clave === seleccion)
    if (p?.lat != null && mapa.current) mapa.current.panTo([p.lat, p.lng])
  }, [seleccion]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={caja} style={{ height: alto, width: '100%', borderRadius: 18, overflow: 'hidden', background: '#E8E4D8', zIndex: 0, cursor: onClicMapa ? 'crosshair' : undefined }} className="mapa-ruta" role="region" aria-label="Mapa de la ruta" />
}
