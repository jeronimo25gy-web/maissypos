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

// Precio al que se liquida lo vendido SIN ticket mientras rige la promo. Por
// defecto el de lista: mientras no todos usan Mi ruta no se sabe si eso salio
// en promo o suelto. Con sin_ticket_a_suelta se cobra como suelta.
export const precioSinTicket = (precioNormal, promo) => (promo?.sin_ticket_a_suelta ? precioConPromo(precioNormal, promo) : precioNormal)

// Productos que se venden como otro (productos.vende_como_sku): en Mi ruta son
// uno solo en el carro y en el ticket, y en la liquidacion los tickets se
// cuadran contra lo vendido de todo el grupo, aunque la devolucion se cuente
// por producto. Devuelve { sku: valor esperado } por renglon.
export const valorPorGrupo = (lineas, tickets, prodDe) => {
  const grupos = {}
  lineas.forEach(l => { const g = prodDe(l.sku)?.vende_como_sku || l.sku; (grupos[g] = grupos[g] || []).push(l) })
  const valores = {}
  Object.values(grupos).forEach(ls => {
    const sinTicket = ls.some(l => prodDe(l.sku)?.sinTicket)
    if (ls.length === 1) {
      const l = ls[0]
      valores[l.sku] = valorVendido(l.vendidoNeto, l.precio, sinTicket ? null : tickets[l.sku])
      return
    }
    const t = sinTicket ? null : ls.reduce((a, l) => tickets[l.sku] ? { unidades: a.unidades + tickets[l.sku].unidades, valor: a.valor + tickets[l.sku].valor } : a, { unidades: 0, valor: 0 })
    const vendido = ls.reduce((s, l) => s + l.vendidoNeto, 0)
    const aLista = ls.reduce((s, l) => s + l.vendidoNeto * l.precio, 0)
    if (!t || !(t.unidades > 0) || !(vendido > 0)) { ls.forEach(l => { valores[l.sku] = valorVendido(l.vendidoNeto, l.precio, null) }); return }
    const total = vendido >= t.unidades ? t.valor + (vendido - t.unidades) * (aLista / vendido) : vendido * (t.valor / t.unidades)
    ls.forEach(l => { valores[l.sku] = total * (l.vendidoNeto / vendido) })
  })
  return valores
}

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
