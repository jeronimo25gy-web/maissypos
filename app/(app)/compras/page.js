'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'

const DIAS_SEMANA = [
  { id: 1, nombre: 'Lunes' },
  { id: 2, nombre: 'Martes' },
  { id: 3, nombre: 'Miercoles' },
  { id: 4, nombre: 'Jueves' },
  { id: 5, nombre: 'Viernes' },
  { id: 6, nombre: 'Sabado' },
  { id: 0, nombre: 'Domingo' },
]

const hoyBogota = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }))

const fechasMismoDiaSemana = (diaObjetivo) => {
  const diffDias = (hoyBogota().getDay() - diaObjetivo + 7) % 7
  const msMasReciente = Date.now() - diffDias * 24 * 60 * 60 * 1000
  return Array.from({ length: 4 }, (_, i) =>
    new Date(msMasReciente - i * 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  )
}

export default function Compras() {
  const [usuario, setUsuario] = useState(null)
  const [proveedores, setProveedores] = useState([])
  const [proveedorSel, setProveedorSel] = useState(null)
  const [productos, setProductos] = useState([])
  const [cantidades, setCantidades] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [vista, setVista] = useState('compra')
  const [sugeridos, setSugeridos] = useState([])
  const [cargandoSugerido, setCargandoSugerido] = useState(false)
  const [diaSemana, setDiaSemana] = useState(() => hoyBogota().getDay())
  const [cantidadesEditadas, setCantidadesEditadas] = useState({})
  const [expandidoSku, setExpandidoSku] = useState(null)
  const [textoExportado, setTextoExportado] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [cuentasPorPagar, setCuentasPorPagar] = useState([])
  const [cargandoCuentas, setCargandoCuentas] = useState(false)
  const [pagando, setPagando] = useState(null)
  const [pagandoConCuenta, setPagandoConCuenta] = useState(null)
  const [cuentaPagoId, setCuentaPagoId] = useState('')
  const [cuentas, setCuentas] = useState([])
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    setUsuario(JSON.parse(u))
    cargarProveedores()
    cargarCuentas()
  }, [])

  const cargarCuentas = async () => {
    const { data } = await supabase.from('cuentas').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('tipo').order('nombre')
    if (data) setCuentas(data)
  }

  const cargarProveedores = async () => {
    const { data } = await supabase.from('proveedores').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    if (data) setProveedores(data)
  }

  const irASugerido = () => {
    setVista('sugerido')
    setTextoExportado('')
    setCopiado(false)
    cargarSugeridos(diaSemana)
  }

  const cambiarDiaSugerido = (dia) => {
    setDiaSemana(dia)
    cargarSugeridos(dia)
  }

  const cargarSugeridos = async (dia) => {
    setCargandoSugerido(true)
    setExpandidoSku(null)
    const fechasComparables = fechasMismoDiaSemana(dia)

    const { data: todosProductos } = await supabase.from('productos').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    const { data: conteos } = await supabase
      .from('conteo_fisico')
      .select('sku, fecha, cantidad_fisica')
      .eq('empresa_id', getEmpresaId())
      .order('fecha', { ascending: false })
    const { data: ventas } = await supabase
      .from('liquidaciones')
      .select('sku, vendido_neto, fecha, despacho_id')
      .eq('empresa_id', getEmpresaId())
      .in('fecha', fechasComparables)
    const despachoIds = [...new Set((ventas || []).map(v => v.despacho_id))]
    const { data: despachos } = despachoIds.length > 0
      ? await supabase.from('despachos_encab').select('id, rutas(nombre)').in('id', despachoIds)
      : { data: [] }
    const rutaPorDespacho = {}
    ;(despachos || []).forEach(d => { rutaPorDespacho[d.id] = d.rutas?.nombre || 'Sin ruta' })

    if (todosProductos) {
      const stockPorSku = {}
      ;(conteos || []).forEach(c => {
        if (!(c.sku in stockPorSku)) stockPorSku[c.sku] = c.cantidad_fisica
      })
      const ventasPorSku = {}
      const ventasPorSkuYRuta = {}
      ;(ventas || []).forEach(v => {
        ventasPorSku[v.sku] = (ventasPorSku[v.sku] || 0) + (v.vendido_neto || 0)
        const ruta = rutaPorDespacho[v.despacho_id] || 'Sin ruta'
        if (!ventasPorSkuYRuta[v.sku]) ventasPorSkuYRuta[v.sku] = {}
        ventasPorSkuYRuta[v.sku][ruta] = (ventasPorSkuYRuta[v.sku][ruta] || 0) + (v.vendido_neto || 0)
      })

      const calculados = todosProductos.map(p => {
        const stockActual = stockPorSku[p.sku] ?? 0
        const promedioVentas = Math.ceil((ventasPorSku[p.sku] || 0) / 4)
        const cantidadSugerida = Math.max(0, Math.ceil((p.stock_minimo || 0) - stockActual + promedioVentas * (p.dias_cobertura || 0)))
        const ventasPorRuta = Object.entries(ventasPorSkuYRuta[p.sku] || {}).sort((a, b) => b[1] - a[1])
        return { ...p, stockActual, promedioVentas, cantidadSugerida, ventasPorRuta }
      }).filter(p => p.cantidadSugerida > 0)

      setSugeridos(calculados)
      const editables = {}
      calculados.forEach(p => { editables[p.sku] = String(p.cantidadSugerida) })
      setCantidadesEditadas(editables)
    }
    setCargandoSugerido(false)
  }

  const irACuentas = () => {
    setVista('cuentas')
    cargarCuentasPorPagar()
  }

  const cargarCuentasPorPagar = async () => {
    setCargandoCuentas(true)
    const { data } = await supabase
      .from('facturas_proveedores')
      .select('*, proveedores(nombre)')
      .eq('estado', 'pendiente')
      .eq('empresa_id', getEmpresaId())
      .order('updated_at', { ascending: false })
    if (data) {
      const lista = data
        .filter(f => (f.total_pendiente || 0) > 0)
        .map(f => ({ proveedorId: f.proveedor_id, nombre: f.proveedores?.nombre || 'Sin proveedor', total: f.total_pendiente || 0 }))
        .sort((a, b) => b.total - a.total)
      setCuentasPorPagar(lista)
    }
    setCargandoCuentas(false)
  }

  const marcarPagado = async (proveedorId, nombreProveedor, total) => {
    if (!cuentaPagoId) { alert('Selecciona de que cuenta sale el pago'); return }
    setPagando(proveedorId)
    const empresaId = getEmpresaId()
    const { error: errFactura } = await supabase.from('facturas_proveedores')
      .update({ estado: 'pagado', updated_at: new Date().toISOString() })
      .eq('proveedor_id', proveedorId).eq('estado', 'pendiente').eq('empresa_id', empresaId)
    if (errFactura) { alert('Error: ' + errFactura.message); setPagando(null); return }
    const { error } = await supabase.from('compras').update({ estado: 'pagado' }).eq('proveedor_id', proveedorId).eq('estado', 'pendiente').eq('empresa_id', empresaId)
    if (error) { alert('Error: ' + error.message); setPagando(null); return }
    const { error: errTesoreria } = await supabase.from('movimientos_tesoreria').insert({
      empresa_id: empresaId, cuenta_id: cuentaPagoId, fecha: obtenerFechaActual(), tipo: 'salida',
      monto: total, concepto: `Pago a ${nombreProveedor}`, referencia_tipo: 'compra', referencia_id: proveedorId
    })
    if (errTesoreria) alert('El pago se marco, pero no se pudo registrar el movimiento de caja/bancos: ' + errTesoreria.message)
    setPagandoConCuenta(null)
    setCuentaPagoId('')
    await cargarCuentasPorPagar()
    setPagando(null)
  }

  const grupoPorProveedor = () => {
    const grupos = {}
    sugeridos.forEach(p => {
      const prov = proveedores.find(pr => pr.id === p.proveedor_id)
      const key = prov?.nombre || 'Sin proveedor asignado'
      if (!grupos[key]) grupos[key] = []
      grupos[key].push(p)
    })
    return grupos
  }

  const generarPedido = () => {
    const grupos = grupoPorProveedor()
    const fecha = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })
    let texto = `Pedido sugerido - ${fecha}\n`
    Object.entries(grupos).forEach(([proveedor, items]) => {
      const conCantidad = items.filter(p => parseFloat(cantidadesEditadas[p.sku] ?? p.cantidadSugerida) > 0)
      if (conCantidad.length === 0) return
      texto += `\n${proveedor}\n`
      conCantidad.forEach(p => {
        texto += `- ${p.nombre}: ${cantidadesEditadas[p.sku] ?? p.cantidadSugerida} und\n`
      })
    })
    setTextoExportado(texto)
    setCopiado(false)
    if (navigator.clipboard) {
      navigator.clipboard.writeText(texto).then(() => setCopiado(true)).catch(() => {})
    }
  }

  const seleccionarProveedor = async (prov) => {
    setProveedorSel(prov)
    setGuardado(false)
    const { data } = await supabase
      .from('productos')
      .select('*')
      .eq('proveedor_id', prov.id)
      .eq('estado', true)
      .eq('empresa_id', getEmpresaId())
      .order('nombre')
    if (data) {
      setProductos(data)
      const initial = {}
      data.forEach(p => { initial[p.sku] = '' })
      setCantidades(initial)
    }
  }

  const totalCompra = () => {
    return productos.reduce((sum, p) => {
      const cant = parseFloat(cantidades[p.sku] || 0)
      return sum + cant * (p.costo_compra || 0)
    }, 0)
  }

  const guardarCompra = async () => {
    const conCantidad = productos.filter(p => parseFloat(cantidades[p.sku] || 0) > 0)
    if (conCantidad.length === 0) { alert('Ingresa al menos una cantidad'); return }
    setGuardando(true)
    const fecha = obtenerFechaActual()
    const registros = conCantidad.map(p => ({
      empresa_id: p.empresa_id,
      fecha,
      proveedor_id: proveedorSel.id,
      sku: p.sku,
      cantidad: parseFloat(cantidades[p.sku]),
      precio_unitario: p.costo_compra || 0,
      total: parseFloat(cantidades[p.sku]) * (p.costo_compra || 0),
      tipo_soporte: 'registro_manual',
      estado: 'pendiente'
    }))
    const { error } = await supabase.from('compras').insert(registros)
    if (!error) {
      const movimientos = conCantidad.map(p => ({
        empresa_id: p.empresa_id,
        sku: p.sku,
        cantidad: parseFloat(cantidades[p.sku]),
        fecha,
        tipo_movimiento: 'entrada',
        referencia: `Compra a ${proveedorSel.nombre}`
      }))
      const { error: errMov } = await supabase.from('inventario_mov').insert(movimientos)
      if (errMov) alert('La compra se guardo, pero no se pudo actualizar el inventario disponible: ' + errMov.message)

      const empresaId = getEmpresaId()
      const totalBatch = totalCompra()
      const { data: facturaExistente } = await supabase.from('facturas_proveedores').select('id, total_pendiente')
        .eq('proveedor_id', proveedorSel.id).eq('empresa_id', empresaId).eq('estado', 'pendiente').maybeSingle()
      if (facturaExistente) {
        const { error: errFactura } = await supabase.from('facturas_proveedores')
          .update({ total_pendiente: (facturaExistente.total_pendiente || 0) + totalBatch, updated_at: new Date().toISOString() })
          .eq('id', facturaExistente.id)
        if (errFactura) alert('La compra se guardo, pero no se pudo actualizar el saldo del proveedor: ' + errFactura.message)
      } else {
        const { error: errFactura } = await supabase.from('facturas_proveedores')
          .insert({ empresa_id: empresaId, proveedor_id: proveedorSel.id, total_pendiente: totalBatch, estado: 'pendiente' })
        if (errFactura) alert('La compra se guardo, pero no se pudo crear el saldo del proveedor: ' + errFactura.message)
      }
      setGuardado(true)
    } else {
      alert('Error: ' + error.message)
    }
    setGuardando(false)
  }

  if (guardado) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-md w-full">
        <div className="text-6xl mb-4">ok</div>
        <h2 className="text-2xl font-black text-gray-800">Compra registrada</h2>
        <p className="text-gray-500 mt-1">{proveedorSel?.nombre}</p>
        <p className="text-3xl font-black text-gray-900 mt-4">${totalCompra().toLocaleString('es-CO')}</p>
        <div className="flex gap-3 mt-6">
          <button onClick={() => { setProveedorSel(null); setProductos([]); setGuardado(false) }}
            className="flex-1 bg-brand hover:bg-brand-dark text-white px-4 py-3 rounded-xl font-bold">
            Nueva compra
          </button>
          <button onClick={() => router.push('/dashboard')}
            className="flex-1 bg-gray-100 text-gray-600 px-4 py-3 rounded-xl font-bold">
            Inicio
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <div className="bg-white shadow-sm px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-gray-700" aria-label="Volver al dashboard">←</button>
          <h1 className="text-xl font-black text-gray-900">Compras</h1>
        </div>
        <p className="text-xs text-gray-500">{new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {!proveedorSel && (
          <div className="flex gap-2 mb-4">
            <button onClick={() => setVista('compra')}
              className={`flex-1 py-2 rounded-xl text-sm font-bold ${vista === 'compra' ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              Registrar compra
            </button>
            <button onClick={irASugerido}
              className={`flex-1 py-2 rounded-xl text-sm font-bold ${vista === 'sugerido' ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              Sugerido de pedido
            </button>
            <button onClick={irACuentas}
              className={`flex-1 py-2 rounded-xl text-sm font-bold ${vista === 'cuentas' ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              Cuentas por pagar
            </button>
          </div>
        )}

        {!proveedorSel && vista === 'cuentas' ? (
          <div>
            {cargandoCuentas ? (
              <p className="text-gray-400 text-center py-10">Cargando...</p>
            ) : cuentasPorPagar.length === 0 ? (
              <p className="text-gray-400 text-center py-10">No hay cuentas pendientes de pago</p>
            ) : (
              cuentasPorPagar.map(g => (
                <div key={g.proveedorId || 'sin-proveedor'} className="bg-white rounded-xl shadow-sm mb-4 overflow-hidden">
                  <div className="p-4 flex justify-between items-center">
                    <div>
                      <p className="font-black text-gray-900">{g.nombre}</p>
                      <p className="text-xs text-gray-500">Saldo pendiente</p>
                    </div>
                    <p className="text-xl font-black text-brand">${g.total.toLocaleString('es-CO')}</p>
                  </div>
                  {usuario?.rol === 'admin' && g.proveedorId && (
                    pagandoConCuenta === g.proveedorId ? (
                      <div className="p-4 border-t border-gray-100">
                        <label className="text-xs font-bold text-gray-600 block mb-1">De que cuenta sale el pago</label>
                        <select value={cuentaPagoId} onChange={e => setCuentaPagoId(e.target.value)}
                          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none mb-2">
                          <option value="">Selecciona cuenta</option>
                          {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                        <div className="flex gap-2">
                          <button onClick={() => { setPagandoConCuenta(null); setCuentaPagoId('') }} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-lg text-sm">
                            Cancelar
                          </button>
                          <button onClick={() => marcarPagado(g.proveedorId, g.nombre, g.total)} disabled={pagando === g.proveedorId}
                            className="flex-1 bg-brand hover:bg-brand-dark text-white font-bold py-2 rounded-lg text-sm disabled:opacity-50">
                            {pagando === g.proveedorId ? 'Marcando...' : 'Confirmar pago'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setPagandoConCuenta(g.proveedorId)}
                        className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-3">
                        Marcar pagado
                      </button>
                    )
                  )}
                </div>
              ))
            )}
          </div>
        ) : !proveedorSel && vista === 'sugerido' ? (
          <div>
            <p className="text-xs font-bold text-gray-500 mb-2">Calcular sugerido segun el consumo de este dia (ultimas 4 semanas)</p>
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
              {DIAS_SEMANA.map(d => (
                <button key={d.id} onClick={() => cambiarDiaSugerido(d.id)}
                  className={`px-3 py-2 rounded-xl text-sm font-bold whitespace-nowrap ${diaSemana === d.id ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
                  {d.nombre}
                </button>
              ))}
            </div>
            {cargandoSugerido ? (
              <p className="text-gray-400 text-center py-10">Cargando...</p>
            ) : sugeridos.length === 0 ? (
              <p className="text-gray-400 text-center py-10">No hay productos por pedir segun el stock minimo y el consumo reciente</p>
            ) : (
              <>
                <button onClick={generarPedido}
                  className="w-full bg-brand hover:bg-brand-dark text-white font-black py-3 rounded-xl mb-4">
                  Generar pedido
                </button>
                {textoExportado && (
                  <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
                    <p className="text-xs font-bold text-gray-500 mb-2">{copiado ? 'Copiado al portapapeles' : 'Copia el texto manualmente'}</p>
                    <textarea readOnly value={textoExportado}
                      className="w-full border border-gray-200 rounded-lg p-3 text-xs font-mono text-gray-700 h-48" />
                  </div>
                )}
                {Object.entries(grupoPorProveedor()).map(([proveedor, items]) => (
                  <div key={proveedor} className="mb-6">
                    <h2 className="font-black text-gray-700 mb-2">{proveedor}</h2>
                    <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
                      {items.map(p => (
                        <div key={p.sku} className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <p className="font-bold text-gray-800 text-sm">{p.nombre}</p>
                              <p className="text-xs text-gray-400">{p.sku} · {p.presentacion}</p>
                              {p.ventasPorRuta.length > 0 && (
                                <button onClick={() => setExpandidoSku(expandidoSku === p.sku ? null : p.sku)}
                                  className="text-xs text-brand font-bold mt-1">
                                  {expandidoSku === p.sku ? 'Ocultar por ruta' : 'Ver por ruta'}
                                </button>
                              )}
                            </div>
                            <div className="flex gap-4 items-center">
                              <div className="text-center">
                                <p className="text-xs text-gray-400">Stock</p>
                                <p className="font-bold text-gray-600">{p.stockActual}</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-gray-400">Minimo</p>
                                <p className="font-bold text-gray-600">{p.stock_minimo || 0}</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-gray-400">Prom. mismo dia</p>
                                <p className="font-bold text-gray-600">{p.promedioVentas}</p>
                              </div>
                              <div className="text-center w-20">
                                <p className="text-xs text-gray-400">Pedir</p>
                                <input type="number" min="0" value={cantidadesEditadas[p.sku] ?? p.cantidadSugerida}
                                  onChange={e => setCantidadesEditadas(prev => ({ ...prev, [p.sku]: e.target.value }))}
                                  className="w-full text-center border-2 border-gray-200 rounded-lg py-1 text-lg font-black text-brand focus:border-brand focus:outline-none" />
                              </div>
                            </div>
                          </div>
                          {expandidoSku === p.sku && (
                            <div className="mt-3 bg-gray-50 rounded-lg p-3">
                              <p className="text-xs font-bold text-gray-500 mb-2">Vendido por ruta ese dia (ultimas 4 semanas)</p>
                              {p.ventasPorRuta.map(([ruta, cantidad]) => (
                                <div key={ruta} className="flex justify-between text-xs text-gray-600 mb-1">
                                  <span>{ruta}</span>
                                  <span className="font-bold">{cantidad}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        ) : !proveedorSel && vista === 'compra' ? (
          <div>
            <p className="text-sm font-bold text-gray-600 mb-3">Selecciona el proveedor</p>
            <div className="grid grid-cols-1 gap-2">
              {proveedores.map(p => (
                <button key={p.id} onClick={() => seleccionarProveedor(p)}
                  className="bg-white rounded-xl p-4 shadow-sm text-left hover:shadow-md transition-all flex justify-between items-center">
                  <div>
                    <p className="font-black text-gray-800">{p.nombre}</p>
                    <p className="text-xs text-gray-400">{p.productos}</p>
                  </div>
                  <span className="text-gray-400">→</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div className="bg-gray-100 border border-gray-300 rounded-xl p-4 mb-4 flex justify-between items-center">
              <div>
                <p className="font-black text-gray-900">{proveedorSel.nombre}</p>
                <p className="text-sm text-gray-600">Ingresa las cantidades recibidas</p>
              </div>
              <button onClick={() => { setProveedorSel(null); setProductos([]) }}
                className="text-brand text-sm font-bold">Cambiar</button>
            </div>

            {productos.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center shadow-sm">
                <p className="text-4xl mb-3">X</p>
                <p className="text-gray-500">Este proveedor no tiene productos asignados</p>
              </div>
            ) : (
              <div>
                <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-4">
                  {productos.map((p, i) => (
                    <div key={p.sku} className={`flex items-center px-4 py-3 ${i < productos.length - 1 ? 'border-b border-gray-100' : ''}`}>
                      <div className="flex-1">
                        <p className="font-medium text-gray-800 text-sm">{p.nombre}</p>
                        <p className="text-xs text-gray-400">
                          {p.presentacion}
                          {p.costo_compra ? ' · $' + p.costo_compra.toLocaleString('es-CO') : ' · Sin costo'}
                        </p>
                      </div>
                      <input
                        type="number" min="0"
                        value={cantidades[p.sku]}
                        onChange={e => setCantidades(prev => ({ ...prev, [p.sku]: e.target.value }))}
                        className="w-20 text-center border-2 border-gray-200 rounded-lg py-2 font-bold text-gray-800 focus:border-brand focus:outline-none ml-3"
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>

                <div className="bg-white rounded-xl p-4 shadow-sm mb-4 flex justify-between items-center">
                  <p className="font-bold text-gray-600">Total compra</p>
                  <p className="font-black text-gray-900 text-xl">${totalCompra().toLocaleString('es-CO')}</p>
                </div>

                <button onClick={guardarCompra} disabled={guardando}
                  className="w-full bg-brand hover:bg-brand-dark text-white font-black py-4 rounded-xl text-lg disabled:opacity-50">
                  {guardando ? 'Guardando...' : 'Registrar Compra'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
