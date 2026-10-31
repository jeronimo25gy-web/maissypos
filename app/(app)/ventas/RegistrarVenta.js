'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { calcularStockPorSku } from '@/lib/inventario-helpers'
import { cargarPromos, promoVigente, precioConPromo, armarLineas } from '@/lib/promociones'
import { grupoDespacho, ordenarPorDespacho } from '@/lib/orden-productos'
import InputDinero from '@/components/InputDinero'
import { leerCantidad, sumarPaso, textoCantidad } from '@/lib/cantidades'

// Venta de mostrador con la linea de Mi ruta. Se puede vender de las dos
// empresas a la vez (arepas de Arepas Maissy y quesito de Distri): al
// registrar se guarda una venta por empresa, ligadas por grupo_id, cada una
// con su inventario, su caja y su cartera. Los descuentos no se ponen a
// mano: salen del precio pactado del cliente. La promo se arma sola.
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: 'var(--hoja)', linea: '#E3E1D8', rojo: 'var(--rojo)', verde: '#2E5E3A', verdeF: '#E6F0E8', ambar: '#8A5A00', ambarF: '#FFF4CC', azul: '#1D4E89', azulF: '#E5EEF8', rojoF: 'var(--rojo-suave)' }
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const fmt = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
const sinTildes = (t) => (t || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const digitos = (t) => (t || '').replace(/\D/g, '')
const corto = (nombre) => (nombre || '').replace(/ Maissy.*$/i, '').replace(/ SAS$/i, '')
const hora = (iso) => new Date(iso).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit' })
const PAGO = { efectivo: ['Efectivo', C.verde, C.verdeF], transferencia: ['Transferencia', C.tinta, '#E9E4D6'], fiado: ['Crédito', C.ambar, C.ambarF], nomina: ['Nómina', C.gris, C.fondo] }

export default function RegistrarVenta({ usuario, onVerComprobante }) {
  const [empresas, setEmpresas] = useState([]) // accesibles, con sus productos, stock, promos y cuentas
  const [clientes, setClientes] = useState([])
  const [empleados, setEmpleados] = useState([])
  const [cant, setCant] = useState({}) // 'empresa_id:sku' -> unidades
  const [filtro, setFiltro] = useState({ empresa: 'todas', grupo: 'Todo', q: '' })
  const [cliente, setCliente] = useState(null)
  const [buscaCliente, setBuscaCliente] = useState(null) // texto mientras se busca
  const [pactados, setPactados] = useState({}) // empresa_id -> { sku: precio }
  const [esEmpleado, setEsEmpleado] = useState(false)
  const [empleadoId, setEmpleadoId] = useState('')
  const [pago, setPago] = useState({ forma: 'efectivo', recibido: '', cuenta: '' })
  const [observaciones, setObservaciones] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [hoy, setHoy] = useState([])
  const [listo, setListo] = useState(null) // venta recien registrada
  const [anulando, setAnulando] = useState(null) // { grupo, motivo }
  const esAdmin = usuario?.rol === 'admin'
  const fechaHoy = obtenerFechaActual()

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    const actual = getEmpresaId()
    const { data: emps } = await supabase.from('empresas').select('id, nombre, logo_url').eq('activo', true).order('nombre')
    const accesibles = (emps || []).filter(e => !usuario?.empresas || usuario.empresas.includes(e.id))
      .sort((a, b) => (b.id === actual) - (a.id === actual))
    const datos = await Promise.all(accesibles.map(async e => {
      const [{ data: prods }, stock, promos, { data: cts }] = await Promise.all([
        supabase.from('productos').select('id, sku, nombre, precio_venta, precio_empleado, orden_despacho, producto_espejo_id').eq('estado', true).neq('tipo', 'materia_prima').eq('empresa_id', e.id),
        calcularStockPorSku({ empresaId: e.id }).catch(() => ({})),
        cargarPromos(e.id),
        supabase.from('cuentas').select('id, nombre, tipo').eq('estado', true).eq('empresa_id', e.id).order('tipo').order('nombre'),
      ])
      return { ...e, productos: ordenarPorDespacho(prods || []), stock: stock || {}, promos, cuentas: cts || [] }
    }))
    // Las arepas de Distri ligadas a las de planta no se venden en el mostrador:
    // allá se venden las de Arepas Maissy, a su precio.
    const idsVisibles = new Set(datos.flatMap(e => e.productos.map(p => p.id)))
    datos.forEach(e => { e.productos = e.productos.filter(p => !(p.producto_espejo_id && idsVisibles.has(p.producto_espejo_id))) })
    setEmpresas(datos)
    const ids = accesibles.map(e => e.id)
    const [{ data: cls }, { data: empls }] = await Promise.all([
      supabase.from('clientes').select('id, nombre, telefono, nit, direccion, apto, barrio, empresa_id, dias_credito, cupo_credito').eq('estado', true).in('empresa_id', ids).order('nombre'),
      // Empleados de las empresas del grupo: lo que lleve de cualquiera se descuenta en la nómina de su empresa.
      supabase.from('empleados').select('id, nombre, empresa_id').eq('activo', true).in('empresa_id', ids).order('nombre'),
    ])
    setClientes(cls || [])
    setEmpleados(empls || [])
    cargarHoy(ids)
  }

  const cargarHoy = async (ids = empresas.map(e => e.id)) => {
    if (!ids.length) return
    const { data } = await supabase.from('ventas_encab').select('*, ventas_detalle(sku, cantidad)').in('empresa_id', ids).eq('fecha', fechaHoy).order('created_at', { ascending: false })
    setHoy(data || [])
  }

  // El mismo cliente en la otra empresa (por telefono o nombre), para su
  // precio pactado y su cartera alla.
  const clienteEn = (empresaId) => {
    if (!cliente) return null
    if (cliente.empresa_id === empresaId) return cliente
    const tel = digitos(cliente.telefono).slice(-10)
    return clientes.find(c => c.empresa_id === empresaId && ((tel.length === 10 && digitos(c.telefono).slice(-10) === tel) || sinTildes(c.nombre).trim() === sinTildes(cliente.nombre).trim())) || null
  }

  const escogerCliente = async (c) => {
    setCliente(c); setBuscaCliente(null)
    const mismo = (empresaId) => {
      if (c.empresa_id === empresaId) return c
      const tel = digitos(c.telefono).slice(-10)
      return clientes.find(x => x.empresa_id === empresaId && ((tel.length === 10 && digitos(x.telefono).slice(-10) === tel) || sinTildes(x.nombre).trim() === sinTildes(c.nombre).trim()))
    }
    const ids = empresas.map(e => ({ e: e.id, c: mismo(e.id) })).filter(x => x.c)
    const { data } = await supabase.from('clientes_precios').select('cliente_id, sku, precio_especial').in('cliente_id', ids.map(x => x.c.id))
    const mapa = {}
    ids.forEach(({ e, c: cc }) => { mapa[e] = Object.fromEntries((data || []).filter(p => p.cliente_id === cc.id).map(p => [p.sku, Number(p.precio_especial)])) })
    setPactados(mapa)
  }

  // Precio y promo de un producto, como lo cobraria la empresa hoy.
  const productoListo = (e, p) => {
    if (esEmpleado) return { ...p, precio: Number(p.precio_empleado || p.precio_venta || 0), promo: null }
    const pac = pactados[e.id]?.[p.sku]
    if (pac) return { ...p, precio: pac, promo: null, pactado: true }
    const promo = promoVigente(e.promos, p.sku, null, fechaHoy)
    return { ...p, precio: precioConPromo(Number(p.precio_venta || 0), promo), promo }
  }

  const partes = empresas.map(e => {
    const items = e.productos.filter(p => cant[`${e.id}:${p.sku}`] > 0).map(p => ({ p: productoListo(e, p), n: cant[`${e.id}:${p.sku}`] }))
    const lineas = items.flatMap(({ p, n }) => armarLineas(p, n, p.promo))
    return { empresa: e, items, lineas, total: lineas.reduce((s, l) => s + l.subtotal, 0) }
  }).filter(x => x.items.length)
  const total = partes.reduce((s, x) => s + x.total, 0)
  const recibido = parseFloat(pago.recibido) || 0
  const sumar = (key, d) => setCant(c => ({ ...c, [key]: Math.max(0, (c[key] || 0) + d) }))
  // − y + van de a un paso: media canasta en los huevos (la llave es 'empresa:sku').
  const paso = (key, signo) => setCant(c => ({ ...c, [key]: sumarPaso(c[key], key.split(':')[1], signo) }))

  const limpiar = () => { setCant({}); setCliente(null); setPactados({}); setPago({ forma: 'efectivo', recibido: '', cuenta: '' }); setObservaciones(''); setEsEmpleado(false); setEmpleadoId('') }

  const registrar = async () => {
    if (!partes.length) return
    const forma = pago.forma
    if (forma === 'fiado' && !cliente) { alert('Para fiar escoge el cliente (o créalo en Maestros › Clientes).'); return }
    if (forma === 'transferencia' && !pago.cuenta) { alert('Escoge la cuenta a la que llegó la transferencia.'); return }
    if (forma === 'nomina') {
      if (!empleadoId) { alert('Escoge el empleado al que se le descuenta.'); return }
    }
    if (forma === 'efectivo' && pago.recibido && recibido < total) { alert('Lo recibido es menos que el total.'); return }
    setGuardando(true)
    const grupo = partes.length > 1 ? crypto.randomUUID() : null
    const empleadoSel = empleados.find(m => m.id === empleadoId)
    const nombreEmpresa = (id) => empresas.find(x => x.id === id)?.nombre || 'la otra empresa'
    const cuentaSel = empresas.flatMap(e => e.cuentas.map(c => ({ ...c, empresa_id: e.id, empresaNombre: e.nombre }))).find(c => c.id === pago.cuenta)
    const registradas = []
    const fallos = []
    for (const x of partes) {
      const e = x.empresa
      let cli = clienteEn(e.id)
      // Credito: la cartera es de cada empresa; si el cliente no existe alla, se crea igual.
      if (forma === 'fiado' && !cli) {
        const { data: nuevo, error } = await supabase.from('clientes').insert({ empresa_id: e.id, nombre: cliente.nombre, telefono: cliente.telefono || null, nit: cliente.nit || null, direccion: cliente.direccion || null, apto: cliente.apto || null, barrio: cliente.barrio || null, estado: true, solo_domicilio: true })
          .select('id, nombre, telefono, nit, direccion, apto, barrio, empresa_id, dias_credito, cupo_credito').single()
        if (error) { fallos.push(`crear el cliente en ${e.nombre}`); continue }
        cli = nuevo
      }
      const efectivo = e.cuentas.find(c => c.tipo === 'efectivo')
      const cuentaVenta = forma === 'efectivo' ? efectivo?.id : forma === 'transferencia' && cuentaSel?.empresa_id === e.id ? cuentaSel.id : null
      const { data: venta, error } = await supabase.from('ventas_encab').insert({
        empresa_id: e.id, fecha: fechaHoy, grupo_id: grupo,
        cliente_id: cli?.id || null, cliente_nombre: forma === 'nomina' ? empleados.find(m => m.id === empleadoId)?.nombre || null : (cliente?.nombre || null),
        empleado_id: esEmpleado && empleadoId ? empleadoId : null, es_empleado: esEmpleado,
        cliente_documento: cliente?.nit || null, cliente_telefono: cliente?.telefono || null,
        cliente_direccion: cliente ? [cliente.direccion, cliente.apto, cliente.barrio].filter(Boolean).join(', ') || null : null,
        forma_pago: forma, cuenta_id: cuentaVenta, total: x.total,
        valor_recibido: forma === 'efectivo' ? (partes.length > 1 ? x.total : recibido || x.total) : null,
        observaciones: [observaciones.trim(), partes.length > 1 ? `Venta mixta con ${partes.filter(o => o !== x).map(o => o.empresa.nombre).join(', ')}` : null,
          forma === 'nomina' && empleadoSel && empleadoSel.empresa_id !== e.id ? `Descontado en la nómina de ${nombreEmpresa(empleadoSel.empresa_id)}: por cobrar entre empresas` : null].filter(Boolean).join(' · ') || null,
        registrado_por: usuario?.nombre || null, estado: 'confirmada',
      }).select('id, numero').single()
      if (error) { fallos.push(`la venta de ${e.nombre} (${error.message})`); continue }
      registradas.push({ ...venta, empresa: e })
      // Detalle por producto (las promos quedan dentro del subtotal; el comprobante las vuelve a partir).
      const det = x.items.map(({ p, n }) => {
        const sub = armarLineas(p, n, p.promo).reduce((s, l) => s + l.subtotal, 0)
        return { empresa_id: e.id, venta_id: venta.id, sku: p.sku, cantidad: n, precio_unitario: Math.round((sub / n) * 100) / 100, descuento: 0, subtotal: sub }
      })
      const { error: eDet } = await supabase.from('ventas_detalle').insert(det)
      if (eDet) fallos.push(`el detalle de ${e.nombre}`)
      const { error: eInv } = await supabase.from('inventario_mov').insert(det.map(d => ({ empresa_id: e.id, sku: d.sku, cantidad: d.cantidad, fecha: fechaHoy, tipo_movimiento: 'salida', referencia: `Venta mostrador CV-${String(venta.numero).padStart(8, '0')}` })))
      if (eInv) fallos.push(`el inventario de ${e.nombre}`)
      if (forma === 'fiado') {
        const fechaPago = cli?.dias_credito > 0 ? new Date(new Date(fechaHoy + 'T12:00:00').getTime() + cli.dias_credito * 864e5).toLocaleDateString('en-CA') : null
        const { error: eCar } = await supabase.from('cartera_fiados').insert({ empresa_id: e.id, venta_id: venta.id, cliente_id: cli.id, nombre_cliente: cli.nombre, valor_original: x.total, saldo: x.total, fecha_fiado: fechaHoy, fecha_pago: fechaPago, estado: 'pendiente' })
        if (eCar) fallos.push(`la cartera de ${e.nombre}`)
      } else if (forma === 'nomina') {
        // El descuento queda en la empresa del empleado (es la que le paga la nómina).
        const { error: eCon } = await supabase.from('consumos_empleado').insert(det.map(d => ({ empresa_id: empleadoSel?.empresa_id || e.id, empleado_id: empleadoId, venta_id: venta.id, fecha: fechaHoy, sku: d.sku, cantidad: d.cantidad, valor_unitario: d.precio_unitario, valor: d.subtotal })))
        if (eCon) fallos.push('el descuento de nómina')
      } else {
        // Efectivo: una sola caja fisica, pero cada empresa registra lo suyo.
        // Transferencia a la cuenta de la otra empresa: queda por trasladar.
        const porTrasladar = forma === 'transferencia' && cuentaSel?.empresa_id !== e.id
        const { error: eTes } = await supabase.from('movimientos_tesoreria').insert({
          empresa_id: e.id, cuenta_id: porTrasladar ? null : cuentaVenta, fecha: fechaHoy, tipo: 'entrada', monto: x.total,
          concepto: porTrasladar ? `Venta de mostrador · llegó a ${cuentaSel?.nombre} de ${cuentaSel?.empresaNombre}: por trasladar` : 'Venta de mostrador',
          referencia_tipo: 'venta', referencia_id: venta.id,
        })
        if (eTes) fallos.push(`la caja de ${e.nombre}`)
      }
    }
    setGuardando(false)
    if (fallos.length) alert('La venta quedó, pero falló: ' + fallos.join(', ') + '. Revísalo antes de cerrar el día.')
    if (registradas.length) {
      setListo({ total, forma, vueltas: forma === 'efectivo' && recibido > total ? recibido - total : 0, venta: registradas[0], partes: registradas.length })
      limpiar()
      cargar()
    }
  }

  // Anular (solo admin): devuelve el producto a bodega, saca la plata de la
  // caja o el banco, y anula el credito si no tiene abonos.
  const anular = async () => {
    const { grupo, motivo } = anulando
    if (!motivo.trim()) { alert('Escribe por qué se anula.'); return }
    setGuardando(true)
    for (const v of grupo) {
      if (v.forma_pago === 'fiado') {
        const { data: cf } = await supabase.from('cartera_fiados').select('id, saldo, valor_original').eq('venta_id', v.id).eq('empresa_id', v.empresa_id).maybeSingle()
        if (cf && Number(cf.saldo) < Number(cf.valor_original)) { setGuardando(false); alert('Ese crédito ya tiene abonos: arréglalo primero en Cartera.'); return }
      }
    }
    for (const v of grupo) {
      const ref = `Anulación venta CV-${String(v.numero).padStart(8, '0')}`
      await supabase.from('ventas_encab').update({ estado: 'anulada', anulada_por: usuario?.nombre || null, anulada_at: new Date().toISOString(), motivo_anulacion: motivo.trim() }).eq('id', v.id).eq('empresa_id', v.empresa_id)
      const det = v.ventas_detalle || []
      if (det.length) await supabase.from('inventario_mov').insert(det.map(d => ({ empresa_id: v.empresa_id, sku: d.sku, cantidad: d.cantidad, fecha: fechaHoy, tipo_movimiento: 'entrada', referencia: ref })))
      if (v.forma_pago === 'fiado') {
        await supabase.from('cartera_fiados').update({ estado: 'anulado', saldo: 0 }).eq('venta_id', v.id).eq('empresa_id', v.empresa_id)
      } else if (v.forma_pago === 'nomina') {
        await supabase.from('consumos_empleado').delete().eq('venta_id', v.id)
      } else {
        const { data: movs } = await supabase.from('movimientos_tesoreria').select('cuenta_id, monto').eq('referencia_id', v.id).eq('tipo', 'entrada').eq('empresa_id', v.empresa_id)
        for (const m of movs || []) {
          await supabase.from('movimientos_tesoreria').insert({ empresa_id: v.empresa_id, cuenta_id: m.cuenta_id, fecha: fechaHoy, tipo: 'salida', monto: m.monto, concepto: `${ref} · ${motivo.trim()}`, referencia_tipo: 'anulacion_venta', referencia_id: v.id })
        }
      }
    }
    setGuardando(false)
    setAnulando(null)
    cargar()
  }

  // ---------- vista ----------
  const nombreEmpresa = (id) => corto(empresas.find(e => e.id === id)?.nombre)
  const variasEmpresas = empresas.length > 1
  const grupos = ['Todo', ...new Set(empresas.filter(e => filtro.empresa === 'todas' || e.id === filtro.empresa).flatMap(e => e.productos.map(p => grupoDespacho(p))))]
  const palabras = sinTildes(filtro.q).split(/\s+/).filter(Boolean)
  const tarjetas = empresas.filter(e => filtro.empresa === 'todas' || e.id === filtro.empresa).flatMap(e => e.productos
    .filter(p => (filtro.grupo === 'Todo' || grupoDespacho(p) === filtro.grupo) && palabras.every(w => sinTildes(p.nombre).includes(w)))
    .map(p => ({ e, p: productoListo(e, p) })))
  const qCli = sinTildes(buscaCliente || '').split(/\s+/).filter(Boolean)
  const resultadosCli = buscaCliente ? clientes.filter(c => { const t = sinTildes([c.nombre, c.telefono, c.nit, c.direccion, c.apto, c.barrio].join(' ')); return qCli.every(w => t.includes(w)) })
    .sort((a, b) => (b.empresa_id === getEmpresaId()) - (a.empresa_id === getEmpresaId())).slice(0, 8) : []

  // Ventas de hoy agrupadas (una venta mixta son dos filas en la base).
  const gruposHoy = Object.values(hoy.reduce((m, v) => { const k = v.grupo_id || v.id; (m[k] = m[k] || []).push(v); return m }, {}))
  const vigentes = hoy.filter(v => v.estado !== 'anulada')
  const suma = (f) => vigentes.filter(f).reduce((s, v) => s + Number(v.total || 0), 0)
  const cuentasTodas = empresas.flatMap(e => e.cuentas.filter(c => c.tipo !== 'efectivo').map(c => ({ ...c, empresaNombre: corto(e.nombre) })))
  const campo = 'w-full min-w-0 border-2 rounded-xl px-3 min-h-[44px] text-[15px] bg-white focus:outline-none focus:border-[#1C1B19]'

  return (
    <div className="flex flex-col gap-4 pb-28 lg:pb-6" style={{ color: C.tinta }}>
      {listo && (
        <div className="rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3" style={{ background: C.verdeF }}>
          <div>
            <p className="font-extrabold text-lg" style={{ ...titulo, color: C.verde }}>Venta registrada · {fmt(listo.total)}</p>
            <p className="text-sm" style={{ color: C.verde }}>{PAGO[listo.forma][0]}{listo.vueltas > 0 ? ` · vueltas ${fmt(listo.vueltas)}` : ''}{listo.partes > 1 ? ' · repartida entre las dos empresas' : ''}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onVerComprobante(listo.venta)} className="min-h-[42px] px-4 rounded-xl font-bold text-white" style={{ background: C.verde }}>Ver comprobante</button>
            <button onClick={() => setListo(null)} className="min-h-[42px] px-4 rounded-xl font-bold bg-white">Listo</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {[['Hoy · ' + new Set(vigentes.map(v => v.grupo_id || v.id)).size + ' ventas', suma(() => true)], ['Efectivo', suma(v => v.forma_pago === 'efectivo')], ['Transferencia', suma(v => v.forma_pago === 'transferencia')], ['Crédito', suma(v => v.forma_pago === 'fiado')]].map(([et, va]) => (
          <div key={et} className="bg-white rounded-2xl px-3.5 py-3 min-w-0">
            <p className="text-[12.5px] font-bold" style={{ color: C.gris }}>{et}</p>
            <p className="font-extrabold text-2xl tabular-nums" style={titulo}>{fmt(va)}</p>
          </div>
        ))}
      </div>
      {variasEmpresas && suma(v => v.forma_pago === 'efectivo') > 0 && (
        <p className="text-sm -mt-2 px-1" style={{ color: C.gris }}>
          En la caja: {empresas.map(e => `${corto(e.nombre)} ${fmt(suma(v => v.forma_pago === 'efectivo' && v.empresa_id === e.id))}`).join(' · ')}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
        <section className="bg-white rounded-[20px] p-4 flex flex-col gap-3 min-w-0" aria-label="Productos">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="font-extrabold text-xl" style={titulo}>Productos</p>
            <button onClick={() => { setEsEmpleado(!esEmpleado); setEmpleadoId(''); if (pago.forma === 'nomina' || pago.forma === 'fiado') setPago({ ...pago, forma: 'efectivo' }) }}
              className="text-xs font-bold px-3 min-h-[36px] rounded-lg" style={esEmpleado ? { background: '#fff', color: C.tinta, boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: C.fondo }}>Venta a empleado</button>
          </div>
          {esEmpleado && (
            <select value={empleadoId} onChange={e => setEmpleadoId(e.target.value)} className={campo} style={{ borderColor: C.linea }}>
              <option value="">¿Qué empleado compra? (precio empleado)</option>
              {empleados.map(m => <option key={m.id} value={m.id}>{m.nombre}{empresas.length > 1 ? ` · ${(empresas.find(x => x.id === m.empresa_id)?.nombre || '').replace(/ SAS$/i, '')}` : ''}</option>)}
            </select>
          )}
          <input type="search" value={filtro.q} onChange={e => setFiltro({ ...filtro, q: e.target.value })} placeholder="Buscar producto" aria-label="Buscar producto" className={campo} style={{ borderColor: C.linea }} />
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {variasEmpresas && [['todas', 'Las dos empresas'], ...empresas.map(e => [e.id, corto(e.nombre)])].map(([id, t]) => (
              <button key={id} onClick={() => setFiltro({ ...filtro, empresa: id, grupo: 'Todo' })} className="shrink-0 px-3 min-h-[36px] rounded-full text-[13px] font-bold border-2"
                style={filtro.empresa === id ? { borderColor: C.tinta, background: '#fff', color: C.tinta, boxShadow: `inset 0 0 0 1px ${C.tinta}` } : { borderColor: C.linea }}>{t}</button>
            ))}
            {grupos.map(g => (
              <button key={g} onClick={() => setFiltro({ ...filtro, grupo: g })} className="shrink-0 px-3 min-h-[36px] rounded-full text-[13px] font-bold"
                style={filtro.grupo === g ? { background: '#fff', color: C.tinta, boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: C.fondo }}>{g}</button>
            ))}
          </div>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {tarjetas.map(({ e, p }) => {
              const key = `${e.id}:${p.sku}`
              const n = cant[key] || 0
              const st = e.stock[p.sku]?.stockActual
              const queda = st == null ? null : st - n
              return (
                <div key={key} className="rounded-2xl px-3 py-2.5 flex flex-col gap-0.5 border-2 min-w-0" style={{ borderColor: n ? C.rojo : C.linea }}>
                  <div className="flex justify-between gap-1 text-xs">
                    <span className="tabular-nums" style={{ color: queda != null && queda < 0 ? C.ambar : C.gris, fontWeight: queda != null && queda < 0 ? 700 : 400 }}>{queda == null ? 'Sin conteo' : queda < 0 ? `Stock ${queda} · revisa` : `Stock ${queda}`}</span>
                    {variasEmpresas && <span className="font-bold" style={{ color: C.gris }}>{corto(e.nombre)}</span>}
                  </div>
                  <span className="font-bold leading-tight">{p.nombre}</span>
                  <span className="font-extrabold text-lg tabular-nums" style={{ ...titulo, color: C.rojo }}>{fmt(p.precio)}</span>
                  {p.pactado && <span className="text-[11.5px] font-bold" style={{ color: C.ambar }}>Precio del cliente</span>}
                  {p.promo && <span className="text-[11.5px] font-bold" style={{ color: C.verde }}>{p.promo.nombre}: {p.promo.cantidad} por {fmt(p.promo.precio)}</span>}
                  <div className="flex-1" />
                  {n === 0 ? (
                    <button onClick={() => sumar(key, 1)} className="mt-1 min-h-[40px] rounded-[10px] font-bold" style={{ background: C.fondo, color: C.tinta }}>Agregar</button>
                  ) : (
                    <div className="mt-1 flex items-center justify-between rounded-[10px]" style={{ background: C.fondo }}>
                      <button onClick={() => paso(key, -1)} aria-label={`Quitar uno de ${p.nombre}`} className="w-10 h-10 text-xl font-bold">−</button>
                      <input type="number" inputMode="decimal" value={n} onFocus={ev => ev.target.select()} aria-label={`Cantidad de ${p.nombre}`}
                        onChange={ev => setCant(c => ({ ...c, [key]: leerCantidad(ev.target.value, p.sku) }))} className="w-12 text-center font-bold bg-transparent tabular-nums" />
                      <button onClick={() => paso(key, 1)} aria-label={`Agregar uno de ${p.nombre}`} className="w-10 h-10 text-xl font-bold">+</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {tarjetas.length === 0 && <p className="text-center py-6 text-sm" style={{ color: C.gris }}>Sin coincidencias</p>}
        </section>

        <aside className="bg-white rounded-[20px] p-4 flex flex-col gap-3 min-w-0 lg:sticky lg:top-4" aria-label="Venta">
          <p className="font-extrabold text-xl" style={titulo}>Venta</p>
          {buscaCliente === null ? (
            <div className="rounded-xl border-2 px-3 py-2.5 flex items-center justify-between gap-2" style={{ borderColor: C.linea }}>
              <div className="min-w-0">
                <p className="font-bold truncate">{cliente ? cliente.nombre : 'Cliente ocasional'}</p>
                <p className="text-[12.5px]" style={{ color: C.gris }}>{cliente ? [cliente.telefono, cliente.direccion, Object.values(pactados).some(m => Object.keys(m).length) ? 'con precio pactado' : null].filter(Boolean).join(' · ') || corto(nombreEmpresa(cliente.empresa_id)) : 'Escoge el cliente para fiar o para su descuento'}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                {cliente && <button onClick={() => { setCliente(null); setPactados({}) }} className="text-[13px] font-bold" style={{ color: C.gris }}>Quitar</button>}
                <button onClick={() => setBuscaCliente('')} className="text-[13px] font-bold" style={{ color: C.rojo }}>{cliente ? 'Cambiar' : 'Buscar cliente'}</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <input autoFocus type="search" value={buscaCliente} onChange={e => setBuscaCliente(e.target.value)} placeholder="Nombre, teléfono, apto, barrio…" aria-label="Buscar cliente" className={campo} style={{ borderColor: C.tinta }} />
              {resultadosCli.length > 0 && (
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.linea }}>
                  {resultadosCli.map((c, i) => (
                    <button key={c.id} onClick={() => escogerCliente(c)} className="w-full text-left px-3 py-2 text-sm flex justify-between gap-2 hover:bg-[#FFF4CC]" style={i ? { borderTop: `1px solid ${C.linea}` } : undefined}>
                      <span className="min-w-0"><b>{c.nombre}</b> <span style={{ color: C.gris }}>{[c.telefono, c.apto, c.barrio].filter(Boolean).join(' · ')}</span></span>
                      {variasEmpresas && <span className="text-xs shrink-0" style={{ color: C.gris }}>{nombreEmpresa(c.empresa_id)}</span>}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setBuscaCliente(null)} className="self-start text-[13px] font-bold" style={{ color: C.gris }}>Cancelar</button>
            </div>
          )}

          <div className="flex flex-col">
            {partes.length === 0 && <p className="text-center py-4 text-sm" style={{ color: C.gris }}>Sin productos</p>}
            {partes.map(x => (
              <div key={x.empresa.id}>
                {partes.length > 1 && <p className="text-xs font-bold uppercase tracking-wider pt-2" style={{ color: C.gris }}>{x.empresa.nombre}</p>}
                {x.lineas.map((l, i) => (
                  <div key={i} className="flex justify-between gap-2.5 py-2 border-b text-sm" style={{ borderColor: C.linea }}>
                    <span className="min-w-0">{l.paquetes || textoCantidad(l.cantidad)} {l.paquetes ? l.nombre.replace(/^Promo x\d+ /, '') : l.nombre}
                      {l.paquetes ? <span className="ml-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: C.verde, background: C.verdeF }}>{l.nombre.match(/^Promo x\d+/)?.[0] || 'Promo'}</span> : null}
                      {l.paquetes ? <span className="block text-xs" style={{ color: C.gris }}>{l.cantidad} unidades</span> : null}
                    </span>
                    <b className="tabular-nums whitespace-nowrap">{fmt(l.subtotal)}</b>
                  </div>
                ))}
                {partes.length > 1 && <div className="flex justify-between text-sm py-1.5" style={{ color: C.gris }}><span>Subtotal {corto(x.empresa.nombre)}</span><span className="tabular-nums">{fmt(x.total)}</span></div>}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Forma de pago">
            {[['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], esEmpleado ? ['nomina', 'Nómina'] : ['fiado', 'Crédito']].map(([f, t]) => (
              <button key={f} onClick={() => setPago({ ...pago, forma: f })} aria-pressed={pago.forma === f} className="min-h-[42px] rounded-[10px] font-bold text-sm"
                style={pago.forma === f ? { background: '#fff', color: C.tinta, boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: C.fondo }}>{t}</button>
            ))}
          </div>
          {pago.forma === 'efectivo' && (
            <div className="grid grid-cols-2 gap-2 text-[13px] font-bold" style={{ color: C.gris }}>
              <label className="flex flex-col gap-1">Recibido<InputDinero value={pago.recibido} onChange={e => setPago({ ...pago, recibido: e.target.value })} placeholder={fmt(total)} className={campo} style={{ borderColor: C.linea, color: C.tinta }} /></label>
              <div className="flex flex-col gap-1">Vueltas<span className="min-h-[44px] rounded-xl flex items-center px-3 font-extrabold text-[15px]" style={recibido && recibido < total ? { background: C.rojoF, color: '#8E1117' } : { background: C.verdeF, color: C.verde }}>{recibido ? (recibido >= total ? fmt(recibido - total) : `Falta ${fmt(total - recibido)}`) : '$0'}</span></div>
            </div>
          )}
          {pago.forma === 'transferencia' && (
            <select value={pago.cuenta} onChange={e => setPago({ ...pago, cuenta: e.target.value })} className={campo} style={{ borderColor: C.linea }}>
              <option value="">¿A qué cuenta llegó?</option>
              {cuentasTodas.map(c => <option key={c.id} value={c.id}>{c.nombre}{variasEmpresas ? ` · ${c.empresaNombre}` : ''}</option>)}
            </select>
          )}
          {pago.forma === 'fiado' && <p className="text-[12.5px] -mt-1" style={{ color: C.gris }}>{cliente ? `Queda en la cartera de cada empresa${partes.length > 1 ? ' por su parte' : ''}.` : 'Escoge el cliente para fiar.'}</p>}
          <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={2} placeholder="Observaciones (opcional)" aria-label="Observaciones" className={campo + ' py-2'} style={{ borderColor: C.linea }} />
          <div className="flex justify-between items-baseline pt-2.5 border-t-[1.5px]" style={{ borderColor: C.tinta }}>
            <span className="font-bold">Total</span><b className="font-extrabold text-[30px] tabular-nums" style={titulo}>{fmt(total)}</b>
          </div>
          <button onClick={registrar} disabled={guardando || !partes.length} className="hidden lg:block min-h-[54px] rounded-[14px] text-white font-extrabold text-base disabled:opacity-45" style={{ background: 'var(--primario)' }}>
            {guardando ? 'Registrando...' : 'Registrar venta'}
          </button>
        </aside>
      </div>

      <section className="bg-white rounded-[20px] p-4" aria-label="Ventas de hoy">
        <p className="font-extrabold text-xl mb-1" style={titulo}>Ventas de hoy</p>
        {gruposHoy.length === 0 && <p className="text-sm py-4 text-center" style={{ color: C.gris }}>Sin ventas hoy</p>}
        {gruposHoy.map((g, i) => {
          const v = g[0]
          const anulada = g.every(x => x.estado === 'anulada')
          const tot = g.reduce((s, x) => s + Number(x.total || 0), 0)
          const pg = PAGO[v.forma_pago] || [v.forma_pago, C.gris, C.fondo]
          return (
            <div data-fila key={v.grupo_id || v.id} className="py-3 grid grid-cols-[52px_minmax(0,1fr)] md:grid-cols-[60px_minmax(0,1fr)_auto] gap-x-3 gap-y-2 items-center text-sm" style={{ borderTop: i ? `1px solid ${C.linea}` : undefined, opacity: anulada ? 0.55 : 1 }}>
              <span className="tabular-nums" style={{ color: C.gris }}>{hora(v.created_at)}</span>
              <div className="min-w-0">
                <b>{v.cliente_nombre || 'Venta en mostrador'}</b>{' '}
                <span className="text-[11.5px] font-bold px-2 py-0.5 rounded-full" style={{ color: pg[1], background: pg[2] }}>{pg[0]}</span>
                {g.length > 1 && <span className="ml-1 text-[11.5px] font-bold px-2 py-0.5 rounded-full" style={{ background: C.fondo }}>{g.map(x => nombreEmpresa(x.empresa_id)).join(' + ')}</span>}
                {g.length === 1 && variasEmpresas && <span className="ml-1 text-xs" style={{ color: C.gris }}>{nombreEmpresa(v.empresa_id)}</span>}
                <span className="block text-[12.5px]" style={{ color: C.gris }}>
                  {anulada ? `Anulada por ${v.anulada_por || ''}: ${v.motivo_anulacion || ''}` : [v.observaciones, v.registrado_por].filter(Boolean).join(' · ')}
                </span>
              </div>
              <div className="col-span-2 md:col-span-1 flex items-center gap-1.5 flex-wrap md:justify-end">
                <b className="tabular-nums min-w-[76px] md:text-right" style={anulada ? { textDecoration: 'line-through' } : undefined}>{fmt(tot)}</b>
                <button onClick={() => onVerComprobante(v)} className="text-[12.5px] font-bold px-2.5 py-1.5 rounded-lg" style={{ background: C.fondo }}>Comprobante</button>
                {esAdmin && !anulada && <button onClick={() => setAnulando({ grupo: g, motivo: '' })} className="text-[12.5px] font-bold px-2.5 py-1.5 rounded-lg" style={{ background: C.rojoF, color: '#8E1117' }}>Anular</button>}
              </div>
              {anulando && anulando.grupo[0].id === v.id && (
                <div className="col-span-2 md:col-span-3 rounded-xl p-3 flex flex-col gap-2" style={{ background: C.rojoF }}>
                  <p className="text-sm font-bold" style={{ color: '#8E1117' }}>Anular {fmt(tot)}: el producto vuelve a bodega y el valor sale de {v.forma_pago === 'fiado' ? 'cartera' : 'caja/banco'}.</p>
                  <input autoFocus value={anulando.motivo} onChange={e => setAnulando({ ...anulando, motivo: e.target.value })} placeholder="¿Por qué se anula? (se marcó dos veces, el cliente devolvió…)" aria-label="Motivo" className={campo} style={{ borderColor: C.linea }} />
                  <div className="flex gap-2">
                    <button onClick={() => setAnulando(null)} className="min-h-[40px] px-4 rounded-lg font-bold bg-white">Cancelar</button>
                    <button onClick={anular} disabled={guardando} className="min-h-[40px] px-4 rounded-lg font-bold text-white disabled:opacity-50" style={{ background: '#8E1117' }}>{guardando ? 'Anulando...' : 'Anular venta'}</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </section>

      <div className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t flex items-center gap-2.5 z-20" style={{ borderColor: C.linea, padding: '10px 16px calc(10px + env(safe-area-inset-bottom, 0px))' }}>
        <span className="flex-1 font-extrabold text-[22px] tabular-nums" style={titulo}>{fmt(total)}</span>
        <button onClick={registrar} disabled={guardando || !partes.length} className="min-h-[48px] px-5 rounded-[14px] text-white font-extrabold disabled:opacity-45" style={{ background: 'var(--primario)' }}>{guardando ? 'Registrando...' : 'Registrar venta'}</button>
      </div>
    </div>
  )
}
