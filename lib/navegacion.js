'use client'
// Historial de pantallas dentro de la app (por pestaña), para que la flecha
// de volver regrese a la pantalla anterior y no siempre a un sitio fijo.
// Si se entra directo a una pantalla (enlace, recarga sin historial), vuelve
// al inicio del rol.
const CLAVE = 'maissy_pila'

const leer = () => { try { return JSON.parse(sessionStorage.getItem(CLAVE) || '[]') } catch { return [] } }
const guardar = (p) => { try { sessionStorage.setItem(CLAVE, JSON.stringify(p.slice(-30))) } catch {} }

export function registrarPantalla(ruta) {
  const pila = leer()
  if (pila[pila.length - 1] === ruta) return
  // Si llega a la penultima, fue un "atras" (flecha o boton del navegador).
  if (pila[pila.length - 2] === ruta) pila.pop()
  else pila.push(ruta)
  guardar(pila)
}

export function inicioDelRol() {
  try {
    const u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')
    if (u?.rol === 'admin') return '/ejecutivo'
    if (u?.rol === 'vendedor') return '/mi-ruta'
  } catch {}
  return '/despacho'
}

export function volverAtras(router, respaldo) {
  if (leer().length >= 2) router.back()
  else router.push(respaldo || inicioDelRol())
}
