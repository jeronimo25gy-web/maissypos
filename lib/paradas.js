// Paradas del rutero: los clientes de un mismo edificio se ven juntos como una
// sola parada (en el puesto del primero de ellos) con sus apartamentos
// adentro; casas, tiendas y clientes sin edificio son una parada cada uno.
// Lo usan Rutas (admin) y Mi ruta (vendedor), así los dos ven lo mismo.

// filas: filas del rutero del día en orden, con clientes(...edificio_id).
// edificios: { id: edificio }.
export function armarParadas(filas, edificios = {}) {
  const paradas = []
  const porEdificio = {}
  filas.forEach(f => {
    const eid = f.clientes?.edificio_id
    if (eid && edificios[eid]) {
      if (!porEdificio[eid]) { porEdificio[eid] = { tipo: 'edificio', clave: 'e' + eid, edificio: edificios[eid], filas: [] }; paradas.push(porEdificio[eid]) }
      porEdificio[eid].filas.push(f)
    } else paradas.push({ tipo: 'cliente', clave: 'f' + f.id, fila: f, filas: [f] })
  })
  // Dentro del edificio: el portero primero y después por número de apto.
  paradas.filter(p => p.tipo === 'edificio').forEach(p => p.filas.sort((a, b) => pesoApto(a.clientes) - pesoApto(b.clientes) || String(a.clientes?.apto || '').localeCompare(String(b.clientes?.apto || ''), 'es', { numeric: true })))
  return paradas
}
const pesoApto = (c) => (/porter/i.test(c?.apto || '') || /porter/i.test(c?.nombre || '') ? 0 : 1)

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
