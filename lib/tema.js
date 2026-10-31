// Tema del marco: solo cambia las variables de color (globals.css) y los logos.
// "Manual" es lo definido en el manual de marca; Rojo y Dorado son pruebas para
// comparar. Se guarda en este equipo.
const CLAVE = 'maissy_tema'
export const TEMAS = [['manual', 'Manual'], ['rojo', 'Rojo'], ['dorado', 'Dorado'], ['grafito', 'Grafito']]
export function temaGuardado() {
  try { const t = localStorage.getItem(CLAVE); return TEMAS.some(([id]) => id === t) ? t : 'manual' } catch { return 'manual' }
}
export function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema
  try { localStorage.setItem(CLAVE, tema) } catch { /* solo por esta visita */ }
}
