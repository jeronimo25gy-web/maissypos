'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { cerrarSesionUsuario, sesionVigente } from '@/lib/sesion'
import { puedeVerModulo } from '@/lib/permisos'
import {
  cargarPlanta, leerCache, subirCola, registrar as registrarOps, cola, errores, limpiarErrores,
  lotesAbiertos, pasoActual, NOMBRE_PASO, referencias, fmtHora, duracion, fmtNum,
} from '@/lib/planta'
import { C, titulo, Boton, Pill, Tarjeta } from './ui'
import Montar from './Montar'
import Lote from './Lote'
import Monitor from './Monitor'

// Control de producción: la pantalla de la planta. Cada equipo se marca con
// su puesto: Arriba (tanques, molino, troqueladora, horno), Abajo (empaque),
// Monitor (televisor de empaque) o Completo (quien mide en las 2 semanas).
const PUESTOS = [
  { id: 'arriba', nombre: 'Arriba', detalle: 'Tanques, molino, troqueladora y horno' },
  { id: 'abajo', nombre: 'Abajo', detalle: 'Empaque: paquetes, reproceso y cerrar lote' },
  { id: 'monitor', nombre: 'Monitor de empaque', detalle: 'Televisor: qué baja y qué sigue' },
  { id: 'completo', nombre: 'Completo', detalle: 'Todos los pasos, para quien mide' },
]
const CLAVE_PUESTO = 'maissy_puesto'

export default function Planta() {
  const router = useRouter()
  const [usuario, setUsuario] = useState(null)
  const [puesto, setPuesto] = useState(null)
  const [estado, setEstado] = useState(null)
  const [abierto, setAbierto] = useState(null) // id del lote que se está viendo
  const [montando, setMontando] = useState(false)
  const [pendientes, setPendientes] = useState(0)
  const [fallas, setFallas] = useState([])
  const [sinSenal, setSinSenal] = useState(false)
  const [errorCarga, setErrorCarga] = useState('')

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')
    if (!u) { router.replace('/'); return }
    if (u.rol !== 'planta' && !puedeVerModulo(u, 'produccion', ['admin', 'auxiliar'])) { router.replace('/despacho'); return }
    setUsuario(u)
    try { setPuesto(localStorage.getItem(CLAVE_PUESTO)) } catch {}
    const cache = leerCache()
    if (cache) setEstado(cache)
    setPendientes(cola().length)
    setFallas(errores())
    // Sin señal no se saca a nadie: la planta sigue con lo que tiene en el equipo.
    if (navigator.onLine) sesionVigente().then(ok => { if (!ok) router.replace('/') })
  }, [router])

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
    const t = setInterval(sincronizar, puesto === 'monitor' ? 10000 : 15000)
    const enLinea = () => sincronizar()
    window.addEventListener('online', enLinea)
    return () => { clearInterval(t); window.removeEventListener('online', enLinea) }
  }, [usuario, puesto, sincronizar])

  const registrar = (ops) => {
    const e = registrarOps(ops, estado)
    if (e) setEstado(e)
    setPendientes(cola().length)
    subirCola().then(r => { setPendientes(r.pendientes); setFallas(errores()) }).catch(() => {})
  }

  const escogerPuesto = (p) => { try { p ? localStorage.setItem(CLAVE_PUESTO, p) : localStorage.removeItem(CLAVE_PUESTO) } catch {}; setPuesto(p); setAbierto(null) }
  const salir = async () => { await cerrarSesionUsuario(usuario?.id); localStorage.removeItem('maissy_usuario'); router.replace('/') }

  if (!usuario) return null

  if (!puesto) {
    return (
      <div className="min-h-screen p-4 md:p-8 flex flex-col items-center justify-center gap-5" style={{ background: C.fondo, color: C.tinta }}>
        <h1 className="text-3xl font-extrabold text-center" style={titulo}>¿Dónde está este equipo?</h1>
        <p className="text-center" style={{ color: C.gris }}>Se escoge una vez. Se puede cambiar después desde arriba.</p>
        <div className="grid gap-3 w-full max-w-3xl" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {PUESTOS.map(p => (
            <button key={p.id} type="button" onClick={() => escogerPuesto(p.id)} className="bg-white rounded-[20px] p-5 text-left flex flex-col gap-1 min-h-[110px]">
              <b className="text-2xl" style={titulo}>{p.nombre}</b><span style={{ color: C.gris }}>{p.detalle}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (puesto === 'monitor') {
    return (
      <div onDoubleClick={() => escogerPuesto(null)}>
        {estado ? <Monitor estado={estado} sinSenal={sinSenal} /> : <div className="min-h-screen flex items-center justify-center" style={{ background: '#141414', color: '#A9A59B' }}>Cargando…</div>}
      </div>
    )
  }

  const lotes = estado ? lotesAbiertos(estado) : []
  const lote = abierto && estado?.cochadas?.[abierto]
  const nombrePuesto = PUESTOS.find(p => p.id === puesto)?.nombre

  return (
    <div className="min-h-screen pb-10" style={{ background: C.fondo, color: C.tinta }}>
      <header className="bg-white border-b sticky top-0 z-10" style={{ borderColor: C.linea }}>
        <div className="max-w-6xl mx-auto px-4 min-h-[60px] flex items-center gap-3 flex-wrap py-2">
          <Image src="/maissypos-logo.png" width={110} height={41} alt="MaissyPOS" priority style={{ width: '110px', height: 'auto' }} />
          <span className="font-extrabold text-lg flex-1 min-w-[160px]" style={titulo}>Control de producción</span>
          <span className="inline-flex items-center gap-2 text-sm font-bold">
            <i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: pendientes || sinSenal ? C.amarillo : C.verde }} />
            {pendientes ? `${pendientes} sin subir${sinSenal ? ' · sin señal' : ''}` : sinSenal ? 'Sin señal' : 'Todo guardado'}
          </span>
          <button type="button" onClick={() => escogerPuesto(null)} className="text-sm font-bold rounded-xl px-3 min-h-[40px]" style={{ background: C.suave }}>{nombrePuesto}</button>
          {usuario.rol === 'planta'
            ? <button type="button" onClick={salir} className="text-sm font-bold rounded-xl px-3 min-h-[40px]" style={{ background: C.suave }}>Salir</button>
            : <button type="button" onClick={() => router.push('/produccion')} className="text-sm font-bold rounded-xl px-3 min-h-[40px]" style={{ background: C.suave }}>Volver</button>}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pt-4 flex flex-col gap-4">
        {fallas.length > 0 && (
          <div className="rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap" style={{ background: C.rojoF, color: C.rojo }}>
            <span className="flex-1 min-w-[220px] text-sm font-bold">{fallas.length} {fallas.length === 1 ? 'registro no se pudo guardar' : 'registros no se pudieron guardar'}: {fallas[fallas.length - 1].error}</span>
            <Boton onClick={() => { limpiarErrores(); setFallas([]) }}>Entendido</Boton>
          </div>
        )}
        {errorCarga && !estado && <Tarjeta><b>No se pudo cargar la planta.</b><span style={{ color: C.gris }}>{errorCarga}</span><Boton onClick={sincronizar}>Reintentar</Boton></Tarjeta>}
        {!estado && !errorCarga && <p className="text-center py-16" style={{ color: C.gris }}>Cargando…</p>}

        {estado && montando && (
          <Montar estado={estado} usuario={usuario} onCancelar={() => setMontando(false)}
            onRegistrar={(ops, id) => { registrar(ops); setMontando(false); setAbierto(id) }} />
        )}

        {estado && !montando && lote && (
          <Lote key={lote.id} estado={estado} c={lote} usuario={usuario} puesto={puesto} registrar={registrar} onVolver={() => setAbierto(null)} />
        )}

        {estado && !montando && !lote && (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h1 className="text-[26px] font-extrabold" style={titulo}>Lotes de cocción abiertos</h1>
              {puesto !== 'abajo' && <Boton tipo="rojo" grande onClick={() => setMontando(true)}>Montar lote de cocción</Boton>}
            </div>
            {lotes.length === 0 && (
              <Tarjeta><b className="text-lg">No hay lotes abiertos.</b>
                <span style={{ color: C.gris }}>{puesto === 'abajo' ? 'Cuando arriba monte un tanque, aparece aquí.' : 'Cuando montes un tanque, toca “Montar lote de cocción”.'}</span></Tarjeta>
            )}
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))' }}>
              {lotes.map(c => {
                const t = estado.tanques.find(x => x.id === c.tanque_id)
                const paso = pasoActual(estado, c)
                const { arriba, sigue } = referencias(estado, c)
                const ref = (id) => (estado.referencias.find(p => p.id === id)?.nombre || '').replace(/^Arepa (de Maíz )?/i, '')
                return (
                  <button key={c.id} type="button" onClick={() => setAbierto(c.id)} className="bg-white rounded-[20px] p-4 text-left flex flex-col gap-2">
                    <span className="flex items-center justify-between gap-2 w-full">
                      <b className="text-xl" style={titulo}>{t?.nombre || 'Lote'}</b>
                      <Pill tono={paso === 'reposo' || paso === 'coccion' ? 'gris' : 'ambar'}>{NOMBRE_PASO[paso]}</Pill>
                    </span>
                    <span className="text-sm" style={{ color: C.gris }}>{fmtNum(c.cantidad, Number(c.cantidad) % 1 ? 1 : 0)} bultos · montado {new Date(c.hora_montada).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', timeZone: 'America/Bogota' })} {fmtHora(c.hora_montada)}</span>
                    <span className="text-sm">
                      {paso === 'coccion' && <>Lleva <b>{duracion(c.hora_montada)}</b> cocinando</>}
                      {paso === 'reposo' && <>Reposando desde las <b>{fmtHora(c.hora_apagado)}</b></>}
                      {paso === 'masa' && <>Sacado a las <b>{fmtHora(c.hora_sacada)}</b></>}
                      {(paso === 'troqueladora' || paso === 'empaque') && arriba && <>Troquelando <b>{ref(arriba.producto_id)}</b>{sigue ? ` · baja en ${sigue.faltan} min` : ''}</>}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
