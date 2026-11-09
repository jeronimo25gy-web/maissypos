'use client'
import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { generarYCompartirPDF } from '@/lib/compartir'
import { puedeVerModulo } from '@/lib/permisos'
import { logoRecortado } from '@/lib/cuenta-pago'
import DocumentoAEscala from '@/components/DocumentoAEscala'
import { C, TITULO, n, nombreRuta, cargarHoja, Frente, Reverso } from '@/components/HojaDespacho'

// Si el contenido (muchos productos) es más alto que la hoja, se achica un
// poco para que quepa entero en una sola media carta y no salte a otra hoja.
function AjustarAlto({ alto, ancho, children }) {
  const ref = useRef(null)
  const [escala, setEscala] = useState(1)
  // Se mide sin escalar (scrollHeight no cambia con transform) y se achica con
  // transform: con zoom, Chrome imprimía la tabla corrida un renglón.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const real = el.scrollHeight
    setEscala(real > alto ? Math.max(0.6, alto / real) : 1)
  }, [alto, children])
  return (
    <div ref={ref} style={{ display: 'flex', transform: escala < 1 ? `scale(${escala})` : 'none', transformOrigin: 'top left', marginLeft: escala < 1 ? (ancho - ancho * escala) / 2 : 0 }}>
      {children}
    </div>
  )
}

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
  // Papel: carta (imprime en la mitad izquierda; la otra mitad queda para otro dia)
  // o media carta (la hoja ya recortada). Se recuerda en este equipo.
  // Por defecto carta acostada con dos medias cartas (Chrome no ofrece media
  // carta); se recuerda en este equipo.
  const [papel, setPapelEstado] = useState(() => { try { return localStorage.getItem('maissy_papel_hoja_v3') || 'carta' } catch { return 'carta' } })
  const setPapel = (v) => { setPapelEstado(v); try { localStorage.setItem('maissy_papel_hoja_v3', v) } catch { /* sin guardar */ } }
  // Qué se imprime: el frente primero y, volviendo a meter la misma hoja por
  // el lado blanco, el reverso. "Ambas" saca todo seguido (impresora a doble cara).
  const [lado, setLado] = useState('frente')

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')
    if (!u) { router.push('/entrar'); return }
    if (!puedeVerModulo(u, 'imprimir', ['admin', 'auxiliar'])) { router.push('/despacho'); return }
    setListos(true)
    const empresaId = getEmpresaId()
    supabase.from('empresas').select('nombre, logo_url').eq('id', empresaId).maybeSingle().then(({ data }) => { setEmpresa(data); logoRecortado(data?.logo_url).then(setLogo) })
    const q = new URLSearchParams(window.location.search)
    const id = q.get('despacho'), fecha = q.get('fecha')
    const sel = 'id, fecha, hora_cargue, estado, ruta_id, vendedor_id, total_und, dia_carga, rutas(nombre), vendedores(nombre)'
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
    try { await generarYCompartirPDF('despacho-imprimible', `Despacho-${hojas.length === 1 ? nombreRuta(hojas[0].d.rutas?.nombre) : hojas[0]?.d.fecha || ''}`, { ancho: papel === 'media' ? 528 : 1056 }) }
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

  // Paginas. Carta (lo normal): hoja carta acostada con dos medias cartas de
  // pie lado a lado, para cortar por la mitad. Distri lleva frente y reverso:
  // primero se imprimen los frentes y, volviendo a meter las mismas hojas por
  // el lado blanco, los reversos en orden cruzado (al voltear la hoja, lo que
  // estaba a la izquierda queda a la derecha), así cada reverso cae detrás de
  // su frente. Media carta: una media carta por pagina.
  const media = papel === 'media'
  const medias = hojas.filter(h => h.tam === 'media')
  const solas = hojas.filter(h => h.tam !== 'media')
  const frente = (h) => <Frente h={h} empresa={empresa} logo={logo} />
  const reverso = (h) => <Reverso h={h} />
  const paginas = []
  if (media) {
    medias.forEach(h => {
      if (lado !== 'reverso') paginas.push({ k: 'f' + h.d.id, mitades: [frente(h)] })
      if (lado !== 'frente') paginas.push({ k: 'r' + h.d.id, mitades: [reverso(h)] })
    })
    if (lado !== 'reverso') solas.forEach(h => paginas.push({ k: 's' + h.d.id, mitades: [frente(h)] }))
  } else {
    for (let i = 0; i < medias.length; i += 2) {
      const a = medias[i], b = medias[i + 1]
      if (lado !== 'reverso') paginas.push({ k: 'f' + a.d.id, mitades: [frente(a), b ? frente(b) : null] })
      if (lado !== 'frente') paginas.push({ k: 'r' + a.d.id, mitades: [b ? reverso(b) : null, reverso(a)] })
    }
    if (lado !== 'reverso') for (let i = 0; i < solas.length; i += 2) paginas.push({ k: 's' + i, mitades: [frente(solas[i]), solas[i + 1] ? frente(solas[i + 1]) : null] })
  }
  const W = media ? 528 : 1056, H = 816

  return (
    <div style={{ background: C.fondo, minHeight: '100vh' }}>
      <style>{`
        @page { size: ${media ? '5.5in 8.5in' : 'letter landscape'}; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: white; }
          .doc-escala { transform: none !important; } .doc-marco { height: auto !important; overflow: visible !important; }
          .marco-doc { padding: 0 !important; background: white !important; }
          #despacho-imprimible { gap: 0 !important; background: white !important; }
          .pagina { box-shadow: none !important; margin: 0 !important; width: ${media ? '5.5in' : '11in'} !important; height: 8.5in !important; overflow: hidden !important; break-inside: avoid; page-break-inside: avoid; }
          .pagina + .pagina { break-before: page; page-break-before: always; }
          html, body { height: auto !important; }
        }
      `}</style>
      <div className="no-print px-4 py-3 flex flex-wrap gap-2 items-center sticky top-0 z-10" style={{ background: C.fondo }}>
        <button onClick={() => (despachos.length ? setHojas(null) : router.push('/despacho'))} className={boton} style={{ background: C.suave, color: C.tinta }}>Volver</button>
        <span className="flex-1 min-w-[180px] text-[13px]" style={{ color: C.gris }}>
          {hojas.length === 1 ? `${nombreRuta(hojas[0].d.rutas?.nombre)} · ` : `${hojas.length} despachos · `}
          {medias.length ? (lado === 'frente' ? `Paso 1: imprime los frentes${media ? '' : ' (dos por hoja carta acostada)'}. Luego vuelve a meter las mismas hojas por el lado blanco y escoge Reverso` : lado === 'reverso' ? 'Paso 2: mete las hojas ya impresas por el lado blanco, en el mismo orden. Después corta por la mitad' : 'Frente y reverso seguidos (impresora a doble cara)') : media ? 'una hoja por despacho' : 'dos por hoja: corta por la mitad'}
        </span>
        <div className="flex gap-1 rounded-full p-1 bg-white" role="group" aria-label="Papel">
          {[['carta', 'Carta (2 por hoja)'], ['media', 'Media carta']].map(([v, t]) => (
            <button key={v} type="button" aria-pressed={papel === v} onClick={() => setPapel(v)} className="rounded-full min-h-[34px] px-3 text-[13px] font-bold"
              style={papel === v ? { background: C.fondo, color: C.tinta, boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { color: C.gris }}>{t}</button>
          ))}
        </div>
        {medias.length > 0 && (
          <div className="flex gap-1 rounded-full p-1 bg-white" role="group" aria-label="Qué imprimir">
            {[['frente', '1. Frente'], ['reverso', '2. Reverso'], ['ambas', 'Ambas']].map(([v, t]) => (
              <button key={v} type="button" aria-pressed={lado === v} onClick={() => setLado(v)} className="rounded-full min-h-[34px] px-3 text-[13px] font-bold"
                style={lado === v ? { background: C.fondo, color: C.tinta, boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { color: C.gris }}>{t}</button>
            ))}
          </div>
        )}
        <button onClick={() => window.print()} className={boton} style={{ background: C.suave, color: C.tinta }}>Imprimir</button>
        <button onClick={compartir} disabled={compartiendo} className={boton + ' text-white bg-brand disabled:opacity-50'}>{compartiendo ? 'Generando…' : 'Compartir PDF'}</button>
      </div>
      <div className="marco-doc px-3 pb-8">
        <div style={{ maxWidth: W, margin: '0 auto' }}>
          <DocumentoAEscala ancho={W}>
            <div id="despacho-imprimible" style={{ display: 'flex', flexDirection: 'column', gap: 16, background: C.fondo }}>
              {paginas.map(p => (
                <div key={p.k} className="pagina" style={{ width: W, height: H, background: '#fff', boxShadow: '0 10px 30px rgba(28,27,25,.10)', display: 'flex', overflow: 'hidden' }}>
                  {p.mitades.map((m, i) => (
                    <div key={i} style={{ width: 528, height: H, flex: '0 0 528px', overflow: 'hidden', borderLeft: i && !media ? '1px dashed #B8B4AA' : 0 }}>
                      {m && <AjustarAlto alto={H} ancho={528}>{m}</AjustarAlto>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </DocumentoAEscala>
        </div>
      </div>
    </div>
  )
}
