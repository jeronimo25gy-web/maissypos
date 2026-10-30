'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import InputDinero from '@/components/InputDinero'
import { C, $, Pill, Tarjeta, H2, Nota, Boton, campo, campoEstilo, Campo } from '../gastos/ui'
import CampoFecha from '@/components/CampoFecha'

// Promociones por cantidad (promo x6 de Tela): no son otro producto; se
// despacha y descuenta el mismo y el ticket arma la promo al vender.
const vacia = { sku: '', nombre: 'Promo x6', cantidad: '6', precio: '', precio_suelta: '', vigente_desde: '', excluir_rutas: [] }
const fechaLarga = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })

export default function Promociones({ productos }) {
  const [promos, setPromos] = useState(null)
  const [rutas, setRutas] = useState([])
  const [form, setForm] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const vendibles = productos.filter(p => p.tipo !== 'materia_prima')

  const cargar = useCallback(async () => {
    const id = getEmpresaId()
    const [{ data: pr }, { data: rs }] = await Promise.all([
      supabase.from('promociones').select('*').eq('empresa_id', id).order('created_at'),
      supabase.from('rutas').select('id, nombre').eq('estado', true).eq('empresa_id', id).order('nombre'),
    ])
    setPromos(pr || []); setRutas(rs || [])
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const guardar = async () => {
    const cantidad = parseInt(form.cantidad), precio = parseFloat(form.precio)
    if (!form.sku || !(cantidad > 1) || !(precio > 0) || !form.nombre.trim()) { alert('Producto, nombre, cantidad (2 o más) y precio de la promoción son obligatorios.'); return }
    setGuardando(true)
    const datos = { sku: form.sku, nombre: form.nombre.trim(), cantidad, precio, precio_suelta: form.precio_suelta ? parseFloat(form.precio_suelta) : null, vigente_desde: form.vigente_desde || null, excluir_rutas: form.excluir_rutas || [] }
    const { error } = form.id
      ? await supabase.from('promociones').update(datos).eq('id', form.id).eq('empresa_id', getEmpresaId())
      : await supabase.from('promociones').insert({ ...datos, empresa_id: getEmpresaId(), activa: true })
    setGuardando(false)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    setForm(null); cargar()
  }
  const alternar = async (p) => {
    const { error } = await supabase.from('promociones').update({ activa: !p.activa }).eq('id', p.id).eq('empresa_id', getEmpresaId())
    if (error) { alert('Error: ' + error.message); return }
    cargar()
  }

  if (!promos) return <Nota>Cargando…</Nota>
  return (
    <div className="flex flex-col gap-4">
      {form && (
        <Tarjeta>
          <div className="flex justify-between gap-2 items-center"><H2>{form.id ? 'Editar promoción' : 'Nueva promoción'}</H2><Boton onClick={() => setForm(null)}>Cancelar</Boton></div>
          <Campo etiqueta="Producto">
            <select value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} className={campo} style={campoEstilo}>
              <option value="">Seleccione</option>
              {vendibles.map(p => <option key={p.sku} value={p.sku}>{p.nombre} · {$(p.precio_venta)}</option>)}
            </select>
          </Campo>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <Campo etiqueta="Nombre"><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Cantidad"><input inputMode="numeric" value={form.cantidad} onChange={e => setForm({ ...form, cantidad: e.target.value.replace(/\D/g, '') })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Precio de la promoción"><InputDinero value={form.precio} onChange={e => setForm({ ...form, precio: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Precio por unidad suelta"><InputDinero value={form.precio_suelta} onChange={e => setForm({ ...form, precio_suelta: e.target.value })} placeholder="El de lista" className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Rige desde"><CampoFecha value={form.vigente_desde || ''} onChange={e => setForm({ ...form, vigente_desde: e.target.value })} className={campo} style={campoEstilo} /></Campo>
          </div>
          {rutas.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-bold" style={{ color: C.gris }}>No aplica en</span>
              <div className="flex flex-wrap gap-1.5">
                {rutas.map(r => {
                  const fuera = (form.excluir_rutas || []).includes(r.id)
                  return <button key={r.id} type="button" aria-pressed={fuera} onClick={() => setForm({ ...form, excluir_rutas: fuera ? form.excluir_rutas.filter(x => x !== r.id) : [...(form.excluir_rutas || []), r.id] })}
                    className="rounded-full min-h-[36px] px-3.5 text-[13px] font-bold" style={fuera ? { background: '#fff', color: C.tinta, boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: C.fondo, color: C.gris }}>{r.nombre}</button>
                })}
              </div>
            </div>
          )}
          <div className="flex justify-end"><Boton tono="rojo" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar promoción'}</Boton></div>
        </Tarjeta>
      )}
      <Tarjeta>
        <div className="flex justify-between gap-2 items-center flex-wrap"><H2>Promociones</H2>{!form && <Boton tono="rojo" onClick={() => setForm({ ...vacia })}>+ Promoción</Boton>}</div>
        <Nota>La promoción no es otro producto: se despacha y se descuenta el mismo, y al vender el ticket la arma solo.</Nota>
        {promos.length === 0 ? <Nota>Sin promociones.</Nota> : promos.map((p, i) => {
          const prod = vendibles.find(x => x.sku === p.sku)
          const fuera = rutas.filter(r => (p.excluir_rutas || []).includes(r.id)).map(r => r.nombre)
          return (
            <div key={p.id} className="grid gap-2.5 items-center pt-2.5" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', borderTop: i ? `1px solid ${C.linea}` : 0 }}>
              <span className="min-w-0">
                <b>{p.nombre} · {prod?.nombre || p.sku}</b>
                <span className="block text-[13px]" style={{ color: C.gris }}>{p.cantidad} por {$(p.precio)} · unidad suelta {p.precio_suelta ? $(p.precio_suelta) : 'al precio de lista'}</span>
                <span className="block text-[13px]" style={{ color: C.gris }}>{p.vigente_desde ? `Rige desde el ${fechaLarga(p.vigente_desde)}` : 'Vigente'}{fuera.length ? ` · no aplica en ${fuera.join(', ')}` : ' · todas las rutas'}</span>
              </span>
              <span className="flex flex-col items-end gap-1.5">
                <Pill tono={p.activa ? 'verde' : 'gris'}>{p.activa ? 'Activa' : 'Pausada'}</Pill>
                <span className="flex gap-3">
                  <button type="button" onClick={() => setForm({ ...p, cantidad: String(p.cantidad), precio: String(p.precio), precio_suelta: p.precio_suelta ? String(p.precio_suelta) : '' })} className="text-[13px] font-bold">Editar</button>
                  <button type="button" onClick={() => alternar(p)} className="text-[13px] font-bold" style={{ color: C.gris }}>{p.activa ? 'Pausar' : 'Activar'}</button>
                </span>
              </span>
            </div>
          )
        })}
      </Tarjeta>
    </div>
  )
}
