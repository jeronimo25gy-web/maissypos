'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { puedeVerModulo } from '@/lib/permisos'
import { detectorInterno } from '@/lib/inicio-datos'
import { invalidarPendientes } from '@/lib/pendientes'
import { PageHeader } from '@/components/ui'
import InputDinero from '@/components/InputDinero'

// Devolucion de un cliente o distribuidor: producto bueno que vuelve a bodega
// (ej. los sabados, para despachar rutas) y se le descuenta de lo que debe con
// una nota credito, o se le devuelve la plata. En Arepas entra al lote del dia
// que se le vendio. Si quien devuelve es la otra empresa del grupo, alla se
// registra solo: sale de su inventario y baja lo que le debe a esta.
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', linea: '#E3E1D8', suave: '#EFEDE6', rojo: '#C41230', rojoF: '#FBE9E9', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8' }
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const $ = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
const fechaCorta = (f) => f ? new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }) : ''
const clave = (t) => (t || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const tarjeta = 'bg-white rounded-[18px] p-3.5 min-w-0'
const campo = 'w-full rounded-xl px-3 min-h-[44px] text-[15px] bg-white border outline-none focus:border-[#1C1B19]'

export default function Devoluciones() {
  const router = useRouter()
  const [usuario, setUsuario] = useState(null)
  const [empresa, setEmpresa] = useState(null)
  const [empresas, setEmpresas] = useState([])
  const [clientes, setClientes] = useState([])
  const [cartera, setCartera] = useState([])
  const [productos, setProductos] = useState([])
  const [pactados, setPactados] = useState({})
  const [cuentas, setCuentas] = useState([])
  const [historial, setHistorial] = useState([])
  const [busca, setBusca] = useState('')
  const [cliente, setCliente] = useState(null)
  const [ultimas, setUltimas] = useState({ precios: {}, fecha: null, skus: [] })
  const [cant, setCant] = useState({})
  const [precio, setPrecio] = useState({})
  const [fechaLote, setFechaLote] = useState('')
  const [forma, setForma] = useState('credito')
  const [cuentaId, setCuentaId] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [listo, setListo] = useState(null)
  const hoy = obtenerFechaActual()
  const esProduccion = (empresa?.modelos || []).includes('produccion')

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (!puedeVerModulo(parsed, 'devoluciones', ['admin', 'auxiliar'])) { router.push('/despacho'); return }
    setUsuario(parsed)
    cargar()
  }, [])

  const cargar = async () => {
    const id = getEmpresaId()
    const [{ data: emps }, { data: cls }, { data: cart }, { data: prods }, { data: pc }, { data: cts }] = await Promise.all([
      supabase.from('empresas').select('id, nombre, modelos'),
      supabase.from('clientes').select('id, nombre, edificio, apto, barrio').eq('estado', true).eq('empresa_id', id).order('nombre'),
      supabase.from('cartera_fiados').select('id, cliente_id, nombre_cliente, saldo, fecha_fiado, fecha_pago').eq('estado', 'pendiente').eq('empresa_id', id).order('fecha_fiado'),
      supabase.from('productos').select('id, sku, nombre, precio_venta, tipo, orden_despacho, producto_espejo_id').eq('estado', true).neq('tipo', 'materia_prima').eq('empresa_id', id).order('orden_despacho', { ascending: true, nullsFirst: false }).order('nombre'),
      supabase.from('clientes_precios').select('cliente_id, sku, precio_especial').eq('empresa_id', id),
      supabase.from('cuentas').select('id, nombre, tipo').eq('estado', true).eq('empresa_id', id).order('tipo').order('nombre'),
    ])
    setEmpresas(emps || [])
    setEmpresa((emps || []).find(e => e.id === id) || null)
    setClientes(cls || [])
    setCartera(cart || [])
    setProductos(prods || [])
    const mp = {}
    ;(pc || []).forEach(x => { (mp[x.cliente_id] = mp[x.cliente_id] || {})[x.sku] = Number(x.precio_especial) })
    setPactados(mp)
    setCuentas(cts || [])
    setCuentaId((cts || []).find(c => c.tipo === 'efectivo')?.id || '')
    cargarHistorial()
  }

  const cargarHistorial = async () => {
    const { data } = await supabase.from('novedades').select('id, fecha, sku, cantidad, precio, valor, nombre_cliente')
      .eq('tipo', 'devolucion_cliente').gte('fecha', hoy.slice(0, 7) + '-01').eq('empresa_id', getEmpresaId()).order('fecha', { ascending: false }).order('created_at', { ascending: false })
    setHistorial(data || [])
  }

  const deudaDe = (c) => cartera.filter(f => f.cliente_id ? f.cliente_id === c.id : clave(f.nombre_cliente) === clave(c.nombre))
  const debe = cliente ? deudaDe(cliente).reduce((s, f) => s + Number(f.saldo || 0), 0) : 0

  // Lo que se le vendio por ultima vez: precios y el dia (para el lote).
  const escoger = async (c) => {
    setCliente(c)
    setCant({})
    setPrecio({})
    setListo(null)
    const { data } = await supabase.from('ventas_encab').select('fecha, created_at, ventas_detalle(sku, precio_unitario)')
      .or(`cliente_id.eq.${c.id},cliente_nombre.ilike."${c.nombre.replace(/[",()]/g, ' ')}"`).neq('estado', 'anulada').eq('empresa_id', getEmpresaId())
      .order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(20)
    const precios = {}
    ;(data || []).forEach(v => (v.ventas_detalle || []).forEach(d => { if (!(d.sku in precios)) precios[d.sku] = Number(d.precio_unitario || 0) }))
    const fecha = data?.[0]?.fecha || null
    setUltimas({ precios, fecha, skus: Object.keys(precios) })
    setFechaLote(fecha || hoy)
    setForma(deudaDe(c).length ? 'credito' : 'devolver')
  }

  const precioDe = (p) => precio[p.sku] !== undefined && precio[p.sku] !== '' ? Number(precio[p.sku]) : (ultimas.precios[p.sku] ?? pactados[cliente?.id]?.[p.sku] ?? Number(p.precio_venta || 0))
  const items = productos.filter(p => Number(cant[p.sku]) > 0).map(p => ({ ...p, cantidad: Number(cant[p.sku]), precio: precioDe(p) }))
  const total = items.reduce((s, i) => s + i.cantidad * i.precio, 0)
  const unidades = items.reduce((s, i) => s + i.cantidad, 0)
  const otraEmpresa = cliente && empresa ? detectorInterno(empresas)({ cliente_nombre: cliente.nombre, empresa_id: empresa.id }) : null

  const guardar = async () => {
    if (!items.length) { alert('Pon cuánto devuelve de cada producto'); return }
    if (forma === 'credito' && total > debe + 0.5) { alert(`Devuelve ${$(total)} y debe ${$(debe)}. Escoge "Devolverle la plata" o baja las cantidades.`); return }
    if (forma === 'devolver' && !cuentaId) { alert('Escoge de qué cuenta sale la plata'); return }
    setGuardando(true)
    const empresaId = getEmpresaId()
    const fallos = []
    const { error } = await supabase.from('novedades').insert(items.map(i => ({
      empresa_id: empresaId, fecha: hoy, sku: i.sku, cantidad: i.cantidad, tipo: 'devolucion_cliente', momento: 'en_bodega',
      quien_registra: usuario.rol === 'auxiliar' ? 'bodega' : 'admin', revisado: true, motivo: 'Devolución de cliente',
      cliente_id: cliente.id, nombre_cliente: cliente.nombre, precio: i.precio, valor: i.cantidad * i.precio,
      fecha_lote: esProduccion ? (fechaLote || hoy) : null,
    })))
    if (error) { alert('No se pudo guardar: ' + error.message); setGuardando(false); return }
    const { error: eInv } = await supabase.from('inventario_mov').insert(items.map(i => ({
      empresa_id: empresaId, sku: i.sku, cantidad: i.cantidad, fecha: hoy, tipo_movimiento: 'entrada', referencia: `Devolucion de cliente: ${cliente.nombre}`,
    })))
    if (eInv) fallos.push('sumar al inventario')

    let quedaDebiendo = debe
    if (forma === 'credito') {
      // Nota credito: paga primero lo mas viejo.
      let resta = total
      for (const f of deudaDe(cliente)) {
        if (resta <= 0.5) break
        const v = Math.min(resta, Number(f.saldo || 0))
        const { error: eNc } = await supabase.rpc('nota_credito_cartera', { p_cartera_id: f.id, p_valor: v, p_fecha: hoy, p_nota: `Devolución de ${unidades} und`, p_usuario: usuario.nombre })
        if (eNc) { fallos.push('descontar de la cartera: ' + eNc.message); break }
        resta -= v
      }
      quedaDebiendo = Math.max(0, debe - total)
    } else {
      const { error: eTes } = await supabase.from('movimientos_tesoreria').insert({
        empresa_id: empresaId, cuenta_id: cuentaId, fecha: hoy, tipo: 'salida', monto: total,
        concepto: `Devolución a ${cliente.nombre}`, referencia_tipo: 'devolucion_cliente',
      })
      if (eTes) fallos.push('sacar la plata de la cuenta')
    }

    // La otra empresa del grupo: sale de su inventario y baja lo que le debe a esta.
    let espejo = null
    if (otraEmpresa) {
      espejo = { nombre: empresas.find(e => e.id === otraEmpresa)?.nombre, sinProducto: [] }
      const [{ data: prodsOtra }, { data: provs }] = await Promise.all([
        supabase.from('productos').select('id, sku, nombre, producto_espejo_id').eq('empresa_id', otraEmpresa),
        supabase.from('proveedores').select('id, nombre').eq('empresa_id', otraEmpresa),
      ])
      // El mismo producto en la otra empresa: primero por el vínculo de Maestros
      // (en cualquier dirección), y si no está ligado, por el nombre.
      const porNombre = Object.fromEntries((prodsOtra || []).map(p => [clave(p.nombre), p.sku]))
      const otraPorId = Object.fromEntries((prodsOtra || []).map(p => [p.id, p.sku]))
      const otraPorEspejo = Object.fromEntries((prodsOtra || []).filter(p => p.producto_espejo_id).map(p => [p.producto_espejo_id, p.sku]))
      const movs = []
      items.forEach(i => { const sku = otraPorEspejo[i.id] || otraPorId[i.producto_espejo_id] || porNombre[clave(i.nombre)]; if (sku) movs.push({ empresa_id: otraEmpresa, sku, cantidad: i.cantidad, fecha: hoy, tipo_movimiento: 'salida', referencia: `Devolucion a ${empresa.nombre}` }); else espejo.sinProducto.push(i.nombre) })
      if (movs.length) { const { error: e } = await supabase.from('inventario_mov').insert(movs); if (e) fallos.push(`sacar del inventario de ${espejo.nombre}`) }
      const det = detectorInterno(empresas)
      const prov = (provs || []).find(p => det({ cliente_nombre: p.nombre, empresa_id: otraEmpresa }) === empresa.id)
      if (prov) {
        const { data: fac } = await supabase.from('facturas_proveedores').select('id, total_pendiente').eq('proveedor_id', prov.id).eq('estado', 'pendiente').eq('empresa_id', otraEmpresa).maybeSingle()
        if (fac) {
          const { error: e } = await supabase.from('facturas_proveedores').update({ total_pendiente: Math.max(0, Number(fac.total_pendiente || 0) - total), updated_at: new Date().toISOString() }).eq('id', fac.id)
          if (e) fallos.push(`bajar lo que ${espejo.nombre} le debe a ${empresa.nombre}`)
        }
      } else espejo.sinProveedor = true
    }

    setGuardando(false)
    invalidarPendientes()
    if (fallos.length) alert('La devolución quedó guardada, pero falló: ' + fallos.join('; ') + '. Revísalo.')
    setListo({ cliente: cliente.nombre, unidades, total, forma, quedaDebiendo, espejo })
    setCliente(null)
    cargar()
  }

  if (!usuario) return null
  const q = clave(busca)
  const conDeuda = new Set(cartera.map(f => f.cliente_id).filter(Boolean))
  const sugeridos = clientes.filter(c => conDeuda.has(c.id)).slice(0, 8)
  const encontrados = q ? clientes.filter(c => clave([c.nombre, c.edificio, c.apto, c.barrio].join(' ')).includes(q)).slice(0, 12) : []
  const ordenProductos = [...productos].sort((a, b) => (ultimas.skus.includes(b.sku) ? 1 : 0) - (ultimas.skus.includes(a.sku) ? 1 : 0))
  const mesTotal = historial.reduce((s, h) => s + Number(h.valor || 0), 0)
  const nombreProd = (sku) => productos.find(p => p.sku === sku)?.nombre || sku

  return (
    <div style={{ background: C.fondo, minHeight: '100vh', color: C.tinta }}>
      <PageHeader title="Devoluciones" subtitle="Producto bueno que devuelve un cliente o distribuidor" />
      <div className="p-4 max-w-6xl mx-auto flex flex-col gap-4">
        {listo && (
          <div className="rounded-2xl px-4 py-3 flex flex-col gap-1" style={{ background: C.verdeF, color: C.verde }}>
            <b>Devolución registrada: {listo.cliente} · {listo.unidades} und · {$(listo.total)}</b>
            <span className="text-[14px]">{listo.forma === 'credito' ? `Se descontó de lo que debe: queda debiendo ${$(listo.quedaDebiendo)}.` : 'Se le devolvió la plata.'} Las unidades ya están en bodega.</span>
            {listo.espejo && <span className="text-[14px]">En {listo.espejo.nombre} salió de su inventario{listo.espejo.sinProveedor ? ' (no encontré el proveedor para bajar la deuda: hazlo en Compras)' : ' y bajó lo que le debe a esta empresa'}.{listo.espejo.sinProducto.length ? ` Sin producto igual allá: ${listo.espejo.sinProducto.join(', ')}.` : ''}</span>}
          </div>
        )}

        {!cliente ? (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
            <div className={tarjeta + ' flex flex-col gap-3'}>
              <h2 className="font-extrabold text-[20px]" style={titulo}>¿Quién devuelve?</h2>
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente o distribuidor…" className={campo} style={{ borderColor: C.linea }} aria-label="Buscar cliente" />
              {(q ? encontrados : sugeridos).length > 0 && (
                <div className="flex flex-col">
                  {!q && <span className="text-[12.5px] font-bold mb-1" style={{ color: C.gris }}>Con saldo pendiente</span>}
                  {(q ? encontrados : sugeridos).map((c, i) => {
                    const d = deudaDe(c).reduce((s, f) => s + Number(f.saldo || 0), 0)
                    return (
                      <button key={c.id} onClick={() => escoger(c)} className="flex justify-between items-center gap-3 py-2.5 text-left" style={{ borderTop: i ? `1px solid ${C.linea}` : 0 }}>
                        <span className="min-w-0"><b className="block">{c.nombre}</b><span className="text-[12.5px]" style={{ color: C.gris }}>{[c.edificio, c.apto, c.barrio].filter(Boolean).join(' · ')}</span></span>
                        {d > 0 && <span className="text-[13px] font-bold tabular-nums shrink-0" style={{ color: C.gris }}>debe {$(d)}</span>}
                      </button>
                    )
                  })}
                </div>
              )}
              {q && encontrados.length === 0 && <p className="text-[14px]" style={{ color: C.gris }}>Ningún cliente coincide.</p>}
            </div>
            <div className={tarjeta + ' flex flex-col gap-1'}>
              <div className="flex justify-between gap-2"><b>Devoluciones de este mes</b><span className="text-[13px] tabular-nums" style={{ color: C.gris }}>{historial.reduce((s, h) => s + Number(h.cantidad || 0), 0)} und · {$(mesTotal)}</span></div>
              {historial.length === 0 && <p className="text-[13.5px] py-2" style={{ color: C.gris }}>Todavía no hay devoluciones este mes.</p>}
              {historial.slice(0, 12).map((h, i) => (
                <div key={h.id} className="flex justify-between gap-3 py-1.5 text-[13.5px]" style={{ borderTop: i ? `1px solid ${C.linea}` : 0 }}>
                  <span className="min-w-0" style={{ color: C.gris }}>{fechaCorta(h.fecha)} · <b style={{ color: C.tinta }}>{h.nombre_cliente}</b> · {h.cantidad} {nombreProd(h.sku)}</span>
                  <b className="tabular-nums shrink-0">{$(h.valor)}</b>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
            <div className="flex flex-col gap-3 min-w-0">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h1 className="font-extrabold text-[24px] leading-tight" style={titulo}>{cliente.nombre}</h1>
                  <p style={{ color: C.gris }}>{debe > 0 ? `Debe ${$(debe)}` : 'No debe nada'}{ultimas.fecha ? ` · última compra ${fechaCorta(ultimas.fecha)}` : ''}</p>
                </div>
                <button onClick={() => setCliente(null)} className="px-3 min-h-[38px] rounded-xl text-[13px] font-bold bg-white">Cambiar cliente</button>
              </div>
              <div className={tarjeta + ' flex flex-col'}>
                <b className="pb-1">¿Qué devuelve?</b>
                {ordenProductos.map((p, i) => {
                  const n = Number(cant[p.sku]) || 0
                  return (
                    <div key={p.sku} className="py-2 flex items-center gap-2" style={{ borderTop: i ? `1px solid ${C.linea}` : 0 }}>
                      <div className="flex-1 min-w-0 leading-tight">
                        <b className="block text-[14.5px]">{p.nombre}</b>
                        <span className="text-[12px]" style={{ color: C.gris }}>{ultimas.precios[p.sku] != null ? 'se le vendió a ' : 'precio '}
                          <InputDinero value={precio[p.sku] ?? String(precioDe(p))} onChange={e => setPrecio(x => ({ ...x, [p.sku]: e.target.value }))} aria-label={`Precio ${p.nombre}`}
                            className="w-24 rounded-lg px-1.5 py-0.5 border bg-white font-bold text-[12.5px]" style={{ borderColor: C.linea, color: C.tinta }} />
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => setCant(x => ({ ...x, [p.sku]: String(Math.max(0, n - 1)) }))} className="w-10 h-10 rounded-xl text-xl font-extrabold" style={{ background: C.suave }} aria-label={`Menos ${p.nombre}`}>−</button>
                        <input type="text" inputMode="numeric" value={cant[p.sku] ?? ''} placeholder="0" onFocus={e => e.target.select()} onChange={e => setCant(x => ({ ...x, [p.sku]: e.target.value.replace(/\D/g, '') }))} aria-label={`Cantidad ${p.nombre}`}
                          className="w-14 h-10 text-center rounded-xl font-extrabold text-[17px] bg-white border outline-none focus:border-[#1C1B19]" style={{ ...titulo, borderColor: C.linea }} />
                        <button type="button" onClick={() => setCant(x => ({ ...x, [p.sku]: String(n + 1) }))} className="w-10 h-10 rounded-xl text-xl font-extrabold" style={{ background: C.suave }} aria-label={`Más ${p.nombre}`}>+</button>
                      </div>
                    </div>
                  )
                })}
              </div>
              {esProduccion && (
                <div className={tarjeta + ' flex flex-wrap items-center justify-between gap-2'}>
                  <span><b>¿De qué día son?</b><span className="block text-[12.5px]" style={{ color: C.gris }}>Entran a bodega como lote de ese día{fechaLote ? `: vencen el ${fechaCorta(new Date(new Date(fechaLote + 'T12:00:00').getTime() + 10 * 864e5).toLocaleDateString('en-CA'))}` : ''}.</span></span>
                  <input type="date" value={fechaLote} max={hoy} onChange={e => setFechaLote(e.target.value)} aria-label="Día de producción" className="rounded-xl px-3 min-h-[42px] bg-white border" style={{ borderColor: C.linea }} />
                </div>
              )}
            </div>

            <aside className="lg:sticky lg:top-24 flex flex-col gap-2">
              <div className={tarjeta + ' flex flex-col gap-2.5'}>
                <b>¿Qué se hace con la plata?</b>
                {[['credito', 'Descontar de lo que debe', 'Nota crédito al crédito más viejo.', debe <= 0], ['devolver', 'Devolverle la plata', 'Sale de la caja.', false]].map(([id, t, sub, off]) => (
                  <button key={id} disabled={off} onClick={() => setForma(id)} aria-pressed={forma === id} className="rounded-2xl px-3 py-2 text-left border-[1.5px] bg-white disabled:opacity-40"
                    style={{ borderColor: forma === id ? C.tinta : C.linea, boxShadow: forma === id ? `inset 0 0 0 1px ${C.tinta}` : 'none' }}>
                    <b className="block text-[14px]">{t}</b><span className="text-[12px]" style={{ color: C.gris }}>{off ? 'No tiene deuda pendiente.' : sub}</span>
                  </button>
                ))}
                {forma === 'devolver' && (
                  <select value={cuentaId} onChange={e => setCuentaId(e.target.value)} className={campo} style={{ borderColor: C.linea }} aria-label="Cuenta">
                    <option value="">¿De qué cuenta sale?</option>
                    {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                )}
                <div className="rounded-2xl p-3 flex flex-col gap-1 text-[14px]" style={{ background: C.fondo }}>
                  <div className="flex justify-between"><span>Devuelve</span><b className="tabular-nums">{unidades} und · {$(total)}</b></div>
                  {forma === 'credito' && <><div className="flex justify-between"><span>Debía</span><b className="tabular-nums">{$(debe)}</b></div>
                    <div className="flex justify-between"><span>Queda debiendo</span><b className="tabular-nums" style={{ color: total > debe ? C.rojo : C.tinta }}>{total > debe ? 'Devuelve más de lo que debe' : $(debe - total)}</b></div></>}
                </div>
                {otraEmpresa && <p className="text-[12.5px]" style={{ color: C.gris }}>Es la otra empresa del grupo: en {empresas.find(e => e.id === otraEmpresa)?.nombre} sale solo de su inventario y baja lo que le debe a {empresa?.nombre}.</p>}
                <button onClick={guardar} disabled={guardando || !items.length} className="min-h-[50px] rounded-2xl font-bold text-white disabled:opacity-50" style={{ background: C.rojo }}>{guardando ? 'Guardando…' : 'Registrar devolución'}</button>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}
