'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'
import { formatearMoneda, obtenerFechaActual } from '@/lib/supabase-helpers'

const mesActual = () => obtenerFechaActual().slice(0, 7)

const rangoMes = (mes) => {
  const [y, m] = mes.split('-').map(Number)
  const inicio = `${mes}-01`
  const ultimoDia = new Date(y, m, 0).getDate()
  const fin = `${mes}-${String(ultimoDia).padStart(2, '0')}`
  return { inicio, fin }
}

const fmt = formatearMoneda

export default function Grupo() {
  const [usuario, setUsuario] = useState(null)
  const [mes, setMes] = useState(mesActual())
  const [cargando, setCargando] = useState(true)
  const [empresas, setEmpresas] = useState([])
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (parsed.rol !== 'admin') { router.push('/dashboard'); return }
    setUsuario(parsed)
  }, [])

  useEffect(() => { if (usuario) cargar() }, [usuario, mes])

  const cargar = async () => {
    setCargando(true)
    const { inicio, fin } = rangoMes(mes)
    const { data: empresasData } = await supabase.from('empresas').select('*').eq('activo', true).order('nombre')

    const resultado = await Promise.all((empresasData || []).map(async (e) => {
      const [{ data: liq }, { data: gastosRuta }, { data: gastosAdmin }] = await Promise.all([
        supabase.from('liquidaciones').select('efectivo_esperado').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', e.id),
        supabase.from('liquidaciones_gastos').select('valor').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', e.id),
        supabase.from('gastos_admin').select('valor').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', e.id),
      ])
      const ventas = (liq || []).reduce((s, l) => s + (l.efectivo_esperado || 0), 0)
      const gastos = (gastosRuta || []).reduce((s, g) => s + (g.valor || 0), 0) + (gastosAdmin || []).reduce((s, g) => s + (g.valor || 0), 0)
      return { id: e.id, nombre: e.nombre, ventas, gastos, utilidad: ventas - gastos }
    }))

    setEmpresas(resultado)
    setCargando(false)
  }

  if (!usuario) return null

  const totalVentas = empresas.reduce((s, e) => s + e.ventas, 0)
  const totalGastos = empresas.reduce((s, e) => s + e.gastos, 0)
  const totalUtilidad = empresas.reduce((s, e) => s + e.utilidad, 0)

  return (
    <div>
      <div className="bg-white shadow-sm px-6 py-4 sticky top-0 z-10">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-black text-gray-900">Vista Grupo</h1>
            <p className="text-xs text-gray-500">Comparativo entre empresas del grupo</p>
          </div>
          <input type="month" value={mes} onChange={e => setMes(e.target.value)}
            className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
        </div>
      </div>

      <div className="p-4 max-w-3xl mx-auto">
        {cargando ? (
          <p className="text-gray-400 text-center py-16">Cargando...</p>
        ) : empresas.length === 0 ? (
          <p className="text-gray-400 text-center py-16">No hay empresas activas</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
              <div className="bg-white rounded-2xl p-3 sm:p-5 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Ventas del grupo</p>
                <p className="text-sm sm:text-lg font-black text-gray-900">{fmt(totalVentas)}</p>
              </div>
              <div className="bg-white rounded-2xl p-3 sm:p-5 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Gastos del grupo</p>
                <p className="text-sm sm:text-lg font-black text-brand">{fmt(totalGastos)}</p>
              </div>
              <div className="bg-white rounded-2xl p-3 sm:p-5 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Utilidad del grupo</p>
                <p className="text-sm sm:text-lg font-black text-gray-900">{fmt(totalUtilidad)}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
              <p className="font-black text-gray-700 mb-3">Ventas, gastos y utilidad por empresa</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={empresas}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="nombre" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => fmt(v)} />
                  <Bar dataKey="ventas" fill="#1a1a1a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="gastos" fill="#C41230" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="utilidad" fill="#666666" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-2">
                <span className="text-xs text-gray-600"><span className="inline-block w-3 h-3 rounded-sm bg-sidebar mr-1 align-middle"></span>Ventas</span>
                <span className="text-xs text-gray-600"><span className="inline-block w-3 h-3 rounded-sm bg-brand mr-1 align-middle"></span>Gastos</span>
                <span className="text-xs text-gray-600"><span className="inline-block w-3 h-3 rounded-sm bg-[#666666] mr-1 align-middle"></span>Utilidad</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
              {empresas.map(e => (
                <div key={e.id} className="p-4">
                  <p className="font-black text-gray-800 mb-2">{e.nombre}</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-gray-400">Ventas</p>
                      <p className="font-bold text-gray-900">{fmt(e.ventas)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Gastos</p>
                      <p className="font-bold text-brand">{fmt(e.gastos)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Utilidad</p>
                      <p className="font-bold text-gray-900">{fmt(e.utilidad)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
