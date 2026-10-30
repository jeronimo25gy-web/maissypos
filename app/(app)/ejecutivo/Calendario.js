'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { cargarCalendario, TIPOS_CALENDARIO } from '@/lib/agenda'
import CampoFecha from '@/components/CampoFecha'

// Calendario del Inicio: semana o mes con todo lo que tiene fecha (nómina,
// pagos, cobros, vehículos y activos, fechas propias). Al tocar un día se ve
// su detalle y cada fecha lleva a su módulo; las propias se editan aquí.
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', linea: '#E3E1D8', suave: '#EFEDE6', rojo: '#C41230', rojoF: '#FBE9E9', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8' }
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const COLOR = { nomina: [C.rojo, C.rojoF], pagos: [C.ambar, C.ambarF], cobros: [C.verde, C.verdeF], vehiculos: [C.gris, C.suave], propios: [C.tinta, '#fff'] }
const pesos = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO')
const sumar = (f, d) => { const x = new Date(f + 'T12:00:00'); x.setDate(x.getDate() + d); return x.toLocaleDateString('en-CA') }
const lunesDe = (f) => { const d = new Date(f + 'T12:00:00'); const w = (d.getDay() + 6) % 7; return sumar(f, -w) }
const fechaTxt = (f, op) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', op)
const campo = 'w-full min-w-0 h-11 rounded-xl px-3 text-[15px] font-semibold bg-white outline-none'
const vacia = (hoy, empresaId) => ({ id: null, titulo: '', fecha: hoy, hora: '', repetir: 'no', para: 'todos', notas: '', empresa_id: empresaId })

export default function Calendario({ ids, empresas, usuario, hoy }) {
  const [vista, setVista] = useState('semana')
  const [ancla, setAncla] = useState(hoy)
  const [filtro, setFiltro] = useState('todo')
  const [eventos, setEventos] = useState(null)
  const [sel, setSel] = useState(null)
  const [form, setForm] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const puedeEditar = ['admin', 'auxiliar'].includes(usuario?.rol)

  const rango = (() => {
    if (vista === 'semana') { const ini = lunesDe(ancla); return { desde: ini, hasta: sumar(ini, 6), dias: Array.from({ length: 7 }, (_, i) => sumar(ini, i)) } }
    const primero = ancla.slice(0, 7) + '-01'
    const ini = lunesDe(primero)
    const dias = Array.from({ length: 42 }, (_, i) => sumar(ini, i))
    const ult = dias.reduce((u, f, i) => f.slice(0, 7) === ancla.slice(0, 7) ? i : u, 0)
    const n = Math.ceil((ult + 1) / 7) * 7
    return { desde: ini, hasta: dias[n - 1], dias: dias.slice(0, n) }
  })()
  const clave = `${ids.join(',')}|${rango.desde}|${rango.hasta}`
  const cargar = useCallback(async () => {
    setEventos(null)
    try { setEventos(await cargarCalendario(ids, rango.desde, rango.hasta, empresas, usuario)) } catch { setEventos([]) }
  }, [clave]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ids.length) cargar() }, [cargar, ids.length])

  const visibles = (eventos || []).filter(e => filtro === 'todo' || e.tipo === filtro)
  const delDia = (f) => visibles.filter(e => e.fecha === f)
  const mover = (n) => {
    if (vista === 'semana') setAncla(sumar(ancla, 7 * n))
    else { const d = new Date(ancla.slice(0, 7) + '-15T12:00:00'); d.setMonth(d.getMonth() + n); setAncla(d.toLocaleDateString('en-CA')) }
    setSel(null)
  }
  const tituloRango = vista === 'semana'
    ? `Semana del ${fechaTxt(rango.desde, { day: 'numeric', month: 'short' })} al ${fechaTxt(rango.hasta, { day: 'numeric', month: 'short' })}`
    : fechaTxt(ancla.slice(0, 7) + '-15', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())
  const proximos = visibles.filter(e => e.fecha >= hoy).slice(0, 6)
  const lista = sel ? delDia(sel) : proximos

  const guardar = async () => {
    if (!form.titulo.trim() || !form.fecha) { alert('Escriba qué es y la fecha.'); return }
    setGuardando(true)
    const datos = { titulo: form.titulo.trim(), fecha: form.fecha, hora: form.hora || null, repetir: form.repetir, para: form.para, notas: form.notas?.trim() || null, empresa_id: form.empresa_id }
    const { error } = form.id ? await supabase.from('calendario_eventos').update(datos).eq('id', form.id) : await supabase.from('calendario_eventos').insert({ ...datos, creado_por: usuario.nombre })
    setGuardando(false)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    setForm(null); cargar()
  }
  const borrar = async (e) => {
    if (!confirm(`¿Quitar "${e.titulo}" del calendario${e.repetir !== 'no' ? ' (todas sus repeticiones)' : ''}?`)) return
    const { error } = await supabase.from('calendario_eventos').delete().eq('id', e.id)
    if (error) { alert('No se pudo quitar: ' + error.message); return }
    cargar()
  }
  const chip = (e, chico) => (
    <span key={(e.propio?.id || '') + e.titulo + e.detalle} className="block rounded-lg font-bold leading-tight" title={e.detalle}
      style={{ background: COLOR[e.tipo][1], color: COLOR[e.tipo][0], fontSize: chico ? 10.5 : 11.5, padding: chico ? '2px 4px' : '4px 6px', boxShadow: e.tipo === 'propios' ? `inset 0 0 0 1.5px ${C.linea}` : undefined, overflowWrap: 'anywhere' }}>
      {e.titulo}{!chico && e.valor ? <span className="block tabular-nums">{pesos(e.valor)}</span> : null}
    </span>
  )
  const boton = (activo) => activo ? { background: '#fff', color: C.tinta, boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { color: C.gris }

  return (
    <section className="bg-white rounded-[18px] p-3.5 flex flex-col gap-3" aria-label="Calendario">
      <div className="flex justify-between gap-2 flex-wrap items-center">
        <span className="flex gap-2 items-center flex-wrap">
          <b className="text-[19px]" style={titulo}>{tituloRango}</b>
          <span className="flex gap-1">
            <button type="button" onClick={() => mover(-1)} aria-label="Anterior" className="min-h-[36px] px-3 rounded-xl font-bold" style={{ background: C.suave }}>‹</button>
            <button type="button" onClick={() => { setAncla(hoy); setSel(null) }} className="min-h-[36px] px-3 rounded-xl text-sm font-bold" style={{ background: C.suave }}>Hoy</button>
            <button type="button" onClick={() => mover(1)} aria-label="Siguiente" className="min-h-[36px] px-3 rounded-xl font-bold" style={{ background: C.suave }}>›</button>
          </span>
        </span>
        <span className="flex gap-2 flex-wrap items-center">
          <span className="flex gap-1 rounded-full p-1" style={{ background: C.fondo }}>
            {[['semana', 'Semana'], ['mes', 'Mes']].map(([v, n]) => <button key={v} type="button" aria-pressed={vista === v} onClick={() => { setVista(v); setSel(null) }} className="rounded-full min-h-[34px] px-3.5 text-[13.5px] font-bold" style={boton(vista === v)}>{n}</button>)}
          </span>
          {puedeEditar && <button type="button" onClick={() => setForm(vacia(sel || hoy, ids[0]))} className="rounded-xl min-h-[38px] px-4 text-sm font-bold text-white" style={{ background: C.rojo }}>+ Fecha</button>}
        </span>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {[['todo', 'Todo'], ...Object.entries(TIPOS_CALENDARIO)].map(([k, n]) => (
          <button key={k} type="button" aria-pressed={filtro === k} onClick={() => setFiltro(k)} className="rounded-full min-h-[32px] px-3 text-[13px] font-bold inline-flex items-center gap-1.5" style={filtro === k ? boton(true) : { background: C.fondo, color: C.gris }}>
            {k !== 'todo' && <i className="w-2 h-2 rounded-full" style={{ background: COLOR[k][0] }} />}{n}
          </button>
        ))}
      </div>

      {form && (
        <div className="rounded-[14px] p-3 flex flex-col gap-2.5" style={{ background: C.fondo }}>
          <b>{form.id ? 'Editar fecha' : 'Nueva fecha'}</b>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <label className="flex flex-col gap-1 text-[13px] font-bold" style={{ color: C.gris }}>Qué<input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Declaración de IVA" className={campo} style={{ border: `2px solid ${C.linea}`, color: C.tinta }} /></label>
            <label className="flex flex-col gap-1 text-[13px] font-bold" style={{ color: C.gris }}>Fecha<CampoFecha value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} className={campo} style={{ border: `2px solid ${C.linea}`, color: C.tinta }} /></label>
            <label className="flex flex-col gap-1 text-[13px] font-bold" style={{ color: C.gris }}>Hora (opcional)<input type="time" value={form.hora || ''} onChange={e => setForm({ ...form, hora: e.target.value })} className={campo} style={{ border: `2px solid ${C.linea}`, color: C.tinta }} /></label>
            <label className="flex flex-col gap-1 text-[13px] font-bold" style={{ color: C.gris }}>Se repite<select value={form.repetir} onChange={e => setForm({ ...form, repetir: e.target.value })} className={campo} style={{ border: `2px solid ${C.linea}`, color: C.tinta }}><option value="no">No se repite</option><option value="semana">Cada semana</option><option value="mes">Cada mes</option></select></label>
            <label className="flex flex-col gap-1 text-[13px] font-bold" style={{ color: C.gris }}>La ve<select value={form.para} onChange={e => setForm({ ...form, para: e.target.value })} className={campo} style={{ border: `2px solid ${C.linea}`, color: C.tinta }}>{usuario?.gerencia && <option value="gerencia">Solo Gerencia</option>}<option value="admin">Administración</option><option value="todos">Todos</option></select></label>
            {empresas.length > 1 && <label className="flex flex-col gap-1 text-[13px] font-bold" style={{ color: C.gris }}>Empresa<select value={form.empresa_id} onChange={e => setForm({ ...form, empresa_id: e.target.value })} className={campo} style={{ border: `2px solid ${C.linea}`, color: C.tinta }}>{empresas.filter(x => ids.includes(x.id)).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>}
          </div>
          <label className="flex flex-col gap-1 text-[13px] font-bold" style={{ color: C.gris }}>Nota<input value={form.notas || ''} onChange={e => setForm({ ...form, notas: e.target.value })} className={campo} style={{ border: `2px solid ${C.linea}`, color: C.tinta }} /></label>
          <div className="flex gap-2 justify-end"><button type="button" onClick={() => setForm(null)} className="rounded-xl min-h-[40px] px-4 text-sm font-bold bg-white">Cancelar</button><button type="button" onClick={guardar} disabled={guardando} className="rounded-xl min-h-[40px] px-4 text-sm font-bold text-white disabled:opacity-50" style={{ background: C.rojo }}>{guardando ? 'Guardando…' : 'Guardar fecha'}</button></div>
        </div>
      )}

      {!eventos ? <p className="text-sm py-8 text-center" style={{ color: C.gris }}>Cargando…</p> : vista === 'semana' ? (
        <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 118px), 1fr))' }}>
          {rango.dias.map(f => (
            <button key={f} type="button" onClick={() => setSel(sel === f ? null : f)} className="rounded-[14px] p-2 flex flex-col gap-1.5 text-left min-h-[120px] min-w-0"
              style={sel === f ? { background: '#fff', boxShadow: `inset 0 0 0 2px ${C.rojo}` } : f === hoy ? { background: '#fff', boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: C.fondo }}>
              <span className="flex items-baseline gap-1.5"><span className="text-[11px] font-extrabold uppercase" style={{ color: C.gris }}>{fechaTxt(f, { weekday: 'short' }).replace('.', '')}</span><b className="text-[20px] leading-none" style={titulo}>{Number(f.slice(8))}</b></span>
              {delDia(f).slice(0, 4).map(e => chip(e))}
              {delDia(f).length > 4 && <span className="text-[11.5px]" style={{ color: C.gris }}>+{delDia(f).length - 4} más</span>}
            </button>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid gap-1 min-w-[560px]" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(x => <span key={x} className="text-[12px] font-extrabold text-center" style={{ color: C.gris }}>{x}</span>)}
            {rango.dias.map(f => {
              const ev = delDia(f), fuera = f.slice(0, 7) !== ancla.slice(0, 7)
              return (
                <button key={f} type="button" onClick={() => setSel(sel === f ? null : f)} className="rounded-[10px] p-1.5 flex flex-col gap-1 text-left min-h-[78px] min-w-0"
                  style={{ ...(sel === f ? { background: '#fff', boxShadow: `inset 0 0 0 2px ${C.rojo}` } : f === hoy ? { background: '#fff', boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: C.fondo }), opacity: fuera ? 0.4 : 1 }}>
                  <b className="text-[13px]">{Number(f.slice(8))}</b>
                  {ev.slice(0, 2).map(e => chip(e, true))}
                  {ev.length > 2 && <span className="text-[11px]" style={{ color: C.gris }}>+{ev.length - 2} más</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col">
        <b className="text-[15px] pb-1">{sel ? fechaTxt(sel, { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^\w/, c => c.toUpperCase()) : 'Lo que viene'}</b>
        {eventos && lista.length === 0 && <p className="text-sm py-2" style={{ color: C.gris }}>{sel ? 'Nada con fecha este día.' : 'Nada con fecha en este periodo.'}</p>}
        {lista.map((e, i) => {
          const contenido = (
            <>
              <i className="w-2.5 h-2.5 rounded-full mt-1.5" style={{ background: COLOR[e.tipo][0] }} />
              <span className="min-w-0"><b className="block">{e.titulo}</b><span className="block text-[12.5px]" style={{ color: C.gris }}>{!sel ? fechaTxt(e.fecha, { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' : ''}{e.detalle}</span></span>
              <span className="text-right flex flex-col items-end gap-1">{e.valor ? <b className="tabular-nums">{pesos(e.valor)}</b> : null}
                {e.propio && puedeEditar ? <span className="flex gap-2 text-[12.5px] font-bold"><span role="button" tabIndex={0} onClick={(ev) => { ev.preventDefault(); setForm({ ...e.propio, hora: e.propio.hora?.slice(0, 5) || '' }) }}>Editar</span><span role="button" tabIndex={0} onClick={(ev) => { ev.preventDefault(); borrar(e.propio) }} style={{ color: C.gris }}>Quitar</span></span> : null}</span>
            </>
          )
          const estilo = { gridTemplateColumns: '12px minmax(0,1fr) auto', borderTop: i ? `1px solid ${C.linea}` : 0 }
          return e.href
            ? <Link key={i} href={e.href} className="grid gap-2.5 items-start py-2 text-[13.5px]" style={estilo}>{contenido}</Link>
            : <div key={i} className="grid gap-2.5 items-start py-2 text-[13.5px]" style={estilo}>{contenido}</div>
        })}
      </div>
    </section>
  )
}
