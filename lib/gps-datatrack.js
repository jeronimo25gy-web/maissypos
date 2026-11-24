// Conexión con el GPS de Datatrack (plataforma Wialon). Solo corre en el
// servidor: el token vive en DATATRACK_TOKEN y nunca llega a los equipos.
// Todas las llamadas van al mismo endpoint y se distinguen por svc; un error
// llega como { error: N } (1 = sesión vencida: se vuelve a entrar una vez).
const URL_API = 'https://api.datatrack.app/wialon/ajax.html'

let sesion = null // { sid, hasta, gis: { render, geocode, sid, uid } }

async function llamarSin(svc, params, sid) {
  const q = new URLSearchParams({ svc, params: JSON.stringify(params) })
  if (sid) q.set('sid', sid)
  const r = await fetch(URL_API, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: q.toString(), cache: 'no-store' })
  return r.json()
}

async function entrar() {
  const token = (process.env.DATATRACK_TOKEN || '').trim()
  if (!token) throw new Error('Falta el token del GPS (DATATRACK_TOKEN)')
  const j = await llamarSin('token/login', { token })
  if (j?.error) throw new Error(`El GPS no dejó entrar (error ${j.error})`)
  // La sesión se cae por inactividad a los ~5 minutos.
  sesion = { sid: j.eid, hasta: Date.now() + 4 * 60 * 1000, gis: { render: j.gis_render, geocode: j.gis_geocode, sid: j.gis_sid, uid: j.user?.id } }
  return sesion.sid
}

async function llamar(svc, params) {
  let sid = sesion && sesion.hasta > Date.now() ? sesion.sid : await entrar()
  let j = await llamarSin(svc, params, sid)
  if (j?.error === 1) { sid = await entrar(); j = await llamarSin(svc, params, sid) }
  if (j?.error) throw new Error(j.error === 7 ? 'El GPS no da acceso a esa unidad' : `El GPS respondió error ${j.error}`)
  sesion.hasta = Date.now() + 4 * 60 * 1000
  return j
}

// Mapa del GPS (Wialon): plantilla de teselas para Leaflet. Wialon numera el
// acercamiento al revés (17 - z), por eso zoomReverse con maxZoom 17.
export function mapaGps() {
  const g = sesion?.gis
  if (!g?.render || !g?.sid) return null
  return { url: `${g.render.replace(/\/$/, '')}/gis_render/{x}_{y}_{z}/${g.uid}/tile.png?sid=${g.sid}`, maxZoom: 17, zoomReverse: true, atribucion: '© Gurtam Maps' }
}

// Direcciones de varias coordenadas en una sola consulta.
export async function direccionesGps(puntos) {
  if (!puntos.length) return []
  if (!sesion?.gis) await entrar()
  const g = sesion.gis
  const coords = JSON.stringify(puntos.map(p => ({ lon: p.lng, lat: p.lat })))
  try {
    const r = await fetch(`${g.geocode.replace(/\/$/, '')}/gis_geocode?coords=${encodeURIComponent(coords)}&flags=1255211008&uid=${g.uid}`, { cache: 'no-store' })
    const j = await r.json()
    // "Carrera 45 48 31, Barranquilla, Departamento…" -> "Carrera 45 # 48-31, Barranquilla"
    return Array.isArray(j) ? j.map(d => String(d || '').split(', ').slice(0, 2).join(', ').replace(/^((?:Calle|Carrera|Avenida|Diagonal|Transversal|Circular)\s+[^\s,]+)\s+(\d+[A-Za-z]?)\s+(\d+)(?=,|$)/i, '$1 # $2-$3')) : puntos.map(() => '')
  } catch { return puntos.map(() => '') }
}

// Todas las unidades que ve el token, con su última posición, odómetro y
// horas de motor (0x1 base, 0x400 última posición, 0x2000 contadores).
export async function unidadesGps() {
  const j = await llamar('core/search_items', { spec: { itemsType: 'avl_unit', propName: 'sys_name', propValueMask: '*', sortType: 'sys_name' }, force: 1, flags: 0x1 | 0x400 | 0x2000, from: 0, to: 0 })
  const lista = (j.items || []).map(u => ({
    id: u.id,
    nombre: u.nm,
    placa: placaDe(u.nm),
    odometro: u.cnm_km ?? u.cnm ?? null,
    horasMotor: u.cneh != null ? Math.round(u.cneh) : null,
    pos: u.pos ? { t: u.pos.t, lat: u.pos.y, lng: u.pos.x, velocidad: u.pos.s, rumbo: u.pos.c, satelites: u.pos.sc } : null,
  }))
  const conPos = lista.filter(u => u.pos)
  const dirs = await direccionesGps(conPos.map(u => u.pos))
  conPos.forEach((u, i) => { u.pos.direccion = dirs[i] || '' })
  return lista
}

// La placa es lo primero del nombre de la unidad ("MTX91D-FABIAN" -> "MTX91D").
export const placaDe = (nombre) => (String(nombre || '').toUpperCase().match(/[A-Z]{3}\s?-?\d{2,3}[A-Z]?/)?.[0] || '').replace(/[\s-]/g, '')

const km = (a, b) => { const R = 6371, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad; const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)) }

// Recorrido de un día (hora Colombia): puntos, kilómetros, salida y llegada,
// tiempo en movimiento, velocidad máxima y paradas de 10 minutos o más.
export async function recorridoGps(unidadId, fecha, { minParada = 10, limiteVelocidad = 60 } = {}) {
  const desde = Math.floor(new Date(fecha + 'T00:00:00-05:00').getTime() / 1000)
  const hasta = Math.min(desde + 86400 - 1, Math.floor(Date.now() / 1000))
  const j = await llamar('messages/load_interval', { itemId: Number(unidadId), timeFrom: desde, timeTo: hasta, flags: 0, flagsMask: 65280, loadCount: 4294967295 })
  const pts = (j.messages || []).filter(m => m.pos && m.pos.y && m.pos.x).map(m => ({ t: m.t, lat: m.pos.y, lng: m.pos.x, v: m.pos.s || 0 }))
  let distancia = 0, movimiento = 0, maxima = 0
  const excesos = []
  for (let i = 1; i < pts.length; i++) {
    const d = km(pts[i - 1], pts[i])
    if (d < 5) distancia += d // saltos raros de la señal no cuentan
    if (pts[i].v > 3) movimiento += pts[i].t - pts[i - 1].t
    maxima = Math.max(maxima, pts[i].v)
    if (pts[i].v > limiteVelocidad && (!excesos.length || pts[i].t - excesos.at(-1).t > 300)) excesos.push({ t: pts[i].t, v: pts[i].v, lat: pts[i].lat, lng: pts[i].lng })
  }
  // Paradas: tramos quieto (<= 3 km/h) de minParada minutos o más.
  const paradas = []
  let ini = null
  for (let i = 0; i <= pts.length; i++) {
    const p = pts[i]
    if (p && p.v <= 3) { if (ini == null) ini = i; continue }
    if (ini != null) {
      const a = pts[ini], b = pts[i - 1]
      if (b.t - a.t >= minParada * 60) paradas.push({ desde: a.t, hasta: b.t, minutos: Math.round((b.t - a.t) / 60), lat: a.lat, lng: a.lng })
      ini = null
    }
  }
  const moviendo = pts.filter(p => p.v > 3)
  // Lo quieto antes de salir y después de llegar es el carro parqueado, no una parada.
  const salida = moviendo[0]?.t || null, llegada = moviendo.at(-1)?.t || null
  const enRuta = paradas.filter(p => salida && p.desde >= salida - 60 && p.hasta <= llegada + 60)
  const dirs = await direccionesGps(enRuta)
  enRuta.forEach((p, i) => { p.direccion = dirs[i] || '' })
  return {
    puntos: pts.length,
    trazo: pts.filter((p, i) => i === 0 || i === pts.length - 1 || i % 2 === 0).map(p => [p.lat, p.lng]),
    km: Math.round(distancia * 10) / 10,
    movimientoMin: Math.round(movimiento / 60),
    velocidadMax: maxima,
    salida,
    llegada,
    paradas: enRuta,
    excesos,
    limiteVelocidad,
  }
}
