'use client'
import { supabase } from './supabase'

// Gastos de cada empresa: clasificación de categorías y gastos programados.
export const CLASIFICACION = {
  cif: { nombre: 'Gasto de planta', nota: 'Entra al costo de producción' },
  costo_fijo: { nombre: 'Fijo administrativo', nota: 'Gasto fijo de la empresa' },
  distribucion: { nombre: 'Distribución', nota: 'Entra al costo de la ruta asignada' },
  financiero: { nombre: 'Financiero', nota: 'Intereses, comisiones bancarias y similares' },
}

const dosDigitos = (n) => String(n).padStart(2, '0')
const ultimoDia = (mes) => { const [y, m] = mes.split('-').map(Number); return new Date(y, m, 0).getDate() }
const mesSiguiente = (mes) => { const [y, m] = mes.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${dosDigitos(m + 1)}` }
const fechaEnMes = (mes, dia) => `${mes}-${dosDigitos(Math.min(dia, ultimoDia(mes)))}`

// Próxima fecha de un gasto programado: la de este mes si aún no se registró;
// si ya se registró, la del mes siguiente.
export function proximaFecha(prog, hoy) {
  const mes = hoy.slice(0, 7)
  return prog.ultimo_mes === mes ? fechaEnMes(mesSiguiente(mes), prog.dia) : fechaEnMes(mes, prog.dia)
}

export async function cargarProgramados(empresaId) {
  const { data } = await supabase.from('gastos_programados').select('*').eq('empresa_id', empresaId).eq('activo', true).order('dia')
  return data || []
}

// Pagos programados en los próximos días, para Finanzas.
export function programadosProximos(programados, hoy, hasta) {
  const lista = []
  programados.forEach(p => {
    let f = proximaFecha(p, hoy)
    const vencido = f < hoy
    if (vencido || f <= hasta) lista.push({ fecha: vencido ? hoy : f, valor: Number(p.valor || 0), titulo: p.nombre, detalle: vencido ? 'Pendiente de registrar · Gastos' : p.valor_variable ? 'Valor estimado · Gastos' : 'Gasto programado · Gastos', vencido, estimado: p.valor_variable })
    // El del mes siguiente, si también cae dentro del periodo.
    const sig = fechaEnMes(mesSiguiente(f.slice(0, 7)), p.dia)
    if (sig <= hasta) lista.push({ fecha: sig, valor: Number(p.valor || 0), titulo: p.nombre, detalle: 'Gasto programado · Gastos', estimado: p.valor_variable })
  })
  return lista
}
