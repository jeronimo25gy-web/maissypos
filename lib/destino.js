'use client'
import { useEffect, useRef } from 'react'

// Lo que pide el buscador por la direccion (?cliente=…, ?producto=…). Se lee
// al llegar y cada vez que el buscador navega a la misma pagina (evento
// 'maissy:navegar'), porque en ese caso la pagina no se vuelve a montar.
export function useDestino(param, abrir, listo = true) {
  const fn = useRef(abrir)
  fn.current = abrir
  useEffect(() => {
    if (!listo) return
    const leer = (href) => { const v = new URL(href, window.location.origin).searchParams.get(param); if (v) fn.current(v) }
    leer(window.location.href)
    const ir = (e) => leer(e.detail)
    window.addEventListener('maissy:navegar', ir)
    return () => window.removeEventListener('maissy:navegar', ir)
  }, [param, listo])
}

// Lleva la fila a la vista (vendedores, empleados) despues de pintarla.
export const mostrarFila = (id) => setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
