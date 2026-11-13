'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { cerrarSesionUsuario, sesionVigente } from '@/lib/sesion'
import { puedeVerModulo } from '@/lib/permisos'
import {
  cargarPlanta, leerCache, subirCola, registrar as registrarOps, cola, errores, limpiarErrores,
  estadoDePractica, registrarPractica, nuevoId,
} from '@/lib/planta'
import { P, fuenteTitulo, BotonP, PUNTERO, Tecla } from './ui'
import Arriba from './Arriba'
import Abajo from './Abajo'

// Control de producción: la pantalla de la planta. Cada equipo se marca con su
// puesto. Las tablets tienen una sola pantalla cada una, sin entrar ni salir de
// menús: arriba los tanques y el molde, abajo el empaque. Todo lo que se toca
// se puede deshacer unos segundos, en vez de preguntar "¿está seguro?".
const PUESTOS = [
  { id: 'arriba', nombre: 'Pantalla de arriba', detalle: 'Monitor con mouse: gramaje, molde y tanques' },
  { id: 'abajo', nombre: 'Pantalla de abajo', detalle: 'Monitor con teclado y mouse: empaque, reproceso y desecho' },
  { id: 'completo', nombre: 'Completo', detalle: 'Arriba y abajo en un solo equipo' },
  { id: 'practica', nombre: 'Práctica', detalle: 'Para enseñar. No guarda nada' },
]
const NOMBRE_VISTA = { arriba: 'Arriba', abajo: 'Abajo' }
const PUESTOS_PRACTICA = [['arriba', 'Pantalla de arriba'], ['abajo', 'Pantalla de abajo']]
const CLAVE_PUESTO = 'maissy_puesto'
const SEGUNDOS_DESHACER = 12

export default function Planta() {
  const router = useRouter()
  const [usuario, setUsuario] = useState(null)
  const [puesto, setPuesto] = useState(null)
  const [vista, setVista] = useState('arriba') // en el puesto Completo
  const [estado, setEstado] = useState(null)
  const [pendientes, setPendientes] = useState(0)
  const [fallas, setFallas] = useState([])
  const [sinSenal, setSinSenal] = useState(false)
  const [errorCarga, setErrorCarga] = useState('')
  const [practica, setPractica] = useState(null) // estado en memoria mientras se enseña
  const [aviso, setAviso] = useState(null) // { id, texto, deshacer }
  const [hora, setHora] = useState('')
  const [, tic] = useState(0)
  const temporizador = useRef(null)

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')
    if (!u) { router.replace('/entrar'); return }
    if (u.rol !== 'planta' && !puedeVerModulo(u, 'produccion', ['admin', 'auxiliar'])) { router.replace('/despacho'); return }
    setUsuario(u)
    try { setPuesto(localStorage.getItem(CLAVE_PUESTO)) } catch {}
    const cache = leerCache()
    if (cache) setEstado(cache)
    setPendientes(cola().length)
    setFallas(errores())
    // Sin señal no se saca a nadie: la planta sigue con lo que tiene en el equipo.
    if (navigator.onLine) sesionVigente().then(ok => { if (!ok) router.replace('/entrar') })
  }, [router])

  // Reloj de la barra y de los tanques: se mueve cada 20 segundos.
  useEffect(() => {
    const f = () => { setHora(new Date().toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' })); tic(x => x + 1) }
    f(); const t = setInterval(f, 20000); return () => clearInterval(t)
  }, [])

  const sincronizar = useCallback(async () => {
    try {
      const r = await subirCola()
      setPendientes(r.pendientes)
      setFallas(errores())
      const e = await cargarPlanta()
      setEstado(e)
      setSinSenal(false)
      setErrorCarga('')
    } catch (err) {
      setSinSenal(true)
      setPendientes(cola().length)
      if (!leerCache()) setErrorCarga(err.message || 'No se pudo cargar')
    }
  }, [])

  useEffect(() => {
    if (!usuario) return
    sincronizar()
    const t = setInterval(sincronizar, 10000)
    const enLinea = () => sincronizar()
    window.addEventListener('online', enLinea)
    return () => { clearInterval(t); window.removeEventListener('online', enLinea) }
  }, [usuario, puesto, sincronizar])

  const registrar = (ops) => {
    if (practica) { setPractica(x => registrarPractica(x, ops)); return }
    const e = registrarOps(ops, estado)
    if (e) setEstado(e)
    setPendientes(cola().length)
    subirCola().then(r => { setPendientes(r.pendientes); setFallas(errores()) }).catch(() => {})
  }

  // Cada toque queda registrado de una vez y se muestra abajo con Deshacer.
  const accion = (ops, { texto, deshacer } = {}) => {
    registrar(ops)
    clearTimeout(temporizador.current)
    setAviso({ id: nuevoId(), texto, deshacer })
    temporizador.current = setTimeout(() => setAviso(null), SEGUNDOS_DESHACER * 1000)
  }
  const deshacer = () => {
    if (!aviso?.deshacer) return
    registrar(aviso.deshacer)
    clearTimeout(temporizador.current)
    setAviso({ id: nuevoId(), texto: `Se deshizo: ${aviso.texto}` })
    temporizador.current = setTimeout(() => setAviso(null), 4000)
  }

  // Ctrl+Z deshace lo último, igual que el botón.
  useEffect(() => {
    const f = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); deshacer() } }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  })

  const escogerPuesto = (p) => { try { p ? localStorage.setItem(CLAVE_PUESTO, p) : localStorage.removeItem(CLAVE_PUESTO) } catch {}; setPuesto(p) }
  const entrarPractica = () => { setPractica(estadoDePractica(estado)); setPuesto('arriba') }
  const reiniciarPractica = () => setPractica(estadoDePractica(estado))
  const terminarPractica = () => { setPractica(null); try { setPuesto(localStorage.getItem(CLAVE_PUESTO)) } catch { setPuesto(null) } }
  const salir = async () => { await cerrarSesionUsuario(usuario?.id); localStorage.removeItem('maissy_usuario'); router.replace('/entrar') }

  if (!usuario) return null

  if (!puesto) {
    return (
      <div className="min-h-screen px-4 py-8 md:p-10 flex flex-col items-center justify-center gap-6" style={{ background: P.fondo, color: P.texto }}>
        <h1 className="m-0 text-[40px] font-extrabold text-center" style={{ fontFamily: fuenteTitulo }}>¿Dónde está este equipo?</h1>
        <div className="grid gap-3 w-full max-w-3xl grid-cols-1 sm:grid-cols-2">
          {PUESTOS.map(p => (
            <button key={p.id} type="button" disabled={p.id === 'practica' && !estado} onClick={() => p.id === 'practica' ? entrarPractica() : escogerPuesto(p.id)}
              className="rounded-[22px] p-6 text-left flex flex-col gap-1 min-h-[124px] disabled:opacity-40 active:scale-[.98] transition-transform"
              style={p.id === 'practica' ? { background: 'transparent', boxShadow: `inset 0 0 0 3px ${P.amarillo}` } : { background: P.panel }}>
              <b className="text-[28px] leading-tight" style={{ fontFamily: fuenteTitulo, color: p.id === 'practica' ? P.amarillo : P.texto }}>{p.nombre}</b>
              <span className="text-[18px] font-bold" style={{ color: P.gris }}>{p.detalle}</span>
            </button>
          ))}
        </div>
        {usuario.rol === 'planta'
          ? <BotonP alto={64} onClick={salir}>Salir</BotonP>
          : <BotonP alto={64} onClick={() => router.push('/produccion')}>Volver a MaissyPOS</BotonP>}
      </div>
    )
  }

  const datos = practica || estado
  // Modo de la planta: Completo mide todo; Simple solo los pasos. El puesto
  // Completo y los lotes de Maíz nuevo siempre miden.
  const medir = puesto === 'completo' || !datos?.plantaSimple
  const barraPractica = practica && <BarraPractica puesto={puesto} onPuesto={setPuesto} onReiniciar={reiniciarPractica} onTerminar={terminarPractica} />

  // Puestos viejos (tablets y monitores separados) quedan como su pantalla.
  const pantalla = puesto === 'completo' ? vista : /abajo|^monitor$/.test(puesto) ? 'abajo' : 'arriba'
  const senal = practica ? null : pendientes || sinSenal
    ? { color: P.amarillo, texto: pendientes ? `${pendientes} sin subir${sinSenal ? ' · sin señal' : ''}` : 'Sin señal' }
    : { color: P.verde, texto: 'Guardado' }

  return (
    <div className="min-h-screen" style={{ background: P.fondo, color: P.texto, cursor: PUNTERO }}>
      {barraPractica}
      <header className="sticky top-0 z-20" style={{ background: P.fondo, borderBottom: `2px solid ${P.linea}`, top: practica ? 64 : 0 }}>
        <div className="max-w-[1840px] mx-auto px-4 min-h-[72px] flex items-center gap-4 flex-wrap py-2">
          <b className="text-[34px] leading-none" style={{ fontFamily: fuenteTitulo }}>{NOMBRE_VISTA[pantalla]}</b>
          {puesto === 'completo' && (
            <div className="flex gap-1.5 p-1.5 rounded-[18px]" style={{ background: P.panel }} role="tablist" aria-label="Pantalla">
              {['arriba', 'abajo'].map(v => <button key={v} type="button" role="tab" aria-selected={vista === v} onClick={() => setVista(v)} className="rounded-[14px] min-h-[52px] px-6 text-[19px] font-extrabold"
                style={vista === v ? { background: P.texto, color: P.fondo } : { color: P.gris }}>{NOMBRE_VISTA[v]}</button>)}
            </div>
          )}
          <span className="flex-1" />
          {senal && <span className="inline-flex items-center gap-2.5 text-[19px] font-extrabold" style={{ color: senal.color }}>
            <i className="inline-block w-4 h-4 rounded-full" style={{ background: senal.color }} />{senal.texto}
          </span>}
          <b className="text-[30px] tabular-nums" style={{ fontFamily: fuenteTitulo }}>{hora}</b>
          {!practica && <BotonP alto={56} className="text-[18px]" onClick={() => escogerPuesto(null)}>Equipo</BotonP>}
        </div>
      </header>

      <main className="max-w-[1840px] mx-auto px-4 py-4 flex flex-col gap-4">
        {fallas.length > 0 && (
          <div className="rounded-[20px] px-5 py-4 flex items-center gap-4 flex-wrap" style={{ background: P.panel, boxShadow: `inset 0 0 0 3px ${P.rojoTxt}` }}>
            <span className="flex-1 min-w-[240px] text-[19px] font-bold"><b style={{ color: P.rojoTxt }}>{fallas.length} {fallas.length === 1 ? 'registro no se guardó' : 'registros no se guardaron'}.</b> Avise al administrador. {fallas[fallas.length - 1].error}</span>
            <BotonP alto={64} onClick={() => { limpiarErrores(); setFallas([]) }}>Entendido</BotonP>
          </div>
        )}
        {errorCarga && !datos && (
          <div className="rounded-[20px] p-6 flex flex-col gap-3 items-start" style={{ background: P.panel }}>
            <b className="text-[26px]">No se pudo cargar la planta</b><span className="text-[18px]" style={{ color: P.gris }}>{errorCarga}</span>
            <BotonP onClick={sincronizar}>Reintentar</BotonP>
          </div>
        )}
        {!datos && !errorCarga && <p className="text-center py-20 text-[24px]" style={{ color: P.gris }}>Cargando…</p>}

        {datos && pantalla === 'arriba' && <Arriba estado={datos} usuario={usuario} puesto={puesto} accion={accion} medir={medir} />}
        {datos && pantalla === 'abajo' && <Abajo key={practica ? 'p' : 'r'} estado={datos} usuario={usuario} puesto={puesto} accion={accion} medir={medir} teclado />}
      </main>

      {aviso && (
        <div key={aviso.id} className={`fixed z-50 rounded-[20px] pl-6 pr-2 py-2 flex items-center gap-3 ${pantalla === 'abajo' ? 'left-4 w-[min(560px,calc(100%-32px))]' : 'left-1/2 -translate-x-1/2 w-[min(640px,calc(100%-32px))]'}`}
          style={{ bottom: pantalla === 'abajo' ? 'calc(10px + env(safe-area-inset-bottom, 0px))' : 20, background: P.texto, color: P.fondo, boxShadow: '0 12px 40px rgba(0,0,0,.5)' }} role="status">
          <b className="flex-1 min-w-0 text-[21px] leading-tight py-3">{aviso.texto}</b>
          {aviso.deshacer && <BotonP alto={64} className="text-[20px]" style={{ background: P.fondo, color: P.texto }} onClick={deshacer}>Deshacer{pantalla === 'abajo' && <Tecla>Ctrl Z</Tecla>}</BotonP>}
        </div>
      )}
    </div>
  )
}

// Práctica: se cambia de puesto desde el mismo equipo y se ve qué aparece en cada uno.
function BarraPractica({ puesto, onPuesto, onReiniciar, onTerminar }) {
  return (
    <div className="sticky top-0 z-30 px-4 min-h-[64px] py-2 flex items-center gap-2 flex-wrap" style={{ background: P.amarillo, color: P.fondo }} role="region" aria-label="Práctica">
      <b className="text-[20px] mr-2" style={{ fontFamily: fuenteTitulo }}>Práctica · no se guarda nada</b>
      <div className="flex gap-1.5 flex-wrap flex-1" role="group" aria-label="Puesto">
        {PUESTOS_PRACTICA.map(([id, n]) => <button key={id} type="button" aria-pressed={puesto === id} onClick={() => onPuesto(id)} className="rounded-[14px] min-h-[48px] px-4 text-[16px] font-extrabold"
          style={puesto === id ? { background: P.fondo, color: P.texto } : { background: 'rgba(255,255,255,.55)', color: P.fondo }}>{n}</button>)}
      </div>
      <button type="button" onClick={onReiniciar} className="rounded-[14px] min-h-[48px] px-4 text-[16px] font-extrabold" style={{ background: 'rgba(255,255,255,.55)' }}>Reiniciar</button>
      <button type="button" onClick={onTerminar} className="rounded-[14px] min-h-[48px] px-4 text-[16px] font-extrabold text-white" style={{ background: P.rojo }}>Terminar</button>
    </div>
  )
}

