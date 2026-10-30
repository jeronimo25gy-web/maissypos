'use client'
import { abrirPrueba } from '@/components/PanelPrueba'

// "Probarlo en mi negocio": abre el formulario sin salir de la pagina.
export default function BotonProbar({ className, style, children = 'Probarlo en mi negocio' }) {
  return <button type="button" onClick={abrirPrueba} className={className} style={style}>{children}</button>
}
