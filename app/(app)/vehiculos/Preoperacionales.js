'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { CHECKLIST, kmPorDia, nombreItem } from '@/lib/vehiculos'
import { C, Kpi, Kpis, Tarjeta, H2, Nota, Boton, campoEstilo } from '../gastos/ui'
import { miles, fechaLarga, Placa, VerFotos } from './comunes'

// Preoperacional del mes por vehículo: cumplimiento por día (C cumple, NC no
// cumple), kilómetros del día, quién lo hizo y novedades. La planilla se
// imprime con el formato FR-SST-001 del Sistema Integrado de Gestión.
const NOMBRE_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
// Desde este día existe el preoperacional digital; antes no se marca como faltante.
const INICIO_PREOP = '2026-10-21'
const ultimoDia = (mes) => { const [y, m] = mes.split('-').map(Number); return new Date(y, m, 0).getDate() }

export default function Preoperacionales({ flota, empresa }) {
  const hoy = obtenerFechaActual()
  const vehs = flota.vehiculos.filter(v => v.estado !== 'inactivo')
  const [vid, setVid] = useState(vehs[0]?.id || '')
  const [mes, setMes] = useState(hoy.slice(0, 7))
  const [d, setD] = useState(null)
  const [dia, setDia] = useState(null)
  const v = flota.vehiculos.find(x => x.id === vid)

  useEffect(() => {
    if (!vid) return
    setD(null); setDia(null)
    const fin = `${mes}-${String(ultimoDia(mes)).padStart(2, '0')}`
    const sig = new Date(fin + 'T12:00:00'); sig.setDate(sig.getDate() + 3)
    Promise.all([
      supabase.from('vehiculos_preoperacional').select('*').eq('vehiculo_id', vid).eq('empresa_id', getEmpresaId()).gte('fecha', `${mes}-01`).lte('fecha', sig.toLocaleDateString('en-CA')).order('fecha'),
      supabase.from('vehiculos_novedades').select('*').eq('vehiculo_id', vid).eq('empresa_id', getEmpresaId()).gte('fecha', `${mes}-01`).lte('fecha', fin).order('fecha'),
    ]).then(([a, b]) => setD({ preops: a.data || [], novedades: b.data || [] }))
  }, [vid, mes])

  if (!vehs.length) return <Tarjeta><Nota>Registre los vehículos para llevar el preoperacional.</Nota></Tarjeta>
  const n = ultimoDia(mes)
  const dias = Array.from({ length: n }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`)
  const items = CHECKLIST[v?.clase] || CHECKLIST.carro
  const porFecha = Object.fromEntries((d?.preops || []).map(p => [p.fecha, p]))
  const km = kmPorDia(d?.preops || [])
  const esDomingo = (f) => new Date(f + 'T12:00:00').getDay() === 0
  const debia = dias.filter(f => f <= hoy && f >= INICIO_PREOP && !esDomingo(f))
  const hechos = debia.filter(f => porFecha[f])
  const kmMes = dias.reduce((s, f) => s + (km[f] || 0), 0)
  const mesesOpc = (() => { const out = []; const [y, m] = hoy.slice(0, 7).split('-').map(Number); for (let i = 0; i < 6; i++) { const x = new Date(y, m - 1 - i, 1); out.push(x.toLocaleDateString('en-CA').slice(0, 7)) } return out })()
  const celda = (f, k) => {
    const p = porFecha[f]
    if (!p) return f <= hoy && f >= INICIO_PREOP && !esDomingo(f) ? { t: '—', bg: C.ambarF } : { t: '', bg: f > hoy || f < INICIO_PREOP ? '#fff' : C.suave }
    const nov = p.items?.[k] === 'novedad'
    return { t: nov ? 'NC' : p.items?.[k] ? 'C' : 'NA', bg: nov ? C.rojoF : C.verdeF, color: nov ? C.rojo : C.verde }
  }
  const docFecha = (t) => v?.documentos.filter(x => (x.tipo || '').toLowerCase().startsWith(t)).sort((a, b) => String(b.fecha_vencimiento).localeCompare(String(a.fecha_vencimiento)))[0]?.fecha_vencimiento

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 flex-wrap items-center no-imprimir">
        <select value={vid} onChange={e => setVid(e.target.value)} aria-label="Vehículo" className="h-10 rounded-xl px-3 text-sm font-bold bg-white" style={campoEstilo}>{vehs.map(x => <option key={x.id} value={x.id}>{x.placa} · {x.conductor?.nombre || 'sin conductor'}</option>)}</select>
        <select value={mes} onChange={e => setMes(e.target.value)} aria-label="Mes" className="h-10 rounded-xl px-3 text-sm font-bold bg-white" style={campoEstilo}>{mesesOpc.map(m => <option key={m} value={m}>{NOMBRE_MES[Number(m.slice(5)) - 1].replace(/^\w/, c => c.toUpperCase())} {m.slice(0, 4)}</option>)}</select>
        <Boton onClick={() => window.print()}>Imprimir planilla FR-SST-001</Boton>
      </div>
      <div className="no-imprimir">
        <Kpis>
          <Kpi rotulo="Preoperacionales del mes" valor={`${hechos.length} de ${debia.length}`} nota="Días de lunes a sábado desde el 21 de octubre" />
          <Kpi rotulo="Sin preoperacional" valor={debia.length - hechos.length} rojo={debia.length > hechos.length} nota="Días sin registro" />
          <Kpi rotulo="Novedades del mes" valor={d?.novedades.length ?? '…'} rojo={(d?.novedades || []).some(x => x.estado === 'abierta')} nota={`${(d?.novedades || []).filter(x => x.estado === 'abierta').length} abiertas`} />
          <Kpi rotulo="Kilómetros del mes" valor={miles(kmMes)} nota={hechos.length ? `${miles(kmMes / Math.max(1, Object.keys(km).filter(f => f.startsWith(mes)).length))} por día` : 'Sin registros'} />
        </Kpis>
      </div>
      <Tarjeta className="planilla-imprimible">
        <style>{`@media print { body * { visibility: hidden } .planilla-imprimible, .planilla-imprimible * { visibility: visible } .planilla-imprimible { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; border-radius: 0 !important } .no-imprimir { display: none !important } .planilla-imprimible .overflow-x-auto { overflow: visible !important } @page { size: letter landscape; margin: 8mm } }`}</style>
        <div className="hidden print:grid gap-0 text-[10px]" style={{ gridTemplateColumns: '140px 1fr 150px', border: `1px solid ${C.tinta}` }}>
          <div className="p-2 flex items-center justify-center font-extrabold" style={{ borderRight: `1px solid ${C.tinta}` }}>{empresa?.nombre}</div>
          <div className="flex flex-col items-center justify-center font-bold" style={{ borderRight: `1px solid ${C.tinta}` }}><span>SISTEMA INTEGRADO DE GESTIÓN</span><span>CHEQUEO PREOPERACIONAL DE VEHÍCULO</span></div>
          <div className="flex flex-col p-1"><span>Código: FR-SST-001</span><span>Versión: 003</span><span>Fecha: octubre de 2026</span></div>
        </div>
        <div className="flex justify-between gap-3 flex-wrap items-center">
          <span className="flex gap-2 items-center flex-wrap">{v && <Placa grande>{v.placa}</Placa>}<H2>{NOMBRE_MES[Number(mes.slice(5)) - 1].replace(/^\w/, c => c.toUpperCase())} {mes.slice(0, 4)}</H2></span>
          <span className="text-[12.5px]" style={{ color: C.gris }}>SOAT vence {fechaLarga(docFecha('soat'))} · tecnomecánica {fechaLarga(docFecha('tecno'))} · control de plagas {fechaLarga(docFecha('control'))}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="text-[12px] tabular-nums" style={{ borderCollapse: 'collapse', minWidth: 900, width: '100%' }}>
            <thead><tr>
              <th className="text-left px-1.5 py-1" style={{ borderBottom: `1.5px solid ${C.tinta}`, minWidth: 170 }}>Ítem</th>
              {dias.map((f, i) => <th key={f} onClick={() => setDia(porFecha[f] ? f : null)} className="px-0.5 py-1 font-extrabold cursor-pointer" style={{ borderBottom: `1.5px solid ${C.tinta}`, color: esDomingo(f) ? C.gris : C.tinta, minWidth: 26 }}>{i + 1}</th>)}
            </tr></thead>
            <tbody>
              <tr><td className="px-1.5 py-1 font-bold" style={{ borderBottom: `1px solid ${C.linea}` }}>Kilometraje de salida</td>{dias.map(f => <td key={f} className="text-center" style={{ borderBottom: `1px solid ${C.linea}`, fontSize: 10 }}>{porFecha[f] ? miles(porFecha[f].km).slice(-7) : ''}</td>)}</tr>
              <tr><td className="px-1.5 py-1 font-bold" style={{ borderBottom: `1px solid ${C.linea}` }}>Km del día</td>{dias.map(f => <td key={f} className="text-center font-bold" style={{ borderBottom: `1px solid ${C.linea}` }}>{km[f] != null ? miles(km[f]) : ''}</td>)}</tr>
              {items.map(([k, nombre]) => (
                <tr key={k}><td className="px-1.5 py-1" style={{ borderBottom: `1px solid ${C.linea}` }}>{nombre}</td>
                  {dias.map(f => { const c = celda(f, k); return <td key={f} onClick={() => setDia(porFecha[f] ? f : null)} className="text-center font-bold cursor-pointer" style={{ background: c.bg, color: c.color || C.gris, borderBottom: `1px solid #fff`, borderRight: '1px solid #fff' }}>{c.t}</td> })}
                </tr>
              ))}
              <tr><td className="px-1.5 py-1 font-bold">Conductor</td>{dias.map(f => <td key={f} className="text-center" style={{ fontSize: 9, color: C.gris }}>{porFecha[f]?.conductor ? porFecha[f].conductor.split(' ').map(x => x[0]).join('') : ''}</td>)}</tr>
            </tbody>
          </table>
        </div>
        <Nota>C: cumple · NC: no cumple · — : día sin preoperacional · Conductor: iniciales de quien lo hizo. Los documentos del vehículo y del conductor se controlan por su fecha de vencimiento.</Nota>
        {(d?.novedades || []).length > 0 && (
          <div className="flex flex-col gap-1">
            <h3 className="text-[15px] font-extrabold">Observaciones</h3>
            {d.novedades.map(x => <span key={x.id} className="text-[13px]">{fechaLarga(x.fecha)} · <b>{nombreItem(v?.clase, x.item)}</b>: {x.detalle} · {x.reportada_por}{x.estado === 'resuelta' ? ` · resuelta: ${x.solucion}` : ' · abierta'}</span>)}
          </div>
        )}
        <div className="hidden print:grid gap-10 mt-8 text-[11px]" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="pt-1 text-center" style={{ borderTop: `1px solid ${C.tinta}` }}>Revisó (SST)</div>
          <div className="pt-1 text-center" style={{ borderTop: `1px solid ${C.tinta}` }}>Administración</div>
        </div>
      </Tarjeta>
      {dia && porFecha[dia] && (
        <Tarjeta className="no-imprimir">
          <div className="flex justify-between gap-2 items-center"><H2>{fechaLarga(dia)}</H2><Boton onClick={() => setDia(null)}>Cerrar</Boton></div>
          <span className="text-sm">Hecho por <b>{porFecha[dia].conductor}</b> a las {new Date(porFecha[dia].created_at).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })} · {miles(porFecha[dia].km)} km</span>
          {(d.novedades || []).filter(x => x.fecha === dia).map(x => <div key={x.id} className="text-sm flex flex-col gap-0.5"><span><b>{nombreItem(v?.clase, x.item)}</b>: {x.detalle}</span><VerFotos fotos={x.fotos} /></div>)}
          {!(d.novedades || []).some(x => x.fecha === dia) && <Nota>Sin novedades: todo marcado como bien.</Nota>}
        </Tarjeta>
      )}
    </div>
  )
}
