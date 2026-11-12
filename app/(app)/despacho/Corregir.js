'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'

// Corregir un despacho que ya salió (solo Gerencia), de hoy o de otro día y
// aunque ya esté liquidado: en ese caso también se ajusta su liquidación (lo
// que salió, lo vendido, lo que debía entregar y la diferencia del vendedor).
// Antes solo servía para despachos sin liquidar:
// subir o bajar cantidades y cambiar una referencia por otra. Ajusta el
// detalle, los totales y, en la planta, de qué día salió cada producto. Queda
// registrado quién, cuándo, por qué, y cómo estaba y cómo quedó.
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: 'var(--hoja)', linea: '#E3E1D8', suave: '#EFEDE6', rojo: 'var(--rojo)', rojoF: 'var(--rojo-suave)' }
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const campo = 'w-full min-h-[42px] rounded-xl px-3 text-[15px] bg-white border-[1.5px] outline-none'
const num = (t) => Number(String(t ?? '').replace(',', '.'))
const txt = (n) => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })

export default function Corregir({ despacho, esProduccion, usuario, onCerrar, onListo }) {
  const [datos, setDatos] = useState(null)
  const [nuevos, setNuevos] = useState({}) // sku -> texto
  const [agregar, setAgregar] = useState('')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const empresaId = getEmpresaId()
    Promise.all([
      supabase.from('despachos_detalle').select('*').eq('despacho_id', despacho.id).eq('empresa_id', empresaId),
      supabase.from('productos').select('sku, nombre, precio_venta').eq('empresa_id', empresaId).eq('estado', true).neq('tipo', 'materia_prima').order('nombre'),
      supabase.from('rutas_precios').select('sku, precio_especial').eq('ruta_id', despacho.ruta_id).eq('empresa_id', empresaId),
      supabase.from('correcciones').select('*').eq('referencia_id', despacho.id).order('created_at', { ascending: false }),
    ]).then(([{ data: det }, { data: prods }, { data: rp }, { data: corr }]) => {
      setDatos({ det: det || [], prods: prods || [], precios: Object.fromEntries((rp || []).map(x => [x.sku, Number(x.precio_especial)])), corr: corr || [] })
      setNuevos(Object.fromEntries((det || []).map(d => [d.sku, txt(d.total)])))
    })
  }, [despacho.id, despacho.ruta_id])

  if (!datos) return <section className="bg-white rounded-[18px] p-4"><p style={{ color: C.gris }}>Cargando…</p></section>
  const nombre = (sku) => datos.prods.find(p => p.sku === sku)?.nombre || sku
  const antes = Object.fromEntries(datos.det.map(d => [d.sku, Number(d.total)]))
  const skus = [...new Set([...datos.det.map(d => d.sku), ...Object.keys(nuevos)])]
  const cambios = skus.map(sku => ({ sku, antes: antes[sku] || 0, despues: num(nuevos[sku]) || 0 })).filter(c => Math.abs(c.antes - c.despues) > 1e-9)

  const guardar = async () => {
    if (!cambios.length) { setError('No hay cambios.'); return }
    if (!motivo.trim()) { setError('Escriba el motivo de la corrección.'); return }
    if (cambios.some(c => !(c.despues >= 0))) { setError('Revise las cantidades.'); return }
    setGuardando(true); setError('')
    const empresaId = getEmpresaId()
    const liquidado = despacho.estado === 'liquidado'
    const { data: liqs } = liquidado ? await supabase.from('liquidaciones').select('*').eq('despacho_id', despacho.id).eq('empresa_id', empresaId) : { data: [] }
    if (liquidado) {
      const negativo = cambios.find(c => { const l = (liqs || []).find(x => x.sku === c.sku); return l && Number(l.vendido_neto) + (c.despues - c.antes) < 0 })
      if (negativo) { setError(`${nombre(negativo.sku)}: con esa cantidad lo vendido quedaría negativo. Corrija primero la devolución en la liquidación.`); setGuardando(false); return }
    }
    try {
      for (const c of cambios) {
        const linea = datos.det.find(d => d.sku === c.sku)
        if (linea) {
          const viejo = Math.min(Number(linea.lote_viejo_x || 0), c.despues)
          const { error: e } = await supabase.from('despachos_detalle').update({ total: c.despues, lote_viejo_x: viejo, lote_nuevo_y: c.despues - viejo }).eq('id', linea.id)
          if (e) throw e
        } else {
          const precio = datos.precios[c.sku] ?? Number(datos.prods.find(p => p.sku === c.sku)?.precio_venta || 0)
          const { error: e } = await supabase.from('despachos_detalle').insert({ empresa_id: empresaId, despacho_id: despacho.id, sku: c.sku, total: c.despues, lote_viejo_x: 0, lote_nuevo_y: c.despues, precio_unitario: precio })
          if (e) throw e
        }
        // En la planta: lo que se suma sale del día más reciente; lo que se
        // quita vuelve primero al día más reciente.
        if (esProduccion) {
          const dif = c.despues - c.antes
          if (dif > 0) {
            const { data: ult } = await supabase.from('inventario_mov').select('fecha').eq('empresa_id', empresaId).eq('sku', c.sku).eq('tipo_movimiento', 'entrada').ilike('referencia', 'Producci%').lte('fecha', obtenerFechaActual()).order('fecha', { ascending: false }).limit(1)
            await supabase.from('lotes_salida').insert({ empresa_id: empresaId, despacho_id: despacho.id, sku: c.sku, fecha_lote: ult?.[0]?.fecha || obtenerFechaActual(), cantidad: dif })
          } else {
            let falta = -dif
            const { data: filas } = await supabase.from('lotes_salida').select('id, cantidad').eq('despacho_id', despacho.id).eq('sku', c.sku).order('fecha_lote', { ascending: false })
            for (const f of filas || []) {
              if (falta <= 0) break
              const quita = Math.min(falta, Number(f.cantidad))
              if (quita >= Number(f.cantidad)) await supabase.from('lotes_salida').delete().eq('id', f.id)
              else await supabase.from('lotes_salida').update({ cantidad: Number(f.cantidad) - quita }).eq('id', f.id)
              falta -= quita
            }
          }
        }
      }
      // Ya liquidado: lo que se suma (o se quita) cuenta como vendido y cambia lo que debía entregar.
      if (liquidado) {
        let ajusteEntrega = 0
        for (const c of cambios) {
          const dif = c.despues - c.antes
          const l = (liqs || []).find(x => x.sku === c.sku)
          const linea = datos.det.find(d => d.sku === c.sku)
          const precio = l && Number(l.vendido_neto) > 0 ? Number(l.efectivo_esperado) / Number(l.vendido_neto)
            : Number(linea?.precio_unitario ?? datos.precios[c.sku] ?? datos.prods.find(p => p.sku === c.sku)?.precio_venta ?? 0)
          if (l) {
            const { error: e } = await supabase.from('liquidaciones').update({ despachado: Number(l.despachado) + dif, vendido_neto: Number(l.vendido_neto) + dif, efectivo_esperado: Math.round((Number(l.efectivo_esperado) + dif * precio) * 100) / 100 }).eq('id', l.id)
            if (e) throw e
          } else {
            const { error: e } = await supabase.from('liquidaciones').insert({ empresa_id: empresaId, fecha: despacho.fecha, despacho_id: despacho.id, vendedor_id: despacho.vendedor_id, sku: c.sku, despachado: dif, devuelto: 0, cambio: 0, vendido_neto: dif, efectivo_esperado: dif * precio, efectivo_real: 0 })
            if (e) throw e
          }
          ajusteEntrega += dif * precio
        }
        const { data: ld } = await supabase.from('liquidaciones_detalle').select('id, diferencia').eq('despacho_id', despacho.id).eq('empresa_id', empresaId).maybeSingle()
        if (ld) {
          const { error: e } = await supabase.from('liquidaciones_detalle').update({ diferencia: Math.round((Number(ld.diferencia || 0) - ajusteEntrega) * 100) / 100 }).eq('id', ld.id)
          if (e) throw e
        }
      }
      const { data: det } = await supabase.from('despachos_detalle').select('total, precio_unitario').eq('despacho_id', despacho.id)
      const und = (det || []).reduce((s, d) => s + Number(d.total || 0), 0)
      const valor = (det || []).reduce((s, d) => s + Number(d.total || 0) * Number(d.precio_unitario || 0), 0)
      const { error: e1 } = await supabase.from('despachos_encab').update({ total_und: und, total_valor: valor }).eq('id', despacho.id)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('correcciones').insert({
        empresa_id: empresaId, tipo: 'despacho', referencia_id: despacho.id, motivo: motivo.trim(), usuario: usuario.nombre,
        antes: cambios.map(c => ({ sku: c.sku, nombre: nombre(c.sku), cantidad: c.antes })), despues: cambios.map(c => ({ sku: c.sku, nombre: nombre(c.sku), cantidad: c.despues })),
      })
      if (e2) throw e2
      onListo()
    } catch (e) {
      setError('No se pudo guardar: ' + (e.message || e))
    }
    setGuardando(false)
  }

  const disponibles = datos.prods.filter(p => !skus.includes(p.sku))
  return (
    <section className="bg-white rounded-[18px] p-4 flex flex-col gap-3" aria-label="Corregir despacho">
      <div className="flex justify-between gap-2 items-start flex-wrap">
        <div>
          <h2 className="font-extrabold text-[19px] m-0" style={titulo}>Corregir despacho</h2>
          <p className="text-[13px] m-0" style={{ color: C.gris }}>{despacho.rutas?.nombre} · {despacho.vendedores?.nombre}{despacho.fecha && despacho.fecha !== obtenerFechaActual() ? ` · ${new Date(despacho.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })}` : ''}</p>
          {despacho.estado === 'liquidado' && <p className="text-[12.5px] m-0 mt-1 font-bold" style={{ color: C.tinta }}>Ya está liquidada: lo que suba o baje cambia lo que debía entregar el vendedor.</p>}
        </div>
        <button type="button" onClick={onCerrar} className="rounded-xl min-h-[40px] px-4 text-sm font-bold" style={{ background: C.suave }}>Cancelar</button>
      </div>
      <div className="flex flex-col">
        {skus.map(sku => {
          const cambio = cambios.find(c => c.sku === sku)
          return (
            <div key={sku} className="grid gap-3 items-center py-2" style={{ gridTemplateColumns: 'minmax(0,1fr) 70px 96px', borderTop: `1px solid ${C.linea}` }}>
              <span className="min-w-0 leading-tight"><b className="block text-[14.5px]">{nombre(sku)}</b>
                {cambio && <span className="text-[12.5px] font-bold" style={{ color: C.rojo }}>{txt(cambio.antes)} → {txt(cambio.despues)}</span>}</span>
              <span className="text-right text-[13px] tabular-nums" style={{ color: C.gris }}>{antes[sku] != null ? txt(antes[sku]) : 'nuevo'}</span>
              <input inputMode="decimal" value={nuevos[sku] ?? ''} onChange={e => setNuevos({ ...nuevos, [sku]: e.target.value })} aria-label={`Cantidad corregida de ${nombre(sku)}`}
                className={campo + ' text-center font-bold'} style={{ borderColor: cambio ? C.tinta : C.linea, color: C.tinta }} />
            </div>
          )
        })}
      </div>
      <div className="flex gap-2">
        <select value={agregar} onChange={e => setAgregar(e.target.value)} className={campo} style={{ borderColor: C.linea, color: C.tinta }} aria-label="Agregar otra referencia">
          <option value="">Agregar otra referencia…</option>
          {disponibles.map(p => <option key={p.sku} value={p.sku}>{p.nombre}</option>)}
        </select>
        <button type="button" disabled={!agregar} onClick={() => { setNuevos({ ...nuevos, [agregar]: '' }); setAgregar('') }} className="shrink-0 rounded-xl min-h-[42px] px-4 text-sm font-bold disabled:opacity-40" style={{ background: C.suave }}>Agregar</button>
      </div>
      <label className="flex flex-col gap-1 text-[13px] font-bold" style={{ color: C.gris }}>Motivo
        <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ejemplo: eran 4 grandes blancas y 4 amarillas" className={campo} style={{ borderColor: C.linea, color: C.tinta }} />
      </label>
      {error && <b className="text-[13.5px]" style={{ color: C.rojo }}>{error}</b>}
      <button type="button" onClick={guardar} disabled={guardando || !cambios.length} className="min-h-[46px] rounded-xl font-bold text-white disabled:opacity-40" style={{ background: 'var(--primario)' }}>
        {guardando ? 'Guardando…' : cambios.length ? `Guardar corrección (${cambios.length} ${cambios.length === 1 ? 'cambio' : 'cambios'})` : 'Guardar corrección'}
      </button>
      {datos.corr.length > 0 && (
        <div className="flex flex-col gap-1 pt-1">
          <b className="text-[14px]">Correcciones anteriores</b>
          {datos.corr.map(c => (
            <p key={c.id} className="text-[12.5px] m-0" style={{ color: C.gris }}>
              {new Date(c.created_at).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {c.usuario} · {c.motivo}: {c.despues.map((d, i) => `${d.nombre} ${txt(c.antes[i]?.cantidad)} → ${txt(d.cantidad)}`).join(', ')}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}
