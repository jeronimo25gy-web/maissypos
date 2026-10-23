'use client'
import { supabase } from './supabase'

// Tareas por rol: cada pendiente (lib/pendientes.js) pertenece a un tipo, y
// cada tipo le llega a los roles que Gerencia defina (tabla tareas_roles).
// Sin configuración se usan los roles por defecto de cada tipo.
export const TIPOS_TAREA = [
  { id: 'liquidaciones', nombre: 'Liquidaciones por aprobar', prefijos: ['aprobar'], roles: ['admin', 'auxiliar'] },
  { id: 'creditos', nombre: 'Créditos vencidos', prefijos: ['vencidos'], roles: ['gerencia', 'admin'] },
  { id: 'proveedores', nombre: 'Pagos a proveedores', prefijos: ['pagos-v', 'pagos-s'], roles: ['gerencia', 'admin'] },
  { id: 'transferencias', nombre: 'Transferencias por verificar', prefijos: ['transf-v', 'transf-h'], roles: ['admin', 'auxiliar'] },
  { id: 'vehiculos', nombre: 'Vehículos, documentos y licencias', prefijos: ['doc', 'cond', 'mant', 'novveh'], roles: ['gerencia', 'admin'] },
  { id: 'inventario', nombre: 'Inventario, conteos y ajustes', prefijos: ['ajustes', 'conteo', 'stock', 'lotes'], roles: ['gerencia', 'admin'] },
  { id: 'operacion', nombre: 'Despachos, domicilios y cambios', prefijos: ['domis', 'sacar', 'sindespacho', 'reponer', 'cambios'], roles: ['admin', 'auxiliar'] },
  { id: 'avisos', nombre: 'Avisos del sistema', prefijos: ['alerta'], roles: ['gerencia', 'admin'] },
]
export const ROLES_TAREA = [['gerencia', 'Gerencia'], ['admin', 'Administrador'], ['auxiliar', 'Auxiliar']]

export const tipoDeTarea = (clave) => {
  const pre = String(clave || '').split('-')
  return TIPOS_TAREA.find(t => t.prefijos.some(p => clave === p || clave.startsWith(p + '-') || pre[0] === p)) || TIPOS_TAREA.find(t => t.id === 'avisos')
}

export async function cargarRepartoTareas() {
  const { data } = await supabase.from('tareas_roles').select('tipo, roles')
  const guardado = Object.fromEntries((data || []).map(x => [x.tipo, x.roles]))
  return Object.fromEntries(TIPOS_TAREA.map(t => [t.id, guardado[t.id] || t.roles]))
}

export const rolDeUsuario = (u) => u?.gerencia ? 'gerencia' : u?.rol

// Las tareas que le tocan al usuario según su rol.
export function filtrarTareas(pendientes, usuario, reparto) {
  const rol = rolDeUsuario(usuario)
  if (!reparto || !rol) return pendientes || []
  return (pendientes || []).filter(p => (reparto[tipoDeTarea(p.clave).id] || []).includes(rol))
}
