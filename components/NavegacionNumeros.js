'use client'
// Campos de números en todo el sistema (cantidades, devoluciones, compras,
// conteos, plata): se escribe el número y con Enter o la flecha hacia abajo se
// pasa al renglón siguiente de la misma columna; con la flecha hacia arriba, al
// anterior. La pantalla acompaña para que el renglón quede a la vista. Las
// flechas ya no suben ni bajan el número, y la rueda del mouse tampoco lo
// cambia por accidente. Las flechitas del campo se quitan en globals.css.

import { useEffect } from 'react'

const SELECTOR = 'input[type="number"], input[inputmode="decimal"], input[inputmode="numeric"]'
const esNumero = (el) => el instanceof HTMLInputElement && el.matches(SELECTOR)
const usable = (el) => !el.disabled && !el.readOnly && el.offsetParent !== null

// Safari y Chrome confundían las casillas de cantidades y plata con el número
// de una tarjeta y ofrecían llenarlas con la tarjeta guardada. Se les apaga el
// autollenado a todas, también a las que aparecen después (listas, filas nuevas).
const sinAutollenado = (el) => {
  if (el.dataset.sinAuto) return
  el.dataset.sinAuto = '1'
  el.setAttribute('autocomplete', 'off')
  el.setAttribute('data-1p-ignore', 'true')
  el.setAttribute('data-lpignore', 'true')
  if (!el.getAttribute('name')) el.setAttribute('name', 'cantidad-search')
}

export default function NavegacionNumeros() {
  useEffect(() => {
    const revisar = (raiz) => {
      if (raiz instanceof HTMLInputElement) { if (raiz.matches(SELECTOR)) sinAutollenado(raiz); return }
      raiz.querySelectorAll?.(SELECTOR).forEach(sinAutollenado)
    }
    revisar(document)
    const obs = new MutationObserver(cambios => cambios.forEach(c => c.addedNodes.forEach(n => { if (n.nodeType === 1) revisar(n) })))
    obs.observe(document.body, { childList: true, subtree: true })
    return () => obs.disconnect()
  }, [])
  useEffect(() => {
    const alTeclear = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (!['Enter', 'ArrowDown', 'ArrowUp'].includes(e.key)) return
      const actual = e.target
      if (!esNumero(actual)) return
      const lista = [...document.querySelectorAll(SELECTOR)].filter(usable)
      const i = lista.indexOf(actual)
      if (i < 0) return
      const izquierda = actual.getBoundingClientRect().left
      const mismaColumna = (el) => Math.abs(el.getBoundingClientRect().left - izquierda) < 8
      const haciaAbajo = e.key !== 'ArrowUp'
      const resto = haciaAbajo ? lista.slice(i + 1) : lista.slice(0, i).reverse()
      const destino = resto.find(mismaColumna)
      if (!destino) {
        // Sin renglón al cual ir: las flechas igual no cambian el número.
        if (e.key !== 'Enter' && actual.type === 'number') e.preventDefault()
        return
      }
      e.preventDefault()
      destino.focus({ preventScroll: true })
      destino.scrollIntoView({ block: 'center', behavior: 'smooth' })
      try { destino.select() } catch { /* algunos tipos no permiten seleccionar */ }
    }
    // La rueda del mouse sobre un campo de número con el cursor adentro cambia
    // el valor sin que uno se dé cuenta: se suelta el campo y la página baja.
    const alRodar = (e) => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement && el.type === 'number' && el === e.target) el.blur()
    }
    document.addEventListener('keydown', alTeclear)
    document.addEventListener('wheel', alRodar, { passive: true })
    return () => {
      document.removeEventListener('keydown', alTeclear)
      document.removeEventListener('wheel', alRodar)
    }
  }, [])
  return null
}
