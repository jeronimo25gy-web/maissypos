// Migracion de datos de un cliente nuevo: que se migra, como se llaman sus
// columnas en los archivos que llegan y como se limpian los valores. Sin
// dependencias: lo usan la consola de Plataforma (navegador) y la API.

export const PASOS = [
  {
    id: 'proveedores', titulo: 'Proveedores', nota: 'A quién le compra', hoja: 'Proveedores', alias: ['proveedores', 'proveedor'],
    campos: [
      { id: 'nombre', titulo: 'Proveedor', requerido: true, alias: ['proveedor', 'nombre', 'razon social', 'nombre proveedor', 'empresa'], ejemplo: 'Lácteos del Norte' },
      { id: 'contacto', titulo: 'Contacto', alias: ['contacto', 'asesor', 'vendedor', 'persona de contacto'], ejemplo: 'Ana Ruiz' },
      { id: 'telefono', titulo: 'Teléfono', alias: ['telefono', 'tel', 'celular', 'cel', 'whatsapp', 'movil'], ejemplo: '3001234567' },
      { id: 'dias_credito', titulo: 'Días de crédito', tipo: 'entero', alias: ['dias de credito', 'dias credito', 'plazo', 'credito', 'dias plazo'], ejemplo: 30 },
    ],
  },
  {
    id: 'productos', titulo: 'Productos', nota: 'Código, precio y costo', hoja: 'Productos', alias: ['productos', 'producto', 'catalogo', 'articulos', 'referencias'],
    campos: [
      { id: 'sku', titulo: 'Código', alias: ['codigo', 'cod', 'ref', 'referencia', 'sku', 'item', 'codigo producto', 'id producto'], ejemplo: 'QC500' },
      { id: 'nombre', titulo: 'Producto', requerido: true, alias: ['producto', 'nombre', 'descripcion', 'articulo', 'nombre producto', 'detalle'], ejemplo: 'Queso campesino 500 g' },
      { id: 'categoria', titulo: 'Categoría', alias: ['categoria', 'linea', 'familia', 'grupo', 'tipo de producto'], ejemplo: 'Quesos' },
      { id: 'presentacion', titulo: 'Presentación', alias: ['presentacion', 'unidad', 'empaque', 'unidad de medida', 'um', 'medida'], ejemplo: 'Unidad' },
      { id: 'precio_venta', titulo: 'Precio de venta', tipo: 'numero', alias: ['precio de venta', 'precio venta', 'precio', 'pvp', 'vlr venta', 'valor venta', 'venta', 'precio publico'], ejemplo: 12500 },
      { id: 'costo_compra', titulo: 'Costo', tipo: 'numero', alias: ['costo', 'costo compra', 'costo unitario', 'precio compra', 'precio de compra', 'vlr compra', 'valor compra', 'vlr u', 'vlr unitario', 'valor unitario'], ejemplo: 7800 },
      { id: 'proveedor', titulo: 'Proveedor', alias: ['proveedor', 'nombre proveedor'], ejemplo: 'Lácteos del Norte' },
      { id: 'tipo', titulo: 'Tipo', alias: ['tipo', 'clase'], ejemplo: 'Terminado', ayuda: 'Terminado o Materia prima' },
      { id: 'stock_minimo', titulo: 'Stock mínimo', tipo: 'entero', alias: ['stock minimo', 'minimo', 'cantidad minima'], ejemplo: 10 },
    ],
  },
  {
    id: 'clientes', titulo: 'Clientes', nota: 'Cupo, plazo y ruta', hoja: 'Clientes', alias: ['clientes', 'cliente', 'tiendas', 'terceros'],
    campos: [
      { id: 'codigo', titulo: 'Código', alias: ['codigo', 'cod', 'id cliente', 'codigo cliente'], ejemplo: 'C-104' },
      { id: 'nombre', titulo: 'Cliente', requerido: true, alias: ['cliente', 'nombre', 'razon social', 'nombre cliente', 'tienda', 'negocio', 'establecimiento', 'tercero'], ejemplo: 'Tienda La 33' },
      { id: 'nit', titulo: 'NIT o cédula', alias: ['nit', 'cedula', 'cc', 'documento', 'identificacion', 'nit cc', 'nit o cedula'], ejemplo: '900123456' },
      { id: 'tipo_negocio', titulo: 'Tipo de negocio', alias: ['tipo de negocio', 'tipo negocio', 'tipo cliente', 'tipo', 'canal'], ejemplo: 'Tienda' },
      { id: 'direccion', titulo: 'Dirección', alias: ['direccion', 'dir', 'domicilio'], ejemplo: 'Calle 33 # 70-12' },
      { id: 'barrio', titulo: 'Barrio', alias: ['barrio', 'sector', 'zona', 'comuna'], ejemplo: 'Laureles' },
      { id: 'telefono', titulo: 'Teléfono', alias: ['telefono', 'tel', 'celular', 'cel', 'whatsapp', 'movil'], ejemplo: '3101234567' },
      { id: 'ruta', titulo: 'Ruta', alias: ['ruta', 'nombre ruta'], ejemplo: 'Ruta Norte', reparto: true },
      { id: 'vendedor', titulo: 'Vendedor', alias: ['vendedor', 'asesor', 'preventista', 'nombre vendedor'], ejemplo: 'Carlos Gómez', reparto: true },
      { id: 'dias_visita', titulo: 'Días de visita', alias: ['dias de visita', 'dias visita', 'dia de visita', 'dia visita', 'visita', 'dias'], ejemplo: 'Lun, Jue', ayuda: 'Lun, Mar, Mié, Jue, Vie, Sáb', reparto: true },
      { id: 'dias_credito', titulo: 'Días de crédito', tipo: 'entero', alias: ['dias de credito', 'dias credito', 'plazo', 'dias plazo'], ejemplo: 8 },
      { id: 'cupo_credito', titulo: 'Cupo de crédito', tipo: 'numero', alias: ['cupo de credito', 'cupo credito', 'cupo', 'limite', 'limite de credito', 'limite credito'], ejemplo: 500000 },
      { id: 'notas', titulo: 'Notas', alias: ['notas', 'nota', 'observacion', 'observaciones', 'comentarios'], ejemplo: 'Recibe en la mañana' },
    ],
  },
  {
    id: 'inventario', titulo: 'Inventario inicial', nota: 'Existencias a la fecha de corte', hoja: 'Inventario', monto: 'cantidad', rotuloMonto: 'Valor del inventario', alias: ['inventario', 'existencias', 'stock', 'bodega', 'saldos inventario'],
    campos: [
      { id: 'sku', titulo: 'Código', alias: ['codigo', 'cod', 'ref', 'referencia', 'sku', 'item', 'codigo producto'], ejemplo: 'QC500' },
      { id: 'nombre', titulo: 'Producto', alias: ['producto', 'nombre', 'descripcion', 'articulo', 'nombre producto', 'detalle'], ejemplo: 'Queso campesino 500 g' },
      { id: 'cantidad', titulo: 'Cantidad', requerido: true, tipo: 'numero', alias: ['cantidad', 'cant', 'existencia', 'existencias', 'stock', 'saldo', 'unidades', 'conteo', 'fisico'], ejemplo: 48 },
    ],
  },
  {
    id: 'cartera', titulo: 'Cartera', nota: 'Lo que cada cliente debe hoy', hoja: 'Cartera', monto: 'valor', rotuloMonto: 'Total de cartera', alias: ['cartera', 'cuentas por cobrar', 'por cobrar', 'deudores', 'fiados', 'creditos'],
    campos: [
      { id: 'codigo', titulo: 'Código o NIT', alias: ['codigo', 'cod', 'nit', 'cedula', 'documento', 'identificacion', 'codigo cliente'], ejemplo: 'C-104' },
      { id: 'cliente', titulo: 'Cliente', requerido: true, alias: ['cliente', 'nombre', 'razon social', 'nombre cliente', 'tienda', 'negocio', 'tercero'], ejemplo: 'Tienda La 33' },
      { id: 'valor', titulo: 'Saldo', requerido: true, tipo: 'numero', alias: ['saldo', 'valor', 'debe', 'deuda', 'total', 'saldo pendiente', 'valor pendiente', 'monto'], ejemplo: 180000 },
      { id: 'fecha', titulo: 'Fecha del crédito', tipo: 'fecha', alias: ['fecha', 'fecha factura', 'fecha credito', 'fecha del credito', 'fecha venta', 'emision'], ejemplo: '15/10/2026' },
      { id: 'vence', titulo: 'Vence', tipo: 'fecha', alias: ['vence', 'vencimiento', 'fecha vencimiento', 'fecha de vencimiento', 'fecha de pago', 'fecha pago'], ejemplo: '30/10/2026' },
    ],
  },
  {
    id: 'por_pagar', titulo: 'Cuentas por pagar', nota: 'Lo que se les debe a los proveedores', hoja: 'Por pagar', monto: 'valor', rotuloMonto: 'Total por pagar', alias: ['por pagar', 'cuentas por pagar', 'cxp', 'deudas proveedores', 'pagar'],
    campos: [
      { id: 'proveedor', titulo: 'Proveedor', requerido: true, alias: ['proveedor', 'nombre', 'razon social', 'nombre proveedor', 'empresa', 'tercero'], ejemplo: 'Lácteos del Norte' },
      { id: 'valor', titulo: 'Saldo', requerido: true, tipo: 'numero', alias: ['saldo', 'valor', 'debe', 'deuda', 'total', 'saldo pendiente', 'valor pendiente', 'monto'], ejemplo: 2400000 },
    ],
  },
]

export const pasoPorId = (id) => PASOS.find(p => p.id === id)

// Campos de un paso segun el modelo de la empresa: sin reparto no hay rutas.
export const camposDe = (paso, modelos) => paso.campos.filter(c => !c.reparto || (modelos || []).includes('distribucion'))

// Texto comparable: sin tildes, mayusculas, signos ni espacios de mas.
export const llave = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
const compacta = (t) => llave(t).replace(/ /g, '')
export const llaveCodigo = compacta
export const llaveNit = (t) => { const d = String(t ?? '').split('-')[0].replace(/\D/g, ''); return d.length >= 5 ? d : '' }

// Numero escrito a la colombiana o a la gringa. dudoso: traia texto pegado.
export function leerNumero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? { valor: v } : { invalido: true }
  const crudo = String(v ?? '').trim()
  if (!crudo) return { vacio: true }
  const negativo = /^\(.*\)$/.test(crudo) || /^-/.test(crudo.replace(/[$\s]/g, ''))
  const coincide = crudo.match(/\d[\d.,\s]*/)
  if (!coincide) return { invalido: true }
  const cuerpo = coincide[0].replace(/\s/g, '').replace(/[.,]$/, '')
  const pegado = crudo.replace(coincide[0], '').replace(/[$()\-+\s]|cop|pesos/gi, '')
  const pc = cuerpo.lastIndexOf(','), pp = cuerpo.lastIndexOf('.')
  let limpio
  if (pc >= 0 && pp >= 0) {
    const dec = pc > pp ? ',' : '.'
    limpio = cuerpo.split(dec === ',' ? '.' : ',').join('').replace(dec, '.')
  } else {
    const sep = pc >= 0 ? ',' : pp >= 0 ? '.' : ''
    if (!sep) limpio = cuerpo
    else {
      const partes = cuerpo.split(sep)
      const miles = partes.length > 1 && partes.slice(1).every(p => p.length === 3)
      limpio = miles ? partes.join('') : partes.length === 2 ? partes.join('.') : null
    }
  }
  const n = limpio === null ? NaN : Number(limpio)
  if (!Number.isFinite(n)) return { invalido: true }
  const valor = negativo ? -n : n
  return pegado ? { valor, dudoso: true } : { valor }
}

const MESES = { ENE: 1, JAN: 1, FEB: 2, MAR: 3, ABR: 4, APR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, AUG: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12, DEC: 12 }
const iso = (a, m, d) => {
  if (a < 100) a += 2000
  const f = new Date(Date.UTC(a, m - 1, d))
  if (f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d || a < 1990 || a > 2100) return null
  return f.toISOString().slice(0, 10)
}

// Fecha de Excel (numero de serie) o escrita: dia/mes/año primero, como aca.
export function leerFecha(v) {
  if (typeof v === 'number') return v > 30000 && v < 80000 ? new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5).toISOString().slice(0, 10) : null
  const t = String(v ?? '').trim()
  if (!t) return null
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (m) return iso(+m[3], +m[2], +m[1])
  const k = llave(t).split(' ')
  const mes = k.findIndex(x => MESES[x.slice(0, 3)])
  if (mes < 0) return null
  const nums = k.filter(x => /^\d+$/.test(x)).map(Number)
  const año = nums.find(n => n > 31), dia = nums.find(n => n <= 31)
  return año && dia ? iso(año, MESES[k[mes].slice(0, 3)], dia) : null
}

const DIA = { LUN: 1, LUNES: 1, L: 1, MAR: 2, MARTES: 2, M: 2, MIE: 3, MIER: 3, MIERCOLES: 3, X: 3, JUE: 4, JUEVES: 4, J: 4, VIE: 5, VIERNES: 5, V: 5, SAB: 6, SABADO: 6, S: 6 }

// "Lun, Jue", "Lunes y jueves", "L-J" o "LMV" -> [1, 4]. null si no se entiende.
export function leerDias(v) {
  const t = llave(v)
  if (!t) return []
  if (/^(TODOS|LUNES A SABADO|LUN A SAB|L A S)$/.test(t)) return [1, 2, 3, 4, 5, 6]
  if (/^(LUNES A VIERNES|LUN A VIE|L A V)$/.test(t)) return [1, 2, 3, 4, 5]
  const trozos = t.replace(/\bY\b/g, ' ').trim().split(/\s+/)
  const lista = trozos.length === 1 && /^[LMXJVS]{2,6}$/.test(trozos[0]) ? trozos[0].split('') : trozos
  const dias = lista.map(x => DIA[x])
  return dias.some(d => !d) ? null : [...new Set(dias)].sort((a, b) => a - b)
}

// Parecido entre dos textos, para sugerir el codigo o nombre que quiso decir.
export function distancia(a, b) {
  if (a === b) return 0
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const fila = [i]
    for (let j = 1; j <= b.length; j++) fila[j] = Math.min(prev[j] + 1, fila[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = fila
  }
  return prev[b.length]
}

const claveTitulo = (c) => llave(c).toLowerCase()

// La fila de titulos es la que mas columnas reconoce entre las primeras.
export function detectarTitulos(filas, paso) {
  const alias = new Set(paso.campos.flatMap(c => c.alias))
  let mejor = 0, puntos = 0
  filas.slice(0, 25).forEach((f, i) => {
    const n = f.filter(c => alias.has(claveTitulo(c))).length
    if (n > puntos) { puntos = n; mejor = i }
  })
  return mejor
}

// Columna del archivo -> campo. Primero el nombre exacto, luego uno parecido.
export function emparejar(titulos, paso, modelos) {
  const campos = camposDe(paso, modelos)
  const mapa = titulos.map(() => '')
  const usados = new Set()
  const claves = titulos.map(claveTitulo)
  campos.forEach(c => {
    for (const a of c.alias) {
      const i = claves.findIndex((t, k) => !mapa[k] && t === a)
      if (i >= 0) { mapa[i] = c.id; usados.add(c.id); break }
    }
  })
  campos.filter(c => !usados.has(c.id)).forEach(c => {
    for (const a of c.alias.filter(x => x.length >= 4)) {
      const i = claves.findIndex((t, k) => !mapa[k] && t && (t.includes(a) || (t.length >= 5 && a.includes(t))))
      if (i >= 0) { mapa[i] = c.id; usados.add(c.id); break }
    }
  })
  return mapa
}

const ES_TOTAL = /^(SUB ?)?TOTAL(ES)?\b|^GRAN TOTAL|^SUMA\b/

// Filas del archivo -> objetos con los campos elegidos. Salta las vacias y las
// de totales que la gente deja al final de sus Excel.
export function leerFilas(filas, tituloFila, mapa) {
  const salida = []
  for (let i = tituloFila + 1; i < filas.length; i++) {
    const f = filas[i] || []
    const o = { fila: i + 1 }
    let hay = false, total = false
    mapa.forEach((campo, c) => {
      if (!campo) return
      const v = f[c]
      const vacio = v === '' || v === null || v === undefined
      o[campo] = vacio ? '' : v
      if (!vacio) hay = true
      if (ES_TOTAL.test(llave(v))) total = true
    })
    if (hay && !total) salida.push(o)
  }
  return salida
}

// Hoja del libro que le toca a un paso, por su nombre.
export function hojaDe(nombres, paso) {
  const claves = nombres.map(claveTitulo)
  const exacta = claves.findIndex(n => paso.alias.includes(n))
  if (exacta >= 0) return nombres[exacta]
  const parcial = claves.findIndex(n => paso.alias.some(a => a.length >= 5 && n.includes(a)))
  return parcial >= 0 ? nombres[parcial] : null
}

// El paquete que se le manda al cliente: una hoja de instrucciones y una por
// paso, solo con los titulos para que no se cargue nada de ejemplo.
export function hojasPaquete(negocio, modelos) {
  const guia = [
    [`Paquete de migración a MaissyPOS${negocio ? ' · ' + negocio : ''}`], [],
    ['Cómo llenarlo'],
    ['1. Llene cada hoja con sus datos. Deje en blanco la columna o la hoja que no aplique.'],
    ['2. Los títulos de la fila 1 no se cambian. Las columnas con * son obligatorias.'],
    ['3. Los saldos y existencias deben ser los del día de la fecha de corte acordada.'],
    ['4. Escriba el cliente y el proveedor igual en todas las hojas.'],
    ['5. Si ya tiene esta información en otro formato, envíelo así: también se puede cargar.'],
    ['6. No se migra el historial de ventas; se arranca con los saldos a la fecha de corte.'], [],
    ['Hoja', 'Columna', 'Obligatoria', 'Ejemplo', 'Nota'],
  ]
  const hojas = PASOS.map(p => {
    const campos = camposDe(p, modelos)
    campos.forEach(c => guia.push([p.hoja, c.titulo, c.requerido ? 'Sí' : '', c.ejemplo ?? '', c.ayuda || '']))
    return { nombre: p.hoja, titulos: campos.map(c => c.titulo + (c.requerido ? ' *' : '')) }
  })
  return { guia, hojas }
}
