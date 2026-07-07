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
  { id: 'comisiones', nombre: 'Comisiones' },
  { id: 'porRuta', nombre: 'Por Ruta' },
  { id: 'cartera', nombre: 'Antigüedad de Cartera' },
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
            <p className="text-xs text-gray-500">P&L, flujo de caja, metas, comisiones y cartera</p>
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
        {vista === 'comisiones' && <TabComisiones mes={mes} />}
        {vista === 'porRuta' && <TabPorRuta mes={mes} />}
        {vista === 'cartera' && <TabCartera mes={mes} />}
      </div>
    </div>
  )
}

function agruparPorCategoria(filas) {
  const porCategoria = {}
  filas.forEach(g => {
    const key = g.categoria || 'Sin categoria'
    porCategoria[key] = (porCategoria[key] || 0) + (g.valor || 0)
  })
  return Object.entries(porCategoria).sort((a, b) => b[1] - a[1])
}

function TabPnl({ mes }) {
  const [cargando, setCargando] = useState(true)
  const [datos, setDatos] = useState(null)

  useEffect(() => { cargar() }, [mes])

  const cargar = async () => {
    setCargando(true)
    const { inicio, fin } = rangoMes(mes)
    const [{ data: liq }, { data: compras }, { data: gastosRuta }, { data: gastosAdmin }] = await Promise.all([
      supabase.from('liquidaciones').select('efectivo_esperado').gte('fecha', inicio).lte('fecha', fin),
      supabase.from('compras').select('total').gte('fecha', inicio).lte('fecha', fin),
      supabase.from('liquidaciones_gastos').select('categoria, valor').gte('fecha', inicio).lte('fecha', fin),
      supabase.from('gastos_admin').select('categoria, valor').gte('fecha', inicio).lte('fecha', fin),
    ])
    const ingresos = (liq || []).reduce((s, l) => s + (l.efectivo_esperado || 0), 0)
    const costoVentas = (compras || []).reduce((s, c) => s + (c.total || 0), 0)
    const margenBruto = ingresos - costoVentas

    const gastosRutaPorCategoria = agruparPorCategoria(gastosRuta || [])
    const subtotalRuta = gastosRutaPorCategoria.reduce((s, [, v]) => s + v, 0)
    const gastosAdminPorCategoria = agruparPorCategoria(gastosAdmin || [])
    const subtotalAdmin = gastosAdminPorCategoria.reduce((s, [, v]) => s + v, 0)
    const gastosOperativosTotal = subtotalRuta + subtotalAdmin

    const margenNeto = margenBruto - gastosOperativosTotal
    setDatos({
      ingresos, costoVentas, margenBruto,
      margenBrutoPct: ingresos > 0 ? (margenBruto / ingresos) * 100 : 0,
      gastosRutaPorCategoria, subtotalRuta,
      gastosAdminPorCategoria, subtotalAdmin,
      gastosOperativosTotal,
      margenNeto,
      margenNetoPct: ingresos > 0 ? (margenNeto / ingresos) * 100 : 0,
    })
    setCargando(false)
  }

  if (cargando) return <p className="text-gray-400 text-center py-16">Cargando...</p>
  if (!datos) return null

  return (
    <div className="bg-white p-6">
      <SeccionTitulo texto="Ingresos" />
      <FilaDetalle label="Ventas totales" valor={datos.ingresos} clave />
      <Divisoria />

      <SeccionTitulo texto="Costo de ventas" />
      <FilaDetalle label="Compras del mes" valor={datos.costoVentas} negativo clave />
      <Divisoria />

      <FilaTotal label="Margen bruto" valor={datos.margenBruto} pct={datos.margenBrutoPct} />
      <Divisoria fuerte />

      <SeccionTitulo texto="Gastos operativos" />

      <p className="text-xs font-black uppercase tracking-wide text-gray-500 pl-2 mt-3 mb-1">De ruta</p>
      {datos.gastosRutaPorCategoria.length === 0 ? (
        <p className="text-sm text-gray-400 pl-4 py-1">Sin gastos de ruta</p>
      ) : (
        datos.gastosRutaPorCategoria.map(([cat, val]) => (
          <FilaDetalle key={cat} label={cat} valor={val} negativo />
        ))
      )}
      <FilaSubtotal label="Subtotal de ruta" valor={datos.subtotalRuta} />

      <p className="text-xs font-black uppercase tracking-wide text-gray-500 pl-2 mt-4 mb-1">Administrativos</p>
      {datos.gastosAdminPorCategoria.length === 0 ? (
        <p className="text-sm text-gray-400 pl-4 py-1">Sin gastos administrativos</p>
      ) : (
        datos.gastosAdminPorCategoria.map(([cat, val]) => (
          <FilaDetalle key={cat} label={cat} valor={val} negativo />
        ))
      )}
      <FilaSubtotal label="Subtotal administrativos" valor={datos.subtotalAdmin} />

      <div className="border-t border-gray-300 mt-3 pt-2 flex justify-between items-center">
        <p className="font-black uppercase text-sm text-gray-900">Total gastos operativos</p>
        <p className="font-black text-brand">({fmt(datos.gastosOperativosTotal)})</p>
      </div>
      <Divisoria fuerte />

      <FilaTotal label="Margen neto" valor={datos.margenNeto} pct={datos.margenNetoPct} grande />
    </div>
  )
}

function SeccionTitulo({ texto }) {
  return <p className="font-black uppercase text-sm text-gray-900 py-2">{texto}</p>
}

function Divisoria({ fuerte = false }) {
  return <div className={`my-3 ${fuerte ? 'border-t-2 border-gray-800' : 'border-t border-gray-300'}`} />
}

function FilaDetalle({ label, valor, negativo = false, clave = false }) {
  return (
    <div className="flex justify-between py-1 pl-4">
      <p className="text-sm text-gray-600">{label}</p>
      <p className={`text-sm ${clave ? 'font-bold text-brand' : 'text-gray-800'}`}>
        {negativo ? `(${fmt(valor)})` : fmt(valor)}
      </p>
    </div>
  )
}

function FilaSubtotal({ label, valor }) {
  return (
    <div className="flex justify-between py-1 pl-4 border-t border-gray-100 mt-1">
      <p className="text-sm font-bold text-gray-700">{label}</p>
      <p className="text-sm font-bold text-brand">({fmt(valor)})</p>
    </div>
  )
}

function FilaTotal({ label, valor, pct, grande = false }) {
  return (
    <div className="flex justify-between items-center py-2">
      <p className={`font-black uppercase text-gray-900 ${grande ? 'text-base' : 'text-sm'}`}>{label}</p>
      <p className={`font-black text-brand ${grande ? 'text-2xl' : 'text-lg'}`}>
        {fmt(valor)} <span className="text-sm">({pct.toFixed(1)}%)</span>
      </p>
    </div>
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
      porDia[key] = { dia: d, efectivo: 0, transferencias: 0, gastos: 0 }
    }
    ;(data || []).forEach(l => {
      if (!porDia[l.fecha]) return
      porDia[l.fecha].efectivo += (l.efectivo || 0)
      porDia[l.fecha].transferencias += (l.transferencias_bancarias || 0)
      porDia[l.fecha].gastos += (l.total_gastos || 0)
    })
    setDias(Object.values(porDia))
    setCargando(false)
  }

  if (cargando) return <p className="text-gray-400 text-center py-16">Cargando...</p>

  const totalEfectivo = dias.reduce((s, d) => s + d.efectivo, 0)
  const totalTransferencias = dias.reduce((s, d) => s + d.transferencias, 0)
  const totalGastos = dias.reduce((s, d) => s + d.gastos, 0)

  return (
    <>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">Efectivo</p>
          <p className="text-2xl font-black text-brand">{fmt(totalEfectivo)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">Transferencias</p>
          <p className="text-2xl font-black text-brand">{fmt(totalTransferencias)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">Gastos</p>
          <p className="text-2xl font-black text-brand">{fmt(totalGastos)}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <p className="font-black text-gray-700 mb-3">Efectivo, transferencias y gastos, dia por dia</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={dias}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="dia" fontSize={11} />
            <YAxis fontSize={11} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={v => fmt(v)} labelFormatter={d => `Dia ${d}`} />
            <Bar dataKey="efectivo" fill="#1a1a1a" radius={[4, 4, 0, 0]} />
            <Bar dataKey="transferencias" fill="#666666" radius={[4, 4, 0, 0]} />
            <Bar dataKey="gastos" fill="#C41230" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex justify-center gap-4 mt-2">
          <span className="text-xs text-gray-600"><span className="inline-block w-3 h-3 rounded-sm bg-sidebar mr-1 align-middle"></span>Efectivo</span>
          <span className="text-xs text-gray-600"><span className="inline-block w-3 h-3 rounded-sm bg-[#666666] mr-1 align-middle"></span>Transferencias</span>
          <span className="text-xs text-gray-600"><span className="inline-block w-3 h-3 rounded-sm bg-brand mr-1 align-middle"></span>Gastos</span>
        </div>
      </div>
    </>
  )
}

function TabMetas({ mes }) {
  const [cargando, setCargando] = useState(true)
  const [rutas, setRutas] = useState([])
  const [metas, setMetas] = useState([])
  const [ventaPorRuta, setVentaPorRuta] = useState({})
  const [rutaId, setRutaId] = useState('')
  const [valorMeta, setValorMeta] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { cargar() }, [mes])

  const cargar = async () => {
    setCargando(true)
    const { inicio, fin } = rangoMes(mes)
    const [{ data: r }, { data: m }, { data: despachos }, { data: liq }] = await Promise.all([
      supabase.from('rutas').select('*').eq('estado', true).order('nombre'),
      supabase.from('metas_ventas').select('*, rutas(nombre)').eq('mes', mes).not('ruta_id', 'is', null),
      supabase.from('despachos_encab').select('id, ruta_id').gte('fecha', inicio).lte('fecha', fin),
      supabase.from('liquidaciones').select('despacho_id, efectivo_esperado').gte('fecha', inicio).lte('fecha', fin),
    ])
    setRutas(r || [])
    setMetas(m || [])

    const despachoMap = {}
    ;(despachos || []).forEach(d => { despachoMap[d.id] = d })
    const porRuta = {}
    ;(liq || []).forEach(l => {
      const d = despachoMap[l.despacho_id]
      if (!d || !d.ruta_id) return
      porRuta[d.ruta_id] = (porRuta[d.ruta_id] || 0) + (l.efectivo_esperado || 0)
    })
    setVentaPorRuta(porRuta)
    setCargando(false)
  }

  const guardarMeta = async () => {
    if (!rutaId || !valorMeta) { alert('Selecciona una ruta e ingresa la meta'); return }
    setGuardando(true)
    const { data: existente } = await supabase.from('metas_ventas').select('id').eq('mes', mes).eq('ruta_id', rutaId).maybeSingle()
    if (existente) {
      await supabase.from('metas_ventas').update({ meta: parseFloat(valorMeta) }).eq('id', existente.id)
    } else {
      await supabase.from('metas_ventas').insert({ mes, ruta_id: rutaId, meta: parseFloat(valorMeta) })
    }
    setGuardando(false)
    setRutaId('')
    setValorMeta('')
    cargar()
  }

  if (cargando) return <p className="text-gray-400 text-center py-16">Cargando...</p>

  return (
    <>
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
        <p className="font-black text-gray-700 mb-3">Configurar meta por ruta</p>
        <select value={rutaId} onChange={e => setRutaId(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none mb-2">
          <option value="">Selecciona ruta</option>
          {rutas.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
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
            const nombre = m.rutas?.nombre || 'Sin nombre'
            const actual = ventaPorRuta[m.ruta_id] || 0
            const pct = m.meta > 0 ? Math.min(100, (actual / m.meta) * 100) : 0
            return (
              <div key={m.id} className="p-4">
                <div className="flex justify-between items-center mb-1">
                  <p className="font-bold text-gray-800 text-sm">{nombre}</p>
                  <p className="text-xl font-black text-brand">{pct.toFixed(0)}%</p>
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

function TabComisiones({ mes }) {
  const [cargando, setCargando] = useState(true)
  const [vendedores, setVendedores] = useState([])
  const [comisiones, setComisiones] = useState({})
  const [ventaPorVendedor, setVentaPorVendedor] = useState({})
  const [editando, setEditando] = useState(null)
  const [porcentajeEdit, setPorcentajeEdit] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { cargar() }, [mes])

  const cargar = async () => {
    setCargando(true)
    const { inicio, fin } = rangoMes(mes)
    const [{ data: v }, { data: c }, { data: despachos }, { data: liq }] = await Promise.all([
      supabase.from('vendedores').select('*').eq('estado', true).order('nombre'),
      supabase.from('comisiones_vendedores').select('*'),
      supabase.from('despachos_encab').select('id, vendedor_id').gte('fecha', inicio).lte('fecha', fin),
      supabase.from('liquidaciones').select('despacho_id, efectivo_esperado').gte('fecha', inicio).lte('fecha', fin),
    ])
    setVendedores(v || [])
    const comisionMap = {}
    ;(c || []).forEach(row => { comisionMap[row.vendedor_id] = row.porcentaje })
    setComisiones(comisionMap)

    const despachoMap = {}
    ;(despachos || []).forEach(d => { despachoMap[d.id] = d })
    const porVendedor = {}
    ;(liq || []).forEach(l => {
      const d = despachoMap[l.despacho_id]
      if (!d || !d.vendedor_id) return
      porVendedor[d.vendedor_id] = (porVendedor[d.vendedor_id] || 0) + (l.efectivo_esperado || 0)
    })
    setVentaPorVendedor(porVendedor)
    setCargando(false)
  }

  const guardarPorcentaje = async (vendedorId) => {
    if (porcentajeEdit === '') return
    setGuardando(true)
    const { data: existente } = await supabase.from('comisiones_vendedores').select('id').eq('vendedor_id', vendedorId).maybeSingle()
    if (existente) {
      await supabase.from('comisiones_vendedores').update({ porcentaje: parseFloat(porcentajeEdit) }).eq('id', existente.id)
    } else {
      await supabase.from('comisiones_vendedores').insert({ vendedor_id: vendedorId, porcentaje: parseFloat(porcentajeEdit) })
    }
    setGuardando(false)
    setEditando(null)
    setPorcentajeEdit('')
    cargar()
  }

  if (cargando) return <p className="text-gray-400 text-center py-16">Cargando...</p>

  const totalComisiones = vendedores.reduce((s, v) => {
    const ventas = ventaPorVendedor[v.id] || 0
    const pct = comisiones[v.id] || 0
    return s + ventas * (pct / 100)
  }, 0)

  return (
    <>
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
        <p className="text-xs text-gray-500 mb-1">Total comisiones del mes</p>
        <p className="text-3xl font-black text-brand">{fmt(totalComisiones)}</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
        {vendedores.map(v => {
          const ventas = ventaPorVendedor[v.id] || 0
          const pct = comisiones[v.id] || 0
          const comision = ventas * (pct / 100)
          return (
            <div key={v.id} className="p-4">
              <div className="flex justify-between items-center mb-1">
                <p className="font-bold text-gray-800 text-sm">{v.nombre}</p>
                {editando === v.id ? (
                  <div className="flex gap-2 items-center">
                    <input type="number" min="0" max="100" step="0.1" autoFocus value={porcentajeEdit}
                      onChange={e => setPorcentajeEdit(e.target.value)}
                      className="w-16 border-2 border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-800 focus:border-brand focus:outline-none" />
                    <button onClick={() => guardarPorcentaje(v.id)} disabled={guardando}
                      className="text-xs bg-brand hover:bg-brand-dark text-white px-2 py-1 rounded-lg font-bold">Ok</button>
                  </div>
                ) : (
                  <button onClick={() => { setEditando(v.id); setPorcentajeEdit(String(pct)) }}
                    className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg font-bold">
                    {pct}% · Editar
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-500 mb-1">Ventas netas: {fmt(ventas)}</p>
              <p className="text-xl font-black text-brand">{fmt(comision)}</p>
            </div>
          )
        })}
      </div>
    </>
  )
}

function TabPorRuta({ mes }) {
  const [cargando, setCargando] = useState(true)
  const [datosPorRuta, setDatosPorRuta] = useState([])
  const [expandido, setExpandido] = useState(null)

  useEffect(() => { cargar() }, [mes])

  const cargar = async () => {
    setCargando(true)
    const { inicio, fin } = rangoMes(mes)
    const [{ data: rutas }, { data: despachos }, { data: liq }, { data: gastos }, { data: productos }] = await Promise.all([
      supabase.from('rutas').select('*').eq('estado', true).order('nombre'),
      supabase.from('despachos_encab').select('id, ruta_id').gte('fecha', inicio).lte('fecha', fin),
      supabase.from('liquidaciones').select('despacho_id, sku, vendido_neto, efectivo_esperado').gte('fecha', inicio).lte('fecha', fin),
      supabase.from('liquidaciones_gastos').select('despacho_id, categoria, valor').gte('fecha', inicio).lte('fecha', fin),
      supabase.from('productos').select('sku, nombre'),
    ])

    const productosMap = {}
    ;(productos || []).forEach(p => { productosMap[p.sku] = p.nombre })

    const despachoRutaMap = {}
    ;(despachos || []).forEach(d => { despachoRutaMap[d.id] = d.ruta_id })

    const porRuta = {}
    ;(rutas || []).forEach(r => {
      porRuta[r.id] = { ruta: r, ventas: 0, gastosPorCategoria: {}, productos: {} }
    })

    ;(liq || []).forEach(l => {
      const rutaId = despachoRutaMap[l.despacho_id]
      if (!rutaId || !porRuta[rutaId]) return
      porRuta[rutaId].ventas += (l.efectivo_esperado || 0)
      const prodAcc = porRuta[rutaId].productos
      if (!prodAcc[l.sku]) prodAcc[l.sku] = { sku: l.sku, nombre: productosMap[l.sku] || l.sku, cantidad: 0, valor: 0 }
      prodAcc[l.sku].cantidad += (l.vendido_neto || 0)
      prodAcc[l.sku].valor += (l.efectivo_esperado || 0)
    })

    ;(gastos || []).forEach(g => {
      const rutaId = despachoRutaMap[g.despacho_id]
      if (!rutaId || !porRuta[rutaId]) return
      const key = g.categoria || 'Sin categoria'
      porRuta[rutaId].gastosPorCategoria[key] = (porRuta[rutaId].gastosPorCategoria[key] || 0) + (g.valor || 0)
    })

    const resultado = Object.values(porRuta).map(r => {
      const gastosPorCategoria = Object.entries(r.gastosPorCategoria).sort((a, b) => b[1] - a[1])
      const gastosTotal = gastosPorCategoria.reduce((s, [, v]) => s + v, 0)
      const topProductos = Object.values(r.productos).sort((a, b) => b.cantidad - a.cantidad).slice(0, 5)
      return {
        id: r.ruta.id,
        nombre: r.ruta.nombre,
        ventas: r.ventas,
        gastosPorCategoria,
        gastosTotal,
        margenNeto: r.ventas - gastosTotal,
        topProductos,
      }
    }).sort((a, b) => b.ventas - a.ventas)

    setDatosPorRuta(resultado)
    setCargando(false)
  }

  if (cargando) return <p className="text-gray-400 text-center py-16">Cargando...</p>
  if (datosPorRuta.length === 0) return <p className="text-gray-400 text-center py-16">Sin rutas activas</p>

  return (
    <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
      {datosPorRuta.map(r => {
        const abierta = expandido === r.id
        return (
          <div key={r.id}>
            <button onClick={() => setExpandido(abierta ? null : r.id)} className="w-full p-4 flex justify-between items-center text-left">
              <div>
                <p className="font-bold text-gray-800 text-sm">{r.nombre}</p>
                <p className="text-xs text-gray-500">Ventas: {fmt(r.ventas)} · Gastos: {fmt(r.gastosTotal)}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-black text-brand">{fmt(r.margenNeto)}</p>
                <p className="text-xs text-gray-400">{abierta ? 'Ocultar ▲' : 'Ver detalle ▼'}</p>
              </div>
            </button>
            {abierta && (
              <div className="px-4 pb-4">
                <p className="text-xs font-black uppercase tracking-wide text-gray-500 mb-1">Gastos de ruta por categoria</p>
                {r.gastosPorCategoria.length === 0 ? (
                  <p className="text-sm text-gray-400 mb-3">Sin gastos este mes</p>
                ) : (
                  <div className="mb-3">
                    {r.gastosPorCategoria.map(([cat, valor]) => (
                      <div key={cat} className="flex justify-between py-0.5">
                        <p className="text-sm text-gray-600">{cat}</p>
                        <p className="text-sm text-gray-800">{fmt(valor)}</p>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xs font-black uppercase tracking-wide text-gray-500 mb-1">Top 5 productos mas vendidos</p>
                {r.topProductos.length === 0 ? (
                  <p className="text-sm text-gray-400">Sin ventas este mes</p>
                ) : (
                  r.topProductos.map(p => (
                    <div key={p.sku} className="flex justify-between py-0.5">
                      <p className="text-sm text-gray-600">{p.nombre}</p>
                      <p className="text-sm text-gray-800">{p.cantidad} und · {fmt(p.valor)}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
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
        <p className="text-3xl font-black text-brand">{fmt(totalVencido)}</p>
      </div>

      {BUCKETS_CARTERA.map(b => {
        const items = grupos[b.id]
        const total = items.reduce((s, f) => s + (f.saldo || 0), 0)
        if (items.length === 0) return null
        return (
          <div key={b.id} className="bg-white rounded-2xl shadow-sm mb-3 overflow-hidden">
            <div className={`px-4 py-3 flex justify-between items-center ${b.id === 'porVencer' ? 'bg-gray-100' : 'bg-brand/5'}`}>
              <p className={`font-black text-sm ${b.id === 'porVencer' ? 'text-gray-700' : 'text-brand'}`}>{b.nombre}</p>
              <p className={`font-black text-lg ${b.id === 'porVencer' ? 'text-gray-700' : 'text-brand'}`}>{fmt(total)}</p>
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
