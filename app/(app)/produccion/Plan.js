'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { corto, resumenHoy } from '@/lib/produccion-admin'
import { C, titulo, Pill } from './Paneles'

// Plan del día: quien decide la producción pone qué referencias, cuántos
// paquetes y en qué orden. La planta lo ve en las tablets y los monitores para
// saber qué troquelar después y alistar bolsas. Lo hecho sale de lo que se cuenta abajo.
const tarjeta = 'bg-white rounded-[18px] p-4'
const sumarDias = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }
const nombreDia = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })

export default function PlanDia({ e, usuario }) {
  const refs = e.referencias.filter(p => !/kilo de masa/i.test(p.nombre))
  const [fecha, setFecha] = useState(e.hoy)
  const [filas, setFilas] = useState(null) // [{ producto_id, paquetes (texto) }]
  const [guardado, setGuardado] = useState(null)
  const [estado, setEstado] = useState('')
  const [agregar, setAgregar] = useState('')

  const leerPlan = useCallback(async (f) => {
    const { data, error } = await supabase.from('produccion_plan').select('producto_id, paquetes, orden').eq('empresa_id', getEmpresaId()).eq('fecha', f).order('orden')
    if (error) throw new Error(error.message)
    return (data || []).map(x => ({ producto_id: x.producto_id, paquetes: String(x.paquetes) }))
  }, [])

  useEffect(() => {
    let vivo = true
    setFilas(null); setEstado('')
    leerPlan(fecha).then(l => { if (vivo) { setFilas(l); setGuardado(JSON.stringify(l)) } }).catch(err => vivo && setEstado('No se pudo cargar: ' + err.message))
    return () => { vivo = false }
  }, [fecha, leerPlan])

  const hecho = fecha === e.hoy ? resumenHoy(e).empacadoHoy : {}
  const cambiado = filas && JSON.stringify(filas) !== guardado
  const mover = (i, d) => setFilas(l => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n })
  const poner = (i, v) => setFilas(l => l.map((x, j) => j === i ? { ...x, paquetes: v.replace(/\D/g, '') } : x))
  const quitar = (i) => setFilas(l => l.filter((_, j) => j !== i))
  const libres = refs.filter(p => !(filas || []).some(f => f.producto_id === p.id))

  const copiarAyer = async () => {
    setEstado('')
    try {
      const l = await leerPlan(sumarDias(fecha, -1))
      if (!l.length) { setEstado('El día anterior no tiene plan.'); return }
      setFilas(l)
    } catch (err) { setEstado('No se pudo copiar: ' + err.message) }
  }

  const guardar = async () => {
    const validas = filas.filter(f => Number(f.paquetes) > 0)
    setEstado('Guardando…')
    const empresaId = getEmpresaId()
    const { error: e1 } = await supabase.from('produccion_plan').delete().eq('empresa_id', empresaId).eq('fecha', fecha)
    if (e1) { setEstado('No se pudo guardar: ' + e1.message); return }
    if (validas.length) {
      const { error: e2 } = await supabase.from('produccion_plan').insert(validas.map((f, i) => ({ empresa_id: empresaId, fecha, producto_id: f.producto_id, paquetes: Number(f.paquetes), orden: i + 1, creado_por: usuario?.nombre || null })))
      if (e2) { setEstado('No se pudo guardar: ' + e2.message); return }
    }
    setFilas(validas); setGuardado(JSON.stringify(validas))
    setEstado(validas.length ? 'Listo: la planta ya lo ve.' : 'Plan borrado.')
  }

  const pedidos = (filas || []).reduce((s, f) => s + (Number(f.paquetes) || 0), 0)
  const hechos = (filas || []).reduce((s, f) => s + Math.min(hecho[f.producto_id] || 0, Number(f.paquetes) || 0), 0)

  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Día del plan">
        {[[e.hoy, 'Hoy'], [sumarDias(e.hoy, 1), 'Mañana']].map(([f, n]) => (
          <button key={f} type="button" role="radio" aria-checked={fecha === f} onClick={() => setFecha(f)} className="rounded-full min-h-[44px] px-5 font-bold"
            style={fecha === f ? { background: '#fff', boxShadow: `inset 0 0 0 2.5px ${C.tinta}` } : { background: C.suave }}>{n}</button>
        ))}
      </div>
      <div className={tarjeta + ' flex flex-col gap-3'}>
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h3 className="text-[19px] font-extrabold first-letter:uppercase" style={titulo}>Plan del {nombreDia(fecha)}</h3>
          {filas?.length > 0 && <span className="text-[13px] tabular-nums" style={{ color: C.gris }}>{fecha === e.hoy ? `${hechos.toLocaleString('es-CO')} de ` : ''}{pedidos.toLocaleString('es-CO')} paquetes</span>}
        </div>
        <p className="text-[13px]" style={{ color: C.gris }}>En el orden en que queremos que salga la arepa. Arriba saben qué troquelar después y abajo alistan las bolsas.</p>
        {!filas ? <p className="text-sm py-4" style={{ color: C.gris }}>Cargando…</p> : filas.length === 0 ? (
          <p className="text-sm py-2" style={{ color: C.gris }}>Todavía no hay plan para este día. Agrega referencias o copia el del día anterior.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {filas.map((f, i) => {
              const p = refs.find(x => x.id === f.producto_id)
              const h = hecho[f.producto_id] || 0
              const n = Number(f.paquetes) || 0
              return (
                <div key={f.producto_id} className="grid items-center gap-2.5 rounded-2xl px-3 py-2.5" style={{ background: C.fondo, gridTemplateColumns: '32px minmax(0,1fr) auto' }}>
                  <span className="w-8 h-8 rounded-lg bg-white flex items-center justify-center font-extrabold" style={titulo}>{i + 1}</span>
                  <span className="min-w-0 flex flex-col gap-1">
                    <b className="truncate">{corto(p)}</b>
                    {fecha === e.hoy && n > 0 && <span className="flex items-center gap-2 text-[13px]" style={{ color: C.gris }}>
                      <span className="flex-1 h-2 rounded-full overflow-hidden max-w-[160px]" style={{ background: C.linea }}><i className="block h-full" style={{ width: `${Math.min(100, h / n * 100)}%`, background: C.verde }} /></span>
                      <span className="tabular-nums">{h.toLocaleString('es-CO')} hechos</span>{h >= n && <Pill tono="verde">Listo</Pill>}</span>}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <input inputMode="numeric" value={f.paquetes} onChange={ev => poner(i, ev.target.value)} aria-label={`Paquetes de ${corto(p)}`}
                      className="w-20 h-11 rounded-xl border-2 bg-white text-center text-lg font-extrabold tabular-nums" style={{ borderColor: C.linea, ...titulo }} />
                    <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir" className="w-10 h-10 rounded-xl bg-white font-bold disabled:opacity-30">↑</button>
                    <button type="button" onClick={() => mover(i, 1)} disabled={i === filas.length - 1} aria-label="Bajar" className="w-10 h-10 rounded-xl bg-white font-bold disabled:opacity-30">↓</button>
                    <button type="button" onClick={() => quitar(i)} aria-label={`Quitar ${corto(p)}`} className="h-10 px-2 rounded-xl text-[13px] font-bold underline" style={{ color: C.gris }}>Quitar</button>
                  </span>
                </div>
              )
            })}
          </div>
        )}
        {filas && (
          <div className="flex gap-2 flex-wrap">
            <select value={agregar} onChange={ev => { if (ev.target.value) setFilas(l => [...l, { producto_id: ev.target.value, paquetes: '' }]); setAgregar('') }}
              className="h-11 rounded-xl border-2 px-3 font-bold bg-white flex-1 min-w-[200px]" style={{ borderColor: C.linea }} aria-label="Agregar referencia" disabled={!libres.length}>
              <option value="">+ Agregar referencia</option>
              {libres.map(p => <option key={p.id} value={p.id}>{corto(p)}</option>)}
            </select>
            <button type="button" onClick={copiarAyer} className="h-11 rounded-xl px-4 font-bold" style={{ background: C.suave }}>Copiar el plan del día anterior</button>
          </div>
        )}
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {estado && <span className="text-sm font-bold flex-1" style={{ color: estado.startsWith('No') ? C.rojo : estado.startsWith('Listo') ? C.verde : C.gris }}>{estado}</span>}
          <button type="button" onClick={guardar} disabled={!filas || !cambiado} className="min-h-[48px] rounded-xl px-5 font-bold text-white disabled:opacity-40" style={{ background: C.rojo }}>Mandar a la planta</button>
        </div>
      </div>
    </div>
  )
}
