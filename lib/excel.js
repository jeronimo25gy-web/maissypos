'use client'
// Excel con el formato de MaissyPOS para todo el sistema: título, empresa y
// periodo arriba; títulos de columna en negrilla con línea; pesos, cantidades,
// porcentajes y fechas con su formato (siguen siendo números para sumar);
// anchos a la medida, títulos fijos al bajar, filtros y total al final. Sin
// rellenos de color: se ve bien en pantalla y al imprimir.

const TINTA = 'FF1C1B19'
const GRIS = 'FF5A5750'
const LINEA = 'FFC9C5BA'

export const FORMATOS = {
  pesos: '"$"#,##0;[Red]-"$"#,##0',
  num: '#,##0.##',
  entero: '#,##0',
  pct: '0.0"%"',
  fecha: 'dd/mm/yyyy',
}

export async function nuevoLibro() {
  const mod = await import('exceljs/dist/exceljs.min.js')
  const ExcelJS = mod.default || mod
  const libro = new ExcelJS.Workbook()
  libro.creator = 'MaissyPOS'
  libro.created = new Date()
  return libro
}

const nombreHoja = (t, usados) => {
  const base = String(t || 'Hoja').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Hoja'
  let n = base, k = 2
  while (usados.has(n.toLowerCase())) n = `${base.slice(0, 27)} ${k++}`
  usados.add(n.toLowerCase())
  return n
}

// Texto como se vería en la celda, para calcular el ancho de la columna.
const comoTexto = (v, tipo) => {
  if (v == null || v === '') return ''
  if (typeof v === 'number') {
    if (tipo === 'pesos') return '$' + Math.round(v).toLocaleString('es-CO')
    if (tipo === 'pct') return v.toFixed(1) + '%'
    return v.toLocaleString('es-CO', { maximumFractionDigits: 2 })
  }
  if (v instanceof Date) return '00/00/0000'
  return String(v)
}

// Fecha "2026-11-05" → Date para que Excel la reconozca como fecha.
const valorCelda = (v, tipo) => {
  if (tipo === 'fecha' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const [a, m, d] = v.slice(0, 10).split('-').map(Number)
    return new Date(Date.UTC(a, m - 1, d))
  }
  if (['pesos', 'num', 'entero', 'pct'].includes(tipo) && typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v)
  return v ?? ''
}

/**
 * Agrega una hoja con una tabla.
 * columnas: [{ titulo, tipo: 'texto'|'pesos'|'num'|'entero'|'pct'|'fecha', ancho?, requerido?, nota?, lista? }]
 * filas: [[...]]  total: [...] (opcional)
 * encabezado: { titulo, subtitulo } (opcional; sin él, los títulos van en la fila 1)
 */
export function agregarTabla(libro, nombre, { encabezado, columnas, filas = [], total, filasVacias = 0 }, usados = libro._usadosMaissy || (libro._usadosMaissy = new Set())) {
  const hoja = libro.addWorksheet(nombreHoja(nombre, usados), {
    pageSetup: { orientation: columnas.length > 6 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    properties: { defaultRowHeight: 18 },
  })
  let fila = 1
  if (encabezado?.titulo) {
    hoja.getCell(fila, 1).value = encabezado.titulo
    hoja.getCell(fila, 1).font = { name: 'Calibri', size: 16, bold: true, color: { argb: TINTA } }
    hoja.getRow(fila).height = 24
    fila++
    if (encabezado.subtitulo) {
      hoja.getCell(fila, 1).value = encabezado.subtitulo
      hoja.getCell(fila, 1).font = { name: 'Calibri', size: 11, color: { argb: GRIS } }
      fila++
    }
    fila++
  }
  const filaTitulos = fila
  const titulos = hoja.getRow(filaTitulos)
  columnas.forEach((c, j) => {
    const celda = titulos.getCell(j + 1)
    celda.value = c.titulo + (c.requerido ? ' *' : '')
    celda.font = { name: 'Calibri', size: 11, bold: true, color: { argb: TINTA } }
    celda.alignment = { vertical: 'middle', horizontal: ['pesos', 'num', 'entero', 'pct'].includes(c.tipo) ? 'right' : 'left', wrapText: true }
    celda.border = { top: { style: 'thin', color: { argb: TINTA } }, bottom: { style: 'medium', color: { argb: TINTA } } }
    if (c.nota) celda.note = { texts: [{ text: c.nota }] }
  })
  titulos.height = 22

  filas.forEach((f, i) => {
    const r = hoja.getRow(filaTitulos + 1 + i)
    columnas.forEach((c, j) => {
      const celda = r.getCell(j + 1)
      celda.value = valorCelda(f[j], c.tipo)
      if (FORMATOS[c.tipo]) celda.numFmt = FORMATOS[c.tipo]
      celda.font = { name: 'Calibri', size: 11, color: { argb: TINTA } }
      celda.alignment = { vertical: 'top', wrapText: c.tipo === 'texto' || !c.tipo }
      celda.border = { bottom: { style: 'hair', color: { argb: LINEA } } }
    })
  })

  // Filas en blanco con formato (plantillas para llenar).
  for (let i = 0; i < filasVacias; i++) {
    const r = hoja.getRow(filaTitulos + 1 + filas.length + i)
    columnas.forEach((c, j) => {
      const celda = r.getCell(j + 1)
      if (FORMATOS[c.tipo]) celda.numFmt = FORMATOS[c.tipo]
      celda.border = { bottom: { style: 'hair', color: { argb: LINEA } } }
    })
  }

  const ultima = filaTitulos + filas.length + filasVacias
  if (total) {
    const r = hoja.getRow(ultima + 1)
    columnas.forEach((c, j) => {
      const celda = r.getCell(j + 1)
      celda.value = valorCelda(total[j], c.tipo)
      if (FORMATOS[c.tipo]) celda.numFmt = FORMATOS[c.tipo]
      celda.font = { name: 'Calibri', size: 11, bold: true, color: { argb: TINTA } }
      celda.border = { top: { style: 'thin', color: { argb: TINTA } }, bottom: { style: 'double', color: { argb: TINTA } } }
    })
  }

  // Listas desplegables (por ejemplo Sí/No o el tipo de cuenta).
  columnas.forEach((c, j) => {
    if (!c.lista?.length) return
    const hasta = Math.max(ultima, filaTitulos + 500)
    for (let i = filaTitulos + 1; i <= hasta; i++) {
      hoja.getCell(i, j + 1).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${c.lista.join(',')}"`], showErrorMessage: true, errorTitle: 'Valor no válido', error: `Escoja: ${c.lista.join(', ')}` }
    }
  })

  // Anchos a la medida del contenido.
  columnas.forEach((c, j) => {
    const largos = [String(c.titulo).length + (c.requerido ? 2 : 0), ...filas.map(f => comoTexto(valorCelda(f[j], c.tipo), c.tipo).length)]
    if (total) largos.push(comoTexto(total[j], c.tipo).length)
    const ancho = c.ancho || Math.min(48, Math.max(10, Math.max(...largos) + 3))
    hoja.getColumn(j + 1).width = ancho
  })

  hoja.views = [{ state: 'frozen', ySplit: filaTitulos, xSplit: 0, showGridLines: false }]
  if (filas.length) hoja.autoFilter = { from: { row: filaTitulos, column: 1 }, to: { row: filaTitulos, column: columnas.length } }
  hoja.pageSetup.printTitlesRow = `${filaTitulos}:${filaTitulos}`
  hoja.headerFooter = { oddFooter: '&L&8MaissyPOS&R&8Página &P de &N' }
  return hoja
}

// Hoja de texto (instrucciones): cada elemento es una fila. { titulo } en
// grande, { subtitulo } en gris, { seccion } en negrilla, o texto normal.
export function agregarTexto(libro, nombre, lineas, ancho = 100, usados = libro._usadosMaissy || (libro._usadosMaissy = new Set())) {
  const hoja = libro.addWorksheet(nombreHoja(nombre, usados), { views: [{ showGridLines: false }] })
  hoja.getColumn(1).width = ancho
  lineas.forEach((l, i) => {
    const celda = hoja.getCell(i + 1, 1)
    const o = typeof l === 'string' ? { texto: l } : l
    celda.value = o.titulo || o.subtitulo || o.seccion || o.texto || ''
    celda.alignment = { wrapText: true, vertical: 'top' }
    celda.font = o.titulo ? { size: 16, bold: true, color: { argb: TINTA } }
      : o.subtitulo ? { size: 11, color: { argb: GRIS } }
      : o.seccion ? { size: 12, bold: true, color: { argb: TINTA } }
      : { size: 11, color: { argb: TINTA } }
    if (o.titulo) hoja.getRow(i + 1).height = 24
    else if (o.seccion) hoja.getRow(i + 1).height = 22
    else if (!celda.value) hoja.getRow(i + 1).height = 10
  })
  return hoja
}

export async function guardarLibro(libro, archivo) {
  const buffer = await libro.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = String(archivo).replace(/[\\/?*:"<>|]/g, ' ').replace(/\s+/g, ' ').trim()
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
