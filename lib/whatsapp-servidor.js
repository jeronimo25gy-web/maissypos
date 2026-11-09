// Solo servidor: usa el token de WhatsApp Cloud API. Envia la plantilla de
// alerta a los numeros de WHATSAPP_ALERTA_DESTINO (jero/kathe).
const enviarAWhatsapp = async (to, body) => {
  const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, ...body }),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

export async function enviarAlertaWhatsapp(mensaje) {
  const destinos = (process.env.WHATSAPP_ALERTA_DESTINO || '').split(',').map(d => d.trim()).filter(Boolean)
  if (destinos.length === 0) return { ok: false, error: 'Sin destinatarios configurados', resultados: [] }
  const body = { type: 'template', template: { name: 'alerta_maissy_v2', language: { code: 'es' }, components: [{ type: 'body', parameters: [{ type: 'text', text: String(mensaje || '').slice(0, 1024) }] }] } }
  const resultados = await Promise.all(destinos.map(d => enviarAWhatsapp(d, body)))
  return { ok: resultados.every(r => r.ok), resultados }
}
