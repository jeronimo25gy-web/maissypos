'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import CampoFecha from '@/components/CampoFecha'
import { PASOS, pasoPorId, camposDe, detectarTitulos, emparejar, leerFilas, hojaDe, hojasPaquete } from '@/lib/migracion.js'

// Migracion de un cliente nuevo: se manda el paquete, el cliente lo llena y aqui
// se carga paso por paso. Cada carga es un lote que se puede deshacer. La
// pantalla solo muestra el archivo que se esta subiendo y cifras generales.
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', linea: '#E3E1D8', suave: '#EFEDE6', rojo: '#C41230', rojoF: '#FBE9E9', amarillo: '#F2B21B', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8' }
const TITULO = 'var(--font-titulo), Georgia, serif'
const $ = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
const num = (n) => Number(n || 0).toLocaleString('es-CO')
const hora = (iso) => new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).replace(/\./g, '')
const POR_GRUPO = 20
const MAX_DOC = 3 * 1024 * 1024

const Pastilla = ({ tono, children }) => {
  const t = { verde: [C.verde, C.verdeF], ambar: [C.ambar, C.ambarF], rojo: [C.rojo, C.rojoF], gris: [C.gris, C.suave] }[tono]
  return <span className="text-[12px] font-bold rounded-full px-2.5 py-0.5 whitespace-nowrap" style={{ color: t[0], background: t[1] }}>{children}</span>
}
const boton = 'rounded-xl min-h-[40px] px-3.5 font-bold text-[13.5px] inline-flex items-center justify-center disabled:opacity-50'
const Boton = ({ tono = 'suave', className = '', ...p }) => {
  const t = { suave: { background: C.suave, color: C.tinta }, blanco: { background: '#fff', color: C.tinta }, tinta: { background: C.tinta, color: '#fff' }, rojo: { background: C.rojo, color: '#fff' } }[tono]
  return <button type="button" {...p} className={`${boton} ${className}`} style={t} />
}
const Kpi = ({ rotulo, valor, tono }) => (
  <div className="bg-white rounded-[18px] px-4 py-3.5 min-w-0">
    <span className="text-[13px]" style={{ color: C.gris }}>{rotulo}</span>
    <b className="block text-[26px] leading-tight tabular-nums truncate" style={{ fontFamily: TITULO, color: tono || C.tinta }}>{valor}</b>
  </div>
)
const Etapas = ({ actual }) => (
  <div className="flex flex-wrap gap-1.5 text-[13px] font-bold">
    {['Subir', 'Emparejar', 'Revisar', 'Cargar'].map((e, i) => <span key={e} className="rounded-full px-3 py-1" style={i === actual ? { background: C.tinta, color: '#fff' } : i < actual ? { background: C.suave, color: C.gris } : { background: '#fff', color: C.gris }}>{e}</span>)}
  </div>
)

async function llamar(cuerpo) {
  const { data: { session } } = await supabase.auth.getSession()
  const r = await fetch('/api/plataforma/migracion', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` }, body: JSON.stringify(cuerpo) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(r.status === 413 ? 'El archivo es muy pesado para enviarlo de una vez; divídalo en partes.' : j.error || 'No se pudo completar la operación.')
  return j
}

const base64 = (file) => new Promise((ok, mal) => {
  const r = new FileReader()
  r.onload = () => ok(String(r.result).split(',')[1])
  r.onerror = mal
  r.readAsDataURL(file)
})

async function leerLibro(file) {
  const XLSX = await import('xlsx')
  const libro = XLSX.read(await file.arrayBuffer())
  return Object.fromEntries(libro.SheetNames.map(n => [n, XLSX.utils.sheet_to_json(libro.Sheets[n], { header: 1, defval: '', blankrows: true })]))
}

// Prepara una hoja para un paso: fila de titulos y columnas emparejadas.
function preparar(paso, archivo, hojas, hoja, modelos) {
  const filas = hojas[hoja] || []
  const tituloFila = detectarTitulos(filas, paso)
  const titulos = (filas[tituloFila] || []).map(t => String(t ?? '').trim())
  return { archivo, hojas, hoja, tituloFila, titulos, mapa: emparejar(titulos, paso, modelos) }
}

async function descargarFilas(paso, modelos, filas, nombre) {
  const XLSX = await import('xlsx')
  const campos = camposDe(paso, modelos)
  const datos = [[...campos.map(c => c.titulo), 'Motivo'], ...filas.map(r => [...campos.map(c => r.orig?.[c.id] ?? ''), r.motivo || ''])]
  const libro = XLSX.utils.book_new()
  const hoja = XLSX.utils.aoa_to_sheet(datos)
  hoja['!cols'] = [...campos.map(c => ({ wch: Math.max(c.titulo.length + 2, 16) })), { wch: 44 }]
  XLSX.utils.book_append_sheet(libro, hoja, paso.hoja)
  XLSX.writeFile(libro, nombre)
}

export default function Migracion() {
  const { empresa: empresaId } = useParams()
  const router = useRouter()
  const [listo, setListo] = useState(false)
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [corte, setCorte] = useState(obtenerFechaActual())
  const [archivos, setArchivos] = useState({}) // paso -> archivo preparado
  const [vista, setVista] = useState(null) // { paso, etapa: 'emparejar' | 'revisar' }
  const [revision, setRevision] = useState(null) // { filas, nuevas }
  const [ocupado, setOcupado] = useState('')
  const [aviso, setAviso] = useState(null)
  const paqueteRef = useRef(null)
  const pasoRef = useRef(null)
  const [pasoSubida, setPasoSubida] = useState(null)

  const cargarEstado = useCallback(async () => {
    try {
      const j = await llamar({ accion: 'estado', empresa_id: empresaId })
      setD(j)
      const ultimo = [...j.lotes].reverse().find(l => !l.deshecho_at)
      if (ultimo) setCorte(ultimo.fecha_corte)
    } catch (e) { setError(e.message) }
  }, [empresaId])

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')
    if (!u || u.rol !== 'plataforma') { router.replace('/entrar'); return }
    setListo(true)
    cargarEstado()
  }, [router, cargarEstado])

  const modelos = d?.empresa.modelos || []
  const conFilas = (paso, a) => leerFilas(a.hojas[a.hoja] || [], a.tituloFila, a.mapa).length

  const descargarPaquete = async () => {
    const XLSX = await import('xlsx')
    const { guia, hojas } = hojasPaquete(d.empresa.nombre, modelos)
    const libro = XLSX.utils.book_new()
    const instr = XLSX.utils.aoa_to_sheet(guia)
    instr['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 12 }, { wch: 26 }, { wch: 30 }]
    XLSX.utils.book_append_sheet(libro, instr, 'Instrucciones')
    hojas.forEach(h => {
      const s = XLSX.utils.aoa_to_sheet([h.titulos])
      s['!cols'] = h.titulos.map(t => ({ wch: Math.max(t.length + 3, 16) }))
      XLSX.utils.book_append_sheet(libro, s, h.nombre)
    })
    XLSX.writeFile(libro, `Paquete de migración - ${d.empresa.nombre}.xlsx`.replace(/[\\/?*:]/g, ' '))
  }

  // Un libro con varias hojas: cada una va al paso de su mismo nombre.
  const subirPaquete = async (file) => {
    setError(''); setAviso(null); setOcupado('Leyendo el archivo…')
    try {
      const hojas = await leerLibro(file)
      const nombres = Object.keys(hojas)
      const nuevos = {}
      PASOS.forEach(p => {
        const h = hojaDe(nombres, p)
        if (!h) return
        const a = preparar(p, file.name, hojas, h, modelos)
        if (conFilas(p, a) > 0) nuevos[p.id] = a
      })
      if (!Object.keys(nuevos).length) setError('No se encontraron datos en este archivo. Las hojas deben llamarse como las del paquete; si es otro formato, súbalo en el paso que corresponde.')
      setArchivos(prev => ({ ...prev, ...nuevos }))
    } catch { setError('No se pudo leer este archivo. Debe ser Excel o CSV.') }
    setOcupado('')
  }

  const subirAlPaso = async (pasoId, file) => {
    const paso = pasoPorId(pasoId)
    setError(''); setAviso(null)
    if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
      if (file.size > MAX_DOC) { setError('El documento pesa más de 3 MB; envíelo por partes.'); return }
      setOcupado('Leyendo el documento con el asistente…')
      try {
        const j = await llamar({ accion: 'leer', empresa_id: empresaId, paso: pasoId, archivo: await base64(file), media_type: file.type })
        const hojas = { Lectura: [j.campos.map(c => c.titulo), ...j.filas.map(f => j.campos.map(c => f[c.id] ?? ''))] }
        const a = preparar(paso, file.name, hojas, 'Lectura', modelos)
        setArchivos(prev => ({ ...prev, [pasoId]: { ...a, tituloFila: 0, titulos: j.campos.map(c => c.titulo), mapa: j.campos.map(c => c.id) } }))
        setVista({ paso: pasoId, etapa: 'emparejar' })
      } catch (e) { setError(e.message) }
      setOcupado('')
      return
    }
    setOcupado('Leyendo el archivo…')
    try {
      const hojas = await leerLibro(file)
      const nombres = Object.keys(hojas)
      const conDatos = nombres.find(n => (hojas[n] || []).some(f => f.some(c => c !== '')))
      const hoja = hojaDe(nombres, paso) || conDatos || nombres[0]
      setArchivos(prev => ({ ...prev, [pasoId]: preparar(paso, file.name, hojas, hoja, modelos) }))
      setVista({ paso: pasoId, etapa: 'emparejar' })
    } catch { setError('No se pudo leer este archivo. Debe ser Excel, CSV, PDF o una foto.') }
    setOcupado('')
  }

  const elegirArchivo = (pasoId) => { setPasoSubida(pasoId); pasoRef.current?.click() }

  const irARevisar = async () => {
    const a = archivos[vista.paso]
    const filas = leerFilas(a.hojas[a.hoja], a.tituloFila, a.mapa)
    setError(''); setOcupado('Revisando…')
    try {
      const j = await llamar({ accion: 'revisar', empresa_id: empresaId, paso: vista.paso, filas, corte })
      setRevision({ ...j, filas: j.filas.map(f => ({ ...f, resueltos: [] })) })
      setVista({ ...vista, etapa: 'revisar' })
    } catch (e) { setError(e.message) }
    setOcupado('')
  }

  const cargarLote = async () => {
    const paso = pasoPorId(vista.paso)
    const listas = revision.filas.filter(esLista)
    const dejadas = revision.filas.filter(esFuera)
    setError(''); setOcupado('Cargando…')
    try {
      const j = await llamar({ accion: 'cargar', empresa_id: empresaId, paso: vista.paso, corte, archivo: archivos[vista.paso]?.archivo, fuera: dejadas.length,
        filas: listas.map(r => ({ fila: r.fila, orig: r.orig, banderas: r.banderas, ...r.v })) })
      const rechazadas = revision.filas.filter(r => j.rechazadas.includes(r.fila)).map(r => ({ ...r, motivo: 'No pasó la revisión final' }))
      setAviso({ paso, filas: j.filas, total: j.total, creados: j.creados, fuera: [...dejadas.map(motivoDe), ...rechazadas], archivo: archivos[vista.paso]?.archivo })
      setArchivos(prev => { const n = { ...prev }; delete n[vista.paso]; return n })
      setVista(null); setRevision(null)
      await cargarEstado()
    } catch (e) { setError(e.message) }
    setOcupado('')
  }

  const deshacerLote = async (l) => {
    const paso = pasoPorId(l.paso)
    if (!confirm(`¿Deshacer este lote de ${paso.titulo} (${num(l.filas)} filas)? Se borra lo cargado; lo que el cliente ya haya usado se conserva.`)) return
    setError(''); setAviso(null); setOcupado('Deshaciendo…')
    try {
      const j = await llamar({ accion: 'deshacer', empresa_id: empresaId, lote: l.id })
      await cargarEstado()
      setAviso({ deshecho: true, paso, borrados: j.borrados, conservados: j.conservados })
    } catch (e) { setError(e.message) }
    setOcupado('')
  }

  if (!listo) return null
  const paso = vista ? pasoPorId(vista.paso) : null

  return (
    <div className="min-h-screen" style={{ background: C.fondo, color: C.tinta, fontFamily: 'var(--font-texto), system-ui, sans-serif' }}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 md:px-6 py-3 text-white" style={{ background: '#1A1A1A' }}>
        <span className="bg-white rounded-lg px-2 py-1 inline-flex"><Image src="/maissypos-logo.png" width={70} height={26} alt="MaissyPOS" style={{ height: 24, width: 'auto' }} /></span>
        <span className="text-[12px] font-extrabold tracking-[.1em]" style={{ color: C.amarillo }}>PLATAFORMA</span>
        <span className="flex-1" />
        <Link href="/plataforma" className="text-[13px] font-bold rounded-lg px-3 min-h-[36px] inline-flex items-center" style={{ background: '#262421', color: '#D9D5CC' }}>Volver a la consola</Link>
      </div>
      <div className="max-w-[1040px] mx-auto px-4 md:px-6 py-6 flex flex-col gap-4">
        <input ref={paqueteRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) subirPaquete(f) }} />
        <input ref={pasoRef} type="file" accept=".xlsx,.xls,.csv,.pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f && pasoSubida) subirAlPaso(pasoSubida, f) }} />
        {error && <p className="m-0 rounded-2xl px-4 py-3 text-[14px] font-semibold" style={{ background: C.rojoF, color: C.rojo }} role="alert">{error}</p>}
        {ocupado && <p className="m-0 rounded-2xl px-4 py-3 text-[14px] font-semibold" style={{ background: C.ambarF, color: C.ambar }} role="status">{ocupado}</p>}
        {!d ? !error && <p style={{ color: C.gris }}>Cargando…</p> : !vista ? (
          <Resumen d={d} corte={corte} setCorte={setCorte} archivos={archivos} conFilas={conFilas} aviso={aviso} setAviso={setAviso} modelos={modelos}
            descargarPaquete={descargarPaquete} subirPaquete={() => paqueteRef.current?.click()} elegirArchivo={elegirArchivo}
            abrir={(id) => { setError(''); setAviso(null); setVista({ paso: id, etapa: 'emparejar' }) }} deshacerLote={deshacerLote} ocupado={!!ocupado} />
        ) : vista.etapa === 'emparejar' ? (
          <Emparejar paso={paso} a={archivos[vista.paso]} modelos={modelos} nombre={d.empresa.nombre} volver={() => setVista(null)} ocupado={!!ocupado}
            cambiarHoja={(h) => setArchivos(prev => ({ ...prev, [vista.paso]: preparar(paso, prev[vista.paso].archivo, prev[vista.paso].hojas, h, modelos) }))}
            cambiarMapa={(i, campo) => setArchivos(prev => { const a = prev[vista.paso]; return { ...prev, [vista.paso]: { ...a, mapa: a.mapa.map((m, k) => k === i ? campo : m === campo && campo ? '' : m) } } })}
            cambiarArchivo={() => elegirArchivo(vista.paso)} revisar={irARevisar} />
        ) : (
          <Revisar paso={paso} revision={revision} setRevision={setRevision} modelos={modelos} nombre={d.empresa.nombre} ocupado={!!ocupado}
            volver={() => setVista({ ...vista, etapa: 'emparejar' })} cargar={cargarLote} />
        )}
      </div>
    </div>
  )
}

const esFuera = (r) => r.fuera && r.fuera !== 'sumada'
const pendientes = (r) => r.problemas.filter((_, i) => !r.resueltos.includes(i))
const esLista = (r) => r.estado === 'ok' && !r.fuera && pendientes(r).length === 0
const motivoDe = (r) => ({ ...r, motivo: r.problemas.map(p => `${p.grupo}: ${p.motivo}`).join(' · ') || 'Dejada por fuera' })

function Resumen({ d, corte, setCorte, archivos, conFilas, aviso, setAviso, modelos, descargarPaquete, subirPaquete, elegirArchivo, abrir, deshacerLote, ocupado }) {
  const activos = d.lotes.filter(l => !l.deshecho_at)
  const hechos = PASOS.filter(p => activos.some(l => l.paso === p.id)).length
  const registros = activos.reduce((s, l) => s + l.filas, 0)
  const sigue = PASOS.find(p => !activos.some(l => l.paso === p.id))?.id
  const fijada = activos.length > 0
  return (<>
    <div className="flex flex-wrap justify-between items-end gap-3">
      <div className="min-w-0">
        <span className="text-[12px] font-bold tracking-[.06em]" style={{ color: C.gris }}>MIGRACIÓN{d.cliente && d.cliente !== d.empresa.nombre ? ` · ${d.cliente.toUpperCase()}` : ''}</span>
        <h1 className="m-0 text-[28px] font-extrabold leading-tight" style={{ fontFamily: TITULO }}>{d.empresa.nombre}</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        <Boton tono="blanco" onClick={descargarPaquete}>Descargar paquete</Boton>
        <Boton tono="tinta" onClick={subirPaquete} disabled={ocupado}>Subir paquete lleno</Boton>
      </div>
    </div>

    {aviso && <Aviso aviso={aviso} modelos={modelos} nombre={d.empresa.nombre} cerrar={() => setAviso(null)} />}

    <div className="bg-white rounded-[18px] p-4 flex flex-wrap items-center gap-x-6 gap-y-3">
      <label className="flex flex-col gap-1 text-[13px] font-bold flex-[0_1_230px]" style={{ color: C.gris }}>Fecha de corte
        <CampoFecha value={corte} onChange={e => setCorte(e.target.value)} disabled={fijada} className="min-h-[44px] rounded-xl bg-white px-3 text-[15px] font-medium" style={{ boxShadow: `inset 0 0 0 1.5px ${C.linea}`, color: C.tinta }} />
      </label>
      <div className="flex-[1_1_260px] min-w-0 flex flex-col gap-2">
        <div className="flex justify-between gap-3 text-[14px]"><b>{hechos} de {PASOS.length} listos</b><span className="tabular-nums" style={{ color: C.gris }}>{num(registros)} registros cargados</span></div>
        <div className="h-2 rounded-full" style={{ background: C.suave }}><div className="h-2 rounded-full" style={{ width: `${hechos / PASOS.length * 100}%`, background: C.amarillo }} /></div>
      </div>
    </div>

    <div className="bg-white rounded-[18px] px-4 py-1 flex flex-col">
      {PASOS.map((p, i) => {
        const lotes = activos.filter(l => l.paso === p.id)
        const a = archivos[p.id]
        const hecho = lotes.length > 0
        return (
          <div key={p.id} className="py-3 flex flex-col gap-2" style={i ? { borderTop: `1px solid ${C.linea}` } : undefined}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-7 h-7 rounded-full font-extrabold inline-flex items-center justify-center shrink-0" style={hecho ? { background: C.amarillo } : p.id === sigue ? { background: C.tinta, color: '#fff' } : { background: C.suave, color: C.gris }}>{i + 1}</span>
              <div className="flex-[1_1_240px] min-w-0">
                <b className="block">{p.titulo}</b>
                <span className="text-[13px] break-words" style={{ color: C.gris }}>{a ? `${a.archivo} · ${a.hoja} · ${num(conFilas(p, a))} filas` : p.nota}</span>
              </div>
              {hecho ? <Pastilla tono="verde">Listo</Pastilla> : a ? <Pastilla tono="ambar">Por revisar</Pastilla> : p.id === sigue ? <Pastilla tono="ambar">Sigue</Pastilla> : <Pastilla tono="gris">Pendiente</Pastilla>}
              {a ? <Boton tono="rojo" onClick={() => abrir(p.id)} disabled={ocupado}>Revisar</Boton> : <Boton tono={!hecho && p.id === sigue ? 'rojo' : 'suave'} onClick={() => elegirArchivo(p.id)} disabled={ocupado}>Subir archivo</Boton>}
            </div>
            {lotes.map(l => (
              <div key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2 text-[13.5px] ml-0 md:ml-10" style={{ background: C.fondo }}>
                <span className="flex-[1_1_240px] min-w-0 tabular-nums">{num(l.filas)} cargados{l.fuera ? ` · ${num(l.fuera)} por fuera` : ''}{l.total ? ` · ${$(l.total)}` : ''}{resumenCreados(l.creados)}<span className="block text-[12.5px] break-words" style={{ color: C.gris }}>{[l.archivo, hora(l.created_at)].filter(Boolean).join(' · ')}</span></span>
                <Boton tono="blanco" onClick={() => deshacerLote(l)} disabled={ocupado}>Deshacer lote</Boton>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  </>)
}

function resumenCreados(c) {
  const t = [c?.rutas && `${c.rutas} rutas`, c?.vendedores && `${c.vendedores} vendedores`, c?.categorias && `${c.categorias} categorías`, c?.proveedores && `${c.proveedores} proveedores`].filter(Boolean)
  return t.length ? ` · ${t.join(', ')} nuevos` : ''
}

function Aviso({ aviso, modelos, nombre, cerrar }) {
  if (aviso.deshecho) return (
    <div className="rounded-[18px] px-4 py-3 flex flex-wrap items-center gap-3" style={{ background: C.ambarF, color: C.ambar }}>
      <b className="flex-[1_1_280px] min-w-0">{aviso.paso.titulo}: se deshicieron {num(aviso.borrados)} registros{aviso.conservados ? `; ${num(aviso.conservados)} se conservaron porque ya tienen movimientos` : ''}.</b>
      <Boton tono="blanco" onClick={cerrar}>Cerrar</Boton>
    </div>
  )
  return (
    <div className="rounded-[18px] px-4 py-3 flex flex-wrap items-center gap-3" style={{ background: C.verdeF, color: C.verde }}>
      <div className="flex-[1_1_280px] min-w-0"><b className="block">{aviso.paso.titulo}: {num(aviso.filas)} filas cargadas</b>
        <span className="text-[13.5px]">{[aviso.total ? $(aviso.total) : null, aviso.fuera.length ? `${num(aviso.fuera.length)} por fuera` : null, resumenCreados(aviso.creados).replace(' · ', '') || null].filter(Boolean).join(' · ')}</span></div>
      {aviso.fuera.length > 0 && <Boton tono="blanco" onClick={() => descargarFilas(aviso.paso, modelos, aviso.fuera, `Por corregir - ${aviso.paso.titulo} - ${nombre}.xlsx`.replace(/[\\/?*:]/g, ' '))}>Descargar {num(aviso.fuera.length)} filas para el cliente</Boton>}
      <Boton tono="blanco" onClick={cerrar}>Cerrar</Boton>
    </div>
  )
}

function Encabezado({ paso, nombre, etapa, volver }) {
  return (
    <div className="flex flex-wrap justify-between items-end gap-3">
      <div className="min-w-0"><button type="button" onClick={volver} className="text-[13px] font-bold" style={{ color: C.gris }}>{nombre}</button>
        <h1 className="m-0 text-[28px] font-extrabold leading-tight" style={{ fontFamily: TITULO }}>{paso.titulo}</h1></div>
      <Etapas actual={etapa} />
    </div>
  )
}

function Emparejar({ paso, a, modelos, nombre, volver, cambiarHoja, cambiarMapa, cambiarArchivo, revisar, ocupado }) {
  const campos = camposDe(paso, modelos)
  const filas = a.hojas[a.hoja] || []
  const inicial = useMemo(() => emparejar(a.titulos, paso, modelos), [a.titulos, paso, modelos])
  const ejemplos = (i) => [...new Set(filas.slice(a.tituloFila + 1).map(f => String(f[i] ?? '').trim()).filter(Boolean))].slice(0, 3).join(', ')
  const n = leerFilas(filas, a.tituloFila, a.mapa).length
  const faltan = campos.filter(c => c.requerido && !a.mapa.includes(c.id))
  const sinProducto = paso.id === 'inventario' && !a.mapa.includes('sku') && !a.mapa.includes('nombre')
  const columnas = a.titulos.map((t, i) => ({ t, i })).filter(c => c.t)
  return (<>
    <Encabezado paso={paso} nombre={nombre} etapa={1} volver={volver} />
    <div className="bg-white rounded-[18px] px-4 py-3.5 flex flex-wrap items-center gap-3">
      <div className="flex-[1_1_300px] min-w-0"><b className="block break-words">{a.archivo}</b><span className="text-[13px]" style={{ color: C.gris }}>{num(n)} filas · títulos en la fila {a.tituloFila + 1}</span></div>
      {Object.keys(a.hojas).length > 1 && (
        <label className="inline-flex items-center gap-2 text-[14px]" style={{ color: C.gris }}>Hoja
          <select value={a.hoja} onChange={e => cambiarHoja(e.target.value)} className="min-h-[40px] rounded-xl bg-white px-2 font-bold" style={{ boxShadow: `inset 0 0 0 1.5px ${C.linea}`, color: C.tinta }}>{Object.keys(a.hojas).map(h => <option key={h}>{h}</option>)}</select>
        </label>
      )}
      <Boton onClick={cambiarArchivo}>Cambiar archivo</Boton>
    </div>
    <div className="bg-white rounded-[18px] px-4 py-1 flex flex-col">
      {columnas.length === 0 && <p className="m-0 py-3 text-[14px]" style={{ color: C.gris }}>Esta hoja no tiene títulos.</p>}
      {columnas.map(({ t, i }, k) => {
        const campo = a.mapa[i]
        const auto = campo && campo === inicial[i]
        return (
          <div key={i} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3" style={k ? { borderTop: `1px solid ${C.linea}` } : undefined}>
            <div className="flex-[1_1_240px] min-w-0"><b className="block break-words">{t}</b><span className="text-[13px] break-words" style={{ color: C.gris }}>{ejemplos(i)}</span></div>
            <select aria-label={`Columna ${t}`} value={campo} onChange={e => cambiarMapa(i, e.target.value)} className="min-h-[40px] rounded-xl px-2 text-[14px] font-semibold flex-[0_1_240px] min-w-0"
              style={campo ? { background: '#fff', boxShadow: `inset 0 0 0 ${auto ? '1.5px' : '2px'} ${auto ? C.linea : C.amarillo}`, color: C.tinta } : { background: C.suave, color: C.gris }}>
              <option value="">No cargar</option>
              {campos.map(c => <option key={c.id} value={c.id}>{c.titulo}{c.requerido ? ' *' : ''}</option>)}
            </select>
            <span className="w-[92px] text-[12px] font-bold" style={{ color: auto ? C.verde : C.ambar }}>{campo ? (auto ? 'Automático' : 'Elegido') : ''}</span>
          </div>
        )
      })}
    </div>
    <div className="flex flex-wrap justify-between items-center gap-3">
      <span className="text-[13.5px] font-semibold" style={{ color: faltan.length || sinProducto ? C.rojo : C.gris }}>{faltan.length ? `Falta escoger: ${faltan.map(c => c.titulo).join(', ')}` : sinProducto ? 'Falta escoger: Código o Producto' : ''}</span>
      <div className="flex flex-wrap gap-2">
        <Boton tono="blanco" onClick={volver}>Volver</Boton>
        <Boton tono="rojo" onClick={revisar} disabled={ocupado || !n || faltan.length > 0 || sinProducto}>Revisar {num(n)} filas</Boton>
      </div>
    </div>
  </>)
}

function Revisar({ paso, revision, setRevision, modelos, nombre, volver, cargar, ocupado }) {
  const [abiertos, setAbiertos] = useState({})
  const filas = revision.filas
  const listas = filas.filter(esLista)
  const existen = filas.filter(r => r.estado === 'existe').length
  const dejadas = filas.filter(esFuera)
  const conProblema = filas.filter(r => r.estado === 'ok' && !r.fuera && pendientes(r).length > 0)
  const monto = paso.monto ? listas.reduce((s, r) => s + (Number(r.v[paso.monto]) || 0) * r.unitario, 0) : 0

  const grupos = useMemo(() => {
    const m = new Map()
    conProblema.forEach(r => r.problemas.forEach((p, i) => {
      if (r.resueltos.includes(i)) return
      if (!m.has(p.grupo)) m.set(p.grupo, [])
      m.get(p.grupo).push({ r, p, i })
    }))
    return [...m.entries()]
  }, [conProblema])

  // Aplica una solucion a un problema de una fila; varias a la vez en lo masivo.
  const aplicar = (items) => setRevision(prev => {
    const porFila = new Map(prev.filas.map(r => [r.fila, r]))
    items.forEach(({ fila, i, arreglo, valor, campo }) => {
      const r = porFila.get(fila)
      if (!r) return
      const cambios = arreglo?.cambios || (campo ? { [campo]: valor } : {})
      const nuevo = { ...r, v: { ...r.v, ...cambios }, banderas: { ...r.banderas, ...arreglo?.banderas }, resueltos: [...r.resueltos, i] }
      if (arreglo?.sumar) {
        const destino = porFila.get(arreglo.sumar.fila)
        if (destino) porFila.set(destino.fila, { ...destino, v: { ...destino.v, [arreglo.sumar.campo]: (Number(destino.v[arreglo.sumar.campo]) || 0) + (Number(r.v[arreglo.sumar.campo]) || 0) } })
        nuevo.fuera = 'sumada'
      }
      porFila.set(fila, nuevo)
    })
    return { ...prev, filas: prev.filas.map(r => porFila.get(r.fila)) }
  })
  const dejarFuera = (lista) => setRevision(prev => {
    const ids = new Set(lista)
    return { ...prev, filas: prev.filas.map(r => ids.has(r.fila) ? { ...r, fuera: true } : r) }
  })

  const creados = [revision.nuevas.rutas.length && `${revision.nuevas.rutas.length} rutas`, revision.nuevas.vendedores.length && `${revision.nuevas.vendedores.length} vendedores`, revision.nuevas.categorias.length && `${revision.nuevas.categorias.length} categorías`].filter(Boolean)
  const paraCliente = [...conProblema, ...dejadas].map(motivoDe)

  return (<>
    <Encabezado paso={paso} nombre={nombre} etapa={2} volver={volver} />
    <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
      <Kpi rotulo="Listas" valor={num(listas.length)} />
      <Kpi rotulo="Con problemas" valor={num(conProblema.length)} tono={conProblema.length ? C.rojo : undefined} />
      {existen > 0 && <Kpi rotulo="Ya existen" valor={num(existen)} />}
      {dejadas.length > 0 && <Kpi rotulo="Por fuera" valor={num(dejadas.length)} tono={C.ambar} />}
      {paso.monto && <Kpi rotulo={paso.rotuloMonto} valor={$(monto)} />}
    </div>
    {(creados.length > 0 || revision.nuevas.codigos > 0) && <p className="m-0 rounded-2xl px-4 py-2.5 text-[14px]" style={{ background: '#fff', color: C.gris }}>{[creados.length ? `Se crean ${creados.join(', ')}` : null, revision.nuevas.codigos ? `${num(revision.nuevas.codigos)} productos sin código reciben uno` : null].filter(Boolean).join(' · ')}</p>}

    {grupos.map(([grupo, items]) => {
      const masivos = [...new Map(items.flatMap(({ p }) => (p.arreglos || []).filter(a => a.masivo).map(a => [a.clave, a]))).values()]
      const ver = abiertos[grupo] ? items : items.slice(0, POR_GRUPO)
      return (
        <section key={grupo} className="bg-white rounded-[18px] px-4 py-1 flex flex-col">
          <div className="flex flex-wrap items-center gap-2 py-3">
            <h2 className="m-0 flex-[1_1_220px] min-w-0 text-[18px] font-extrabold" style={{ fontFamily: TITULO }}>{grupo} · {num(items.length)}</h2>
            {items.length > 1 && masivos.map(a => <Boton key={a.clave} tono="tinta" onClick={() => aplicar(items.filter(({ p }) => p.arreglos?.some(x => x.clave === a.clave)).map(({ r, p, i }) => ({ fila: r.fila, i, arreglo: p.arreglos.find(x => x.clave === a.clave) })))}>{a.clave === 'sumar' ? 'Sumar todas' : `${a.texto} en todas`}</Boton>)}
            {items.length > 1 && <Boton onClick={() => dejarFuera(items.map(({ r }) => r.fila))}>Dejar todas por fuera</Boton>}
          </div>
          {ver.map(({ r, p, i }) => <FilaProblema key={`${r.fila}-${i}`} r={r} p={p} i={i} aplicar={aplicar} dejarFuera={dejarFuera} />)}
          {items.length > ver.length && <button type="button" onClick={() => setAbiertos({ ...abiertos, [grupo]: true })} className="py-3 text-left text-[14px] font-bold" style={{ color: C.gris, borderTop: `1px solid ${C.linea}` }}>Ver las otras {num(items.length - ver.length)}</button>}
        </section>
      )
    })}

    <div className="flex flex-wrap justify-between items-center gap-3">
      <div className="flex flex-wrap gap-2">
        <Boton tono="blanco" onClick={volver}>Volver</Boton>
        {paraCliente.length > 0 && <Boton tono="blanco" onClick={() => descargarFilas(paso, modelos, paraCliente, `Por corregir - ${paso.titulo} - ${nombre}.xlsx`.replace(/[\\/?*:]/g, ' '))}>Descargar {num(paraCliente.length)} filas para el cliente</Boton>}
      </div>
      <Boton tono="rojo" onClick={cargar} disabled={ocupado || !listas.length}>Cargar {num(listas.length)} filas</Boton>
    </div>
  </>)
}

function FilaProblema({ r, p, i, aplicar, dejarFuera }) {
  const [valor, setValor] = useState('')
  const nombre = r.v.nombre || r.v.cliente || r.v.proveedor || ''
  const guardar = () => { if (String(valor).trim()) aplicar([{ fila: r.fila, i, campo: p.campo, valor }]) }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3" style={{ borderTop: `1px solid ${C.linea}` }}>
      <div className="flex-[1_1_280px] min-w-0"><b className="block break-words">Fila {r.fila}{nombre ? ` · ${nombre}` : ''}</b><span className="text-[13.5px] break-words" style={{ color: C.gris }}>{p.motivo}</span></div>
      {(p.arreglos || []).map(a => <Boton key={a.clave} tono="tinta" onClick={() => aplicar([{ fila: r.fila, i, arreglo: a }])}>{a.texto}</Boton>)}
      {p.campo && (
        <span className="inline-flex gap-1.5">
          <input aria-label={`Corregir fila ${r.fila}`} type={p.tipoCampo === 'fecha' ? 'date' : 'text'} inputMode={p.tipoCampo === 'numero' ? 'decimal' : undefined} value={valor} onChange={e => setValor(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') guardar() }}
            className="w-[140px] min-h-[40px] rounded-xl bg-white px-3 text-[14px] outline-none" style={{ boxShadow: `inset 0 0 0 1.5px ${C.linea}`, color: C.tinta }} placeholder="Corregir" />
          <Boton onClick={guardar} disabled={!String(valor).trim()}>Usar</Boton>
        </span>
      )}
      <Boton onClick={() => dejarFuera([r.fila])}>Dejar por fuera</Boton>
    </div>
  )
}
