// Comparte un documento de la pantalla (factura, compra, despacho, colilla)
// como PDF. Se toma una copia del documento a un ancho fijo, fuera de la
// pantalla y sin el scroll de la pagina: asi sale igual y completo desde el
// computador o desde el celular. Antes se fotografiaba como se estaba viendo,
// y salia recortado segun la pantalla o lo bajada que estuviera la pagina.
export async function generarYCompartirPDF(elementId, nombreArchivo, { ancho = 794 } = {}) {
  const contenido = document.getElementById(elementId)
  if (!contenido) { alert('No se encontro el contenido para compartir'); return }

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  const caja = document.createElement('div')
  caja.style.cssText = `position:fixed;left:-20000px;top:0;width:${ancho}px;background:#ffffff;z-index:-1`
  const copia = contenido.cloneNode(true)
  copia.removeAttribute('id')
  copia.style.width = `${ancho}px`
  copia.style.maxWidth = 'none'
  copia.style.margin = '0'
  copia.style.overflow = 'visible'
  copia.querySelectorAll('.no-print').forEach(n => n.remove())
  caja.appendChild(copia)
  document.body.appendChild(caja)

  let canvas
  try {
    // Que las imagenes (logo) esten cargadas en la copia antes de la foto.
    await Promise.all([...copia.querySelectorAll('img')].map(img => img.complete ? null : new Promise(r => { img.onload = r; img.onerror = r })))
    canvas = await html2canvas(copia, {
      scale: 2, backgroundColor: '#ffffff', useCORS: true,
      width: ancho, height: copia.scrollHeight, windowWidth: ancho, windowHeight: copia.scrollHeight, scrollX: 0, scrollY: 0,
    })
  } finally {
    document.body.removeChild(caja)
  }
  const imgData = canvas.toDataURL('image/png')

  const pdf = new jsPDF({ unit: 'px', format: [canvas.width, canvas.height], orientation: canvas.width > canvas.height ? 'landscape' : 'portrait' })
  pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height)
  const blob = pdf.output('blob')
  const archivo = `${nombreArchivo}.pdf`
  const file = new File([blob], archivo, { type: 'application/pdf' })

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: nombreArchivo })
      return
    } catch (err) {
      if (err.name === 'AbortError') return
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = archivo
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
