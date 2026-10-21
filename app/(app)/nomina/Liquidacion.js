'use client'
import { useState, useEffect, useCallback, Fragment } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { nombreQuincena, nombreMesQ, textoRango, esCalendario, obligaciones, NOMBRE_TIPO, tipoEmpleado } from '@/lib/nomina'
import InputDinero from '@/components/InputDinero'
import { cargarDescuentos, cargarComisionPorRuta, cargarPrestamos, liquidar, rangoTodos } from './datos'
import { C, $, fechaCorta, Pill, Kpi, Kpis, Tarjeta, H2, Nota, Boton, campo, campoEstilo, Segmento, Tabla, td, Aviso } from '../gastos/ui'

// Liquidación de la quincena: salario, auxilio, horas extra y recargos,
// comisiones (segunda quincena), deducciones de ley y de la operación, y pago
// desde una cuenta de la empresa.
export default function Liquidacion({ base, usuario, periodo, setPeriodo, irA }) {
  const { empleados, p, vendedores, cuentas, sinRegistrar } = base
  const { mes, q } = periodo
  const [d, setD] = useState(null)
  const [cuotas, setCuotas] = useState({})
  const [cuentaId, setCuentaId] = useState('')
  const [abierto, setAbierto] = useState(null)
  const [pagando, setPagando] = useState(null)
  const activos = empleados.filter(e => e.activo)

  const cargar = useCallback(async () => {
    setD(null)
    const empresaId = getEmpresaId()
    const { desde, hasta } = rangoTodos(activos, mes, q)
    const [{ data: pagos }, { data: novedades }, prestamos, automaticos, comisionPorRuta] = await Promise.all([
      supabase.from('nomina_pagos').select('*').eq('empresa_id', empresaId).eq('periodo', mes),
      supabase.from('nomina_novedades').select('*').eq('empresa_id', empresaId).eq('periodo', mes),
      cargarPrestamos(),
      cargarDescuentos(activos, desde, hasta),
      q === 2 ? cargarComisionPorRuta(mes) : Promise.resolve({}),
    ])
    // Pagos de esta quincena; un pago mensual anterior cubre las dos.
    const pagado = {}
    ;(pagos || []).forEach(x => { if (x.quincena === q || x.quincena == null) pagado[x.empleado_id] = x })
    setCuotas({})
    setD({ pagado, novedades: novedades || [], prestamos, automaticos, comisionPorRuta })
  }, [mes, q, empleados]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cargar() }, [cargar])

  const ctx = d && { mes, q, p, novedades: d.novedades, automaticos: d.automaticos, comisionPorRuta: d.comisionPorRuta, vendedores, prestamos: d.prestamos, cuotasEditadas: cuotas }
  const filas = d ? activos.map(e => ({ e, l: liquidar(e, ctx), pago: d.pagado[e.id] })) : []
  const suma = (k) => filas.reduce((s, f) => s + (f.pago ? valorPagado(f.pago, k) : f.l[k]), 0)
  const pendientes = filas.filter(f => !f.pago && f.l.dias > 0)
  const hoy = obtenerFechaActual()
  // Fecha de pago: la más próxima entre los empleados pendientes.
  const fPago = (pendientes.length ? pendientes : filas).map(f => f.l.hasta).sort()[0] || `${mes}-15`
  const faltan = Math.round((new Date(fPago + 'T12:00:00') - new Date(hoy + 'T12:00:00')) / 864e5)
  const hasta90 = new Date(Date.now() + 90 * 864e5).toLocaleDateString('en-CA')
  const calendario = obligaciones(activos, p, hoy, hasta90)

  const pagar = async (e, l, silencioso) => {
    if (!cuentaId) { alert('Seleccione la cuenta desde la que se paga la nómina.'); return false }
    if (l.neto < 0) { alert(`El neto de ${e.nombre} da negativo (${$(l.neto)}). Ajuste la cuota del préstamo o los descuentos.`); return false }
    if (!silencioso && !confirm(`¿Pagar la nómina de ${e.nombre} (${textoRango(l.desde, l.hasta)}) por ${$(l.neto)}?`)) return false
    setPagando(e.id)
    const empresaId = getEmpresaId()
    const fecha = obtenerFechaActual()
    const prestamosAplicados = l.prestamos.filter(x => x.cuota > 0).map(x => ({ prestamo_id: x.id, concepto: x.concepto || 'Préstamo', cuota: x.cuota, numero: x.numeroCuota, num_cuotas: x.num_cuotas, saldo_despues: Math.max(0, x.saldo - x.cuota) }))
    const { data: pago, error } = await supabase.from('nomina_pagos').insert({
      empresa_id: empresaId, empleado_id: e.id, periodo: mes, quincena: q,
      salario_base: l.salario, auxilio_transporte: l.auxilio, horas_extra: l.horas,
      deduccion_salud: l.salud, deduccion_pension: l.pension, total_descuentos: l.otrosDescuentos,
      total_bonificaciones: l.bonificaciones, comision: l.comision, neto_a_pagar: l.neto,
      detalle_descuentos: l.deducciones.filter(x => !x.aporte).map(x => ({ tipo: x.concepto, fecha, valor: x.valor })),
      detalle: { devengos: l.devengos, deducciones: l.deducciones.map(({ concepto, valor }) => ({ concepto, valor })), prestamos: prestamosAplicados, total_devengado: l.totalDevengado, total_deducciones: l.totalDeducciones, dias: l.dias, desde: l.desde, hasta: l.hasta },
      cuenta_id: cuentaId,
    }).select().single()
    if (error) { alert('No se pudo registrar el pago: ' + error.message); setPagando(null); return false }
    const fallos = []
    for (const x of prestamosAplicados) {
      const { error: ea } = await supabase.from('nomina_prestamos_abonos').insert({ empresa_id: empresaId, prestamo_id: x.prestamo_id, periodo: mes, fecha, valor: x.cuota, origen: 'nomina', nomina_pago_id: pago.id, registrado_por: usuario.nombre })
      if (ea) fallos.push('abono de préstamo')
      else if (x.saldo_despues <= 0.5) await supabase.from('nomina_prestamos').update({ estado: 'pagado' }).eq('id', x.prestamo_id)
    }
    const transf = l.deducciones.filter(x => x.transferenciaId).map(x => x.transferenciaId)
    if (transf.length) {
      const { error: et } = await supabase.from('transferencias_ruta').update({ estado: 'descontada', nomina_pago_id: pago.id }).in('id', transf).eq('estado', 'por_verificar')
      if (et) fallos.push('transferencias descontadas')
    }
    const { error: em } = await supabase.from('movimientos_tesoreria').insert({ empresa_id: empresaId, cuenta_id: cuentaId, fecha, tipo: 'salida', monto: l.neto, concepto: `Nómina ${textoRango(l.desde, l.hasta)} - ${e.nombre}`, referencia_tipo: 'nomina', referencia_id: pago.id })
    if (em) fallos.push('salida de la cuenta')
    if (fallos.length) alert(`El pago de ${e.nombre} quedó registrado, pero falló: ${fallos.join(', ')}.`)
    setPagando(null)
    return true
  }
  const pagarTodos = async () => {
    if (!cuentaId) { alert('Seleccione la cuenta desde la que se paga la nómina.'); return }
    const total = pendientes.reduce((s, f) => s + f.l.neto, 0)
    if (!confirm(`¿Pagar la nómina de ${pendientes.length} empleados (${nombreMesQ(mes, q).toLowerCase()}) por ${$(total)}?`)) return
    for (const f of pendientes) { const ok = await pagar(f.e, f.l, true); if (!ok) break }
    cargar()
  }

  const mesesOpc = (() => { const out = []; const [y, m] = hoy.slice(0, 7).split('-').map(Number); for (let i = 0; i < 4; i++) { const d = new Date(y, m - 1 - i, 1); out.push(d.toLocaleDateString('en-CA').slice(0, 7)) } return out })()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 flex-wrap items-center">
        <select value={mes} onChange={e => setPeriodo({ mes: e.target.value, q })} aria-label="Mes" className="h-10 rounded-xl px-3 text-sm font-bold bg-white" style={campoEstilo}>
          {mesesOpc.map(m => <option key={m} value={m}>{nombreQuincena(m).replace(/^\w/, c => c.toUpperCase())}</option>)}
        </select>
        <Segmento etiqueta="Quincena" opciones={[[1, 'Primera quincena'], [2, 'Segunda quincena']]} valor={q} onCambio={v => setPeriodo({ mes, q: v })} />
      </div>
      {!d ? <Nota>Calculando la nómina…</Nota> : (<>
        <Kpis>
          <Kpi rotulo="Nómina de la quincena" valor={$(filas.reduce((s, f) => s + (f.pago ? Number(f.pago.neto_a_pagar) : f.l.neto), 0))} nota={`${nombreMesQ(mes, q)} · ${activos.length} empleados`} />
          {q === 2
            ? <Kpi rotulo="Comisiones" valor={$(suma('comision'))} nota="Según cumplimiento de metas" />
            : <Kpi rotulo="Auxilio de transporte" valor={$(suma('auxilio'))} nota="Salarios hasta 2 mínimos" />}
          <Kpi rotulo="Deducciones" valor={$(filas.reduce((s, f) => s + (f.pago ? Number(f.pago.deduccion_salud) + Number(f.pago.deduccion_pension) + Number(f.pago.total_descuentos) : f.l.totalDeducciones), 0))} nota="Salud, pensión y descuentos" />
          <Kpi rotulo={pendientes.length ? 'Fecha de pago' : 'Estado'} valor={pendientes.length ? fechaCorta(fPago) : 'Pagada'} rojo={pendientes.length > 0 && faltan < 0}
            nota={pendientes.length ? (faltan > 0 ? `Faltan ${faltan} días` : faltan === 0 ? 'Hoy' : `Vencida hace ${-faltan} días`) : 'Todos los empleados pagados'} />
        </Kpis>
        {sinRegistrar.length > 0 && (
          <Aviso><b style={{ color: C.tinta }}>{sinRegistrar.length === 1 ? '1 vendedor sin registro en Nómina:' : `${sinRegistrar.length} vendedores sin registro en Nómina:`}</b> {sinRegistrar.map(v => v.nombre + (v.ruta ? ` (${v.ruta})` : '')).join(', ')}. Sin ellos, Costos no incluye su salario en el costo de distribución de su ruta. <button type="button" onClick={() => irA('empleados')} className="font-bold underline" style={{ color: C.tinta }}>Registrar en Empleados</button></Aviso>
        )}
        <Tarjeta>
          <div className="flex justify-between items-center gap-2 flex-wrap">
            <H2>Liquidación · {nombreMesQ(mes, q).toLowerCase()}</H2>
            {pendientes.length > 0 && usuario.rol === 'admin' && (
              <span className="flex gap-2 flex-wrap">
                <select value={cuentaId} onChange={e => setCuentaId(e.target.value)} aria-label="Cuenta de pago" className="h-[42px] rounded-xl px-3 text-sm font-bold bg-white" style={campoEstilo}>
                  <option value="">Pagar desde…</option>
                  {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <Boton tono="rojo" onClick={pagarTodos} disabled={!!pagando}>{pagando ? 'Pagando…' : `Pagar ${pendientes.length === 1 ? '' : 'a todos '}${$(pendientes.reduce((s, f) => s + f.l.neto, 0))}`}</Boton>
              </span>
            )}
          </div>
          {filas.length === 0 ? <Nota>Sin empleados activos. Regístrelos en Empleados.</Nota> : (
            <Tabla columnas={['Empleado', 'Salario', 'Aux. transporte', 'Comisión', 'Horas extra y recargos', 'Salud y pensión', 'Otras deducciones', 'Neto a pagar']} min={900}>
              {['mod', 'ventas', 'admin'].map(t => {
                const grupo = filas.filter(f => tipoEmpleado(f.e) === t)
                if (!grupo.length) return null
                return (
                  <Fragment key={t}>
                    <tr><td colSpan={8} className="text-[12px] font-extrabold uppercase tracking-wider" style={{ background: C.fondo, color: C.gris, padding: '6px 8px' }}>{NOMBRE_TIPO[t]}</td></tr>
                    {grupo.map(({ e, l, pago }) => {
                      const v = (k) => pago ? valorPagado(pago, k) : l[k]
                      return (
                        <Fragment key={e.id}>
                          <tr onClick={() => setAbierto(abierto === e.id ? null : e.id)} className="cursor-pointer" style={abierto === e.id ? { background: C.fondo } : {}}>
                            <td style={td(true)}><b>{e.nombre}</b><span className="block text-[12.5px]" style={{ color: C.gris }}>{e.cargo || 'Sin cargo'}{!esCalendario(e) ? ` · ${textoRango(l.desde, l.hasta)}` : ''}{!pago && l.dias < 15 ? ` · ${l.dias} días` : ''}</span></td>
                            <td style={td()}>{$(v('salario'))}</td>
                            <td style={td()}>{v('auxilio') ? $(v('auxilio')) : '—'}</td>
                            <td style={td()}>{v('comision') ? $(v('comision')) : '—'}</td>
                            <td style={td()}>{v('horas') ? $(v('horas')) : '—'}</td>
                            <td style={td()}>{$(-(v('salud') + v('pension')))}</td>
                            <td style={td()}>{v('otrosDescuentos') ? $(-v('otrosDescuentos')) : '—'}</td>
                            <td style={td()}><b>{$(pago ? Number(pago.neto_a_pagar) : l.neto)}</b><span className="block mt-1">{pago ? <Pill tono="verde">Pagada {fechaCorta(pago.fecha_pago)}</Pill> : l.neto < 0 ? <Pill tono="rojo">Neto negativo</Pill> : <Pill tono="ambar">Pendiente</Pill>}</span></td>
                          </tr>
                          {abierto === e.id && (
                            <tr><td colSpan={8} style={{ padding: 12, background: C.fondo, borderBottom: `1px solid ${C.linea}` }}>
                              <Detalle l={pago ? null : l} pago={pago} cuotas={cuotas} setCuotas={setCuotas}
                                pagar={usuario.rol === 'admin' && !pago ? async () => { if (await pagar(e, l)) cargar() } : null} pagando={pagando === e.id} />
                            </td></tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </Fragment>
                )
              })}
              <tr>{['Total', $(suma('salario')), $(suma('auxilio')), $(suma('comision')), $(suma('horas')), $(-(suma('salud') + suma('pension'))), $(-suma('otrosDescuentos')), $(filas.reduce((s, f) => s + (f.pago ? Number(f.pago.neto_a_pagar) : f.l.neto), 0))].map((x, i) => <td key={i} style={{ ...td(i === 0), fontWeight: 800, borderBottom: 0, borderTop: `1.5px solid ${C.tinta}` }}>{x}</td>)}</tr>
            </Tabla>
          )}
          <Nota>{q === 2 ? 'Segunda quincena: incluye la comisión del mes según los tramos de Finanzas → Metas y las cuotas de préstamos.' : 'Primera quincena: salario, auxilio y novedades del periodo. Las comisiones y cuotas de préstamos se liquidan en la segunda quincena.'} Cada empleado se liquida con su periodo de pago (Empleados). Toque un empleado para ver el detalle.</Nota>
        </Tarjeta>
        <Tarjeta>
          <H2>Calendario de obligaciones</H2>
          {calendario.length === 0 ? <Nota>Sin obligaciones en los próximos 90 días.</Nota> : calendario.map((o, i) => {
            const dd = Math.round((new Date(o.fecha + 'T12:00:00') - new Date(hoy + 'T12:00:00')) / 864e5)
            return (
              <div key={i} className="grid gap-2.5 items-center pt-2.5" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', borderTop: i ? `1px solid ${C.linea}` : 0 }}>
                <span className="min-w-0"><b>{o.titulo}</b><span className="block text-[13px]" style={{ color: C.gris }}>{o.detalle}</span></span>
                <span className="text-right flex flex-col items-end gap-1"><b className="tabular-nums">{$(o.valor)}</b><Pill tono={dd <= 0 ? 'rojo' : dd <= 7 ? 'ambar' : 'gris'}>{dd === 0 ? 'Hoy' : fechaCorta(o.fecha)}</Pill></span>
              </div>
            )
          })}
          <Nota>Valores estimados con los salarios actuales. Aparecen en Finanzas de esta empresa antes de su vencimiento.</Nota>
        </Tarjeta>
      </>)}
    </div>
  )
}

// Valores de un pago ya registrado con los mismos nombres que la liquidación.
function valorPagado(pago, k) {
  const n = (x) => Number(x || 0)
  return { salario: n(pago.salario_base), auxilio: n(pago.auxilio_transporte), comision: n(pago.comision), horas: n(pago.horas_extra), salud: n(pago.deduccion_salud), pension: n(pago.deduccion_pension), otrosDescuentos: n(pago.total_descuentos), neto: n(pago.neto_a_pagar) }[k] || 0
}

function Detalle({ l, pago, cuotas, setCuotas, pagar, pagando }) {
  const det = l || pago?.detalle || {}
  const devengos = det.devengos || [], deducciones = det.deducciones || []
  const Col = ({ titulo: t, lista, signo, total }) => (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[12px] font-extrabold uppercase tracking-wider" style={{ color: C.gris }}>{t}</span>
      {lista.map((x, i) => <div key={i} className="flex justify-between gap-3 text-sm"><span className="min-w-0">{x.concepto}</span><b className="tabular-nums shrink-0">{signo}{$(x.valor)}</b></div>)}
      <div className="flex justify-between gap-3 text-sm pt-1" style={{ borderTop: `1.5px solid ${C.tinta}` }}><b>Total</b><b className="tabular-nums">{signo}{$(total)}</b></div>
    </div>
  )
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <Col titulo="Devengado" lista={devengos} signo="" total={det.totalDevengado ?? det.total_devengado ?? 0} />
        <Col titulo="Deducciones" lista={deducciones} signo="−" total={det.totalDeducciones ?? det.total_deducciones ?? 0} />
      </div>
      {l?.prestamos?.length > 0 && (
        <div className="flex flex-col gap-2">
          {l.prestamos.map(x => (
            <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="min-w-0">Préstamo{x.concepto ? ` ${x.concepto}` : ''} · saldo {$(x.saldo)} · cuota de este mes</span>
              <InputDinero value={cuotas[x.id] ?? String(x.sugerida)} onChange={ev => setCuotas({ ...cuotas, [x.id]: ev.target.value })} className={campo} style={{ ...campoEstilo, width: 140 }} />
            </div>
          ))}
          <Nota>Escriba 0 si este mes no se descuenta la cuota.</Nota>
        </div>
      )}
      {pagar && <div className="flex justify-end"><Boton tono="rojo" onClick={pagar} disabled={pagando}>{pagando ? 'Pagando…' : `Pagar ${$(l.neto)}`}</Boton></div>}
    </div>
  )
}

