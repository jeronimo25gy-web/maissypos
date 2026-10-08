import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/api-auth'

// "Olvide mi contrasena" para usuarios sin correo real (vendedores/auxiliar
// con {usuario}@maissypos.internal): no se les puede mandar un enlace, asi que
// se crea una alerta para que un admin les ponga una clave nueva en
// Configuracion > Usuarios. Publico (quien olvido la clave no tiene sesion):
// responde igual exista o no el usuario, y no repite el aviso si ya hay uno
// reciente.
export async function POST(request) {
  const { usuario } = await request.json().catch(() => ({}))
  const nombreUsuario = (usuario || '').trim().toLowerCase()
  const respuesta = NextResponse.json({ ok: true })
  if (!nombreUsuario || nombreUsuario.length > 60) return respuesta

  const supabaseAdmin = getSupabaseAdmin()
  const { data: u } = await supabaseAdmin.from('usuarios').select('usuario, nombre, email, empresas, activo').eq('usuario', nombreUsuario).maybeSingle()
  if (!u || !u.activo || u.email) return respuesta

  let empresaIds = u.empresas
  if (!empresaIds || empresaIds.length === 0) {
    const { data: emps } = await supabaseAdmin.from('empresas').select('id').eq('activo', true)
    empresaIds = (emps || []).map(e => e.id)
  }
  const mensaje = `${u.nombre} (@${u.usuario}) olvidó su contraseña. Ponle una nueva en Configuración → Usuarios → Contraseña.`
  const hace15 = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { data: reciente } = await supabaseAdmin.from('alertas_admin').select('id')
    .eq('tipo', 'clave_olvidada').eq('mensaje', mensaje).gte('created_at', hace15).limit(1)
  if (reciente && reciente.length > 0) return respuesta

  await supabaseAdmin.from('alertas_admin').insert(empresaIds.map(id => ({ empresa_id: id, tipo: 'clave_olvidada', mensaje })))
  try {
    await fetch(new URL('/api/whatsapp-alerta', request.url), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'clave_olvidada', mensaje }),
    })
  } catch {
    // el aviso por WhatsApp es opcional
  }
  return respuesta
}
