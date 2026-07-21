import { obtenerFechaActual } from '@/lib/supabase-helpers'

export const diasHasta = (fecha) => {
  if (!fecha) return null
  const hoy = new Date(obtenerFechaActual())
  const f = new Date(fecha)
  return Math.round((f - hoy) / (24 * 60 * 60 * 1000))
}

export const estadoDocumento = (fechaVencimiento) => {
  const dias = diasHasta(fechaVencimiento)
  if (dias === null) return { status: 'sin_fecha', label: 'Sin fecha', color: 'gray' }
  if (dias < 0) return { status: 'vencido' }
  if (dias <= 30) return { status: 'por_vencer' }
  return { status: 'vigente' }
}

export const ultimoPorTipo = (mantenimientos) => {
  const porTipo = {}
  ;[...mantenimientos].sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach(m => { porTipo[m.tipo] = m })
  return Object.values(porTipo)
}

export const proximoMasCercano = (mantenimientos, kilometrajeActual) => {
  const conProximo = ultimoPorTipo(mantenimientos).filter(m => m.km_proximo != null)
  if (conProximo.length === 0) return null
  return conProximo.reduce((min, m) => {
    const restante = m.km_proximo - kilometrajeActual
    return (!min || restante < min.restante) ? { ...m, restante } : min
  }, null)
}
