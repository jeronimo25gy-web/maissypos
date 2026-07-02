import { NextResponse } from 'next/server'
import { supabase } from '../../../lib/supabase'

export async function POST(request) {
  const { usuario_id, dispositivo } = await request.json()
  if (!usuario_id) return NextResponse.json({ error: 'usuario_id requerido' }, { status: 400 })

  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : (request.headers.get('x-real-ip') || 'desconocida')

  const { error } = await supabase.from('sesiones_activas').upsert({
    usuario_id,
    ip,
    dispositivo: dispositivo || 'desconocido',
    ultimo_acceso: new Date().toISOString(),
    activo: true
  }, { onConflict: 'usuario_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
