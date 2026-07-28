'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { calcularStockPorSku } from '@/lib/inventario-helpers'
import { PageHeader } from '@/components/ui'

const fechasMismoDiaSemana = () => Array.from({ length: 4 }, (_, i) =>
  new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
)

export default function Inventario() {
  const [usuario, setUsuario] = useState(null)
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [soloBajoMinimo, setSoloBajoMinimo] = useState(false)
  const [expandido, setExpandido] = useState(null)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (parsed.rol !== 'admin' && parsed.rol !== 'auxiliar') { router.push('/dashboard'); return }
    setUsuario(parsed)
    cargarDatos()
  }, [])

  const cargarDatos = async () => {
    setCargando(true)
    const fechasComparables = fechasMismoDiaSemana()

    const { data: productos } = await supabase
      .from('productos')
      .select('*')
      .eq('estado', true)
      .eq('empresa_id', getEmpresaId())
      .order('categoria')
      .order('nombre')

    const { data: ventas } = await supabase
      .from('liquidaciones')
      .select('sku, vendido_neto, fecha')
      .eq('empresa_id', getEmpresaId())
      .in('fecha', fechasComparables)

    if (productos) {
      const stockPorSku = await calcularStockPorSku()

      const ventasPorSku = {}
      ;(ventas || []).forEach(v => {
        ventasPorSku[v.sku] = (ventasPorSku[v.sku] || 0) + (v.vendido_neto || 0)
      })

      const calculadas = productos.map(p => {
        const stockInfo = stockPorSku[p.sku]
        const stockActual = stockInfo ? stockInfo.stockActual : null
        const promedioVentas = Math.ceil((ventasPorSku[p.sku] || 0) / 4)
        return {
          ...p,
          stockActual,
          fechaConteo: stockInfo?.fechaConteo || null,
          cantidadConteo: stockInfo?.cantidadConteo ?? null,
          comprado: stockInfo?.comprado || 0,
          devuelto: stockInfo?.devuelto || 0,
          salida: stockInfo?.salida || 0,
          despachado: stockInfo?.despachado || 0,
          promedioVentas,
          bajoMinimo: stockActual !== null && stockActual < (p.stock_minimo || 0)
        }
      })
      setFilas(calculadas)
    }
    setCargando(false)
  }

  const filasFiltradas = filas.filter(p => {
    const matchBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || p.sku.toLowerCase().includes(busqueda.toLowerCase())
    const matchMinimo = !soloBajoMinimo || p.bajoMinimo
    return matchBusqueda && matchMinimo
  })

  const totalBajoMinimo = filas.filter(p => p.bajoMinimo).length

  if (!usuario) return null

  return (
    <div>
      <PageHeader title="Inventario" subtitle={`${totalBajoMinimo} producto${totalBajoMinimo !== 1 ? 's' : ''} bajo el minimo`} />

      <div className="p-4 max-w-3xl mx-auto">
        <input type="text" placeholder="Buscar por nombre o SKU..." value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 mb-3 text-gray-800 focus:border-brand focus:outline-none" />

        <button onClick={() => setSoloBajoMinimo(!soloBajoMinimo)}
          className={`text-xs font-bold px-3 py-2 rounded-lg mb-4 ${soloBajoMinimo ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
          Solo bajo minimo
        </button>

        {cargando ? (
          <p className="text-gray-400 text-center py-10">Cargando...</p>
        ) : (
          <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
            {filasFiltradas.map(p => (
              <div key={p.id}>
                <button onClick={() => setExpandido(expandido === p.sku ? null : p.sku)}
                  className={`w-full text-left p-4 flex items-center justify-between transition-colors ${p.bajoMinimo ? 'bg-brand/5' : ''} hover:bg-gray-50`}>
                  <div className="flex-1">
                    <p className="font-bold text-gray-800 text-sm">{p.nombre}</p>
                    <p className="text-xs text-gray-400">{p.sku} · {p.categoria}</p>
                    {p.fechaConteo ? (
                      <p className="text-xs text-gray-400">Ultimo conteo: {p.fechaConteo}</p>
                    ) : (
                      <p className="text-xs text-gray-500 font-bold">Sin conteo registrado</p>
                    )}
                  </div>
                  <div className="flex gap-4 items-center">
                    <div className="text-center">
                      <p className="text-xs text-gray-400">Prom. mismo dia</p>
                      <p className="font-bold text-gray-600">{p.promedioVentas}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-400">Minimo</p>
                      <p className="font-bold text-gray-600">{p.stock_minimo || 0}</p>
                    </div>
                    <div className="text-center w-16">
                      <p className="text-xs text-gray-400">Stock</p>
                      <p className={`text-xl font-black ${p.bajoMinimo ? 'text-brand' : 'text-gray-800'}`}>
                        {p.stockActual !== null ? p.stockActual : '—'}
                      </p>
                    </div>
                    <span className="text-gray-300 text-xs">{expandido === p.sku ? '▲' : '▼'}</span>
                  </div>
                </button>
                {expandido === p.sku && (
                  <div className="px-4 pb-4 bg-gray-50">
                    {p.fechaConteo ? (
                      <div className="bg-white rounded-lg border border-gray-200 p-3 text-sm">
                        <p className="text-xs font-bold text-gray-500 mb-2">Como se calcula el stock actual</p>
                        <div className="flex justify-between py-1">
                          <span className="text-gray-600">Conteo del {p.fechaConteo}</span>
                          <span className="font-bold text-gray-800">{p.cantidadConteo}</span>
                        </div>
                        {p.comprado > 0 && (
                          <div className="flex justify-between py-1">
                            <span className="text-gray-600">+ Comprado desde ese conteo</span>
                            <span className="font-bold text-green-600">+{p.comprado}</span>
                          </div>
                        )}
                        {p.devuelto > 0 && (
                          <div className="flex justify-between py-1">
                            <span className="text-gray-600">+ Devuelto por rutas desde ese conteo</span>
                            <span className="font-bold text-green-600">+{p.devuelto}</span>
                          </div>
                        )}
                        {p.despachado > 0 && (
                          <div className="flex justify-between py-1">
                            <span className="text-gray-600">- Despachado a rutas desde ese conteo</span>
                            <span className="font-bold text-brand">-{p.despachado}</span>
                          </div>
                        )}
                        {p.salida > 0 && (
                          <div className="flex justify-between py-1">
                            <span className="text-gray-600">- Otras salidas desde ese conteo</span>
                            <span className="font-bold text-brand">-{p.salida}</span>
                          </div>
                        )}
                        <div className="flex justify-between pt-2 mt-1 border-t border-gray-100">
                          <span className="font-bold text-gray-800">= Stock actual</span>
                          <span className="font-black text-gray-900">{p.stockActual}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 py-2">Este producto no tiene ningun conteo fisico registrado todavia, por eso no se puede calcular su stock.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
            {filasFiltradas.length === 0 && (
              <p className="text-gray-400 text-center py-10">Sin productos para mostrar</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
