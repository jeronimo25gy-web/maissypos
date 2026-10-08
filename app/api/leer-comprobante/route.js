import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'

// Lee UN comprobante de transferencia (foto/pantallazo) con Claude y lo cruza
// con las cuentas de la empresa. La imagen no se guarda en ningun lado: se
// lee, se responde y se descarta. El cliente manda una foto por llamada (ya
// reducida) para no pasar el limite de tamano de la peticion.
export const maxDuration = 60

const MODELO = 'claude-haiku-5-5'
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

const Comprobante = z.object({
  es_comprobante: z.boolean(),
  valor: z.number().nullable(),
  fecha: z.string().nullable(),
  referencia: z.string().nullable(),
  banco: z.string().nullable(),
  destino_numero: z.string().nullable(),
  destino_nombre: z.string().nullable(),
  observacion: z.string().nullable(),
})

const INSTRUCCIONES = `Eres un lector de comprobantes de transferencias de bancos y billeteras de Colombia (Nequi, Bancolombia, Daviplata, Davivienda, Bre-B, etc.).
Extrae los datos de la imagen tal como aparecen:
- es_comprobante: false si la imagen no es un comprobante de una transferencia o pago exitoso (por ejemplo, una transferencia rechazada o pendiente, o una foto de otra cosa).
- valor: el monto transferido en pesos colombianos, como numero sin puntos ni signos (ej. 45000). Los puntos en "45.000" son separadores de miles.
- fecha: la fecha de la transferencia en formato YYYY-MM-DD.
- referencia: el numero de comprobante, referencia o aprobacion, tal cual aparece.
- banco: el banco o billetera desde donde se hizo la transferencia.
- destino_numero: el numero de cuenta, celular o llave del DESTINATARIO, tal cual aparece (puede venir enmascarado, ej. ****1234).
- destino_nombre: el nombre del destinatario, si aparece.
- observacion: algo raro que se vea (montos que no coinciden, imagen editada o cortada, estado distinto a exitoso), o null.
Si un dato no aparece o no se puede leer con seguridad, usa null. No inventes datos.`

const getSupabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const soloDigitos = (s) => (s || '').replace(/\D/g, '')
const palabras = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(p => p.length >= 3)

// Busca a cual cuenta de la empresa fue la transferencia: por numero/celular/
// llave (lo mas confiable; sirve aunque venga enmascarado con los ultimos 4
// digitos) o, si no hay numero, por el nombre del titular.
function cruzarConCuentas(lectura, cuentas) {
  const bancos = cuentas.filter(c => c.tipo === 'banco')
  const conDatos = bancos.filter(c => c.numero || c.llaves)
  const destDig = soloDigitos(lectura.destino_numero)
  const destTexto = (lectura.destino_numero || '').toLowerCase().trim()

  for (const c of conDatos) {
    const candidatos = [c.numero, ...(c.llaves || '').split(',')].map(x => (x || '').trim()).filter(Boolean)
    for (const cand of candidatos) {
      const candDig = soloDigitos(cand)
      if (destDig.length >= 4 && candDig.length >= 4 && (candDig.endsWith(destDig) || candDig.slice(-4) === destDig.slice(-4))) {
        return { cuenta_id: c.id, cuenta_nombre: c.nombre, coincidencia: 'numero' }
      }
      if (destTexto && cand.toLowerCase() === destTexto) {
        return { cuenta_id: c.id, cuenta_nombre: c.nombre, coincidencia: 'numero' }
      }
    }
  }
  const nombreDest = palabras(lectura.destino_nombre)
  if (nombreDest.length > 0) {
    for (const c of bancos) {
      const comunes = palabras(c.nombre).filter(p => nombreDest.includes(p))
      if (comunes.length >= 2) return { cuenta_id: c.id, cuenta_nombre: c.nombre, coincidencia: 'nombre' }
    }
  }
  return { cuenta_id: null, cuenta_nombre: null, coincidencia: conDatos.length === 0 ? 'sin_datos' : 'ninguna' }
}

export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Falta configurar la clave de IA (ANTHROPIC_API_KEY) en el servidor' }, { status: 503 })
  }
  const supabaseAdmin = getSupabaseAdmin()
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { data: perfil } = await supabaseAdmin.from('usuarios').select('rol, empresas, activo').eq('auth_user_id', user.id).single()
  if (!perfil?.activo || !['admin', 'auxiliar', 'vendedor'].includes(perfil.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { imagen, media_type, empresa_id } = await request.json()
  if (!imagen || !TIPOS_IMAGEN.includes(media_type) || !empresa_id) {
    return NextResponse.json({ error: 'Falta la imagen o la empresa' }, { status: 400 })
  }
  if (perfil.empresas && !perfil.empresas.includes(empresa_id)) {
    return NextResponse.json({ error: 'No autorizado para esta empresa' }, { status: 403 })
  }

  const client = new Anthropic()
  let lectura
  try {
    const response = await client.messages.parse({
      model: MODELO,
      max_tokens: 4000,
      output_config: { effort: 'low', format: zodOutputFormat(Comprobante) },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type, data: imagen } },
          { type: 'text', text: INSTRUCCIONES },
        ],
      }],
    })
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return NextResponse.json({ error: 'No se pudo leer este comprobante; ingrésalo a mano' }, { status: 422 })
    }
    lectura = response.parsed_output
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'Demasiadas lecturas seguidas, espera unos segundos' }, { status: 429 })
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: 'La clave de IA no es valida' }, { status: 503 })
    }
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Error leyendo el comprobante (${error.status})` }, { status: 502 })
    }
    return NextResponse.json({ error: 'Error leyendo el comprobante' }, { status: 500 })
  }

  const { data: cuentas } = await supabaseAdmin.from('cuentas').select('id, nombre, tipo, numero, llaves').eq('empresa_id', empresa_id).eq('estado', true)
  const cruce = cruzarConCuentas(lectura, cuentas || [])

  // Mismo comprobante ya reportado antes (en cualquier liquidacion).
  let repetida = null
  if (lectura.referencia && lectura.referencia.trim().length >= 4) {
    const { data: previas } = await supabaseAdmin.from('transferencias_ruta')
      .select('fecha, valor, estado, vendedores(nombre)')
      .eq('empresa_id', empresa_id).eq('referencia', lectura.referencia.trim()).limit(1)
    if (previas && previas.length > 0) {
      repetida = { fecha: previas[0].fecha, valor: previas[0].valor, vendedor: previas[0].vendedores?.nombre || null }
    }
  }

  return NextResponse.json({ lectura: { ...lectura, referencia: lectura.referencia?.trim() || null }, ...cruce, repetida })
}
