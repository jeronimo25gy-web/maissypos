'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { getEmpresaId } from '@/lib/empresa'
import { supabase } from '@/lib/supabase'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { cargarCaja } from '@/lib/finanzas'
import InputDinero from '@/components/InputDinero'
import { C, $, Pill, Tarjeta, H2, Nota, Boton, campo, campoEstilo, Campo, Segmento, Tabla, td, Aviso } from '../gastos/ui'

// Cuentas de la empresa: efectivo y bancos con banco, tipo, número, titular y
// llaves. Con esos datos el lector de comprobantes reconoce a qué cuenta llegó
// cada transferencia. Saldos y movimientos: Finanzas → Caja y bancos.
const TIPO_CUENTA = { ahorros: 'Ahorros', corriente: 'Corriente', billetera: 'Billetera digital' }
const vacia = { nombre: '', tipo: 'banco', banco: '', tipo_cuenta: 'ahorros', numero: '', titular: '', llaves: '', saldo_inicial: '0' }

export default function Cuentas({ nuevoRef }) {
  const [d, setD] = useState(null)
  const [form, setForm] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const cargar = useCallback(async () => {
    const id = getEmpresaId()
    const [{ data }, caja] = await Promise.all([
      supabase.from('cuentas').select('*').eq('empresa_id', id).order('tipo').order('nombre'),
      cargarCaja(obtenerFechaActual().slice(0, 7), id).catch(() => ({ cuentas: [] })),
    ])
    setD({ cuentas: data || [], saldo: Object.fromEntries(caja.cuentas.map(c => [c.id, c.saldo])) })
  }, [])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { if (nuevoRef) nuevoRef.current = () => setForm({ ...vacia }) }, [nuevoRef])
  if (!d) return <Nota>Cargando…</Nota>

  const guardar = async () => {
    if (!form.nombre.trim()) { alert('Escriba el nombre de la cuenta.'); return }
    setGuardando(true)
    const banco = form.tipo === 'banco'
    const datos = {
      nombre: form.nombre.trim(), tipo: form.tipo, saldo_inicial: Number(form.saldo_inicial || 0),
      banco: banco ? form.banco?.trim() || null : null, numero: banco ? form.numero?.trim() || null : null, llaves: banco ? form.llaves?.trim() || null : null,
      tipo_cuenta: banco ? form.tipo_cuenta || null : null, titular: banco ? form.titular?.trim() || null : null,
    }
    const { error } = form.id ? await supabase.from('cuentas').update(datos).eq('id', form.id) : await supabase.from('cuentas').insert({ ...datos, estado: true, empresa_id: getEmpresaId() })
    setGuardando(false)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    setForm(null); cargar()
  }
  const alternar = async (c) => {
    if (c.estado && !confirm(`¿Desactivar ${c.nombre}? Conserva sus movimientos.`)) return
    const { error } = await supabase.from('cuentas').update({ estado: !c.estado }).eq('id', c.id)
    if (error) { alert('Error: ' + error.message); return }
    cargar()
  }
  const incompletas = d.cuentas.filter(c => c.estado && c.tipo === 'banco' && (!c.banco || !c.numero))
  // La cuenta del mostrador sale en los comprobantes de mostrador a credito y en los express.
  const marcarMostrador = async (c) => {
    const empresaId = getEmpresaId()
    await supabase.from('cuentas').update({ mostrador: false }).eq('empresa_id', empresaId).eq('mostrador', true)
    const { error } = await supabase.from('cuentas').update({ mostrador: true }).eq('id', c.id)
    if (error) { alert('No se pudo marcar: ' + error.message); return }
    cargar()
  }
  const mostrador = d.cuentas.find(c => c.mostrador)

  return (
    <div className="flex flex-col gap-4">
      {incompletas.length > 0 && <Aviso><b style={{ color: C.tinta }}>{incompletas.length === 1 ? '1 cuenta bancaria' : `${incompletas.length} cuentas bancarias`} sin banco o número.</b></Aviso>}
      {form && (
        <Tarjeta>
          <div className="flex justify-between gap-2 items-center"><H2>{form.id ? `Editar ${form.nombre}` : 'Nueva cuenta'}</H2><Boton onClick={() => setForm(null)}>Cancelar</Boton></div>
          <Segmento etiqueta="Tipo" opciones={[['banco', 'Banco o billetera'], ['efectivo', 'Efectivo']]} valor={form.tipo} onCambio={v => setForm({ ...form, tipo: v })} />
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <Campo etiqueta="Nombre de la cuenta"><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder={form.tipo === 'banco' ? 'Bancolombia Distri' : 'Caja principal'} className={campo} style={campoEstilo} /></Campo>
            {form.tipo === 'banco' && (<>
              <Campo etiqueta="Banco o billetera"><input value={form.banco || ''} onChange={e => setForm({ ...form, banco: e.target.value })} placeholder="Bancolombia, Nequi" className={campo} style={campoEstilo} /></Campo>
              <Campo etiqueta="Tipo de cuenta">
                <select value={form.tipo_cuenta || 'ahorros'} onChange={e => setForm({ ...form, tipo_cuenta: e.target.value })} className={campo} style={campoEstilo}>
                  {Object.entries(TIPO_CUENTA).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                </select>
              </Campo>
              <Campo etiqueta="Número de cuenta o celular"><input value={form.numero || ''} onChange={e => setForm({ ...form, numero: e.target.value })} className={campo} style={campoEstilo} /></Campo>
              <Campo etiqueta="Titular"><input value={form.titular || ''} onChange={e => setForm({ ...form, titular: e.target.value })} className={campo} style={campoEstilo} /></Campo>
              <Campo etiqueta="Llaves (Bre-B, alias, otros celulares)"><input value={form.llaves || ''} onChange={e => setForm({ ...form, llaves: e.target.value })} placeholder="Separadas por coma" className={campo} style={campoEstilo} /></Campo>
            </>)}
            <Campo etiqueta="Saldo inicial"><InputDinero value={form.saldo_inicial} onChange={e => setForm({ ...form, saldo_inicial: e.target.value })} className={campo} style={campoEstilo} /></Campo>
          </div>
          <div className="flex justify-end"><Boton tono="rojo" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cuenta'}</Boton></div>
        </Tarjeta>
      )}
      <Tarjeta>
        <div className="flex justify-between gap-2 items-center flex-wrap"><H2>Cuentas</H2>{!form && <Boton tono="rojo" onClick={() => setForm({ ...vacia })}>+ Cuenta</Boton>}</div>
        <Tabla columnas={['Cuenta', { t: 'Banco', izq: true }, { t: 'Número', izq: true }, { t: 'Titular', izq: true }, 'Saldo', '']} min={720}>
          {d.cuentas.map(c => (
            <tr key={c.id} style={{ opacity: c.estado ? 1 : 0.55 }}>
              <td style={td(true)}><b>{c.nombre}</b>{c.mostrador && <> <Pill>Mostrador</Pill></>}<span className="block text-[12.5px]" style={{ color: C.gris }}>{c.tipo === 'efectivo' ? 'Efectivo' : TIPO_CUENTA[c.tipo_cuenta] || 'Banco'}{!c.estado ? ' · inactiva' : ''}</span></td>
              <td style={td(true)}>{c.tipo === 'efectivo' ? '—' : c.banco || <Pill tono="ambar">Falta</Pill>}</td>
              <td style={td(true)}>{c.tipo === 'efectivo' ? '—' : c.numero ? <span className="tabular-nums">{c.numero}</span> : <Pill tono="ambar">Falta</Pill>}</td>
              <td style={td(true)}>{c.tipo === 'efectivo' ? '—' : c.titular || '—'}</td>
              <td style={td()}>{d.saldo[c.id] != null ? <b>{$(d.saldo[c.id])}</b> : '—'}</td>
              <td style={td()}><span className="flex gap-3 justify-end">
                <button type="button" onClick={() => setForm({ ...vacia, ...c, tipo_cuenta: c.tipo_cuenta || 'ahorros', saldo_inicial: String(c.saldo_inicial ?? 0) })} className="text-[13px] font-bold">Editar</button>
                {c.tipo === 'banco' && c.estado && !c.mostrador && <button type="button" onClick={() => marcarMostrador(c)} className="text-[13px] font-bold" style={{ color: C.gris }}>Usar en mostrador</button>}
                <button type="button" onClick={() => alternar(c)} className="text-[13px] font-bold" style={{ color: C.gris }}>{c.estado ? 'Desactivar' : 'Activar'}</button>
              </span></td>
            </tr>
          ))}
        </Tabla>
        <Nota>{mostrador ? <>La cuenta del mostrador es <b style={{ color: C.tinta }}>{mostrador.nombre}</b>: sale en los comprobantes de mostrador a crédito y en los domicilios express.</> : 'Ninguna cuenta está marcada para el mostrador: los comprobantes de mostrador a crédito salen sin cuenta para transferir.'} Las facturas por transferencia muestran la cuenta a la que llegó; los tickets de ruta, la cuenta de la ruta.</Nota>
        <Nota>Movimientos y traslados entre cuentas: <Link href="/financiero" className="font-bold underline" style={{ color: C.tinta }}>Finanzas → Caja y bancos</Link>.</Nota>
      </Tarjeta>
    </div>
  )
}
