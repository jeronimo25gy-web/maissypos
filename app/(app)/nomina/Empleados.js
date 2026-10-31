'use client'
import { useState, Fragment } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { NOMBRE_TIPO, tipoEmpleado, NIVEL_ARL, TARIFA_ARL, cortes, esCalendario } from '@/lib/nomina'
import InputDinero from '@/components/InputDinero'
import { useDestino, mostrarFila } from '@/lib/destino'
import { C, $, fechaCorta, Pill, Tarjeta, H2, Nota, Boton, campo, campoEstilo, Campo, Segmento, Tabla, td, Aviso } from '../gastos/ui'
import CampoFecha from '@/components/CampoFecha'

// Empleados de la empresa: tipo (mano de obra directa, ventas o
// administrativo), riesgo ARL, salario y vendedor ligado.
const vacio = () => ({ id: null, nombre: '', documento: '', cargo: '', salario_base: '', fecha_inicio: '', vendedor_id: '', tipo: 'admin', riesgo_arl: 1, inicio_q1: 1, inicio_q2: 16 })
// Texto del periodo de pago: "1 al 15 y 16 a fin de mes", "5 al 20 y 21 al 4".
export const textoPeriodo = (e) => { const c = cortes(e); return esCalendario(e) ? '1 al 15 y 16 a fin de mes' : `${c.q1} al ${c.q2 - 1} y ${c.q2} al ${c.q1 === 1 ? 'fin de mes' : c.q1 - 1}` }

export default function Empleados({ base, usuario, recargar }) {
  const { empleados, vendedores, p, sinRegistrar } = base
  const [form, setForm] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [verInactivos, setVerInactivos] = useState(false)
  const [resaltado, setResaltado] = useState(null)
  useDestino('empleado', (id) => { setVerInactivos(true); setResaltado(id); mostrarFila(`fila-${id}`) }, !!base)
  const esAdmin = usuario.rol === 'admin'

  const guardar = async () => {
    if (!form.nombre.trim()) { alert('Escriba el nombre.'); return }
    if (form.tipo === 'ventas' && !form.vendedor_id) { alert('Seleccione el vendedor ligado para asignar su costo a la ruta.'); return }
    const q1 = parseInt(form.inicio_q1) || 1, q2 = parseInt(form.inicio_q2) || 16
    if (q1 < 1 || q1 > 15 || q2 < 14 || q2 > 28 || q2 <= q1) { alert('Revise el periodo de pago: la primera quincena empieza entre el día 1 y el 15, y la segunda entre el 14 y el 28.'); return }
    setGuardando(true)
    const payload = {
      nombre: form.nombre.trim(), documento: form.documento.trim() || null, cargo: form.cargo.trim() || null,
      salario_base: parseFloat(form.salario_base) || 0, fecha_inicio: form.fecha_inicio || null,
      vendedor_id: form.vendedor_id || null, es_mano_obra_directa: form.tipo === 'mod', riesgo_arl: Number(form.riesgo_arl) || 1, inicio_q1: q1, inicio_q2: q2,
    }
    const { error } = form.id
      ? await supabase.from('empleados').update(payload).eq('id', form.id)
      : await supabase.from('empleados').insert({ ...payload, empresa_id: getEmpresaId() })
    setGuardando(false)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    setForm(null)
    recargar()
  }
  const cambiarActivo = async (e) => {
    if (e.activo && !confirm(`¿Desactivar a ${e.nombre}? Su historial se conserva.`)) return
    const { error } = await supabase.from('empleados').update({ activo: !e.activo }).eq('id', e.id)
    if (error) { alert('Error: ' + error.message); return }
    recargar()
  }
  const editar = (e) => setForm({ id: e.id, nombre: e.nombre, documento: e.documento || '', cargo: e.cargo || '', salario_base: String(e.salario_base || ''), fecha_inicio: e.fecha_inicio || '', vendedor_id: e.vendedor_id || '', tipo: tipoEmpleado(e), riesgo_arl: e.riesgo_arl || 1, inicio_q1: cortes(e).q1, inicio_q2: cortes(e).q2 })

  const lista = empleados.filter(e => verInactivos || e.activo)
  const bajoMinimo = empleados.filter(e => e.activo && Number(e.salario_base) > 0 && Number(e.salario_base) < p.smmlv)
  const rutaDe = (vid) => vendedores.find(v => v.id === vid)?.ruta

  return (
    <div className="flex flex-col gap-4">
      {sinRegistrar.length > 0 && esAdmin && (
        <Aviso>
          <b style={{ color: C.tinta }}>Vendedores sin registro en Nómina.</b> Regístrelos para que su salario entre al costo de su ruta.
          <span className="flex gap-2 flex-wrap mt-2">{sinRegistrar.map(v => <Boton key={v.id} tono="blanco" onClick={() => setForm({ ...vacio(), nombre: v.nombre, cargo: 'Vendedor ruta', vendedor_id: v.id, tipo: 'ventas' })}>Registrar a {v.nombre}</Boton>)}</span>
        </Aviso>
      )}
      {bajoMinimo.length > 0 && (
        <Aviso><b style={{ color: C.tinta }}>Salario por debajo del mínimo de {$(p.smmlv)}:</b> {bajoMinimo.map(e => `${e.nombre} (${$(e.salario_base)})`).join(', ')}. Revise el salario registrado o el valor del salario mínimo en Costo laboral.</Aviso>
      )}
      {form && (
        <Tarjeta>
          <H2>{form.id ? 'Editar empleado' : 'Nuevo empleado'}</H2>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <Campo etiqueta="Nombre completo"><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Cédula"><input inputMode="numeric" value={form.documento} onChange={e => setForm({ ...form, documento: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Cargo"><input value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Salario mensual"><InputDinero value={form.salario_base} onChange={e => setForm({ ...form, salario_base: e.target.value })} placeholder="$" className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Fecha de ingreso"><CampoFecha value={form.fecha_inicio} onChange={e => setForm({ ...form, fecha_inicio: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Riesgo ARL">
              <select value={form.riesgo_arl} onChange={e => setForm({ ...form, riesgo_arl: Number(e.target.value) })} className={campo} style={campoEstilo}>
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>Riesgo {NIVEL_ARL[n]} · {String(TARIFA_ARL[n]).replace('.', ',')}%</option>)}
              </select>
            </Campo>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold" style={{ color: C.gris }}>Periodo de pago</span>
            <Segmento etiqueta="Periodo de pago" opciones={[['cal', '1 al 15 y 16 a fin de mes'], ['otro', 'Otras fechas']]} valor={Number(form.inicio_q1) === 1 && Number(form.inicio_q2) === 16 && !form.otroPeriodo ? 'cal' : 'otro'}
              onCambio={v => setForm(v === 'cal' ? { ...form, inicio_q1: 1, inicio_q2: 16, otroPeriodo: false } : { ...form, inicio_q1: 5, inicio_q2: 21, otroPeriodo: true })} />
            {!(Number(form.inicio_q1) === 1 && Number(form.inicio_q2) === 16 && !form.otroPeriodo) && (
              <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <Campo etiqueta="Primera quincena empieza el día"><input inputMode="numeric" value={form.inicio_q1} onChange={e => setForm({ ...form, inicio_q1: e.target.value.replace(/\D/g, '').slice(0, 2) })} className={campo} style={campoEstilo} /></Campo>
                <Campo etiqueta="Segunda quincena empieza el día"><input inputMode="numeric" value={form.inicio_q2} onChange={e => setForm({ ...form, inicio_q2: e.target.value.replace(/\D/g, '').slice(0, 2) })} className={campo} style={campoEstilo} /></Campo>
              </div>
            )}
            <Nota>Periodos: {textoPeriodo(form)}. Cada quincena paga 15 días de salario; la comisión y las cuotas de préstamos van en la segunda.</Nota>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold" style={{ color: C.gris }}>Tipo</span>
            <Segmento etiqueta="Tipo de empleado" opciones={Object.entries(NOMBRE_TIPO)} valor={form.tipo} onCambio={v => setForm({ ...form, tipo: v })} />
          </div>
          {(form.tipo === 'ventas' || vendedores.length > 0) && (
            <Campo etiqueta="Vendedor ligado">
              <select value={form.vendedor_id} onChange={e => setForm({ ...form, vendedor_id: e.target.value })} className={campo} style={campoEstilo}>
                <option value="">Ninguno</option>
                {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}{v.ruta ? ` · ${v.ruta}` : ''}</option>)}
              </select>
            </Campo>
          )}
          <div className="flex gap-2 justify-end"><Boton onClick={() => setForm(null)}>Cancelar</Boton><Boton tono="rojo" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton></div>
        </Tarjeta>
      )}
      <Tarjeta>
        <div className="flex justify-between items-center gap-2 flex-wrap">
          <H2>Empleados · {empleados.filter(e => e.activo).length} activos</H2>
          <span className="flex gap-3 items-center flex-wrap">
            <label className="flex gap-2 items-center text-sm cursor-pointer"><input type="checkbox" checked={verInactivos} onChange={e => setVerInactivos(e.target.checked)} className="w-[18px] h-[18px]" style={{ accentColor: C.tinta }} />Incluir inactivos</label>
            {esAdmin && !form && <Boton tono="rojo" onClick={() => setForm(vacio())}>+ Empleado</Boton>}
          </span>
        </div>
        {lista.length === 0 ? <Nota>Sin empleados registrados.</Nota> : (
          <Tabla columnas={['Empleado', { t: 'Cargo', izq: true }, 'Salario', { t: 'Periodo de pago', izq: true }, { t: 'Riesgo ARL', izq: true }, 'Ingreso', { t: 'Asignado a', izq: true }, '']} min={900}>
            {['mod', 'ventas', 'admin'].map(t => {
              const g = lista.filter(e => tipoEmpleado(e) === t)
              if (!g.length) return null
              return (
                <Fragment key={t}>
                  <tr><td colSpan={8} className="text-[12px] font-extrabold uppercase tracking-wider" style={{ background: C.fondo, color: C.gris, padding: '6px 8px' }}>{NOMBRE_TIPO[t]}</td></tr>
                  {g.map(e => (
                    <tr data-fila key={e.id} id={`fila-${e.id}`} style={{ opacity: e.activo ? 1 : 0.55, background: resaltado === e.id ? C.ambarF : undefined }}>
                      <td style={td(true)}><b>{e.nombre}</b>{e.documento && <span className="block text-[12.5px]" style={{ color: C.gris }}>C.C. {e.documento}</span>}</td>
                      <td style={td(true)}>{e.cargo || '—'}</td>
                      <td style={td()}>{$(e.salario_base)}</td>
                      <td style={td(true)}>{textoPeriodo(e)}</td>
                      <td style={td(true)}>{NIVEL_ARL[e.riesgo_arl || 1]}</td>
                      <td style={td()}>{e.fecha_inicio ? fechaCorta(e.fecha_inicio) + ' ' + e.fecha_inicio.slice(0, 4) : '—'}</td>
                      <td style={td(true)}>{t === 'mod' ? 'Planta' : e.vendedor_id ? (rutaDe(e.vendedor_id) || 'Vendedor sin ruta') : 'Administración'}</td>
                      <td style={td()}>{esAdmin && <span className="flex gap-3 justify-end"><button type="button" onClick={() => editar(e)} className="text-[13px] font-bold">Editar</button><button type="button" onClick={() => cambiarActivo(e)} className="text-[13px] font-bold" style={{ color: C.gris }}>{e.activo ? 'Desactivar' : 'Activar'}</button></span>}{!e.activo && <Pill>Inactivo</Pill>}</td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </Tabla>
        )}
      </Tarjeta>
    </div>
  )
}
