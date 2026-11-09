import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/api-auth'
import { enviarAlertaWhatsapp } from '@/lib/whatsapp-servidor'

// Aviso por WhatsApp a Gerencia cuando una pantalla crea una alerta. Solo para
// usuarios con sesion activa: antes estaba abierta y cualquiera en internet
// podia mandar mensajes (que Meta cobra) a los numeros de Gerencia.
export async function POST(request) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const supabaseAdmin = getSupabaseAdmin()
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { data: perfil } = await supabaseAdmin.from('usuarios').select('activo').eq('auth_user_id', user.id).maybeSingle()
  if (!perfil?.activo) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { mensaje } = await request.json().catch(() => ({}))
  if (!mensaje) return NextResponse.json({ error: 'Falta el mensaje' }, { status: 400 })

  const r = await enviarAlertaWhatsapp(mensaje)
  if (r.error) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json(r, { status: r.ok ? 200 : 502 })
}
