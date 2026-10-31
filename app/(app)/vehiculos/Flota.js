'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { estadoVence, nombreItem, PLAN_BASE, DOCUMENTOS_VEHICULO, CHECKLIST } from '@/lib/vehiculos'
import InputDinero from '@/components/InputDinero'
import { C, $, fechaCorta, Pill, Kpi, Kpis, Tarjeta, H2, Nota, Boton, campo, campoEstilo, Campo, Segmento, Tabla, td } from '../gastos/ui'
import { miles, fechaLarga, Placa, BotonArchivo, VerFotos, SubirFotos } from './comunes'
import { nombreLindo } from '@/lib/maestros'
import CampoFecha from '@/components/CampoFecha'
const mesAnio = (f) => f ? new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { month: 'short', year: 'numeric' }) : '—'
const cuenta = (n, a, b) => `${n} ${n === 1 ? a : b}`

// Vehículos: tarjetas con documentos, kilometraje, próximo mantenimiento y
// costo del mes; ficha con resumen, documentos, mantenimiento (plan y
// arreglos con factura y garantía), combustible, entregas y novedades.
const TONO_PLAN = { vencido: 'rojo', pronto: 'ambar', al_dia: 'verde', sin_registro: 'gris' }
const kmTxt = (n) => `${miles(n)} km`

export default function Flota({ flota, usuario, recargar, sel, setSel, nuevoRef }) {
  const [form, setForm] = useState(null)
  if (nuevoRef) nuevoRef.current = () => setForm({ placa: '', clase: 'carro', marca: '', modelo: '', anio: '', color: '', tipo: '', conductor_id: '', ruta_id: '', kilometraje_actual: '', combustible: 'gasolina', fecha_compra: '', valor_compra: '', vida_util_anios: '10', estado: 'activo' })
  const activos = flota.vehiculos.filter(v => v.estado !== 'inactivo')
  const v = flota.vehiculos.find(x => x.id === sel)
  const costoMes = activos.reduce((s, x) => s + x.costo.total, 0)
  const kmMes = activos.reduce((s, x) => s + x.kmMes, 0)
  const docsMal = activos.flatMap(x => x.documentos.filter(d => ['rojo', 'ambar'].includes(estadoVence(d.fecha_vencimiento, obtenerFechaActual()).tono)))
  const mantMal = activos.flatMap(x => x.plan.filter(p => p.estado === 'vencido' || p.estado === 'pronto'))

  return (
    <div className="flex flex-col gap-4">
      <Kpis>
        <Kpi rotulo="Vehículos activos" valor={activos.length} nota={`${cuenta(activos.filter(x => x.clase === 'carro').length, 'carro', 'carros')} · ${cuenta(activos.filter(x => x.clase === 'moto').length, 'moto', 'motos')}`} />
        <Kpi rotulo="Documentos por vencer" valor={docsMal.length} rojo={docsMal.length > 0} />
        <Kpi rotulo="Mantenimientos próximos" valor={mantMal.length} rojo={mantMal.length > 0} />
        <Kpi rotulo="Costo del mes" valor={$(costoMes)} nota={kmMes ? `${kmTxt(kmMes)} · ${$(costoMes / kmMes)} por km` : ''} />
      </Kpis>
      {form && <FormVehiculo form={form} setForm={setForm} flota={flota} recargar={recargar} />}
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: v ? 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))' : '1fr' }}>
        <div className={'grid gap-3 content-start ' + (v ? 'columna-scroll' : '')} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }}>
          {flota.vehiculos.length === 0 && <Tarjeta><Nota>Sin vehículos registrados</Nota></Tarjeta>}
          {flota.vehiculos.map(x => <TarjetaVehiculo key={x.id} v={x} activo={sel === x.id} onClick={() => setSel(sel === x.id ? null : x.id)} />)}
        </div>
        {v && <Ficha v={v} flota={flota} usuario={usuario} recargar={recargar} editar={() => setForm({ ...v, anio: v.anio ?? '', kilometraje_actual: v.kilometraje_actual ?? '', valor_compra: v.valor_compra ?? '', vida_util_anios: v.vida_util_anios ?? '10', fecha_compra: v.fecha_compra || '', conductor_id: v.conductor_id || '', ruta_id: v.ruta_id || '' })} cerrar={() => setSel(null)} />}
      </div>
    </div>
  )
}

function TarjetaVehiculo({ v, activo, onClick }) {
  const hoy = obtenerFechaActual()
  const docs = ['SOAT', 'Tecnomecánica', 'Seguro todo riesgo'].map(t => {
    const d = v.documentos.filter(x => x.tipo?.toLowerCase().replace('é', 'e').startsWith(t.toLowerCase().replace('é', 'e').slice(0, 6))).sort((a, b) => String(b.fecha_vencimiento).localeCompare(String(a.fecha_vencimiento)))[0]
    return { t: t === 'Seguro todo riesgo' ? 'Seguro' : t, d, e: d ? estadoVence(d.fecha_vencimiento, hoy) : { tono: 'gris', texto: 'Sin registro' } }
  })
  const prox = v.plan.filter(p => p.faltaKm != null || p.faltaDias != null).sort((a, b) => (a.faltaKm ?? a.faltaDias * 100) - (b.faltaKm ?? b.faltaDias * 100))[0]
  const fondo = { verde: C.verdeF, ambar: C.ambarF, rojo: C.rojoF, gris: C.suave }, texto = { verde: C.verde, ambar: C.ambar, rojo: C.rojo, gris: C.gris }
  return (
    <button data-fila type="button" onClick={onClick} className="bg-white rounded-[18px] p-4 flex flex-col gap-2.5 text-left min-w-0" style={{ boxShadow: activo ? `inset 0 0 0 2px ${C.tinta}` : undefined, opacity: v.estado === 'inactivo' ? 0.55 : 1 }}>
      <div className="flex justify-between items-center gap-2"><Placa>{v.placa}</Placa>{v.estado === 'inactivo' ? <Pill>Inactivo</Pill> : v.preopHoy ? <Pill tono="verde">Preoperacional hoy</Pill> : <Pill tono="ambar">Sin preoperacional hoy</Pill>}</div>
      <span className="min-w-0"><b>{[v.marca, v.modelo, v.anio].filter(Boolean).join(' · ') || (v.clase === 'moto' ? 'Moto' : 'Carro')}</b><span className="block text-[13px]" style={{ color: C.gris }}>{v.conductor?.nombre || 'Sin conductor'}{v.ruta ? ` · ${nombreLindo(v.ruta.nombre)}` : ''}</span></span>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        {docs.map(x => <div key={x.t} className="rounded-xl px-2 py-1.5 text-[12px] min-w-0" style={{ background: fondo[x.e.tono], color: texto[x.e.tono] }}><b className="block">{x.t}</b>{x.d ? mesAnio(x.d.fecha_vencimiento) : 'Sin registro'}</div>)}
      </div>
      <div className="flex justify-between gap-3 text-sm py-1" style={{ borderBottom: `1px solid ${C.linea}` }}><span style={{ color: C.gris }}>Kilometraje</span><b className="tabular-nums">{kmTxt(v.kilometraje_actual)}</b></div>
      {prox && <div className="flex justify-between gap-3 text-sm py-1" style={{ borderBottom: `1px solid ${C.linea}` }}><span style={{ color: C.gris }}>{prox.tipo}</span><b className="tabular-nums" style={{ color: prox.estado === 'vencido' ? C.rojo : prox.estado === 'pronto' ? C.ambar : C.tinta }}>{prox.faltaKm != null ? (prox.faltaKm > 0 ? `en ${kmTxt(prox.faltaKm)}` : `pasado ${kmTxt(-prox.faltaKm)}`) : `en ${prox.faltaDias} días`}</b></div>}
      <div className="flex justify-between gap-3 text-sm"><span style={{ color: C.gris }}>Costo del mes</span><b className="tabular-nums">{$(v.costo.total)}{v.costo.porKm ? ` · ${$(v.costo.porKm)}/km` : ''}</b></div>
    </button>
  )
}

function FormVehiculo({ form, setForm, flota, recargar }) {
  const [guardando, setGuardando] = useState(false)
  const guardar = async () => {
    if (!form.placa.trim()) { alert('Escriba la placa.'); return }
    setGuardando(true)
    const datos = {
      placa: form.placa.trim().toUpperCase().replace(/\s/g, ''), clase: form.clase, marca: form.marca?.trim() || null, modelo: form.modelo?.trim() || null, anio: parseInt(form.anio) || null,
      color: form.color?.trim() || null, tipo: form.tipo?.trim() || null, conductor_id: form.conductor_id || null, ruta_id: form.ruta_id || null,
      kilometraje_actual: Number(form.kilometraje_actual) || 0, combustible: form.combustible, fecha_compra: form.fecha_compra || null,
      valor_compra: Number(form.valor_compra) || null, vida_util_anios: Number(form.vida_util_anios) || null, estado: form.estado || 'activo',
    }
    const res = form.id ? await supabase.from('vehiculos').update(datos).eq('id', form.id).select('id').single() : await supabase.from('vehiculos').insert({ ...datos, empresa_id: getEmpresaId() }).select('id').single()
    if (!res.error && !form.id) {
      // Plan de mantenimiento recomendado para empezar; se ajusta en la ficha.
      await supabase.from('vehiculos_plan').insert(PLAN_BASE[form.clase].map(([tipo, km, meses]) => ({ empresa_id: getEmpresaId(), vehiculo_id: res.data.id, tipo, cada_km: km, cada_meses: meses })))
    }
    setGuardando(false)
    if (res.error) { alert('No se pudo guardar: ' + (res.error.code === '23505' ? 'esa placa ya existe' : res.error.message)); return }
    setForm(null); recargar()
  }
  const grid = { gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }
  return (
    <Tarjeta>
      <div className="flex justify-between gap-2 items-center"><H2>{form.id ? `Editar ${form.placa}` : 'Nuevo vehículo'}</H2><Boton onClick={() => setForm(null)}>Cancelar</Boton></div>
      <Segmento etiqueta="Clase" opciones={[['carro', 'Carro o van'], ['moto', 'Moto']]} valor={form.clase} onCambio={v => setForm({ ...form, clase: v })} />
      <div className="grid gap-2.5" style={grid}>
        <Campo etiqueta="Placa"><input value={form.placa} onChange={e => setForm({ ...form, placa: e.target.value.toUpperCase() })} className={campo} style={campoEstilo} /></Campo>
        <Campo etiqueta="Marca"><input value={form.marca || ''} onChange={e => setForm({ ...form, marca: e.target.value })} className={campo} style={campoEstilo} /></Campo>
        <Campo etiqueta="Línea o modelo"><input value={form.modelo || ''} onChange={e => setForm({ ...form, modelo: e.target.value })} className={campo} style={campoEstilo} /></Campo>
        <Campo etiqueta="Año"><input inputMode="numeric" value={form.anio} onChange={e => setForm({ ...form, anio: e.target.value.replace(/\D/g, '').slice(0, 4) })} className={campo} style={campoEstilo} /></Campo>
        <Campo etiqueta="Color"><input value={form.color || ''} onChange={e => setForm({ ...form, color: e.target.value })} className={campo} style={campoEstilo} /></Campo>
        <Campo etiqueta="Kilometraje actual"><InputDinero value={form.kilometraje_actual} onChange={e => setForm({ ...form, kilometraje_actual: e.target.value })} className={campo} style={campoEstilo} /></Campo>
        <Campo etiqueta="Conductor">
          <select value={form.conductor_id || ''} onChange={e => setForm({ ...form, conductor_id: e.target.value })} className={campo} style={campoEstilo}>
            <option value="">Sin conductor</option>
            {flota.vendedores.filter(x => x.estado).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Ruta">
          <select value={form.ruta_id || ''} onChange={e => setForm({ ...form, ruta_id: e.target.value })} className={campo} style={campoEstilo}>
            <option value="">Sin ruta</option>
            {flota.rutas.map(r => <option key={r.id} value={r.id}>{nombreLindo(r.nombre)}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Combustible">
          <select value={form.combustible || 'gasolina'} onChange={e => setForm({ ...form, combustible: e.target.value })} className={campo} style={campoEstilo}>
            <option value="gasolina">Gasolina</option><option value="diesel">Diésel (ACPM)</option><option value="gas">Gas</option><option value="electrico">Eléctrico</option>
          </select>
        </Campo>
        <Campo etiqueta="Fecha de compra"><CampoFecha value={form.fecha_compra || ''} onChange={e => setForm({ ...form, fecha_compra: e.target.value })} className={campo} style={campoEstilo} /></Campo>
        <Campo etiqueta="Valor de compra"><InputDinero value={form.valor_compra} onChange={e => setForm({ ...form, valor_compra: e.target.value })} placeholder="$" className={campo} style={campoEstilo} /></Campo>
        <Campo etiqueta="Vida útil (años)"><input inputMode="numeric" value={form.vida_util_anios} onChange={e => setForm({ ...form, vida_util_anios: e.target.value.replace(/\D/g, '') })} className={campo} style={campoEstilo} /></Campo>
      </div>
      {form.id && <Segmento etiqueta="Estado" opciones={[['activo', 'Activo'], ['taller', 'En taller'], ['inactivo', 'Inactivo']]} valor={form.estado || 'activo'} onCambio={v => setForm({ ...form, estado: v })} />}
      <div className="flex justify-end"><Boton tono="rojo" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar vehículo'}</Boton></div>
    </Tarjeta>
  )
}

function Ficha({ v, flota, usuario, recargar, editar, cerrar }) {
  const [sec, setSec] = useState('resumen')
  const abiertas = v.novedades.filter(n => n.estado === 'abierta').length
  return (
    <Tarjeta className="columna-scroll">
      <div className="flex justify-between gap-2 items-start flex-wrap">
        <span className="flex flex-col gap-1 min-w-0"><Placa grande>{v.placa}</Placa><span className="text-[13px]" style={{ color: C.gris }}>{[v.marca, v.modelo, v.anio, v.color].filter(Boolean).join(' · ')}</span></span>
        <span className="flex gap-2 flex-wrap"><Boton onClick={editar}>Editar</Boton><Boton onClick={cerrar}>Cerrar</Boton></span>
      </div>
      <div className="flex gap-1 flex-wrap">
        {[['resumen', 'Resumen'], ['documentos', 'Documentos'], ['mantenimiento', 'Mantenimiento'], ['combustible', 'Combustible'], ['entregas', `Entregas y novedades${abiertas ? ` · ${abiertas}` : ''}`]].map(([k, n]) => (
          <button key={k} type="button" aria-pressed={sec === k} onClick={() => setSec(k)} className="rounded-full min-h-[36px] px-3.5 text-[13.5px] font-bold" style={sec === k ? { background: C.tinta, color: '#fff' } : { background: C.fondo, color: C.gris }}>{n}</button>
        ))}
      </div>
      {sec === 'resumen' && <Resumen v={v} />}
      {sec === 'documentos' && <Documentos v={v} recargar={recargar} />}
      {sec === 'mantenimiento' && <Mantenimiento v={v} usuario={usuario} recargar={recargar} />}
      {sec === 'combustible' && <Combustible v={v} usuario={usuario} recargar={recargar} />}
      {sec === 'entregas' && <Entregas v={v} flota={flota} usuario={usuario} recargar={recargar} />}
    </Tarjeta>
  )
}

const Fila = ({ r, children, fuerte }) => <div className="flex justify-between gap-3 py-[7px] text-sm" style={{ borderBottom: `1px solid ${C.linea}` }}><span style={{ color: fuerte ? C.tinta : C.gris, fontWeight: fuerte ? 800 : 400 }}>{r}</span><b className="text-right tabular-nums">{children}</b></div>

function Resumen({ v }) {
  const mes = new Date().toLocaleDateString('es-CO', { month: 'long' })
  const dias = Object.keys(v.kmDia).filter(f => f.startsWith(obtenerFechaActual().slice(0, 7))).length
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Fila r="Conductor">{v.conductor?.nombre || 'Sin conductor'}</Fila>
        <Fila r="Ruta">{v.ruta ? nombreLindo(v.ruta.nombre) : '—'}</Fila>
        <Fila r="Kilometraje actual">{kmTxt(v.kilometraje_actual)}</Fila>
        <Fila r={`Kilómetros en ${mes}`}>{v.kmMes ? `${kmTxt(v.kmMes)}${dias ? ` · ${miles(v.kmMes / dias)} por día` : ''}` : 'Sin preoperacionales'}</Fila>
        <Fila r="Rendimiento">{v.rendimiento ? `${v.rendimiento.kmPorGalon.toFixed(1).replace('.', ',')} km por galón` : 'Faltan tanqueos con galones y km'}</Fila>
        {v.rendimiento && <Fila r="Tanquea cada">{`${v.rendimiento.diasEntreTanqueos.toFixed(1).replace('.', ',')} días · ${kmTxt(v.rendimiento.kmEntreTanqueos)}`}</Fila>}
      </div>
      <div>
        <h3 className="text-[15px] font-extrabold mb-1">Costo de {mes}</h3>
        <Fila r="Combustible">{$(v.costo.combustible)}</Fila>
        <Fila r="Mantenimientos y arreglos">{$(v.costo.mantenimiento)}</Fila>
        <Fila r="Repuestos de la bodega interna">{$(v.costo.repuestos)}</Fila>
        <Fila r="Costo por kilómetro" fuerte>{v.costo.porKm ? $(v.costo.porKm) : '—'}</Fila>
      </div>
      {v.valor_compra && (
        <div>
          <h3 className="text-[15px] font-extrabold mb-1">Valor</h3>
          <Fila r="Valor de compra">{$(v.valor_compra)}{v.fecha_compra ? ` · ${fechaLarga(v.fecha_compra)}` : ''}</Fila>
          <Fila r="Valor actual estimado">{v.valorActual != null ? $(v.valorActual) : '—'}</Fila>
        </div>
      )}
    </div>
  )
}

function Documentos({ v, recargar }) {
  const hoy = obtenerFechaActual()
  const [f, setF] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const guardar = async () => {
    if (!f.tipo || !f.fecha_vencimiento) { alert('Seleccione el documento y la fecha de vencimiento.'); return }
    setGuardando(true)
    const datos = { tipo: f.tipo, numero: f.numero?.trim() || null, fecha_expedicion: f.fecha_expedicion || null, fecha_vencimiento: f.fecha_vencimiento, archivo_url: f.archivos?.[0] || f.archivo_url || null }
    const { error } = f.id ? await supabase.from('vehiculos_documentos').update(datos).eq('id', f.id) : await supabase.from('vehiculos_documentos').insert({ ...datos, vehiculo_id: v.id, empresa_id: getEmpresaId() })
    setGuardando(false)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    setF(null); recargar()
  }
  return (
    <div className="flex flex-col gap-3">
      {v.documentos.length === 0 && !f && <Nota>Sin documentos registrados.</Nota>}
      {v.documentos.map(d => { const e = estadoVence(d.fecha_vencimiento, hoy); return (
        <div key={d.id} className="grid gap-2 items-center py-1" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', borderBottom: `1px solid ${C.linea}` }}>
          <span className="min-w-0"><b>{d.tipo}</b><span className="block text-[13px]" style={{ color: C.gris }}>{d.numero ? `N.º ${d.numero} · ` : ''}vence {fechaLarga(d.fecha_vencimiento)}</span>
            <span className="flex gap-3 mt-0.5"><BotonArchivo ruta={d.archivo_url} /><button type="button" onClick={() => setF({ ...d, archivos: [] })} className="text-[13px] font-bold" style={{ color: C.gris }}>Renovar o editar</button></span></span>
          <Pill tono={e.tono}>{e.texto}</Pill>
        </div>
      ) })}
      {f ? (
        <div className="rounded-[14px] p-3 flex flex-col gap-2.5" style={{ background: C.fondo }}>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <Campo etiqueta="Documento"><select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })} className={campo} style={campoEstilo}><option value="">Seleccione</option>{[...new Set([...DOCUMENTOS_VEHICULO, f.tipo].filter(Boolean))].map(t => <option key={t}>{t}</option>)}</select></Campo>
            <Campo etiqueta="Número"><input value={f.numero || ''} onChange={e => setF({ ...f, numero: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Expedición"><CampoFecha value={f.fecha_expedicion || ''} onChange={e => setF({ ...f, fecha_expedicion: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Vencimiento"><CampoFecha value={f.fecha_vencimiento || ''} onChange={e => setF({ ...f, fecha_vencimiento: e.target.value })} className={campo} style={campoEstilo} /></Campo>
          </div>
          <div className="flex gap-2 flex-wrap items-center justify-between"><SubirFotos valor={f.archivos || []} onCambio={a => setF({ ...f, archivos: a })} carpeta="vehiculos" texto="Adjuntar documento" multiple={false} /><span className="flex gap-2"><Boton tono="blanco" onClick={() => setF(null)}>Cancelar</Boton><Boton tono="rojo" onClick={guardar} disabled={guardando}>Guardar</Boton></span></div>
        </div>
      ) : <div><Boton onClick={() => setF({ tipo: '', numero: '', fecha_expedicion: '', fecha_vencimiento: '', archivos: [] })}>+ Documento</Boton></div>}
    </div>
  )
}

function Mantenimiento({ v, usuario, recargar }) {
  const [f, setF] = useState(null)
  const [plan, setPlan] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const guardarArreglo = async () => {
    if (!f.tipo.trim() || !f.fecha) { alert('Escriba qué se hizo y la fecha.'); return }
    setGuardando(true)
    const p = v.plan.find(x => x.tipo === f.tipo)
    const { error } = await supabase.from('vehiculos_mantenimientos').insert({
      empresa_id: getEmpresaId(), vehiculo_id: v.id, tipo: f.tipo.trim(), plan_id: p?.id || null, taller: f.taller?.trim() || null, km_realizado: Number(f.km) || null,
      km_proximo: p?.cada_km && Number(f.km) ? Number(f.km) + Number(p.cada_km) : null, costo: Number(f.costo) || 0, fecha: f.fecha, notas: f.notas?.trim() || null,
      factura_url: f.archivos?.[0] || null, garantia_hasta: f.garantia || null,
    })
    if (!error && Number(f.km) > Number(v.kilometraje_actual || 0)) await supabase.from('vehiculos').update({ kilometraje_actual: Number(f.km) }).eq('id', v.id)
    setGuardando(false)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    setF(null); recargar()
  }
  const guardarPlan = async () => {
    if (!plan.tipo.trim() || (!Number(plan.cada_km) && !Number(plan.cada_meses))) { alert('Escriba el mantenimiento y cada cuántos km o meses.'); return }
    const datos = { tipo: plan.tipo.trim(), cada_km: Number(plan.cada_km) || null, cada_meses: Number(plan.cada_meses) || null }
    const { error } = plan.id ? await supabase.from('vehiculos_plan').update(datos).eq('id', plan.id) : await supabase.from('vehiculos_plan').insert({ ...datos, empresa_id: getEmpresaId(), vehiculo_id: v.id })
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    setPlan(null); recargar()
  }
  const quitarPlan = async (p) => {
    if (!confirm(`¿Quitar "${p.tipo}" del plan?`)) return
    const { error } = await supabase.from('vehiculos_plan').delete().eq('id', p.id)
    if (error) { alert('Error: ' + error.message); return }
    recargar()
  }
  const cargarBase = async () => {
    const { error } = await supabase.from('vehiculos_plan').insert(PLAN_BASE[v.clase].filter(([t]) => !v.plan.some(p => p.tipo === t)).map(([tipo, km, meses]) => ({ empresa_id: getEmpresaId(), vehiculo_id: v.id, tipo, cada_km: km, cada_meses: meses })))
    if (error) { alert('Error: ' + error.message); return }
    recargar()
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between gap-2 items-center flex-wrap"><h3 className="text-[15px] font-extrabold">Plan de mantenimiento</h3><span className="flex gap-2">{v.plan.length < PLAN_BASE[v.clase].length && <Boton tono="blanco" onClick={cargarBase}>Cargar plan recomendado</Boton>}<Boton tono="blanco" onClick={() => setPlan({ tipo: '', cada_km: '', cada_meses: '' })}>+ Al plan</Boton></span></div>
      {plan && (
        <div className="rounded-[14px] p-3 flex flex-wrap gap-2 items-end" style={{ background: C.fondo }}>
          <Campo etiqueta="Mantenimiento"><input value={plan.tipo} onChange={e => setPlan({ ...plan, tipo: e.target.value })} placeholder="Cambio de aceite" className={campo} style={{ ...campoEstilo, width: 200 }} /></Campo>
          <Campo etiqueta="Cada (km)"><input inputMode="numeric" value={plan.cada_km ?? ''} onChange={e => setPlan({ ...plan, cada_km: e.target.value.replace(/\D/g, '') })} className={campo} style={{ ...campoEstilo, width: 110 }} /></Campo>
          <Campo etiqueta="o cada (meses)"><input inputMode="numeric" value={plan.cada_meses ?? ''} onChange={e => setPlan({ ...plan, cada_meses: e.target.value.replace(/\D/g, '') })} className={campo} style={{ ...campoEstilo, width: 110 }} /></Campo>
          <Boton tono="blanco" onClick={() => setPlan(null)}>Cancelar</Boton><Boton tono="tinta" onClick={guardarPlan}>Guardar</Boton>
        </div>
      )}
      {v.plan.length > 0 && (
        <Tabla columnas={['Mantenimiento', 'Cada', 'Último', 'Próximo', '']} min={480}>
          {v.plan.map(p => (
            <tr key={p.id}>
              <td style={td(true)}><b>{p.tipo}</b></td>
              <td style={td()}>{[p.cada_km && kmTxt(p.cada_km), p.cada_meses && `${p.cada_meses} meses`].filter(Boolean).join(' o ')}</td>
              <td style={td()}>{p.ultimo ? <>{fechaCorta(p.ultimo.fecha)}{p.ultimo.km_realizado ? <span className="block text-[12px]" style={{ color: C.gris }}>{kmTxt(p.ultimo.km_realizado)}</span> : null}</> : '—'}</td>
              <td style={td()}><Pill tono={TONO_PLAN[p.estado]}>{p.estado === 'sin_registro' ? 'Registre el último' : p.kmProx != null ? kmTxt(p.kmProx) : fechaCorta(p.fechaProx)}</Pill></td>
              <td style={td()}><span className="flex gap-3 justify-end"><button type="button" onClick={() => setPlan({ ...p })} className="text-[13px] font-bold">Editar</button><button type="button" onClick={() => quitarPlan(p)} className="text-[13px] font-bold" style={{ color: C.gris }}>Quitar</button></span></td>
            </tr>
          ))}
        </Tabla>
      )}
      <div className="flex justify-between gap-2 items-center flex-wrap"><h3 className="text-[15px] font-extrabold">Historial de arreglos</h3>{!f && <Boton tono="rojo" onClick={() => setF({ tipo: '', fecha: obtenerFechaActual(), km: String(v.kilometraje_actual || ''), taller: '', costo: '', notas: '', garantia: '', archivos: [] })}>+ Arreglo</Boton>}</div>
      {f && (
        <div className="rounded-[14px] p-3 flex flex-col gap-2.5" style={{ background: C.fondo }}>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <Campo etiqueta="Qué se hizo"><input list="tipos-mant" value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })} placeholder="Cambio de aceite" className={campo} style={campoEstilo} /><datalist id="tipos-mant">{v.plan.map(p => <option key={p.id} value={p.tipo} />)}</datalist></Campo>
            <Campo etiqueta="Fecha"><CampoFecha value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Kilometraje"><InputDinero value={f.km} onChange={e => setF({ ...f, km: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Taller"><input value={f.taller} onChange={e => setF({ ...f, taller: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Costo"><InputDinero value={f.costo} onChange={e => setF({ ...f, costo: e.target.value })} placeholder="$" className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Garantía hasta"><CampoFecha value={f.garantia} onChange={e => setF({ ...f, garantia: e.target.value })} className={campo} style={campoEstilo} /></Campo>
          </div>
          <Campo etiqueta="Qué se cambió o detalle"><input value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })} placeholder="Aceite 20W50 4 cuartos y filtro" className={campo} style={campoEstilo} /></Campo>
          <div className="flex gap-2 flex-wrap items-center justify-between"><SubirFotos valor={f.archivos} onCambio={a => setF({ ...f, archivos: a })} texto="Adjuntar factura" multiple={false} /><span className="flex gap-2"><Boton tono="blanco" onClick={() => setF(null)}>Cancelar</Boton><Boton tono="rojo" onClick={guardarArreglo} disabled={guardando}>Guardar arreglo</Boton></span></div>
        </div>
      )}
      {v.mantenimientos.length === 0 ? <Nota>Sin arreglos registrados.</Nota> : v.mantenimientos.map(m => (
        <div key={m.id} className="grid gap-2 py-1.5" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', borderBottom: `1px solid ${C.linea}` }}>
          <span className="min-w-0"><b>{m.tipo}</b><span className="block text-[13px]" style={{ color: C.gris }}>{fechaLarga(m.fecha)}{m.km_realizado ? ` · ${kmTxt(m.km_realizado)}` : ''}{m.taller ? ` · ${m.taller}` : ''}{m.notas ? ` · ${m.notas}` : ''}</span>
            <span className="flex gap-3 mt-0.5 flex-wrap"><BotonArchivo ruta={m.factura_url} texto="Ver factura" />{m.garantia_hasta && <span className="text-[13px]" style={{ color: m.garantia_hasta >= obtenerFechaActual() ? C.verde : C.gris }}>Garantía {m.garantia_hasta >= obtenerFechaActual() ? 'hasta' : 'venció el'} {fechaLarga(m.garantia_hasta)}</span>}</span></span>
          <b className="tabular-nums">{$(m.costo)}</b>
        </div>
      ))}
    </div>
  )
}

function Combustible({ v, usuario, recargar }) {
  const [f, setF] = useState(null)
  const guardar = async () => {
    if (!Number(f.valor)) { alert('Escriba el valor.'); return }
    const { error } = await supabase.from('vehiculos_tanqueos').insert({ empresa_id: getEmpresaId(), vehiculo_id: v.id, fecha: f.fecha, km: Number(f.km) || null, galones: parseFloat(String(f.galones).replace(',', '.')) || null, valor: Number(f.valor), tanque_lleno: f.lleno, registrado_por: usuario.nombre })
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    setF(null); recargar()
  }
  const lista = [...v.tanqueos].reverse()
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Fila r="Rendimiento (últimos 3 tanqueos)">{v.rendimiento ? `${v.rendimiento.kmPorGalon.toFixed(1).replace('.', ',')} km por galón` : '—'}</Fila>
        <Fila r="Tanquea cada">{v.rendimiento ? `${v.rendimiento.diasEntreTanqueos.toFixed(1).replace('.', ',')} días · ${kmTxt(v.rendimiento.kmEntreTanqueos)}` : '—'}</Fila>
        <Fila r="Combustible del mes">{$(v.costo.combustible)}</Fila>
      </div>
      {f ? (
        <div className="rounded-[14px] p-3 flex flex-wrap gap-2 items-end" style={{ background: C.fondo }}>
          <Campo etiqueta="Fecha"><CampoFecha value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} className={campo} style={{ ...campoEstilo, width: 150 }} /></Campo>
          <Campo etiqueta="Valor"><InputDinero value={f.valor} onChange={e => setF({ ...f, valor: e.target.value })} className={campo} style={{ ...campoEstilo, width: 120 }} /></Campo>
          <Campo etiqueta="Galones"><input inputMode="decimal" value={f.galones} onChange={e => setF({ ...f, galones: e.target.value })} className={campo} style={{ ...campoEstilo, width: 90 }} /></Campo>
          <Campo etiqueta="Kilometraje"><InputDinero value={f.km} onChange={e => setF({ ...f, km: e.target.value })} className={campo} style={{ ...campoEstilo, width: 120 }} /></Campo>
          <Segmento etiqueta="Tanque" opciones={[[true, 'Lleno'], [false, 'Parcial']]} valor={f.lleno} onCambio={x => setF({ ...f, lleno: x })} />
          <Boton tono="blanco" onClick={() => setF(null)}>Cancelar</Boton><Boton tono="tinta" onClick={guardar}>Guardar</Boton>
        </div>
      ) : <div><Boton onClick={() => setF({ fecha: obtenerFechaActual(), valor: '', galones: '', km: '', lleno: true })}>+ Tanqueo</Boton></div>}
      {lista.length === 0 ? <Nota>Sin tanqueos registrados.</Nota> : lista.map(t => (
        <div key={t.id} className="grid gap-2 py-1.5" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', borderBottom: `1px solid ${C.linea}` }}>
          <span className="min-w-0"><b>{fechaLarga(t.fecha)}</b><span className="block text-[13px]" style={{ color: C.gris }}>{[t.km && kmTxt(t.km), t.galones && `${String(t.galones).replace('.', ',')} gal`, t.tanque_lleno ? 'tanque lleno' : 'parcial', t.registrado_por].filter(Boolean).join(' · ')}</span><BotonArchivo ruta={t.foto_url} texto="Ver recibo" /></span>
          <b className="tabular-nums">{$(t.valor)}</b>
        </div>
      ))}
    </div>
  )
}

function Entregas({ v, flota, usuario, recargar }) {
  const [f, setF] = useState(null)
  const [resolver, setResolver] = useState(null)
  const guardar = async () => {
    if (!f.vendedor_id || !Number(f.km)) { alert('Seleccione el conductor y escriba el kilometraje.'); return }
    if (f.fotos.length < 4 && !confirm('Se recomiendan al menos 4 fotos (frente, atrás, lados) y el tablero. ¿Guardar así?')) return
    const conductor = flota.vendedores.find(x => x.id === f.vendedor_id)
    const { error } = await supabase.from('vehiculos_entregas').insert({ empresa_id: getEmpresaId(), vehiculo_id: v.id, fecha: f.fecha, vendedor_id: f.vendedor_id, conductor: conductor?.nombre, km: Number(f.km), fotos: f.fotos, notas: f.notas?.trim() || null, registrado_por: usuario.nombre })
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    await supabase.from('vehiculos').update({ conductor_id: f.vendedor_id, ...(Number(f.km) > Number(v.kilometraje_actual || 0) ? { kilometraje_actual: Number(f.km) } : {}) }).eq('id', v.id)
    setF(null); recargar()
  }
  const cerrarNovedad = async () => {
    if (!resolver.solucion.trim()) { alert('Escriba cómo se resolvió.'); return }
    const { error } = await supabase.from('vehiculos_novedades').update({ estado: 'resuelta', solucion: resolver.solucion.trim(), resuelta_por: usuario.nombre, resuelta_at: new Date().toISOString() }).eq('id', resolver.id)
    if (error) { alert('Error: ' + error.message); return }
    setResolver(null); recargar()
  }
  const items = CHECKLIST[v.clase] || CHECKLIST.carro
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between gap-2 items-center flex-wrap"><h3 className="text-[15px] font-extrabold">Novedades</h3></div>
      {v.novedades.length === 0 ? <Nota>Sin novedades reportadas.</Nota> : v.novedades.slice(0, 20).map(n => (
        <div key={n.id} className="flex flex-col gap-1.5 py-1.5" style={{ borderBottom: `1px solid ${C.linea}` }}>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
            <span className="min-w-0"><b>{nombreItem(v.clase, n.item)}</b><span className="block text-[13px]" style={{ color: C.gris }}>{fechaLarga(n.fecha)} · {n.detalle} · {n.reportada_por}</span>
              {n.estado === 'resuelta' && <span className="block text-[13px]" style={{ color: C.verde }}>Resuelta por {n.resuelta_por}: {n.solucion}</span>}
              <span className="flex gap-3 mt-0.5 flex-wrap"><VerFotos fotos={n.fotos} />{n.estado === 'abierta' && <button type="button" onClick={() => setResolver({ id: n.id, solucion: '' })} className="text-[13px] font-bold" style={{ color: C.rojo }}>Marcar resuelta</button>}</span></span>
            <Pill tono={n.estado === 'resuelta' ? 'verde' : n.critica ? 'rojo' : 'ambar'}>{n.estado === 'resuelta' ? 'Resuelta' : n.critica ? 'Crítica' : 'Abierta'}</Pill>
          </div>
          {resolver?.id === n.id && (
            <div className="flex gap-2 flex-wrap">
              <input value={resolver.solucion} onChange={e => setResolver({ ...resolver, solucion: e.target.value })} placeholder="Cómo se resolvió (taller, repuesto, costo)" className={campo + ' flex-1'} style={{ ...campoEstilo, minWidth: 200 }} />
              <Boton tono="blanco" onClick={() => setResolver(null)}>Cancelar</Boton><Boton tono="tinta" onClick={cerrarNovedad}>Guardar</Boton>
            </div>
          )}
        </div>
      ))}
      <div className="flex justify-between gap-2 items-center flex-wrap"><h3 className="text-[15px] font-extrabold">Entregas del vehículo</h3>{!f && <Boton tono="rojo" onClick={() => setF({ fecha: obtenerFechaActual(), vendedor_id: '', km: String(v.kilometraje_actual || ''), fotos: [], notas: '' })}>Entregar a un conductor</Boton>}</div>
      {f && (
        <div className="rounded-[14px] p-3 flex flex-col gap-2.5" style={{ background: C.fondo }}>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <Campo etiqueta="Conductor"><select value={f.vendedor_id} onChange={e => setF({ ...f, vendedor_id: e.target.value })} className={campo} style={campoEstilo}><option value="">Seleccione</option>{flota.vendedores.filter(x => x.estado).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo>
            <Campo etiqueta="Fecha"><CampoFecha value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Kilometraje"><InputDinero value={f.km} onChange={e => setF({ ...f, km: e.target.value })} className={campo} style={campoEstilo} /></Campo>
          </div>
          <Campo etiqueta="Estado en que se entrega"><input value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })} placeholder="Rayón en la puerta derecha, llanta de repuesto sin aire…" className={campo} style={campoEstilo} /></Campo>
          <div className="flex gap-2 flex-wrap items-center justify-between"><SubirFotos valor={f.fotos} onCambio={a => setF({ ...f, fotos: a })} texto="Fotos: frente, atrás, lados y tablero" /><span className="flex gap-2"><Boton tono="blanco" onClick={() => setF(null)}>Cancelar</Boton><Boton tono="rojo" onClick={guardar}>Registrar entrega</Boton></span></div>
        </div>
      )}
      {v.entregas.length === 0 ? <Nota>Sin entregas registradas.</Nota> : v.entregas.map(e => (
        <div key={e.id} className="flex flex-col gap-0.5 py-1.5" style={{ borderBottom: `1px solid ${C.linea}` }}>
          <b>Entregado a {e.conductor}</b>
          <span className="text-[13px]" style={{ color: C.gris }}>{fechaLarga(e.fecha)} · {kmTxt(e.km)} · {e.fotos?.length || 0} fotos{e.notas ? ` · ${e.notas}` : ''} · registró {e.registrado_por}</span>
          <VerFotos fotos={e.fotos} />
        </div>
      ))}
      {v.fotos.length > 0 && (<><h3 className="text-[15px] font-extrabold">Fotos anteriores</h3><span className="flex gap-3 flex-wrap">{v.fotos.map((x, i) => <BotonArchivo key={x.id} ruta={x.url} texto={`Foto ${i + 1} · ${fechaCorta(x.created_at)}`} />)}</span></>)}
      <Nota>Items del preoperacional de este vehículo: {items.map(x => x[1]).join(', ')}.</Nota>
    </div>
  )
}
