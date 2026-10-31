'use client'
import BuscadorModulo from '@/components/BuscadorModulo'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { cargarPorPagar } from '@/lib/por-pagar'
import { margenDe } from '@/lib/maestros'
import { C, $, Pill, Kpi, Kpis, Tarjeta, H2, Nota, Boton, campo, campoEstilo, Campo, Tabla, td } from '../gastos/ui'
import { useDestino, mostrarFila } from '@/lib/destino'

// Proveedores de la empresa: productos, compras del mes, saldo por pagar,
// plazo de pago (fecha de vencimiento en Compras y Finanzas) y contacto.
const vacio = { nombre: '', contacto: '', telefono: '', dias_credito: '', frecuencia: '' }
const pctTxt = (m) => m == null ? '—' : m.toFixed(1).replace('.', ',') + '%'

export default function Proveedores({ nuevoRef }) {
  const hoy = obtenerFechaActual()
  const [d, setD] = useState(null)
  const [form, setForm] = useState(null)
  const [abierto, setAbierto] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [verInactivos, setVerInactivos] = useState(false)

  const cargar = useCallback(async () => {
    const id = getEmpresaId(), mes = hoy.slice(0, 7)
    const [{ data: provs }, { data: prods }, { data: compras }, deudas, { data: conf }] = await Promise.all([
      supabase.from('proveedores').select('*').eq('empresa_id', id).order('nombre'),
      supabase.from('productos').select('id, sku, nombre, proveedor_id, costo_compra, precio_venta, estado').eq('empresa_id', id).eq('estado', true).order('nombre'),
      supabase.from('compras_encab').select('proveedor_id, total').eq('empresa_id', id).eq('estado', 'confirmada').gte('fecha', `${mes}-01`),
      cargarPorPagar([id], hoy).catch(() => []),
      supabase.from('configuracion').select('valor').eq('empresa_id', id).eq('parametro', 'plazo_proveedor_dias').maybeSingle(),
    ])
    const comprasMes = {}
    ;(compras || []).forEach(c => { comprasMes[c.proveedor_id] = (comprasMes[c.proveedor_id] || 0) + Number(c.total || 0) })
    setD({ provs: provs || [], prods: prods || [], comprasMes, deuda: Object.fromEntries(deudas.map(x => [x.proveedor_id, x])), plazoGeneral: Number(conf?.valor) || 30 })
  }, [hoy])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { if (nuevoRef) nuevoRef.current = () => setForm({ ...vacio }) }, [nuevoRef])
  useDestino('proveedor', (id) => { setVerInactivos(true); setForm(null); setAbierto(id); mostrarFila(`fila-${id}`) }, !!d)

  if (!d) return <Nota>Cargando proveedores…</Nota>
  const guardar = async () => {
    if (!form.nombre.trim()) { alert('Escriba el nombre del proveedor.'); return }
    setGuardando(true)
    const datos = { nombre: form.nombre.trim(), contacto: form.contacto?.trim() || null, telefono: form.telefono?.trim() || null, dias_credito: parseInt(form.dias_credito) > 0 ? parseInt(form.dias_credito) : null, frecuencia: form.frecuencia?.trim() || null }
    const { error } = form.id
      ? await supabase.from('proveedores').update(datos).eq('id', form.id)
      : await supabase.from('proveedores').insert({ ...datos, estado: true, empresa_id: getEmpresaId() })
    setGuardando(false)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    setForm(null); cargar()
  }
  const alternar = async (p) => {
    if (p.estado && !confirm(`¿Desactivar a ${p.nombre}? Conserva su historial.`)) return
    const { error } = await supabase.from('proveedores').update({ estado: !p.estado }).eq('id', p.id)
    if (error) { alert('Error: ' + error.message); return }
    cargar()
  }
  const asignar = async (productoId, proveedorId) => {
    const { error } = await supabase.from('productos').update({ proveedor_id: proveedorId }).eq('id', productoId)
    if (error) { alert('Error: ' + error.message); return }
    cargar()
  }

  const activos = d.provs.filter(p => p.estado)
  const lista = d.provs.filter(p => verInactivos || p.estado).sort((a, b) => (d.comprasMes[b.id] || 0) - (d.comprasMes[a.id] || 0) || a.nombre.localeCompare(b.nombre))
  const totalMes = Object.values(d.comprasMes).reduce((s, v) => s + v, 0)
  const mayor = activos.reduce((m, p) => (d.comprasMes[p.id] || 0) > (d.comprasMes[m?.id] || 0) ? p : m, null)
  const porPagar = Object.values(d.deuda).reduce((s, x) => s + x.saldo, 0)
  const sinTel = activos.filter(p => !p.telefono).length

  return (
    <div className="flex flex-col gap-4">
      <Kpis>
        <Kpi rotulo="Proveedores activos" valor={activos.length} nota={`${activos.filter(p => d.prods.some(x => x.proveedor_id === p.id)).length} con productos`} />
        <Kpi rotulo="Compras del mes" valor={$(totalMes)} nota={mayor && totalMes ? `${mayor.nombre}: ${Math.round((d.comprasMes[mayor.id] || 0) / totalMes * 100)}%` : 'Sin compras'} />
        <Kpi rotulo="Por pagar" valor={$(porPagar)} nota={`${Object.keys(d.deuda).length} proveedores con saldo`} />
        <Kpi rotulo="Sin teléfono" valor={sinTel} rojo={sinTel > 0} nota="Para pedidos por WhatsApp" />
      </Kpis>
      {form && (
        <Tarjeta>
          <div className="flex justify-between gap-2 items-center"><H2>{form.id ? `Editar ${form.nombre}` : 'Nuevo proveedor'}</H2><Boton onClick={() => setForm(null)}>Cancelar</Boton></div>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <Campo etiqueta="Nombre o razón social"><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Persona de contacto"><input value={form.contacto || ''} onChange={e => setForm({ ...form, contacto: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Teléfono"><input inputMode="tel" value={form.telefono || ''} onChange={e => setForm({ ...form, telefono: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Plazo de pago (días)"><input inputMode="numeric" value={form.dias_credito ?? ''} onChange={e => setForm({ ...form, dias_credito: e.target.value.replace(/\D/g, '') })} placeholder={`General: ${d.plazoGeneral}`} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Días de pedido"><input value={form.frecuencia || ''} onChange={e => setForm({ ...form, frecuencia: e.target.value })} placeholder="Lunes y jueves" className={campo} style={campoEstilo} /></Campo>
          </div>
          <Nota>Si se deja vacío se usa el plazo general de {d.plazoGeneral} días.</Nota>
          <div className="flex justify-end"><Boton tono="rojo" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar proveedor'}</Boton></div>
        </Tarjeta>
      )}
      <Tarjeta>
        <div className="flex justify-between gap-2 items-center flex-wrap">
          <div className="flex justify-between gap-2 items-center flex-wrap"><H2>Proveedores</H2><BuscadorModulo nombre="Proveedores" /></div>
          <label className="flex gap-2 items-center text-sm cursor-pointer"><input type="checkbox" checked={verInactivos} onChange={e => setVerInactivos(e.target.checked)} className="w-[18px] h-[18px]" style={{ accentColor: C.tinta }} />Incluir inactivos</label>
        </div>
        <Tabla columnas={['Proveedor', 'Productos', 'Compras del mes', 'Por pagar', 'Plazo de pago', { t: 'Contacto', izq: true }]} min={720}>
          {lista.map(p => {
            const suyos = d.prods.filter(x => x.proveedor_id === p.id)
            const deuda = d.deuda[p.id]
            return [
              <tr data-fila key={p.id} id={`fila-${p.id}`} onClick={() => setAbierto(abierto === p.id ? null : p.id)} className="cursor-pointer" style={{ background: abierto === p.id ? C.fondo : undefined, opacity: p.estado ? 1 : 0.55 }}>
                <td style={td(true)}><b>{p.nombre}</b>{p.frecuencia && <span className="block text-[12.5px]" style={{ color: C.gris }}>Pedido: {p.frecuencia}</span>}</td>
                <td style={td()}>{suyos.length}</td>
                <td style={td()}>{d.comprasMes[p.id] ? $(d.comprasMes[p.id]) : '—'}</td>
                <td style={td()}>{deuda ? <>{$(deuda.saldo)}{deuda.vence && <span className="block text-[12.5px]" style={{ color: deuda.diasParaVencer < 0 ? C.rojo : C.gris }}>{deuda.diasParaVencer < 0 ? `Vencido hace ${-deuda.diasParaVencer} días` : `Vence en ${deuda.diasParaVencer} días`}</span>}</> : '—'}</td>
                <td style={td()}>{Number(p.dias_credito) > 0 ? `${p.dias_credito} días` : <span style={{ color: C.gris }}>General · {d.plazoGeneral} días</span>}</td>
                <td style={td(true)}>{p.telefono ? <><span className="tabular-nums">{p.telefono}</span>{p.contacto && <span className="block text-[12.5px]" style={{ color: C.gris }}>{p.contacto}</span>}</> : <Pill tono="ambar">Sin teléfono</Pill>}</td>
              </tr>,
              abierto === p.id && (
                <tr key={p.id + 'd'}><td colSpan={6} style={{ padding: 12, background: C.fondo, borderBottom: `1px solid ${C.linea}` }}>
                  <div className="flex flex-col gap-2">
                    {suyos.length === 0 ? <Nota>Sin productos asignados.</Nota> : suyos.map(x => (
                      <div key={x.id} className="flex justify-between gap-3 text-sm flex-wrap">
                        <span><b>{x.nombre}</b> <span style={{ color: C.gris }}>· {x.sku}</span></span>
                        <span className="flex gap-3 items-center tabular-nums">Costo {x.costo_compra ? $(x.costo_compra) : '—'} · margen {pctTxt(margenDe(x.precio_venta, x.costo_compra))}
                          <button type="button" onClick={() => asignar(x.id, null)} className="text-[13px] font-bold" style={{ color: C.gris }}>Quitar</button></span>
                      </div>
                    ))}
                    <div className="flex gap-2 flex-wrap items-center">
                      <select defaultValue="" onChange={e => { if (e.target.value) asignar(e.target.value, p.id) }} aria-label="Asignar producto" className={campo} style={{ ...campoEstilo, maxWidth: 320 }}>
                        <option value="">Asignar un producto…</option>
                        {d.prods.filter(x => x.proveedor_id !== p.id).map(x => <option key={x.id} value={x.id}>{x.nombre}{x.proveedor_id ? ' (tiene otro proveedor)' : ''}</option>)}
                      </select>
                      <Boton tono="blanco" onClick={() => setForm({ ...p, dias_credito: Number(p.dias_credito) > 0 ? p.dias_credito : '' })}>Editar</Boton>
                      <Boton tono="blanco" onClick={() => alternar(p)}>{p.estado ? 'Desactivar' : 'Activar'}</Boton>
                    </div>
                  </div>
                </td></tr>
              ),
            ]
          })}
        </Tabla>
      </Tarjeta>
    </div>
  )
}
