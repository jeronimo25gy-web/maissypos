// ¿La ruta sale este día? Según sus días de operación ("Lunes a Viernes",
// "Lunes, Martes y Viernes"...). Sin días anotados sale de lunes a sábado.
// Lo usan Despacho y el aviso de rutas sin despachar, para que coincidan.
const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']

export function rutaSaleEseDia(ruta, diaSemana) {
  const t = (ruta?.dias_operacion || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (!t) return diaSemana !== 0
  const idx = (n) => DIAS.findIndex(d => n.includes(d))
  const rango = t.match(/(\w+)\s+a\s+(\w+)/)
  if (rango) { const a = idx(rango[1]), b = idx(rango[2]); return a >= 0 && b >= 0 && diaSemana >= a && diaSemana <= b }
  return t.split(/[,y]/).some(x => idx(x.trim()) === diaSemana)
}
