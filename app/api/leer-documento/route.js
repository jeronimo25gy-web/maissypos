import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { getSupabaseAdmin, verificarUsuario } from '@/lib/api-auth'

// Lee la licencia de conducción (frente y reverso) o el carné de manipulación
// de alimentos de un conductor y devuelve categoría, número y vencimiento para
// que el administrador los confirme. Las imágenes no se guardan aquí: se leen
// y se descartan (las fotos se suben aparte al bucket privado de soportes).
export const maxDuration = 60

const MODELO = 'claude-haiku-5-5'
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

const Documento = z.object({
  es_documento: z.boolean(),
  nombre: z.string().nullable(),
  numero: z.string().nullable(),
  categoria: z.string().nullable(),
  vence: z.string().nullable(),
  servicio: z.enum(['particular', 'publico', 'desconocido']),
  observacion: z.string().nullable(),
})

const INSTRUCCIONES = {
  licencia: `Son las fotos (frente y reverso) de una licencia de conducción de Colombia.
Extrae:
- es_documento: false si no es una licencia de conducción.
- nombre: nombre completo del titular.
- numero: número de la licencia (normalmente la cédula), solo dígitos.
- categoria: las categorías vigentes separadas por coma (A1, A2, B1, B2, B3, C1, C2, C3).
- vence: la fecha de vencimiento MÁS PRÓXIMA entre las categorías, en formato YYYY-MM-DD. En el reverso cada categoría tiene su fecha de vigencia.
- servicio: "publico" si alguna categoría es C1, C2 o C3 (servicio público); "particular" si solo son A o B; si no se puede saber, "desconocido".
- observacion: algo raro (documento borroso, cortado, vencido, datos que no coinciden) o null.
Si un dato no se lee con seguridad, usa null. No inventes datos.`,
  cma: `Es la foto de un carné o certificado de manipulación de alimentos de Colombia.
Extrae:
- es_documento: false si no es un carné o certificado de manipulación de alimentos.
- nombre: nombre del titular.
- numero: número del certificado o documento del titular.
- categoria: null.
- vence: fecha de vencimiento en formato YYYY-MM-DD. Si solo aparece la fecha de expedición, calcula un año después y dilo en observacion.
- servicio: "desconocido".
- observacion: algo raro o null.
Si un dato no se lee con seguridad, usa null. No inventes datos.`,
}

export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'Falta configurar la clave de IA (ANTHROPIC_API_KEY) en el servidor' }, { status: 503 })
  const { imagenes, tipo, empresa_id } = await request.json()
  const supabaseAdmin = getSupabaseAdmin()
  const auth = await verificarUsuario(supabaseAdmin, request, { roles: ['admin', 'auxiliar'], empresaId: empresa_id })
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!INSTRUCCIONES[tipo] || !Array.isArray(imagenes) || !imagenes.length || imagenes.length > 2 || imagenes.some(i => !i?.data || !TIPOS_IMAGEN.includes(i.media_type))) {
    return NextResponse.json({ error: 'Faltan las fotos del documento' }, { status: 400 })
  }
  try {
    const response = await new Anthropic().messages.parse({
      model: MODELO,
      max_tokens: 4000,
      output_config: { effort: 'low', format: zodOutputFormat(Documento) },
      messages: [{ role: 'user', content: [...imagenes.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.media_type, data: i.data } })), { type: 'text', text: INSTRUCCIONES[tipo] }] }],
    })
    if (response.stop_reason === 'refusal' || !response.parsed_output) return NextResponse.json({ error: 'No se pudo leer el documento; ingrese los datos a mano' }, { status: 422 })
    return NextResponse.json({ lectura: response.parsed_output })
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return NextResponse.json({ error: 'Demasiadas lecturas seguidas, espere unos segundos' }, { status: 429 })
    if (error instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: 'La clave de IA no es válida' }, { status: 503 })
    if (error instanceof Anthropic.APIError) return NextResponse.json({ error: `Error leyendo el documento (${error.status})` }, { status: 502 })
    return NextResponse.json({ error: 'Error leyendo el documento' }, { status: 500 })
  }
}
