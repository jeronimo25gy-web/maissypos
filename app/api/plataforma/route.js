import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Acciones de la consola de Plataforma que necesitan la llave del servidor:
// crear una demo (cliente, empresa, cuenta de efectivo y usuario con su
// acceso). Solo el rol plataforma puede llamarlas.
const getSupabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
const USUARIO_VALIDO = /^[a-z0-9._-]{3,30}$/
const PRECIO = { empresa: 250000, mostrador: 150000 }

export async function POST(request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor' }, { status: 500 })
  const admin = getSupabaseAdmin()
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '')
  const { data: { user } } = token ? await admin.auth.getUser(token) : { data: {} }
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  const { data: yo } = await admin.from('usuarios').select('nombre, rol').eq('auth_user_id', user.id).single()
  if (yo?.rol !== 'plataforma') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const body = await request.json()
  if (body.accion !== 'crear_demo') return NextResponse.json({ error: 'Accion invalida' }, { status: 400 })

  const negocio = String(body.negocio || '').trim()
  const contacto = String(body.contacto || '').trim()
  const usuario = String(body.usuario || '').trim().toLowerCase()
  const clave = String(body.clave || '')
  const dias = Math.max(1, Math.min(90, Number(body.dias) || 15))
  const actividades = Array.isArray(body.actividades) ? body.actividades : []
  if (!negocio || !contacto) return NextResponse.json({ error: 'Falta el nombre del negocio o del contacto' }, { status: 400 })
  if (!USUARIO_VALIDO.test(usuario)) return NextResponse.json({ error: 'El usuario debe tener entre 3 y 30 letras minúsculas, números, punto o guion' }, { status: 400 })
  if (clave.length < 6) return NextResponse.json({ error: 'La contraseña temporal debe tener al menos 6 caracteres' }, { status: 400 })
  const { data: repetido } = await admin.from('usuarios').select('id').eq('usuario', usuario).maybeSingle()
  if (repetido) return NextResponse.json({ error: `El usuario ${usuario} ya existe. Escoge otro.` }, { status: 400 })

  const soloMostrador = actividades.length === 1 && actividades[0] === 'mostrador'
  const plan = soloMostrador ? 'mostrador' : 'empresa'
  const modelos = actividades.includes('produccion') ? ['distribucion', 'produccion'] : ['distribucion']
  const hasta = new Date(Date.now() + dias * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

  // Si algo falla a mitad de camino, se deshace lo creado.
  const deshacer = []
  const fallar = async (msg) => { for (const f of deshacer.reverse()) await f(); return NextResponse.json({ error: msg }, { status: 500 }) }

  const { data: cliente, error: e1 } = await admin.from('clientes_plataforma').insert({
    nombre: negocio, estado: 'demo', demo_hasta: hasta, contacto_nombre: contacto,
    contacto_celular: body.celular || null, ciudad: body.ciudad || null,
  }).select('id').single()
  if (e1) return fallar('No se pudo crear el cliente: ' + e1.message)
  deshacer.push(() => admin.from('clientes_plataforma').delete().eq('id', cliente.id))

  const { data: empresa, error: e2 } = await admin.from('empresas').insert({
    nombre: negocio, ciudad: body.ciudad || null, telefono: body.celular || null, activo: true,
    modelos, cliente_id: cliente.id, plan, precio_mensual: PRECIO[plan],
  }).select('id').single()
  if (e2) return fallar('No se pudo crear la empresa: ' + e2.message)
  deshacer.push(() => admin.from('empresas').delete().eq('id', empresa.id))

  const { error: e3 } = await admin.from('cuentas').insert({ empresa_id: empresa.id, nombre: 'Efectivo', tipo: 'efectivo' })
  if (e3) return fallar('No se pudo crear la caja: ' + e3.message)
  deshacer.push(() => admin.from('cuentas').delete().eq('empresa_id', empresa.id))

  const { data: fila, error: e4 } = await admin.from('usuarios').insert({
    usuario, nombre: contacto, rol: 'admin', empresas: [empresa.id], cliente_id: cliente.id, activo: true, password_hash: '',
  }).select('id').single()
  if (e4) return fallar('No se pudo crear el usuario: ' + e4.message)
  deshacer.push(() => admin.from('usuarios').delete().eq('id', fila.id))

  const { data: creado, error: e5 } = await admin.auth.admin.createUser({ email: `${usuario}@maissypos.internal`, password: clave, email_confirm: true })
  if (e5) return fallar('No se pudo crear el acceso: ' + e5.message)
  await admin.from('usuarios').update({ auth_user_id: creado.user.id }).eq('id', fila.id)

  if (body.solicitud_id) await admin.from('solicitudes_demo').update({ estado: 'aprobada', cliente_id: cliente.id }).eq('id', body.solicitud_id)
  return NextResponse.json({ ok: true, cliente_id: cliente.id, empresa_id: empresa.id, demo_hasta: hasta, usuario })
}
