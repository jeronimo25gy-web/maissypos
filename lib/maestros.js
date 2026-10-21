'use client'
import { supabase } from './supabase'
import { calcularStockPorSku } from './inventario-helpers'

// Datos de Maestros → Productos de una empresa: productos con su costo de
// última compra, venta diaria, existencias, precios especiales, producto
// equivalente en la otra empresa del grupo y lo que falta por completar.
const sumarDias = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }
async function todo(armar) {
  const out = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await armar().range(desde, desde + 999)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}
// "RUTA RESIDENCIAL 1" → "Residencial 1"; "PUNTO DE VENTA 2" → "Punto de Venta 2".
export const nombreLindo = (n) => String(n || '').replace(/^RUTA\s+/i, '').toLowerCase().replace(/(^|\s)(\S)/g, (_, a, b) => a + b.toUpperCase()).replace(/\s(De|Del|La|Las|Los|Y)\b/g, (m) => m.toLowerCase())
export const esBolsa = (p) => /^BOL-/.test(p?.sku || '') || p?.categoria === 'Insumos de reparto'
export const margenDe = (precio, costo) => Number(precio) > 0 && Number(costo) > 0 ? (Number(precio) - Number(costo)) / Number(precio) * 100 : null

export async function cargarProductos(empresaId, hoy, produce) {
  const hace14 = sumarDias(hoy, -13)
  const [prods, cats, provs, stock, liq, ve, compras, rp, cp, rutas, clientes] = await Promise.all([
    todo(() => supabase.from('productos').select('*').eq('empresa_id', empresaId).order('categoria').order('orden_despacho', { ascending: true, nullsFirst: false }).order('nombre')),
    supabase.from('categorias_producto').select('*').eq('empresa_id', empresaId).order('nombre').then(r => r.data || []),
    supabase.from('proveedores').select('id, nombre, estado').eq('empresa_id', empresaId).order('nombre').then(r => r.data || []),
    calcularStockPorSku({ empresaId }).catch(() => ({})),
    todo(() => supabase.from('liquidaciones').select('sku, vendido_neto').eq('empresa_id', empresaId).gte('fecha', hace14).lte('fecha', hoy)),
    todo(() => supabase.from('ventas_encab').select('ventas_detalle(sku, cantidad)').eq('empresa_id', empresaId).neq('estado', 'anulada').gte('fecha', hace14).lte('fecha', hoy)),
    todo(() => supabase.from('compras').select('sku, precio_unitario, fecha').eq('empresa_id', empresaId).gt('precio_unitario', 0).order('fecha', { ascending: false }).limit(2000)),
    supabase.from('rutas_precios').select('ruta_id, sku, precio_especial').eq('empresa_id', empresaId).then(r => r.data || []),
    supabase.from('clientes_precios').select('cliente_id, sku, precio_especial').eq('empresa_id', empresaId).then(r => r.data || []),
    supabase.from('rutas').select('id, nombre').eq('empresa_id', empresaId).then(r => r.data || []),
    supabase.from('clientes').select('id, nombre').eq('empresa_id', empresaId).then(r => r.data || []),
  ])
  const venta = {}
  liq.forEach(l => { venta[l.sku] = (venta[l.sku] || 0) + Number(l.vendido_neto || 0) })
  ve.forEach(v => (v.ventas_detalle || []).forEach(d => { venta[d.sku] = (venta[d.sku] || 0) + Number(d.cantidad || 0) }))
  const ultima = {}
  compras.forEach(c => { if (!ultima[c.sku]) ultima[c.sku] = c })
  const nombreRuta = Object.fromEntries(rutas.map(r => [r.id, nombreLindo(r.nombre)]))
  const nombreCliente = Object.fromEntries(clientes.map(c => [c.id, c.nombre]))
  const proveedor = Object.fromEntries(provs.map(p => [p.id, p.nombre]))

  // Producto equivalente en la otra empresa del grupo (enlazado en cualquiera de los dos sentidos).
  const ids = prods.map(p => p.id)
  const espejoIds = prods.map(p => p.producto_espejo_id).filter(Boolean)
  const [{ data: e1 }, { data: e2 }] = await Promise.all([
    espejoIds.length ? supabase.from('productos').select('id, sku, nombre, precio_venta, costo_compra, empresa_id, empresas(nombre)').in('id', espejoIds) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from('productos').select('id, sku, nombre, precio_venta, costo_compra, empresa_id, producto_espejo_id, empresas(nombre)').in('producto_espejo_id', ids).neq('empresa_id', empresaId) : Promise.resolve({ data: [] }),
  ])
  const espejo = {}
  ;(e1 || []).forEach(x => { prods.filter(p => p.producto_espejo_id === x.id).forEach(p => { espejo[p.id] = x }) })
  ;(e2 || []).forEach(x => { if (!espejo[x.producto_espejo_id]) espejo[x.producto_espejo_id] = x })
  // Precio pactado entre las empresas: el especial del cliente que es la otra
  // empresa (se reconoce por su NIT), o el precio de lista si no hay pactado.
  const otras = [...new Set(Object.values(espejo).map(x => x.empresa_id))]
  const pactado = {} // `${empresaVendedora}|${sku}` -> precio
  if (otras.length) {
    const { data: emps } = await supabase.from('empresas').select('id, nit').in('id', [empresaId, ...otras])
    const nit = Object.fromEntries((emps || []).map(e => [e.id, String(e.nit || '').replace(/\D/g, '')]))
    for (const [vende, compra] of [[empresaId, otras], ...otras.map(o => [o, [empresaId]])]) {
      const nits = compra.map(c => nit[c]).filter(Boolean)
      if (!nits.length) continue
      const { data: cls } = await supabase.from('clientes').select('id, nit').eq('empresa_id', vende).not('nit', 'is', null)
      const ids = (cls || []).filter(c => nits.some(n => String(c.nit).replace(/\D/g, '').startsWith(n))).map(c => c.id)
      if (!ids.length) continue
      const { data: pr } = await supabase.from('clientes_precios').select('sku, precio_especial').in('cliente_id', ids)
      ;(pr || []).forEach(x => { pactado[`${vende}|${x.sku}`] = Number(x.precio_especial) })
    }
  }

  const productos = prods.map(p => {
    const u = ultima[p.sku]
    const costo = u ? Number(u.precio_unitario) : (Number(p.costo_compra) || null)
    const especiales = [
      ...rp.filter(x => x.sku === p.sku).map(x => ({ tipo: 'Ruta', nombre: nombreRuta[x.ruta_id] || 'Ruta', precio: Number(x.precio_especial) })),
      ...cp.filter(x => x.sku === p.sku).map(x => ({ tipo: 'Cliente', nombre: nombreCliente[x.cliente_id] || 'Cliente', precio: Number(x.precio_especial) })),
    ]
    return {
      ...p, costo, ultimaCompra: u || null, proveedorNombre: proveedor[p.proveedor_id] || null,
      diaria: (venta[p.sku] || 0) / 14, bodega: stock[p.sku] ? Number(stock[p.sku].stockActual) : null,
      especiales: especiales.filter(x => !(x.tipo === 'Cliente' && espejo[p.id] && pactado[`${empresaId}|${p.sku}`] === x.precio)), bajoCosto: costo ? especiales.filter(x => x.precio < costo) : [],
      espejo: espejo[p.id] ? entreEmpresas(p, costo, espejo[p.id], empresaId, pactado, produce) : null,
      margen: margenDe(p.precio_venta, costo),
    }
  })
  return { productos, cats, provs }
}

// Relación con el producto equivalente: quién vende a quién, a qué precio
// pactado y a qué costo lo registra la que compra.
// La empresa que produce le vende a la otra.
function entreEmpresas(p, costo, q, empresaId, pactado, produce) {
  const vendo = !!produce
  const precio = vendo ? (pactado[`${empresaId}|${p.sku}`] ?? Number(p.precio_venta)) : (pactado[`${q.empresa_id}|${q.sku}`] ?? Number(q.precio_venta))
  const costoCompra = vendo ? Number(q.costo_compra) || null : costo
  return { ...q, empresa: q.empresas?.nombre, vendo, precio: precio || null, costoCompra, distinto: precio > 0 && costoCompra > 0 && Math.abs(precio - costoCompra) >= 1 }
}

// Lo que falta completar en los productos activos.
export function porCompletar(productos, produce) {
  const act = productos.filter(p => p.estado)
  const vendibles = act.filter(p => p.tipo !== 'materia_prima' || esBolsa(p))
  return [
    { id: 'minimo', lista: vendibles.filter(p => !Number(p.stock_minimo) && !esBolsa(p)), titulo: (n) => `${n} ${n === 1 ? 'producto' : 'productos'} sin mínimo de inventario`, nota: 'Inventario no puede avisar cuándo pedir' },
    { id: 'costo', lista: act.filter(p => !p.costo && (!produce || p.tipo === 'materia_prima')), titulo: (n) => `${n} sin costo de compra`, nota: (l) => l.slice(0, 4).map(p => p.nombre).join(', ') + (l.length > 4 ? '…' : '') + (l.some(esBolsa) ? ' · el costo de distribución no incluye las bolsas' : '') },
    { id: 'precio', lista: act.filter(p => p.tipo !== 'materia_prima' && !Number(p.precio_venta)), titulo: (n) => `${n} sin precio de venta`, nota: (l) => l.map(p => p.nombre).join(', ') },
    { id: 'proveedor', lista: produce ? [] : act.filter(p => !p.proveedor_id && !esBolsa(p)), titulo: (n) => `${n} sin proveedor`, nota: (l) => l.map(p => p.nombre).join(', ') + ' · no aparece en el pedido por proveedor' },
    { id: 'presentacion', lista: act.filter(p => p.tipo !== 'materia_prima' && !String(p.presentacion || '').trim()), titulo: (n) => `${n} sin presentación`, nota: (l) => l.map(p => p.nombre).join(', ') },
    { id: 'especial', lista: act.filter(p => p.bajoCosto.length), titulo: (n) => `${n} con precios especiales por debajo del costo`, nota: (l) => l.map(p => `${p.nombre} (${p.bajoCosto.map(x => x.nombre).join(', ')})`).join(' · ') },
    { id: 'espejo', lista: act.filter(p => p.espejo?.distinto), titulo: (n) => `${n} con precio entre empresas distinto al costo registrado`, nota: (l) => l.map(p => `${p.nombre} (${p.espejo.vendo ? 'se vende' : 'se compra'} a $${Math.round(p.espejo.precio).toLocaleString('es-CO')}, costo $${Math.round(p.espejo.costoCompra).toLocaleString('es-CO')})`).join(' · ') },
  ].filter(x => x.lista.length)
}

export async function cargarHistorial(productoId) {
  const { data } = await supabase.from('productos_precios_historial').select('*').eq('producto_id', productoId).order('created_at', { ascending: false }).limit(12)
  return data || []
}
