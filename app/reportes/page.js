'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../../lib/supabase'

const fmtFecha = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

const labelSemana = (hoyDate, semanasAtras) => {
  const fin = new Date(hoyDate.getTime() - semanasAtras * 7 * 24 * 60 * 60 * 1000)
  const inicio = new Date(fin.getTime() - 6 * 24 * 60 * 60 * 1000)
  const f = (d) => `${d.getDate()}/${d.getMonth() + 1}`
  return `${f(inicio)}-${f(fin)}`
}

export default function Reportes() {
  const [usuario, setUsuario] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [ventasPorSemana, setVentasPorSemana] = useState([])
  const [ventasPorRuta, setVentasPorRuta] = useState([])
  const [ventasPorVendedor, setVentasPorVendedor] = useState([])
  const [topProductos, setTopProductos] = useState([])
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (parsed.rol !== 'admin') { router.push('/dashboard'); return }
    setUsuario(parsed)
    cargarDatos()
  }, [])

  const cargarDatos = async () => {
    setCargando(true)
    const hoyDate = new Date(fmtFecha(new Date()) + 'T12:00:00')
    const hace28dias = new Date(hoyDate.getTime() - 27 * 24 * 60 * 60 * 1000)
    const inicioMesDate = new Date(hoyDate.getFullYear(), hoyDate.getMonth(), 1)
    const fechaInicioDate = inicioMesDate < hace28dias ? inicioMesDate : hace28dias
    const fechaInicio = fmtFecha(fechaInicioDate)
    const inicioMes = fmtFecha(inicioMesDate)
    const hace28diasStr = fmtFecha(hace28dias)
    const hoy = fmtFecha(hoyDate)

    const [{ data: despachos }, { data: liquidaciones }, { data: productos }] = await Promise.all([
      supabase.from('despachos_encab').select('id, fecha, rutas(nombre), vendedores(nombre)').gte('fecha', fechaInicio).lte('fecha', hoy),
      supabase.from('liquidaciones').select('despacho_id, sku, vendido_neto, efectivo_esperado, fecha').gte('fecha', fechaInicio).lte('fecha', hoy),
      supabase.from('productos').select('sku, nombre')
    ])

    if (despachos && liquidaciones) {
      const despachoMap = {}
      despachos.forEach(d => { despachoMap[d.id] = { ruta: d.rutas?.nombre || 'Sin ruta', vendedor: d.vendedores?.nombre || 'Sin vendedor' } })

      const productosMap = {}
      ;(productos || []).forEach(p => { productosMap[p.sku] = p.nombre })

      const bucketsSemana = [0, 0, 0, 0]
      liquidaciones.filter(l => l.fecha >= hace28diasStr).forEach(l => {
        const diffDias = Math.floor((hoyDate - new Date(l.fecha + 'T12:00:00')) / (24 * 60 * 60 * 1000))
        const semanaIdx = Math.floor(diffDias / 7)
        if (semanaIdx >= 0 && semanaIdx <= 3) bucketsSemana[3 - semanaIdx] += (l.efectivo_esperado || 0)
      })
      setVentasPorSemana(bucketsSemana.map((ventas, i) => ({ semana: labelSemana(hoyDate, 3 - i), ventas })))

      const liqDelMes = liquidaciones.filter(l => l.fecha >= inicioMes)

      const porRuta = {}
      const porVendedor = {}
      liqDelMes.forEach(l => {
        const info = despachoMap[l.despacho_id]
        if (!info) return
        porRuta[info.ruta] = (porRuta[info.ruta] || 0) + (l.efectivo_esperado || 0)
        porVendedor[info.vendedor] = (porVendedor[info.vendedor] || 0) + (l.efectivo_esperado || 0)
      })
      setVentasPorRuta(Object.entries(porRuta).map(([nombre, ventas]) => ({ nombre, ventas })).sort((a, b) => b.ventas - a.ventas))
      setVentasPorVendedor(Object.entries(porVendedor).map(([nombre, ventas]) => ({ nombre, ventas })).sort((a, b) => b.ventas - a.ventas))

      const porProducto = {}
      liqDelMes.forEach(l => { porProducto[l.sku] = (porProducto[l.sku] || 0) + (l.vendido_neto || 0) })
      const top10 = Object.entries(porProducto)
        .map(([sku, cantidad]) => ({ nombre: productosMap[sku] || sku, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 10)
      setTopProductos(top10)
    }
    setCargando(false)
  }

  if (!usuario) return null

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow-sm px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-black text-indigo-600">Reportes</h1>
          <p className="text-xs text-gray-500">Ultimas 4 semanas y mes en curso</p>
        </div>
        <button onClick={() => router.push('/dashboard')} className="text-gray-400 text-sm">Volver</button>
      </div>

      <div className="p-4 max-w-3xl mx-auto">
        {cargando ? (
          <p className="text-gray-400 text-center py-16">Cargando...</p>
        ) : (
          <>
            <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
              <p className="font-black text-gray-700 mb-3">Ventas por semana (ultimas 4)</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={ventasPorSemana}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="semana" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => `$${v.toLocaleString('es-CO')}`} />
                  <Bar dataKey="ventas" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
              <p className="font-black text-gray-700 mb-3">Ventas por ruta (mes en curso)</p>
              {ventasPorRuta.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">Sin datos este mes</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(120, ventasPorRuta.length * 45)}>
                  <BarChart data={ventasPorRuta} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" fontSize={12} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="nombre" fontSize={12} width={120} />
                    <Tooltip formatter={v => `$${v.toLocaleString('es-CO')}`} />
                    <Bar dataKey="ventas" fill="#f97316" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
              <p className="font-black text-gray-700 mb-3">Ventas por vendedor (mes en curso)</p>
              {ventasPorVendedor.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">Sin datos este mes</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(120, ventasPorVendedor.length * 45)}>
                  <BarChart data={ventasPorVendedor} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" fontSize={12} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="nombre" fontSize={12} width={120} />
                    <Tooltip formatter={v => `$${v.toLocaleString('es-CO')}`} />
                    <Bar dataKey="ventas" fill="#16a34a" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
              <p className="font-black text-gray-700 mb-3">Top 10 productos del mes</p>
              {topProductos.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">Sin datos este mes</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(160, topProductos.length * 32)}>
                  <BarChart data={topProductos} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" fontSize={12} />
                    <YAxis type="category" dataKey="nombre" fontSize={11} width={140} />
                    <Tooltip formatter={v => `${v} und`} />
                    <Bar dataKey="cantidad" fill="#db2777" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
