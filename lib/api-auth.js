import { createClient } from '@supabase/supabase-js'

export const getSupabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Valida el token de sesion que manda el cliente y devuelve el perfil del
// usuario si esta activo, tiene uno de los roles pedidos y acceso a la
// empresa. Devuelve { error, status } si no.
export async function verificarUsuario(supabaseAdmin, request, { roles, empresaId }) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return { error: 'No autorizado', status: 401 }
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return { error: 'No autorizado', status: 401 }
  const { data: perfil } = await supabaseAdmin.from('usuarios').select('nombre, rol, empresas, activo').eq('auth_user_id', user.id).single()
  if (!perfil?.activo || !roles.includes(perfil.rol)) return { error: 'No autorizado', status: 403 }
  if (empresaId && perfil.empresas && !perfil.empresas.includes(empresaId)) return { error: 'No autorizado para esta empresa', status: 403 }
  return { perfil }
}
