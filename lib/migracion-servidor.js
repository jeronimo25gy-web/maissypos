import { randomUUID } from 'node:crypto'
import { pasoPorId, camposDe, llave, llaveCodigo, llaveNit, leerNumero, leerFecha, leerDias, distancia } from './migracion.js'

// Revisa y carga los datos de un cliente nuevo con la llave del servidor. Todo
// se filtra por empresa a mano: aqui no hay RLS que lo haga. Revisar y cargar
// pasan por la misma validacion; a la base solo entra lo que no tiene problemas.
const TANDA = 500
const MAX_FILAS = 20000
const DEPENDEN = { proveedores: ['productos', 'por_pagar'], productos: ['inventario'], clientes: ['cartera'] }
const NOMBRE_PASO = { productos: 'Productos', inventario: 'Inventario inicial', cartera: 'Cartera', por_pagar: 'Cuentas por pagar' }
const pesos = (n) => Number(n).toLocaleString('es-CO', { maximumFractionDigits: 2 })

async function todas(hacer) {
  const salida = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await hacer().range(desde, desde + 999)
    if (error) throw new Error(error.message)
    salida.push(...(data || []))
    if (!data || data.length < 1000) return salida
  }
}

async function insertar(admin, tabla, filas) {
  for (let i = 0; i < filas.length; i += TANDA) {
    const { error } = await admin.from(tabla).insert(filas.slice(i, i + TANDA))
    if (error) throw new Error(`${tabla}: ${error.message}`)
  }
}

async function catalogo(admin, empresaId, pasoId, corte) {
  const lista = (tabla, cols, extra) => todas(() => {
    const q = admin.from(tabla).select(cols).eq('empresa_id', empresaId)
    return (extra ? extra(q) : q).order('id')
  })
  const c = {}
  if (['proveedores', 'productos', 'por_pagar'].includes(pasoId)) c.proveedores = await lista('proveedores', 'id, nombre')
  if (['productos', 'inventario'].includes(pasoId)) c.productos = await lista('productos', 'id, sku, nombre, costo_compra')
  if (pasoId === 'productos') c.categorias = await lista('categorias_producto', 'id, nombre, prefijo_sku')
  if (['clientes', 'cartera'].includes(pasoId)) c.clientes = await lista('clientes', 'id, nombre, nit, codigo, ruta_id, vendedor_id')
  if (pasoId === 'clientes') {
    c.rutas = await lista('rutas', 'id, nombre')
    c.vendedores = await lista('vendedores', 'id, nombre')
    c.rutero = await lista('rutero', 'id, ruta_id, dia_semana, orden')
  }
  if (pasoId === 'inventario') c.conteos = await lista('conteo_fisico', 'id, sku', q => q.eq('fecha', corte))
  if (pasoId === 'cartera') c.iniciales = await lista('cartera_fiados', 'id, cliente_id, nombre_cliente, valor_original, fecha_fiado', q => q.eq('es_saldo_inicial', true))
  if (pasoId === 'por_pagar') c.pendientes = await lista('facturas_proveedores', 'id, proveedor_id', q => q.eq('estado', 'pendiente').gt('total_pendiente', 0))
  return c
}

const problema = (r, grupo, motivo, extra = {}) => r.problemas.push({ grupo, motivo, ...extra })

function limpiar(f, campos) {
  const r = { fila: f.fila, orig: f.orig || f, v: {}, banderas: f.banderas || {}, estado: 'ok', problemas: [], unitario: 1 }
  for (const c of campos) {
    const crudo = f[c.id] ?? ''
    const texto = String(crudo).trim()
    if (c.tipo === 'numero' || c.tipo === 'entero') {
      const n = leerNumero(crudo)
      if (n.vacio) {
        r.v[c.id] = null
        if (c.requerido) problema(r, `Sin ${c.titulo.toLowerCase()}`, `Falta ${c.titulo.toLowerCase()}`, { campo: c.id, tipoCampo: 'numero' })
      } else if (n.invalido) {
        r.v[c.id] = texto
        problema(r, 'Número que no se entiende', `${c.titulo}: «${texto}»`, { campo: c.id, tipoCampo: 'numero' })
      } else if (n.dudoso) {
        r.v[c.id] = texto
        problema(r, 'Número con texto', `${c.titulo}: «${texto}»`, { campo: c.id, tipoCampo: 'numero', arreglos: [{ clave: 'numero', texto: `Usar ${pesos(n.valor)}`, cambios: { [c.id]: n.valor }, masivo: true }] })
      } else if (n.valor < 0) {
        r.v[c.id] = n.valor
        problema(r, 'Número negativo', `${c.titulo}: ${pesos(n.valor)}`, { campo: c.id, tipoCampo: 'numero' })
      } else r.v[c.id] = c.tipo === 'entero' ? Math.round(n.valor) : n.valor
    } else if (c.tipo === 'fecha') {
      const iso = texto ? leerFecha(crudo) : null
      r.v[c.id] = iso || (texto ? texto : '')
      if (texto && !iso) problema(r, 'Fecha que no se entiende', `${c.titulo}: «${texto}»`, { campo: c.id, tipoCampo: 'fecha', arreglos: [{ clave: 'sin_fecha', texto: 'Dejar en blanco', cambios: { [c.id]: '' }, masivo: true }] })
    } else {
      r.v[c.id] = texto
      if (c.requerido && !texto) problema(r, `Sin ${c.titulo.toLowerCase()}`, `Falta ${c.titulo.toLowerCase()}`, { campo: c.id })
    }
  }
  return r
}

// Sugerencias con tope: solo se buscan para las primeras filas con problema.
function buscador() {
  let cupo = 400
  return (texto, lista, de) => {
    const k = llaveCodigo(texto)
    if (!k || k.length < 3 || cupo-- <= 0) return null
    let mejor = null, d = Infinity
    for (const x of lista) {
      const o = llaveCodigo(de(x))
      if (!o || Math.abs(o.length - k.length) > 3) continue
      const e = distancia(k, o)
      if (e < d) { d = e; mejor = x }
    }
    return d <= Math.min(Math.max(2, Math.floor(k.length * 0.25)), Math.floor(k.length / 2)) ? mejor : null
  }
}

const porLlave = (lista, de) => {
  const m = new Map()
  for (const x of lista) { const k = de(x); if (k && !m.has(k)) m.set(k, x) }
  return m
}

const repetida = (r, grupo, fila, arreglos = []) => problema(r, grupo, `Igual a la fila ${fila}`, { arreglos })

function prefijoDe(nombre, usados) {
  const letras = llave(nombre).replace(/[^A-Z]/g, '') || 'PRD'
  const opciones = [letras.slice(0, 3), letras.slice(0, 4), letras.slice(0, 2) + letras.slice(-1), letras.slice(0, 2) + letras.slice(-2)]
  const libre = opciones.find(p => !usados.has(p)) || opciones[0]
  usados.add(libre)
  return libre
}

const VALIDAR = {
  proveedores(filas, cat) {
    const existen = porLlave(cat.proveedores, p => llave(p.nombre))
    const vistos = new Map()
    for (const r of filas) {
      const k = llave(r.v.nombre)
      if (!k) continue
      if (existen.has(k)) { r.estado = 'existe'; continue }
      if (vistos.has(k)) repetida(r, 'Proveedor repetido en el archivo', vistos.get(k))
      else vistos.set(k, r.fila)
    }
  },

  productos(filas, cat, ctx) {
    const provs = porLlave(cat.proveedores, p => llave(p.nombre))
    const skus = porLlave(cat.productos, p => llaveCodigo(p.sku))
    const nombres = porLlave(cat.productos, p => llave(p.nombre))
    const categorias = new Map(cat.categorias.map(c => [llave(c.nombre), { nombre: c.nombre, prefijo: c.prefijo_sku || 'PRD' }]))
    const usados = new Set([...categorias.values()].map(c => c.prefijo))
    const contador = {}
    for (const p of cat.productos) {
      const [pre, num] = String(p.sku).split('-')
      if (pre && Number(num) > (contador[pre] || 0)) contador[pre] = Number(num)
    }
    const parecido = buscador()
    const vistos = new Map()
    for (const r of filas) {
      const v = r.v
      v.categoria = v.categoria || 'General'
      const kc = llave(v.categoria)
      if (!categorias.has(kc)) {
        categorias.set(kc, { nombre: v.categoria, prefijo: prefijoDe(v.categoria, usados), nueva: true })
        ctx.nuevas.categorias.push(v.categoria)
      }
      v.categoria = categorias.get(kc).nombre
      v.presentacion = v.presentacion || 'Unidad'
      v.tipo = /MATERIA|INSUMO|PRIMA/.test(llave(v.tipo)) ? 'materia_prima' : 'terminado'
      v.stock_minimo = Number(v.stock_minimo) || 0
      if (v.precio_venta === null && v.tipo === 'terminado') problema(r, 'Sin precio de venta', 'No trae precio de venta', { campo: 'precio_venta', tipoCampo: 'numero', arreglos: [{ clave: 'precio_cero', texto: 'Dejar en $0', cambios: { precio_venta: 0 }, masivo: true }] })
      if (v.proveedor && !provs.has(llave(v.proveedor)) && !r.banderas.crearProveedor) {
        const p = parecido(v.proveedor, cat.proveedores, x => x.nombre)
        const arreglos = [{ clave: 'crear', texto: 'Crear proveedor', banderas: { crearProveedor: true }, masivo: true }, { clave: 'sin_proveedor', texto: 'Dejar sin proveedor', cambios: { proveedor: '' }, masivo: true }]
        if (p) arreglos.unshift({ clave: 'usar', texto: `Usar ${p.nombre}`, cambios: { proveedor: p.nombre } })
        problema(r, 'Proveedor que no existe', v.proveedor, { arreglos })
      }
      if (!v.nombre) continue
      if (v.sku ? skus.has(llaveCodigo(v.sku)) : nombres.has(llave(v.nombre))) { r.estado = 'existe'; continue }
      if (!v.sku) {
        const pre = categorias.get(kc).prefijo
        contador[pre] = (contador[pre] || 0) + 1
        v.sku = `${pre}-${String(contador[pre]).padStart(3, '0')}`
        ctx.nuevas.codigos += 1
      }
      const k = llaveCodigo(v.sku)
      if (vistos.has(k)) repetida(r, 'Código repetido en el archivo', vistos.get(k))
      else vistos.set(k, r.fila)
    }
    ctx.categorias = categorias
  },

  clientes(filas, cat, ctx) {
    const porNit = porLlave(cat.clientes, c => llaveNit(c.nit))
    const porCodigo = porLlave(cat.clientes, c => llaveCodigo(c.codigo))
    const porNombre = porLlave(cat.clientes, c => llave(c.nombre))
    const rutas = porLlave(cat.rutas, x => llave(x.nombre))
    const vendedores = porLlave(cat.vendedores, x => llave(x.nombre))
    const vistos = new Map()
    const rutasNuevas = new Set(), vendedoresNuevos = new Set()
    for (const r of filas) {
      const v = r.v
      if ('dias_visita' in v && String(v.dias_visita).trim()) {
        const dias = leerDias(v.dias_visita)
        if (!dias) problema(r, 'Días de visita que no se entienden', `«${v.dias_visita}»`, { campo: 'dias_visita', arreglos: [{ clave: 'sin_dias', texto: 'Dejar sin días', cambios: { dias_visita: '' }, masivo: true }] })
        else if (!v.ruta) problema(r, 'Días de visita sin ruta', `${v.nombre}: ${v.dias_visita}`, { campo: 'ruta', arreglos: [{ clave: 'sin_dias', texto: 'Dejar sin días', cambios: { dias_visita: '' }, masivo: true }] })
      }
      if (v.ruta && !rutas.has(llave(v.ruta)) && !rutasNuevas.has(llave(v.ruta))) { rutasNuevas.add(llave(v.ruta)); ctx.nuevas.rutas.push(v.ruta) }
      if (v.vendedor && !vendedores.has(llave(v.vendedor)) && !vendedoresNuevos.has(llave(v.vendedor))) { vendedoresNuevos.add(llave(v.vendedor)); ctx.nuevas.vendedores.push(v.vendedor) }
      const nom = llave(v.nombre)
      if (!nom) continue
      const nit = llaveNit(v.nit), cod = llaveCodigo(v.codigo)
      const mismo = porNombre.get(nom)
      const otroNit = mismo && nit && llaveNit(mismo.nit) && llaveNit(mismo.nit) !== nit
      if ((nit && porNit.has(nit)) || (cod && porCodigo.has(cod)) || (mismo && !otroNit)) { r.estado = 'existe'; continue }
      const claves = [nit && `N${nit}`, cod && `C${cod}`, `A${nom}`].filter(Boolean)
      const previa = claves.map(k => vistos.get(k)).find(Boolean)
      if (previa && !r.banderas.forzar) repetida(r, 'Cliente repetido en el archivo', previa, [{ clave: 'distintos', texto: 'Son distintos', banderas: { forzar: true } }])
      else claves.forEach(k => { if (!vistos.has(k)) vistos.set(k, r.fila) })
    }
  },

  inventario(filas, cat) {
    const skus = porLlave(cat.productos, p => llaveCodigo(p.sku))
    const nombres = porLlave(cat.productos, p => llave(p.nombre))
    const contados = new Set(cat.conteos.map(c => c.sku))
    const parecido = buscador()
    const vistos = new Map()
    for (const r of filas) {
      const v = r.v
      if (!v.sku && !v.nombre) { problema(r, 'Sin código ni nombre', 'No se sabe qué producto es', { campo: 'sku' }); continue }
      const p = (v.sku && skus.get(llaveCodigo(v.sku))) || (v.nombre && nombres.get(llave(v.nombre)))
      if (!p) {
        const cerca = parecido(v.sku, cat.productos, x => x.sku) || parecido(v.nombre, cat.productos, x => x.nombre)
        problema(r, 'Producto que no existe', [v.sku, v.nombre].filter(Boolean).join(' · '), { campo: 'sku', arreglos: cerca ? [{ clave: 'usar', texto: `Usar ${cerca.sku}`, cambios: { sku: cerca.sku, nombre: cerca.nombre } }] : [] })
        continue
      }
      v.sku = p.sku
      v.nombre = p.nombre
      r.unitario = Number(p.costo_compra) || 0
      if (contados.has(p.sku)) { r.estado = 'existe'; continue }
      if (vistos.has(p.sku)) repetida(r, 'Producto repetido en el archivo', vistos.get(p.sku), [{ clave: 'sumar', texto: `Sumar a la fila ${vistos.get(p.sku)}`, sumar: { fila: vistos.get(p.sku), campo: 'cantidad' }, masivo: true }])
      else vistos.set(p.sku, r.fila)
    }
  },

  cartera(filas, cat, ctx) {
    const porNit = porLlave(cat.clientes, c => llaveNit(c.nit))
    const porCodigo = porLlave(cat.clientes, c => llaveCodigo(c.codigo))
    const porNombre = porLlave(cat.clientes, c => llave(c.nombre))
    const huella = (id, nombre, valor, fecha) => `${id || llave(nombre)}|${Number(valor)}|${fecha}`
    const cargadas = new Set(cat.iniciales.map(c => huella(c.cliente_id, c.nombre_cliente, c.valor_original, c.fecha_fiado)))
    const parecido = buscador()
    const vistos = new Map()
    for (const r of filas) {
      const v = r.v
      const c = (v.codigo && (porNit.get(llaveNit(v.codigo)) || porCodigo.get(llaveCodigo(v.codigo)))) || (v.cliente && porNombre.get(llave(v.cliente)))
      if (c) { r.cliente = c; v.cliente = c.nombre }
      else if (v.cliente && !r.banderas.sinLigar) {
        const cerca = parecido(v.cliente, cat.clientes, x => x.nombre)
        const arreglos = [{ clave: 'sin_ligar', texto: 'Cargar solo con el nombre', banderas: { sinLigar: true }, masivo: true }]
        if (cerca) arreglos.unshift({ clave: 'usar', texto: `Usar ${cerca.nombre}`, cambios: { cliente: cerca.nombre, codigo: '' } })
        problema(r, 'Cliente que no existe', v.cliente, { arreglos })
      }
      if (v.valor === 0) problema(r, 'Saldo en cero', v.cliente || `Fila ${r.fila}`)
      const fecha = v.fecha && !r.problemas.some(p => p.campo === 'fecha') ? v.fecha : ctx.corte
      v.fecha = v.fecha || ctx.corte
      if (typeof v.valor !== 'number' || !v.cliente) continue
      const h = huella(c?.id, v.cliente, v.valor, fecha)
      if (cargadas.has(h)) { r.estado = 'existe'; continue }
      if (vistos.has(h) && !r.banderas.forzar) repetida(r, 'Saldo repetido en el archivo', vistos.get(h), [{ clave: 'forzar', texto: 'Cargar también', banderas: { forzar: true } }])
      else if (!vistos.has(h)) vistos.set(h, r.fila)
    }
  },

  por_pagar(filas, cat) {
    const provs = porLlave(cat.proveedores, p => llave(p.nombre))
    const conSaldo = new Set(cat.pendientes.map(p => p.proveedor_id))
    const parecido = buscador()
    for (const r of filas) {
      const v = r.v
      if (!v.proveedor) continue
      const p = provs.get(llave(v.proveedor))
      if (p) {
        v.proveedor = p.nombre
        if (conSaldo.has(p.id)) r.estado = 'existe'
      } else if (!r.banderas.crearProveedor) {
        const cerca = parecido(v.proveedor, cat.proveedores, x => x.nombre)
        const arreglos = [{ clave: 'crear', texto: 'Crear proveedor', banderas: { crearProveedor: true }, masivo: true }]
        if (cerca) arreglos.unshift({ clave: 'usar', texto: `Usar ${cerca.nombre}`, cambios: { proveedor: cerca.nombre } })
        problema(r, 'Proveedor que no existe', v.proveedor, { arreglos })
      }
      if (v.valor === 0) problema(r, 'Saldo en cero', v.proveedor)
    }
  },
}

export async function revisar(admin, { empresa, pasoId, filas, corte }) {
  const paso = pasoPorId(pasoId)
  if (!paso) throw new Error('Paso inválido')
  if (!Array.isArray(filas) || !filas.length) throw new Error('No hay filas para revisar')
  if (filas.length > MAX_FILAS) throw new Error(`El archivo tiene más de ${MAX_FILAS.toLocaleString('es-CO')} filas; divídalo en partes`)
  if (!leerFecha(corte)) throw new Error('Falta la fecha de corte')
  const campos = camposDe(paso, empresa.modelos)
  const cat = await catalogo(admin, empresa.id, pasoId, corte)
  const ctx = { corte, nuevas: { categorias: [], rutas: [], vendedores: [], codigos: 0 } }
  const salida = filas.map(f => limpiar(f, campos))
  VALIDAR[pasoId](salida, cat, ctx)
  return { filas: salida, nuevas: ctx.nuevas, cat, ctx }
}

async function crearProveedores(admin, empresa, lote, nombres, cat) {
  const mapa = porLlave(cat.proveedores, p => llave(p.nombre))
  const nuevos = []
  for (const n of nombres) {
    const k = llave(n)
    if (!k || mapa.has(k)) continue
    const fila = { id: randomUUID(), empresa_id: empresa.id, nombre: n, estado: true, migracion_lote: lote }
    mapa.set(k, fila); nuevos.push(fila)
  }
  await insertar(admin, 'proveedores', nuevos)
  return { mapa, creados: nuevos.length }
}

const CARGAR = {
  async proveedores(admin, empresa, lote, listas) {
    await insertar(admin, 'proveedores', listas.map(({ v }) => ({ empresa_id: empresa.id, nombre: v.nombre, contacto: v.contacto || null, telefono: v.telefono || null, dias_credito: v.dias_credito || 0, estado: true, migracion_lote: lote })))
    return {}
  },

  async productos(admin, empresa, lote, listas, cat, ctx) {
    const pedir = listas.filter(r => r.banderas.crearProveedor).map(r => r.v.proveedor)
    const { mapa, creados } = await crearProveedores(admin, empresa, lote, pedir, cat)
    const usadas = new Set(listas.map(r => llave(r.v.categoria)))
    const categorias = [...ctx.categorias.entries()].filter(([k, c]) => c.nueva && usadas.has(k)).map(([, c]) => ({ empresa_id: empresa.id, nombre: c.nombre, prefijo_sku: c.prefijo, estado: true, migracion_lote: lote }))
    await insertar(admin, 'categorias_producto', categorias)
    await insertar(admin, 'productos', listas.map(({ v }) => ({
      empresa_id: empresa.id, sku: v.sku, nombre: v.nombre, categoria: v.categoria, presentacion: v.presentacion, precio_venta: v.precio_venta ?? 0, costo_compra: v.costo_compra ?? 0,
      proveedor_id: mapa.get(llave(v.proveedor))?.id || null, tipo: v.tipo, stock_minimo: v.stock_minimo, estado: true, migracion_lote: lote,
    })))
    return { proveedores: creados, categorias: categorias.length }
  },

  async clientes(admin, empresa, lote, listas, cat) {
    const rutas = porLlave(cat.rutas, x => llave(x.nombre))
    const vendedores = porLlave(cat.vendedores, x => llave(x.nombre))
    const nuevasRutas = [], nuevosVendedores = []
    for (const { v } of listas) {
      const kr = llave(v.ruta)
      if (kr && !rutas.has(kr)) { const f = { id: randomUUID(), empresa_id: empresa.id, nombre: v.ruta, estado: true, migracion_lote: lote }; rutas.set(kr, f); nuevasRutas.push(f) }
      const kv = llave(v.vendedor)
      if (kv && !vendedores.has(kv)) { const f = { id: randomUUID(), empresa_id: empresa.id, nombre: v.vendedor, ruta_id: rutas.get(kr)?.id || null, estado: true, migracion_lote: lote }; vendedores.set(kv, f); nuevosVendedores.push(f) }
    }
    await insertar(admin, 'rutas', nuevasRutas)
    await insertar(admin, 'vendedores', nuevosVendedores)
    const orden = {}
    for (const x of cat.rutero) { const k = `${x.ruta_id}|${x.dia_semana}`; orden[k] = Math.max(orden[k] || 0, x.orden || 0) }
    const rutero = []
    const clientes = listas.map(({ v }) => {
      const id = randomUUID()
      const ruta = rutas.get(llave(v.ruta))?.id || null
      for (const dia of ruta ? leerDias(v.dias_visita) || [] : []) {
        const k = `${ruta}|${dia}`
        orden[k] = (orden[k] || 0) + 1
        rutero.push({ empresa_id: empresa.id, cliente_id: id, ruta_id: ruta, dia_semana: dia, orden: orden[k], migracion_lote: lote })
      }
      return {
        id, empresa_id: empresa.id, nombre: v.nombre, codigo: v.codigo || null, nit: v.nit || null, tipo_negocio: v.tipo_negocio || null, direccion: v.direccion || null, barrio: v.barrio || null,
        telefono: v.telefono || null, ruta_id: ruta, vendedor_id: vendedores.get(llave(v.vendedor))?.id || null, dias_credito: v.dias_credito || 0, cupo_credito: v.cupo_credito || 0, notas: v.notas || null, estado: true, migracion_lote: lote,
      }
    })
    await insertar(admin, 'clientes', clientes)
    await insertar(admin, 'rutero', rutero)
    return { rutas: nuevasRutas.length, vendedores: nuevosVendedores.length, visitas: rutero.length }
  },

  async inventario(admin, empresa, lote, listas, cat, ctx) {
    await insertar(admin, 'conteo_fisico', listas.map(({ v }) => ({
      empresa_id: empresa.id, sku: v.sku, fecha: ctx.corte, cantidad_sistema: v.cantidad, cantidad_fisica: v.cantidad, diferencia: 0, completado: true, inicial: true, usuario: 'Migración', migracion_lote: lote,
    })))
    return {}
  },

  async cartera(admin, empresa, lote, listas) {
    await insertar(admin, 'cartera_fiados', listas.map(({ v, cliente }) => ({
      empresa_id: empresa.id, cliente_id: cliente?.id || null, nombre_cliente: v.cliente, valor_original: v.valor, saldo: v.valor, fecha_fiado: v.fecha, fecha_pago: v.vence || null,
      ruta_id: cliente?.ruta_id || null, vendedor_id: cliente?.vendedor_id || null, estado: 'pendiente', es_saldo_inicial: true, migracion_lote: lote,
    })))
    return {}
  },

  // Un saldo por proveedor: es lo que esperan los abonos y las compras a credito.
  async por_pagar(admin, empresa, lote, listas, cat) {
    const pedir = listas.filter(r => r.banderas.crearProveedor).map(r => r.v.proveedor)
    const { mapa, creados } = await crearProveedores(admin, empresa, lote, pedir, cat)
    const saldos = new Map()
    for (const { v } of listas) {
      const id = mapa.get(llave(v.proveedor))?.id
      if (id) saldos.set(id, (saldos.get(id) || 0) + v.valor)
    }
    await insertar(admin, 'facturas_proveedores', [...saldos].map(([proveedor_id, total_pendiente]) => ({ empresa_id: empresa.id, proveedor_id, total_pendiente, estado: 'pendiente', migracion_lote: lote })))
    return { proveedores: creados }
  },
}

export async function cargar(admin, { empresa, pasoId, filas, corte, archivo, fuera, usuario }) {
  const { filas: revisadas, cat, ctx } = await revisar(admin, { empresa, pasoId, filas, corte })
  const listas = revisadas.filter(r => r.estado === 'ok' && !r.problemas.length)
  if (!listas.length) throw new Error('No hay filas listas para cargar')
  const paso = pasoPorId(pasoId)
  const monto = paso.monto
  const total = monto ? listas.reduce((s, r) => s + (Number(r.v[monto]) || 0) * r.unitario, 0) : 0
  const rechazadas = revisadas.filter(r => r.estado === 'ok' && r.problemas.length).map(r => r.fila)
  const { data: lote, error } = await admin.from('migracion_lotes').insert({
    empresa_id: empresa.id, paso: pasoId, archivo: archivo || null, fecha_corte: corte, filas: listas.length, fuera: (Number(fuera) || 0) + rechazadas.length, total, creado_por: usuario,
  }).select('id').single()
  if (error) throw new Error(error.message)
  try {
    const creados = await CARGAR[pasoId](admin, empresa, lote.id, listas, cat, ctx)
    await admin.from('migracion_lotes').update({ creados }).eq('id', lote.id)
    return { lote: lote.id, filas: listas.length, rechazadas, creados, total }
  } catch (e) {
    await admin.rpc('migracion_deshacer', { p_lote: lote.id, p_final: false })
    throw e
  }
}

export async function deshacer(admin, { empresa, lote }) {
  const { data: l } = await admin.from('migracion_lotes').select('id, paso, deshecho_at').eq('id', lote).eq('empresa_id', empresa.id).maybeSingle()
  if (!l || l.deshecho_at) throw new Error('Lote no encontrado')
  const dependen = DEPENDEN[l.paso] || []
  if (dependen.length) {
    const { data: activos } = await admin.from('migracion_lotes').select('paso').eq('empresa_id', empresa.id).is('deshecho_at', null).in('paso', dependen)
    if (activos?.length) throw new Error(`Primero deshaga ${NOMBRE_PASO[activos[0].paso]}`)
  }
  const { data, error } = await admin.rpc('migracion_deshacer', { p_lote: lote })
  if (error) throw new Error(error.message)
  return data?.[0] || { borrados: 0, conservados: 0 }
}

// Solo cifras: la consola nunca ve los datos del negocio fuera del archivo.
export async function estado(admin, empresa) {
  const cuenta = async (tabla) => (await admin.from(tabla).select('id', { count: 'exact', head: true }).eq('empresa_id', empresa.id)).count || 0
  const [{ data: lotes }, proveedores, productos, clientes] = await Promise.all([
    admin.from('migracion_lotes').select('id, paso, archivo, fecha_corte, filas, fuera, total, creados, created_at, deshecho_at, conservados').eq('empresa_id', empresa.id).order('created_at'),
    cuenta('proveedores'), cuenta('productos'), cuenta('clientes'),
  ])
  return { lotes: lotes || [], cuentas: { proveedores, productos, clientes } }
}
