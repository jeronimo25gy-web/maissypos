const SIIGO_BASE = 'https://api.siigo.com'

let cachedToken = null
let cachedTokenExpiry = 0

async function obtenerToken() {
  if (cachedToken && Date.now() < cachedTokenExpiry) return cachedToken
  const res = await fetch(`${SIIGO_BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: process.env.SIIGO_USERNAME,
      access_key: process.env.SIIGO_ACCESS_KEY,
    }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.access_token) {
    throw new Error('No se pudo autenticar con Siigo: ' + (data?.message || `status ${res.status}`))
  }
  cachedToken = data.access_token
  // Los tokens de Siigo duran 24h -- se refresca cada 12h para no arriesgarse a que expire a mitad de una peticion.
  cachedTokenExpiry = Date.now() + 12 * 60 * 60 * 1000
  return cachedToken
}

export async function siigoFetch(path, options = {}) {
  const token = await obtenerToken()
  const res = await fetch(`${SIIGO_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
      'Partner-Id': process.env.SIIGO_PARTNER_ID || 'MaissyPOS',
      ...(options.headers || {}),
    },
  })
  const data = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, data }
}
