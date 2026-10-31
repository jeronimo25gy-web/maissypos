'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import InputDinero from '@/components/InputDinero'
import { cargarPrestamos } from './datos'
import { C, $, fechaCorta, Pill, Kpi, Kpis, Tarjeta, H2, Nota, Boton, campo, campoEstilo, Campo } from '../gastos/ui'
import CampoFecha from '@/components/CampoFecha'

// Préstamos a empleados: cuota mensual que se descuenta en la segunda quincena.
const vacio = () => ({ empleadoId: '', fecha: obtenerFechaActual(), monto: '', numCuotas: '1', concepto: '', cuentaId: '' })
const cuotaDe = (f) => { const m = parseFloat(f.monto) || 0, k = parseInt(f.numCuotas) || 0; return m > 0 && k > 0 ? Math.ceil(m / k / 100) * 100 : 0 }

export default function Prestamos({ base, usuario }) {
  const { empleados, cuentas } = base
  const [lista, setLista] = useState(null)
  const [form, setForm] = useState(null)
  const [abono, setAbono] = useState(null)
  const [abierto, setAbierto] = useState(null)
  const [verPagados, setVerPagados] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => setLista(await cargarPrestamos()), [])
  useEffect(() => { cargar() }, [cargar])
  const nombre = (id) => empleados.find(e => e.id === id)?.nombre || 'Empleado'

  const guardar = async () => {
    const monto = parseFloat(form.monto), cuotas = parseInt(form.numCuotas)
    if (!form.empleadoId || !(monto > 0) || !(cuotas > 0)) { alert('Seleccione el empleado, el monto y el número de cuotas.'); return }
    setGuardando(true)
    const id = getEmpresaId()
    const { error } = await supabase.from('nomina_prestamos').insert({ empresa_id: id, empleado_id: form.empleadoId, fecha: form.fecha, monto, num_cuotas: cuotas, valor_cuota: cuotaDe(form), concepto: form.concepto.trim() || null, cuenta_id: form.cuentaId || null, registrado_por: usuario.nombre })
    if (error) { alert('No se pudo registrar: ' + error.message); setGuardando(false); return }
    if (form.cuentaId) {
      const { error: e2 } = await supabase.from('movimientos_tesoreria').insert({ empresa_id: id, cuenta_id: form.cuentaId, fecha: form.fecha, tipo: 'salida', monto, concepto: `Préstamo a ${nombre(form.empleadoId)}${form.concepto.trim() ? ' - ' + form.concepto.trim() : ''}`, referencia_tipo: 'prestamo_empleado', referencia_id: null })
      if (e2) alert('El préstamo quedó registrado, pero no la salida de la cuenta: ' + e2.message)
    }
    setGuardando(false); setForm(null); cargar()
  }

  const guardarAbono = async () => {
    const x = lista.find(p => p.id === abono.prestamoId), valor = parseFloat(abono.valor)
    if (!(valor > 0) || valor > x.saldo + 0.5) { alert(`El abono debe ser mayor a 0 y no superar el saldo (${$(x.saldo)}).`); return }
    setGuardando(true)
    const id = getEmpresaId(), fecha = obtenerFechaActual()
    const { error } = await supabase.from('nomina_prestamos_abonos').insert({ empresa_id: id, prestamo_id: x.id, periodo: fecha.slice(0, 7), fecha, valor, origen: 'manual', registrado_por: usuario.nombre })
    if (error) { alert('Error: ' + error.message); setGuardando(false); return }
    if (valor >= x.saldo - 0.5) await supabase.from('nomina_prestamos').update({ estado: 'pagado' }).eq('id', x.id)
    if (abono.cuentaId) await supabase.from('movimientos_tesoreria').insert({ empresa_id: id, cuenta_id: abono.cuentaId, fecha, tipo: 'entrada', monto: valor, concepto: `Abono préstamo - ${nombre(x.empleado_id)}`, referencia_tipo: 'prestamo_empleado', referencia_id: null })
    setGuardando(false); setAbono(null); cargar()
  }

  if (!lista) return <Nota>Cargando…</Nota>
  const activos = lista.filter(p => p.estado === 'activo')
  const visibles = lista.filter(p => verPagados || p.estado === 'activo')
  return (
    <div className="flex flex-col gap-4">
      <Kpis>
        <Kpi rotulo="Préstamos por cobrar" valor={$(activos.reduce((s, p) => s + p.saldo, 0))} nota={`${activos.length} ${activos.length === 1 ? 'préstamo activo' : 'préstamos activos'}`} />
        <Kpi rotulo="Cuotas del mes" valor={$(activos.reduce((s, p) => s + Math.min(Number(p.valor_cuota), p.saldo), 0))} />
      </Kpis>
      {form ? (
        <Tarjeta>
          <H2>Nuevo préstamo</H2>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <Campo etiqueta="Empleado">
              <select value={form.empleadoId} onChange={e => setForm({ ...form, empleadoId: e.target.value })} className={campo} style={campoEstilo}>
                <option value="">Seleccione</option>
                {empleados.filter(e => e.activo).map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Fecha"><CampoFecha value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Monto"><InputDinero value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} placeholder="$" className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Número de cuotas (meses)"><input inputMode="numeric" value={form.numCuotas} onChange={e => setForm({ ...form, numCuotas: e.target.value.replace(/\D/g, '') })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Concepto"><input value={form.concepto} onChange={e => setForm({ ...form, concepto: e.target.value })} placeholder="Calamidad doméstica" className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Sale de la cuenta">
              <select value={form.cuentaId} onChange={e => setForm({ ...form, cuentaId: e.target.value })} className={campo} style={campoEstilo}>
                <option value="">Sin registrar en una cuenta</option>
                {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Campo>
          </div>
          {cuotaDe(form) > 0 && <Nota>Cuota mensual: <b style={{ color: C.tinta }}>{$(cuotaDe(form))}</b>, descontada en la segunda quincena de cada mes.</Nota>}
          <div className="flex gap-2 justify-end"><Boton onClick={() => setForm(null)}>Cancelar</Boton><Boton tono="rojo" onClick={guardar} disabled={guardando}>{guardando ? 'Registrando…' : 'Registrar préstamo'}</Boton></div>
        </Tarjeta>
      ) : <div><Boton tono="rojo" onClick={() => setForm(vacio())}>+ Préstamo</Boton></div>}

      <Tarjeta>
        <div className="flex justify-between items-center gap-2 flex-wrap">
          <H2>Préstamos</H2>
          <label className="flex gap-2 items-center text-sm cursor-pointer"><input type="checkbox" checked={verPagados} onChange={e => setVerPagados(e.target.checked)} className="w-[18px] h-[18px]" style={{ accentColor: C.tinta }} />Incluir pagados</label>
        </div>
        {visibles.length === 0 ? <Nota>Sin préstamos {verPagados ? '' : 'activos'}.</Nota> : visibles.map((x, i) => (
          <div key={x.id} className="flex flex-col gap-2 pt-2.5" style={{ borderTop: i ? `1px solid ${C.linea}` : 0 }}>
            <button type="button" onClick={() => setAbierto(abierto === x.id ? null : x.id)} className="grid gap-2.5 items-center text-left" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
              <span className="min-w-0">
                <b>{nombre(x.empleado_id)}</b>
                <span className="block text-[13px]" style={{ color: C.gris }}>{$(x.monto)} el {fechaCorta(x.fecha)}{x.concepto ? ` · ${x.concepto}` : ''} · cuota {$(x.valor_cuota)} · {x.cuotasPagadas} de {x.num_cuotas}</span>
                <span className="block h-2 rounded mt-1.5 overflow-hidden" style={{ background: C.suave }}><span className="block h-full rounded" style={{ width: `${Math.min(100, x.pagado / Number(x.monto) * 100)}%`, background: C.verde }} /></span>
              </span>
              <span className="text-right">{x.estado === 'pagado' ? <Pill tono="verde">Pagado</Pill> : <><b className="tabular-nums">{$(x.saldo)}</b><span className="block text-[12px]" style={{ color: C.gris }}>saldo</span></>}</span>
            </button>
            {abierto === x.id && (
              <div className="rounded-[14px] p-3 flex flex-col gap-2" style={{ background: C.fondo }}>
                {x.abonos.length === 0 ? <Nota>Sin abonos</Nota> : x.abonos.map(a => (
                  <div key={a.id} className="flex justify-between text-sm gap-2"><span>{fechaCorta(a.fecha)} · {a.origen === 'nomina' ? `Nómina ${a.periodo}` : 'Abono directo'}</span><b className="tabular-nums">{$(a.valor)}</b></div>
                ))}
                {x.estado === 'activo' && (abono?.prestamoId === x.id ? (
                  <div className="flex gap-2 flex-wrap">
                    <InputDinero value={abono.valor} onChange={e => setAbono({ ...abono, valor: e.target.value })} placeholder="Valor del abono" className={campo} style={{ ...campoEstilo, width: 160 }} />
                    <select value={abono.cuentaId} onChange={e => setAbono({ ...abono, cuentaId: e.target.value })} className={campo} style={{ ...campoEstilo, width: 200 }}>
                      <option value="">Sin registrar en una cuenta</option>
                      {cuentas.map(c => <option key={c.id} value={c.id}>Entra a {c.nombre}</option>)}
                    </select>
                    <Boton onClick={() => setAbono(null)}>Cancelar</Boton><Boton tono="tinta" onClick={guardarAbono} disabled={guardando}>Registrar abono</Boton>
                  </div>
                ) : <div><Boton tono="blanco" onClick={() => setAbono({ prestamoId: x.id, valor: '', cuentaId: '' })}>Abono directo</Boton></div>)}
              </div>
            )}
          </div>
        ))}
      </Tarjeta>
    </div>
  )
}
