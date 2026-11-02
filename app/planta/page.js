'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { cerrarSesionUsuario, sesionVigente } from '@/lib/sesion'
import { puedeVerModulo } from '@/lib/permisos'
import {
  cargarPlanta, leerCache, subirCola, registrar as registrarOps, cola, errores, limpiarErrores,
  lotesAbiertos, pasoActual, NOMBRE_PASO, referencias, fmtHora, duracion, fmtNum, loteEnLinea, nuevoId, ahora,
  estadoDePractica, registrarPractica, telasPorBulto, empacado,
} from '@/lib/planta'
import { getEmpresaId } from '@/lib/empresa'
import { C, titulo, Boton, Pill, Tarjeta } from './ui'
import Montar, { TanquesVista } from './Montar'
import Lote, { Molde } from './Lote'
import Monitor from './Monitor'
import MonitorArriba from './MonitorArriba'

// Control de producción: la pantalla de la planta. Cada equipo se marca con
// su puesto: Arriba (tanques, molino, troqueladora, horno), Abajo (empaque),
// Monitor (televisor de empaque) o Completo (quien mide en las 2 semanas).
const PUESTOS = [
  { id: 'arriba', nombre: 'Tablet de arriba', detalle: 'Tanques y cambio de molde. Solo toques' },
  { id: 'monitor_arriba', nombre: 'Monitor de arriba', detalle: 'Referencia en curso, gramaje y siguiente en el plan' },
  { id: 'abajo', nombre: 'Tablet de abajo', detalle: 'Empaque: paquetes, pesar cajas y cerrar lote' },
  { id: 'monitor', nombre: 'Monitor de abajo', detalle: 'Referencia en empaque y siguiente en el plan' },
  { id: 'completo', nombre: 'Completo', detalle: 'Todos los pasos, para quien mide' },
  { id: 'practica', nombre: 'Práctica', detalle: 'Para enseñar. No se guarda nada' },
]
const PUESTOS_PRACTICA = [['arriba', 'Tablet arriba'], ['monitor_arriba', 'Monitor arriba'], ['abajo', 'Tablet abajo'], ['monitor', 'Monitor abajo']]
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
  const [practica, setPractica] = useState(null) // estado en memoria mientras se enseña

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
    if (practica) { setPractica(x => registrarPractica(x, ops)); return }
    const e = registrarOps(ops, estado)
    if (e) setEstado(e)
    setPendientes(cola().length)
    subirCola().then(r => { setPendientes(r.pendientes); setFallas(errores()) }).catch(() => {})
  }

  const escogerPuesto = (p) => { try { p ? localStorage.setItem(CLAVE_PUESTO, p) : localStorage.removeItem(CLAVE_PUESTO) } catch {}; setPuesto(p); setAbierto(null) }
  const entrarPractica = () => { setPractica(estadoDePractica(estado)); setPuesto('arriba'); setAbierto(null); setMontando(false) }
  const puestoPractica = (p) => { setPuesto(p); setAbierto(null); setMontando(false) }
  const reiniciarPractica = () => { setPractica(estadoDePractica(estado)); setAbierto(null); setMontando(false) }
  const terminarPractica = () => { setPractica(null); setAbierto(null); setMontando(false); try { setPuesto(localStorage.getItem(CLAVE_PUESTO)) } catch { setPuesto(null) } }
  const salir = async () => { await cerrarSesionUsuario(usuario?.id); localStorage.removeItem('maissy_usuario'); router.replace('/entrar') }

  if (!usuario) return null

  if (!puesto) {
    return (
      <div className="min-h-screen p-4 md:p-8 flex flex-col items-center justify-center gap-5" style={{ background: C.fondo, color: C.tinta }}>
        <h1 className="text-3xl font-extrabold text-center" style={titulo}>Ubicación de este equipo</h1>
        <p className="text-center" style={{ color: C.gris }}>Se escoge una vez. Se puede cambiar después desde arriba.</p>
        <div className="grid gap-3 w-full max-w-2xl grid-cols-1 sm:grid-cols-2">
          {PUESTOS.map(p => (
            <button key={p.id} type="button" disabled={p.id === 'practica' && !estado} onClick={() => p.id === 'practica' ? entrarPractica() : escogerPuesto(p.id)} className="bg-white rounded-[20px] p-5 text-left flex flex-col gap-1 min-h-[110px] disabled:opacity-50">
              <b className="text-2xl" style={titulo}>{p.nombre}</b><span style={{ color: C.gris }}>{p.detalle}</span>
            </button>
          ))}
        </div>
        {usuario.rol === 'planta'
          ? <Boton onClick={salir}>Salir</Boton>
          : <Boton onClick={() => router.push('/produccion')}>Volver a MaissyPOS</Boton>}
      </div>
    )
  }

  // La práctica es siempre en simple; un lote de Maíz nuevo muestra los pasos completos.
  const datos = practica || estado
  const simple = !!practica || (!!estado?.plantaSimple && puesto !== 'completo')
  const barraPractica = practica && <BarraPractica puesto={puesto} onPuesto={puestoPractica} onReiniciar={reiniciarPractica} onTerminar={terminarPractica} />

  if (puesto === 'monitor' || puesto === 'monitor_arriba') {
    const Pantalla = puesto === 'monitor' ? Monitor : MonitorArriba
    return (
      <div>
        {barraPractica}
        {datos ? <Pantalla estado={datos} sinSenal={!practica && sinSenal} simple={simple} onSalir={practica ? null : () => escogerPuesto(null)} /> : <div className="min-h-screen flex items-center justify-center" style={{ background: '#141414', color: '#A9A59B' }}>Cargando…</div>}
      </div>
    )
  }

  const lotes = datos ? lotesAbiertos(datos) : []
  const enLinea = datos ? loteEnLinea(datos) : null
  const lote = abierto && datos?.cochadas?.[abierto]?.estado !== 'cerrado' ? datos?.cochadas?.[abierto] : null
  const nombrePuesto = PUESTOS.find(p => p.id === puesto)?.nombre

  return (
    <div className="min-h-screen pb-10" style={{ background: C.fondo, color: C.tinta }}>
      {barraPractica}
      <header className="bg-white border-b sticky top-0 z-10" style={{ borderColor: C.linea }}>
        <div className="max-w-6xl mx-auto px-4 min-h-[60px] flex items-center gap-3 flex-wrap py-2">
          <Image src="/maissypos-logo.png" width={110} height={41} alt="MaissyPOS" priority style={{ width: '110px', height: 'auto' }} />
          <span className="font-extrabold text-lg flex-1 min-w-[160px]" style={titulo}>Control de producción</span>
          {!practica && <span className="inline-flex items-center gap-2 text-sm font-bold">
            <i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: pendientes || sinSenal ? C.amarillo : C.verde }} />
            {pendientes ? `${pendientes} sin subir${sinSenal ? ' · sin señal' : ''}` : sinSenal ? 'Sin señal' : 'Todo guardado'}
          </span>}
          {!practica && <button type="button" onClick={() => escogerPuesto(null)} className="text-sm font-bold rounded-xl px-3 min-h-[40px]" style={{ background: C.suave }}>{nombrePuesto}</button>}
          {practica ? null : usuario.rol === 'planta'
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
        {errorCarga && !datos && <Tarjeta><b>No se pudo cargar la planta.</b><span style={{ color: C.gris }}>{errorCarga}</span><Boton onClick={sincronizar}>Reintentar</Boton></Tarjeta>}
        {!datos && !errorCarga && <p className="text-center py-16" style={{ color: C.gris }}>Cargando…</p>}

        {datos && montando && (
          <Montar estado={datos} usuario={usuario} simple={simple} onCancelar={() => setMontando(false)}
            onRegistrar={(ops, id) => { registrar(ops); setMontando(false); setAbierto(id || null) }} />
        )}

        {datos && !montando && lote && (
          <Lote key={lote.id} estado={datos} c={lote} usuario={usuario} puesto={puesto} registrar={registrar} simple={simple} practica={!!practica} onVolver={() => setAbierto(null)} />
        )}

        {datos && !montando && !lote && (
          <>
            {puesto !== 'abajo' && (simple ? <TanquesVista estado={datos} /> : <Tanques estado={datos} />)}
            {puesto !== 'abajo' && enLinea && !simple && (
              <Molde estado={datos} c={enLinea} registrar={registrar}
                reg={(tipo, extra) => ({ op: 'insert', tabla: 'produccion_muestras_peso', datos: { id: nuevoId(), empresa_id: getEmpresaId(), cochada_id: enLinea.id, tipo, hora: ahora(), puesto, registrado_por: usuario.nombre, anulado: false, ...extra } })} />
            )}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h1 className="text-[26px] font-extrabold" style={titulo}>Lotes de cocción abiertos</h1>
              {puesto !== 'abajo' && <Boton tipo="rojo" grande onClick={() => setMontando(true)}>Montar lotes de cocción</Boton>}
            </div>
            {lotes.length === 0 && (
              <Tarjeta><b className="text-lg">No hay lotes abiertos.</b>
                <span style={{ color: C.gris }}>{puesto === 'abajo' ? 'Cuando arriba monte un tanque, aparece aquí.' : 'Para iniciar, seleccione “Montar lotes de cocción”.'}</span></Tarjeta>
            )}
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))' }}>
              {lotes.map(c => {
                const t = datos.tanques.find(x => x.id === c.tanque_id)
                const paso = pasoActual(datos, c)
                const { arriba, sigue } = referencias(datos, c)
                const ref = (id) => (datos.referencias.find(p => p.id === id)?.nombre || '').replace(/^Arepa (de Maíz )?/i, '')
                if (simple) return (
                  <button key={c.id} type="button" onClick={() => setAbierto(c.id)} className="rounded-[20px] p-5 text-left flex flex-col gap-3" style={{ background: C.tinta, color: '#fff' }}>
                    <span className="flex items-center justify-between gap-2 w-full flex-wrap">
                      <b className="text-[26px] leading-tight" style={titulo}>{t?.nombre || 'Lote'}</b>
                      <b className="rounded-full px-4 py-1.5 text-[16px]" style={{ background: C.amarillo, color: C.tinta }}>{c.maiz_nuevo ? 'Maíz nuevo' : NOMBRE_PASO[paso]}</b>
                    </span>
                    <span className="text-[16px]" style={{ color: '#D9D5CC' }}>{fmtNum(c.cantidad, Number(c.cantidad) % 1 ? 1 : 0)} bultos · {arriba ? ref(arriba.producto_id) : fmtHora(c.hora_montada)}</span>
                  </button>
                )
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
            {practica && <ResumenPractica estado={practica} />}
          </>
        )}
      </main>
    </div>
  )
}

// Práctica: se cambia de puesto desde el mismo equipo y se ve qué aparece en cada uno.
function BarraPractica({ puesto, onPuesto, onReiniciar, onTerminar }) {
  return (
    <div className="sticky top-0 z-20 px-4 py-2 flex items-center gap-2 flex-wrap" style={{ background: C.amarillo, color: C.tinta }} role="region" aria-label="Práctica">
      <b className="text-lg mr-2" style={titulo}>Práctica · no se guarda nada</b>
      <div className="flex gap-1 flex-wrap flex-1" role="group" aria-label="Puesto">
        {PUESTOS_PRACTICA.map(([id, n]) => <button key={id} type="button" aria-pressed={puesto === id} onClick={() => onPuesto(id)} className="rounded-xl min-h-[44px] px-3 text-sm font-bold" style={puesto === id ? { background: C.tinta, color: '#fff' } : { background: '#fff', color: C.tinta }}>{n}</button>)}
      </div>
      <button type="button" onClick={onReiniciar} className="rounded-xl min-h-[44px] px-3 text-sm font-bold bg-white">Reiniciar</button>
      <button type="button" onClick={onTerminar} className="rounded-xl min-h-[44px] px-3 text-sm font-bold text-white" style={{ background: C.rojo }}>Terminar</button>
    </div>
  )
}

function ResumenPractica({ estado }) {
  const cerrados = Object.values(estado.cochadas).filter(c => c.estado === 'cerrado')
  const nombre = (id) => (estado.referencias.find(p => p.id === id)?.nombre || '').replace(/^Arepa (de Maíz )?/i, '')
  return cerrados.map(c => {
    const rend = telasPorBulto(estado, c)
    return (
      <Tarjeta key={c.id}>
        <b className="text-[21px]" style={titulo}>Lote cerrado · {estado.tanques.find(t => t.id === c.tanque_id)?.nombre}</b>
        {Object.entries(empacado(estado, c)).filter(([, n]) => n > 0).map(([id, n]) => <span key={id} className="flex justify-between"><span>{nombre(id)}</span><b className="tabular-nums">{n.toLocaleString('es-CO')} paq.</b></span>)}
        <span className="flex justify-between pt-2 font-bold" style={{ borderTop: `1px solid ${C.linea}` }}><span>Telas por bulto</span><b className="text-[24px] tabular-nums" style={titulo}>{rend ? fmtNum(rend.telas, 0) : 'Sin dato'}</b></span>
      </Tarjeta>
    )
  })
}

// Tablero de tanques: cómo está cada uno de un vistazo.
function Tanques({ estado }) {
  const lotes = lotesAbiertos(estado).filter(c => !c.hora_sacada)
  const maiz = (c) => c ? (estado.maices || []).find(m => m.id === c.materia_prima_id) : null
  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
      {estado.tanques.map(t => {
        const c = lotes.filter(x => x.tanque_id === t.id).sort((a, b) => (b.hora_montada || '').localeCompare(a.hora_montada || ''))[0]
        const cap = Number(t.capacidad_bultos) || 0
        const b = c ? Number(c.cantidad) : 0
        const amarillo = /amarill/i.test(maiz(c)?.nombre || '')
        return (
          <div key={t.id} className="bg-white rounded-[18px] px-4 py-3 flex flex-col gap-1.5 min-w-0">
            <b className="text-lg" style={titulo}>{t.nombre}</b>
            <span>{c ? <Pill tono="ambar">{c.hora_apagado ? `Reposando · ${duracion(c.hora_apagado)}` : `Cocinando · ${duracion(c.hora_montada)}`}</Pill> : <Pill>Libre</Pill>}</span>
            <span className="h-3 rounded-full overflow-hidden flex" style={{ background: C.suave }}><i className="block h-full" style={{ width: `${cap ? Math.min(100, b / cap * 100) : 0}%`, background: amarillo ? C.amarillo : '#D9D2BF' }} /></span>
            <span className="text-[13px]" style={{ color: C.gris }}>{c ? `${fmtNum(b, b % 1 ? 1 : 0)} de ${(maiz(c)?.nombre || 'maíz').toLowerCase()} · montado ${fmtHora(c.hora_montada)}` : `${t.con_presion ? 'Con presión' : 'Tapa suelta'} · caben ${cap}`}</span>
          </div>
        )
      })}
    </div>
  )
}
