'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { cargarIndice, buscar } from '@/lib/buscador'
import { UserGroupIcon, UsersIcon, CubeIcon, MapIcon, ShoppingCartIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline'

// Ventana del buscador general. Se abre con Ctrl+K (o Cmd+K), con el campo
// "Buscar" del encabezado o desde el menú (evento 'maissy:buscar' con el texto).
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: 'var(--hoja)', linea: '#E3E1D8', suave: '#EFEDE6' }
// Modulos y secciones traen el icono de su modulo; lo demas, el de su categoria.
const ICONO = { Personas: UserGroupIcon, Clientes: UsersIcon, Productos: CubeIcon, Rutas: MapIcon, Proveedores: ShoppingCartIcon, Vehículos: WrenchScrewdriverIcon }

export const abrirBuscador = (texto = '') => window.dispatchEvent(new CustomEvent('maissy:buscar', { detail: texto }))

export default function Buscador({ usuario }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [indice, setIndice] = useState(null)
  const [activo, setActivo] = useState(0)
  const campo = useRef(null)

  useEffect(() => {
    const tecla = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setAbierto(true) } }
    const evento = (e) => { setTexto(e.detail || ''); setAbierto(true) }
    window.addEventListener('keydown', tecla)
    window.addEventListener('maissy:buscar', evento)
    return () => { window.removeEventListener('keydown', tecla); window.removeEventListener('maissy:buscar', evento) }
  }, [])

  useEffect(() => {
    if (!abierto) return
    setActivo(0)
    setTimeout(() => campo.current?.focus(), 30)
    if (!indice) cargarIndice(usuario).then(setIndice).catch(() => setIndice([]))
  }, [abierto]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!abierto) return null
  const grupos = indice ? buscar(indice, texto) : []
  const planos = grupos.flatMap(g => g.items)
  const cerrar = () => { setAbierto(false); setTexto('') }
  // Avisa a la pagina abierta: si ya se esta en ella, router.push no la vuelve a montar.
  const ir = (it) => { cerrar(); router.push(it.href); setTimeout(() => window.dispatchEvent(new CustomEvent('maissy:navegar', { detail: it.href })), 50) }
  const teclas = (e) => {
    if (e.key === 'Escape') cerrar()
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActivo(a => Math.min(planos.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(a => Math.max(0, a - 1)) }
    else if (e.key === 'Enter' && planos[activo]) ir(planos[activo])
  }
  let n = -1

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-start justify-center p-3 md:pt-[12vh]" onClick={cerrar}>
      <div className="w-full max-w-2xl bg-white rounded-[20px] overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()} role="dialog" aria-label="Buscar en MaissyPOS"
        style={{ boxShadow: '0 20px 50px rgba(28,27,25,.25)' }}>
        <label className="flex items-center gap-2.5 px-4 min-h-[56px] border-b" style={{ borderColor: C.linea }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={C.gris} strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input ref={campo} value={texto} onChange={e => { setTexto(e.target.value); setActivo(0) }} onKeyDown={teclas}
            placeholder="Buscar personas, clientes, productos, rutas…" aria-label="Buscar"
            className="flex-1 min-w-0 bg-transparent outline-none text-base font-semibold" style={{ color: C.tinta }} />
          <button type="button" onClick={cerrar} className="text-xs font-bold rounded-md px-2 py-1" style={{ background: C.suave, color: C.gris }}>Esc</button>
        </label>
        <div className="overflow-y-auto p-2">
          {!indice && <p className="text-sm px-3 py-4" style={{ color: C.gris }}>Cargando…</p>}
          {indice && !texto.trim() && <p className="text-sm px-3 py-4" style={{ color: C.gris }}>Escribe un nombre, un producto, una ruta, una placa o una sección del sistema. No importan las tildes ni escribir el nombre completo.</p>}
          {indice && texto.trim() && grupos.length === 0 && <p className="text-sm px-3 py-4" style={{ color: C.gris }}>No encontré nada con “{texto}”.</p>}
          {grupos.map(g => (
            <div key={g.grupo}>
              <div className="text-[11.5px] font-extrabold uppercase tracking-wider px-3 pt-3 pb-1" style={{ color: C.gris }}>{g.grupo}{g.total > g.items.length ? ` · ${g.total}` : ''}</div>
              {g.items.map(it => {
                n++
                const i = n
                const Icono = it.icono || ICONO[g.grupo]
                return (
                  <button key={g.grupo + it.titulo + it.detalle} type="button" onClick={() => ir(it)} onMouseEnter={() => setActivo(i)}
                    className="w-full text-left grid gap-2.5 items-center px-3 py-2 rounded-xl" style={{ gridTemplateColumns: '34px minmax(0,1fr)', background: activo === i ? C.fondo : 'transparent' }}>
                    <span className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center" style={{ background: C.suave, color: C.tinta }}><Icono className="w-[19px] h-[19px]" strokeWidth={1.7} /></span>
                    <span className="min-w-0"><b className="block text-sm truncate" style={{ color: C.tinta }}>{it.titulo}</b><span className="block text-[12.5px] truncate" style={{ color: C.gris }}>{it.detalle}</span></span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
