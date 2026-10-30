import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { getSupabaseAdmin, verificarUsuario } from '@/lib/api-auth'
import { pasoPorId, camposDe } from '@/lib/migracion.js'
import { revisar, cargar, deshacer, estado } from '@/lib/migracion-servidor.js'

// Migracion de datos de un cliente nuevo desde la consola de Plataforma. Solo
// el rol plataforma entra; el archivo y sus filas no se guardan aqui.
export const maxDuration = 60

const MODELO = 'claude-haiku-5-5'
const TIPOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

// Un PDF o una foto de una lista: la lectura devuelve filas como las de un Excel.
async function leer({ archivo, media_type, paso, modelos }) {
  const campos = camposDe(paso, modelos)
  const Lectura = z.object({
    es_lista: z.boolean(),
    filas: z.array(z.object(Object.fromEntries(campos.map(c => [c.id, z.string().nullable()])))),
  })
  const contenido = media_type === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type, data: archivo } }
    : { type: 'image', source: { type: 'base64', media_type, data: archivo } }
  const instrucciones = `Este documento es una lista de ${paso.titulo.toLowerCase()} de un negocio en Colombia, tomada de otro sistema o escrita a mano.
Extrae TODAS las filas, una por una, con estos datos:
${campos.map(c => `- ${c.id}: ${c.titulo}`).join('\n')}
Copia cada valor tal como aparece, sin corregirlo ni calcularlo. Si un dato no aparece o no se lee con seguridad, usa null. No inventes filas.
Deja por fuera los títulos, los subtotales y los totales.
es_lista: false si el documento no es una lista de este tipo.`
  const response = await new Anthropic().messages.parse({
    model: MODELO,
    max_tokens: 16000,
    output_config: { effort: 'low', format: zodOutputFormat(Lectura) },
    messages: [{ role: 'user', content: [contenido, { type: 'text', text: instrucciones }] }],
  })
  if (response.stop_reason === 'max_tokens') return { error: 'El documento es muy largo para leerlo de una vez; envíelo por partes', status: 422 }
  if (response.stop_reason === 'refusal' || !response.parsed_output) return { error: 'No se pudo leer este documento', status: 422 }
  if (!response.parsed_output.es_lista) return { error: `Este documento no parece una lista de ${paso.titulo.toLowerCase()}`, status: 422 }
  return { filas: response.parsed_output.filas, campos: campos.map(c => ({ id: c.id, titulo: c.titulo })) }
}

export async function POST(request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor' }, { status: 500 })
  const admin = getSupabaseAdmin()
  const auth = await verificarUsuario(admin, request, { roles: ['plataforma'] })
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json()
  const { data: empresa } = await admin.from('empresas').select('id, nombre, modelos, cliente_id').eq('id', body.empresa_id || '').maybeSingle()
  if (!empresa) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  try {
    if (body.accion === 'estado') {
      const { data: cliente } = await admin.from('clientes_plataforma').select('nombre').eq('id', empresa.cliente_id).maybeSingle()
      return NextResponse.json({ empresa: { id: empresa.id, nombre: empresa.nombre, modelos: empresa.modelos }, cliente: cliente?.nombre || null, ...(await estado(admin, empresa)) })
    }
    if (body.accion === 'revisar') {
      const r = await revisar(admin, { empresa, pasoId: body.paso, filas: body.filas, corte: body.corte })
      return NextResponse.json({ filas: r.filas.map(({ cliente, ...f }) => f), nuevas: r.nuevas })
    }
    if (body.accion === 'cargar') {
      const r = await cargar(admin, { empresa, pasoId: body.paso, filas: body.filas, corte: body.corte, archivo: body.archivo, fuera: body.fuera, usuario: auth.perfil.nombre })
      return NextResponse.json(r)
    }
    if (body.accion === 'deshacer') return NextResponse.json(await deshacer(admin, { empresa, lote: body.lote }))
    if (body.accion === 'leer') {
      if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'Falta configurar la clave de IA (ANTHROPIC_API_KEY) en el servidor' }, { status: 503 })
      const paso = pasoPorId(body.paso)
      if (!paso || !body.archivo || !TIPOS.includes(body.media_type)) return NextResponse.json({ error: 'Falta el documento' }, { status: 400 })
      const r = await leer({ archivo: body.archivo, media_type: body.media_type, paso, modelos: empresa.modelos })
      return r.error ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json(r)
    }
    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return NextResponse.json({ error: 'Demasiadas lecturas seguidas, espere unos segundos' }, { status: 429 })
    if (error instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: 'La clave de IA no es válida' }, { status: 503 })
    if (error instanceof Anthropic.APIError) return NextResponse.json({ error: `Error leyendo el documento (${error.status})` }, { status: 502 })
    return NextResponse.json({ error: error.message || 'No se pudo completar la operación' }, { status: 400 })
  }
}
