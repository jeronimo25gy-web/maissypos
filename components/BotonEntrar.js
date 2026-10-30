'use client'
import { abrirAcceso } from '@/components/PanelAcceso'

// "Entrar" de la pagina comercial: abre el panel de acceso sin cambiar de
// pagina. Sin JavaScript, el enlace lleva a /entrar.
export default function BotonEntrar({ className, style, children = 'Entrar' }) {
  return <a href="/entrar" onClick={e => { e.preventDefault(); abrirAcceso() }} className={className} style={style}>{children}</a>
}
