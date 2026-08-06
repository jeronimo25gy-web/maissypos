import { NextResponse } from 'next/server'

const enviarAWhatsapp = async (to, body) => {
  const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, ...body }),
  })
  const data = await res.json()
  return { ok: res.ok, status: res.status, data }
}

export async function POST(request) {
  const { tipo, mensaje } = await request.json()
  const destinos = (process.env.WHATSAPP_ALERTA_DESTINO || '').split(',').map(d => d.trim()).filter(Boolean)
  if (destinos.length === 0) return NextResponse.json({ error: 'Sin destinatarios configurados' }, { status: 400 })

  const body = tipo === 'test'
    ? { type: 'template', template: { name: 'hello_world', language: { code: 'en_US' } } }
    : { type: 'template', template: { name: 'alerta_maissy_v2', language: { code: 'es' }, components: [{ type: 'body', parameters: [{ type: 'text', text: (mensaje || '').slice(0, 1024) }] }] } }

  const resultados = await Promise.all(destinos.map(d => enviarAWhatsapp(d, body)))
  const fallos = resultados.filter(r => !r.ok)
  if (fallos.length > 0) return NextResponse.json({ ok: false, resultados }, { status: 502 })
  return NextResponse.json({ ok: true, resultados })
}
