const soloDigitos = (s) => (s || '').replace(/\D/g, '')
const sumarDias = (fecha, dias) => {
  const d = new Date(fecha + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  return d.toLocaleDateString('en-CA')
}

// Cruza las transferencias por verificar con las entradas leidas del banco.
// Primero las que coinciden por referencia + valor (fuerte), despues por
// valor en la ventana de fechas (debil, la mas cercana en fecha). Cada
// movimiento del banco se usa una sola vez.
export function cruzarConMovimientos(pendientes, entradas, hoy) {
  const usados = new Set()
  const propuestas = []
  const restantes = []
  // El cliente transfiere el dia de la ruta: en el banco aparece ese dia o
  // a mas tardar unos dias despues (fines de semana, interbancarias).
  const ventanaOk = (t, m) => !m.fecha || (m.fecha >= sumarDias(t.fecha, -1) && m.fecha <= sumarDias(t.fecha, 3) && m.fecha <= hoy)
  const mismoValor = (t, m) => Math.abs(Number(t.valor) - Number(m.valor)) < 1
  const refCoincide = (t, m) => {
    const ref = soloDigitos(t.referencia)
    if (ref.length < 4) return false
    const fin = ref.slice(-6)
    return soloDigitos(m.referencia).includes(fin) || soloDigitos(m.descripcion).includes(fin)
  }
  const ordenadas = [...pendientes].sort((a, b) => a.fecha.localeCompare(b.fecha))
  for (const t of ordenadas) {
    let idx = entradas.findIndex((m, i) => !usados.has(i) && mismoValor(t, m) && ventanaOk(t, m) && refCoincide(t, m))
    let fuerza = 'referencia'
    if (idx < 0) {
      const candidatos = entradas.map((m, i) => ({ m, i })).filter(({ m, i }) => !usados.has(i) && mismoValor(t, m) && ventanaOk(t, m))
      candidatos.sort((a, b) => Math.abs(new Date(a.m.fecha || t.fecha) - new Date(t.fecha)) - Math.abs(new Date(b.m.fecha || t.fecha) - new Date(t.fecha)))
      idx = candidatos.length ? candidatos[0].i : -1
      fuerza = candidatos.length > 1 ? 'valor_varios' : 'valor'
    }
    if (idx >= 0) {
      usados.add(idx)
      propuestas.push({ transferencia: t, movimiento: entradas[idx], fuerza, marcada: true })
    } else {
      restantes.push(t)
    }
  }
  return { propuestas, restantes, sinUsar: entradas.filter((_, i) => !usados.has(i)) }
}
