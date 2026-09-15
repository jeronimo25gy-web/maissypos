import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { siigoFetch } from '../../../lib/siigo'

// Diagnostico de conexion con Siigo: lista los tipos de comprobante,
// vendedores y formas de pago que existen en la cuenta de Siigo conectada,
// para poder elegir los IDs correctos antes de mandar la primera factura.
// Protegido: solo jero/kathe, igual que admin-usuarios.
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

export async function GET(request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor' }, { status: 500 })
  }
  const supabaseAdmin = getSupabaseAdmin()
  const autorizado = await requireSuperadmin(supabaseAdmin, request)
  if (!autorizado) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  if (!process.env.SIIGO_USERNAME || !process.env.SIIGO_ACCESS_KEY) {
    return NextResponse.json({ error: 'Falta configurar SIIGO_USERNAME / SIIGO_ACCESS_KEY en el servidor' }, { status: 500 })
  }

  try {
    const [tiposDoc, vendedores, formasPago] = await Promise.all([
      siigoFetch('/v1/document-types?type=FV'),
      siigoFetch('/v1/users'),
      siigoFetch('/v1/payment-types?document_type=FV'),
    ])
    if (!tiposDoc.ok || !vendedores.ok || !formasPago.ok) {
      return NextResponse.json({
        error: 'Siigo respondio con error',
        tipos_comprobante: tiposDoc,
        vendedores,
        formas_pago: formasPago,
      }, { status: 502 })
    }
    return NextResponse.json({
      tipos_comprobante: tiposDoc.data,
      vendedores: vendedores.data,
      formas_pago: formasPago.data,
    })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 })
  }
}
