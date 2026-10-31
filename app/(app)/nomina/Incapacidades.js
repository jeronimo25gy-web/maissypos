'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { TIPOS_INCAPACIDAD, calcularIncapacidad, diasEntre, diasPrevios, guardarParametrosParte } from '@/lib/nomina'
import { subirSoporte, verSoporte } from '@/lib/soportes'
import CampoFecha from '@/components/CampoFecha'
import InputDinero from '@/components/InputDinero'
import { C, $, fechaCorta, Pill, Kpi, Kpis, Tarjeta, H2, Nota, Boton, campo, campoEstilo, Campo, Segmento } from '../gastos/ui'

// Incapacidades y licencias: se registran con su soporte, la Liquidación las
// paga según su tipo, y lo que debe devolver la EPS o ARL queda por cobrar.
const vacia = (hoy) => ({ empleado_id: '', tipo: 'general', desde: hoy, hasta: hoy, prorroga_de: '', entidad: '', numero: '', foto: null })
const PORCENTAJES = [['incap_empresa_dias', 'Días que paga la empresa'], ['incap_empresa_pct', '% de esos días'], ['incap_eps_pct', '% EPS hasta el día 90'], ['incap_eps_pct_91', '% EPS desde el día 91'], ['incap_laboral_pct', '% ARL'], ['incap_licencia_pct', '% licencias']]
const SI_NO = [[true, 'Sí'], [false, 'No']]

export default function Incapacidades({ base, usuario, recargar }) {
  const { empleados, p, cuentas } = base
  const hoy = obtenerFechaActual()
  const activos = empleados.filter(e => e.activo)
  const [lista, setLista] = useState(null)
  const [form, setForm] = useState(null)
  const [cobro, setCobro] = useState(null)
  const [ajustes, setAjustes] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('nomina_incapacidades').select('*').eq('empresa_id', getEmpresaId()).order('desde', { ascending: false })
    setLista(data || [])
  }, [])
  useEffect(() => { cargar() }, [cargar])
  if (!lista) return <Nota>Cargando…</Nota>

  const vigentes = lista.filter(i => !i.anulada)
  const nombre = (id) => empleados.find(e => e.id === id)?.nombre || 'Empleado'
  const porCobrar = (i) => Math.max(0, Number(i.valor_recobro || 0) - Number(i.cobrado || 0))
  const hoyIncapacitados = vigentes.filter(i => i.desde <= hoy && i.hasta >= hoy).length
  const totalPorCobrar = vigentes.reduce((s, i) => s + porCobrar(i), 0)
  const diasMes = vigentes.filter(i => i.desde.slice(0, 7) === hoy.slice(0, 7)).reduce((s, i) => s + diasEntre(i.desde, i.hasta), 0)

  const emp = form && empleados.find(e => e.id === form.empleado_id)
  const estimado = form && emp && form.desde && form.hasta && form.hasta >= form.desde
    ? calcularIncapacidad(form, { previos: diasPrevios(form, lista), salarioMes: emp.salario_base, p }) : null
  const anteriores = form ? vigentes.filter(i => i.empleado_id === form.empleado_id && i.tipo === form.tipo) : []
  const paga = form ? TIPOS_INCAPACIDAD[form.tipo].paga : ''

  const guardar = async () => {
    if (!form.empleado_id || !form.desde || !form.hasta) { alert('Seleccione el empleado y las fechas.'); return }
    if (form.hasta < form.desde) { alert('La fecha final no puede ser anterior a la inicial.'); return }
    if (vigentes.some(i => i.empleado_id === form.empleado_id && i.desde <= form.hasta && i.hasta >= form.desde)) { alert('Ese empleado ya tiene una incapacidad en esas fechas.'); return }
    setGuardando(true)
    try {
      const soporte_url = form.foto ? await subirSoporte(form.foto, 'incapacidades') : null
      const { foto: _foto, ...datos } = form
      const { error } = await supabase.from('nomina_incapacidades').insert({ ...datos, prorroga_de: form.prorroga_de || null, entidad: form.entidad.trim() || null, numero: form.numero.trim() || null, soporte_url, empresa_id: getEmpresaId(), registrado_por: usuario.nombre })
      if (error) throw new Error(error.message)
      setForm(null)
      cargar()
    } catch (e) { alert('No se pudo guardar: ' + e.message) }
    setGuardando(false)
  }
  const anular = async (i) => {
    if (!confirm(`¿Anular la incapacidad de ${nombre(i.empleado_id)}?`)) return
    const { error } = await supabase.from('nomina_incapacidades').update({ anulada: true }).eq('id', i.id)
    if (error) { alert('No se pudo anular: ' + error.message); return }
    cargar()
  }
  const cobrar = async () => {
    const valor = parseFloat(cobro.valor)
    if (!(valor > 0) || valor > porCobrar(cobro.i) + 0.5) { alert('Revise el valor recibido.'); return }
    setGuardando(true)
    const { i } = cobro
    const { error } = await supabase.from('nomina_incapacidades').update({ cobrado: Number(i.cobrado || 0) + valor, cobrado_fecha: cobro.fecha }).eq('id', i.id)
    if (!error && cobro.cuentaId) {
      const { error: e2 } = await supabase.from('movimientos_tesoreria').insert({ empresa_id: getEmpresaId(), cuenta_id: cobro.cuentaId, fecha: cobro.fecha, tipo: 'entrada', monto: valor, concepto: `Incapacidad ${nombre(i.empleado_id)}${i.entidad ? ' · ' + i.entidad : ''}`, referencia_tipo: 'incapacidad', referencia_id: i.id })
      if (e2) alert('El cobro quedó registrado, pero falló la entrada a la cuenta.')
    }
    setGuardando(false)
    if (error) { alert('No se pudo registrar: ' + error.message); return }
    setCobro(null)
    cargar()
  }
  const guardarAjustes = async () => {
    const parte = { incap_minimo: ajustes.incap_minimo, incap_adelanta: ajustes.incap_adelanta }
    for (const [k] of PORCENTAJES) {
      const n = parseFloat(String(ajustes[k]).replace(',', '.'))
      if (!(n >= 0)) { alert('Revise los porcentajes.'); return }
      parte[k] = n
    }
    setGuardando(true)
    try { await guardarParametrosParte(getEmpresaId(), parte); setAjustes(null); await recargar() } catch (e) { alert('No se pudo guardar: ' + e.message) }
    setGuardando(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <Kpis>
        <Kpi rotulo="Incapacitados hoy" valor={hoyIncapacitados} />
        <Kpi rotulo="Por cobrar a EPS y ARL" valor={$(totalPorCobrar)} />
        <Kpi rotulo="Días este mes" valor={diasMes} />
      </Kpis>

      {form && (
        <Tarjeta>
          <H2>Nueva incapacidad</H2>
          <Segmento etiqueta="Tipo" opciones={Object.entries(TIPOS_INCAPACIDAD).map(([k, t]) => [k, t.nombre])} valor={form.tipo} onCambio={v => setForm({ ...form, tipo: v, prorroga_de: '' })} />
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            <Campo etiqueta="Empleado"><select value={form.empleado_id} onChange={e => setForm({ ...form, empleado_id: e.target.value, prorroga_de: '' })} className={campo} style={campoEstilo}><option value="">Seleccionar</option>{activos.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></Campo>
            <Campo etiqueta="Desde"><CampoFecha value={form.desde} onChange={e => setForm({ ...form, desde: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Hasta"><CampoFecha value={form.hasta} onChange={e => setForm({ ...form, hasta: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            {anteriores.length > 0 && <Campo etiqueta="Prórroga de"><select value={form.prorroga_de} onChange={e => setForm({ ...form, prorroga_de: e.target.value })} className={campo} style={campoEstilo}><option value="">No es prórroga</option>{anteriores.map(i => <option key={i.id} value={i.id}>{fechaCorta(i.desde)} a {fechaCorta(i.hasta)}</option>)}</select></Campo>}
            <Campo etiqueta={paga}><input value={form.entidad} onChange={e => setForm({ ...form, entidad: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Número de incapacidad"><input value={form.numero} onChange={e => setForm({ ...form, numero: e.target.value })} className={campo} style={campoEstilo} /></Campo>
          </div>
          <label className="rounded-xl min-h-[44px] px-3 text-sm font-bold flex items-center cursor-pointer self-start" style={{ background: C.suave }}>
            {form.foto ? 'Soporte adjunto' : 'Adjuntar soporte'}
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={e => setForm({ ...form, foto: e.target.files?.[0] || null })} />
          </label>
          {estimado && (
            <div className="flex gap-5 flex-wrap text-sm">
              <span><b>{estimado.dias}</b> {estimado.dias === 1 ? 'día' : 'días'}</span>
              <span>Empresa <b className="tabular-nums">{$(estimado.empresa)}</b></span>
              {p.incap_adelanta && <span>{paga} <b className="tabular-nums">{$(estimado.recobro)}</b></span>}
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Boton tono="blanco" onClick={() => setForm(null)}>Cancelar</Boton>
            <Boton tono="rojo" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar incapacidad'}</Boton>
          </div>
        </Tarjeta>
      )}

      <Tarjeta>
        <div className="flex justify-between gap-2 items-center flex-wrap">
          <H2>Incapacidades</H2>
          {!form && <Boton tono="rojo" onClick={() => setForm(vacia(hoy))}>+ Incapacidad</Boton>}
        </div>
        {vigentes.length === 0 && <Nota>Sin incapacidades registradas</Nota>}
        {vigentes.map((i, n) => {
          const pendiente = porCobrar(i)
          const estado = i.desde <= hoy && i.hasta >= hoy ? ['ambar', 'En curso'] : i.desde > hoy ? ['gris', 'Programada'] : ['gris', 'Terminada']
          return (
            <div key={i.id} data-fila className="flex flex-col gap-2 py-2.5" style={{ borderTop: n ? `1px solid ${C.linea}` : 0 }}>
              <div className="flex justify-between gap-3 flex-wrap items-start">
                <span className="min-w-0">
                  <b className="block text-[16px]">{nombre(i.empleado_id)}</b>
                  <span className="block text-[13.5px]" style={{ color: C.gris }}>{TIPOS_INCAPACIDAD[i.tipo].nombre}{i.prorroga_de ? ' · Prórroga' : ''} · {fechaCorta(i.desde)} a {fechaCorta(i.hasta)} · {diasEntre(i.desde, i.hasta)} días{i.entidad ? ` · ${i.entidad}` : ''}</span>
                </span>
                <span className="flex gap-1.5 flex-wrap items-center">
                  <Pill tono={estado[0]}>{estado[1]}</Pill>
                  {pendiente > 0 ? <Pill tono="ambar">Por cobrar {$(pendiente)}</Pill> : Number(i.cobrado) > 0 ? <Pill tono="verde">Cobrada</Pill> : null}
                </span>
              </div>
              {cobro?.i.id === i.id ? (
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                  <Campo etiqueta="Valor recibido"><InputDinero value={cobro.valor} onChange={e => setCobro({ ...cobro, valor: e.target.value })} className={campo} style={campoEstilo} /></Campo>
                  <Campo etiqueta="Fecha"><CampoFecha value={cobro.fecha} onChange={e => setCobro({ ...cobro, fecha: e.target.value })} className={campo} style={campoEstilo} /></Campo>
                  <Campo etiqueta="Cuenta"><select value={cobro.cuentaId} onChange={e => setCobro({ ...cobro, cuentaId: e.target.value })} className={campo} style={campoEstilo}><option value="">Sin cuenta</option>{cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
                  <div className="flex gap-2 items-end"><Boton tono="blanco" onClick={() => setCobro(null)}>Cancelar</Boton><Boton tono="rojo" onClick={cobrar} disabled={guardando}>Registrar</Boton></div>
                </div>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  {pendiente > 0 && <Boton onClick={() => setCobro({ i, valor: String(pendiente), fecha: hoy, cuentaId: '' })}>Registrar cobro</Boton>}
                  {i.soporte_url && <Boton onClick={async () => { const url = await verSoporte(i.soporte_url); if (url) window.open(url, '_blank'); else alert('No se pudo abrir el soporte.') }}>Ver soporte</Boton>}
                  {!Number(i.valor_recobro) && <Boton onClick={() => anular(i)}>Anular</Boton>}
                </div>
              )}
            </div>
          )
        })}
      </Tarjeta>

      <Tarjeta>
        <div className="flex justify-between gap-2 items-center flex-wrap">
          <H2>Porcentajes</H2>
          {!ajustes && <Boton onClick={() => setAjustes(Object.fromEntries([...PORCENTAJES.map(([k]) => [k, p[k]]), ['incap_minimo', p.incap_minimo], ['incap_adelanta', p.incap_adelanta]]))}>Editar</Boton>}
        </div>
        {!ajustes ? (
          <div className="flex gap-x-6 gap-y-1.5 flex-wrap text-sm">
            {PORCENTAJES.map(([k, n]) => <span key={k}>{n}: <b className="tabular-nums">{String(p[k]).replace('.', ',')}</b></span>)}
            <span>Mínimo diario: <b>{p.incap_minimo ? 'Sí' : 'No'}</b></span>
            <span>La empresa adelanta: <b>{p.incap_adelanta ? 'Sí' : 'No'}</b></span>
          </div>
        ) : (
          <>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
              {PORCENTAJES.map(([k, n]) => <Campo key={k} etiqueta={n}><input inputMode="decimal" value={ajustes[k]} onChange={e => setAjustes({ ...ajustes, [k]: e.target.value })} className={campo} style={campoEstilo} /></Campo>)}
            </div>
            <div className="flex gap-5 flex-wrap">
              <Campo etiqueta="Mínimo diario"><Segmento etiqueta="Mínimo diario" opciones={SI_NO} valor={ajustes.incap_minimo} onCambio={v => setAjustes({ ...ajustes, incap_minimo: v })} /></Campo>
              <Campo etiqueta="La empresa adelanta el pago"><Segmento etiqueta="La empresa adelanta" opciones={SI_NO} valor={ajustes.incap_adelanta} onCambio={v => setAjustes({ ...ajustes, incap_adelanta: v })} /></Campo>
            </div>
            <div className="flex gap-2 justify-end">
              <Boton tono="blanco" onClick={() => setAjustes(null)}>Cancelar</Boton>
              <Boton tono="rojo" onClick={guardarAjustes} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar porcentajes'}</Boton>
            </div>
          </>
        )}
      </Tarjeta>
    </div>
  )
}
