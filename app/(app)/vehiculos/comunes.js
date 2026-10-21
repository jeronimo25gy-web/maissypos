'use client'
import { useState } from 'react'
import { verSoporte, subirSoporte } from '@/lib/soportes'
import { C } from '../gastos/ui'

// Piezas compartidas de Vehículos y activos.
export const miles = (n) => Math.round(Number(n || 0)).toLocaleString('es-CO')
export const fechaLarga = (f) => f ? new Date(String(f).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export const Placa = ({ children, grande }) => (
  <span className="inline-flex items-center justify-center rounded-lg font-extrabold tracking-wider" style={{ background: C.amarillo, color: C.tinta, border: `2px solid ${C.tinta}`, padding: grande ? '3px 12px' : '1px 9px', fontSize: grande ? 20 : 15, fontFamily: 'var(--font-titulo), Georgia, serif' }}>{children}</span>
)

// Abre un archivo: URL pública (archivos anteriores) o ruta del bucket privado.
export async function abrirArchivo(ruta) {
  if (!ruta) return
  if (/^https?:/.test(ruta)) { window.open(ruta, '_blank'); return }
  const url = await verSoporte(ruta)
  if (url) window.open(url, '_blank'); else alert('No se pudo abrir el archivo.')
}

export function BotonArchivo({ ruta, texto = 'Ver archivo' }) {
  if (!ruta) return null
  return <button type="button" onClick={() => abrirArchivo(ruta)} className="text-[13px] font-bold" style={{ color: C.tinta }}>{texto}</button>
}

export function VerFotos({ fotos }) {
  if (!fotos?.length) return null
  return <span className="flex gap-3 flex-wrap">{fotos.map((f, i) => <BotonArchivo key={i} ruta={f} texto={`Foto ${i + 1}`} />)}</span>
}

// Sube una o varias fotos al bucket privado y devuelve sus rutas.
export function SubirFotos({ valor = [], onCambio, carpeta = 'vehiculos', texto = 'Agregar fotos', multiple = true }) {
  const [subiendo, setSubiendo] = useState(false)
  const subir = async (files) => {
    if (!files?.length) return
    setSubiendo(true)
    try {
      const rutas = []
      for (const f of files) rutas.push(await subirSoporte(f, carpeta))
      onCambio(multiple ? [...valor, ...rutas] : rutas.slice(0, 1))
    } catch (e) { alert('No se pudo subir: ' + e.message) }
    setSubiendo(false)
  }
  return (
    <label className="rounded-xl min-h-[42px] px-4 text-sm font-bold flex items-center justify-center cursor-pointer w-max" style={valor.length ? { background: C.verdeF, color: C.verde } : { background: C.suave, color: C.tinta }}>
      {subiendo ? 'Subiendo…' : valor.length ? `${valor.length} ${valor.length === 1 ? 'archivo' : 'archivos'} · agregar` : texto}
      <input type="file" accept="image/*,application/pdf" multiple={multiple} className="hidden" onChange={e => { subir([...(e.target.files || [])]); e.target.value = '' }} />
    </label>
  )
}
