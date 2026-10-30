import { supabase } from '@/lib/supabase'

// La cuenta a la que el cliente transfiere: la de la ruta en los tickets de
// ruta y la del mostrador en los comprobantes de mostrador y los express.
// Sale en las facturas pagadas por transferencia o a credito.
export const conCuenta = (formaPago) => ['transferencia', 'credito', 'fiado'].includes(formaPago)

const TIPO = { ahorros: 'Ahorros', corriente: 'Corriente', billetera: 'Billetera' }
export const bancoDe = (c) => [c?.banco, TIPO[c?.tipo_cuenta]].filter(Boolean).join(' · ')
export const llaveDe = (c) => (c?.llaves || '').split(',').map(s => s.trim()).filter(Boolean)[0] || ''

// 23619324307 -> 236 193243 07 (como lo escribe Bancolombia); celulares 3-3-4.
export const numeroLindo = (n) => {
  const d = String(n || '').replace(/\D/g, '')
  if (d.length === 11) return `${d.slice(0, 3)} ${d.slice(3, 9)} ${d.slice(9)}`
  if (d.length === 10) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
  return d ? d.replace(/(\d{4})(?=\d)/g, '$1 ') : String(n || '')
}

// Solo sirve si tiene número (las cuentas sin número no se imprimen).
const util = (c) => (c?.numero ? c : null)

export async function cuentaDeRuta(rutaId, empresaId) {
  if (!rutaId) return null
  const { data: r } = await supabase.from('rutas').select('cuenta_id').eq('id', rutaId).eq('empresa_id', empresaId).maybeSingle()
  if (!r?.cuenta_id) return null
  const { data } = await supabase.from('cuentas').select('*').eq('id', r.cuenta_id).maybeSingle()
  return util(data)
}

export async function cuentaMostrador(empresaId) {
  const { data } = await supabase.from('cuentas').select('*').eq('empresa_id', empresaId).eq('mostrador', true).eq('estado', true).maybeSingle()
  return util(data)
}

// Renglones para el mensaje de WhatsApp.
export const textoCuenta = (c) => c ? ['', '*Para transferir*', bancoDe(c), `*${numeroLindo(c.numero)}*`, c.titular || null, llaveDe(c) ? `Llave Bre-B: *${llaveDe(c)}*` : null].filter(l => l !== null) : []

// Logo sin el blanco (o transparente) que sobra alrededor: los logos se suben
// cuadrados y con mucho margen, y en una caja baja se veian recortados.
const recortados = new Map()
export function logoRecortado(url) {
  if (!url) return Promise.resolve(null)
  if (recortados.has(url)) return recortados.get(url)
  const p = new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const t = setTimeout(() => resolve(null), 5000)
    img.onerror = () => { clearTimeout(t); resolve(null) }
    img.onload = () => {
      clearTimeout(t)
      try {
        const w = img.naturalWidth, h = img.naturalHeight
        const lienzo = document.createElement('canvas')
        lienzo.width = w; lienzo.height = h
        const ctx = lienzo.getContext('2d')
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0)
        const px = ctx.getImageData(0, 0, w, h).data
        let x0 = w, y0 = h, x1 = -1, y1 = -1
        for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
          const i = (y * w + x) * 4
          if (px[i] < 242 || px[i + 1] < 242 || px[i + 2] < 242) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
        }
        if (x1 < 0) return resolve(url)
        const m = Math.round(Math.max(w, h) * 0.01)
        x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m)
        const out = document.createElement('canvas')
        out.width = x1 - x0 + 1; out.height = y1 - y0 + 1
        out.getContext('2d').drawImage(lienzo, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
        resolve(out.toDataURL('image/png'))
      } catch { resolve(url) }
    }
    img.src = url
  })
  recortados.set(url, p)
  return p
}
