'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

const fechasMismoDiaSemana = () => Array.from({ length: 4 }, (_, i) =>
  new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
)

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
  const [textoExportado, setTextoExportado] = useState('')
  const [copiado, setCopiado] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    setUsuario(JSON.parse(u))
    cargarProveedores()
  }, [])

  const cargarProveedores = async () => {
    const { data } = await supabase.from('proveedores').select('*').eq('estado', true).order('nombre')
    if (data) setProveedores(data)
  }

  const irASugerido = () => {
    setVista('sugerido')
    setTextoExportado('')
    setCopiado(false)
    cargarSugeridos()
  }

  const cargarSugeridos = async () => {
    setCargandoSugerido(true)
    const fechasComparables = fechasMismoDiaSemana()

    const { data: todosProductos } = await supabase.from('productos').select('*').eq('estado', true).order('nombre')
    const { data: conteos } = await supabase
      .from('conteo_fisico')
      .select('sku, fecha, cantidad_fisica')
      .order('fecha', { ascending: false })
    const { data: ventas } = await supabase
      .from('liquidaciones')
      .select('sku, vendido_neto, fecha')
      .in('fecha', fechasComparables)

    if (todosProductos) {
      const stockPorSku = {}
      ;(conteos || []).forEach(c => {
        if (!(c.sku in stockPorSku)) stockPorSku[c.sku] = c.cantidad_fisica
      })
      const ventasPorSku = {}
      ;(ventas || []).forEach(v => {
        ventasPorSku[v.sku] = (ventasPorSku[v.sku] || 0) + (v.vendido_neto || 0)
      })

      const calculados = todosProductos.map(p => {
        const stockActual = stockPorSku[p.sku] ?? 0
        const promedioVentas = Math.ceil((ventasPorSku[p.sku] || 0) / 4)
        const cantidadSugerida = Math.max(0, Math.ceil((p.stock_minimo || 0) - stockActual + promedioVentas * (p.dias_cobertura || 0)))
        return { ...p, stockActual, promedioVentas, cantidadSugerida }
      }).filter(p => p.cantidadSugerida > 0)

      setSugeridos(calculados)
    }
    setCargandoSugerido(false)
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

  const exportarPedido = () => {
    const grupos = grupoPorProveedor()
    const fecha = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })
    let texto = `Pedido sugerido - ${fecha}\n`
    Object.entries(grupos).forEach(([proveedor, items]) => {
      texto += `\n${proveedor}\n`
      items.forEach(p => {
        texto += `- ${p.nombre}: ${p.cantidadSugerida} und\n`
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
    const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const registros = conCantidad.map(p => ({
      empresa_id: p.empresa_id,
      fecha,
      proveedor_id: proveedorSel.id,
      sku: p.sku,
      cantidad: parseFloat(cantidades[p.sku]),
      precio_unitario: p.costo_compra || 0,
      total: parseFloat(cantidades[p.sku]) * (p.costo_compra || 0),
      tipo_soporte: 'registro_manual'
    }))
    const { error } = await supabase.from('compras').insert(registros)
    if (!error) {
      setGuardado(true)
    } else {
      alert('Error: ' + error.message)
    }
    setGuardando(false)
  }

  if (guardado) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-md w-full">
        <div className="text-6xl mb-4">ok</div>
        <h2 className="text-2xl font-black text-gray-800">Compra registrada</h2>
        <p className="text-gray-500 mt-1">{proveedorSel?.nombre}</p>
        <p className="text-3xl font-black text-purple-500 mt-4">${totalCompra().toLocaleString('es-CO')}</p>
        <div className="flex gap-3 mt-6">
          <button onClick={() => { setProveedorSel(null); setProductos([]); setGuardado(false) }}
            className="flex-1 bg-purple-500 text-white px-4 py-3 rounded-xl font-bold">
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
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow-sm px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-black text-purple-600">Compras</h1>
          <p className="text-xs text-gray-500">{new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 text-sm">Cancelar</button>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {!proveedorSel && (
          <div className="flex gap-2 mb-4">
            <button onClick={() => setVista('compra')}
              className={`flex-1 py-2 rounded-xl text-sm font-bold ${vista === 'compra' ? 'bg-purple-500 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              Registrar compra
            </button>
            <button onClick={irASugerido}
              className={`flex-1 py-2 rounded-xl text-sm font-bold ${vista === 'sugerido' ? 'bg-purple-500 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              Sugerido de pedido
            </button>
          </div>
        )}

        {!proveedorSel && vista === 'sugerido' ? (
          <div>
            {cargandoSugerido ? (
              <p className="text-gray-400 text-center py-10">Cargando...</p>
            ) : sugeridos.length === 0 ? (
              <p className="text-gray-400 text-center py-10">No hay productos por pedir segun el stock minimo y el consumo reciente</p>
            ) : (
              <>
                <button onClick={exportarPedido}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-black py-3 rounded-xl mb-4">
                  Exportar lista de pedido
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
                        <div key={p.sku} className="p-4 flex items-center justify-between">
                          <div className="flex-1">
                            <p className="font-bold text-gray-800 text-sm">{p.nombre}</p>
                            <p className="text-xs text-gray-400">{p.sku} · {p.presentacion}</p>
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
                            <div className="text-center w-16">
                              <p className="text-xs text-gray-400">Pedir</p>
                              <p className="text-xl font-black text-purple-600">{p.cantidadSugerida}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        ) : !proveedorSel ? (
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
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4 flex justify-between items-center">
              <div>
                <p className="font-black text-purple-700">{proveedorSel.nombre}</p>
                <p className="text-sm text-purple-500">Ingresa las cantidades recibidas</p>
              </div>
              <button onClick={() => { setProveedorSel(null); setProductos([]) }}
                className="text-purple-400 text-sm font-bold">Cambiar</button>
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
                        className="w-20 text-center border-2 border-gray-200 rounded-lg py-2 font-bold focus:border-purple-500 focus:outline-none ml-3"
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>

                <div className="bg-white rounded-xl p-4 shadow-sm mb-4 flex justify-between items-center">
                  <p className="font-bold text-gray-600">Total compra</p>
                  <p className="font-black text-purple-600 text-xl">${totalCompra().toLocaleString('es-CO')}</p>
                </div>

                <button onClick={guardarCompra} disabled={guardando}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-black py-4 rounded-xl text-lg disabled:opacity-50">
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
