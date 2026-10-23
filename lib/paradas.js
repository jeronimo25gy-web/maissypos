// Paradas del rutero: los clientes de un mismo edificio se ven juntos como una
// sola parada (en el puesto del primero de ellos) con sus apartamentos
// adentro; casas, tiendas y clientes sin edificio son una parada cada uno.
// El punto de venta es una parada con un solo cliente en el rutero (el ancla,
// tipo_inmueble 'punto'); sus clientes se cargan aparte.
// Lo usan Rutas (admin) y Mi ruta (vendedor), así los dos ven lo mismo.

// filas: filas del rutero del día en orden, con clientes(...edificio_id).
// edificios: { id: edificio }.
export function armarParadas(filas, edificios = {}) {
  const paradas = []
  const porEdificio = {}
  filas.forEach(f => {
    const eid = f.clientes?.edificio_id
    if (eid && edificios[eid]) {
      const punto = edificios[eid].tipo === 'punto'
      if (!porEdificio[eid]) { porEdificio[eid] = { tipo: punto ? 'punto' : 'edificio', clave: (punto ? 'p' : 'e') + eid, edificio: edificios[eid], filas: [] }; paradas.push(porEdificio[eid]) }
      porEdificio[eid].filas.push(f)
    } else paradas.push({ tipo: 'cliente', clave: 'f' + f.id, fila: f, filas: [f] })
  })
  // Dentro del edificio: el portero primero y después por número de apto.
  // Por torre (las que tienen varias), y en cada torre el portero primero y los apartamentos por número.
  const cmp = (x, y) => String(x || '').localeCompare(String(y || ''), 'es', { numeric: true })
  paradas.filter(p => p.tipo === 'edificio').forEach(p => p.filas.sort((a, b) => pesoApto(a.clientes) - pesoApto(b.clientes) || cmp(a.clientes?.torre, b.clientes?.torre) || cmp(a.clientes?.apto, b.clientes?.apto)))
  return paradas
}
// Portero primero, después los apartamentos y al final los que no tienen número.
const pesoApto = (c) => (/porter/i.test(c?.apto || '') || /porter/i.test(c?.nombre || '') ? 0 : String(c?.apto || '').trim() ? 1 : 2)

// Apartamentos de una parada agrupados por torre: [[torre, filas]]. Sin torres, un solo grupo con torre ''.
export function porTorre(filas) {
  const g = []
  filas.forEach(f => { const t = (f.clientes?.torre || '').trim(); const x = g.find(([n]) => n === t); if (x) x[1].push(f); else g.push([t, [f]]) })
  return g
}
export const nombreTorre = (t) => !t ? 'Sin torre' : /^\d+$/.test(t) ? `Torre ${t}` : t

// Orden plano del rutero a partir de las paradas (para guardar con reordenar_rutero).
export const ordenDeParadas = (paradas) => paradas.flatMap(p => p.filas.map(f => f.id))

// Nombre sin apellido del cliente; los apartamentos creados sin nombre se
// llamaban "Edificio X · 302": esos no tienen nombre todavía.
export function primerNombre(c) {
  const n = (c?.nombre || '').trim()
  if (!n || n.includes(' · ') || (c?.edificio && n.toLowerCase().startsWith(String(c.edificio).toLowerCase()))) return null
  if (/^(don|doña|dona|sra|sr|señora|señor)\.?\s/i.test(n)) return n.split(/\s+/).slice(0, 2).join(' ')
  return n.split(/\s+/)[0]
}

// Lo que se ve en el chip del apartamento: "302 · Carlos", "Portero · Luis".
export function etiquetaApto(c) {
  const nombre = primerNombre(c)
  const apto = /porter/i.test(c?.apto || '') || /porter/i.test(c?.nombre || '') ? 'Portero' : (c?.apto || 'Sin apto')
  return nombre ? `${apto} · ${nombre}` : `${apto} · Sin nombre`
}

export const FRECUENCIA_OBSEQUIO = { visita: 'Cada visita', semana: '1 vez por semana', mes: '1 vez al mes' }

// Desde qué fecha cuenta la frecuencia del obsequio (para no darlo dos veces).
export function desdeFrecuencia(frecuencia, hoy) {
  if (frecuencia === 'mes') return hoy.slice(0, 8) + '01'
  if (frecuencia === 'semana') { const d = new Date(hoy + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toLocaleDateString('en-CA') }
  return hoy
}

// Puntos de venta: el cliente ancla representa el punto en el rutero y recibe las ventas sueltas.
export const esAncla = (c) => c?.tipo_inmueble === 'punto'
// "9:30 a. m." a partir de "09:30:00".
export const horaCorta = (t) => t ? new Date('2000-01-01T' + t).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) : ''
export const horarioPunto = (e) => [e?.hora_llegada ? `llega ${horaCorta(e.hora_llegada)}` : null, e?.hora_salida ? `sale ${horaCorta(e.hora_salida)}` : null].filter(Boolean).join(' · ')
