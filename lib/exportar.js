'use client'
// Exportar reportes: PDF presentable (hoja con el diseño del manual que se
// imprime o se guarda como PDF desde /reporte) y Excel (las tablas con números
// de verdad, una hoja por sección).
//
// reporte = {
//   titulo, empresa, logo, periodo,
//   secciones: [{
//     titulo, nota,
//     kpis: [{ rotulo, valor, nota }],
//     cascada: [{ rotulo, valor, tipo: 'base'|'resta'|'sub'|'total' }],
//     tabla: { columnas: [{ titulo, tipo: 'texto'|'pesos'|'num'|'pct' }], filas: [[...]], total: [...] },
//   }],
// }

const CLAVE = 'maissy_reporte'

export function abrirPdf(reporte, router) {
  try { sessionStorage.setItem(CLAVE, JSON.stringify({ ...reporte, generado: new Date().toISOString() })) } catch {}
  router.push('/reporte')
}

export const leerReporte = () => { try { return JSON.parse(sessionStorage.getItem(CLAVE) || 'null') } catch { return null } }

const limpio = (t) => String(t || '').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Hoja'

export async function descargarExcel(reporte) {
  const XLSX = await import('xlsx')
  const libro = XLSX.utils.book_new()
  const resumen = [[reporte.titulo], [reporte.empresa || ''], [reporte.periodo || ''], []]
  ;(reporte.secciones || []).forEach(s => {
    ;(s.kpis || []).forEach(k => resumen.push([k.rotulo, k.valorNumero ?? k.valor, k.nota || '']))
    ;(s.cascada || []).forEach(c => resumen.push([c.rotulo, c.valor]))
  })
  if (resumen.length > 4) XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(resumen), 'Resumen')
  const usados = new Set(['Resumen'])
  ;(reporte.secciones || []).filter(s => s.tabla?.filas?.length).forEach(s => {
    const filas = [s.tabla.columnas.map(c => c.titulo), ...s.tabla.filas]
    if (s.tabla.total) filas.push(s.tabla.total)
    const hoja = XLSX.utils.aoa_to_sheet(filas)
    hoja['!cols'] = s.tabla.columnas.map((c, i) => ({ wch: Math.min(48, Math.max(c.titulo.length, ...s.tabla.filas.map(f => String(f[i] ?? '').length)) + 2) }))
    // Pesos y porcentajes con formato, sin volverlos texto.
    s.tabla.columnas.forEach((c, j) => {
      if (!['pesos', 'pct', 'num'].includes(c.tipo)) return
      for (let i = 1; i < filas.length; i++) {
        const ref = XLSX.utils.encode_cell({ r: i, c: j })
        if (hoja[ref] && typeof hoja[ref].v === 'number') hoja[ref].z = c.tipo === 'pesos' ? '"$"#,##0' : c.tipo === 'pct' ? '0.0"%"' : '#,##0.##'
      }
    })
    let nombre = limpio(s.titulo), n = 2
    while (usados.has(nombre)) nombre = limpio(`${s.titulo} ${n++}`)
    usados.add(nombre)
    XLSX.utils.book_append_sheet(libro, hoja, nombre)
  })
  XLSX.writeFile(libro, `${reporte.titulo}${reporte.empresa ? ' - ' + reporte.empresa : ''}${reporte.periodo ? ' - ' + reporte.periodo : ''}.xlsx`.replace(/[\\/?*:]/g, ' '))
}
