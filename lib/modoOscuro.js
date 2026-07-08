const KEY = 'maissy_modo_oscuro'

export function leerModoOscuro() {
  return localStorage.getItem(KEY) === 'true'
}

export function aplicarModoOscuro(activo) {
  document.documentElement.classList.toggle('dark', activo)
  localStorage.setItem(KEY, activo ? 'true' : 'false')
}
