import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Este endpoint se llama justo despues de signInWithPassword, antes de que
// el cliente tenga forma de adjuntar su propio JWT a esta ruta server-side
// -- por eso usa service_role en vez del cliente anon (que con RLS real en
// sesiones_activas fallaria en silencio, como pasaba con usuarios/sesiones
// abiertas de mas para compensar esto).
const getSupabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(request) {
  const { usuario_id, dispositivo } = await request.json()
  if (!usuario_id) return NextResponse.json({ error: 'usuario_id requerido' }, { status: 400 })
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor' }, { status: 500 })
  }

  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : (request.headers.get('x-real-ip') || 'desconocida')

  const supabaseAdmin = getSupabaseAdmin()
  const { error } = await supabaseAdmin.from('sesiones_activas').upsert({
    usuario_id,
    ip,
    dispositivo: dispositivo || 'desconocido',
    ultimo_acceso: new Date().toISOString(),
    activo: true
  }, { onConflict: 'usuario_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
