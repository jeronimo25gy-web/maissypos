'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { abrirPdf, descargarExcel } from '@/lib/exportar'

// Botón "Exportar" de los módulos: PDF presentable o Excel. `armar` devuelve
// el reporte (ver lib/exportar.js) con los datos que hay en pantalla.
// `periodos` (opcional) = [{ valor, nombre }]: se escoge uno en el menú y llega a armar(valor).
export default function Exportar({ armar, etiqueta = 'Exportar', periodos }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [periodo, setPeriodo] = useState(periodos?.[0]?.valor)
  const caja = useRef(null)
  useEffect(() => {
    if (!abierto) return
    const cerrar = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false) }
    document.addEventListener('pointerdown', cerrar)
    return () => document.removeEventListener('pointerdown', cerrar)
  }, [abierto])

  const pdf = async () => {
    setAbierto(false); setOcupado(true)
    try { const r = await armar(periodo); if (r) abrirPdf(r, router) } catch (e) { alert('No se pudo armar el reporte: ' + e.message) }
    setOcupado(false)
  }
  const excel = async () => {
    setAbierto(false); setOcupado(true)
    try { const r = await armar(periodo); if (r) await descargarExcel(r) } catch (e) { alert('No se pudo armar el Excel: ' + e.message) }
    setOcupado(false)
  }

  return (
    <div ref={caja} className="relative">
      <button type="button" onClick={() => setAbierto(!abierto)} disabled={ocupado} aria-expanded={abierto}
        className="px-3.5 min-h-[40px] rounded-xl text-sm font-bold disabled:opacity-50" style={{ background: '#EFEDE6', color: '#1C1B19' }}>
        {ocupado ? 'Armando…' : etiqueta}
      </button>
      {abierto && (
        <div className="absolute right-0 top-11 z-40 bg-white rounded-2xl p-1.5 w-64 text-left" style={{ boxShadow: '0 14px 36px rgba(28,27,25,.18)' }}>
          {periodos?.length > 1 && (
            <div className="flex gap-1 p-1.5 pb-2" role="radiogroup" aria-label="Mes del reporte">
              {periodos.map(p => (
                <button key={p.valor} type="button" role="radio" aria-checked={periodo === p.valor} onClick={() => setPeriodo(p.valor)}
                  className="flex-1 rounded-full min-h-[36px] px-2 text-[13px] font-bold capitalize text-[#1C1B19]"
                  style={periodo === p.valor ? { background: '#fff', boxShadow: 'inset 0 0 0 2px #1C1B19' } : { background: '#EFEDE6' }}>{p.nombre}</button>
              ))}
            </div>
          )}
          <button type="button" onClick={pdf} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-[#F3F1EA]">
            <b className="block text-sm text-[#1C1B19]">PDF presentable</b><span className="text-xs text-[#5A5750]">Para mostrar, mandar o imprimir</span>
          </button>
          <button type="button" onClick={excel} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-[#F3F1EA]">
            <b className="block text-sm text-[#1C1B19]">Excel</b><span className="text-xs text-[#5A5750]">Las tablas, para el contador</span>
          </button>
        </div>
      )}
    </div>
  )
}
