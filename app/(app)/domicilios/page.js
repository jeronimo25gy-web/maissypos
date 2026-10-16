'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { puedeVerModulo } from '@/lib/permisos'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { PageHeader } from '@/components/ui'
import { cargarPromos, promoVigente, precioConPromo, armarLineas } from '@/lib/promociones'
import { ordenarPorDespacho } from '@/lib/orden-productos'
import { DIAS } from '@/lib/rutero'
import InputDinero from '@/components/InputDinero'

// Domicilios: se toma el pedido (telefono o WhatsApp) y le llega al vendedor
// de la ruta en Mi ruta, en la burbuja. El lo entrega desde el carro con
// ticket o marca que no se pudo; aqui se ve como va cada uno.
const fmt = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO')
const sinTildes = (t) => (t || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const NUEVO = { nombre: '', telefono: '', direccion: '', edificio: '', apto: '', barrio: '' }
const ESTADO = { pendiente: ['Por entregar', 'bg-gray-100 text-gray-700'], entregado: ['Entregado', 'bg-emerald-50 text-emerald-800'], no_entregado: ['No se pudo', 'bg-red-50 text-red-800'], cancelado: ['Cancelado', 'bg-gray-100 text-gray-400 line-through'] }
const hora = (iso) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })

export default function Domicilios() {
  const router = useRouter()
  const [usuario, setUsuario] = useState(null)
  const [clientes, setClientes] = useState([])
  const [rutas, setRutas] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [productos, setProductos] = useState([])
  const [preciosRuta, setPreciosRuta] = useState([])
  const [promos, setPromos] = useState([])
  const [lista, setLista] = useState([])
  const [busca, setBusca] = useState('')
  const [cliente, setCliente] = useState(null)
  const [nuevo, setNuevo] = useState(null)
  const [pactados, setPactados] = useState({})
  const [items, setItems] = useState([])
  const [agregar, setAgregar] = useState('')
  const [pedido, setPedido] = useState({ fecha: obtenerFechaActual(), cuando: 'al_pasar', hora: '11:30', forma_pago: 'efectivo', nota: '', ruta_id: '', valor_domicilio: '' })
  const [guardando, setGuardando] = useState(false)
  // Muchos son solo domicilio: el cliente se guarda pero no entra a la ruta,
  // salvo que se marque "Agregar a la ruta" con sus dias de visita.
  const [aRuta, setARuta] = useState({ activo: false, dias: [] })
  const [diasRutero, setDiasRutero] = useState([]) // [{ ruta_id, dia_semana }] del cliente escogido

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (!puedeVerModulo(parsed, 'domicilios', ['admin', 'auxiliar'])) { router.push('/despacho'); return }
    setUsuario(parsed)
    cargarTodo()
  }, [])

  const cargarTodo = async () => {
    const empresaId = getEmpresaId()
    const [{ data: cl }, { data: rs }, { data: vs }, { data: pr }, { data: rp }, pm] = await Promise.all([
      supabase.from('clientes').select('id, nombre, telefono, direccion, edificio, apto, barrio, ruta_id, solo_domicilio').eq('estado', true).eq('empresa_id', empresaId).order('nombre'),
      supabase.from('rutas').select('id, nombre').eq('estado', true).eq('empresa_id', empresaId).order('nombre'),
      supabase.from('vendedores').select('id, nombre, ruta_id').eq('estado', true).eq('empresa_id', empresaId),
      supabase.from('productos').select('sku, nombre, precio_venta, orden_despacho').eq('estado', true).neq('tipo', 'materia_prima').eq('empresa_id', empresaId),
      supabase.from('rutas_precios').select('ruta_id, sku, precio_especial').eq('empresa_id', empresaId),
      cargarPromos(empresaId),
    ])
    setClientes(cl || []); setRutas(rs || []); setVendedores(vs || []); setProductos(ordenarPorDespacho(pr || [])); setPreciosRuta(rp || []); setPromos(pm)
    cargarLista()
  }

  const cargarLista = async () => {
    const hoy = obtenerFechaActual()
    const { data } = await supabase.from('domicilios').select('*, rutas(nombre), vendedores(nombre), domicilios_detalle(sku, nombre, cantidad)')
      .eq('empresa_id', getEmpresaId()).or(`fecha.gte.${hoy},estado.eq.pendiente`).order('created_at', { ascending: false })
    setLista(data || [])
  }

  const escoger = async (c) => {
    setCliente(c); setNuevo(null); setBusca(''); setARuta({ activo: false, dias: [] })
    setPedido(p => ({ ...p, ruta_id: c.ruta_id || p.ruta_id }))
    const [{ data }, { data: rt }] = await Promise.all([
      supabase.from('clientes_precios').select('sku, precio_especial').eq('cliente_id', c.id).eq('empresa_id', getEmpresaId()),
      supabase.from('rutero').select('ruta_id, dia_semana').eq('cliente_id', c.id).eq('empresa_id', getEmpresaId()),
    ])
    setPactados(Object.fromEntries((data || []).map(x => [x.sku, Number(x.precio_especial)])))
    setDiasRutero(rt || [])
  }

  // Lo deja de ultimo en el rutero de esos dias de la ruta.
  const agregarAlRutero = async (clienteId, rutaId, dias) => {
    const empresaId = getEmpresaId()
    for (const d of dias) {
      const { count } = await supabase.from('rutero').select('id', { count: 'exact', head: true }).eq('ruta_id', rutaId).eq('dia_semana', d).eq('empresa_id', empresaId)
      await supabase.from('rutero').insert({ empresa_id: empresaId, cliente_id: clienteId, ruta_id: rutaId, dia_semana: d, orden: (count || 0) + 1 })
    }
  }

  // Mismo precio que vera el vendedor en Mi ruta: pactado del cliente, si no
  // el de la ruta con su promo.
  const productoConPrecio = (sku) => {
    const p = productos.find(x => x.sku === sku)
    if (!p) return null
    if (pactados[sku]) return { ...p, precio: pactados[sku], promo: null }
    const base = Number(preciosRuta.find(r => r.ruta_id === pedido.ruta_id && r.sku === sku)?.precio_especial ?? p.precio_venta ?? 0)
    const promo = promoVigente(promos, sku, pedido.ruta_id, pedido.fecha, { sinFecha: true })
    return { ...p, precio: precioConPromo(base, promo), promo }
  }
  const lineas = items.flatMap(it => { const p = productoConPrecio(it.sku); return p ? armarLineas(p, Number(it.cantidad) || 0, p.promo) : [] })
  const totalProductos = lineas.reduce((s, l) => s + l.subtotal, 0)
  const valorDomicilio = parseFloat(pedido.valor_domicilio) || 0
  const total = totalProductos + valorDomicilio

  const q = sinTildes(busca).split(/\s+/).filter(Boolean)
  const resultados = q.length ? clientes.filter(c => { const t = sinTildes([c.nombre, c.edificio, c.apto, c.direccion, c.barrio, c.telefono].join(' ')); return q.every(w => t.includes(w)) }).slice(0, 8) : []
  const vendedorDe = (rutaId) => vendedores.find(v => v.ruta_id === rutaId)

  const limpiar = () => { setCliente(null); setNuevo(null); setItems([]); setPactados({}); setDiasRutero([]); setARuta({ activo: false, dias: [] }); setPedido(p => ({ ...p, nota: '', forma_pago: 'efectivo', cuando: 'al_pasar', valor_domicilio: '' })) }

  const enviar = async () => {
    if (!cliente && !nuevo?.nombre.trim()) { alert('Escoge el cliente o escribe el nombre del nuevo'); return }
    if (lineas.length === 0) { alert('Agrega al menos un producto'); return }
    if (!pedido.ruta_id) { alert('Escoge qué ruta lo lleva'); return }
    if (aRuta.activo && aRuta.dias.length === 0) { alert('Escoge qué días se le visita, o quita "Agregar a la ruta"'); return }
    setGuardando(true)
    const empresaId = getEmpresaId()
    let c = cliente
    if (!c) {
      const datos = Object.fromEntries(Object.entries(nuevo).map(([k, v]) => [k, v.trim() || null]))
      const deRuta = aRuta.activo
      const { data, error } = await supabase.from('clientes').insert({ ...datos, empresa_id: empresaId, ruta_id: deRuta ? pedido.ruta_id : null, vendedor_id: deRuta ? vendedorDe(pedido.ruta_id)?.id || null : null, estado: true, solo_domicilio: !deRuta })
        .select('id, nombre, telefono, direccion, edificio, apto, barrio, ruta_id').single()
      if (error) { setGuardando(false); alert('No se pudo crear el cliente: ' + error.message); return }
      c = data
    } else if (aRuta.activo) {
      await supabase.from('clientes').update({ solo_domicilio: false, ...(c.ruta_id ? {} : { ruta_id: pedido.ruta_id, vendedor_id: vendedorDe(pedido.ruta_id)?.id || null }) }).eq('id', c.id).eq('empresa_id', empresaId)
    }
    if (aRuta.activo) await agregarAlRutero(c.id, pedido.ruta_id, aRuta.dias)
    const { data: d, error } = await supabase.from('domicilios').insert({
      empresa_id: empresaId, fecha: pedido.fecha, cliente_id: c.id, nombre_cliente: c.nombre,
      telefono: c.telefono, direccion: c.direccion, edificio: c.edificio, apto: c.apto, barrio: c.barrio,
      ruta_id: pedido.ruta_id, vendedor_id: vendedorDe(pedido.ruta_id)?.id || null,
      hora_limite: pedido.cuando === 'antes' ? pedido.hora : null, forma_pago: pedido.forma_pago, nota: pedido.nota.trim() || null,
      total, valor_domicilio: valorDomicilio, tomado_por: usuario?.nombre || null,
    }).select('id').single()
    if (error) { setGuardando(false); alert('No se pudo guardar: ' + error.message); return }
    const porSku = {}
    lineas.forEach(l => { const x = (porSku[l.sku] = porSku[l.sku] || { sku: l.sku, nombre: productos.find(p => p.sku === l.sku)?.nombre, cantidad: 0, subtotal: 0 }); x.cantidad += l.cantidad; x.subtotal += l.subtotal })
    await supabase.from('domicilios_detalle').insert(Object.values(porSku).map(x => ({ ...x, domicilio_id: d.id, empresa_id: empresaId })))
    setGuardando(false)
    limpiar()
    if (!cliente || aRuta.activo) cargarTodo(); else cargarLista()
  }

  const cancelar = async (d) => {
    if (!confirm(`¿Cancelar el domicilio de ${d.nombre_cliente}? Se le quita al vendedor.`)) return
    await supabase.from('domicilios').update({ estado: 'cancelado', resuelto_at: new Date().toISOString() }).eq('id', d.id).eq('empresa_id', getEmpresaId())
    cargarLista()
  }

  if (!usuario) return null
  // Mismo look del boceto y de Mi ruta: fondo crema, tarjetas blancas, Bricolage en titulos y cifras.
  const TINTA = '#1C1B19', GRIS = '#5A5750', FONDO = '#F3F1EA', LINEA = '#E3E1D8'
  const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
  const campo = 'block w-full min-w-0 max-w-full border-2 rounded-xl px-3 min-h-[46px] text-[15px] bg-white focus:outline-none focus:border-[#1C1B19]'
  const etiqueta = 'flex flex-col gap-1.5 min-w-0 text-[13px] font-bold'
  const pendientes = lista.filter(d => d.estado === 'pendiente').length
  const detalleDe = (c) => [c.edificio, c.apto, c.direccion, c.barrio].filter(Boolean).filter(t => !c.nombre.includes(t)).join(' · ')
  const PILL = { pendiente: { color: GRIS, background: FONDO }, entregado: { color: '#2E5E3A', background: '#E6F0E8' }, no_entregado: { color: '#8E1117', background: '#FBE9E9' }, cancelado: { color: '#9A968C', background: FONDO, textDecoration: 'line-through' } }
  const rutaSel = rutas.find(r => r.id === pedido.ruta_id)

  return (
    <div style={{ background: FONDO, color: TINTA, minHeight: '100vh' }}>
      <PageHeader title="Domicilios" subtitle="Pedidos por teléfono o WhatsApp · le llegan al vendedor de la ruta en Mi ruta" />
      <div className="p-4 max-w-6xl mx-auto grid gap-4 md:grid-cols-2 items-start">
        <div className="bg-white rounded-[20px] p-[18px] flex flex-col gap-3.5 min-w-0">
          <p className="font-extrabold text-[22px]" style={titulo}>Tomar pedido</p>

          {!cliente && !nuevo && (
            <>
              <label className={etiqueta} style={{ color: GRIS }}>Cliente
                <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nombre, apto, edificio, barrio o teléfono" className={campo} style={{ borderColor: busca ? TINTA : LINEA, color: TINTA, fontWeight: 400 }} autoFocus />
              </label>
              {resultados.length > 0 && (
                <div className="border rounded-xl overflow-hidden" style={{ borderColor: LINEA }}>
                  {resultados.map((c, i) => (
                    <button key={c.id} onClick={() => escoger(c)} className="w-full text-left px-3 py-2.5 flex justify-between gap-3 text-sm hover:bg-[#FFF4CC]" style={i ? { borderTop: `1px solid ${LINEA}` } : undefined}>
                      <span className="min-w-0"><b>{c.nombre}</b> <span style={{ color: GRIS }}>{detalleDe(c)}</span></span>
                      <span className="text-xs shrink-0" style={{ color: GRIS }}>{c.solo_domicilio ? 'Solo domicilio' : rutas.find(r => r.id === c.ruta_id)?.nombre || 'Sin ruta'}</span>
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setNuevo({ ...NUEVO, nombre: busca })} className="self-start text-sm font-bold text-brand">+ Cliente nuevo</button>
            </>
          )}

          {cliente && (
            <div className="rounded-xl px-3 py-2.5 flex justify-between gap-3 text-sm" style={{ background: '#FFF4CC' }}>
              <span className="min-w-0"><b>{cliente.nombre}</b> <span style={{ color: GRIS }}>{detalleDe(cliente)}{cliente.telefono ? ` · ${cliente.telefono}` : ''}</span>
                {Object.keys(pactados).length > 0 && <span className="block text-xs font-bold" style={{ color: '#8A5A00' }}>Tiene descuento: se le cobra su precio pactado</span>}
              </span>
              <button onClick={() => { setCliente(null); setPactados({}) }} className="text-xs font-bold shrink-0 text-brand">Cambiar</button>
            </div>
          )}

          {nuevo && (
            <div className="rounded-xl p-3 flex flex-col gap-2 border" style={{ borderColor: LINEA }}>
              <div className="flex justify-between items-center"><p className="text-sm font-bold">Cliente nuevo</p><button onClick={() => setNuevo(null)} className="text-xs font-bold text-brand">Buscar otro</button></div>
              <input value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Nombre" className={campo} style={{ borderColor: LINEA }} />
              <div className="grid grid-cols-2 gap-2">
                {[['telefono', 'Teléfono'], ['direccion', 'Dirección'], ['edificio', 'Edificio o negocio'], ['apto', 'Apto / piso'], ['barrio', 'Barrio']].map(([k, t]) => (
                  <input key={k} value={nuevo[k]} onChange={e => setNuevo({ ...nuevo, [k]: e.target.value })} placeholder={t} inputMode={k === 'telefono' ? 'tel' : undefined} className={campo} style={{ borderColor: LINEA }} />
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-bold" style={{ color: GRIS }}>Productos</p>
            {items.map((it, i) => {
              const p = productoConPrecio(it.sku)
              const ls = p ? armarLineas(p, Number(it.cantidad) || 0, p.promo) : []
              const paq = ls.find(l => l.paquetes)?.paquetes
              return (
                <div key={it.sku} className="flex items-center gap-2 text-[15px]">
                  <span className="flex-1 min-w-0">{p?.nombre || it.sku}
                    {paq ? <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color: '#2E5E3A', background: '#E6F0E8' }}>= {paq} promo{paq > 1 ? 's' : ''}</span> : null}
                    {pactados[it.sku] ? <span className="ml-2 text-xs font-bold" style={{ color: '#8A5A00' }}>pactado</span> : null}
                  </span>
                  <input type="number" min="0" inputMode="numeric" value={it.cantidad} onFocus={e => e.target.select()} aria-label={`Cantidad de ${p?.nombre || it.sku}`}
                    onChange={e => setItems(items.map((x, j) => j === i ? { ...x, cantidad: e.target.value } : x))}
                    className="w-16 border-2 rounded-[10px] py-2 text-center font-bold" style={{ borderColor: LINEA }} />
                  <b className="w-20 text-right tabular-nums">{fmt(ls.reduce((s, l) => s + l.subtotal, 0))}</b>
                  <button onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Quitar" style={{ color: GRIS }}>✕</button>
                </div>
              )
            })}
            <select value={agregar} onChange={e => { const sku = e.target.value; if (sku && !items.some(x => x.sku === sku)) setItems([...items, { sku, cantidad: '1' }]); setAgregar('') }} className={campo + ' font-bold text-brand'} style={{ borderColor: LINEA }}>
              <option value="">+ Agregar producto</option>
              {productos.filter(p => !items.some(x => x.sku === p.sku)).map(p => <option key={p.sku} value={p.sku}>{p.nombre}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <label className={etiqueta} style={{ color: GRIS }}>Fecha
              <input type="date" value={pedido.fecha} onChange={e => setPedido({ ...pedido, fecha: e.target.value })} className={campo} style={{ borderColor: LINEA, color: TINTA }} />
            </label>
            <label className={etiqueta} style={{ color: GRIS }}>¿Para cuándo?
              <select value={pedido.cuando} onChange={e => setPedido({ ...pedido, cuando: e.target.value })} className={campo} style={{ borderColor: LINEA, color: TINTA }}>
                <option value="al_pasar">Cuando pase</option>
                <option value="antes">Antes de una hora</option>
              </select>
            </label>
            {pedido.cuando === 'antes' && (
              <label className={etiqueta + ' col-span-2'} style={{ color: GRIS }}>Antes de las
                <input type="time" value={pedido.hora} onChange={e => setPedido({ ...pedido, hora: e.target.value })} className={campo} style={{ borderColor: LINEA, color: TINTA }} />
              </label>
            )}
            <label className={etiqueta} style={{ color: GRIS }}>Paga con
              <select value={pedido.forma_pago} onChange={e => setPedido({ ...pedido, forma_pago: e.target.value })} className={campo} style={{ borderColor: LINEA, color: TINTA }}>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="credito">Crédito</option>
              </select>
            </label>
            <label className={etiqueta} style={{ color: GRIS }}>Lo lleva la ruta
              <select value={pedido.ruta_id} onChange={e => setPedido({ ...pedido, ruta_id: e.target.value })} className={campo} style={{ borderColor: LINEA, color: TINTA }}>
                <option value="">Escoge</option>
                {rutas.map(r => <option key={r.id} value={r.id}>{r.nombre}{vendedorDe(r.id) ? ` · ${vendedorDe(r.id).nombre}` : ''}</option>)}
              </select>
            </label>
          </div>
          <label className={etiqueta} style={{ color: GRIS }}>Valor del domicilio
            <InputDinero value={pedido.valor_domicilio} onChange={e => setPedido({ ...pedido, valor_domicilio: e.target.value })} placeholder="0 si no se cobra" className={campo} style={{ borderColor: LINEA, color: TINTA }} />
          </label>
          {items.length > 0 && (
            <div className="rounded-xl px-3 py-2.5 text-sm flex flex-col gap-1" style={{ background: FONDO }}>
              <div className="flex justify-between"><span>Productos</span><b className="tabular-nums">{fmt(totalProductos)}</b></div>
              <div className="flex justify-between"><span>Domicilio</span><b className="tabular-nums">{fmt(valorDomicilio)}</b></div>
              <div className="flex justify-between pt-1 border-t" style={{ borderColor: LINEA }}><span className="font-bold">Total a cobrar</span><b className="tabular-nums text-base" style={titulo}>{fmt(total)}</b></div>
            </div>
          )}
          <label className={etiqueta} style={{ color: GRIS }}>Nota para el vendedor
            <input value={pedido.nota} onChange={e => setPedido({ ...pedido, nota: e.target.value })} placeholder="Dejar en portería, timbrar al 401..." className={campo} style={{ borderColor: LINEA, color: TINTA, fontWeight: 400 }} />
          </label>
          {rutaSel && (
            <div className="rounded-xl px-3 py-2.5 text-sm" style={{ background: FONDO }}>
              Lo lleva <b>{vendedorDe(rutaSel.id)?.nombre || 'el vendedor'}</b> · {rutaSel.nombre}{cliente?.ruta_id === rutaSel.id ? ' (la del cliente)' : ''}
            </div>
          )}
          {(cliente || nuevo) && pedido.ruta_id && (() => {
            const yaDias = diasRutero.filter(r => r.ruta_id === pedido.ruta_id).map(r => DIAS.find(d => d.n === r.dia_semana)?.corto).filter(Boolean)
            if (cliente && yaDias.length) return <p className="text-xs" style={{ color: GRIS }}>Ya está en el rutero de esta ruta: {yaDias.join(', ')}.</p>
            return (
              <div className="rounded-xl border-2 p-3" style={{ borderColor: aRuta.activo ? TINTA : LINEA }}>
                <label className="flex items-center gap-2 text-sm font-bold">
                  <input type="checkbox" checked={aRuta.activo} onChange={e => setARuta({ ...aRuta, activo: e.target.checked })} className="w-5 h-5 accent-[#1C1B19]" />
                  Agregar a la ruta {rutaSel?.nombre}
                </label>
                {!aRuta.activo
                  ? <p className="text-xs mt-1" style={{ color: GRIS }}>Si no lo marcas, queda como <b>solo domicilio</b>: se guarda aparte para encontrarlo después, sin entrar al rutero.</p>
                  : (
                    <div className="mt-2">
                      <p className="text-xs mb-1.5" style={{ color: GRIS }}>¿Qué días se le visita? Entra de último en el rutero de esos días.</p>
                      <div className="flex flex-wrap gap-1.5">
                        {DIAS.map(d => {
                          const on = aRuta.dias.includes(d.n)
                          return <button key={d.n} type="button" onClick={() => setARuta({ ...aRuta, dias: on ? aRuta.dias.filter(x => x !== d.n) : [...aRuta.dias, d.n] })} aria-pressed={on}
                            className="px-3 min-h-[38px] rounded-xl text-sm font-bold" style={on ? { background: TINTA, color: '#fff' } : { background: FONDO }}>{d.corto}</button>
                        })}
                      </div>
                    </div>
                  )}
              </div>
            )
          })()}
          <button onClick={enviar} disabled={guardando} className="min-h-[54px] rounded-2xl bg-brand text-white font-bold text-base disabled:opacity-50">
            {guardando ? 'Enviando...' : `Enviar a Mi ruta · ${fmt(total)}`}
          </button>
        </div>

        <div className="bg-white rounded-[20px] p-[18px] min-w-0">
          <div className="flex justify-between items-center gap-2">
            <p className="font-extrabold text-[22px]" style={titulo}>Domicilios de hoy</p>
            <button onClick={cargarLista} className="text-sm font-bold px-3 min-h-[40px] rounded-xl" style={{ background: FONDO }}>Actualizar</button>
          </div>
          <p className="text-sm mb-2" style={{ color: GRIS }}>{lista.length} hoy · {pendientes} por entregar</p>
          {lista.length === 0 && <p className="text-sm py-6 text-center" style={{ color: GRIS }}>Todavía no hay domicilios hoy</p>}
          <div>
            {lista.map((d, i) => (
              <div key={d.id} className="py-3 grid grid-cols-[52px_1fr_auto] gap-2.5 items-start text-sm" style={i ? { borderTop: `1px solid #EFEDE6` } : undefined}>
                <span className="tabular-nums" style={{ color: GRIS }}>{hora(d.created_at)}</span>
                <div className="min-w-0">
                  <p><b>{d.nombre_cliente}</b> <span style={{ color: GRIS }}>· {d.rutas?.nombre}{d.vendedores?.nombre ? ` · ${d.vendedores.nombre}` : ''}</span></p>
                  <p style={{ color: GRIS }}>{(d.domicilios_detalle || []).map(x => `${x.cantidad} ${x.nombre || x.sku}`).join(' · ')}{Number(d.valor_domicilio) > 0 ? ` · domicilio ${fmt(d.valor_domicilio)}` : ''} · <b style={{ color: TINTA }}>{fmt(d.total)}</b></p>
                  <p className="text-xs mt-0.5" style={{ color: '#9A968C' }}>{d.fecha !== obtenerFechaActual() ? `Para el ${d.fecha} · ` : ''}{d.hora_limite ? `antes de ${d.hora_limite.slice(0, 5)}` : 'cuando pase'} · {d.forma_pago}{d.tomado_por ? ` · lo tomó ${d.tomado_por}` : ''}{d.motivo ? ` · ${d.motivo}` : ''}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs font-bold px-2.5 py-1.5 rounded-full whitespace-nowrap" style={PILL[d.estado]}>{ESTADO[d.estado][0]}{d.estado === 'entregado' && d.resuelto_at ? ' ' + hora(d.resuelto_at) : ''}</span>
                  {d.estado === 'pendiente' && <button onClick={() => cancelar(d)} className="text-xs underline" style={{ color: GRIS }}>Cancelar</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
