'use client'
// "Atrás" dentro de un módulo: cuando se abre una pantalla interna (la orden
// de un proveedor, una liquidación, la ficha de un carro…) se deja una marca
// en el historial del navegador. Así el botón atrás del celular, de la tableta
// o del navegador vuelve a la pantalla anterior del módulo en vez de sacarlo
// del módulo o mandarlo al Inicio.
//
// const atras = useAtras(!!proveedorSel, cambiarProveedor)
//   - activo: hay una pantalla interna abierta.
//   - volver: cómo regresar (lo mismo que hace el botón Volver de la pantalla).
//   - atras(): para los botones Volver; deja el historial en orden.
//
// Las pantallas abiertas forman una pila: cada atrás cierra solo la de encima.

import { useEffect, useRef } from 'react'

const pila = []
let ignorar = 0
let escuchando = false

function escuchar() {
  if (escuchando || typeof window === 'undefined') return
  escuchando = true
  window.addEventListener('popstate', () => {
    if (ignorar > 0) { ignorar -= 1; return }
    const arriba = pila.pop()
    if (arriba) arriba.volverRef.current?.()
  })
}

export function useAtras(activo, volver) {
  const volverRef = useRef(volver)
  const entrada = useRef(null)
  useEffect(() => { volverRef.current = volver })

  useEffect(() => {
    escuchar()
    if (activo && !entrada.current) {
      entrada.current = { volverRef }
      pila.push(entrada.current)
      // Se copia el estado que guarda Next para que no recargue la página.
      window.history.pushState({ ...(window.history.state || {}) }, '')
    } else if (!activo && entrada.current) {
      // Se cerró desde la pantalla (botón, guardar): se quita la marca.
      const i = pila.indexOf(entrada.current)
      if (i >= 0) { pila.splice(i, 1); ignorar += 1; window.history.back() }
      entrada.current = null
    }
  }, [activo])

  // Al salir del módulo la marca deja de servir (no se toca el historial).
  useEffect(() => () => {
    const i = entrada.current ? pila.indexOf(entrada.current) : -1
    if (i >= 0) pila.splice(i, 1)
  }, [])

  return () => {
    if (entrada.current && pila.includes(entrada.current)) window.history.back()
    else volverRef.current?.()
  }
}
