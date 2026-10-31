// Entiende una fecha escrita a mano: "hoy", "ayer", "28/10", "28-10-2026",
// "28 oct", "28 de octubre", "mié 28 oct" o "2026-10-28". Devuelve AAAA-MM-DD o
// null. Sin año toma el actual; si esa fecha aún no llega, la del año pasado.
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIAS = /^(lun|mar|mie|jue|vie|sab|dom)[a-z]*[,.]?\s+(?=\d)/
const dd = (n) => String(n).padStart(2, '0')
const sumar = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }

function armar(dia, mes, año, hoy) {
  const y = año == null ? Number(hoy.slice(0, 4)) : año < 100 ? 2000 + año : año
  const f = `${y}-${dd(mes)}-${dd(dia)}`
  const d = new Date(y, mes - 1, dia)
  if (mes < 1 || mes > 12 || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null
  return año == null && f > hoy ? `${y - 1}-${dd(mes)}-${dd(dia)}` : f
}

export function leerFechaTexto(texto, hoy) {
  const t = (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(DIAS, '')
  if (!t) return null
  if (t === 'hoy') return hoy
  if (t === 'ayer') return sumar(hoy, -1)
  if (t === 'antier' || t === 'anteayer') return sumar(hoy, -2)
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return armar(Number(m[3]), Number(m[2]), Number(m[1]), hoy)
  m = t.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2}|\d{4}))?$/)
  if (m) return armar(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : null, hoy)
  m = t.match(/^(\d{1,2})\s*(?:de\s+)?([a-z]{3,})\.?(?:\s*(?:de\s+|del\s+)?(\d{2}|\d{4}))?$/)
  if (m) {
    const mes = MESES.indexOf(m[2].slice(0, 3))
    return mes < 0 ? null : armar(Number(m[1]), mes + 1, m[3] ? Number(m[3]) : null, hoy)
  }
  return null
}
