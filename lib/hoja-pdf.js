// Hoja de despacho dibujada directo en el PDF (texto y líneas, no una foto de
// la pantalla): sale nítida y con el tamaño exacto del papel en cualquier
// navegador. Mismo contenido que components/HojaDespacho.js. Unidades: puntos
// (media carta = 396 × 612).
import { n, nombreRuta } from '@/components/HojaDespacho'

export const MEDIA = { w: 396, h: 612 }
const TINTA = [28, 27, 25], GRIS = [90, 87, 80], LINEA = [184, 180, 170], ROJO = [196, 18, 48]
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const fechaLarga = (f) => { const t = new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '').replace(',', ''); return t.charAt(0).toUpperCase() + t.slice(1) }

// Lienzo de media carta en (ox, oy) de la pagina. Con girar, todo se dibuja
// rotado 180° (para impresoras que devuelven la hoja de cabeza).
function lienzo(pdf, ox, oy, girar, anchoPagina, altoPagina) {
  const P = (x, y) => girar ? [anchoPagina - (ox + x), altoPagina - (oy + y)] : [ox + x, oy + y]
  const fuente = (tam, negrita, color = TINTA) => { pdf.setFont('helvetica', negrita ? 'bold' : 'normal'); pdf.setFontSize(tam); pdf.setTextColor(...color) }
  const ancho = (s) => pdf.getTextWidth(s)
  // Recorta con "…" si no cabe en max.
  const cabe = (s, max) => {
    if (!max || ancho(s) <= max) return s
    let t = s
    while (t.length > 1 && ancho(t + '…') > max) t = t.slice(0, -1)
    return t + '…'
  }
  const texto = (s, x, y, { align = 'left', max } = {}) => {
    const t = cabe(String(s ?? ''), max)
    const w = ancho(t)
    const xl = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x
    const [X, Y] = P(xl, y)
    if (girar) pdf.text(t, X, Y, { angle: 180 })
    else pdf.text(t, X, Y)
  }
  const linea = (x1, y1, x2, y2, grosor = 0.6, color = LINEA) => {
    pdf.setDrawColor(...color); pdf.setLineWidth(grosor)
    const [a, b] = P(x1, y1), [c, d] = P(x2, y2)
    pdf.line(a, b, c, d)
  }
  return { fuente, texto, linea, ancho }
}

export function dibujarFrente(pdf, h, { ox = 0, oy = 0, girar = false, anchoPagina, altoPagina, logo }) {
  const { fuente, texto, linea } = lienzo(pdf, ox, oy, girar, anchoPagina, altoPagina)
  const W = MEDIA.w, H = MEDIA.h, pad = 22, der = W - pad
  // Encabezado
  let y = pad
  if (logo?.data && !girar) {
    const alto = 32, anchoLogo = Math.min(110, alto * (logo.w / logo.h))
    pdf.addImage(logo.data, 'JPEG', ox + pad, oy + y, anchoLogo, alto)
  } else {
    fuente(15, true, ROJO); texto('Maissy', pad, y + 22)
  }
  fuente(6.5, true, ROJO); texto('DESPACHO DE RUTA', der, y + 8, { align: 'right' })
  fuente(12.5, true); texto(nombreRuta(h.d.rutas?.nombre), der, y + 22, { align: 'right', max: 200 })
  if (h.d.dia_carga != null) { fuente(8, true); texto(`Carga del ${DIAS[h.d.dia_carga]}`, der, y + 32, { align: 'right' }) }
  y += 40
  linea(pad, y, der, y, 1.1, TINTA)
  // Datos
  const hora = h.d.hora_cargue ? new Date(h.d.hora_cargue).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) : '—'
  const dato = (et, val, x, yy) => { fuente(8, false, GRIS); texto(et, x, yy); const w = pdf.getTextWidth(et) + 4; fuente(8, false); texto(val, x + w, yy, { max: 150 }) }
  y += 13
  dato('Vendedor', h.d.vendedores?.nombre || '—', pad, y); dato('Fecha', fechaLarga(h.d.fecha), 216, y)
  y += 12
  dato('Cargue', hora, pad, y); dato('Vehículo', h.placa || '—', 216, y)
  y += 12
  dato('Base', '$' + n(h.base), pad, y)
  // Tabla
  const cLleva = 250, cVuelve = 292, cCambio = 333, finTabla = der
  const mLleva = (cLleva + cVuelve) / 2
  y += 16
  fuente(6.3, true, GRIS)
  texto('PRODUCTO', pad + 2, y); texto('LLEVA', mLleva, y, { align: 'center' }); texto('VUELVE', (cVuelve + cCambio) / 2, y, { align: 'center' }); texto('CAMBIO', (cCambio + finTabla) / 2, y, { align: 'center' })
  y += 4
  linea(pad, y, finTabla, y, 1.1, TINTA)
  const conGrupos = h.grupos.length > 1
  const lote = h.productos.some(p => p.lote.includes('del'))
  const pie = 62 + (lote ? 10 : 0)
  const disponible = H - pad - pie - y
  const renglones = h.productos.length + (conGrupos ? h.grupos.length * 0.75 : 0)
  const fila = Math.max(9, Math.min(28, disponible / Math.max(renglones, 1)))
  const letra = Math.max(6.5, Math.min(11, fila * 0.62))
  for (const g of h.grupos) {
    if (conGrupos) {
      const fg = fila * 0.75
      fuente(Math.min(6.3, fg * 0.6), true, GRIS); texto(g.nombre.toUpperCase(), pad + 2, y + fg - 2)
      y += fg
    }
    for (const p of g.items) {
      const conLote = !!p.lote
      fuente(letra, false)
      texto(p.nombre, pad + 2, y + (conLote ? fila * 0.5 : fila * 0.68), { max: cLleva - pad - 8 })
      if (conLote) { fuente(Math.max(5.5, letra * 0.7), false, GRIS); texto(p.lote, pad + 2, y + fila * 0.88, { max: cLleva - pad - 8 }) }
      fuente(letra + 0.5, true); texto(n(p.cantidad), mLleva, y + fila * 0.68, { align: 'center' })
      linea(cVuelve, y, cVuelve, y + fila); linea(cCambio, y, cCambio, y + fila)
      y += fila
      linea(pad, y, finTabla, y)
    }
  }
  // Pie
  let yp = H - pad - pie + 10
  if (lote) { fuente(7, false, GRIS); texto('Cargar primero el lote anterior.', pad, yp); yp += 10 }
  yp += 14
  fuente(8.5, false); texto('Efectivo entregado $', pad, yp)
  linea(pad + pdf.getTextWidth('Efectivo entregado $') + 4, yp + 1, der, yp + 1, 0.6, TINTA)
  yp += 30
  linea(pad, yp, W / 2 - 10, yp, 0.6, TINTA); linea(W / 2 + 10, yp, der, yp, 0.6, TINTA)
  fuente(7, false, GRIS); texto('Despachó', pad, yp + 9); texto('Vendedor recibe', W / 2 + 10, yp + 9)
}

export function dibujarReverso(pdf, h, { ox = 0, oy = 0, girar = false, anchoPagina, altoPagina }) {
  const { fuente, texto, linea } = lienzo(pdf, ox, oy, girar, anchoPagina, altoPagina)
  const W = MEDIA.w, H = MEDIA.h, pad = 22, der = W - pad, medio = W / 2
  let y = pad + 10
  fuente(8.5, true); texto(`${nombreRuta(h.d.rutas?.nombre)} · ${h.d.vendedores?.nombre || ''}`, pad, y, { max: 230 })
  fuente(8, false, GRIS); texto(fechaLarga(h.d.fecha), der, y, { align: 'right' })
  y += 5
  linea(pad, y, der, y, 1.1, TINTA)
  const arriba = y + 4, abajo = H - pad
  linea(medio, arriba, medio, abajo, 0.8, TINTA)
  const titulo = (t, x, yy) => { fuente(7, true); texto(t.toUpperCase(), x, yy) }
  const sub = (a, b, x1, x2, yy) => { fuente(5.8, false, GRIS); texto(a.toUpperCase(), x1, yy); texto(b.toUpperCase(), x2, yy, { align: 'right' }) }
  // Izquierda: transferencias con su total abajo
  const iz1 = pad, iz2 = medio - 10
  titulo('Transferencias', iz1, arriba + 12); sub('Cliente o referencia · banco', 'Valor', iz1, iz2, arriba + 20)
  linea(iz1, abajo - 18, iz2, abajo - 18, 0.8, TINTA)
  fuente(7.5, true); texto('Total transferencias $', iz1, abajo - 4)
  linea(iz1 + pdf.getTextWidth('Total transferencias $') + 4, abajo - 3, iz2, abajo - 3, 0.8, TINTA)
  // Derecha: fiados del dia y secciones
  const de1 = medio + 10, de2 = der
  let yd = arriba
  const visibles = h.fiados.slice(0, 16)
  if (visibles.length) {
    titulo('Fiados que pagan hoy', de1, yd + 12); yd += 16
    const dos = visibles.length > 8, colW = dos ? (de2 - de1 - 8) / 2 : de2 - de1
    const filas = dos ? Math.ceil(visibles.length / 2) : visibles.length
    visibles.forEach((f, i) => {
      const col = dos && i >= filas ? 1 : 0, fi = dos && i >= filas ? i - filas : i
      const x1 = de1 + col * (colW + 8), x2 = x1 + colW, yy = yd + 9 + fi * 11
      fuente(dos ? 6.5 : 7, true); texto(f.nombre_cliente, x1, yy, { max: colW - 40 })
      fuente(dos ? 6.5 : 7, false, GRIS); texto('$' + n(f.saldo), x2, yy, { align: 'right' })
      linea(x1, yy + 2.5, x2, yy + 2.5)
    })
    yd += 9 + filas * 11
    if (h.fiados.length > visibles.length) { fuente(6, false, GRIS); texto(`+${h.fiados.length - visibles.length} más en Mi ruta`, de1, yd + 4); yd += 8 }
    yd += 6
  }
  const secciones = [['Créditos nuevos', 3.2, 'Cliente', 'Valor'], ['Gastos', 1.3, 'En qué', 'Valor'], ['Obsequios y consumo', 1.2, 'Producto · a quién', 'Cant.'], ['Mercancía entre vendedores', 1, 'Pasó o recibió · vendedor', 'Cant.']]
  const total = secciones.reduce((s, x) => s + x[1], 0)
  const libre = abajo - yd
  secciones.forEach(([t, peso, a, b], i) => {
    if (i > 0 || visibles.length) linea(de1, yd, de2, yd, 0.8, TINTA)
    titulo(t, de1, yd + 12); sub(a, b, de1, de2, yd + 20)
    yd += libre * peso / total
  })
}

// Logo como PNG con sus medidas (para no deformarlo).
export async function logoParaPdf(src) {
  if (!src) return null
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        // Achicado y sobre blanco: el PDF queda liviano para la impresora.
        const alto = Math.min(160, img.naturalHeight), ancho = Math.round(img.naturalWidth * alto / img.naturalHeight)
        const c = document.createElement('canvas'); c.width = ancho; c.height = alto
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, ancho, alto); x.drawImage(img, 0, 0, ancho, alto)
        resolve({ data: c.toDataURL('image/jpeg', 0.9), w: ancho, h: alto })
      } catch { resolve(null) }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}
