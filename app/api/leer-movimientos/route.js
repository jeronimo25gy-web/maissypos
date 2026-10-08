import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { getSupabaseAdmin, verificarUsuario } from '@/lib/api-auth'

// Lee UN pantallazo de los movimientos de una cuenta bancaria (app de
// Bancolombia, Nequi, etc.) para conciliar las transferencias por verificar.
// La imagen no se guarda. Solo admin (es quien ve los bancos).
export const maxDuration = 60

const MODELO = 'claude-haiku-5-5'
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

const Movimientos = z.object({
  es_movimientos: z.boolean(),
  movimientos: z.array(z.object({
    tipo: z.enum(['entrada', 'salida']),
    valor: z.number(),
    fecha: z.string().nullable(),
    descripcion: z.string().nullable(),
    referencia: z.string().nullable(),
  })),
})

const INSTRUCCIONES = `Esta imagen es un pantallazo de los movimientos de una cuenta bancaria o billetera de Colombia (Bancolombia, Nequi, Daviplata, Davivienda, etc.).
Extrae TODOS los movimientos visibles, uno por uno:
- tipo: "entrada" si es plata que entro a la cuenta (recibido, abono, transferencia recibida, consignacion); "salida" si salio (pago, envio, retiro, compra).
- valor: el monto en pesos colombianos como numero sin puntos ni signos (ej. 45000). Los puntos en "45.000" son separadores de miles.
- fecha: YYYY-MM-DD. Si el pantallazo solo muestra dia y mes, asume el ano en curso. Si la fecha aparece como encabezado de un grupo de movimientos, usala para todos los de ese grupo.
- descripcion: el texto del movimiento (nombre de quien envio, concepto), o null.
- referencia: numero de referencia o comprobante si aparece, o null.
es_movimientos: false si la imagen no es una lista de movimientos bancarios.
No inventes movimientos ni completes datos que no se ven.`

export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Falta configurar la clave de IA (ANTHROPIC_API_KEY) en el servidor' }, { status: 503 })
  }
  const { imagen, media_type, empresa_id } = await request.json()
  const supabaseAdmin = getSupabaseAdmin()
  const auth = await verificarUsuario(supabaseAdmin, request, { roles: ['admin'], empresaId: empresa_id })
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!imagen || !TIPOS_IMAGEN.includes(media_type)) {
    return NextResponse.json({ error: 'Falta la imagen' }, { status: 400 })
  }

  const client = new Anthropic()
  try {
    const response = await client.messages.parse({
      model: MODELO,
      max_tokens: 8000,
      output_config: { effort: 'low', format: zodOutputFormat(Movimientos) },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type, data: imagen } },
          { type: 'text', text: INSTRUCCIONES },
        ],
      }],
    })
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return NextResponse.json({ error: 'No se pudo leer este pantallazo' }, { status: 422 })
    }
    return NextResponse.json(response.parsed_output)
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'Demasiadas lecturas seguidas, espera unos segundos' }, { status: 429 })
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: 'La clave de IA no es valida' }, { status: 503 })
    }
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Error leyendo el pantallazo (${error.status})` }, { status: 502 })
    }
    return NextResponse.json({ error: 'Error leyendo el pantallazo' }, { status: 500 })
  }
}
