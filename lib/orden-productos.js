// Orden fijo en que se carga el carro (productos.orden_despacho). Las centenas
// son el grupo fisico, asi que despacho/imprimir pueden separar por grupo sin
// depender de la categoria (la chocolo con mozzarella es arepa pero va en la
// nevera con los lacteos).
const GRUPOS = [
  { desde: 100, nombre: 'Arepas' },
  { desde: 200, nombre: 'Panadería' },
  { desde: 300, nombre: 'Nevera' },
  { desde: 400, nombre: 'Cárnicos' },
  { desde: 500, nombre: 'Huevos' },
]

export const grupoDespacho = (p) => {
  const n = p?.orden_despacho
  if (n == null) return p?.categoria || 'Otros'
  return [...GRUPOS].reverse().find(g => n >= g.desde)?.nombre || 'Otros'
}

const ordenDe = (p) => (p?.orden_despacho == null ? 100000 : p.orden_despacho)

export const compararProductos = (a, b) =>
  ordenDe(a) - ordenDe(b) || (a?.nombre || '').localeCompare(b?.nombre || '')

// Ordena cualquier lista cuyos elementos tengan el producto en `producto`
// (lineas de despacho/liquidacion) o sean el producto mismo.
export const ordenarPorDespacho = (lista, getProducto = (x) => x.producto || x) =>
  [...lista].sort((a, b) => compararProductos(getProducto(a), getProducto(b)))
