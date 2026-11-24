'use client'
import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { pedirGps as pedir, placaIgual } from '@/lib/gps'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { C, Tarjeta, H2, Kpi, Kpis, Pill, Nota, campo, campoEstilo } from '../gastos/ui'

// GPS de los carros (Datatrack): dónde está cada uno ahora y el recorrido del
// día con kilómetros, salida, llegada, paradas y excesos de velocidad. Los
// datos los trae el servidor (/api/gps) con el token; aquí no se guarda nada.
const MapaRuta = dynamic(() => import('@/components/MapaRuta'), { ssr: false, loading: () => <div style={{ height: 420, borderRadius: 18, background: '#E8E4D8' }} /> })

const horaDe = (t) => t ? new Date(t * 1000).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' }) : '—'
const haceMin = (t, ahora) => Math.max(0, Math.round((ahora - t) / 60))
const lapso = (m) => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim()


// Cómo está el carro ahora: andando, quieto o sin señal.
function estado(u, ahora) {
  if (!u.pos) return { texto: 'Sin señal', tono: 'ambar' }
  const m = haceMin(u.pos.t, ahora)
  if (m > 30) return { texto: `Sin señal hace ${lapso(m)}`, tono: 'ambar' }
  if (u.pos.velocidad > 3) return { texto: `Andando · ${u.pos.velocidad} km/h`, tono: 'verde' }
  return { texto: 'Quieto', tono: 'gris' }
}

export default function Gps({ flota }) {
  const hoy = obtenerFechaActual()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [sel, setSel] = useState(null)
  const [fecha, setFecha] = useState(hoy)
  const [rec, setRec] = useState(null)
  const [cargandoRec, setCargandoRec] = useState(false)

  const cargar = useCallback(async () => {
    try { const j = await pedir({ accion: 'unidades' }); setDatos(j); setError(''); setSel(s => s ?? j.unidades[0]?.id ?? null) } catch (e) { setError(e.message) }
  }, [])
  // Posición en vivo: se actualiza cada 30 segundos.
  useEffect(() => { cargar(); const t = setInterval(cargar, 30000); return () => clearInterval(t) }, [cargar])

  useEffect(() => {
    if (!sel) return
    let vivo = true
    setCargandoRec(true)
    pedir({ accion: 'recorrido', unidad: sel, fecha })
      .then(j => { if (vivo) { setRec(j.recorrido); setError('') } })
      .catch(e => { if (vivo) { setRec(null); setError(e.message) } })
      .finally(() => { if (vivo) setCargandoRec(false) })
    return () => { vivo = false }
  }, [sel, fecha])

  if (!datos && !error) return <p className="text-sm" style={{ color: C.gris }}>Conectando con el GPS…</p>
  if (!datos) return <Tarjeta><b>No se pudo conectar con el GPS</b><Nota>{error}</Nota></Tarjeta>

  const ahora = datos.ahora
  const vehiculos = flota?.vehiculos || []
  const unidad = datos.unidades.find(u => u.id === sel)
  const propio = (u) => vehiculos.find(v => placaIgual(v.placa, u.placa))
  const esHoy = fecha === hoy

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] items-start">
      <Tarjeta>
        <div className="flex justify-between items-baseline gap-2"><H2>Carros</H2><span className="text-[12.5px]" style={{ color: C.gris }}>en vivo · cada 30 s</span></div>
        {datos.unidades.length === 0 && <Nota>El GPS no tiene carros para este usuario.</Nota>}
        {datos.unidades.map((u, i) => {
          const e = estado(u, ahora), v = propio(u), on = u.id === sel
          return (
            <button key={u.id} type="button" aria-pressed={on} onClick={() => setSel(u.id)} className="text-left rounded-2xl p-3 flex flex-col gap-1"
              style={{ boxShadow: on ? `inset 0 0 0 2px ${C.tinta}` : `inset 0 0 0 1px ${C.linea}`, marginTop: i ? 0 : 2 }}>
              <span className="flex justify-between gap-2 items-center"><b className="text-[16px]">{u.placa || u.nombre}</b><Pill tono={e.tono}>{e.texto}</Pill></span>
              <span className="text-[13px]" style={{ color: C.gris }}>
                {v ? `${v.marca || ''} ${v.linea || ''}`.trim() || 'Registrado en Vehículos' : 'No está en Vehículos'}
                {u.pos ? ` · última señal ${horaDe(u.pos.t)}` : ''}
              </span>
            </button>
          )
        })}
      </Tarjeta>

      {unidad && (
        <div className="flex flex-col gap-4 min-w-0">
          <Tarjeta>
            <div className="flex flex-wrap justify-between items-end gap-3">
              <div className="min-w-0"><H2>{unidad.placa || unidad.nombre}</H2><span className="text-[13px]" style={{ color: C.gris }}>{unidad.nombre}</span></div>
              <label className="flex flex-col gap-1"><span className="text-[13px] font-bold" style={{ color: C.gris }}>Día</span>
                <input type="date" value={fecha} max={hoy} onChange={e => e.target.value && setFecha(e.target.value)} className={campo} style={campoEstilo} />
              </label>
            </div>
            {cargandoRec ? <div style={{ height: 420, borderRadius: 18, background: '#E8E4D8' }} /> : <MapaRuta key={unidad.id + fecha} alto={420} encuadrarRecorrido teselas={datos.mapa}
              recorrido={rec?.trazo || []}
              paradas={(rec?.paradas || []).map((p, i) => ({ clave: 'p' + i, n: i + 1, lat: p.lat, lng: p.lng, titulo: `Parada ${i + 1}: ${horaDe(p.desde)} a ${horaDe(p.hasta)} (${lapso(p.minutos)})${p.direccion ? ' · ' + p.direccion : ''}`, estado: 'visitado' }))}
              carros={esHoy && unidad.pos ? [{ lat: unidad.pos.lat, lng: unidad.pos.lng, placa: unidad.placa, rumbo: unidad.pos.rumbo, andando: unidad.pos.velocidad > 3 }] : []} />}
            {esHoy && unidad.pos?.direccion && <Nota>Ahora: {unidad.pos.direccion} · {estado(unidad, ahora).texto.toLowerCase()}</Nota>}
            {cargandoRec && <Nota>Cargando el recorrido…</Nota>}
          </Tarjeta>

          {rec && (rec.puntos === 0 ? <Tarjeta><b>Sin recorrido ese día</b><Nota>El GPS no reportó posiciones.</Nota></Tarjeta> : (<>
            <Kpis>
              <Kpi rotulo="Kilómetros" valor={rec.km.toLocaleString('es-CO')} nota={unidad.odometro != null ? `Odómetro ${Math.round(unidad.odometro).toLocaleString('es-CO')} km` : `${rec.puntos.toLocaleString('es-CO')} posiciones`} />
              <Kpi rotulo="En movimiento" valor={lapso(rec.movimientoMin)} />
              <Kpi rotulo="Salió" valor={horaDe(rec.salida)} nota={`Último movimiento ${horaDe(rec.llegada)}`} />
              <Kpi rotulo="Velocidad máxima" valor={`${rec.velocidadMax} km/h`} rojo={rec.velocidadMax > rec.limiteVelocidad} nota={rec.excesos.length ? `${rec.excesos.length} vez${rec.excesos.length === 1 ? '' : 'es'} sobre ${rec.limiteVelocidad}` : `Sin pasar de ${rec.limiteVelocidad}`} />
            </Kpis>
            <div className="grid gap-4 md:grid-cols-2 items-start">
              <Tarjeta>
                <H2>Paradas de 10 min o más</H2>
                {rec.paradas.length === 0 ? <Nota>No hubo paradas largas.</Nota> : rec.paradas.map((p, i) => (
                  <div key={i} className="flex justify-between gap-3 py-1.5 text-[14px]" style={{ borderTop: i ? `1px solid ${C.linea}` : 0 }}>
                    <span className="min-w-0"><b>{i + 1}.</b> {horaDe(p.desde)} a {horaDe(p.hasta)}{p.direccion && <span className="block text-[12.5px]" style={{ color: C.gris }}>{p.direccion}</span>}</span><b className="tabular-nums">{lapso(p.minutos)}</b>
                  </div>
                ))}
              </Tarjeta>
              <Tarjeta>
                <H2>Excesos de velocidad</H2>
                {rec.excesos.length === 0 ? <Nota>No pasó de {rec.limiteVelocidad} km/h.</Nota> : rec.excesos.map((x, i) => (
                  <div key={i} className="flex justify-between gap-3 py-1.5 text-[14px]" style={{ borderTop: i ? `1px solid ${C.linea}` : 0 }}>
                    <span>{horaDe(x.t)}</span><b className="tabular-nums" style={{ color: C.rojo }}>{x.v} km/h</b>
                  </div>
                ))}
              </Tarjeta>
            </div>
          </>))}
        </div>
      )}
    </div>
  )
}
