'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { nombreMesQ, rangoQuincena, CLASES_HORA, valorHoras } from '@/lib/nomina'
import InputDinero from '@/components/InputDinero'
import { cargarDescuentos, quincenaDe, rangoTodos } from './datos'
import { C, $, fechaCorta, Tarjeta, H2, Nota, Boton, campo, campoEstilo, Campo, Segmento } from '../gastos/ui'

// Novedades de la quincena: bonificaciones, descuentos, horas extra y
// recargos, y los descuentos automáticos de la operación.
const vacia = () => ({ empleadoId: '', tipo: 'bonificacion', concepto: '', valor: '', salarial: false, horas: '', clase: 'extra_diurna' })

export default function Novedades({ base, usuario, periodo, setPeriodo }) {
  const { empleados, p } = base
  const { mes, q } = periodo
  const activos = empleados.filter(e => e.activo)
  const [d, setD] = useState(null)
  const [form, setForm] = useState(vacia())
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    const id = getEmpresaId()
    const { desde, hasta } = rangoTodos(activos, mes, q)
    const [{ data: nov }, { data: pag }, automaticos] = await Promise.all([
      supabase.from('nomina_novedades').select('*').eq('empresa_id', id).eq('periodo', mes).order('created_at'),
      supabase.from('nomina_pagos').select('empleado_id, quincena').eq('empresa_id', id).eq('periodo', mes),
      cargarDescuentos(activos, desde, hasta),
    ])
    const pagados = {}
    ;(pag || []).forEach(x => { if (x.quincena === q || x.quincena == null) pagados[x.empleado_id] = true })
    setD({ novedades: (nov || []).filter(n => quincenaDe(n) === q), pagados, automaticos })
  }, [mes, q, empleados]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cargar() }, [cargar])

  const emp = activos.find(e => e.id === form.empleadoId)
  const valorCalculado = form.tipo === 'horas' && emp ? valorHoras(emp.salario_base, form.horas, form.clase, p) : null

  const agregar = async () => {
    const valor = form.tipo === 'horas' ? valorCalculado : parseFloat(form.valor)
    const concepto = form.tipo === 'horas' ? `${CLASES_HORA[form.clase].nombre} · ${String(form.horas).replace('.', ',')} h` : form.concepto.trim()
    if (!form.empleadoId || !concepto || !(valor > 0)) { alert(form.tipo === 'horas' ? 'Seleccione el empleado y escriba las horas.' : 'Seleccione el empleado y escriba el concepto y el valor.'); return }
    if (d.pagados[form.empleadoId]) { alert('La nómina de este empleado ya se pagó en esta quincena; la novedad no entraría.'); return }
    setGuardando(true)
    const { error } = await supabase.from('nomina_novedades').insert({
      empresa_id: getEmpresaId(), empleado_id: form.empleadoId, periodo: mes, quincena: q, tipo: form.tipo, concepto, valor,
      salarial: form.tipo === 'horas' ? true : form.tipo === 'bonificacion' && form.salarial,
      horas: form.tipo === 'horas' ? parseFloat(String(form.horas).replace(',', '.')) : null, clase: form.tipo === 'horas' ? form.clase : null,
      registrado_por: usuario.nombre,
    })
    setGuardando(false)
    if (error) { alert('No se pudo registrar: ' + error.message); return }
    setForm({ ...vacia(), empleadoId: form.empleadoId, tipo: form.tipo, clase: form.clase })
    cargar()
  }
  const quitar = async (n) => {
    if (d.pagados[n.empleado_id]) { alert('La nómina de este empleado ya se pagó; no se puede quitar.'); return }
    if (!confirm(`¿Quitar "${n.concepto}" (${$(n.valor)})?`)) return
    const { error } = await supabase.from('nomina_novedades').delete().eq('id', n.id)
    if (error) { alert('Error: ' + error.message); return }
    cargar()
  }

  return (
    <div className="flex flex-col gap-4">
      <Segmento etiqueta="Quincena" opciones={[[1, 'Primera quincena'], [2, 'Segunda quincena']]} valor={q} onCambio={v => setPeriodo({ mes, q: v })} />
      <Tarjeta>
        <H2>Registrar novedad · {nombreMesQ(mes, q).toLowerCase()}</H2>
        <Segmento etiqueta="Tipo de novedad" opciones={[['bonificacion', 'Bonificación'], ['descuento', 'Descuento'], ['horas', 'Horas extra o recargo']]} valor={form.tipo} onCambio={v => setForm({ ...form, tipo: v })} />
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <Campo etiqueta="Empleado">
            <select value={form.empleadoId} onChange={e => setForm({ ...form, empleadoId: e.target.value })} className={campo} style={campoEstilo}>
              <option value="">Seleccione</option>
              {activos.map(e => <option key={e.id} value={e.id}>{e.nombre}{d?.pagados[e.id] ? ' (pagado)' : ''}</option>)}
            </select>
          </Campo>
          {form.tipo === 'horas' ? (<>
            <Campo etiqueta="Clase">
              <select value={form.clase} onChange={e => setForm({ ...form, clase: e.target.value })} className={campo} style={campoEstilo}>
                {Object.entries(CLASES_HORA).map(([k, c]) => <option key={k} value={k}>{c.nombre} ({c.extra ? '+' : ''}{p.recargos[k]}%)</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Horas"><input inputMode="decimal" value={form.horas} onChange={e => setForm({ ...form, horas: e.target.value.replace(/[^\d.,]/g, '') })} className={campo} style={campoEstilo} /></Campo>
          </>) : (<>
            <Campo etiqueta="Concepto"><input value={form.concepto} onChange={e => setForm({ ...form, concepto: e.target.value })} placeholder={form.tipo === 'bonificacion' ? 'Bonificación por cumplimiento' : 'Faltante de herramienta'} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Valor"><InputDinero value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} placeholder="$" className={campo} style={campoEstilo} /></Campo>
          </>)}
        </div>
        {form.tipo === 'horas' && <Nota>{emp ? <>Valor hora de {emp.nombre.split(' ')[0]}: {$(emp.salario_base / p.horas_mes)} (salario ÷ {p.horas_mes} horas del mes). {valorCalculado ? <b style={{ color: C.tinta }}>Valor a pagar: {$(valorCalculado)}</b> : ''}</> : 'Seleccione el empleado para calcular el valor.'} {CLASES_HORA[form.clase].extra ? 'La hora extra se paga completa con su recargo.' : 'Sobre horas ordinarias se paga solo el recargo.'}</Nota>}
        {form.tipo === 'bonificacion' && (
          <label className="flex gap-2 items-center text-sm cursor-pointer w-max">
            <input type="checkbox" checked={form.salarial} onChange={e => setForm({ ...form, salarial: e.target.checked })} className="w-[18px] h-[18px]" style={{ accentColor: C.tinta }} />
            Bonificación salarial (suma a la base de salud y pensión)
          </label>
        )}
        <div className="flex justify-end"><Boton tono="rojo" onClick={agregar} disabled={guardando}>{guardando ? 'Registrando…' : 'Registrar novedad'}</Boton></div>
      </Tarjeta>

      {!d ? <Nota>Cargando…</Nota> : (() => {
        const conAlgo = activos.filter(e => { const r = rangoQuincena(mes, q, e); return d.novedades.some(n => n.empleado_id === e.id) || (d.automaticos[e.id]?.detalle || []).some(x => x.transferenciaId || (x.fecha >= r.desde && x.fecha <= r.hasta)) })
        if (!conAlgo.length) return <Tarjeta><Nota>Sin novedades en la {nombreMesQ(mes, q).toLowerCase()}.</Nota></Tarjeta>
        return (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))' }}>
            {conAlgo.map(e => {
              const suyas = d.novedades.filter(n => n.empleado_id === e.id)
              const r = rangoQuincena(mes, q, e)
              const auto = { detalle: (d.automaticos[e.id]?.detalle || []).filter(x => x.transferenciaId || (x.fecha >= r.desde && x.fecha <= r.hasta)) }
              const mas = suyas.filter(n => n.tipo !== 'descuento').reduce((s, n) => s + Number(n.valor), 0)
              const menos = suyas.filter(n => n.tipo === 'descuento').reduce((s, n) => s + Number(n.valor), 0) + auto.detalle.reduce((s, x) => s + x.valor, 0)
              return (
                <Tarjeta key={e.id}>
                  <div className="flex justify-between items-baseline gap-2">
                    <b>{e.nombre}{d.pagados[e.id] && <span className="text-[13px] font-bold" style={{ color: C.gris }}> · pagado</span>}</b>
                    <span className="text-sm font-bold tabular-nums">{mas > 0 && <span style={{ color: C.verde }}>+{$(mas)} </span>}{menos > 0 && <span style={{ color: C.rojo }}>−{$(menos)}</span>}</span>
                  </div>
                  <div className="flex flex-col">
                    {suyas.map(n => (
                      <div key={n.id} className="flex justify-between gap-2 py-1.5 text-sm" style={{ borderTop: `1px solid ${C.linea}` }}>
                        <span className="min-w-0">{n.concepto}{n.salarial && n.tipo === 'bonificacion' ? <span style={{ color: C.gris }}> · salarial</span> : ''}</span>
                        <span className="flex gap-3 shrink-0"><b className="tabular-nums" style={{ color: n.tipo === 'descuento' ? C.rojo : C.verde }}>{n.tipo === 'descuento' ? '−' : '+'}{$(n.valor)}</b>{!d.pagados[e.id] && <button type="button" onClick={() => quitar(n)} className="text-[13px] font-bold" style={{ color: C.gris }}>Quitar</button>}</span>
                      </div>
                    ))}
                    {auto.detalle.map((x, i) => (
                      <div key={'a' + i} className="flex justify-between gap-2 py-1.5 text-sm" style={{ borderTop: `1px solid ${C.linea}` }}>
                        <span className="min-w-0">{x.concepto} <span style={{ color: C.gris }}>· {fechaCorta(x.fecha)} · automático</span></span>
                        <b className="tabular-nums shrink-0" style={{ color: C.rojo }}>−{$(x.valor)}</b>
                      </div>
                    ))}
                  </div>
                </Tarjeta>
              )
            })}
          </div>
        )
      })()}
    </div>
  )
}
