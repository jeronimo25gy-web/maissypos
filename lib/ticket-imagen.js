// Dibuja el ticket de venta en ruta como imagen (ancho de tirilla de 80 mm),
// para compartirlo por WhatsApp como foto y, mas adelante, mandarlo a la
// impresora bluetooth. Se dibuja a mano en un canvas para que salga igual en
// cualquier celular.
const ANCHO = 576
const MARGEN = 36
const ESCALA = 2
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "Courier New", monospace'
const fmt = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO')
const PAGO = { efectivo: 'Efectivo', transferencia: 'Transferencia', credito: 'Crédito' }

const cargarImagen = (src) => new Promise((resolve) => {
  if (!src) return resolve(null)
  const img = new Image()
  img.crossOrigin = 'anonymous'
  const t = setTimeout(() => resolve(null), 4000)
  img.onload = () => { clearTimeout(t); resolve(img) }
  img.onerror = () => { clearTimeout(t); resolve(null) }
  img.src = src
})

export async function imagenTicket(t) {
  const logo = await cargarImagen(t.empresa?.logo_url)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const fuente = (px, negrita) => `${negrita ? 'bold ' : ''}${px}px ${MONO}`
  const util = ANCHO - MARGEN * 2

  // Parte un texto en renglones que quepan en el ancho dado.
  const partir = (texto, px, negrita, ancho) => {
    ctx.font = fuente(px, negrita)
    const palabras = String(texto).split(' ')
    const renglones = []
    let actual = ''
    palabras.forEach(p => {
      const prueba = actual ? actual + ' ' + p : p
      if (ctx.measureText(prueba).width > ancho && actual) { renglones.push(actual); actual = p } else actual = prueba
    })
    if (actual) renglones.push(actual)
    return renglones
  }

  // Cada fila: { centro } | { izq, der } | { linea } | { espacio } | { logo }
  const filas = []
  const centro = (texto, px = 22, negrita = false) => partir(texto, px, negrita, util).forEach(r => filas.push({ centro: r, px, negrita }))
  const par = (izq, der, px = 22, negrita = false) => {
    ctx.font = fuente(px, negrita)
    const anchoDer = ctx.measureText(der).width
    const renglones = partir(izq, px, negrita, util - anchoDer - 16)
    renglones.forEach((r, i) => filas.push({ izq: r, der: i === renglones.length - 1 ? der : '', px, negrita }))
  }
  const linea = () => filas.push({ linea: true })
  const espacio = (h = 10) => filas.push({ espacio: h })

  if (logo) filas.push({ logo })
  centro(t.empresa?.nombre || 'Maissy', 26, true)
  if (t.empresa?.nit) centro(`NIT ${t.empresa.nit}`)
  if (t.empresa?.telefono) centro(`WhatsApp ${t.empresa.telefono}`)
  linea()
  par(`Ticket #${String(t.numero).padStart(6, '0')}`, '')
  par(new Date(t.created_at).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }), '')
  par(`Cliente: ${t.cliente}`, '')
  if (t.direccion) par(t.direccion, '')
  par(`Vendedor: ${t.vendedor}`, '')
  linea()
  t.lineas.forEach(l => par(`${l.paquetes || l.cantidad} ${l.nombre}`, Math.round(l.subtotal).toLocaleString('es-CO')))
  if (t.valor_domicilio > 0) par('Domicilio', Math.round(t.valor_domicilio).toLocaleString('es-CO'))
  linea()
  par('TOTAL', fmt(t.total), 30, true)
  espacio(4)
  par('Pagó en', (PAGO[t.forma_pago] || t.forma_pago) + (t.forma_pago === 'transferencia' ? ' (por verificar)' : ''))
  if (t.forma_pago === 'credito' && t.fecha_pago) par('Paga el', new Date(t.fecha_pago + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }))
  if (t.saldoAnterior > 0) par('Saldo anterior', fmt(t.saldoAnterior))
  linea()
  centro('Gracias por preferir Maissy')
  centro('Documento de control, no es factura electrónica', 17)

  const altoFila = (f) => f.logo ? Math.min(150, f.logo.height * Math.min(1, 420 / f.logo.width)) + 14 : f.linea ? 26 : f.espacio ? f.espacio : Math.round(f.px * 1.5)
  const alto = MARGEN * 2 + filas.reduce((s, f) => s + altoFila(f), 0)

  canvas.width = ANCHO * ESCALA
  canvas.height = alto * ESCALA
  ctx.scale(ESCALA, ESCALA)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, ANCHO, alto)
  ctx.fillStyle = '#1C1B19'
  ctx.strokeStyle = '#1C1B19'
  ctx.textBaseline = 'middle'

  let y = MARGEN
  filas.forEach(f => {
    const h = altoFila(f)
    if (f.logo) {
      const esc = Math.min(1, 420 / f.logo.width, 150 / f.logo.height)
      const w = f.logo.width * esc, lh = f.logo.height * esc
      ctx.drawImage(f.logo, (ANCHO - w) / 2, y, w, lh)
    } else if (f.linea) {
      ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(MARGEN, y + h / 2); ctx.lineTo(ANCHO - MARGEN, y + h / 2); ctx.stroke()
      ctx.setLineDash([])
    } else if (!f.espacio) {
      ctx.font = fuente(f.px, f.negrita)
      if (f.centro != null) { ctx.textAlign = 'center'; ctx.fillText(f.centro, ANCHO / 2, y + h / 2) }
      else {
        ctx.textAlign = 'left'; ctx.fillText(f.izq, MARGEN, y + h / 2)
        if (f.der) { ctx.textAlign = 'right'; ctx.fillText(f.der, ANCHO - MARGEN, y + h / 2) }
      }
    }
    y += h
  })

  const blob = await new Promise(r => {
    try { canvas.toBlob(b => r(b), 'image/png') } catch { r(null) }
  })
  if (!blob) return null
  return new File([blob], `ticket-${String(t.numero).padStart(6, '0')}.png`, { type: 'image/png' })
}
