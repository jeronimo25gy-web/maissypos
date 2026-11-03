'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import InputDinero from '@/components/InputDinero'

// Arqueo: lo que el sistema dice que hay en la cuenta contra lo que se contó
// (efectivo, a diario) o lo que dice el banco (los lunes). Si no cuadra, el
// faltante se carga al encargado (descuento de nómina) o se ajusta con motivo;
// en los dos casos la cuenta queda con lo contado.
const C = { tinta: '#1C1B19', gris: '#5A5750', linea: '#E3E1D8', suave: '#EFEDE6', rojo: 'var(--rojo)', verde: '#2E5E3A', verdeF: '#E6F0E8', ambar: '#8A5A00', ambarF: '#FFF4CC' }
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const $ = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n || 0)).toLocaleString('es-CO')
const campo = 'w-full min-h-[44px] rounded-xl px-3 text-[15px] bg-white border-[1.5px] outline-none'
const lunesDe = (f) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toLocaleDateString('en-CA') }

// Cuándo toca: efectivo hoy; bancos desde el lunes de esta semana.
export const arqueoAlDia = (cuenta, ultimo, hoy) => !!ultimo && (cuenta.tipo === 'efectivo' ? ultimo.fecha === hoy : ultimo.fecha >= lunesDe(hoy))

export async function cargarArqueos(empresaId = getEmpresaId()) {
  const [{ data: arqueos }, { data: emps }] = await Promise.all([
    supabase.from('arqueos').select('*').eq('empresa_id', empresaId).order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(200),
    supabase.from('empleados').select('id, nombre, empresa_id'),
  ])
  return { arqueos: arqueos || [], empleados: emps || [] }
}

export default function Arqueo({ cuenta, datos, usuario, onCerrar, onListo }) {
  const hoy = obtenerFechaActual()
  const [contado, setContado] = useState('')
  const [decision, setDecision] = useState('')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setContado(''); setDecision(''); setMotivo(''); setError('') }, [cuenta.id])

  const encargado = datos.empleados.find(e => e.id === cuenta.responsable_empleado_id)
  const sistema = Number(cuenta.saldo || 0)
  const escrito = contado !== ''
  const dif = escrito ? Number(contado) - sistema : 0
  const cuadra = escrito && Math.abs(dif) < 1
  const historial = datos.arqueos.filter(a => a.cuenta_id === cuenta.id).slice(0, 5)
  const nombre = (id) => datos.empleados.find(e => e.id === id)?.nombre || ''

  const guardar = async () => {
    if (!escrito) { setError(cuenta.tipo === 'efectivo' ? 'Escriba cuánto se contó.' : 'Escriba el saldo que muestra el banco.'); return }
    const dec = cuadra ? 'cuadra' : decision
    if (!dec) { setError('Escoja si se le carga al encargado o se ajusta.'); return }
    if (dec === 'ajuste' && !motivo.trim()) { setError('Escriba el motivo del ajuste.'); return }
    setGuardando(true); setError('')
    const empresaId = getEmpresaId()
    try {
      const { data: arq, error: e1 } = await supabase.from('arqueos').insert({
        empresa_id: empresaId, cuenta_id: cuenta.id, fecha: hoy, saldo_sistema: sistema, saldo_contado: Number(contado), diferencia: cuadra ? 0 : dif,
        decision: dec, empleado_id: dec === 'cargo' ? encargado.id : null, motivo: motivo.trim() || null, usuario: usuario.nombre,
      }).select('id').single()
      if (e1) throw e1
      if (dec !== 'cuadra') {
        const { error: e2 } = await supabase.from('movimientos_tesoreria').insert({
          empresa_id: empresaId, cuenta_id: cuenta.id, fecha: hoy, tipo: dif > 0 ? 'entrada' : 'salida', monto: Math.abs(dif),
          concepto: dec === 'cargo' ? `Faltante de arqueo cargado a ${encargado.nombre}` : `Ajuste de arqueo: ${motivo.trim()}`, referencia_tipo: 'arqueo', referencia_id: arq.id,
        })
        if (e2) throw e2
      }
      if (dec === 'cargo') {
        const { error: e3 } = await supabase.from('nomina_novedades').insert({
          empresa_id: encargado.empresa_id, empleado_id: encargado.id, periodo: hoy.slice(0, 7), quincena: Number(hoy.slice(8, 10)) <= 15 ? 1 : 2,
          tipo: 'descuento', concepto: `Faltante arqueo ${cuenta.nombre} ${hoy}${motivo.trim() ? ` · ${motivo.trim()}` : ''}`, valor: Math.abs(dif), registrado_por: usuario.nombre,
        })
        if (e3) throw e3
      }
      onListo()
    } catch (e) {
      setError('No se pudo guardar: ' + (e.message || e))
    }
    setGuardando(false)
  }

  return (
    <section className="bg-white rounded-[18px] p-4 flex flex-col gap-3" aria-label={`Arqueo de ${cuenta.nombre}`}>
      <div className="flex justify-between gap-2 items-start flex-wrap">
        <div>
          <h3 className="text-[19px] font-extrabold m-0" style={titulo}>Arqueo · {cuenta.nombre}</h3>
          <p className="text-[13px] m-0" style={{ color: C.gris }}>{encargado ? `Encargado: ${encargado.nombre}` : 'Sin encargado: se asigna en Maestros, Cuentas'}</p>
        </div>
        <button type="button" onClick={onCerrar} className="rounded-xl min-h-[40px] px-4 text-sm font-bold" style={{ background: C.suave }}>Cancelar</button>
      </div>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <div className="rounded-xl p-3" style={{ background: C.suave }}><span className="block text-[12.5px] font-bold" style={{ color: C.gris }}>Según el sistema</span><b className="text-[22px] tabular-nums" style={titulo}>{$(sistema)}</b></div>
        <label className="flex flex-col gap-1 text-[12.5px] font-bold" style={{ color: C.gris }}>{cuenta.tipo === 'efectivo' ? 'Lo que se contó' : 'Lo que dice el banco'}
          <InputDinero value={contado} onChange={e => { setContado(e.target.value); setDecision('') }} placeholder="$" className={campo + ' text-[18px] font-extrabold'} style={{ borderColor: C.linea, color: C.tinta }} /></label>
        <div className="rounded-xl p-3" style={!escrito ? { background: C.suave } : cuadra ? { background: C.verdeF } : { background: dif < 0 ? 'var(--rojo-suave)' : C.ambarF }}>
          <span className="block text-[12.5px] font-bold" style={{ color: C.gris }}>Diferencia</span>
          <b className="text-[22px] tabular-nums" style={{ ...titulo, color: !escrito ? C.gris : cuadra ? C.verde : dif < 0 ? C.rojo : C.ambar }}>{!escrito ? '—' : cuadra ? 'Cuadra' : `${dif < 0 ? 'Falta' : 'Sobra'} ${$(Math.abs(dif))}`}</b>
        </div>
      </div>
      {escrito && !cuadra && (
        <div className="flex flex-col gap-2">
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2" role="radiogroup" aria-label="Qué hacer con la diferencia">
            {dif < 0 && (
              <button type="button" role="radio" aria-checked={decision === 'cargo'} disabled={!encargado} onClick={() => setDecision('cargo')} className="rounded-xl px-3 py-2 text-left min-h-[56px] disabled:opacity-40"
                style={decision === 'cargo' ? { background: '#fff', boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: C.suave }}>
                <b className="block text-[14px]">{encargado ? `Cargar a ${encargado.nombre}` : 'Cargar al encargado'}</b><span className="text-[12px]" style={{ color: C.gris }}>Se le descuenta en la nómina</span>
              </button>
            )}
            <button type="button" role="radio" aria-checked={decision === 'ajuste'} onClick={() => setDecision('ajuste')} className="rounded-xl px-3 py-2 text-left min-h-[56px]"
              style={decision === 'ajuste' ? { background: '#fff', boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: C.suave }}>
              <b className="block text-[14px]">Ajustar la cuenta</b><span className="text-[12px]" style={{ color: C.gris }}>La diferencia tiene explicación</span>
            </button>
          </div>
          <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder={decision === 'ajuste' ? 'Motivo del ajuste' : 'Nota (opcional)'} aria-label="Motivo" className={campo} style={{ borderColor: C.linea, color: C.tinta }} />
        </div>
      )}
      {error && <b className="text-[13.5px]" style={{ color: C.rojo }}>{error}</b>}
      <button type="button" onClick={guardar} disabled={guardando || !escrito} className="min-h-[46px] rounded-xl font-bold text-white disabled:opacity-40" style={{ background: 'var(--primario)' }}>{guardando ? 'Guardando…' : 'Guardar arqueo'}</button>
      {historial.length > 0 && (
        <div className="flex flex-col gap-1">
          <b className="text-[14px]">Arqueos anteriores</b>
          {historial.map(a => (
            <p key={a.id} className="text-[12.5px] m-0" style={{ color: C.gris }}>
              {new Date(a.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })} · {a.decision === 'cuadra' ? 'Cuadró' : `${a.diferencia < 0 ? 'Faltaron' : 'Sobraron'} ${$(Math.abs(a.diferencia))} · ${a.decision === 'cargo' ? `cargado a ${nombre(a.empleado_id)}` : 'ajustado'}`}{a.motivo ? ` · ${a.motivo}` : ''} · {a.usuario}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}
