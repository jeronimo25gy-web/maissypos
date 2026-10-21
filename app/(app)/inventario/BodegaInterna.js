'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { cargarBodegaInterna } from '@/lib/inventario-datos'
import Exportar from '@/components/Exportar'
import { C, titulo, Pill, Kpi } from './ui'

// Bodega interna del grupo: repuestos, herramientas, dotación, elementos de
// puntos de venta… Lo que no se vende pero hay que controlar. Cada elemento
// queda a nombre de la empresa que lo paga; las salidas dicen a quién se
// entregó y, si es un repuesto, para qué vehículo.
const fmt$ = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO')
const num = (n) => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })
const leer = (t) => { const x = String(t || '').trim().replace(/\./g, '').replace(',', '.'); return Number(x) }
const corto = (n) => (n || '').replace(/ S\.?A\.?S\.?$/i, '')
const campo = 'w-full h-11 rounded-xl border-2 px-3 text-[15px] bg-white focus:outline-none focus:border-[#1C1B19]'
const etq = 'text-[13px] font-bold block mb-1'
const itemVacio = { nombre: '', categoria_id: '', empresa_id: '', unidad: 'und', cantidad: '', minimo: '', ubicacion: '', valor_unitario: '', notas: '' }
const movVacio = { item_id: '', tipo: 'salida', cantidad: '', destino: 'persona', vehiculo_id: '', responsable: '', motivo: '' }

export default function BodegaInterna({ empresas, usuario }) {
  const ids = empresas.map(e => e.id)
  const [d, setD] = useState(null)
  const [cat, setCat] = useState('todo')
  const [q, setQ] = useState('')
  const [panel, setPanel] = useState(null) // 'item' | 'mov' | 'categoria'
  const [item, setItem] = useState(itemVacio)
  const [mov, setMov] = useState(movVacio)
  const [nuevaCat, setNuevaCat] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => { try { setD(await cargarBodegaInterna(ids)); setError('') } catch (e) { setError(e.message) } }, [ids.join()]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ids.length) cargar() }, [cargar, ids.length])

  if (error) return <div className="rounded-2xl px-4 py-3 text-sm font-bold" style={{ background: C.rojoF, color: C.rojo }}>No se pudo cargar: {error}</div>
  if (!d) return <p className="text-center py-16" style={{ color: C.gris }}>Cargando…</p>

  const nombreCat = (id) => d.cats.find(c => c.id === id)?.nombre || 'Sin categoría'
  // Categorías por nombre (las dos empresas pueden tener la misma).
  const categorias = [...new Map(d.cats.map(c => [c.nombre, c])).values()]
  const visibles = d.items.filter(i => (cat === 'todo' || nombreCat(i.categoria_id) === cat) && (!q || i.nombre.toLowerCase().includes(q.toLowerCase())))
  const grupos = []
  visibles.forEach(i => { const g = nombreCat(i.categoria_id); const x = grupos.find(([n]) => n === g); if (x) x[1].push(i); else grupos.push([g, [i]]) })
  const valor = d.items.reduce((s, i) => s + Math.max(0, Number(i.cantidad)) * Number(i.valor_unitario || 0), 0)
  const bajos = d.items.filter(i => Number(i.minimo) > 0 && Number(i.cantidad) < Number(i.minimo))
  const mes = new Date().toLocaleDateString('en-CA').slice(0, 7)
  const salidasMes = d.movs.filter(m => m.tipo === 'salida' && m.fecha.startsWith(mes))

  const guardarItem = async () => {
    if (!item.nombre.trim()) { setError('Escriba el nombre del elemento.'); return }
    setGuardando(true)
    const empresaId = item.empresa_id || getEmpresaId()
    const { data, error: e } = await supabase.from('bodega_items').insert({
      empresa_id: empresaId, categoria_id: item.categoria_id || null, nombre: item.nombre.trim(), unidad: item.unidad || 'und',
      minimo: leer(item.minimo) || 0, ubicacion: item.ubicacion || null, valor_unitario: leer(item.valor_unitario) || 0, notas: item.notas || null,
    }).select('id').single()
    if (!e && leer(item.cantidad) > 0) await supabase.from('bodega_movimientos').insert({ empresa_id: empresaId, item_id: data.id, tipo: 'entrada', cantidad: leer(item.cantidad), motivo: 'Saldo inicial', registrado_por: usuario?.nombre || null })
    setGuardando(false)
    if (e) { setError('No se pudo guardar: ' + e.message); return }
    setItem(itemVacio); setPanel(null); cargar()
  }
  const guardarMov = async () => {
    const it = d.items.find(i => i.id === mov.item_id)
    const cant = leer(mov.cantidad)
    if (!it || !(cant >= 0) || (mov.tipo !== 'ajuste' && !(cant > 0))) { setError('Seleccione el elemento y la cantidad.'); return }
    if (mov.tipo === 'salida' && cant > Number(it.cantidad)) { setError(`Solo hay ${num(it.cantidad)} ${it.unidad} de ${it.nombre}.`); return }
    setGuardando(true)
    const { error: e } = await supabase.from('bodega_movimientos').insert({
      empresa_id: it.empresa_id, item_id: it.id, tipo: mov.tipo, cantidad: cant,
      destino: mov.tipo === 'salida' ? mov.destino : null, vehiculo_id: mov.tipo === 'salida' && mov.destino === 'vehiculo' ? mov.vehiculo_id || null : null,
      responsable: mov.responsable || null, motivo: mov.motivo || null, registrado_por: usuario?.nombre || null,
    })
    setGuardando(false)
    if (e) { setError('No se pudo registrar: ' + e.message); return }
    setMov(movVacio); setPanel(null); cargar()
  }
  const guardarCategoria = async () => {
    if (!nuevaCat.trim()) return
    setGuardando(true)
    const { error: e } = await supabase.from('bodega_categorias').insert({ empresa_id: getEmpresaId(), nombre: nuevaCat.trim() })
    setGuardando(false)
    if (e) { setError('No se pudo crear: ' + e.message); return }
    setNuevaCat(''); setPanel(null); cargar()
  }
  const armar = () => ({
    titulo: 'Bodega interna', empresa: 'Maissy Group', periodo: `Corte al ${new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    secciones: [
      { titulo: 'Resumen', kpis: [{ rotulo: 'Valor', valor: fmt$(valor), valorNumero: valor }, { rotulo: 'Elementos', valor: String(d.items.length), valorNumero: d.items.length }, { rotulo: 'Bajo el mínimo', valor: String(bajos.length), valorNumero: bajos.length }] },
      { titulo: 'Elementos', tabla: { columnas: [{ titulo: 'Categoría' }, { titulo: 'Elemento' }, { titulo: 'Empresa' }, { titulo: 'Cantidad', tipo: 'num' }, { titulo: 'Ubicación' }, { titulo: 'Valor', tipo: 'pesos' }],
        filas: d.items.map(i => [nombreCat(i.categoria_id), i.nombre, corto(empresas.find(e => e.id === i.empresa_id)?.nombre), Number(i.cantidad), i.ubicacion || '', Math.max(0, Number(i.cantidad)) * Number(i.valor_unitario || 0)]), total: ['Total', '', '', null, '', valor] } },
    ],
  })

  const sel = (valor, set, opciones, props = {}) => <select value={valor} onChange={e => set(e.target.value)} className={campo} style={{ borderColor: C.linea }} {...props}>{opciones}</select>
  const inp = (valor, set, props = {}) => <input value={valor} onChange={e => set(e.target.value)} className={campo} style={{ borderColor: C.linea }} {...props} />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end gap-2 flex-wrap">
        <Exportar armar={armar} />
        <button type="button" onClick={() => { setPanel('categoria'); setError('') }} className="rounded-xl min-h-[40px] px-3.5 text-sm font-bold" style={{ background: C.suave }}>+ Categoría</button>
        <button type="button" onClick={() => { setItem({ ...itemVacio, empresa_id: getEmpresaId() }); setPanel('item'); setError('') }} className="rounded-xl min-h-[40px] px-3.5 text-sm font-bold" style={{ background: C.suave }}>+ Elemento</button>
        <button type="button" onClick={() => { setMov(movVacio); setPanel('mov'); setError('') }} disabled={!d.items.length} className="rounded-xl min-h-[40px] px-3.5 text-sm font-bold text-white disabled:opacity-40" style={{ background: C.rojo }}>Registrar movimiento</button>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Kpi rotulo="Valor de la bodega interna" valor={fmt$(valor)} nota={`${d.items.length} ${d.items.length === 1 ? 'elemento' : 'elementos'}`} />
        <Kpi rotulo="Bajo el mínimo" valor={`${bajos.length} ${bajos.length === 1 ? 'elemento' : 'elementos'}`} rojo={bajos.length > 0} nota={bajos.slice(0, 3).map(i => i.nombre).join(', ') || 'Ninguno'} />
        <Kpi rotulo="Salidas del mes" valor={salidasMes.length} nota={`${salidasMes.filter(m => m.destino === 'vehiculo').length} para vehículos`} />
      </div>

      {panel && (
        <div className="bg-white rounded-[18px] p-4 flex flex-col gap-3" style={{ boxShadow: `inset 0 0 0 2.5px ${C.tinta}` }}>
          {panel === 'categoria' && <>
            <h2 className="text-lg font-extrabold" style={titulo}>Nueva categoría</h2>
            {inp(nuevaCat, setNuevaCat, { placeholder: 'Ej. Elementos de eventos', 'aria-label': 'Nombre de la categoría' })}
          </>}
          {panel === 'item' && <>
            <h2 className="text-lg font-extrabold" style={titulo}>Nuevo elemento</h2>
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <div><label className={etq}>Nombre</label>{inp(item.nombre, v => setItem({ ...item, nombre: v }), { placeholder: 'Llanta trasera 90/90-18' })}</div>
              <div><label className={etq}>Categoría</label>{sel(item.categoria_id, v => setItem({ ...item, categoria_id: v }), [<option key="" value="">Sin categoría</option>, ...categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)])}</div>
              <div><label className={etq}>Empresa que lo paga</label>{sel(item.empresa_id, v => setItem({ ...item, empresa_id: v }), empresas.map(e => <option key={e.id} value={e.id}>{corto(e.nombre)}</option>))}</div>
              <div><label className={etq}>Unidad</label>{inp(item.unidad, v => setItem({ ...item, unidad: v }), { placeholder: 'und, par, galón…' })}</div>
              <div><label className={etq}>Cantidad actual</label>{inp(item.cantidad, v => setItem({ ...item, cantidad: v }), { inputMode: 'decimal' })}</div>
              <div><label className={etq}>Mínimo</label>{inp(item.minimo, v => setItem({ ...item, minimo: v }), { inputMode: 'decimal' })}</div>
              <div><label className={etq}>Ubicación</label>{inp(item.ubicacion, v => setItem({ ...item, ubicacion: v }), { placeholder: 'Estante 1, bodega posterior…' })}</div>
              <div><label className={etq}>Valor unitario</label>{inp(item.valor_unitario, v => setItem({ ...item, valor_unitario: v }), { inputMode: 'numeric', placeholder: '$' })}</div>
            </div>
            <div><label className={etq}>Nota</label>{inp(item.notas, v => setItem({ ...item, notas: v }))}</div>
          </>}
          {panel === 'mov' && <>
            <h2 className="text-lg font-extrabold" style={titulo}>Registrar movimiento</h2>
            <div className="flex gap-1 rounded-full p-1 flex-wrap w-max" style={{ background: C.fondo }} role="group" aria-label="Tipo de movimiento">
              {[['salida', 'Salida'], ['entrada', 'Entrada'], ['ajuste', 'Ajuste por conteo']].map(([v, n]) => <button key={v} type="button" aria-pressed={mov.tipo === v} onClick={() => setMov({ ...mov, tipo: v })} className="rounded-full min-h-[36px] px-3.5 text-[13.5px] font-bold"
                style={mov.tipo === v ? { background: '#fff', boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { color: C.gris }}>{n}</button>)}
            </div>
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <div><label className={etq}>Elemento</label>{sel(mov.item_id, v => setMov({ ...mov, item_id: v }), [<option key="" value="">Seleccione…</option>, ...d.items.map(i => <option key={i.id} value={i.id}>{i.nombre} · hay {num(i.cantidad)} {i.unidad}</option>)])}</div>
              <div><label className={etq}>{mov.tipo === 'ajuste' ? 'Cantidad contada' : 'Cantidad'}</label>{inp(mov.cantidad, v => setMov({ ...mov, cantidad: v }), { inputMode: 'decimal' })}</div>
              {mov.tipo === 'salida' && <div><label className={etq}>Destino</label>{sel(mov.destino, v => setMov({ ...mov, destino: v }), [['persona', 'Persona'], ['vehiculo', 'Vehículo'], ['area', 'Área o punto de venta'], ['otro', 'Otro']].map(([v, n]) => <option key={v} value={v}>{n}</option>))}</div>}
              {mov.tipo === 'salida' && mov.destino === 'vehiculo' && <div><label className={etq}>Vehículo</label>{sel(mov.vehiculo_id, v => setMov({ ...mov, vehiculo_id: v }), [<option key="" value="">Seleccione…</option>, ...d.vehs.map(v => <option key={v.id} value={v.id}>{v.placa}{v.modelo ? ` · ${v.modelo}` : ''}</option>)])}</div>}
              <div><label className={etq}>{mov.tipo === 'entrada' ? 'Proveedor o procedencia' : 'Responsable'}</label>{inp(mov.responsable, v => setMov({ ...mov, responsable: v }))}</div>
              <div><label className={etq}>Motivo</label>{inp(mov.motivo, v => setMov({ ...mov, motivo: v }), { placeholder: mov.tipo === 'salida' ? 'Cambio de aceite, evento…' : '' })}</div>
            </div>
          </>}
          {error && <p className="text-sm font-bold" style={{ color: C.rojo }}>{error}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => { setPanel(null); setError('') }} className="rounded-xl min-h-[44px] px-4 text-sm font-bold" style={{ background: C.suave }}>Cancelar</button>
            <button type="button" disabled={guardando} onClick={panel === 'item' ? guardarItem : panel === 'mov' ? guardarMov : guardarCategoria} className="rounded-xl min-h-[44px] px-4 text-sm font-bold text-white disabled:opacity-50" style={{ background: C.rojo }}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start">
        <div className="bg-white rounded-[18px] p-4 flex flex-col gap-3 min-w-0">
          <div className="flex gap-2.5 flex-wrap items-center justify-between">
            <div className="flex gap-1 rounded-full p-1 flex-wrap" style={{ background: C.fondo }} role="group" aria-label="Categoría">
              {[['todo', 'Todo'], ...categorias.map(c => [c.nombre, c.nombre])].map(([v, n]) => <button key={v} type="button" aria-pressed={cat === v} onClick={() => setCat(v)} className="rounded-full min-h-[36px] px-3 text-[13px] font-bold"
                style={cat === v ? { background: '#fff', boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { color: C.gris }}>{n}</button>)}
            </div>
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar elemento" aria-label="Buscar elemento" className="h-11 rounded-xl border-2 px-3 text-[15px] bg-white min-w-0 flex-1 max-w-[240px]" style={{ borderColor: C.linea }} />
          </div>
          {d.items.length === 0 ? <p className="text-sm py-6 text-center" style={{ color: C.gris }}>La bodega interna no tiene elementos. Agréguelos con “+ Elemento”.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[560px]">
              <thead><tr className="text-xs uppercase tracking-wide" style={{ color: C.gris }}><th className="py-2 pr-2 text-left">Elemento</th><th className="py-2 pr-2 text-right">Cantidad</th><th className="py-2 pr-2 text-left">Ubicación</th><th className="py-2 pr-2 text-left">Empresa</th><th className="py-2 text-right">Valor</th></tr></thead>
              <tbody>{grupos.map(([g, its]) => [
                <tr key={'g' + g}><td colSpan={5} className="py-1.5 px-2 text-[12px] font-extrabold uppercase tracking-wider" style={{ background: C.fondo, color: C.gris }}>{g}</td></tr>,
                ...its.map(i => (
                  <tr key={i.id} className="border-t" style={{ borderColor: C.linea }}>
                    <td className="py-2.5 pr-2"><b>{i.nombre}</b>{Number(i.minimo) > 0 && Number(i.cantidad) < Number(i.minimo) && <> <Pill tono="ambar">Bajo el mínimo</Pill></>}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums font-extrabold">{num(i.cantidad)} <span className="font-normal" style={{ color: C.gris }}>{i.unidad}</span></td>
                    <td className="py-2.5 pr-2">{i.ubicacion || '—'}</td>
                    <td className="py-2.5 pr-2">{corto(empresas.find(e => e.id === i.empresa_id)?.nombre)}</td>
                    <td className="py-2.5 text-right tabular-nums">{fmt$(Math.max(0, Number(i.cantidad)) * Number(i.valor_unitario || 0))}</td>
                  </tr>
                )),
              ])}</tbody>
            </table></div>
          )}
        </div>
        <div className="bg-white rounded-[18px] p-4 flex flex-col gap-1 min-w-0">
          <h2 className="text-[20px] font-extrabold pb-1" style={titulo}>Últimos movimientos</h2>
          {d.movs.length === 0 ? <p className="text-sm py-2" style={{ color: C.gris }}>Sin movimientos registrados.</p> : d.movs.slice(0, 12).map(m => (
            <div key={m.id} className="flex justify-between gap-3 py-2 border-t first:border-t-0 items-start" style={{ borderColor: C.linea }}>
              <span className="min-w-0 text-sm"><b>{m.tipo === 'ajuste' ? 'Ajuste a' : m.tipo === 'entrada' ? '+' : '−'} {num(m.cantidad)} {m.bodega_items?.unidad} {m.bodega_items?.nombre}</b><br />
                <span className="text-[13px]" style={{ color: C.gris }}>{[m.vehiculos?.placa ? `Vehículo ${m.vehiculos.placa}` : null, m.responsable, m.motivo, new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}</span></span>
              <Pill tono={m.tipo === 'salida' ? 'gris' : m.tipo === 'entrada' ? 'verde' : 'ambar'}>{m.tipo === 'salida' ? 'Salida' : m.tipo === 'entrada' ? 'Entrada' : 'Ajuste'}</Pill>
            </div>
          ))}
          <p className="text-[13px] pt-2" style={{ color: C.gris }}>Las salidas a un vehículo quedan registradas con su placa para su hoja de vida.</p>
        </div>
      </div>
    </div>
  )
}
