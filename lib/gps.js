import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'

// Pide al servidor (/api/gps) los datos del GPS de los carros (Datatrack).
//   pedirGps({ accion: 'unidades' })
//   pedirGps({ accion: 'recorrido', unidad, fecha })
export async function pedirGps(body) {
  const { data: { session } } = await supabase.auth.getSession()
  const r = await fetch('/api/gps', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ ...body, empresa_id: getEmpresaId() }) })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || 'No se pudo consultar el GPS')
  return j
}

// Misma placa escrita distinto ("GES 852", "ges-852") = la misma.
export const placaIgual = (a, b) => !!a && !!b && String(a).replace(/[\s-]/g, '').toUpperCase() === String(b).replace(/[\s-]/g, '').toUpperCase()
