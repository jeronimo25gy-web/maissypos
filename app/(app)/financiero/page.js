'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { formatearMoneda, obtenerFechaActual } from '@/lib/supabase-helpers'

const mesActual = () => obtenerFechaActual().slice(0, 7)

const rangoMes = (mes) => {
  const [y, m] = mes.split('-').map(Number)
  const inicio = `${mes}-01`
  const ultimoDia = new Date(y, m, 0).getDate()
  const fin = `${mes}-${String(ultimoDia).padStart(2, '0')}`
  return { inicio, fin, ultimoDia }
}

const fmt = formatearMoneda

function calcularComision(pctMeta, utilidadNeta, rangos) {
  const rango = (rangos || []).find(r => pctMeta >= r.meta_pct_min && (r.meta_pct_max == null || pctMeta <= r.meta_pct_max))
  if (!rango) return { comision: 0, rango: null }
  return { comision: utilidadNeta * (rango.comision_pct / 100), rango }
}

const TABS = [
  { id: 'pnl', nombre: 'P&L del mes' },
  { id: 'flujo', nombre: 'Flujo de caja' },
  { id: 'caja', nombre: 'Caja y Bancos' },
  { id: 'metas', nombre: 'Metas' },
  { id: 'comisiones', nombre: 'Comisiones' },
  { id: 'porRuta', nombre: 'Por Ruta' },
  { id: 'novedades', nombre: 'Novedades' },
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
            <div className="flex items-center gap-2">
              <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-gray-700" aria-label="Volver al dashboard">←</button>
              <h1 className="text-xl font-black text-gray-900">Financiero</h1>
            </div>
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
        {vista === 'caja' && <TabCaja />}
        {vista === 'metas' && <TabMetas mes={mes} />}
        {vista === 'comisiones' && <TabComisiones mes={mes} />}
        {vista === 'porRuta' && <TabPorRuta mes={mes} />}
        {vista === 'novedades' && <TabNovedades mes={mes} />}
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
      supabase.from('liquidaciones').select('efectivo_esperado').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', getEmpresaId()),
      supabase.from('compras').select('total').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', getEmpresaId()),
      supabase.from('liquidaciones_gastos').select('categoria, valor').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', getEmpresaId()),
      supabase.from('gastos_admin').select('categoria, valor').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', getEmpresaId()),
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
      .eq('empresa_id', getEmpresaId())

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

function TabCaja() {
  const [cargando, setCargando] = useState(true)
  const [cuentas, setCuentas] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [cuentaFiltro, setCuentaFiltro] = useState('Todas')
  const [desde, setDesde] = useState(`${mesActual()}-01`)
  const [hasta, setHasta] = useState(obtenerFechaActual())

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setCargando(true)
    const [{ data: c }, { data: m }] = await Promise.all([
      supabase.from('cuentas').select('*').eq('empresa_id', getEmpresaId()).order('tipo').order('nombre'),
      supabase.from('movimientos_tesoreria').select('*').eq('empresa_id', getEmpresaId()).order('fecha', { ascending: false }),
    ])
    setCuentas(c || [])
    setMovimientos(m || [])
    setCargando(false)
  }

  const saldoDeCuenta = (cuenta) => {
    const propios = movimientos.filter(mv => mv.cuenta_id === cuenta.id)
    const entradas = propios.filter(mv => mv.tipo === 'entrada').reduce((s, mv) => s + (mv.monto || 0), 0)
    const salidas = propios.filter(mv => mv.tipo === 'salida').reduce((s, mv) => s + (mv.monto || 0), 0)
    return (cuenta.saldo_inicial || 0) + entradas - salidas
  }

  const movimientosSinCuenta = movimientos.filter(mv => !mv.cuenta_id)

  const movimientosFiltrados = movimientos.filter(mv => {
    const matchCuenta = cuentaFiltro === 'Todas' || (cuentaFiltro === 'sin-cuenta' ? !mv.cuenta_id : mv.cuenta_id === cuentaFiltro)
    const matchFecha = (!desde || mv.fecha >= desde) && (!hasta || mv.fecha <= hasta)
    return matchCuenta && matchFecha
  })

  const nombreCuenta = (cuentaId) => cuentas.find(c => c.id === cuentaId)?.nombre || 'Sin asignar'

  if (cargando) return <p className="text-gray-400 text-center py-16">Cargando...</p>

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        {cuentas.filter(c => c.estado).map(c => (
          <div key={c.id} className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">{c.nombre} {c.tipo === 'efectivo' ? '(Efectivo)' : ''}</p>
            <p className="text-2xl font-black text-brand">{fmt(saldoDeCuenta(c))}</p>
          </div>
        ))}
        {movimientosSinCuenta.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-brand/30">
            <p className="text-xs text-gray-500 mb-1">Sin cuenta asignada</p>
            <p className="text-2xl font-black text-brand">
              {fmt(movimientosSinCuenta.reduce((s, mv) => s + (mv.tipo === 'entrada' ? mv.monto : -mv.monto), 0))}
            </p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex flex-col md:flex-row gap-2 mb-3">
          <select value={cuentaFiltro} onChange={e => setCuentaFiltro(e.target.value)}
            className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
            <option value="Todas">Todas las cuentas</option>
            {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            <option value="sin-cuenta">Sin cuenta asignada</option>
          </select>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
            className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
            className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
        </div>

        {movimientosFiltrados.length === 0 ? (
          <p className="text-gray-400 text-center py-8">Sin movimientos en este rango</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {movimientosFiltrados.map(mv => (
              <div key={mv.id} className="py-3 flex justify-between items-center">
                <div>
                  <p className="font-bold text-gray-800 text-sm">{mv.concepto || 'Movimiento'}</p>
                  <p className="text-xs text-gray-500">{mv.fecha} · {nombreCuenta(mv.cuenta_id)}</p>
                </div>
                <p className={`font-black ${mv.tipo === 'entrada' ? 'text-gray-900' : 'text-brand'}`}>
                  {mv.tipo === 'entrada' ? '+' : '-'}{fmt(mv.monto)}
                </p>
              </div>
            ))}
          </div>
        )}
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
      supabase.from('rutas').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre'),
      supabase.from('metas_ventas').select('*, rutas(nombre)').eq('mes', mes).not('ruta_id', 'is', null).eq('empresa_id', getEmpresaId()),
      supabase.from('despachos_encab').select('id, ruta_id').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', getEmpresaId()),
      supabase.from('liquidaciones').select('despacho_id, efectivo_esperado').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', getEmpresaId()),
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
    const { data: existente } = await supabase.from('metas_ventas').select('id').eq('mes', mes).eq('ruta_id', rutaId).eq('empresa_id', getEmpresaId()).maybeSingle()
    if (existente) {
      await supabase.from('metas_ventas').update({ meta: parseFloat(valorMeta) }).eq('id', existente.id)
    } else {
      await supabase.from('metas_ventas').insert({ mes, ruta_id: rutaId, meta: parseFloat(valorMeta), empresa_id: getEmpresaId() })
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
  const [rangos, setRangos] = useState([])
  const [resultados, setResultados] = useState([])
  const [form, setForm] = useState({ meta_pct_min: '', meta_pct_max: '', comision_pct: '' })
  const [editandoRango, setEditandoRango] = useState(null)
  const [guardandoRango, setGuardandoRango] = useState(false)

  useEffect(() => { cargar() }, [mes])

  const cargar = async () => {
    setCargando(true)
    const { inicio, fin } = rangoMes(mes)
    const [{ data: rangosData }, { data: rutas }, { data: vendedoresData }, { data: metas }, { data: despachos }, { data: liq }, { data: gastos }] = await Promise.all([
      supabase.from('config_comisiones').select('*').eq('empresa_id', getEmpresaId()).order('meta_pct_min'),
      supabase.from('rutas').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre'),
      supabase.from('vendedores').select('id, nombre, ruta_id').eq('empresa_id', getEmpresaId()),
      supabase.from('metas_ventas').select('*').eq('mes', mes).not('ruta_id', 'is', null).eq('empresa_id', getEmpresaId()),
      supabase.from('despachos_encab').select('id, ruta_id').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', getEmpresaId()),
      supabase.from('liquidaciones').select('despacho_id, efectivo_esperado').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', getEmpresaId()),
      supabase.from('liquidaciones_gastos').select('despacho_id, valor').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', getEmpresaId()),
    ])
    setRangos(rangosData || [])

    const despachoRutaMap = {}
    ;(despachos || []).forEach(d => { despachoRutaMap[d.id] = d.ruta_id })
    const ventaPorRuta = {}
    ;(liq || []).forEach(l => {
      const r = despachoRutaMap[l.despacho_id]
      if (!r) return
      ventaPorRuta[r] = (ventaPorRuta[r] || 0) + (l.efectivo_esperado || 0)
    })
    const gastoPorRuta = {}
    ;(gastos || []).forEach(g => {
      const r = despachoRutaMap[g.despacho_id]
      if (!r) return
      gastoPorRuta[r] = (gastoPorRuta[r] || 0) + (g.valor || 0)
    })
    const metaPorRuta = {}
    ;(metas || []).forEach(m => { metaPorRuta[m.ruta_id] = m.meta })
    const vendedorPorRuta = {}
    ;(vendedoresData || []).forEach(v => { if (v.ruta_id) vendedorPorRuta[v.ruta_id] = v.nombre })

    const resultado = (rutas || []).map(r => {
      const ventas = ventaPorRuta[r.id] || 0
      const gastosRuta = gastoPorRuta[r.id] || 0
      const utilidadNeta = ventas - gastosRuta
      const meta = metaPorRuta[r.id] || 0
      const pctMeta = meta > 0 ? (ventas / meta) * 100 : 0
      const { comision, rango } = calcularComision(pctMeta, utilidadNeta, rangosData || [])
      return { id: r.id, nombre: r.nombre, vendedor: vendedorPorRuta[r.id] || 'Sin asignar', ventas, utilidadNeta, meta, pctMeta, comision, rango }
    })
    setResultados(resultado)
    setCargando(false)
  }

  const editarRango = (r) => {
    setEditandoRango(r.id)
    setForm({ meta_pct_min: String(r.meta_pct_min), meta_pct_max: r.meta_pct_max == null ? '' : String(r.meta_pct_max), comision_pct: String(r.comision_pct) })
  }

  const cancelarForm = () => {
    setEditandoRango(null)
    setForm({ meta_pct_min: '', meta_pct_max: '', comision_pct: '' })
  }

  const guardarRango = async () => {
    if (form.meta_pct_min === '' || form.comision_pct === '') { alert('Completa el % minimo de meta y el % de comision'); return }
    setGuardandoRango(true)
    const payload = {
      meta_pct_min: parseFloat(form.meta_pct_min),
      meta_pct_max: form.meta_pct_max === '' ? null : parseFloat(form.meta_pct_max),
      comision_pct: parseFloat(form.comision_pct),
    }
    const { error } = editandoRango
      ? await supabase.from('config_comisiones').update(payload).eq('id', editandoRango)
      : await supabase.from('config_comisiones').insert({ ...payload, empresa_id: getEmpresaId() })
    setGuardandoRango(false)
    if (error) { alert('Error: ' + error.message); return }
    cancelarForm()
    cargar()
  }

  const eliminarRango = async (id) => {
    if (!confirm('Eliminar este rango de comision?')) return
    await supabase.from('config_comisiones').delete().eq('id', id).eq('empresa_id', getEmpresaId())
    cargar()
  }

  if (cargando) return <p className="text-gray-400 text-center py-16">Cargando...</p>

  const totalComisiones = resultados.reduce((s, r) => s + r.comision, 0)

  return (
    <>
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
        <p className="font-black text-gray-700 mb-3">Rangos de comision (sobre utilidad neta de la ruta)</p>
        <div className="flex gap-2 mb-3 flex-wrap">
          <input type="number" min="0" placeholder="% meta minimo" value={form.meta_pct_min}
            onChange={e => setForm({ ...form, meta_pct_min: e.target.value })}
            className="flex-1 min-w-[100px] border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
          <input type="number" min="0" placeholder="% meta maximo (opcional)" value={form.meta_pct_max}
            onChange={e => setForm({ ...form, meta_pct_max: e.target.value })}
            className="flex-1 min-w-[100px] border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
          <input type="number" min="0" placeholder="% comision" value={form.comision_pct}
            onChange={e => setForm({ ...form, comision_pct: e.target.value })}
            className="flex-1 min-w-[100px] border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
        </div>
        <div className="flex gap-2">
          {editandoRango && (
            <button onClick={cancelarForm} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-lg">Cancelar</button>
          )}
          <button onClick={guardarRango} disabled={guardandoRango}
            className="flex-1 bg-brand hover:bg-brand-dark text-white font-bold py-2 rounded-lg disabled:opacity-50">
            {guardandoRango ? 'Guardando...' : editandoRango ? 'Guardar cambios' : '+ Agregar rango'}
          </button>
        </div>

        {rangos.length > 0 && (
          <div className="mt-3 divide-y divide-gray-100">
            {rangos.map(r => (
              <div key={r.id} className="py-2 flex justify-between items-center">
                <p className="text-sm text-gray-700">
                  {r.meta_pct_min}% — {r.meta_pct_max == null ? '∞' : `${r.meta_pct_max}%`} de meta
                </p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-black text-brand">{r.comision_pct}%</p>
                  <button onClick={() => editarRango(r)} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg font-bold">Editar</button>
                  <button onClick={() => eliminarRango(r.id)} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg font-bold">Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
        <p className="text-xs text-gray-500 mb-1">Total comisiones del mes</p>
        <p className="text-3xl font-black text-brand">{fmt(totalComisiones)}</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
        {resultados.map(r => (
          <div key={r.id} className="p-4">
            <div className="flex justify-between items-center mb-1">
              <div>
                <p className="font-bold text-gray-800 text-sm">{r.nombre}</p>
                <p className="text-xs text-gray-500">{r.vendedor}</p>
              </div>
              <p className="text-xl font-black text-brand">{fmt(r.comision)}</p>
            </div>
            <p className="text-xs text-gray-500">
              Utilidad neta: {fmt(r.utilidadNeta)} · {r.meta > 0 ? `${r.pctMeta.toFixed(0)}% de meta` : 'Sin meta configurada'}
              {r.rango ? ` · Rango aplicado: ${r.rango.comision_pct}%` : ' · Sin rango aplicable'}
            </p>
          </div>
        ))}
      </div>
    </>
  )
}

function TabPorRuta({ mes }) {
  const [rutas, setRutas] = useState([])
  const [rutaId, setRutaId] = useState('')
  const [cargandoRutas, setCargandoRutas] = useState(true)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const [productosMap, setProductosMap] = useState({})
  const [vendedoresMap, setVendedoresMap] = useState({})
  const [expandidoLiq, setExpandidoLiq] = useState(null)
  const [detalleLiqCache, setDetalleLiqCache] = useState({})
  const [cargandoDetalleLiq, setCargandoDetalleLiq] = useState(false)

  useEffect(() => { cargarRutas() }, [])
  useEffect(() => { if (rutaId) cargarDetalle() }, [rutaId, mes])

  const cargarRutas = async () => {
    setCargandoRutas(true)
    const { data } = await supabase.from('rutas').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    setRutas(data || [])
    if (data && data.length > 0) setRutaId(data[0].id)
    setCargandoRutas(false)
  }

  const cargarDetalle = async () => {
    setCargandoDetalle(true)
    setExpandidoLiq(null)
    setDetalleLiqCache({})
    const { inicio, fin } = rangoMes(mes)
    const [
      { data: vendedorRow },
      { data: metaRow },
      { data: rangos },
      { data: despachos },
      { data: liq },
      { data: gastos },
      { data: productos },
      { data: fiados },
      { data: liqDetalle },
      { data: vendedoresAll },
    ] = await Promise.all([
      supabase.from('vendedores').select('nombre').eq('ruta_id', rutaId).eq('empresa_id', getEmpresaId()).maybeSingle(),
      supabase.from('metas_ventas').select('meta').eq('mes', mes).eq('ruta_id', rutaId).eq('empresa_id', getEmpresaId()).maybeSingle(),
      supabase.from('config_comisiones').select('*').eq('empresa_id', getEmpresaId()).order('meta_pct_min'),
      supabase.from('despachos_encab').select('id, fecha').eq('ruta_id', rutaId).gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', getEmpresaId()),
      supabase.from('liquidaciones').select('despacho_id, sku, vendido_neto, efectivo_esperado').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', getEmpresaId()),
      supabase.from('liquidaciones_gastos').select('despacho_id, categoria, valor').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', getEmpresaId()),
      supabase.from('productos').select('sku, nombre, precio_venta').eq('empresa_id', getEmpresaId()),
      supabase.from('cartera_fiados').select('*').eq('ruta_id', rutaId).eq('estado', 'pendiente').eq('empresa_id', getEmpresaId()).order('fecha_fiado', { ascending: false }),
      supabase.from('liquidaciones_detalle').select('*').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', getEmpresaId()),
      supabase.from('vendedores').select('id, nombre').eq('empresa_id', getEmpresaId()),
    ])

    const despachoIds = new Set((despachos || []).map(d => d.id))
    const prodMap = {}
    ;(productos || []).forEach(p => { prodMap[p.sku] = p })
    setProductosMap(prodMap)

    const vendMap = {}
    ;(vendedoresAll || []).forEach(v => { vendMap[v.id] = v.nombre })
    setVendedoresMap(vendMap)

    let ventas = 0
    const prodAcc = {}
    ;(liq || []).forEach(l => {
      if (!despachoIds.has(l.despacho_id)) return
      ventas += (l.efectivo_esperado || 0)
      if (!prodAcc[l.sku]) prodAcc[l.sku] = { sku: l.sku, nombre: prodMap[l.sku]?.nombre || l.sku, cantidad: 0, valor: 0 }
      prodAcc[l.sku].cantidad += (l.vendido_neto || 0)
      prodAcc[l.sku].valor += (l.efectivo_esperado || 0)
    })
    const topProductos = Object.values(prodAcc).sort((a, b) => b.cantidad - a.cantidad).slice(0, 5)

    const gastosPorCategoriaMap = {}
    ;(gastos || []).forEach(g => {
      if (!despachoIds.has(g.despacho_id)) return
      const key = g.categoria || 'Sin categoria'
      gastosPorCategoriaMap[key] = (gastosPorCategoriaMap[key] || 0) + (g.valor || 0)
    })
    const gastosPorCategoria = Object.entries(gastosPorCategoriaMap).sort((a, b) => b[1] - a[1])
    const gastosTotal = gastosPorCategoria.reduce((s, [, v]) => s + v, 0)

    const utilidadNeta = ventas - gastosTotal
    const meta = metaRow?.meta || 0
    const pctMeta = meta > 0 ? (ventas / meta) * 100 : 0
    const { comision, rango } = calcularComision(pctMeta, utilidadNeta, rangos || [])

    const historial = (liqDetalle || [])
      .filter(l => despachoIds.has(l.despacho_id))
      .sort((a, b) => b.fecha.localeCompare(a.fecha))

    setDetalle({
      vendedor: vendedorRow?.nombre || 'Sin asignar',
      ventas, gastosPorCategoria, gastosTotal, utilidadNeta,
      meta, pctMeta, comision, rango,
      topProductos, fiados: fiados || [], historial,
    })
    setCargandoDetalle(false)
  }

  const toggleDetalleLiquidacion = async (liqRow) => {
    const despachoId = liqRow.despacho_id
    if (expandidoLiq === despachoId) { setExpandidoLiq(null); return }
    setExpandidoLiq(despachoId)
    if (detalleLiqCache[despachoId]) return
    setCargandoDetalleLiq(true)
    const [{ data: liqProd }, { data: fiadosDet }, { data: gastosDet }, { data: descuentosDet }, { data: obsequiosDet }, { data: transEnvDet }, { data: transRecDet }] = await Promise.all([
      supabase.from('liquidaciones').select('*').eq('despacho_id', despachoId),
      supabase.from('liquidaciones_fiados').select('*').eq('despacho_id', despachoId),
      supabase.from('liquidaciones_gastos').select('*').eq('despacho_id', despachoId),
      supabase.from('liquidaciones_descuentos').select('*').eq('despacho_id', despachoId),
      supabase.from('obsequios').select('*').eq('despacho_id', despachoId),
      supabase.from('transferencias_mercancia').select('*').eq('vendedor_origen_id', liqRow.vendedor_id).eq('fecha', liqRow.fecha).eq('empresa_id', getEmpresaId()),
      supabase.from('transferencias_mercancia').select('*').eq('vendedor_destino_id', liqRow.vendedor_id).eq('fecha', liqRow.fecha).eq('empresa_id', getEmpresaId()),
    ])
    const productosDetalle = (liqProd || []).map(l => ({ ...l, producto: productosMap[l.sku] || {} }))
    setDetalleLiqCache(prev => ({
      ...prev,
      [despachoId]: {
        productos: productosDetalle,
        fiadosNuevos: (fiadosDet || []).filter(f => f.tipo === 'fiado'),
        pagosFiados: (fiadosDet || []).filter(f => f.tipo === 'pago_fiado'),
        gastos: gastosDet || [],
        descuentos: descuentosDet || [],
        obsequios: (obsequiosDet || []).map(o => ({ ...o, producto: productosMap[o.sku] || {} })),
        transEnviadas: (transEnvDet || []).map(t => ({ ...t, producto: productosMap[t.sku]?.nombre || t.sku, vendedor: vendedoresMap[t.vendedor_destino_id] || 'Vendedor' })),
        transRecibidas: (transRecDet || []).map(t => ({ ...t, producto: productosMap[t.sku]?.nombre || t.sku, vendedor: vendedoresMap[t.vendedor_origen_id] || 'Vendedor' })),
      },
    }))
    setCargandoDetalleLiq(false)
  }

  if (cargandoRutas) return <p className="text-gray-400 text-center py-16">Cargando...</p>
  if (rutas.length === 0) return <p className="text-gray-400 text-center py-16">Sin rutas activas</p>

  return (
    <>
      <select value={rutaId} onChange={e => setRutaId(e.target.value)}
        className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 mb-4 text-sm text-gray-800 focus:border-brand focus:outline-none">
        {rutas.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
      </select>

      {cargandoDetalle || !detalle ? (
        <p className="text-gray-400 text-center py-16">Cargando...</p>
      ) : (
        <>
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
            <p className="text-xs text-gray-500 mb-1">Vendedor asignado</p>
            <p className="font-bold text-gray-800">{detalle.vendedor}</p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
            <div className="bg-white rounded-2xl p-3 sm:p-5 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Ventas</p>
              <p className="text-sm sm:text-lg font-black text-gray-900">{fmt(detalle.ventas)}</p>
            </div>
            <div className="bg-white rounded-2xl p-3 sm:p-5 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Gastos</p>
              <p className="text-sm sm:text-lg font-black text-brand">{fmt(detalle.gastosTotal)}</p>
            </div>
            <div className="bg-white rounded-2xl p-3 sm:p-5 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Utilidad neta</p>
              <p className="text-sm sm:text-lg font-black text-gray-900">{fmt(detalle.utilidadNeta)}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
            <p className="text-xs text-gray-500 mb-1">Comision calculada del vendedor</p>
            <p className="text-3xl font-black text-brand mb-1">{fmt(detalle.comision)}</p>
            <p className="text-xs text-gray-500">
              {detalle.meta > 0 ? `${detalle.pctMeta.toFixed(0)}% de la meta` : 'Sin meta configurada este mes'}
              {detalle.rango ? ` · Rango aplicado: ${detalle.rango.comision_pct}%` : ' · Sin rango de comision aplicable'}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
            <p className="text-xs font-black uppercase tracking-wide text-gray-500 mb-2">Gastos por categoria</p>
            {detalle.gastosPorCategoria.length === 0 ? (
              <p className="text-sm text-gray-400">Sin gastos este mes</p>
            ) : (
              detalle.gastosPorCategoria.map(([cat, valor]) => (
                <div key={cat} className="flex justify-between py-1">
                  <p className="text-sm text-gray-600">{cat}</p>
                  <p className="text-sm text-gray-800">{fmt(valor)}</p>
                </div>
              ))
            )}
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
            <p className="text-xs font-black uppercase tracking-wide text-gray-500 mb-2">Top 5 productos mas vendidos</p>
            {detalle.topProductos.length === 0 ? (
              <p className="text-sm text-gray-400">Sin ventas este mes</p>
            ) : (
              detalle.topProductos.map(p => (
                <div key={p.sku} className="flex justify-between py-1">
                  <p className="text-sm text-gray-600">{p.nombre}</p>
                  <p className="text-sm text-gray-800">{p.cantidad} und · {fmt(p.valor)}</p>
                </div>
              ))
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden">
            <div className="px-4 py-3 bg-brand/5">
              <p className="font-black text-sm text-brand">Fiados pendientes</p>
            </div>
            {detalle.fiados.length === 0 ? (
              <p className="text-sm text-gray-400 p-4">Sin fiados pendientes</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {detalle.fiados.map(f => (
                  <div key={f.id} className="px-4 py-2 flex justify-between items-center">
                    <div>
                      <p className="text-sm text-gray-800 font-medium">{f.nombre_cliente}</p>
                      <p className="text-xs text-gray-400">Desde: {f.fecha_fiado}</p>
                    </div>
                    <p className="text-sm font-bold text-gray-800">{fmt(f.saldo)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-100">
              <p className="font-black text-sm text-gray-700">Historial de liquidaciones del mes</p>
            </div>
            {detalle.historial.length === 0 ? (
              <p className="text-sm text-gray-400 p-4">Sin liquidaciones este mes</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {detalle.historial.map(l => {
                  const abierta = expandidoLiq === l.despacho_id
                  const det = detalleLiqCache[l.despacho_id]
                  return (
                    <div key={l.id}>
                      <button onClick={() => toggleDetalleLiquidacion(l)}
                        className="w-full px-4 py-2 flex justify-between items-center text-left">
                        <div>
                          <p className="text-sm text-gray-800">{l.fecha}</p>
                          <p className="text-xs text-gray-400">Efectivo: {fmt(l.efectivo)} · Gastos: {fmt(l.total_gastos)}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-bold ${l.diferencia < 0 ? 'text-brand' : 'text-gray-800'}`}>
                            {l.diferencia >= 0 ? '+' : ''}{fmt(l.diferencia)}
                          </p>
                          <p className="text-xs text-gray-400">{abierta ? 'Ocultar ▲' : 'Ver detalle ▼'}</p>
                        </div>
                      </button>

                      {abierta && (
                        <div className="px-4 pb-4 bg-gray-50">
                          {cargandoDetalleLiq && !det ? (
                            <p className="text-sm text-gray-400 py-3">Cargando detalle...</p>
                          ) : det && (
                            <>
                              <p className="text-xs font-black uppercase tracking-wide text-gray-500 pt-3 mb-1">Productos</p>
                              <div className="bg-white rounded-lg overflow-hidden mb-3">
                                <div className="grid grid-cols-4 bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-500">
                                  <span className="col-span-2">Producto</span>
                                  <span className="text-center">Desp/Dev/Cam</span>
                                  <span className="text-right">Vendido</span>
                                </div>
                                {det.productos.map((p, i) => (
                                  <div key={i} className="grid grid-cols-4 px-3 py-2 border-t border-gray-100">
                                    <div className="col-span-2">
                                      <p className="text-sm text-gray-800">{p.producto?.nombre || p.sku}</p>
                                      <p className="text-xs text-gray-400">{p.sku}</p>
                                    </div>
                                    <p className="text-xs text-center text-gray-600">{p.despachado} / {p.devuelto || 0} / {p.cambio || 0}</p>
                                    <p className="text-sm text-right font-bold text-gray-800">{fmt(p.vendido_neto * (p.producto?.precio_venta || 0))}</p>
                                  </div>
                                ))}
                              </div>

                              <p className="text-xs font-black uppercase tracking-wide text-gray-500 mb-1">Cuadre de caja</p>
                              <div className="bg-white rounded-lg p-3 mb-3">
                                <div className="flex justify-between py-0.5"><p className="text-sm text-gray-600">Efectivo</p><p className="text-sm font-bold text-gray-800">{fmt(l.efectivo)}</p></div>
                                <div className="flex justify-between py-0.5"><p className="text-sm text-gray-600">Transferencias</p><p className="text-sm font-bold text-gray-800">{fmt(l.transferencias_bancarias)}</p></div>
                                <div className="flex justify-between py-0.5"><p className="text-sm text-gray-600">Gastos de ruta</p><p className="text-sm font-bold text-brand">-{fmt(l.total_gastos)}</p></div>
                                <div className="flex justify-between py-0.5"><p className="text-sm text-gray-600">Fiados nuevos</p><p className="text-sm font-bold text-gray-700">-{fmt(l.total_fiados)}</p></div>
                                <div className="flex justify-between py-0.5"><p className="text-sm text-gray-600">Pagos fiados recibidos</p><p className="text-sm font-bold text-gray-900">+{fmt(l.total_pagos_fiados)}</p></div>
                                <div className="flex justify-between py-0.5"><p className="text-sm text-gray-600">Descuentos</p><p className="text-sm font-bold text-brand">-{fmt(det.descuentos.reduce((s, d) => s + (d.valor || 0), 0))}</p></div>
                                <div className="flex justify-between py-0.5"><p className="text-sm text-gray-600">Obsequios (informativo)</p><p className="text-sm font-bold text-gray-500">{fmt(det.obsequios.reduce((s, o) => s + (o.valor_unitario || 0) * (o.cantidad || 0), 0))}</p></div>
                                <div className="flex justify-between pt-2 mt-1 border-t border-gray-200">
                                  <p className="text-sm font-black text-gray-700">Diferencia</p>
                                  <p className={`text-sm font-black ${l.diferencia < 0 ? 'text-brand' : 'text-gray-900'}`}>{l.diferencia >= 0 ? '+' : ''}{fmt(l.diferencia)}</p>
                                </div>
                              </div>

                              {det.fiadosNuevos.length > 0 && (
                                <>
                                  <p className="text-xs font-black uppercase tracking-wide text-gray-500 mb-1">Fiados nuevos</p>
                                  <div className="bg-white rounded-lg p-3 mb-3">
                                    {det.fiadosNuevos.map((f, i) => (
                                      <div key={i} className="flex justify-between py-0.5">
                                        <p className="text-sm text-gray-600">{f.nombre_cliente}</p>
                                        <p className="text-sm text-gray-800">{fmt(f.valor)}</p>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}

                              {det.pagosFiados.length > 0 && (
                                <>
                                  <p className="text-xs font-black uppercase tracking-wide text-gray-500 mb-1">Pagos de fiados recibidos</p>
                                  <div className="bg-white rounded-lg p-3 mb-3">
                                    {det.pagosFiados.map((f, i) => (
                                      <div key={i} className="flex justify-between py-0.5">
                                        <p className="text-sm text-gray-600">{f.nombre_cliente}</p>
                                        <p className="text-sm text-gray-800">{fmt(f.valor)}</p>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}

                              {det.gastos.length > 0 && (
                                <>
                                  <p className="text-xs font-black uppercase tracking-wide text-gray-500 mb-1">Gastos de ruta</p>
                                  <div className="bg-white rounded-lg p-3 mb-3">
                                    {det.gastos.map((g, i) => (
                                      <div key={i} className="flex justify-between py-0.5">
                                        <p className="text-sm text-gray-600">{g.categoria || g.concepto}</p>
                                        <p className="text-sm text-brand">{fmt(g.valor)}</p>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}

                              {det.descuentos.length > 0 && (
                                <>
                                  <p className="text-xs font-black uppercase tracking-wide text-gray-500 mb-1">Descuentos</p>
                                  <div className="bg-white rounded-lg p-3 mb-3">
                                    {det.descuentos.map((d, i) => (
                                      <div key={i} className="flex justify-between py-0.5">
                                        <p className="text-sm text-gray-600">{d.concepto || d.sku}</p>
                                        <p className="text-sm text-brand">{fmt(d.valor)}</p>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}

                              {det.obsequios.length > 0 && (
                                <>
                                  <p className="text-xs font-black uppercase tracking-wide text-gray-500 mb-1">Obsequios</p>
                                  <div className="bg-white rounded-lg p-3 mb-3">
                                    {det.obsequios.map((o, i) => (
                                      <div key={i} className="flex justify-between py-0.5">
                                        <p className="text-sm text-gray-600">{o.producto?.nombre || o.sku} · {o.cantidad} und · {o.autorizado_por}</p>
                                        <p className="text-sm text-gray-500">{fmt((o.valor_unitario || 0) * (o.cantidad || 0))}</p>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}

                              {(det.transEnviadas.length > 0 || det.transRecibidas.length > 0) && (
                                <>
                                  <p className="text-xs font-black uppercase tracking-wide text-gray-500 mb-1">Transferencias de mercancia</p>
                                  <div className="bg-white rounded-lg p-3">
                                    {det.transEnviadas.length > 0 && (
                                      <div className="mb-2">
                                        <p className="text-xs font-bold text-gray-500 mb-1">Enviada</p>
                                        {det.transEnviadas.map((t, i) => (
                                          <div key={i} className="flex justify-between py-0.5">
                                            <p className="text-sm text-gray-600">{t.producto} · {t.cantidad} und · A: {t.vendedor}</p>
                                            <p className="text-sm text-gray-800">{fmt(t.valor_total)}</p>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {det.transRecibidas.length > 0 && (
                                      <div>
                                        <p className="text-xs font-bold text-gray-500 mb-1">Recibida</p>
                                        {det.transRecibidas.map((t, i) => (
                                          <div key={i} className="flex justify-between py-0.5">
                                            <p className="text-sm text-gray-600">{t.producto} · {t.cantidad} und · De: {t.vendedor}</p>
                                            <p className="text-sm text-gray-800">{fmt(t.valor_total)}</p>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}

const TIPOS_NOVEDAD_LABEL = {
  devolucion: 'Devoluciones',
  cambio_proveedor: 'Cambios por proveedor (antiguo)',
  perdida_calidad: 'Perdida por calidad (antiguo)',
  cortesia_cliente: 'Cortesia a cliente (antiguo)',
  obsequio: 'Obsequios',
  mano_a_mano: 'Mano a mano',
  descuenta_proveedor: 'Descuenta a proveedor',
  perdida_negocio: 'Perdida del negocio',
}

function TabNovedades({ mes }) {
  const [cargando, setCargando] = useState(true)
  const [grupos, setGrupos] = useState([])
  const [totalGeneral, setTotalGeneral] = useState(0)
  const [expandido, setExpandido] = useState(null)

  useEffect(() => { cargar() }, [mes])

  const cargar = async () => {
    setCargando(true)
    const { inicio, fin } = rangoMes(mes)
    const [{ data: novedades }, { data: obsequios }, { data: productos }] = await Promise.all([
      supabase.from('novedades').select('*, vendedores(nombre)').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', getEmpresaId()),
      supabase.from('obsequios').select('*, vendedores(nombre)').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', getEmpresaId()),
      supabase.from('productos').select('sku, nombre').eq('empresa_id', getEmpresaId()),
    ])

    const productosMap = {}
    ;(productos || []).forEach(p => { productosMap[p.sku] = p.nombre })

    const acumulado = {}
    ;(novedades || []).forEach(n => {
      const key = n.tipo || 'Sin tipo'
      if (!acumulado[key]) acumulado[key] = { tipo: key, items: [], total: 0 }
      const valorCalc = n.valor || 0
      acumulado[key].items.push({
        fecha: n.fecha, vendedor: n.vendedores?.nombre || 'Sin vendedor',
        producto: productosMap[n.sku] || n.sku, cantidad: n.cantidad, motivo: n.motivo, valor: valorCalc,
      })
      acumulado[key].total += valorCalc
    })
    ;(obsequios || []).forEach(o => {
      const key = 'obsequio'
      if (!acumulado[key]) acumulado[key] = { tipo: key, items: [], total: 0 }
      const valorCalc = (o.valor_unitario || 0) * (o.cantidad || 0)
      acumulado[key].items.push({
        fecha: o.fecha, vendedor: o.vendedores?.nombre || 'Sin vendedor',
        producto: productosMap[o.sku] || o.sku, cantidad: o.cantidad, motivo: o.autorizado_por ? `Autorizo: ${o.autorizado_por}` : '', valor: valorCalc,
      })
      acumulado[key].total += valorCalc
    })

    const lista = Object.values(acumulado)
      .map(g => ({ ...g, nombre: TIPOS_NOVEDAD_LABEL[g.tipo] || g.tipo, items: g.items.sort((a, b) => b.fecha.localeCompare(a.fecha)) }))
      .sort((a, b) => b.total - a.total)

    setGrupos(lista)
    setTotalGeneral(lista.filter(g => g.tipo !== 'descuenta_proveedor').reduce((s, g) => s + g.total, 0))
    setCargando(false)
  }

  if (cargando) return <p className="text-gray-400 text-center py-16">Cargando...</p>

  return (
    <>
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
        <p className="text-xs text-gray-500 mb-1">Total en perdidas del mes</p>
        <p className="text-3xl font-black text-brand">{fmt(totalGeneral)}</p>
      </div>

      {grupos.length === 0 ? (
        <p className="text-gray-400 text-center py-8">Sin novedades registradas este mes</p>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
          {grupos.map(g => {
            const abierta = expandido === g.tipo
            return (
              <div key={g.tipo}>
                <button onClick={() => setExpandido(abierta ? null : g.tipo)} className="w-full p-4 flex justify-between items-center text-left">
                  <div>
                    <p className="font-bold text-gray-800 text-sm">{g.nombre}</p>
                    <p className="text-xs text-gray-500">{g.items.length} registro{g.items.length !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-brand">{fmt(g.total)}</p>
                    <p className="text-xs text-gray-400">{abierta ? 'Ocultar ▲' : 'Ver detalle ▼'}</p>
                  </div>
                </button>
                {abierta && (
                  <div className="px-4 pb-4 divide-y divide-gray-50">
                    {g.items.map((it, i) => (
                      <div key={i} className="py-2 flex justify-between items-start">
                        <div>
                          <p className="text-sm text-gray-800">{it.producto} · {it.cantidad} und</p>
                          <p className="text-xs text-gray-400">{it.fecha} · {it.vendedor}{it.motivo ? ` · ${it.motivo}` : ''}</p>
                        </div>
                        <p className="text-sm font-bold text-gray-800">{fmt(it.valor)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
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
  const hoy = new Date(obtenerFechaActual())
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
      .eq('empresa_id', getEmpresaId())
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
