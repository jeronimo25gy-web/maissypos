// Festivos de Colombia (Ley 51 de 1983): fijos, los que se corren al lunes
// siguiente y los que dependen de la Pascua. Fechas en 'YYYY-MM-DD'.
const iso = (d) => d.toISOString().slice(0, 10)
const dia = (y, m, d) => new Date(Date.UTC(y, m - 1, d))
const sumar = (d, n) => new Date(d.getTime() + n * 864e5)
const alLunes = (d) => sumar(d, (8 - d.getUTCDay()) % 7)

function pascua(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31), d1 = ((h + l - 7 * m + 114) % 31) + 1
  return dia(y, mes, d1)
}

const cache = {}
export function festivosDe(y) {
  if (cache[y]) return cache[y]
  const p = pascua(y)
  const lista = [
    [dia(y, 1, 1), 'Año Nuevo'], [alLunes(dia(y, 1, 6)), 'Reyes Magos'], [alLunes(dia(y, 3, 19)), 'San José'],
    [sumar(p, -3), 'Jueves Santo'], [sumar(p, -2), 'Viernes Santo'], [dia(y, 5, 1), 'Día del Trabajo'],
    [sumar(p, 43), 'Ascensión del Señor'], [sumar(p, 64), 'Corpus Christi'], [sumar(p, 71), 'Sagrado Corazón'],
    [alLunes(dia(y, 6, 29)), 'San Pedro y San Pablo'], [dia(y, 7, 20), 'Día de la Independencia'], [dia(y, 8, 7), 'Batalla de Boyacá'],
    [alLunes(dia(y, 8, 15)), 'Asunción de la Virgen'], [alLunes(dia(y, 10, 12)), 'Día de la Raza'], [alLunes(dia(y, 11, 1)), 'Todos los Santos'],
    [alLunes(dia(y, 11, 11)), 'Independencia de Cartagena'], [dia(y, 12, 8), 'Inmaculada Concepción'], [dia(y, 12, 25), 'Navidad'],
  ]
  return (cache[y] = Object.fromEntries(lista.map(([d, n]) => [iso(d), n])))
}

// Nombre del festivo o null.
export const festivo = (fecha) => festivosDe(Number(fecha.slice(0, 4)))[fecha] || null

// Los festivos seguidos justo antes de una fecha, del más cercano hacia atrás.
export function festivosAntes(fecha) {
  const l = []
  let d = sumar(new Date(fecha + 'T00:00:00Z'), -1)
  while (festivo(iso(d))) { l.push({ fecha: iso(d), nombre: festivo(iso(d)), diaSemana: d.getUTCDay() }); d = sumar(d, -1) }
  return l
}
