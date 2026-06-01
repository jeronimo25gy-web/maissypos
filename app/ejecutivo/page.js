'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function Ejecutivo() {
  const [usuario, setUsuario] = useState(null)
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [resumen, setResumen] = useState([])
  const [totales, setTotales] = useState({ ventas: 0, unidades: 0, gastos: 0, fiados: 0, transferencias: 0, efectivo: 0 })
  const [cargando, setCargando] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    setUsuario(JSON.parse(u))
    cargarDatos(fecha)
  }, [])

  const cargarDatos = async (f) => {
    setCargando(true)
    const { data: despachos } = await supabase
      .from('despachos_encab')
      .select('*, rutas(nombre), vendedores(nombre)')
      .eq('fecha', f)
    const { data: liquidaciones } = await supabase
      .from('liquidaciones')
      .select('*')
      .eq('fecha', f)
    if (despachos && liquidaciones) {
      const resumenRutas = despachos.map(d => {
        const liq = liquidaciones.filter(l => l.despacho_id === d.id)
        const vendido = liq.reduce((sum, l) => sum + (l.vendido_neto * 1), 0)
        const valorVendido = liq.reduce((sum, l) => sum + (l.efectivo_esperado || 0), 0)
        const devuelto = liq.reduce((sum, l) => sum + (l.devuelto || 0), 0)
        const cambios = liq.reduce((sum, l) => sum + (l.cambio || 0), 0)
        return {
          ruta: d.rutas?.nombre,
          vendedor: d.vendedores?.nombre,
          estado: d.estado,
          total_und: d.total_und,
          despachado_valor: d.total_valor,
          vendido_und: vendido,
          vendido_valor: valorVendido,
          devuelto_und: devuelto,
          cambios_und: cambios,
          efectivo_real: liq[0]?.efectivo_real || 0,
          liquidado: d.estado === 'liquidado'
        }
      })
      setResumen(resumenRutas)
      setTotales({
        ventas: resumenRutas.reduce((sum, r) => sum + r.vendido_valor, 0),
        unidades: resumenRutas.reduce((sum, r) => sum + r.vendido_und, 0),
        despachado: resumenRutas.reduce((sum, r) => sum + (r.despachado_valor || 0), 0),
        rutas_liquidadas: resumenRutas.filter(r => r.liquidado).length,
        rutas_total: resumenRutas.length,
      })
    }
    setCargando(false)
  }

  const cambiarFecha = (f) => {
    setFecha(f)
    cargarDatos(f)
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow-sm px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-black text-orange-500">Dashboard</h1>
          <p className="text-xs text-gray-500">Maissy Group</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-gray-400 text-sm">Menu</button>
          <button onClick={() => { localStorage.removeItem('maissy_usuario'); router.push('/') }}
            className="bg-gray-100 text-gray-600 px-3 py-1 rounded-lg text-sm font-medium">Salir</button>
        </div>
      </div>

      <div className="p-4 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <input type="date" value={fecha} onChange={e => cambiarFecha(e.target.value)}
            className="border-2 border-gray-200 rounded-xl px-4 py-2 text-sm focus:border-orange-500 focus:outline-none" />
          <p className="text-gray-500 text-sm">{new Date(fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>

        {cargando ? (
          <div className="text-center py-16 text-gray-400">Cargando...</div>
        ) : resumen.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-gray-500">No hay operaciones registradas para esta fecha</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Ventas del dia</p>
                <p className="text-2xl font-black text-green-600">${totales.ventas.toLocaleString('es-CO')}</p>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Despachado</p>
                <p className="text-2xl font-black text-orange-500">${totales.despachado?.toLocaleString('es-CO')}</p>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Unidades vendidas</p>
                <p className="text-2xl font-black text-gray-800">{totales.unidades}</p>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Rutas liquidadas</p>
                <p className="text-2xl font-black text-gray-800">{totales.rutas_liquidadas}/{totales.rutas_total}</p>
              </div>
            </div>

            <h3 className="font-black text-gray-700 mb-3">Detalle por ruta</h3>
            {resumen.map((r, i) => (
              <div key={i} className="bg-white rounded-2xl shadow-sm p-4 mb-3">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-black text-gray-800">{r.ruta}</p>
                    <p className="text-xs text-gray-400">{r.vendedor}</p>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${r.liquidado ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}>
                    {r.liquidado ? 'Liquidado' : 'Pendiente'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center bg-gray-50 rounded-xl p-2">
                    <p className="text-xs text-gray-400">Despachado</p>
                    <p className="font-black text-gray-700">{r.total_und} und</p>
                  </div>
                  <div className="text-center bg-gray-50 rounded-xl p-2">
                    <p className="text-xs text-gray-400">Vendido</p>
                    <p className="font-black text-green-600">{r.vendido_und} und</p>
                  </div>
                  <div className="text-center bg-gray-50 rounded-xl p-2">
                    <p className="text-xs text-gray-400">Devuelto</p>
                    <p className="font-black text-yellow-600">{r.devuelto_und} und</p>
                  </div>
                </div>
                {r.liquidado && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between">
                    <p className="text-sm text-gray-500">Venta neta</p>
                    <p className="font-black text-green-600">${r.vendido_valor.toLocaleString('es-CO')}</p>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
