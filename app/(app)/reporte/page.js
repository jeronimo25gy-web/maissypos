'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { leerReporte, descargarExcel } from '@/lib/exportar'

// Hoja del reporte para guardar como PDF o imprimir: tamaño carta, logo de la
// empresa, título, periodo y las secciones con el diseño del manual de marca.
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', linea: '#E3E1D8', suave: '#EFEDE6', neutro: '#E9E4D6', rojo: '#C41230', verde: '#2E5E3A' }
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const pesos = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n || 0)).toLocaleString('es-CO')
const formato = (v, tipo) => {
  if (v == null || v === '') return '—'
  if (typeof v !== 'number') return v
  if (tipo === 'pesos') return pesos(v)
  if (tipo === 'pct') return `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('es-CO', { maximumFractionDigits: 1 })}%`
  return v.toLocaleString('es-CO', { maximumFractionDigits: 2 })
}

export default function Reporte() {
  const router = useRouter()
  const [r, setR] = useState(null)
  const [nada, setNada] = useState(false)
  useEffect(() => { const x = leerReporte(); if (x) setR(x); else setNada(true) }, [])

  if (nada) return <div className="p-8 text-center" style={{ color: C.gris }}>No hay un reporte para mostrar. Vuelve al módulo y toca Exportar.</div>
  if (!r) return null
  const generado = new Date(r.generado || Date.now()).toLocaleString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })

  return (
    <div style={{ background: C.fondo, minHeight: '100vh' }} className="print:bg-white">
      <style>{`@page { size: letter; margin: 14mm 14mm 16mm; } .kpis-hoja { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); } @media print { html, body { background: #fff !important; } .hoja { box-shadow: none !important; margin: 0 !important; padding: 0 !important; width: auto !important; } .seccion { break-inside: avoid; } .tabla-hoja { overflow: visible !important; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
      <div className="print:hidden sticky top-0 z-10 bg-white border-b px-4 py-2.5 flex items-center gap-2 flex-wrap" style={{ borderColor: C.linea }}>
        <button type="button" onClick={() => router.back()} className="px-3.5 min-h-[40px] rounded-xl text-sm font-bold" style={{ background: C.suave }}>Volver</button>
        <span className="flex-1 min-w-[160px] text-sm" style={{ color: C.gris }}>Así queda el PDF. En el celular: Imprimir → Compartir o Guardar en Archivos.</span>
        <button type="button" onClick={() => descargarExcel(r)} className="px-3.5 min-h-[40px] rounded-xl text-sm font-bold" style={{ background: C.suave }}>Excel</button>
        <button type="button" onClick={() => window.print()} className="px-4 min-h-[40px] rounded-xl text-sm font-bold text-white" style={{ background: C.rojo }}>Guardar PDF o imprimir</button>
      </div>

      <div className="hoja mx-auto my-6 bg-white w-full max-w-[816px] px-4 py-6 sm:px-10 sm:py-10 print:my-0" style={{ boxShadow: '0 8px 30px rgba(28,27,25,.10)', color: C.tinta }}>
        <header className="flex items-start justify-between gap-6 pb-5 border-b-2" style={{ borderColor: C.tinta }}>
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[.08em]" style={{ color: C.gris }}>{r.empresa}</p>
            <h1 className="text-[28px] font-extrabold leading-tight" style={titulo}>{r.titulo}</h1>
            {r.periodo && <p className="text-sm" style={{ color: C.gris }}>{r.periodo}</p>}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {r.logo ? <img src={r.logo} alt="" className="w-16 h-16 object-contain shrink-0" /> : <img src="/maissypos-logo.png" alt="MaissyPOS" className="w-28 h-auto shrink-0" />}
        </header>

        <main className="flex flex-col gap-7 pt-6">
          {(r.secciones || []).map((s, i) => (
            <section key={i} className="seccion flex flex-col gap-3">
              {s.titulo && <h2 className="text-lg font-extrabold" style={titulo}>{s.titulo}</h2>}
              {s.kpis?.length > 0 && (
                <div className="kpis-hoja grid gap-2.5">
                  {s.kpis.map((k, j) => (
                    <div key={j} className="rounded-xl p-3 min-w-0" style={{ background: C.fondo }}>
                      <p className="text-[11.5px] font-bold" style={{ color: C.gris }}>{k.rotulo}</p>
                      <span className="cifra-caja"><span className="cifra font-extrabold tabular-nums" style={{ ...titulo, '--cifra-max': '20px' }}>{k.valor}</span></span>
                      {k.nota && <p className="text-[11px]" style={{ color: C.gris }}>{k.nota}</p>}
                    </div>
                  ))}
                </div>
              )}
              {s.cascada?.length > 0 && <Cascada pasos={s.cascada} />}
              {s.tabla?.filas?.length > 0 && (
                <div className="tabla-hoja overflow-x-auto -mx-1 px-1">
                <table className="w-full text-[12.5px] border-collapse">
                  <thead><tr>{s.tabla.columnas.map((c, j) => <th key={j} className={`py-2 px-1.5 text-[10.5px] font-extrabold uppercase tracking-wider border-b-[1.5px] ${c.tipo && c.tipo !== 'texto' ? 'text-right' : 'text-left'}`} style={{ color: C.gris, borderColor: C.tinta }}>{c.titulo}</th>)}</tr></thead>
                  <tbody>
                    {s.tabla.filas.map((f, j) => (
                      <tr key={j} className="border-b" style={{ borderColor: C.linea }}>
                        {f.map((v, k) => <td key={k} className={`py-1.5 px-1.5 tabular-nums ${s.tabla.columnas[k]?.tipo && s.tabla.columnas[k].tipo !== 'texto' ? 'text-right' : ''}`} style={{ color: typeof v === 'number' && v < 0 ? C.rojo : C.tinta }}>{formato(v, s.tabla.columnas[k]?.tipo)}</td>)}
                      </tr>
                    ))}
                    {s.tabla.total && (
                      <tr className="font-extrabold">{s.tabla.total.map((v, k) => <td key={k} className={`py-2 px-1.5 tabular-nums border-t-[1.5px] ${s.tabla.columnas[k]?.tipo && s.tabla.columnas[k].tipo !== 'texto' ? 'text-right' : ''}`} style={{ borderColor: C.tinta }}>{formato(v, s.tabla.columnas[k]?.tipo)}</td>)}</tr>
                    )}
                  </tbody>
                </table>
                </div>
              )}
              {s.nota && <p className="text-[11.5px]" style={{ color: C.gris }}>{s.nota}</p>}
            </section>
          ))}
        </main>

        <footer className="mt-10 pt-3 border-t flex justify-between gap-4 text-[10.5px]" style={{ borderColor: C.linea, color: C.gris }}>
          <span>Generado por MaissyPOS · {generado}</span>
          <span>{r.empresa}</span>
        </footer>
      </div>
    </div>
  )
}

function Cascada({ pasos }) {
  const max = Math.max(...pasos.map(p => Math.abs(p.valor)), 1)
  let corre = 0
  return (
    <div className="flex flex-col gap-1.5">
      {pasos.map((p, i) => {
        let izq, ancho, color
        if (p.tipo === 'resta') { corre += p.valor; izq = Math.max(0, corre); ancho = Math.abs(p.valor); color = C.rojo }
        else { corre = p.valor; izq = Math.min(0, p.valor); ancho = Math.abs(p.valor); color = p.tipo === 'total' ? (p.valor >= 0 ? C.verde : C.rojo) : C.neutro }
        return (
          <div key={i} className={`grid items-center gap-2.5 text-[12.5px] ${p.tipo === 'total' ? 'border-t-[1.5px] pt-1.5 font-extrabold' : ''}`} style={{ gridTemplateColumns: 'minmax(105px, 170px) minmax(40px, 1fr) auto', borderColor: C.tinta }}>
            <span className={p.tipo === 'base' || p.tipo === 'total' || p.tipo === 'sub' ? 'font-bold' : ''}>{p.rotulo}</span>
            <span className="relative h-4"><i className="absolute top-0 bottom-0 rounded-[3px]" style={{ left: `${(izq / max) * 100}%`, width: `${Math.max(0.5, (ancho / max) * 100)}%`, background: color }} /></span>
            <span className="text-right tabular-nums font-bold" style={{ color: p.valor < 0 ? C.rojo : C.tinta }}>{pesos(p.valor)}</span>
          </div>
        )
      })}
    </div>
  )
}
