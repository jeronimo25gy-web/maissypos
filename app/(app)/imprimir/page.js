'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { generarYCompartirPDF } from '@/lib/compartir'
import { puedeVerModulo } from '@/lib/permisos'
import { logoRecortado } from '@/lib/cuenta-pago'
import DocumentoAEscala from '@/components/DocumentoAEscala'
import { C, TITULO, n, nombreRuta, cargarHoja, Frente, Reverso } from '@/components/HojaDespacho'

// Hojas de despacho para imprimir o compartir en PDF. Se abre con
// ?despacho=<id> (desde Despacho) o ?fecha=<dia> (todas las del dia).
export default function Imprimir() {
  const router = useRouter()
  const [listos, setListos] = useState(false)
  const [despachos, setDespachos] = useState([])
  const [hojas, setHojas] = useState(null)
  const [empresa, setEmpresa] = useState(null)
  const [logo, setLogo] = useState(null)
  const [compartiendo, setCompartiendo] = useState(false)

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')
    if (!u) { router.push('/'); return }
    if (!puedeVerModulo(u, 'imprimir', ['admin', 'auxiliar'])) { router.push('/despacho'); return }
    setListos(true)
    const empresaId = getEmpresaId()
    supabase.from('empresas').select('nombre, logo_url').eq('id', empresaId).maybeSingle().then(({ data }) => { setEmpresa(data); logoRecortado(data?.logo_url).then(setLogo) })
    const q = new URLSearchParams(window.location.search)
    const id = q.get('despacho'), fecha = q.get('fecha')
    const sel = 'id, fecha, hora_cargue, estado, ruta_id, vendedor_id, total_und, rutas(nombre), vendedores(nombre)'
    if (id) supabase.from('despachos_encab').select(sel).eq('id', id).eq('empresa_id', empresaId).then(({ data }) => abrir(data || []))
    else supabase.from('despachos_encab').select(sel).eq('fecha', fecha || obtenerFechaActual()).eq('empresa_id', empresaId).neq('estado', 'borrador').order('created_at')
      .then(({ data }) => { setDespachos(data || []); if (fecha) abrir(data || []) })
  }, [router]) // eslint-disable-line react-hooks/exhaustive-deps

  const abrir = async (lista) => {
    setHojas('cargando')
    const empresaId = getEmpresaId()
    setHojas(await Promise.all(lista.map(d => cargarHoja(d, empresaId))))
  }

  const compartir = async () => {
    setCompartiendo(true)
    try { await generarYCompartirPDF('despacho-imprimible', `Despacho-${hojas.length === 1 ? nombreRuta(hojas[0].d.rutas?.nombre) : hojas[0]?.d.fecha || ''}`, { ancho: 1056 }) }
    finally { setCompartiendo(false) }
  }

  if (!listos) return null
  const boton = 'rounded-xl min-h-[42px] px-4 font-bold text-sm'

  if (!hojas) return (
    <div className="min-h-screen" style={{ background: C.fondo, color: C.tinta }}>
      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-extrabold text-[22px]" style={{ fontFamily: TITULO }}>Hojas de despacho</h1>
          <button onClick={() => router.push('/despacho')} className={boton} style={{ background: C.suave }}>Volver</button>
        </div>
        {despachos.length === 0 ? <p className="bg-white rounded-2xl p-6 text-center" style={{ color: C.gris }}>No hay despachos hoy.</p> : (
          <>
            {despachos.length > 1 && <button onClick={() => abrir(despachos)} className={boton + ' text-white bg-brand'}>Imprimir las {despachos.length} de hoy</button>}
            {despachos.map(d => (
              <button key={d.id} onClick={() => abrir([d])} className="bg-white rounded-2xl p-4 text-left flex flex-col gap-0.5">
                <b>{nombreRuta(d.rutas?.nombre)}</b>
                <span className="text-sm" style={{ color: C.gris }}>{d.vendedores?.nombre || 'Sin vendedor'} · {n(d.total_und)} unidades</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )

  if (hojas === 'cargando') return <p className="p-10 text-center" style={{ color: C.gris, background: C.fondo, minHeight: '100vh' }}>Armando la hoja…</p>

  // Paginas: media carta = hoja carta horizontal con la media hoja a la izquierda
  // (frente en una pagina, reverso en la siguiente). Cuartos = 4 por carta
  // vertical; el reverso va en espejo para que al voltear la hoja coincida.
  const medias = hojas.filter(h => h.tam === 'media')
  const cuartos = hojas.filter(h => h.tam === 'cuarto')
  const paginas = []
  medias.forEach(h => {
    paginas.push({ k: 'f' + h.d.id, horizontal: true, contenido: <Frente h={h} empresa={empresa} logo={logo} /> })
    paginas.push({ k: 'r' + h.d.id, horizontal: true, contenido: <Reverso h={h} /> })
  })
  for (let i = 0; i < cuartos.length; i += 4) {
    const grupo = cuartos.slice(i, i + 4)
    const celda = (h, k, cara) => (
      <div key={k} style={{ width: 408, height: 528, borderRight: k % 2 === 0 ? '1px dashed #B8B4AA' : 0, borderBottom: k < 2 ? '1px dashed #B8B4AA' : 0, boxSizing: 'border-box', overflow: 'hidden' }}>
        {h ? (cara === 'f' ? <Frente h={h} empresa={empresa} logo={logo} /> : <Reverso h={h} />) : null}
      </div>
    )
    paginas.push({ k: 'cf' + i, contenido: <div style={{ display: 'grid', gridTemplateColumns: '408px 408px' }}>{[0, 1, 2, 3].map(k => celda(grupo[k], k, 'f'))}</div> })
    paginas.push({ k: 'cr' + i, contenido: <div style={{ display: 'grid', gridTemplateColumns: '408px 408px' }}>{[1, 0, 3, 2].map((j, k) => celda(grupo[j], k, 'r'))}</div> })
  }
  const horizontal = paginas.some(p => p.horizontal)

  return (
    <div style={{ background: C.fondo, minHeight: '100vh' }}>
      <style>{`
        @page { size: letter ${horizontal ? 'landscape' : 'portrait'}; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: white; }
          .doc-escala { transform: none !important; } .doc-marco { height: auto !important; overflow: visible !important; }
          .marco-doc { padding: 0 !important; background: white !important; }
          .pagina { box-shadow: none !important; margin: 0 !important; }
          .pagina + .pagina { break-before: page; page-break-before: always; }
        }
      `}</style>
      <div className="no-print px-4 py-3 flex flex-wrap gap-2 items-center sticky top-0 z-10" style={{ background: C.fondo }}>
        <button onClick={() => (despachos.length ? setHojas(null) : router.push('/despacho'))} className={boton} style={{ background: C.suave, color: C.tinta }}>Volver</button>
        <span className="flex-1 min-w-[180px] text-[13px]" style={{ color: C.gris }}>
          {hojas.length === 1 ? `${nombreRuta(hojas[0].d.rutas?.nombre)} · ` : `${hojas.length} despachos · `}
          {cuartos.length ? 'cuarto de hoja, 4 por carta: imprime la 1, voltea la hoja e imprime la 2, y corta' : 'media carta: imprime la 1, voltea la hoja e imprime la 2'}
        </span>
        <button onClick={() => window.print()} className={boton} style={{ background: C.suave, color: C.tinta }}>Imprimir</button>
        <button onClick={compartir} disabled={compartiendo} className={boton + ' text-white bg-brand disabled:opacity-50'}>{compartiendo ? 'Generando…' : 'Compartir PDF'}</button>
      </div>
      <div className="marco-doc px-3 pb-8">
        <div style={{ maxWidth: horizontal ? 1056 : 816, margin: '0 auto' }}>
          <DocumentoAEscala ancho={horizontal ? 1056 : 816}>
            <div id="despacho-imprimible" style={{ display: 'flex', flexDirection: 'column', gap: 16, background: C.fondo }}>
              {paginas.map(p => (
                <div key={p.k} className="pagina" style={{ width: horizontal ? 1056 : 816, height: horizontal ? 816 : 1056, background: '#fff', boxShadow: '0 10px 30px rgba(28,27,25,.10)', display: 'flex', overflow: 'hidden' }}>
                  {p.contenido}
                </div>
              ))}
            </div>
          </DocumentoAEscala>
        </div>
      </div>
    </div>
  )
}
