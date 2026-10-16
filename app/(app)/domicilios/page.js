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
  const [pedido, setPedido] = useState({ fecha: obtenerFechaActual(), cuando: 'al_pasar', hora: '11:30', forma_pago: 'efectivo', nota: '', ruta_id: '' })
  const [guardando, setGuardando] = useState(false)

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
      supabase.from('clientes').select('id, nombre, telefono, direccion, edificio, apto, barrio, ruta_id').eq('estado', true).eq('empresa_id', empresaId).order('nombre'),
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
    setCliente(c); setNuevo(null); setBusca('')
    setPedido(p => ({ ...p, ruta_id: c.ruta_id || p.ruta_id }))
    const { data } = await supabase.from('clientes_precios').select('sku, precio_especial').eq('cliente_id', c.id).eq('empresa_id', getEmpresaId())
    setPactados(Object.fromEntries((data || []).map(x => [x.sku, Number(x.precio_especial)])))
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
  const total = lineas.reduce((s, l) => s + l.subtotal, 0)

  const q = sinTildes(busca).split(/\s+/).filter(Boolean)
  const resultados = q.length ? clientes.filter(c => { const t = sinTildes([c.nombre, c.edificio, c.apto, c.direccion, c.barrio, c.telefono].join(' ')); return q.every(w => t.includes(w)) }).slice(0, 8) : []
  const vendedorDe = (rutaId) => vendedores.find(v => v.ruta_id === rutaId)

  const limpiar = () => { setCliente(null); setNuevo(null); setItems([]); setPactados({}); setPedido(p => ({ ...p, nota: '', forma_pago: 'efectivo', cuando: 'al_pasar' })) }

  const enviar = async () => {
    if (!cliente && !nuevo?.nombre.trim()) { alert('Escoge el cliente o escribe el nombre del nuevo'); return }
    if (lineas.length === 0) { alert('Agrega al menos un producto'); return }
    if (!pedido.ruta_id) { alert('Escoge qué ruta lo lleva'); return }
    setGuardando(true)
    const empresaId = getEmpresaId()
    let c = cliente
    if (!c) {
      const datos = Object.fromEntries(Object.entries(nuevo).map(([k, v]) => [k, v.trim() || null]))
      const { data, error } = await supabase.from('clientes').insert({ ...datos, empresa_id: empresaId, ruta_id: pedido.ruta_id, vendedor_id: vendedorDe(pedido.ruta_id)?.id || null, estado: true })
        .select('id, nombre, telefono, direccion, edificio, apto, barrio, ruta_id').single()
      if (error) { setGuardando(false); alert('No se pudo crear el cliente: ' + error.message); return }
      c = data
    }
    const { data: d, error } = await supabase.from('domicilios').insert({
      empresa_id: empresaId, fecha: pedido.fecha, cliente_id: c.id, nombre_cliente: c.nombre,
      telefono: c.telefono, direccion: c.direccion, edificio: c.edificio, apto: c.apto, barrio: c.barrio,
      ruta_id: pedido.ruta_id, vendedor_id: vendedorDe(pedido.ruta_id)?.id || null,
      hora_limite: pedido.cuando === 'antes' ? pedido.hora : null, forma_pago: pedido.forma_pago, nota: pedido.nota.trim() || null,
      total, tomado_por: usuario?.nombre || null,
    }).select('id').single()
    if (error) { setGuardando(false); alert('No se pudo guardar: ' + error.message); return }
    const porSku = {}
    lineas.forEach(l => { const x = (porSku[l.sku] = porSku[l.sku] || { sku: l.sku, nombre: productos.find(p => p.sku === l.sku)?.nombre, cantidad: 0, subtotal: 0 }); x.cantidad += l.cantidad; x.subtotal += l.subtotal })
    await supabase.from('domicilios_detalle').insert(Object.values(porSku).map(x => ({ ...x, domicilio_id: d.id, empresa_id: empresaId })))
    setGuardando(false)
    limpiar()
    if (!cliente) cargarTodo(); else cargarLista()
  }

  const cancelar = async (d) => {
    if (!confirm(`¿Cancelar el domicilio de ${d.nombre_cliente}? Se le quita al vendedor.`)) return
    await supabase.from('domicilios').update({ estado: 'cancelado', resuelto_at: new Date().toISOString() }).eq('id', d.id).eq('empresa_id', getEmpresaId())
    cargarLista()
  }

  if (!usuario) return null
  const campo = 'w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:border-brand focus:outline-none bg-white'
  const pendientes = lista.filter(d => d.estado === 'pendiente').length

  return (
    <div>
      <PageHeader title="Domicilios" subtitle="Pedidos por teléfono o WhatsApp · le llegan al vendedor de la ruta en Mi ruta" />
      <div className="p-4 max-w-6xl mx-auto grid gap-4 md:grid-cols-2 items-start">
        <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-3">
          <p className="font-black text-gray-900 text-lg">Tomar pedido</p>

          {!cliente && !nuevo && (
            <>
              <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Cliente: nombre, apto, edificio, barrio o teléfono" className={campo} autoFocus />
              {resultados.length > 0 && (
                <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                  {resultados.map(c => (
                    <button key={c.id} onClick={() => escoger(c)} className="w-full text-left px-3 py-2 hover:bg-amber-50 flex justify-between gap-3 text-sm">
                      <span className="min-w-0"><b className="text-gray-900">{c.nombre}</b> <span className="text-gray-500">{[c.edificio, c.apto, c.direccion, c.barrio].filter(Boolean).filter(t => !c.nombre.includes(t)).join(' · ')}</span></span>
                      <span className="text-xs text-gray-400 shrink-0">{rutas.find(r => r.id === c.ruta_id)?.nombre || 'Sin ruta'}</span>
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setNuevo({ ...NUEVO, nombre: busca })} className="self-start text-sm font-bold text-brand">+ Cliente nuevo</button>
            </>
          )}

          {cliente && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex justify-between gap-3 text-sm">
              <span className="min-w-0"><b className="text-gray-900">{cliente.nombre}</b> <span className="text-gray-600">{[cliente.edificio, cliente.apto, cliente.direccion, cliente.barrio].filter(Boolean).filter(t => !cliente.nombre.includes(t)).join(' · ')}{cliente.telefono ? ` · ${cliente.telefono}` : ''}</span>
                {Object.keys(pactados).length > 0 && <span className="block text-xs font-bold text-amber-900">Tiene descuento: se le cobra su precio pactado</span>}
              </span>
              <button onClick={() => { setCliente(null); setPactados({}) }} className="text-xs font-bold text-gray-500 shrink-0">Cambiar</button>
            </div>
          )}

          {nuevo && (
            <div className="border border-gray-200 rounded-xl p-3 flex flex-col gap-2">
              <div className="flex justify-between items-center"><p className="text-sm font-bold text-gray-700">Cliente nuevo</p><button onClick={() => setNuevo(null)} className="text-xs font-bold text-gray-500">Buscar otro</button></div>
              <input value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Nombre" className={campo} />
              <div className="grid grid-cols-2 gap-2">
                {[['telefono', 'Teléfono'], ['direccion', 'Dirección'], ['edificio', 'Edificio o negocio'], ['apto', 'Apto / piso'], ['barrio', 'Barrio']].map(([k, t]) => (
                  <input key={k} value={nuevo[k]} onChange={e => setNuevo({ ...nuevo, [k]: e.target.value })} placeholder={t} className={campo} />
                ))}
              </div>
              <p className="text-xs text-gray-500">Queda creado en la ruta que lo lleve; el día de visita se le pone en Rutas si va a quedar fijo.</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Productos</p>
            {items.map((it, i) => {
              const p = productoConPrecio(it.sku)
              const ls = p ? armarLineas(p, Number(it.cantidad) || 0, p.promo) : []
              const paq = ls.find(l => l.paquetes)?.paquetes
              return (
                <div key={it.sku} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 min-w-0 text-gray-800">{p?.nombre || it.sku}{paq ? <span className="ml-2 text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full">{paq} promo{paq > 1 ? 's' : ''}</span> : null}{pactados[it.sku] ? <span className="ml-2 text-xs font-bold text-amber-900">pactado</span> : null}</span>
                  <input type="number" min="0" inputMode="numeric" value={it.cantidad} onFocus={e => e.target.select()}
                    onChange={e => setItems(items.map((x, j) => j === i ? { ...x, cantidad: e.target.value } : x))}
                    className="w-16 border-2 border-gray-200 rounded-lg px-2 py-1.5 text-center font-bold" />
                  <b className="w-20 text-right">{fmt(ls.reduce((s, l) => s + l.subtotal, 0))}</b>
                  <button onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Quitar" className="text-gray-400 hover:text-brand">✕</button>
                </div>
              )
            })}
            <select value={agregar} onChange={e => { const sku = e.target.value; if (sku && !items.some(x => x.sku === sku)) setItems([...items, { sku, cantidad: '1' }]); setAgregar('') }} className={campo}>
              <option value="">+ Agregar producto</option>
              {productos.filter(p => !items.some(x => x.sku === p.sku)).map(p => <option key={p.sku} value={p.sku}>{p.nombre}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-bold text-gray-500">Fecha
              <input type="date" value={pedido.fecha} onChange={e => setPedido({ ...pedido, fecha: e.target.value })} className={campo + ' mt-1'} />
            </label>
            <label className="text-xs font-bold text-gray-500">¿Para cuándo?
              <div className="flex gap-1 mt-1">
                <select value={pedido.cuando} onChange={e => setPedido({ ...pedido, cuando: e.target.value })} className={campo}>
                  <option value="al_pasar">Cuando pase</option>
                  <option value="antes">Antes de…</option>
                </select>
                {pedido.cuando === 'antes' && <input type="time" value={pedido.hora} onChange={e => setPedido({ ...pedido, hora: e.target.value })} className={campo + ' w-28'} />}
              </div>
            </label>
            <label className="text-xs font-bold text-gray-500">Paga con
              <select value={pedido.forma_pago} onChange={e => setPedido({ ...pedido, forma_pago: e.target.value })} className={campo + ' mt-1'}>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="credito">Crédito</option>
              </select>
            </label>
            <label className="text-xs font-bold text-gray-500">Lo lleva la ruta
              <select value={pedido.ruta_id} onChange={e => setPedido({ ...pedido, ruta_id: e.target.value })} className={campo + ' mt-1'}>
                <option value="">Escoge</option>
                {rutas.map(r => <option key={r.id} value={r.id}>{r.nombre}{vendedorDe(r.id) ? ` · ${vendedorDe(r.id).nombre}` : ''}</option>)}
              </select>
            </label>
          </div>
          <input value={pedido.nota} onChange={e => setPedido({ ...pedido, nota: e.target.value })} placeholder="Nota para el vendedor (dejar en portería, timbrar al 401...)" className={campo} />
          <button onClick={enviar} disabled={guardando} className="min-h-[50px] rounded-xl bg-brand text-white font-bold disabled:opacity-50">
            {guardando ? 'Enviando...' : `Enviar a Mi ruta · ${fmt(total)}`}
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex justify-between items-center mb-2">
            <p className="font-black text-gray-900 text-lg">Domicilios de hoy</p>
            <button onClick={cargarLista} className="text-xs font-bold bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg">Actualizar</button>
          </div>
          <p className="text-sm text-gray-500 mb-2">{pendientes} por entregar</p>
          {lista.length === 0 && <p className="text-gray-400 text-sm py-6 text-center">Todavía no hay domicilios hoy</p>}
          <div className="divide-y divide-gray-100">
            {lista.map(d => (
              <div key={d.id} className="py-2.5 flex items-start gap-3 text-sm">
                <span className="w-14 shrink-0 text-gray-500 tabular-nums">{hora(d.created_at)}</span>
                <div className="flex-1 min-w-0">
                  <p><b className="text-gray-900">{d.nombre_cliente}</b> <span className="text-gray-500">· {d.rutas?.nombre}{d.vendedores?.nombre ? ` · ${d.vendedores.nombre}` : ''}</span></p>
                  <p className="text-gray-600">{(d.domicilios_detalle || []).map(x => `${x.cantidad} ${x.nombre || x.sku}`).join(' · ')} · <b>{fmt(d.total)}</b></p>
                  <p className="text-xs text-gray-400">{d.fecha !== obtenerFechaActual() ? `Para el ${d.fecha} · ` : ''}{d.hora_limite ? `antes de ${d.hora_limite.slice(0, 5)}` : 'cuando pase'} · {d.forma_pago}{d.tomado_por ? ` · lo tomó ${d.tomado_por}` : ''}{d.motivo ? ` · ${d.motivo}` : ''}{d.resuelto_at && d.estado === 'entregado' ? ` · entregado ${hora(d.resuelto_at)}` : ''}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${ESTADO[d.estado][1]}`}>{ESTADO[d.estado][0]}</span>
                  {d.estado === 'pendiente' && <button onClick={() => cancelar(d)} className="text-xs text-gray-400 underline">Cancelar</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
