'use client'
import { useRef, useState, useLayoutEffect } from 'react'

// Muestra un documento (factura, hoja) siempre al mismo ancho, como sale en el
// PDF, y lo achica para que quepa en la pantalla. Asi en el celular se ve
// igual que en el computador y que el PDF, en vez de reacomodarse.
export default function DocumentoAEscala({ ancho = 794, children }) {
  const marco = useRef(null)
  const doc = useRef(null)
  const [escala, setEscala] = useState(1)
  const [alto, setAlto] = useState(0)

  useLayoutEffect(() => {
    const medir = () => {
      if (!marco.current || !doc.current) return
      setEscala(Math.min(1, marco.current.clientWidth / ancho))
      setAlto(doc.current.offsetHeight)
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(marco.current); ro.observe(doc.current)
    return () => ro.disconnect()
  }, [ancho])

  return (
    <div ref={marco} className="doc-marco" style={{ width: '100%', height: alto ? alto * escala : undefined, overflow: 'hidden' }}>
      <div ref={doc} className="doc-escala" style={{ width: ancho, transform: `scale(${escala})`, transformOrigin: 'top left', margin: escala === 1 ? '0 auto' : 0 }}>
        {children}
      </div>
    </div>
  )
}
