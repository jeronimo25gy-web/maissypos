// Descuentos dados en los tickets de ruta: cada renglón vendido por debajo de
// su precio normal (precio especial del cliente o precio ajustado). Las promos
// (6 x $14.000) no cuentan: son el precio de la promoción, no un descuento.
// Es informativo: el valor del ticket ya trae el descuento, así que no se resta
// otra vez de lo que entrega el vendedor.
// precioNormal(sku) -> precio de la unidad en esa ruta (con promo: el de suelta).
export const descuentosDeTickets = (ventas, precioNormal) => {
  const filas = []
  ;(ventas || []).forEach(v => (v.ventas_ruta_detalle || []).forEach(d => {
    if (d.promo_id) return
    const cantidad = Number(d.cantidad) || 0
    const normal = Number(precioNormal(d.sku)) || 0
    const cobrado = cantidad > 0 ? Number(d.subtotal || 0) / cantidad : 0
    const descuento = Math.round((normal - cobrado) * cantidad)
    if (cantidad > 0 && normal > 0 && descuento > 0) {
      filas.push({ key: `${v.id}-${d.sku}-${filas.length}`, numero: v.numero, cliente: v.nombre_cliente || 'Venta en la calle', sku: d.sku, nombre: d.nombre || d.sku, cantidad, normal, cobrado, descuento })
    }
  }))
  return filas
}
