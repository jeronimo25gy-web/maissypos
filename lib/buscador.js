'use client'
import { supabase } from './supabase'
import { puedeVerModulo } from './permisos'
import { MODULOS } from '@/components/Sidebar'

// Buscador general: personas, clientes, productos, rutas, proveedores,
// vehículos, módulos y sus pestañas, de todas las empresas que el usuario ve. Cada resultado
// lleva a donde está, con ?buscar= para que el módulo abra ya filtrado.
// Respeta permisos: solo busca en lo de los módulos que el usuario puede abrir.

export const normal = (t) => (t || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const corto = (n) => (n || '').replace(/ SAS$/i, '').replace(/ Maissy$/i, '')
const pesos = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO')
const conBuscar = (ruta, texto, extra = '') => `${ruta}?${extra ? extra + '&' : ''}buscar=${encodeURIComponent(texto)}`

// Pestañas de cada módulo: [módulo, vista, título, otras palabras con que se busca].
// Cada módulo abre la pestaña con ?vista= (useDestino).
const SECCIONES = [
  ['financiero', 'res', 'Resultado del mes', 'utilidad ganancia perdida'],
  ['financiero', 'caja', 'Caja y bancos', 'efectivo saldo'],
  ['financiero', 'flujo', 'Flujo de caja', 'proyeccion'],
  ['financiero', 'metas', 'Metas y comisiones', 'objetivo'],
  ['cartera', 'pendientes', 'Por cobrar', 'deudas fiados creditos'],
  ['cartera', 'transferencias', 'Transferencias de cartera', 'abonos'],
  ['cartera', 'historial', 'Pagados', 'historial'],
  ['compras', 'cuentas', 'Por pagar', 'cuentas proveedores deudas facturas'],
  ['compras', 'compra', 'Registrar compra', 'factura'],
  ['compras', 'sugerido', 'Sugerido de pedido', 'reposicion'],
  ['compras', 'historial', 'Historial de compras', ''],
  ['ventas', 'historial', 'Historial de mostrador', 'ventas'],
  ['inventario', 'interna', 'Bodega interna', ''],
  ['rutas', 'rutero', 'Rutero', 'paradas'],
  ['rutas', 'recaudos', 'Recaudos del día', ''],
  ['rutas', 'mapa', 'Mapa de rutas', ''],
  ['rutas', 'clientes', 'Clientes de ruta', ''],
  ['rutas', 'edificios', 'Edificios', 'torres porteria'],
  ['rutas', 'puntos', 'Puntos de venta', ''],
  ['rutas', 'descuentos', 'Descuentos de ruta', ''],
  ['transferencias', 'pend', 'Transferencias por confirmar', ''],
  ['transferencias', 'hist', 'Historial de transferencias', ''],
  ['transferencias', 'falta', 'A quién le falta', 'transferencias'],
  ['costeo', 'paquete', 'Costo por paquete', ''],
  ['costeo', 'insumos', 'Precios de insumos', ''],
  ['costeo', 'mes', 'Costos del mes', ''],
  ['produccion', 'plan', 'Plan del día', ''],
  ['produccion', 'lotes', 'Lotes de cocción', ''],
  ['produccion', 'rinde', 'Rendimiento', ''],
  ['produccion', 'std', 'Estándares', ''],
  ['produccion', 'mano', 'Anotar a mano', ''],
  ['nomina', 'liquidacion', 'Liquidación de nómina', 'quincena'],
  ['nomina', 'novedades', 'Novedades de nómina', 'bonificacion descuento horas extra recargo'],
  ['nomina', 'prestamos', 'Préstamos', ''],
  ['nomina', 'empleados', 'Empleados', ''],
  ['nomina', 'costo', 'Costo laboral', ''],
  ['nomina', 'comprobantes', 'Comprobantes de pago', 'colillas desprendibles'],
  ['vehiculos', 'preop', 'Preoperacional', ''],
  ['vehiculos', 'conductores', 'Conductores', 'licencias'],
  ['vehiculos', 'activos', 'Activos fijos', ''],
  ['maestros', 'productos&seccion=categorias', 'Categorías de productos', ''],
  ['maestros', 'productos&seccion=promociones', 'Promociones', ''],
  ['maestros', 'proveedores', 'Proveedores', ''],
  ['maestros', 'clientes', 'Clientes', ''],
  ['maestros', 'vendedores', 'Vendedores y rutas', ''],
  ['maestros', 'cuentas', 'Cuentas de pago', 'bancos'],
  ['configuracion', 'empresa', 'Datos de la empresa', ''],
  ['configuracion', 'usuarios', 'Usuarios y permisos', 'roles'],
  ['configuracion', 'parametros', 'Parámetros de operación', ''],
  ['configuracion', 'facturacion', 'Facturación electrónica', 'dian'],
  ['configuracion', 'cuenta', 'Mi cuenta', 'contrasena'],
]

let cache = null
export const olvidarIndice = () => { cache = null }

export async function cargarIndice(usuario) {
  const clave = usuario?.id
  if (cache && cache.clave === clave && Date.now() - cache.t < 5 * 60000) return cache.items
  const puede = (id, roles) => puedeVerModulo(usuario, id, roles)
  const { data: emps } = await supabase.from('empresas').select('id, nombre, modelos').eq('activo', true)
  const empresas = (emps || []).filter(e => !usuario?.empresas || usuario.empresas.includes(e.id))
  const ids = empresas.map(e => e.id)
  const modelos = empresas.flatMap(e => e.modelos || [])
  const varias = ids.length > 1
  const de = (id) => varias ? ` · ${corto(empresas.find(e => e.id === id)?.nombre)}` : ''
  const nada = Promise.resolve({ data: [] })
  const [emp, vend, cli, prod, rut, prov, veh] = await Promise.all([
    puede('nomina', ['admin']) ? supabase.from('empleados').select('id, nombre, cargo, empresa_id, documento').eq('activo', true).in('empresa_id', ids) : nada,
    puede('rutas', ['admin', 'auxiliar']) ? supabase.from('vendedores').select('id, nombre, empresa_id, ruta_id, rutas(nombre)').eq('estado', true).in('empresa_id', ids) : nada,
    puede('cartera', ['admin', 'auxiliar']) ? supabase.from('clientes').select('id, nombre, barrio, telefono, empresa_id, rutas(nombre)').eq('estado', true).in('empresa_id', ids) : nada,
    supabase.from('productos').select('id, nombre, sku, precio_venta, presentacion, tipo, empresa_id').eq('estado', true).in('empresa_id', ids),
    supabase.from('rutas').select('id, nombre, empresa_id').eq('estado', true).in('empresa_id', ids),
    puede('compras', ['admin', 'auxiliar']) ? supabase.from('proveedores').select('id, nombre, telefono, empresa_id').eq('estado', true).in('empresa_id', ids) : nada,
    puede('vehiculos', ['admin']) ? supabase.from('vehiculos').select('id, placa, marca, modelo, empresa_id').in('empresa_id', ids) : nada,
  ])
  const items = []
  const add = (grupo, titulo, detalle, href, extra = '') => items.push({ grupo, titulo, detalle, href, clave: normal(`${titulo} ${extra}`) })

  const modulos = MODULOS.filter(m => !m.oculto && (!m.modelos || m.modelos.some(x => modelos.includes(x))) && (m.requierePermiso ? !!usuario?.[m.requierePermiso] : puede(m.id, m.roles || [])))
  modulos.forEach(m => add('Módulos', m.nombre, 'Abrir el módulo', m.ruta))
  SECCIONES.forEach(([id, vista, titulo, extra]) => {
    const m = modulos.find(x => x.id === id)
    if (!m) return
    if (id === 'configuracion' && vista !== 'cuenta' && !usuario?.gerencia) return
    if (id === 'costeo' && !modelos.includes('produccion')) return // en distribucion Costos no lleva pestañas
    add('Secciones', titulo, m.nombre, `${m.ruta}?vista=${vista}`, extra)
  })
  if (usuario?.rol === 'admin') add('Módulos', 'Inicio', 'Abrir el módulo', '/ejecutivo')
  if (['admin', 'auxiliar'].includes(usuario?.rol)) add('Módulos', 'Tareas', 'Abrir el módulo', '/tareas')

  ;(emp.data || []).forEach(e => add('Personas', e.nombre, `${e.cargo || 'Empleado'}${de(e.empresa_id)} · Nómina`, `/nomina?vista=empleados&empleado=${e.id}`, e.documento || ''))
  ;(vend.data || []).forEach(v => add('Personas', v.nombre, `Vendedor${v.rutas?.nombre ? ' · ' + v.rutas.nombre : ''}${de(v.empresa_id)}`, puede('maestros', ['admin']) ? `/maestros?vista=vendedores&vendedor=${v.id}` : v.ruta_id ? `/rutas?ruta=${v.ruta_id}` : '/rutas'))
  ;(cli.data || []).forEach(c => add('Clientes', c.nombre, [c.barrio, c.rutas?.nombre, c.telefono].filter(Boolean).join(' · ') + de(c.empresa_id), puede('maestros', ['admin']) ? `/maestros?vista=clientes&cliente=${c.id}` : conBuscar('/cartera', c.nombre), `${c.barrio || ''} ${c.telefono || ''}`))
  const verProducto = puede('maestros', ['admin'])
  ;(prod.data || []).filter(p => p.tipo !== 'materia_prima' || verProducto).forEach(p => add('Productos', p.nombre,
    `${p.sku}${p.presentacion ? ' · ' + p.presentacion : ''}${Number(p.precio_venta) ? ' · ' + pesos(p.precio_venta) : ''}${de(p.empresa_id)}`,
    verProducto ? `/maestros?vista=productos&producto=${p.id}` : '/inventario', p.sku))
  ;(rut.data || []).forEach(r => add('Rutas', r.nombre, `Ruta${de(r.empresa_id)}`, `/rutas?ruta=${r.id}`))
  ;(prov.data || []).forEach(p => add('Proveedores', p.nombre, `Proveedor${p.telefono ? ' · ' + p.telefono : ''}${de(p.empresa_id)}`, verProducto ? `/maestros?vista=proveedores&proveedor=${p.id}` : '/compras'))
  ;(veh.data || []).forEach(v => add('Vehículos', v.placa, [v.marca, v.modelo].filter(Boolean).join(' ') + de(v.empresa_id), `/vehiculos?vehiculo=${v.id}`))

  cache = { clave, t: Date.now(), items }
  return items
}

const ORDEN = ['Módulos', 'Secciones', 'Personas', 'Clientes', 'Productos', 'Rutas', 'Proveedores', 'Vehículos']

// Cada palabra escrita tiene que ser el comienzo de alguna palabra del
// resultado ("sebastian pie" encuentra "Sebastián Piedrahíta").
export function buscar(items, texto, porGrupo = 5) {
  const ws = normal(texto).split(/[^a-z0-9]+/).filter(Boolean)
  if (!ws.length) return []
  const hits = items.filter(it => { const palabras = it.clave.split(/[^a-z0-9]+/); return ws.every(w => palabras.some(p => p.startsWith(w))) })
  const q = ws.join(' ')
  hits.sort((a, b) => (b.clave.startsWith(q) - a.clave.startsWith(q)) || a.titulo.length - b.titulo.length)
  const grupos = []
  ORDEN.forEach(g => { const l = hits.filter(h => h.grupo === g); if (l.length) grupos.push({ grupo: g, items: l.slice(0, porGrupo), total: l.length }) })
  return grupos
}
