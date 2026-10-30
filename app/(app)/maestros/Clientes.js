'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import PreciosEspecialesCliente from '@/components/PreciosEspecialesCliente'
import { C, $, fechaCorta, Pill, Kpi, Kpis, Tarjeta, H2, Nota, Boton, campo, campoEstilo, Campo, Segmento, Tabla, td, Aviso } from '../gastos/ui'

// Clientes de la empresa. Los comerciales (restaurantes, tiendas,
// distribuidores) se administran aquí con su crédito y precios pactados; los
// de ruta, en Rutas (paradas, edificios y torres), aunque aquí se pueden buscar.
const TIPOS = ['Restaurante', 'Tienda', 'Distribuidor', 'Panadería', 'Casa', 'Otro']
const vacio = { nombre: '', nit: '', tipo_negocio: 'Restaurante', telefono: '', direccion: '', barrio: '', notas: '', ruta_id: '', vendedor_id: '', dias_credito: '', cupo_credito: '' }

export default function Clientes({ nuevoRef }) {
  const [d, setD] = useState(null)
  const [grupo, setGrupo] = useState('comerciales')
  const [busqueda, setBusqueda] = useState('')
  const [sel, setSel] = useState(null)
  const [form, setForm] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [historial, setHistorial] = useState(null)

  const cargar = useCallback(async () => {
    const id = getEmpresaId()
    const [{ data: cls }, { data: cart }, { data: rutas }, { data: vends }, { data: precios }] = await Promise.all([
      supabase.from('clientes').select('*').eq('empresa_id', id).order('nombre'),
      supabase.from('cartera_fiados').select('cliente_id, saldo').eq('estado', 'pendiente').not('cliente_id', 'is', null).eq('empresa_id', id),
      supabase.from('rutas').select('id, nombre').eq('estado', true).eq('empresa_id', id).order('nombre'),
      supabase.from('vendedores').select('id, nombre').eq('estado', true).eq('empresa_id', id).order('nombre'),
      supabase.from('clientes_precios').select('cliente_id').eq('empresa_id', id),
    ])
    const saldo = {}, nPrecios = {}
    ;(cart || []).forEach(c => { saldo[c.cliente_id] = (saldo[c.cliente_id] || 0) + Number(c.saldo || 0) })
    ;(precios || []).forEach(p => { nPrecios[p.cliente_id] = (nPrecios[p.cliente_id] || 0) + 1 })
    setD({ clientes: cls || [], saldo, nPrecios, rutas: rutas || [], vends: vends || [] })
  }, [])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { if (nuevoRef) nuevoRef.current = () => { setForm({ ...vacio }); setSel(null) } }, [nuevoRef])

  // Desde el buscador: /maestros?vista=clientes&cliente=<id> abre la ficha de ese cliente.
  const abrirDesde = useCallback((href) => {
    const id = new URL(href, window.location.origin).searchParams.get('cliente')
    const c = id && d?.clientes.find(x => x.id === id)
    if (!c) return
    setGrupo(c.ruta_id || c.edificio_id ? 'ruta' : 'comerciales'); setBusqueda(c.nombre); setForm(null); setSel(c.id)
  }, [d])
  useEffect(() => { if (d) abrirDesde(window.location.href) }, [d]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ir = (e) => abrirDesde(e.detail)
    window.addEventListener('maissy:navegar', ir)
    return () => window.removeEventListener('maissy:navegar', ir)
  }, [abrirDesde])
  useEffect(() => {
    if (!sel) return
    setHistorial(null)
    const id = getEmpresaId()
    Promise.all([
      supabase.from('ventas_encab').select('id, numero, fecha, total, forma_pago, estado, ventas_detalle(*)').eq('cliente_id', sel).eq('empresa_id', id).order('fecha', { ascending: false }).limit(100),
      supabase.from('ventas_ruta').select('id, numero, fecha, created_at, total, forma_pago, estado, ventas_ruta_detalle(sku, nombre, cantidad, subtotal)').eq('cliente_id', sel).eq('empresa_id', id).order('created_at', { ascending: false }).limit(100),
      supabase.from('cartera_fiados').select('fecha_fiado, fecha_pago, valor_original, saldo').eq('cliente_id', sel).eq('estado', 'pendiente').eq('empresa_id', id).order('fecha_fiado'),
      supabase.from('productos').select('sku, nombre').eq('empresa_id', id),
    ]).then(([a, b, c, p]) => {
      const nombres = Object.fromEntries((p.data || []).map(x => [x.sku, x.nombre]))
      const linea = (x) => ({ nombre: x.nombre || nombres[x.sku] || x.sku || 'Producto', cantidad: Number(x.cantidad || 0), subtotal: Number(x.subtotal || 0) })
      const ventas = [
        ...(a.data || []).map(v => ({ ...v, clave: 'm' + v.id, origen: 'Mostrador', lineas: (v.ventas_detalle || []).map(linea) })),
        ...(b.data || []).map(v => ({ ...v, clave: 'r' + v.id, origen: 'Ruta', lineas: (v.ventas_ruta_detalle || []).map(linea) })),
      ].sort((x, y) => String(y.fecha).localeCompare(String(x.fecha)) || String(y.created_at || '').localeCompare(String(x.created_at || '')))
      setHistorial({ ventas, cartera: c.data || [] })
    })
  }, [sel])

  if (!d) return <Nota>Cargando clientes…</Nota>
  const comerciales = d.clientes.filter(c => !c.ruta_id && !c.edificio_id)
  const deRuta = d.clientes.filter(c => c.ruta_id || c.edificio_id)
  const base = grupo === 'comerciales' ? comerciales : deRuta
  const lista = base.filter(c => !busqueda || [c.nombre, c.nit, c.telefono, c.apto, c.edificio].filter(Boolean).join(' ').toLowerCase().includes(busqueda.toLowerCase())).slice(0, 200)
  const conCredito = comerciales.filter(c => Number(c.cupo_credito) > 0 && c.estado)
  const sinDoc = comerciales.filter(c => c.estado && !c.nit).length
  const cliente = d.clientes.find(c => c.id === sel)
  const nombreRuta = (id) => d.rutas.find(r => r.id === id)?.nombre

  const guardar = async () => {
    if (!form.nombre.trim()) { alert('Escriba el nombre del cliente.'); return }
    setGuardando(true)
    const datos = {
      nombre: form.nombre.trim(), nit: form.nit?.trim() || null, tipo_negocio: form.tipo_negocio || null, telefono: form.telefono?.trim() || null,
      direccion: form.direccion?.trim() || null, barrio: form.barrio?.trim() || null, notas: form.notas?.trim() || null,
      ruta_id: form.ruta_id || null, vendedor_id: form.vendedor_id || null,
      dias_credito: form.dias_credito !== '' && form.dias_credito != null ? parseInt(form.dias_credito) : null, cupo_credito: form.cupo_credito !== '' && form.cupo_credito != null ? Number(form.cupo_credito) : null,
    }
    const res = form.id
      ? await supabase.from('clientes').update(datos).eq('id', form.id).select('id').single()
      : await supabase.from('clientes').insert({ ...datos, estado: true, empresa_id: getEmpresaId() }).select('id').single()
    setGuardando(false)
    if (res.error) { alert('No se pudo guardar: ' + res.error.message); return }
    setForm(null); setSel(res.data.id); cargar()
  }
  const alternar = async (c) => {
    if (c.estado && !confirm(`¿Desactivar a ${c.nombre}? Conserva su historial y deja de aparecer para vender.`)) return
    const { error } = await supabase.from('clientes').update({ estado: !c.estado }).eq('id', c.id)
    if (error) { alert('Error: ' + error.message); return }
    cargar()
  }

  return (
    <div className="flex flex-col gap-4">
      {deRuta.length > 0 && <Aviso><b style={{ color: C.tinta }}>Clientes de ruta:</b> los {deRuta.length} clientes de las rutas se administran en <Link href="/rutas" className="font-bold underline" style={{ color: C.tinta }}>Rutas</Link> (paradas, edificios, torres y descuentos). Aquí quedan los clientes comerciales con su crédito.</Aviso>}
      <Kpis>
        <Kpi rotulo="Clientes comerciales" valor={comerciales.filter(c => c.estado).length} nota="Restaurantes, tiendas y distribuidores" />
        <Kpi rotulo="Con crédito" valor={conCredito.length} nota={`Cupo total ${$(conCredito.reduce((s, c) => s + Number(c.cupo_credito), 0))}`} />
        <Kpi rotulo="Cartera" valor={$(comerciales.reduce((s, c) => s + (d.saldo[c.id] || 0), 0))} nota="Saldo de clientes comerciales" />
        <Kpi rotulo="Sin NIT o cédula" valor={sinDoc} rojo={sinDoc > 0} nota="Necesario para facturar" />
      </Kpis>
      {form && (
        <Tarjeta>
          <div className="flex justify-between gap-2 items-center"><H2>{form.id ? `Editar ${form.nombre}` : 'Nuevo cliente'}</H2><Boton onClick={() => setForm(null)}>Cancelar</Boton></div>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <Campo etiqueta="Nombre o razón social"><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="NIT o cédula"><input value={form.nit || ''} onChange={e => setForm({ ...form, nit: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Tipo de negocio">
              <select value={form.tipo_negocio || ''} onChange={e => setForm({ ...form, tipo_negocio: e.target.value })} className={campo} style={campoEstilo}>
                {[...new Set([...TIPOS, form.tipo_negocio].filter(Boolean))].map(t => <option key={t}>{t}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Teléfono"><input inputMode="tel" value={form.telefono || ''} onChange={e => setForm({ ...form, telefono: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Dirección"><input value={form.direccion || ''} onChange={e => setForm({ ...form, direccion: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Barrio"><input value={form.barrio || ''} onChange={e => setForm({ ...form, barrio: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Cupo de crédito"><input inputMode="numeric" value={form.cupo_credito ? Number(form.cupo_credito).toLocaleString('es-CO') : ''} onChange={e => setForm({ ...form, cupo_credito: e.target.value.replace(/\D/g, '') })} placeholder="Contado" className={campo} style={campoEstilo} /></Campo>
            <Campo etiqueta="Plazo de pago (días)"><input inputMode="numeric" value={form.dias_credito ?? ''} onChange={e => setForm({ ...form, dias_credito: e.target.value.replace(/\D/g, '') })} className={campo} style={campoEstilo} /></Campo>
            {d.rutas.length > 0 && (
              <Campo etiqueta="Ruta">
                <select value={form.ruta_id || ''} onChange={e => setForm({ ...form, ruta_id: e.target.value })} className={campo} style={campoEstilo}>
                  <option value="">Sin ruta (cliente comercial)</option>
                  {d.rutas.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
              </Campo>
            )}
            {d.vends.length > 0 && (
              <Campo etiqueta="Vendedor que lo atiende">
                <select value={form.vendedor_id || ''} onChange={e => setForm({ ...form, vendedor_id: e.target.value })} className={campo} style={campoEstilo}>
                  <option value="">Ninguno</option>
                  {d.vends.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                </select>
              </Campo>
            )}
          </div>
          <Campo etiqueta="Nota para el vendedor"><input value={form.notas || ''} onChange={e => setForm({ ...form, notas: e.target.value })} placeholder="Recibe de 7 a 10 a. m., pide factura" className={campo} style={campoEstilo} /></Campo>
          <div className="flex justify-end"><Boton tono="rojo" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cliente'}</Boton></div>
        </Tarjeta>
      )}
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: cliente ? 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))' : '1fr' }}>
        <Tarjeta className={cliente ? 'columna-scroll' : ''}>
          <div className="flex justify-between gap-2 items-center flex-wrap">
            <Segmento etiqueta="Grupo" opciones={[['comerciales', `Comerciales · ${comerciales.length}`], ...(deRuta.length ? [['ruta', `De ruta · ${deRuta.length}`]] : [])]} valor={grupo} onCambio={v => { setGrupo(v); setSel(null) }} />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre, NIT o teléfono" aria-label="Buscar" className={campo} style={{ ...campoEstilo, width: 260 }} />
          </div>
          {lista.length === 0 ? <Nota>Sin clientes.</Nota> : (
            <Tabla columnas={grupo === 'comerciales' ? ['Cliente', { t: 'Tipo', izq: true }, 'NIT o cédula', 'Cupo', 'Plazo', 'Saldo'] : ['Cliente', { t: 'Ruta', izq: true }, 'Teléfono', 'Saldo']} min={grupo === 'comerciales' ? 640 : 480}>
              {lista.map(c => (
                <tr key={c.id} onClick={() => { setSel(c.id); setForm(null) }} className="cursor-pointer" style={{ background: sel === c.id ? C.fondo : undefined, opacity: c.estado ? 1 : 0.55 }}>
                  <td style={td(true)}><b>{c.nombre}</b>{(c.apto || c.edificio) && <span className="block text-[12.5px]" style={{ color: C.gris }}>{[c.edificio, c.torre && `Torre ${c.torre}`, c.apto && `Apto ${c.apto}`].filter(Boolean).join(' · ')}</span>}</td>
                  {grupo === 'comerciales' ? (<>
                    <td style={td(true)}>{c.tipo_negocio || '—'}</td>
                    <td style={td()}>{c.nit || <Pill tono="ambar">Falta</Pill>}</td>
                    <td style={td()}>{Number(c.cupo_credito) ? $(c.cupo_credito) : 'Contado'}</td>
                    <td style={td()}>{c.dias_credito ? `${c.dias_credito} días` : '—'}</td>
                  </>) : (<>
                    <td style={td(true)}>{nombreRuta(c.ruta_id) || '—'}</td>
                    <td style={td()}>{c.telefono || '—'}</td>
                  </>)}
                  <td style={td()}>{d.saldo[c.id] ? <b>{$(d.saldo[c.id])}</b> : '—'}</td>
                </tr>
              ))}
            </Tabla>
          )}
          {base.length > 200 && lista.length === 200 && <Nota>Se muestran los primeros 200; use el buscador.</Nota>}
        </Tarjeta>
        {cliente && (
          <Tarjeta className="columna-scroll">
            <div className="flex justify-between gap-2 items-start">
              <span className="min-w-0"><span className="text-[13px]" style={{ color: C.gris }}>{cliente.tipo_negocio || 'Cliente'}{cliente.nit ? ` · ${cliente.nit}` : ''}</span><H2>{cliente.nombre}</H2></span>
              <button type="button" onClick={() => setSel(null)} className="text-[13px] font-bold shrink-0" style={{ color: C.gris }}>Cerrar</button>
            </div>
            <div className="flex flex-col">
              {[['Teléfono', cliente.telefono], ['Dirección', [cliente.direccion, cliente.barrio].filter(Boolean).join(', ')], ['Ruta', nombreRuta(cliente.ruta_id)], ['Cupo de crédito', Number(cliente.cupo_credito) ? $(cliente.cupo_credito) : 'Contado'], ['Plazo de pago', cliente.dias_credito ? `${cliente.dias_credito} días` : null], ['Saldo en cartera', d.saldo[cliente.id] ? $(d.saldo[cliente.id]) : '$0'], ['Nota para el vendedor', cliente.notas]].filter(([, v]) => v).map(([r, v]) => (
                <div key={r} className="flex justify-between gap-3 py-[7px] text-sm" style={{ borderBottom: `1px solid ${C.linea}` }}><span style={{ color: C.gris }}>{r}</span><b className="text-right">{v}</b></div>
              ))}
            </div>
            {Number(cliente.cupo_credito) > 0 && d.saldo[cliente.id] > Number(cliente.cupo_credito) && <p className="text-[13px]" style={{ color: C.rojo }}>El saldo supera el cupo de crédito.</p>}
            <div>
              <h3 className="text-[15px] font-extrabold mb-1">Precios pactados</h3>
              <PreciosEspecialesCliente clienteId={cliente.id} onCambio={cargar} />
            </div>
            <HistorialCompras historial={historial} />
            {historial?.cartera.length > 0 && (
              <div>
                <h3 className="text-[15px] font-extrabold mb-1">Créditos pendientes</h3>
                {historial.cartera.map((c, i) => (
                  <div key={i} className="flex justify-between gap-3 text-[13px] py-1.5" style={{ borderBottom: `1px solid ${C.linea}` }}>
                    <span style={{ color: C.gris }}>{fechaCorta(c.fecha_fiado)} · vence {fechaCorta(c.fecha_pago)}</span><b className="tabular-nums">{$(c.saldo)}</b>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 flex-wrap"><Boton tono="rojo" onClick={() => setForm({ ...vacio, ...cliente, dias_credito: cliente.dias_credito ?? '', cupo_credito: cliente.cupo_credito ?? '' })}>Editar</Boton><Boton onClick={() => alternar(cliente)}>{cliente.estado ? 'Desactivar' : 'Activar'}</Boton></div>
          </Tarjeta>
        )}
      </div>
    </div>
  )
}

// Historial de compras del cliente (ruta y mostrador): resumen de los últimos
// 90 días y cada compra con sus productos.
function HistorialCompras({ historial }) {
  const [abierta, setAbierta] = useState(null)
  const [todas, setTodas] = useState(false)
  if (!historial) return <div><h3 className="text-[15px] font-extrabold mb-1">Historial de compras</h3><Nota>Cargando…</Nota></div>
  const activas = historial.ventas.filter(v => v.estado !== 'anulada')
  const desde = new Date(Date.now() - 90 * 864e5).toLocaleDateString('en-CA')
  const recientes = activas.filter(v => String(v.fecha) >= desde)
  const total90 = recientes.reduce((s, v) => s + Number(v.total || 0), 0)
  const dias = [...new Set(activas.map(v => String(v.fecha)))].sort()
  const cada = dias.length > 1 ? Math.round((new Date(dias[dias.length - 1] + 'T12:00:00') - new Date(dias[0] + 'T12:00:00')) / 864e5 / (dias.length - 1)) : null
  // Lo que más compra (unidades en los últimos 90 días).
  const porProducto = {}
  recientes.forEach(v => v.lineas.forEach(l => { porProducto[l.nombre] = (porProducto[l.nombre] || 0) + l.cantidad }))
  const top = Object.entries(porProducto).sort((a, b) => b[1] - a[1]).slice(0, 3)
  const lista = todas ? historial.ventas : historial.ventas.slice(0, 15)
  const dato = (r, v) => <div className="flex flex-col min-w-0"><span className="text-[11.5px] font-bold uppercase tracking-wide" style={{ color: C.gris }}>{r}</span><b className="tabular-nums text-[15px] leading-tight">{v}</b></div>

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[15px] font-extrabold">Historial de compras</h3>
      {!historial.ventas.length ? <Nota>Sin compras registradas.</Nota> : (
        <>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-xl p-3" style={{ background: C.suave }}>
            {dato('Últimos 90 días', $(total90))}
            {dato('Compras', `${recientes.length}`)}
            {dato('Última compra', activas[0] ? fechaCorta(activas[0].fecha) : '—')}
            {dato('Compra cada', cada ? `${cada} ${cada === 1 ? 'día' : 'días'}` : '—')}
            {top.length > 0 && <div className="col-span-2 text-[13px]" style={{ color: C.gris }}>Lo que más compra: {top.map(([n, q]) => `${n} (${q.toLocaleString('es-CO')})`).join(' · ')}</div>}
          </div>
          <div className="flex flex-col">
            {lista.map(v => {
              const sel = abierta === v.clave
              return (
                <div key={v.clave} style={{ borderBottom: `1px solid ${C.linea}` }}>
                  <button type="button" onClick={() => setAbierta(sel ? null : v.clave)} aria-expanded={sel} className="w-full flex justify-between gap-3 text-[13px] py-2 text-left">
                    <span className="min-w-0" style={{ color: v.estado === 'anulada' ? C.gris : undefined }}>
                      <b>{fechaCorta(v.fecha)}</b> · {v.origen}{v.numero ? ` N.º ${v.numero}` : ''} · {v.forma_pago === 'credito' ? 'crédito' : v.forma_pago || '—'}{v.estado === 'anulada' ? ' · anulada' : ''}
                    </span>
                    <b className="tabular-nums whitespace-nowrap" style={v.estado === 'anulada' ? { color: C.gris, textDecoration: 'line-through' } : undefined}>{$(v.total)}</b>
                  </button>
                  {sel && (
                    <div className="rounded-xl px-3 py-2 mb-2 text-[13px] flex flex-col gap-1" style={{ background: C.suave }}>
                      {v.lineas.length ? v.lineas.map((l, k) => (
                        <div key={k} className="flex justify-between gap-3"><span className="min-w-0">{l.cantidad.toLocaleString('es-CO')} {l.nombre}</span><span className="tabular-nums whitespace-nowrap">{$(l.subtotal)}</span></div>
                      )) : <span style={{ color: C.gris }}>Sin detalle de productos.</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {historial.ventas.length > 15 && <button type="button" onClick={() => setTodas(!todas)} className="self-start text-[13px] font-bold py-1" style={{ color: C.gris }}>{todas ? 'Ver menos' : `Ver las ${historial.ventas.length} compras`}</button>}
        </>
      )}
    </div>
  )
}
