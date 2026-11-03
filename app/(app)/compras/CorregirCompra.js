'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'

// Corregir una compra ya confirmada (solo Gerencia): cantidades y cambiar una
// referencia por otra. La diferencia entra o sale del inventario como ajuste;
// a crédito, cambia lo que se le debe al proveedor; pagada, entra o sale la
// diferencia de la cuenta con que se pagó. Queda registrada con su motivo.
const C = { tinta: '#1C1B19', gris: '#5A5750', linea: '#E3E1D8', suave: '#EFEDE6', rojo: 'var(--rojo)' }
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const campo = 'w-full min-h-[42px] rounded-xl px-3 text-[15px] bg-white border-[1.5px] outline-none'
const num = (t) => Number(String(t ?? '').replace(',', '.'))
const txt = (n) => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })
const $ = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n || 0)).toLocaleString('es-CO')

export default function CorregirCompra({ compra, usuario, onCerrar, onListo }) {
  const [datos, setDatos] = useState(null)
  const [nuevos, setNuevos] = useState({})
  const [agregar, setAgregar] = useState('')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const empresaId = getEmpresaId()
    Promise.all([
      supabase.from('compras').select('*').eq('compra_id', compra.id).eq('empresa_id', empresaId),
      supabase.from('productos').select('sku, nombre, costo_compra').eq('empresa_id', empresaId).eq('proveedor_id', compra.proveedor_id).eq('estado', true).order('nombre'),
      supabase.from('correcciones').select('*').eq('referencia_id', compra.id).order('created_at', { ascending: false }),
    ]).then(([{ data: det }, { data: prods }, { data: corr }]) => {
      setDatos({ det: det || [], prods: prods || [], corr: corr || [] })
      setNuevos(Object.fromEntries((det || []).map(d => [d.sku, txt(d.cantidad)])))
    })
  }, [compra.id, compra.proveedor_id])

  if (!datos) return <div className="rounded-2xl p-3" style={{ background: C.suave }}>Cargando…</div>
  const nombre = (sku) => datos.prods.find(p => p.sku === sku)?.nombre || sku
  const linea = (sku) => datos.det.find(d => d.sku === sku)
  const precio = (sku) => Number(linea(sku)?.precio_unitario ?? datos.prods.find(p => p.sku === sku)?.costo_compra ?? 0)
  const skus = [...new Set([...datos.det.map(d => d.sku), ...Object.keys(nuevos)])]
  const cambios = skus.map(sku => ({ sku, antes: Number(linea(sku)?.cantidad || 0), despues: num(nuevos[sku]) || 0 })).filter(c => Math.abs(c.antes - c.despues) > 1e-9)
  const diferencia = cambios.reduce((s, c) => s + (c.despues - c.antes) * precio(c.sku), 0)
  const pagada = compra.estado === 'pagada' || compra.estado_pago === 'pagado_momento'

  const guardar = async () => {
    if (!cambios.length) { setError('No hay cambios.'); return }
    if (!motivo.trim()) { setError('Escriba el motivo de la corrección.'); return }
    if (cambios.some(c => !(c.despues >= 0))) { setError('Revise las cantidades.'); return }
    setGuardando(true); setError('')
    const empresaId = getEmpresaId()
    const prov = compra.proveedores?.nombre || 'proveedor'
    try {
      for (const c of cambios) {
        const l = linea(c.sku), p = precio(c.sku)
        const r = l
          ? await supabase.from('compras').update({ cantidad: c.despues, total: c.despues * p }).eq('id', l.id)
          : await supabase.from('compras').insert({ empresa_id: empresaId, fecha: compra.fecha, proveedor_id: compra.proveedor_id, compra_id: compra.id, sku: c.sku, cantidad: c.despues, precio_unitario: p, total: c.despues * p, tipo_soporte: 'registro_manual', estado: compra.estado })
        if (r.error) throw r.error
        const dif = c.despues - c.antes
        const { error: e } = await supabase.from('inventario_mov').insert({ empresa_id: empresaId, sku: c.sku, cantidad: Math.abs(dif), fecha: compra.fecha, tipo_movimiento: dif > 0 ? 'entrada' : 'salida', referencia: `Corrección compra a ${prov}` })
        if (e) throw e
      }
      const { error: e1 } = await supabase.from('compras_encab').update({ total: Number(compra.total || 0) + diferencia, updated_at: new Date().toISOString() }).eq('id', compra.id)
      if (e1) throw e1
      if (Math.abs(diferencia) >= 1) {
        if (pagada && compra.cuenta_pago_id) {
          const { error: e2 } = await supabase.from('movimientos_tesoreria').insert({ empresa_id: empresaId, cuenta_id: compra.cuenta_pago_id, fecha: compra.fecha, tipo: diferencia > 0 ? 'salida' : 'entrada', monto: Math.abs(diferencia), concepto: `Corrección compra a ${prov}`, referencia_tipo: 'compra', referencia_id: compra.id })
          if (e2) throw e2
        } else if (!pagada) {
          const { data: fac } = await supabase.from('facturas_proveedores').select('id, total_pendiente').eq('empresa_id', empresaId).eq('proveedor_id', compra.proveedor_id).eq('estado', 'pendiente').limit(1)
          if (fac?.[0]) {
            const { error: e3 } = await supabase.from('facturas_proveedores').update({ total_pendiente: Math.max(0, Number(fac[0].total_pendiente) + diferencia), updated_at: new Date().toISOString() }).eq('id', fac[0].id)
            if (e3) throw e3
          } else if (diferencia > 0) {
            const { error: e3 } = await supabase.from('facturas_proveedores').insert({ empresa_id: empresaId, proveedor_id: compra.proveedor_id, total_pendiente: diferencia, estado: 'pendiente' })
            if (e3) throw e3
          }
        }
      }
      const { error: e4 } = await supabase.from('correcciones').insert({
        empresa_id: empresaId, tipo: 'compra', referencia_id: compra.id, motivo: motivo.trim(), usuario: usuario.nombre,
        antes: cambios.map(c => ({ sku: c.sku, nombre: nombre(c.sku), cantidad: c.antes })), despues: cambios.map(c => ({ sku: c.sku, nombre: nombre(c.sku), cantidad: c.despues })),
      })
      if (e4) throw e4
      onListo()
    } catch (e) {
      setError('No se pudo guardar: ' + (e.message || e))
    }
    setGuardando(false)
  }

  const disponibles = datos.prods.filter(p => !skus.includes(p.sku))
  return (
    <section className="rounded-2xl p-3 flex flex-col gap-2.5 bg-white" style={{ boxShadow: `inset 0 0 0 1.5px ${C.linea}` }} aria-label="Corregir compra">
      <div className="flex justify-between gap-2 items-center"><b className="text-[16px]" style={titulo}>Corregir compra</b>
        <button type="button" onClick={onCerrar} className="rounded-xl min-h-[36px] px-3 text-[13px] font-bold" style={{ background: C.suave }}>Cancelar</button></div>
      {skus.map(sku => {
        const cambio = cambios.find(c => c.sku === sku)
        return (
          <div key={sku} className="grid gap-3 items-center" style={{ gridTemplateColumns: 'minmax(0,1fr) 60px 90px' }}>
            <span className="min-w-0 leading-tight text-[13.5px]"><b className="block">{nombre(sku)}</b>{cambio && <span className="text-[12px] font-bold" style={{ color: C.rojo }}>{txt(cambio.antes)} → {txt(cambio.despues)}</span>}</span>
            <span className="text-right text-[12.5px] tabular-nums" style={{ color: C.gris }}>{linea(sku) ? txt(linea(sku).cantidad) : 'nuevo'}</span>
            <input inputMode="decimal" value={nuevos[sku] ?? ''} onChange={e => setNuevos({ ...nuevos, [sku]: e.target.value })} aria-label={`Cantidad corregida de ${nombre(sku)}`}
              className={campo + ' text-center font-bold'} style={{ borderColor: cambio ? C.tinta : C.linea, color: C.tinta }} />
          </div>
        )
      })}
      <div className="flex gap-2">
        <select value={agregar} onChange={e => setAgregar(e.target.value)} className={campo} style={{ borderColor: C.linea, color: C.tinta }} aria-label="Agregar otra referencia">
          <option value="">Agregar otra referencia…</option>
          {disponibles.map(p => <option key={p.sku} value={p.sku}>{p.nombre}</option>)}
        </select>
        <button type="button" disabled={!agregar} onClick={() => { setNuevos({ ...nuevos, [agregar]: '' }); setAgregar('') }} className="shrink-0 rounded-xl min-h-[42px] px-3 text-[13px] font-bold disabled:opacity-40" style={{ background: C.suave }}>Agregar</button>
      </div>
      <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo de la corrección" aria-label="Motivo de la corrección" className={campo} style={{ borderColor: C.linea, color: C.tinta }} />
      {cambios.length > 0 && <span className="text-[12.5px]" style={{ color: C.gris }}>Diferencia {$(diferencia)}{Math.abs(diferencia) >= 1 ? (pagada ? ' · se ajusta en la cuenta con que se pagó' : ' · se ajusta en lo que se le debe al proveedor') : ''}</span>}
      {error && <b className="text-[13px]" style={{ color: C.rojo }}>{error}</b>}
      <button type="button" onClick={guardar} disabled={guardando || !cambios.length} className="min-h-[42px] rounded-xl font-bold text-white disabled:opacity-40" style={{ background: 'var(--primario)' }}>{guardando ? 'Guardando…' : 'Guardar corrección'}</button>
      {datos.corr.length > 0 && datos.corr.map(c => (
        <p key={c.id} className="text-[12px] m-0" style={{ color: C.gris }}>{new Date(c.created_at).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {c.usuario} · {c.motivo}: {c.despues.map((d, i) => `${d.nombre} ${txt(c.antes[i]?.cantidad)} → ${txt(d.cantidad)}`).join(', ')}</p>
      ))}
    </section>
  )
}
