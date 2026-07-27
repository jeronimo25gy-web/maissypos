'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { calcularStockPorSku } from '@/lib/inventario-helpers'
import { PageHeader } from '@/components/ui'

export default function Ventas() {
  const [usuario, setUsuario] = useState(null)
  const [productos, setProductos] = useState([])
  const [stockPorSku, setStockPorSku] = useState({})
  const [cuentas, setCuentas] = useState([])
  const [ventasHoy, setVentasHoy] = useState([])
  const [cargando, setCargando] = useState(true)

  const [carrito, setCarrito] = useState([])
  const [skuSel, setSkuSel] = useState('')
  const [cantidadSel, setCantidadSel] = useState('')
  const [esEmpleado, setEsEmpleado] = useState(false)
  const [formaPago, setFormaPago] = useState('efectivo')
  const [cuentaId, setCuentaId] = useState('')
  const [clienteNombre, setClienteNombre] = useState('')
  const [guardando, setGuardando] = useState(false)

  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (parsed.rol !== 'admin' && parsed.rol !== 'auxiliar') { router.push('/dashboard'); return }
    setUsuario(parsed)
    cargar()
  }, [])

  const cargar = async () => {
    setCargando(true)
    const empresaId = getEmpresaId()
    const fecha = obtenerFechaActual()
    const [{ data: prods }, { data: cts }, { data: ventas }, stock] = await Promise.all([
      supabase.from('productos').select('sku, nombre, precio_venta, precio_empleado').eq('estado', true).eq('empresa_id', empresaId).order('nombre'),
      supabase.from('cuentas').select('*').eq('estado', true).eq('empresa_id', empresaId).order('tipo').order('nombre'),
      supabase.from('ventas_encab').select('*').eq('empresa_id', empresaId).eq('fecha', fecha).order('created_at', { ascending: false }),
      calcularStockPorSku(),
    ])
    setProductos(prods || [])
    setCuentas(cts || [])
    setVentasHoy(ventas || [])
    setStockPorSku(stock || {})
    setCargando(false)
  }

  const getPrecio = (sku) => {
    const p = productos.find(pr => pr.sku === sku)
    if (!p) return 0
    return esEmpleado ? (p.precio_empleado || p.precio_venta || 0) : (p.precio_venta || 0)
  }
  const getNombre = (sku) => productos.find(p => p.sku === sku)?.nombre || sku
  const getStock = (sku) => stockPorSku[sku]?.stockActual ?? null

  const agregarAlCarrito = () => {
    if (!skuSel || !parseFloat(cantidadSel) || parseFloat(cantidadSel) <= 0) { alert('Selecciona un producto e ingresa una cantidad valida'); return }
    const cantidad = parseFloat(cantidadSel)
    const yaEnCarrito = carrito.reduce((sum, l) => sum + (l.sku === skuSel ? l.cantidad : 0), 0)
    const stockDisp = getStock(skuSel)
    if (stockDisp !== null && cantidad + yaEnCarrito > stockDisp) {
      alert(`Stock insuficiente segun el ultimo conteo fisico: ${getNombre(skuSel)}: disponible ${stockDisp}, solicitado ${cantidad + yaEnCarrito}`)
      return
    }
    setCarrito([...carrito, { sku: skuSel, nombre: getNombre(skuSel), cantidad, precio_unitario: getPrecio(skuSel) }])
    setSkuSel('')
    setCantidadSel('')
  }

  const quitarDelCarrito = (i) => setCarrito(carrito.filter((_, idx) => idx !== i))

  const totalCarrito = carrito.reduce((sum, l) => sum + l.cantidad * l.precio_unitario, 0)

  const cuentaEfectivo = cuentas.find(c => c.tipo === 'efectivo')
  const cuentasBanco = cuentas.filter(c => c.tipo === 'banco')

  const registrarVenta = async () => {
    if (carrito.length === 0) { alert('Agrega al menos un producto al carrito'); return }
    if (formaPago === 'transferencia' && !cuentaId) { alert('Selecciona la cuenta que recibe el pago'); return }
    if (formaPago === 'fiado' && !clienteNombre.trim()) { alert('Ingresa el nombre del cliente para el fiado'); return }
    if (formaPago === 'efectivo' && !cuentaEfectivo) { alert('No existe una cuenta de tipo Efectivo configurada en Maestros'); return }

    setGuardando(true)
    const empresaId = getEmpresaId()
    const fecha = obtenerFechaActual()

    const { data: venta, error: errVenta } = await supabase.from('ventas_encab').insert({
      empresa_id: empresaId,
      fecha,
      cliente_nombre: formaPago === 'fiado' ? clienteNombre.trim() : null,
      forma_pago: formaPago,
      cuenta_id: formaPago === 'transferencia' ? cuentaId : (formaPago === 'efectivo' ? cuentaEfectivo.id : null),
      total: totalCarrito,
      registrado_por: usuario.nombre,
      estado: 'confirmada',
      es_empleado: esEmpleado,
    }).select().single()
    if (errVenta) { alert('Error al registrar la venta: ' + errVenta.message); setGuardando(false); return }

    const detalles = carrito.map(l => ({
      empresa_id: empresaId,
      venta_id: venta.id,
      sku: l.sku,
      cantidad: l.cantidad,
      precio_unitario: l.precio_unitario,
      subtotal: l.cantidad * l.precio_unitario,
    }))
    const { error: errDetalle } = await supabase.from('ventas_detalle').insert(detalles)
    if (errDetalle) alert('La venta se registro pero hubo un error guardando el detalle: ' + errDetalle.message)

    const movimientosInv = carrito.map(l => ({
      empresa_id: empresaId,
      sku: l.sku,
      cantidad: l.cantidad,
      fecha,
      tipo_movimiento: 'salida',
    }))
    const { error: errInv } = await supabase.from('inventario_mov').insert(movimientosInv)
    if (errInv) alert('La venta se registro pero hubo un error descontando el inventario: ' + errInv.message)

    if (formaPago === 'fiado') {
      const { error: errFiado } = await supabase.from('cartera_fiados').insert({
        empresa_id: empresaId,
        venta_id: venta.id,
        nombre_cliente: clienteNombre.trim(),
        valor_original: totalCarrito,
        saldo: totalCarrito,
        fecha_fiado: fecha,
        estado: 'pendiente',
      })
      if (errFiado) alert('La venta se registro pero hubo un error guardando el fiado en Cartera: ' + errFiado.message)
    } else {
      const cuentaDestino = formaPago === 'efectivo' ? cuentaEfectivo.id : cuentaId
      const { error: errTesoreria } = await supabase.from('movimientos_tesoreria').insert({
        empresa_id: empresaId, cuenta_id: cuentaDestino, fecha, tipo: 'entrada',
        monto: totalCarrito, concepto: 'Venta de mostrador', referencia_tipo: 'venta', referencia_id: venta.id,
      })
      if (errTesoreria) alert('La venta se registro pero hubo un error registrando el movimiento de caja/bancos: ' + errTesoreria.message)
    }

    setCarrito([])
    setClienteNombre('')
    setCuentaId('')
    setEsEmpleado(false)
    setGuardando(false)
    cargar()
  }

  if (!usuario) return null

  return (
    <div>
      <PageHeader title="Ventas" subtitle="Venta de mostrador" />

      <div className="p-4 max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-black text-gray-700">Agregar producto</p>
            <button onClick={() => setEsEmpleado(!esEmpleado)} disabled={carrito.length > 0}
              className={`text-xs font-bold px-3 py-2 rounded-lg transition-colors disabled:opacity-50 ${esEmpleado ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}>
              Venta a empleado
            </button>
          </div>
          {esEmpleado && <p className="text-xs text-brand font-bold mb-3">Se usara el precio empleado de cada producto (si tiene uno configurado)</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Producto</label>
              <select value={skuSel} onChange={e => setSkuSel(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
                <option value="">Selecciona</option>
                {productos.map(p => (
                  <option key={p.sku} value={p.sku}>{p.nombre} (stock {getStock(p.sku) ?? '?'})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Cantidad</label>
              <input type="number" min="0" value={cantidadSel} onChange={e => setCantidadSel(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-gray-800 focus:border-brand focus:outline-none" />
            </div>
          </div>
          <button onClick={agregarAlCarrito} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2 rounded-xl">
            + Agregar al carrito
          </button>
        </div>

        {carrito.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm mb-4 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 font-bold uppercase">
                  <th className="text-left px-3 py-2">Producto</th>
                  <th className="text-right px-3 py-2">Cant.</th>
                  <th className="text-right px-3 py-2">Subtotal</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {carrito.map((l, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-gray-700">{l.nombre}</td>
                    <td className="px-3 py-2 text-right font-bold text-gray-800">{l.cantidad}</td>
                    <td className="px-3 py-2 text-right font-bold text-gray-800">${(l.cantidad * l.precio_unitario).toLocaleString('es-CO')}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => quitarDelCarrito(i)} className="text-xs text-brand font-bold">Quitar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-4 border-t border-gray-100 flex justify-between items-center">
              <p className="font-bold text-gray-600">Total</p>
              <p className="text-xl font-black text-brand">${totalCarrito.toLocaleString('es-CO')}</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <p className="font-black text-gray-700 mb-3">Forma de pago</p>
          <div className="flex gap-2 mb-3">
            {[{ id: 'efectivo', nombre: 'Efectivo' }, { id: 'transferencia', nombre: 'Transferencia' }, { id: 'fiado', nombre: 'Fiado' }].map(f => (
              <button key={f.id} onClick={() => setFormaPago(f.id)}
                className={`flex-1 py-2 rounded-xl text-sm font-bold ${formaPago === f.id ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}>
                {f.nombre}
              </button>
            ))}
          </div>
          {formaPago === 'transferencia' && (
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Cuenta que recibe el pago</label>
              <select value={cuentaId} onChange={e => setCuentaId(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
                <option value="">Selecciona</option>
                {cuentasBanco.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          )}
          {formaPago === 'fiado' && (
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Nombre del cliente</label>
              <input type="text" value={clienteNombre} onChange={e => setClienteNombre(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
            </div>
          )}
        </div>

        <button onClick={registrarVenta} disabled={guardando || carrito.length === 0}
          className="w-full bg-brand hover:bg-brand-dark text-white font-black py-3 rounded-xl disabled:opacity-50 mb-6">
          {guardando ? 'Registrando...' : 'Registrar venta'}
        </button>

        <p className="font-black text-gray-700 mb-3">Ventas de hoy</p>
        {cargando ? (
          <p className="text-gray-400 text-center py-10">Cargando...</p>
        ) : ventasHoy.length === 0 ? (
          <p className="text-gray-400 text-center py-10">Sin ventas registradas hoy</p>
        ) : (
          <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
            {ventasHoy.map(v => (
              <div key={v.id} className="p-4 flex justify-between items-center">
                <div>
                  <p className="font-bold text-gray-800 text-sm capitalize">{v.forma_pago}{v.cliente_nombre ? ` · ${v.cliente_nombre}` : ''}{v.es_empleado ? ' · Empleado' : ''}</p>
                  <p className="text-xs text-gray-400">{new Date(v.created_at).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })} · {v.registrado_por}</p>
                </div>
                <p className="font-black text-gray-900">${v.total.toLocaleString('es-CO')}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
