import { supabase } from './supabase'

// Promociones por cantidad sobre un mismo producto (ej. Arepa Tela, 6 por
// $14.000). Se despachan y descuentan como el producto normal; al vender se
// arman solas (8 = 1 promo + 2 sueltas) y en la liquidacion se cobra lo que
// dicen los tickets, y lo vendido sin ticket a precio de suelta.

export const cargarPromos = async (empresaId) => {
  const { data } = await supabase.from('promociones').select('*').eq('empresa_id', empresaId).eq('activa', true)
  return data || []
}

// La promo que rige para ese producto en esa ruta y esa fecha (o null).
// En Mi ruta se usa sin fecha: el vendedor la vende desde ya y el ticket la
// cobra; la fecha solo cambia como se liquida lo vendido sin ticket.
export const promoVigente = (promos, sku, rutaId, fecha, { sinFecha = false } = {}) => (promos || []).find(p =>
  p.sku === sku && p.activa !== false &&
  (sinFecha || !p.vigente_desde || p.vigente_desde <= fecha) &&
  (!p.ruta_id || p.ruta_id === rutaId) &&
  !(p.excluir_rutas || []).includes(rutaId)
) || null

// Precio de la unidad mientras rige la promo (la suelta), o el de siempre.
export const precioConPromo = (precioNormal, promo) => (promo?.precio_suelta ? Number(promo.precio_suelta) : precioNormal)

// Renglones del ticket: primero las promos completas, luego las sueltas.
export const armarLineas = ({ sku, nombre, precio }, unidades, promo) => {
  if (!unidades) return []
  if (!promo || unidades < promo.cantidad) return [{ sku, nombre, cantidad: unidades, precio, subtotal: unidades * precio }]
  const paquetes = Math.floor(unidades / promo.cantidad)
  const sueltas = unidades - paquetes * promo.cantidad
  const lineas = [{ sku, nombre: `${promo.nombre} ${nombre}`, cantidad: paquetes * promo.cantidad, paquetes, promo_id: promo.id, precio: Number(promo.precio), subtotal: paquetes * Number(promo.precio) }]
  if (sueltas > 0) lineas.push({ sku, nombre, cantidad: sueltas, precio, subtotal: sueltas * precio })
  return lineas
}

// Lo que debe entregar el vendedor por un producto: lo vendido con ticket a lo
// que dice el ticket, y lo demas a precio de unidad.
export const valorVendido = (vendido, precio, ticket) => {
  if (!ticket || !(ticket.unidades > 0)) return vendido * precio
  if (vendido >= ticket.unidades) return ticket.valor + (vendido - ticket.unidades) * precio
  return vendido * (ticket.valor / ticket.unidades)
}

// { sku: { unidades, valor } } de los tickets activos de unos despachos.
export const ticketsPorSku = (ventas) => {
  const m = {}
  ;(ventas || []).forEach(v => (v.ventas_ruta_detalle || []).forEach(d => {
    const t = (m[d.sku] = m[d.sku] || { unidades: 0, valor: 0 })
    t.unidades += Number(d.cantidad || 0)
    t.valor += Number(d.subtotal || 0)
  }))
  return m
}
