import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Endpoint server-side para operaciones de cuenta que requieren service_role
// (crear cuentas de Auth, resetear la clave de OTRO usuario) -- el cliente
// nunca puede hacer esto directo, necesita el service_role key que solo vive
// aca en el servidor. Protegido: solo jero/kathe (los dos superadmin de
// Maissy Group) pueden invocar estas acciones.
const getSupabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const SUPERADMINS = ['jero', 'kathe']

async function requireSuperadmin(supabaseAdmin, request) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return null
  const { data: perfil } = await supabaseAdmin.from('usuarios').select('usuario').eq('auth_user_id', user.id).single()
  if (!perfil || !SUPERADMINS.includes(perfil.usuario)) return null
  return perfil
}

export async function POST(request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor' }, { status: 500 })
  }
  const supabaseAdmin = getSupabaseAdmin()
  const autorizado = await requireSuperadmin(supabaseAdmin, request)
  if (!autorizado) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { accion, usuario_id, nueva_clave } = await request.json()
  if (!nueva_clave || nueva_clave.length < 4) {
    return NextResponse.json({ error: 'La contrasena debe tener al menos 4 caracteres' }, { status: 400 })
  }

  if (accion === 'reset_password') {
    const { data: u } = await supabaseAdmin.from('usuarios').select('auth_user_id').eq('id', usuario_id).single()
    if (!u?.auth_user_id) return NextResponse.json({ error: 'Usuario sin cuenta de autenticacion' }, { status: 400 })
    const { error } = await supabaseAdmin.auth.admin.updateUserById(u.auth_user_id, { password: nueva_clave })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (accion === 'crear_usuario') {
    const { data: u } = await supabaseAdmin.from('usuarios').select('usuario, email').eq('id', usuario_id).single()
    if (!u) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    const authEmail = u.email || `${u.usuario.toLowerCase()}@maissypos.internal`
    const { data: creado, error } = await supabaseAdmin.auth.admin.createUser({ email: authEmail, password: nueva_clave, email_confirm: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await supabaseAdmin.from('usuarios').update({ auth_user_id: creado.user.id }).eq('id', usuario_id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Accion invalida' }, { status: 400 })
}
