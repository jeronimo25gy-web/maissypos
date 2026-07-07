'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'

const mesActual = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).slice(0, 7)

const rangoMes = (mes) => {
  const [y, m] = mes.split('-').map(Number)
  const inicio = `${mes}-01`
  const ultimoDia = new Date(y, m, 0).getDate()
  const fin = `${mes}-${String(ultimoDia).padStart(2, '0')}`
  return { inicio, fin, ultimoDia }
}

const fmt = (v) => `$${Math.round(v || 0).toLocaleString('es-CO')}`

const TABS = [
  { id: 'pnl', nombre: 'P&L del mes' },
  { id: 'flujo', nombre: 'Flujo de caja' },
  { id: 'metas', nombre: 'Metas' },
  { id: 'cartera', nombre: 'Cartera aging' },
]

export default function Financiero() {
  const [usuario, setUsuario] = useState(null)
  const [vista, setVista] = useState('pnl')
  const [mes, setMes] = useState(mesActual())
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (parsed.rol !== 'admin') { router.push('/dashboard'); return }
    setUsuario(parsed)
  }, [])

  if (!usuario) return null

  return (
    <div>
      <div className="bg-white shadow-sm px-6 py-4 sticky top-0 z-10">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-black text-gray-900">Financiero</h1>
            <p className="text-xs text-gray-500">P&L, flujo de caja, metas y cartera</p>
          </div>
          <input type="month" value={mes} onChange={e => setMes(e.target.value)}
            className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
        </div>
      </div>

      <div className="p-4 max-w-3xl mx-auto">
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setVista(t.id)}
              className={`px-3 py-2 rounded-xl text-sm font-bold whitespace-nowrap ${vista === t.id ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              {t.nombre}
            </button>
          ))}
        </div>

        {vista === 'pnl' && <TabPnl mes={mes} />}
        {vista === 'flujo' && <TabFlujo mes={mes} />}
        {vista === 'metas' && <TabMetas mes={mes} />}
        {vista === 'cartera' && <TabCartera mes={mes} />}
      </div>
    </div>
  )
}

function TabPnl({ mes }) {
  const [cargando, setCargando] = useState(true)
  const [datos, setDatos] = useState(null)

  useEffect(() => { cargar() }, [mes])

  const cargar = async () => {
    setCargando(true)
    const { inicio, fin } = rangoMes(mes)
    const [{ data: liq }, { data: compras }, { data: gastos }] = await Promise.all([
      supabase.from('liquidaciones').select('efectivo_esperado').gte('fecha', inicio).lte('fecha', fin),
      supabase.from('compras').select('total').gte('fecha', inicio).lte('fecha', fin),
      supabase.from('liquidaciones_gastos').select('categoria, valor').gte('fecha', inicio).lte('fecha', fin),
    ])
    const ingresos = (liq || []).reduce((s, l) => s + (l.efectivo_esperado || 0), 0)
    const costoVentas = (compras || []).reduce((s, c) => s + (c.total || 0), 0)
    const porCategoria = {}
    ;(gastos || []).forEach(g => {
      const key = g.categoria || 'Sin categoria'
      porCategoria[key] = (porCategoria[key] || 0) + (g.valor || 0)
    })
    const gastosTotal = Object.values(porCategoria).reduce((s, v) => s + v, 0)
    const margenBruto = ingresos - costoVentas
    const margenNeto = margenBruto - gastosTotal
    setDatos({
      ingresos, costoVentas, gastosTotal,
      gastosPorCategoria: Object.entries(porCategoria).sort((a, b) => b[1] - a[1]),
      margenBruto, margenNeto,
      margenBrutoPct: ingresos > 0 ? (margenBruto / ingresos) * 100 : 0,
      margenNetoPct: ingresos > 0 ? (margenNeto / ingresos) * 100 : 0,
    })
    setCargando(false)
  }

  if (cargando) return <p className="text-gray-400 text-center py-16">Cargando...</p>
  if (!datos) return null

  return (
    <>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">Ingresos totales</p>
          <p className="text-xl font-black text-gray-900">{fmt(datos.ingresos)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">Costo de ventas</p>
          <p className="text-xl font-black text-brand">{fmt(datos.costoVentas)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">Margen bruto</p>
          <p className="text-xl font-black text-gray-900">{fmt(datos.margenBruto)}</p>
          <p className="text-xs text-gray-500">{datos.margenBrutoPct.toFixed(1)}%</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">Margen neto</p>
          <p className={`text-xl font-black ${datos.margenNeto >= 0 ? 'text-gray-900' : 'text-brand'}`}>{fmt(datos.margenNeto)}</p>
          <p className="text-xs text-gray-500">{datos.margenNetoPct.toFixed(1)}%</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
        <p className="font-black text-gray-700 mb-3">Gastos operativos por categoria</p>
        {datos.gastosPorCategoria.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">Sin gastos este mes</p>
        ) : (
          <>
            {datos.gastosPorCategoria.map(([cat, valor]) => (
              <div key={cat} className="flex justify-between py-1">
                <p className="text-sm text-gray-600">{cat}</p>
                <p className="text-sm font-bold text-brand">{fmt(valor)}</p>
              </div>
            ))}
            <div className="flex justify-between pt-2 mt-1 border-t border-gray-100">
              <p className="text-sm font-black text-gray-700">Total gastos operativos</p>
              <p className="text-sm font-black text-brand">{fmt(datos.gastosTotal)}</p>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function TabFlujo({ mes }) {
  const [cargando, setCargando] = useState(true)
  const [dias, setDias] = useState([])

  useEffect(() => { cargar() }, [mes])

  const cargar = async () => {
    setCargando(true)
    const { inicio, fin, ultimoDia } = rangoMes(mes)
    const { data } = await supabase
      .from('liquidaciones_detalle')
      .select('fecha, efectivo, transferencias_bancarias, total_gastos')
      .gte('fecha', inicio).lte('fecha', fin)

    const porDia = {}
    for (let d = 1; d <= ultimoDia; d++) {
      const key = `${mes}-${String(d).padStart(2, '0')}`
      porDia[key] = { dia: d, recibido: 0, gastos: 0 }
    }
    ;(data || []).forEach(l => {
      if (!porDia[l.fecha]) return
      porDia[l.fecha].recibido += (l.efectivo || 0) + (l.transferencias_bancarias || 0)
      porDia[l.fecha].gastos += (l.total_gastos || 0)
    })
    setDias(Object.values(porDia))
    setCargando(false)
  }

  if (cargando) return <p className="text-gray-400 text-center py-16">Cargando...</p>

  const totalRecibido = dias.reduce((s, d) => s + d.recibido, 0)
  const totalGastos = dias.reduce((s, d) => s + d.gastos, 0)

  return (
    <>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">Efectivo recibido (mes)</p>
          <p className="text-xl font-black text-gray-900">{fmt(totalRecibido)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">Gastos (mes)</p>
          <p className="text-xl font-black text-brand">{fmt(totalGastos)}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <p className="font-black text-gray-700 mb-3">Efectivo recibido vs gastos, dia por dia</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={dias}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="dia" fontSize={11} />
            <YAxis fontSize={11} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={v => fmt(v)} labelFormatter={d => `Dia ${d}`} />
            <Bar dataKey="recibido" fill="#1a1a1a" radius={[4, 4, 0, 0]} />
            <Bar dataKey="gastos" fill="#C41230" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex justify-center gap-4 mt-2">
          <span className="text-xs text-gray-600"><span className="inline-block w-3 h-3 rounded-sm bg-sidebar mr-1 align-middle"></span>Recibido</span>
          <span className="text-xs text-gray-600"><span className="inline-block w-3 h-3 rounded-sm bg-brand mr-1 align-middle"></span>Gastos</span>
        </div>
      </div>
    </>
  )
}

function TabMetas({ mes }) {
  const [cargando, setCargando] = useState(true)
  const [rutas, setRutas] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [metas, setMetas] = useState([])
  const [ventaPorRuta, setVentaPorRuta] = useState({})
  const [ventaPorVendedor, setVentaPorVendedor] = useState({})
  const [tipo, setTipo] = useState('ruta')
  const [objetivoId, setObjetivoId] = useState('')
  const [valorMeta, setValorMeta] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { cargar() }, [mes])

  const cargar = async () => {
    setCargando(true)
    const { inicio, fin } = rangoMes(mes)
    const [{ data: r }, { data: v }, { data: m }, { data: despachos }, { data: liq }] = await Promise.all([
      supabase.from('rutas').select('*').eq('estado', true).order('nombre'),
      supabase.from('vendedores').select('*').eq('estado', true).order('nombre'),
      supabase.from('metas_ventas').select('*, rutas(nombre), vendedores(nombre)').eq('mes', mes),
      supabase.from('despachos_encab').select('id, ruta_id, vendedor_id').gte('fecha', inicio).lte('fecha', fin),
      supabase.from('liquidaciones').select('despacho_id, efectivo_esperado').gte('fecha', inicio).lte('fecha', fin),
    ])
    setRutas(r || [])
    setVendedores(v || [])
    setMetas(m || [])

    const despachoMap = {}
    ;(despachos || []).forEach(d => { despachoMap[d.id] = d })
    const porRuta = {}
    const porVendedor = {}
    ;(liq || []).forEach(l => {
      const d = despachoMap[l.despacho_id]
      if (!d) return
      if (d.ruta_id) porRuta[d.ruta_id] = (porRuta[d.ruta_id] || 0) + (l.efectivo_esperado || 0)
      if (d.vendedor_id) porVendedor[d.vendedor_id] = (porVendedor[d.vendedor_id] || 0) + (l.efectivo_esperado || 0)
    })
    setVentaPorRuta(porRuta)
    setVentaPorVendedor(porVendedor)
    setCargando(false)
  }

  const guardarMeta = async () => {
    if (!objetivoId || !valorMeta) { alert('Selecciona ' + (tipo === 'ruta' ? 'una ruta' : 'un vendedor') + ' e ingresa la meta'); return }
    setGuardando(true)
    const campo = tipo === 'ruta' ? 'ruta_id' : 'vendedor_id'
    const { data: existente } = await supabase.from('metas_ventas').select('id').eq('mes', mes).eq(campo, objetivoId).maybeSingle()
    if (existente) {
      await supabase.from('metas_ventas').update({ meta: parseFloat(valorMeta) }).eq('id', existente.id)
    } else {
      await supabase.from('metas_ventas').insert({ mes, [campo]: objetivoId, meta: parseFloat(valorMeta) })
    }
    setGuardando(false)
    setObjetivoId('')
    setValorMeta('')
    cargar()
  }

  if (cargando) return <p className="text-gray-400 text-center py-16">Cargando...</p>

  return (
    <>
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
        <p className="font-black text-gray-700 mb-3">Configurar meta</p>
        <div className="flex gap-2 mb-3">
          <button onClick={() => { setTipo('ruta'); setObjetivoId('') }}
            className={`flex-1 py-2 rounded-lg text-sm font-bold ${tipo === 'ruta' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}>Por ruta</button>
          <button onClick={() => { setTipo('vendedor'); setObjetivoId('') }}
            className={`flex-1 py-2 rounded-lg text-sm font-bold ${tipo === 'vendedor' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}>Por vendedor</button>
        </div>
        <select value={objetivoId} onChange={e => setObjetivoId(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none mb-2">
          <option value="">{tipo === 'ruta' ? 'Selecciona ruta' : 'Selecciona vendedor'}</option>
          {(tipo === 'ruta' ? rutas : vendedores).map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </select>
        <div className="flex gap-2">
          <input type="number" min="0" placeholder="Meta del mes en $" value={valorMeta} onChange={e => setValorMeta(e.target.value)}
            className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
          <button onClick={guardarMeta} disabled={guardando}
            className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50">
            {guardando ? '...' : 'Guardar'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
        {metas.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">Sin metas configuradas para este mes</p>
        ) : (
          metas.map(m => {
            const nombre = m.rutas?.nombre || m.vendedores?.nombre || 'Sin nombre'
            const actual = m.ruta_id ? (ventaPorRuta[m.ruta_id] || 0) : (ventaPorVendedor[m.vendedor_id] || 0)
            const pct = m.meta > 0 ? Math.min(100, (actual / m.meta) * 100) : 0
            return (
              <div key={m.id} className="p-4">
                <div className="flex justify-between items-center mb-1">
                  <p className="font-bold text-gray-800 text-sm">{nombre} <span className="text-xs text-gray-400 font-normal">({m.ruta_id ? 'ruta' : 'vendedor'})</span></p>
                  <p className="text-xs font-bold text-gray-600">{pct.toFixed(0)}%</p>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 mb-1">
                  <div className={`h-2 rounded-full ${pct >= 100 ? 'bg-green-600' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-gray-500">{fmt(actual)} de {fmt(m.meta)}</p>
              </div>
            )
          })
        )}
      </div>
    </>
  )
}

const BUCKETS_CARTERA = [
  { id: 'porVencer', nombre: 'Por vencer' },
  { id: 'b1', nombre: '0-7 dias' },
  { id: 'b2', nombre: '8-15 dias' },
  { id: 'b3', nombre: '16-30 dias' },
  { id: 'b4', nombre: '+30 dias' },
]

function bucketDe(fecha_pago) {
  if (!fecha_pago) return 'porVencer'
  const hoy = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }))
  const pago = new Date(fecha_pago)
  const dias = Math.floor((hoy - pago) / (24 * 60 * 60 * 1000))
  if (dias <= 0) return 'porVencer'
  if (dias <= 7) return 'b1'
  if (dias <= 15) return 'b2'
  if (dias <= 30) return 'b3'
  return 'b4'
}

function TabCartera({ mes }) {
  const [cargando, setCargando] = useState(true)
  const [fiados, setFiados] = useState([])

  useEffect(() => { cargar() }, [mes])

  const cargar = async () => {
    setCargando(true)
    const { inicio, fin } = rangoMes(mes)
    const { data } = await supabase
      .from('cartera_fiados')
      .select('*, vendedores(nombre)')
      .eq('estado', 'pendiente')
      .gte('fecha_fiado', inicio).lte('fecha_fiado', fin)
    setFiados(data || [])
    setCargando(false)
  }

  if (cargando) return <p className="text-gray-400 text-center py-16">Cargando...</p>

  const grupos = {}
  BUCKETS_CARTERA.forEach(b => { grupos[b.id] = [] })
  fiados.forEach(f => { grupos[bucketDe(f.fecha_pago)].push(f) })

  const totalVencido = fiados.filter(f => bucketDe(f.fecha_pago) !== 'porVencer').reduce((s, f) => s + (f.saldo || 0), 0)

  return (
    <>
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
        <p className="text-xs text-gray-500 mb-1">Total vencido</p>
        <p className="text-2xl font-black text-brand">{fmt(totalVencido)}</p>
      </div>

      {BUCKETS_CARTERA.map(b => {
        const items = grupos[b.id]
        const total = items.reduce((s, f) => s + (f.saldo || 0), 0)
        if (items.length === 0) return null
        return (
          <div key={b.id} className="bg-white rounded-2xl shadow-sm mb-3 overflow-hidden">
            <div className={`px-4 py-3 flex justify-between items-center ${b.id === 'porVencer' ? 'bg-gray-100' : 'bg-brand/5'}`}>
              <p className={`font-black text-sm ${b.id === 'porVencer' ? 'text-gray-700' : 'text-brand'}`}>{b.nombre}</p>
              <p className={`font-black text-sm ${b.id === 'porVencer' ? 'text-gray-700' : 'text-brand'}`}>{fmt(total)}</p>
            </div>
            <div className="divide-y divide-gray-100">
              {items.map(f => (
                <div key={f.id} className="px-4 py-2 flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-800 font-medium">{f.nombre_cliente}</p>
                    <p className="text-xs text-gray-400">{f.vendedores?.nombre || 'Sin vendedor'} · Pago acordado: {f.fecha_pago || 'N/A'}</p>
                  </div>
                  <p className="text-sm font-bold text-gray-800">{fmt(f.saldo)}</p>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {fiados.length === 0 && <p className="text-gray-400 text-center py-8">Sin fiados pendientes este mes</p>}
    </>
  )
}
