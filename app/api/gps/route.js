import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin, verificarUsuario } from '@/lib/api-auth'
import { unidadesGps, recorridoGps, mapaGps } from '@/lib/gps-datatrack'

// GPS de los carros (Datatrack). El navegador pide aquí y el servidor habla con
// Datatrack con su token; solo administradores.
//   { accion: 'unidades' }                         -> posición actual de cada carro
//   { accion: 'recorrido', unidad, fecha }         -> recorrido del día
export const maxDuration = 30

async function autorizado(request, empresaId) {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return verificarUsuario(getSupabaseAdmin(), request, { roles: ['admin'], empresaId })
  // Sin la clave de servicio (equipo de desarrollo): basta una sesión válida.
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return { error: 'No autorizado', status: 401 }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { data: { user } } = await sb.auth.getUser(token)
  return user ? { perfil: {} } : { error: 'No autorizado', status: 401 }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}))
  const auth = await autorizado(request, body.empresa_id)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    if (body.accion === 'unidades') { const unidades = await unidadesGps(); return NextResponse.json({ unidades, mapa: mapaGps(), ahora: Math.floor(Date.now() / 1000) }) }
    if (body.accion === 'recorrido') {
      if (!body.unidad || !/^\d{4}-\d{2}-\d{2}$/.test(body.fecha || '')) return NextResponse.json({ error: 'Falta la unidad o la fecha' }, { status: 400 })
      return NextResponse.json({ recorrido: await recorridoGps(body.unidad, body.fecha), mapa: mapaGps() })
    }
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e.message || 'No se pudo consultar el GPS' }, { status: 502 })
  }
}
