'use client'
import { useState, useEffect, useCallback } from 'react'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { TIPOS_OBLIGACION, cargarObligaciones, crearObligacion, registrarPagoObligacion, proximaCuota, interesSugerido } from '@/lib/obligaciones'
import CampoFecha from '@/components/CampoFecha'
import InputDinero from '@/components/InputDinero'
import { C, $, fechaCorta, Pill, Kpi, Kpis, Tarjeta, H2, Nota, Boton, campo, campoEstilo, Campo } from '../gastos/ui'

// Obligaciones financieras por empresa: saldo, cuota, próxima fecha y pagos con
// capital e intereses separados.
const vacia = (hoy) => ({ tipo: 'credito', entidad: '', descripcion: '', saldo_inicial: '', tasa_mensual: '', cuota: '', plazo_meses: '', fecha_inicio: hoy, dia_pago: '', cuentaId: '' })
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0 }

export default function Obligaciones({ caja, usuario, recargar }) {
  const hoy = obtenerFechaActual()
  const [lista, setLista] = useState(null)
  const [form, setForm] = useState(null)
  const [pago, setPago] = useState(null)
  const [abierta, setAbierta] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const cuentas = caja?.cuentas || []

  const cargar = useCallback(async () => { setLista(await cargarObligaciones()) }, [])
  useEffect(() => { cargar() }, [cargar])
  if (!lista) return <Nota>Cargando…</Nota>

  const activas = lista.filter(o => o.estado === 'activa')
  const deuda = activas.reduce((s, o) => s + o.saldo, 0)
  const cuotasMes = activas.reduce((s, o) => s + Number(o.cuota || 0), 0)
  const interesesMes = lista.flatMap(o => o.pagos).filter(p => p.fecha.slice(0, 7) === hoy.slice(0, 7)).reduce((s, p) => s + Number(p.intereses || 0), 0)
  const proximas = activas.map(o => ({ o, f: proximaCuota(o, hoy) })).filter(x => x.f).sort((a, b) => a.f.localeCompare(b.f))
  const siguiente = proximas[0]

  const guardar = async () => {
    const saldo = num(form.saldo_inicial)
    if (!form.entidad.trim() || !(saldo > 0)) { alert('Escriba la entidad y el saldo.'); return }
    setGuardando(true)
    try {
      const { cuentaId, ...d } = form
      await crearObligacion({ ...d, entidad: d.entidad.trim(), descripcion: d.descripcion.trim() || null, saldo_inicial: saldo, tasa_mensual: num(d.tasa_mensual), cuota: num(d.cuota), plazo_meses: num(d.plazo_meses) || null, dia_pago: num(d.dia_pago) || null }, { cuentaId, usuario: usuario.nombre })
      setForm(null)
      await cargar()
      recargar()
    } catch (e) { alert(e.message) }
    setGuardando(false)
  }
  const abrirPago = (o) => { const intereses = interesSugerido(o); const total = Number(o.cuota) || o.saldo + intereses; setPago({ o, fecha: hoy, capital: String(Math.max(0, Math.min(total - intereses, o.saldo))), intereses: String(intereses), cuentaId: '' }) }
  const pagar = async () => {
    const capital = num(pago.capital), intereses = num(pago.intereses)
    if (capital + intereses <= 0) { alert('Escriba el valor del pago.'); return }
    if (capital > pago.o.saldo + 0.5) { alert(`El capital no puede superar el saldo de ${$(pago.o.saldo)}.`); return }
    setGuardando(true)
    try {
      await registrarPagoObligacion(pago.o, { fecha: pago.fecha, capital, intereses, cuentaId: pago.cuentaId, usuario: usuario.nombre })
      setPago(null)
      await cargar()
      recargar()
    } catch (e) { alert(e.message); await cargar() }
    setGuardando(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <Kpis>
        <Kpi rotulo="Deuda total" valor={$(deuda)} nota={`${activas.length} ${activas.length === 1 ? 'obligación' : 'obligaciones'}`} />
        <Kpi rotulo="Cuotas al mes" valor={$(cuotasMes)} />
        <Kpi rotulo="Intereses este mes" valor={$(interesesMes)} />
        <Kpi rotulo="Próximo pago" valor={siguiente ? fechaCorta(siguiente.f) : '—'} rojo={!!siguiente && siguiente.f < hoy} nota={siguiente?.o.entidad} />
      </Kpis>

      {form && (
        <Tarjeta>
          <H2>Nueva obligación</H2>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            <Campo etiqueta="Tipo"><select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} className={campo} style={campoEstilo}>{Object.entries(TIPOS_OBLIGACION).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></Campo>
            <Campo etiqueta="Entidad"><input value={form.entidad} onChange={e => setForm({ ...form, entidad: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Descripción"><input value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Saldo actual"><InputDinero value={form.saldo_inicial} onChange={e => setForm({ ...form, saldo_inicial: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Tasa mensual %"><input inputMode="decimal" value={form.tasa_mensual} onChange={e => setForm({ ...form, tasa_mensual: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Cuota mensual"><InputDinero value={form.cuota} onChange={e => setForm({ ...form, cuota: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Plazo en meses"><input inputMode="numeric" value={form.plazo_meses} onChange={e => setForm({ ...form, plazo_meses: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Fecha de inicio"><CampoFecha value={form.fecha_inicio} onChange={e => setForm({ ...form, fecha_inicio: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Día de pago"><input inputMode="numeric" value={form.dia_pago} onChange={e => setForm({ ...form, dia_pago: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Dinero recibido en"><select value={form.cuentaId} onChange={e => setForm({ ...form, cuentaId: e.target.value })} className={campo} style={campoEstilo}><option value="">No entró a una cuenta</option>{cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
          </div>
          <div className="flex gap-2 justify-end">
            <Boton tono="blanco" onClick={() => setForm(null)}>Cancelar</Boton>
            <Boton tono="rojo" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar obligación'}</Boton>
          </div>
        </Tarjeta>
      )}

      <Tarjeta>
        <div className="flex justify-between gap-2 items-center flex-wrap">
          <H2>Obligaciones</H2>
          {!form && <Boton tono="rojo" onClick={() => setForm(vacia(hoy))}>+ Obligación</Boton>}
        </div>
        {lista.length === 0 && <Nota>Sin obligaciones registradas</Nota>}
        {lista.map((o, n) => {
          const f = proximaCuota(o, hoy)
          const pct = Number(o.saldo_inicial) ? Math.min(100, o.capitalPagado / Number(o.saldo_inicial) * 100) : 0
          return (
            <div key={o.id} className="flex flex-col gap-2 py-3" style={{ borderTop: n ? `1px solid ${C.linea}` : 0 }}>
              <div className="flex justify-between gap-3 flex-wrap items-start">
                <span className="min-w-0">
                  <b className="block text-[17px]">{o.entidad}</b>
                  <span className="block text-[13.5px]" style={{ color: C.gris }}>{TIPOS_OBLIGACION[o.tipo]}{o.descripcion ? ` · ${o.descripcion}` : ''}{Number(o.tasa_mensual) ? ` · ${String(o.tasa_mensual).replace('.', ',')} % mensual` : ''}{Number(o.cuota) ? ` · Cuota ${$(o.cuota)}` : ''}</span>
                </span>
                <span className="text-right">
                  <b className="block text-[20px] tabular-nums">{$(o.saldo)}</b>
                  {o.estado === 'pagada' ? <Pill tono="verde">Pagada</Pill> : f ? <Pill tono={f < hoy ? 'rojo' : f.slice(0, 7) === hoy.slice(0, 7) ? 'ambar' : 'gris'}>{f < hoy ? 'Vencida' : 'Vence'} {fechaCorta(f)}</Pill> : null}
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: C.suave }}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--acento)' }} /></div>
              {pago?.o.id === o.id ? (
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                  <Campo etiqueta="Capital"><InputDinero value={pago.capital} onChange={e => setPago({ ...pago, capital: e.target.value })} className={campo} style={campoEstilo} /></Campo>
                  <Campo etiqueta="Intereses"><InputDinero value={pago.intereses} onChange={e => setPago({ ...pago, intereses: e.target.value })} className={campo} style={campoEstilo} /></Campo>
                  <Campo etiqueta="Fecha"><CampoFecha value={pago.fecha} onChange={e => setPago({ ...pago, fecha: e.target.value })} className={campo} style={campoEstilo} /></Campo>
                  <Campo etiqueta="Cuenta"><select value={pago.cuentaId} onChange={e => setPago({ ...pago, cuentaId: e.target.value })} className={campo} style={campoEstilo}><option value="">Sin cuenta</option>{cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
                  <div className="flex gap-2 items-end"><Boton tono="blanco" onClick={() => setPago(null)}>Cancelar</Boton><Boton tono="rojo" onClick={pagar} disabled={guardando}>{`Pagar ${$(num(pago.capital) + num(pago.intereses))}`}</Boton></div>
                </div>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  {o.estado === 'activa' && <Boton onClick={() => abrirPago(o)}>Registrar pago</Boton>}
                  {o.pagos.length > 0 && <Boton onClick={() => setAbierta(abierta === o.id ? null : o.id)}>{o.pagos.length} {o.pagos.length === 1 ? 'pago' : 'pagos'}</Boton>}
                </div>
              )}
              {abierta === o.id && o.pagos.map(p => (
                <div key={p.id} className="flex justify-between gap-3 flex-wrap text-[13.5px] py-1" style={{ borderTop: `1px solid ${C.linea}` }}>
                  <span>{fechaCorta(p.fecha)}</span>
                  <span style={{ color: C.gris }}>Capital <b className="tabular-nums" style={{ color: C.tinta }}>{$(p.capital)}</b> · Intereses <b className="tabular-nums" style={{ color: C.tinta }}>{$(p.intereses)}</b></span>
                </div>
              ))}
            </div>
          )
        })}
      </Tarjeta>
    </div>
  )
}
