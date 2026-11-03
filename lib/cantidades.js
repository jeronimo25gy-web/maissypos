// Cantidades que se venden por mitades: la canasta de huevos, la arepa para
// rellenar… Se marca en Maestros, Productos ("Se vende por mitades"). Lo demás
// va por unidades enteras. Cada pantalla registra sus productos al cargarlos; en
// el mostrador de dos empresas la clave lleva la empresa ("empresa:sku").
const mitades = new Set()
export const registrarMitades = (productos, empresaId) => (productos || []).forEach(p => {
  if (!p.por_mitades) return
  mitades.add(p.sku)
  if (empresaId) mitades.add(`${empresaId}:${p.sku}`)
})
export const pasoDe = (clave) => mitades.has(String(clave || '')) ? 0.5 : 1

// Lo escrito en la casilla, redondeado al paso del producto.
export const leerCantidad = (texto, clave) => {
  const n = Number(String(texto ?? '').replace(',', '.')) || 0
  const paso = pasoDe(clave)
  return Math.max(0, Math.round(n / paso) * paso)
}

// Sumar o restar un paso sin arrastrar decimales de punto flotante.
export const sumarPaso = (actual, clave, signo) => Math.max(0, Math.round(((Number(actual) || 0) + signo * pasoDe(clave)) * 2) / 2)

// "1", "0,5", "2,5".
export const textoCantidad = (n) => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })
