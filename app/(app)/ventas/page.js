'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { calcularStockPorSku } from '@/lib/inventario-helpers'
import { PageHeader } from '@/components/ui'

const mesActual = () => obtenerFechaActual().slice(0, 7)

const rangoMes = (mes) => {
  const [y, m] = mes.split('-').map(Number)
  const inicio = `${mes}-01`
  const ultimoDia = new Date(y, m, 0).getDate()
  const fin = `${mes}-${String(ultimoDia).padStart(2, '0')}`
  return { inicio, fin }
}

const formatearFecha = (fecha) => {
  const [y, m, d] = fecha.split('-')
  return `${d}/${m}/${y}`
}

const formatearHora = (isoString) => new Date(isoString).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })

const metodoPagoLabel = (forma) => ({ efectivo: 'Efectivo', transferencia: 'Transferencia Bancaria', fiado: 'Fiado (Credito)' }[forma] || forma)

export default function Ventas() {
  const [usuario, setUsuario] = useState(null)
  const [vista, setVista] = useState('registrar')
  const [productos, setProductos] = useState([])
  const [stockPorSku, setStockPorSku] = useState({})
  const [cuentas, setCuentas] = useState([])
  const [empresa, setEmpresa] = useState(null)
  const [ventasHoy, setVentasHoy] = useState([])
  const [cargando, setCargando] = useState(true)

  const [mesHistorial, setMesHistorial] = useState(mesActual())
  const [historial, setHistorial] = useState([])
  const [cargandoHistorial, setCargandoHistorial] = useState(false)

  const [carrito, setCarrito] = useState([])
  const [skuSel, setSkuSel] = useState('')
  const [cantidadSel, setCantidadSel] = useState('')
  const [descuentoSel, setDescuentoSel] = useState('')
  const [esEmpleado, setEsEmpleado] = useState(false)
  const [formaPago, setFormaPago] = useState('efectivo')
  const [cuentaId, setCuentaId] = useState('')
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteDocumento, setClienteDocumento] = useState('')
  const [clienteTelefono, setClienteTelefono] = useState('')
  const [clienteDireccion, setClienteDireccion] = useState('')
  const [valorRecibido, setValorRecibido] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [guardando, setGuardando] = useState(false)

  const [factura, setFactura] = useState(null)
  const [cargandoFactura, setCargandoFactura] = useState(false)

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
    const [{ data: prods }, { data: cts }, { data: emp }, { data: ventas }, stock] = await Promise.all([
      supabase.from('productos').select('sku, nombre, precio_venta, precio_empleado').eq('estado', true).eq('empresa_id', empresaId).order('nombre'),
      supabase.from('cuentas').select('*').eq('estado', true).eq('empresa_id', empresaId).order('tipo').order('nombre'),
      supabase.from('empresas').select('*').eq('id', empresaId).maybeSingle(),
      supabase.from('ventas_encab').select('*').eq('empresa_id', empresaId).eq('fecha', fecha).order('created_at', { ascending: false }),
      calcularStockPorSku(),
    ])
    setProductos(prods || [])
    setCuentas(cts || [])
    setEmpresa(emp || null)
    setVentasHoy(ventas || [])
    setStockPorSku(stock || {})
    setCargando(false)
  }

  const cargarHistorial = async (mes) => {
    setCargandoHistorial(true)
    const { inicio, fin } = rangoMes(mes)
    const { data } = await supabase
      .from('ventas_encab')
      .select('*')
      .eq('empresa_id', getEmpresaId())
      .gte('fecha', inicio)
      .lte('fecha', fin)
      .order('created_at', { ascending: false })
    setHistorial(data || [])
    setCargandoHistorial(false)
  }

  const irAHistorial = () => {
    setVista('historial')
    cargarHistorial(mesHistorial)
  }

  const cambiarMesHistorial = (mes) => {
    setMesHistorial(mes)
    cargarHistorial(mes)
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
    const descuento = parseFloat(descuentoSel) || 0
    const yaEnCarrito = carrito.reduce((sum, l) => sum + (l.sku === skuSel ? l.cantidad : 0), 0)
    const stockDisp = getStock(skuSel)
    if (stockDisp !== null && cantidad + yaEnCarrito > stockDisp) {
      alert(`Stock insuficiente segun el ultimo conteo fisico: ${getNombre(skuSel)}: disponible ${stockDisp}, solicitado ${cantidad + yaEnCarrito}`)
      return
    }
    const precio_unitario = getPrecio(skuSel)
    if (descuento > cantidad * precio_unitario) { alert('El descuento no puede ser mayor al subtotal de la linea'); return }
    setCarrito([...carrito, { sku: skuSel, nombre: getNombre(skuSel), cantidad, precio_unitario, descuento }])
    setSkuSel('')
    setCantidadSel('')
    setDescuentoSel('')
  }

  const quitarDelCarrito = (i) => setCarrito(carrito.filter((_, idx) => idx !== i))

  const subtotalCarrito = carrito.reduce((sum, l) => sum + l.cantidad * l.precio_unitario, 0)
  const descuentoCarrito = carrito.reduce((sum, l) => sum + (l.descuento || 0), 0)
  const totalCarrito = subtotalCarrito - descuentoCarrito

  const cuentaEfectivo = cuentas.find(c => c.tipo === 'efectivo')
  const cuentasBanco = cuentas.filter(c => c.tipo === 'banco')

  const cambio = formaPago === 'efectivo' && valorRecibido ? Math.max(0, parseFloat(valorRecibido) - totalCarrito) : 0

  const registrarVenta = async () => {
    if (carrito.length === 0) { alert('Agrega al menos un producto al carrito'); return }
    if (formaPago === 'transferencia' && !cuentaId) { alert('Selecciona la cuenta que recibe el pago'); return }
    if (formaPago === 'fiado' && !clienteNombre.trim()) { alert('Ingresa el nombre del cliente para el fiado'); return }
    if (formaPago === 'efectivo' && !cuentaEfectivo) { alert('No existe una cuenta de tipo Efectivo configurada en Maestros'); return }
    if (formaPago === 'efectivo' && valorRecibido && parseFloat(valorRecibido) < totalCarrito) { alert('El valor recibido no puede ser menor al total'); return }

    setGuardando(true)
    const empresaId = getEmpresaId()
    const fecha = obtenerFechaActual()

    const { data: venta, error: errVenta } = await supabase.from('ventas_encab').insert({
      empresa_id: empresaId,
      fecha,
      cliente_nombre: clienteNombre.trim() || null,
      cliente_documento: clienteDocumento.trim() || null,
      cliente_telefono: clienteTelefono.trim() || null,
      cliente_direccion: clienteDireccion.trim() || null,
      forma_pago: formaPago,
      cuenta_id: formaPago === 'transferencia' ? cuentaId : (formaPago === 'efectivo' ? cuentaEfectivo.id : null),
      total: totalCarrito,
      valor_recibido: formaPago === 'efectivo' ? (parseFloat(valorRecibido) || totalCarrito) : null,
      observaciones: observaciones.trim() || null,
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
      descuento: l.descuento || 0,
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
    setClienteDocumento('')
    setClienteTelefono('')
    setClienteDireccion('')
    setValorRecibido('')
    setObservaciones('')
    setCuentaId('')
    setEsEmpleado(false)
    setGuardando(false)
    cargar()
  }

  const abrirFactura = async (venta) => {
    setCargandoFactura(true)
    const [{ data: detalle }, { data: prods }] = await Promise.all([
      supabase.from('ventas_detalle').select('*').eq('venta_id', venta.id).eq('empresa_id', getEmpresaId()),
      supabase.from('productos').select('sku, nombre').eq('empresa_id', getEmpresaId()),
    ])
    const nombresPorSku = {}
    ;(prods || []).forEach(p => { nombresPorSku[p.sku] = p.nombre })
    setFactura({ venta, detalle: detalle || [], nombresPorSku })
    setCargandoFactura(false)
  }

  if (!usuario) return null

  if (factura) {
    const { venta, detalle, nombresPorSku } = factura
    const subtotal = detalle.reduce((s, d) => s + (d.cantidad * d.precio_unitario), 0)
    const descuentos = detalle.reduce((s, d) => s + (d.descuento || 0), 0)
    const iva = 0
    const numeroFactura = `FV-${String(venta.numero || 0).padStart(8, '0')}`
    const pagado = venta.forma_pago !== 'fiado'
    return (
      <>
        <style>{`
          @media print { .no-print { display: none !important; } body { margin: 0; background: white; } }
          body { font-family: Arial, sans-serif; }
          table { width: 100%; border-collapse: collapse; }
        `}</style>
        <div className="no-print bg-gray-100 p-4 flex gap-3 items-center sticky top-0 z-10">
          <button onClick={() => setFactura(null)} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-bold text-sm">← Volver</button>
          <button onClick={() => window.print()} className="bg-brand hover:bg-brand-dark text-white px-6 py-2 rounded-lg font-bold text-sm">🖨️ Imprimir</button>
        </div>

        <div style={{ padding: '24px', maxWidth: '780px', margin: '0 auto', background: 'white', color: '#111' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '16px', borderBottom: '2px solid #000' }}>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              {empresa?.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={empresa.logo_url} alt={empresa.nombre} style={{ width: '70px', height: '70px', objectFit: 'contain' }} />
              )}
              <div>
                <p style={{ fontWeight: 900, fontSize: '18px', margin: 0 }}>{empresa?.nombre || ''}</p>
                {empresa?.nit && <p style={{ fontSize: '12px', margin: '2px 0' }}>NIT: {empresa.nit}</p>}
                {empresa?.direccion && <p style={{ fontSize: '12px', margin: '2px 0' }}>{empresa.direccion}</p>}
                {empresa?.ciudad && <p style={{ fontSize: '12px', margin: '2px 0' }}>{empresa.ciudad}, Colombia</p>}
                {empresa?.telefono && <p style={{ fontSize: '12px', margin: '2px 0' }}>Tel: {empresa.telefono}</p>}
                {empresa?.email && <p style={{ fontSize: '12px', margin: '2px 0' }}>{empresa.email}</p>}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ background: '#000', color: '#fff', fontWeight: 900, fontSize: '13px', padding: '6px 14px', borderRadius: '6px', display: 'inline-block', marginBottom: '6px' }}>
                FACTURA DE VENTA
              </div>
              <p style={{ fontWeight: 900, fontSize: '20px', margin: '4px 0' }}>No. {numeroFactura}</p>
              <p style={{ fontSize: '12px', margin: '2px 0' }}>Fecha: {formatearFecha(venta.fecha)}</p>
              <p style={{ fontSize: '12px', margin: '2px 0' }}>Hora: {formatearHora(venta.created_at)}</p>
              <p style={{ fontSize: '12px', margin: '2px 0' }}>Vendedor: {venta.registrado_por}</p>
            </div>
          </div>

          {(venta.cliente_nombre || venta.cliente_documento || venta.cliente_telefono || venta.cliente_direccion) && (
            <div style={{ border: '1px solid #ccc', borderRadius: '10px', padding: '14px', margin: '16px 0' }}>
              <p style={{ fontWeight: 900, fontSize: '12px', margin: '0 0 10px 0' }}>DATOS DEL CLIENTE</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', fontSize: '12px' }}>
                <div><strong>Cliente:</strong><br />{venta.cliente_nombre || '—'}</div>
                <div><strong>Documento:</strong><br />{venta.cliente_documento || '—'}</div>
                <div><strong>Telefono:</strong><br />{venta.cliente_telefono || '—'}</div>
                <div><strong>Direccion:</strong><br />{venta.cliente_direccion || '—'}</div>
              </div>
            </div>
          )}

          <table style={{ fontSize: '12px', margin: '16px 0' }}>
            <thead>
              <tr style={{ background: '#000', color: '#fff' }}>
                <th style={{ padding: '8px', textAlign: 'left' }}>CODIGO</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>PRODUCTO</th>
                <th style={{ padding: '8px', textAlign: 'center' }}>CANT.</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>PRECIO UNITARIO</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>DESCUENTO</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>IVA</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {detalle.map((d, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px' }}>{d.sku}</td>
                  <td style={{ padding: '8px' }}>{nombresPorSku[d.sku] || d.sku}</td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>{d.cantidad}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>${d.precio_unitario.toLocaleString('es-CO')}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>${(d.descuento || 0).toLocaleString('es-CO')}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>$0</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>${(d.cantidad * d.precio_unitario - (d.descuento || 0)).toLocaleString('es-CO')}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
            <div style={{ border: '1px solid #ccc', borderRadius: '10px', padding: '14px' }}>
              <p style={{ fontWeight: 900, fontSize: '12px', margin: '0 0 10px 0' }}>INFORMACION DEL PAGO</p>
              <p style={{ fontSize: '12px', margin: '4px 0' }}><strong>Metodo de pago:</strong> {metodoPagoLabel(venta.forma_pago)}</p>
              {venta.forma_pago === 'efectivo' && (
                <>
                  <p style={{ fontSize: '12px', margin: '4px 0' }}><strong>Valor recibido:</strong> ${(venta.valor_recibido || venta.total).toLocaleString('es-CO')}</p>
                  <p style={{ fontSize: '12px', margin: '4px 0' }}><strong>Cambio:</strong> ${Math.max(0, (venta.valor_recibido || venta.total) - venta.total).toLocaleString('es-CO')}</p>
                </>
              )}
              <div style={{ marginTop: '10px' }}>
                <span style={{ background: pagado ? '#000' : '#eee', color: pagado ? '#fff' : '#333', fontWeight: 900, fontSize: '11px', padding: '4px 10px', borderRadius: '6px' }}>
                  {pagado ? '✓ PAGADO' : 'PENDIENTE'}
                </span>
              </div>
            </div>
            <div style={{ padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span>SUBTOTAL</span><span>${subtotal.toLocaleString('es-CO')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span>DESCUENTOS</span><span>-${descuentos.toLocaleString('es-CO')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '10px', borderBottom: '1px solid #ccc', paddingBottom: '10px' }}>
                <span>IVA (0%)</span><span>${iva.toLocaleString('es-CO')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 900 }}>TOTAL A PAGAR</span>
                <span style={{ background: '#000', color: '#fff', fontWeight: 900, fontSize: '20px', padding: '8px 16px', borderRadius: '8px' }}>
                  ${venta.total.toLocaleString('es-CO')}
                </span>
              </div>
            </div>
          </div>

          {venta.observaciones && (
            <div style={{ border: '1px solid #ccc', borderRadius: '10px', padding: '14px', marginTop: '16px' }}>
              <p style={{ fontWeight: 900, fontSize: '12px', margin: '0 0 6px 0' }}>OBSERVACIONES</p>
              <p style={{ fontSize: '12px', margin: 0 }}>{venta.observaciones}</p>
            </div>
          )}

          <div style={{ borderTop: '1px solid #ccc', marginTop: '20px', paddingTop: '14px', textAlign: 'center' }}>
            <p style={{ fontStyle: 'italic', fontSize: '14px', margin: '0 0 4px 0' }}>Gracias por su compra.</p>
            <p style={{ fontSize: '11px', color: '#666', margin: 0 }}>Esta factura fue generada por MaissyPOS®</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <div>
      <PageHeader title="Ventas" subtitle="Venta de mostrador" />

      <div className="p-4 max-w-2xl mx-auto">
        <div className="flex gap-2 mb-4">
          <button onClick={() => setVista('registrar')}
            className={`flex-1 py-2 rounded-xl text-sm font-bold ${vista === 'registrar' ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            Registrar
          </button>
          <button onClick={irAHistorial}
            className={`flex-1 py-2 rounded-xl text-sm font-bold ${vista === 'historial' ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            Historial
          </button>
        </div>

        {vista === 'historial' ? (
          <div>
            <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
              <label className="text-xs font-bold text-gray-600 block mb-1">Mes</label>
              <input type="month" value={mesHistorial} onChange={e => cambiarMesHistorial(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
            </div>

            {cargandoHistorial ? (
              <p className="text-gray-400 text-center py-10">Cargando...</p>
            ) : historial.length === 0 ? (
              <p className="text-gray-400 text-center py-10">Sin ventas registradas este mes</p>
            ) : (
              <>
                <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex justify-between items-center">
                  <p className="font-black text-gray-700">Total del mes</p>
                  <p className="text-xl font-black text-brand">${historial.reduce((s, v) => s + (v.total || 0), 0).toLocaleString('es-CO')}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
                  {historial.map(v => (
                    <div key={v.id} className="p-4 flex justify-between items-center">
                      <div>
                        <p className="font-bold text-gray-800 text-sm capitalize">{v.forma_pago}{v.cliente_nombre ? ` · ${v.cliente_nombre}` : ''}{v.es_empleado ? ' · Empleado' : ''}</p>
                        <p className="text-xs text-gray-400">{v.fecha} {formatearHora(v.created_at)} · {v.registrado_por}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="font-black text-gray-900">${v.total.toLocaleString('es-CO')}</p>
                        <button onClick={() => abrirFactura(v)} disabled={cargandoFactura} className="text-xs bg-gray-100 px-3 py-2 rounded-lg font-bold text-gray-600">
                          Factura
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
        <>
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-black text-gray-700">Agregar producto</p>
            <button onClick={() => setEsEmpleado(!esEmpleado)} disabled={carrito.length > 0}
              className={`text-xs font-bold px-3 py-2 rounded-lg transition-colors disabled:opacity-50 ${esEmpleado ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}>
              Venta a empleado
            </button>
          </div>
          {esEmpleado && <p className="text-xs text-brand font-bold mb-3">Se usara el precio empleado de cada producto (si tiene uno configurado)</p>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
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
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Descuento (opcional)</label>
              <input type="number" min="0" value={descuentoSel} onChange={e => setDescuentoSel(e.target.value)}
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
                  <th className="text-right px-3 py-2">Desc.</th>
                  <th className="text-right px-3 py-2">Subtotal</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {carrito.map((l, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-gray-700">{l.nombre}</td>
                    <td className="px-3 py-2 text-right font-bold text-gray-800">{l.cantidad}</td>
                    <td className="px-3 py-2 text-right text-brand">{l.descuento > 0 ? `-$${l.descuento.toLocaleString('es-CO')}` : '—'}</td>
                    <td className="px-3 py-2 text-right font-bold text-gray-800">${(l.cantidad * l.precio_unitario - l.descuento).toLocaleString('es-CO')}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => quitarDelCarrito(i)} className="text-xs text-brand font-bold">Quitar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-4 border-t border-gray-100 space-y-1">
              <div className="flex justify-between text-sm text-gray-500"><span>Subtotal</span><span>${subtotalCarrito.toLocaleString('es-CO')}</span></div>
              {descuentoCarrito > 0 && <div className="flex justify-between text-sm text-brand"><span>Descuentos</span><span>-${descuentoCarrito.toLocaleString('es-CO')}</span></div>}
              <div className="flex justify-between items-center pt-1">
                <p className="font-bold text-gray-600">Total</p>
                <p className="text-xl font-black text-brand">${totalCarrito.toLocaleString('es-CO')}</p>
              </div>
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
          {formaPago === 'efectivo' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Valor recibido (opcional)</label>
                <input type="number" min="0" value={valorRecibido} onChange={e => setValorRecibido(e.target.value)}
                  placeholder={`$${totalCarrito.toLocaleString('es-CO')}`}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Cambio</label>
                <p className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-3 py-2 text-sm font-bold text-gray-700">${cambio.toLocaleString('es-CO')}</p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <p className="font-black text-gray-700 mb-3">Datos del cliente (opcional, para factura)</p>
          <div className="mb-3">
            <label className="text-xs font-bold text-gray-600 block mb-1">Nombre{formaPago === 'fiado' ? '' : ' (opcional)'}</label>
            <input type="text" value={clienteNombre} onChange={e => setClienteNombre(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Documento</label>
              <input type="text" value={clienteDocumento} onChange={e => setClienteDocumento(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Telefono</label>
              <input type="text" value={clienteTelefono} onChange={e => setClienteTelefono(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1">Direccion</label>
            <input type="text" value={clienteDireccion} onChange={e => setClienteDireccion(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <label className="text-xs font-bold text-gray-600 block mb-1">Observaciones (opcional)</label>
          <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={2}
            className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
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
                  <p className="text-xs text-gray-400">{formatearHora(v.created_at)} · {v.registrado_por}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-black text-gray-900">${v.total.toLocaleString('es-CO')}</p>
                  <button onClick={() => abrirFactura(v)} disabled={cargandoFactura} className="text-xs bg-gray-100 px-3 py-2 rounded-lg font-bold text-gray-600">
                    Factura
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        </>
        )}
      </div>
    </div>
  )
}
