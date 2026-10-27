// Cantidades que se venden por mitades: la canasta de huevos se vende entera o
// media (0,5). Lo demás va por unidades enteras.
export const pasoDe = (sku) => /^HUE-/.test(String(sku || '')) ? 0.5 : 1

// Lo escrito en la casilla, redondeado al paso del producto.
export const leerCantidad = (texto, sku) => {
  const n = Number(String(texto ?? '').replace(',', '.')) || 0
  const paso = pasoDe(sku)
  return Math.max(0, Math.round(n / paso) * paso)
}

// Sumar o restar un paso sin arrastrar decimales de punto flotante.
export const sumarPaso = (actual, sku, signo) => Math.max(0, Math.round(((Number(actual) || 0) + signo * pasoDe(sku)) * 2) / 2)

// "1", "0,5", "2,5".
export const textoCantidad = (n) => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })
