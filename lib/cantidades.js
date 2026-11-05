// Cantidades que se venden por mitades: la canasta de huevos, la arepa para
// rellenar… Se marca en Maestros, Productos ("Se vende por mitades"). Lo demás
// va por unidades enteras. Cada pantalla registra sus productos al cargarlos; en
// el mostrador de dos empresas la clave lleva la empresa ("empresa:sku").
// Los que se venden por peso (Kilo de Masa) admiten kilos con tres decimales.
const mitades = new Set()
const pesos = new Set()
export const registrarMitades = (productos, empresaId) => (productos || []).forEach(p => {
  const conjunto = p.por_peso ? pesos : p.por_mitades ? mitades : null
  if (!conjunto) return
  conjunto.add(p.sku)
  if (empresaId) conjunto.add(`${empresaId}:${p.sku}`)
})
export const pasoDe = (clave) => mitades.has(String(clave || '')) ? 0.5 : 1
export const esPeso = (clave) => pesos.has(String(clave || ''))

// Lo escrito en la casilla, redondeado al paso del producto.
export const leerCantidad = (texto, clave) => {
  const n = Number(String(texto ?? '').replace(',', '.')) || 0
  if (esPeso(clave)) return Math.max(0, Math.round(n * 1000) / 1000)
  const paso = pasoDe(clave)
  return Math.max(0, Math.round(n / paso) * paso)
}

// Sumar o restar un paso sin arrastrar decimales de punto flotante.
export const sumarPaso = (actual, clave, signo) => esPeso(clave)
  ? Math.max(0, Math.round(((Number(actual) || 0) + signo) * 1000) / 1000)
  : Math.max(0, Math.round(((Number(actual) || 0) + signo * pasoDe(clave)) * 2) / 2)

// "1", "0,5", "2,5", "3,333".
export const textoCantidad = (n) => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 3 })
