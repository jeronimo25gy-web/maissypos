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

// Excel con el formato común (lib/excel.js): una hoja Resumen con los
// indicadores y el resultado, y una hoja por cada tabla.
export async function descargarExcel(reporte) {
  const { nuevoLibro, agregarTabla, guardarLibro } = await import('./excel')
  const libro = await nuevoLibro()
  const subtitulo = [reporte.empresa, reporte.periodo].filter(Boolean).join(' · ')
  const tipoKpi = (k) => k.tipo || (String(k.valor ?? '').trim().startsWith('$') ? 'pesos' : 'num')
  const conLetras = (v) => /[a-záéíóúñ]/i.test(String(v ?? ''))

  const kpis = (reporte.secciones || []).flatMap(s => (s.kpis || []).map(k => ({ ...k, seccion: s.titulo })))
  const cascada = (reporte.secciones || []).flatMap(s => s.cascada || [])
  if (kpis.length || cascada.length) {
    const filas = [
      ...kpis.map(k => {
        const texto = conLetras(k.valor) || k.valorNumero == null
        return [k.rotulo, texto ? String(k.valor ?? '') : k.valorNumero, k.nota || '', texto ? 'texto' : tipoKpi(k)]
      }),
      ...cascada.map(c => [c.rotulo, c.valor, c.tipo === 'resta' ? 'Se resta' : c.tipo === 'total' ? 'Total' : c.tipo === 'sub' ? 'Subtotal' : '', 'pesos']),
    ]
    // Cada fila lleva su propio formato: se arma una columna por tipo.
    const hoja = agregarTabla(libro, 'Resumen', {
      encabezado: { titulo: reporte.titulo, subtitulo },
      columnas: [{ titulo: 'Indicador', tipo: 'texto' }, { titulo: 'Valor', tipo: 'num' }, { titulo: 'Detalle', tipo: 'texto' }],
      filas: filas.map(f => f.slice(0, 3)),
    })
    const { FORMATOS } = await import('./excel')
    const primera = hoja.views[0].ySplit + 1
    filas.forEach((f, i) => {
      const celda = hoja.getCell(primera + i, 2)
      if (f[3] === 'texto') { celda.numFmt = '@'; celda.alignment = { horizontal: 'right' } }
      else celda.numFmt = FORMATOS[f[3]] || FORMATOS.num
      if (cascada.length && i >= kpis.length) {
        const c = cascada[i - kpis.length]
        if (c.tipo === 'total' || c.tipo === 'sub') [1, 2, 3].forEach(k => { hoja.getCell(primera + i, k).font = { bold: true } })
      }
    })
  }

  ;(reporte.secciones || []).filter(s => s.tabla?.filas?.length).forEach(s => {
    agregarTabla(libro, s.titulo, {
      encabezado: { titulo: s.titulo, subtitulo: [reporte.titulo, subtitulo].filter(Boolean).join(' · ') },
      columnas: s.tabla.columnas.map(c => ({ titulo: c.titulo, tipo: c.tipo || 'texto' })),
      filas: s.tabla.filas,
      total: s.tabla.total,
    })
  })
  await guardarLibro(libro, `${reporte.titulo}${reporte.empresa ? ' - ' + reporte.empresa : ''}${reporte.periodo ? ' - ' + reporte.periodo : ''}.xlsx`)
}
