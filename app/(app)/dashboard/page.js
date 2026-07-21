'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { estadoDocumento, proximoMasCercano } from '@/lib/vehiculos-helpers'
import { AreaChart, Area, PieChart, Pie, Cell, ResponsiveContainer, XAxis, Tooltip } from 'recharts'
import {
  CurrencyDollarIcon, BanknotesIcon, TruckIcon, ClipboardDocumentListIcon, BookOpenIcon,
  WrenchScrewdriverIcon, MagnifyingGlassIcon, BellIcon, CalendarIcon,
  ShoppingCartIcon, ArrowsRightLeftIcon, ArrowUturnLeftIcon, ClipboardDocumentCheckIcon,
} from '@heroicons/react/24/outline'
import {
  ClockIcon as ClockIconSolid, ArchiveBoxIcon as ArchiveBoxIconSolid,
  BanknotesIcon as BanknotesIconSolid, TruckIcon as TruckIconSolid,
} from '@heroicons/react/24/solid'
import {
  PageHeader, KPIGrid, MetricCard, ChartCard, DashboardWidget, AlertCard,
  ActivityFeed, QuickActions, StatusBadge, DashboardSection, StatMiniCard,
} from '@/components/ui'

const fmt = (v) => `$${Math.round(v || 0).toLocaleString('es-CO')}`
const fechaISO = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

function bucketCartera(fecha_pago) {
  if (!fecha_pago) return 'alDia'
  const hoy = new Date(obtenerFechaActual())
  const pago = new Date(fecha_pago)
  const dias = Math.floor((hoy - pago) / (24 * 60 * 60 * 1000))
  if (dias <= 0) return 'alDia'
  if (dias <= 15) return 'vencidaReciente'
  return 'vencidaGrave'
}

function tiempoRelativo(timestamp) {
  const t = timestamp.length === 10 ? timestamp + 'T12:00:00' : timestamp
  const diffMs = Date.now() - new Date(t).getTime()
  const min = Math.round(diffMs / 60000)
  if (min < 1) return 'Justo ahora'
  if (min < 60) return `Hace ${min} min`
  const horas = Math.round(min / 60)
  if (horas < 24) return `Hace ${horas} h`
  const dias = Math.round(horas / 24)
  return `Hace ${dias} d`
}

function Donut({ data, size = 140 }) {
  return (
    <div className="flex items-center gap-5">
      <div style={{ width: size, height: size }} className="flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={2} strokeWidth={0}>
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-2 min-w-0">
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
            <span className="text-gray-500 truncate">{d.name}</span>
            <span className="font-bold text-gray-800 ml-auto">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [usuario, setUsuario] = useState(null)
  const [empresaNombre, setEmpresaNombre] = useState('')
  const [rutas, setRutas] = useState([])
  const [rutaId, setRutaId] = useState('')
  const [cargando, setCargando] = useState(true)
  const [datos, setDatos] = useState(null)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    setUsuario(JSON.parse(u))
  }, [])

  useEffect(() => {
    if (usuario) cargar()
  }, [usuario, rutaId])

  const cargar = async () => {
    setCargando(true)
    const empresaIdActual = getEmpresaId()
    const hoy = obtenerFechaActual()
    const ayer = fechaISO(new Date(hoy + 'T12:00:00').getTime() - 24 * 60 * 60 * 1000)
    const hace30 = fechaISO(new Date(hoy + 'T12:00:00').getTime() - 30 * 24 * 60 * 60 * 1000)
    const hace60 = fechaISO(new Date(hoy + 'T12:00:00').getTime() - 60 * 24 * 60 * 60 * 1000)
    const hace3d = fechaISO(new Date(hoy + 'T12:00:00').getTime() - 3 * 24 * 60 * 60 * 1000)

    const [
      { data: empresa },
      { data: rutasData },
      { data: despachos60 },
      { data: liquidaciones60 },
      { data: movimientosHoy },
      { data: carteraPendiente },
      { data: carteraPagadaReciente },
      { data: productos },
      { data: conteos },
      { data: vehiculosData },
      { data: vehiculosDocs },
      { data: vehiculosMants },
      { data: comprasRecientes },
      { data: proveedores },
    ] = await Promise.all([
      supabase.from('empresas').select('nombre').eq('id', empresaIdActual).single(),
      supabase.from('rutas').select('id, nombre').eq('estado', true).eq('empresa_id', empresaIdActual).order('nombre'),
      supabase.from('despachos_encab').select('id, fecha, ruta_id, estado, created_at, rutas(nombre)').gte('fecha', hace60).lte('fecha', hoy).eq('empresa_id', empresaIdActual),
      supabase.from('liquidaciones').select('fecha, sku, vendido_neto, efectivo_esperado, despacho_id').gte('fecha', hace60).lte('fecha', hoy).eq('empresa_id', empresaIdActual),
      supabase.from('movimientos_tesoreria').select('monto, tipo').eq('fecha', hoy).eq('empresa_id', empresaIdActual),
      supabase.from('cartera_fiados').select('saldo, fecha_pago, ruta_id, nombre_cliente').eq('estado', 'pendiente').eq('empresa_id', empresaIdActual),
      supabase.from('cartera_fiados').select('nombre_cliente, saldo, fecha_pagado, ruta_id, rutas(nombre)').eq('estado', 'pagado').gte('fecha_pagado', hace3d).eq('empresa_id', empresaIdActual).order('fecha_pagado', { ascending: false }),
      supabase.from('productos').select('sku, nombre, stock_minimo').eq('estado', true).eq('empresa_id', empresaIdActual),
      supabase.from('conteo_fisico').select('sku, fecha, cantidad_fisica').eq('empresa_id', empresaIdActual).order('fecha', { ascending: false }),
      supabase.from('vehiculos').select('id, placa, marca, modelo, estado, ruta_id, kilometraje_actual').eq('empresa_id', empresaIdActual),
      supabase.from('vehiculos_documentos').select('vehiculo_id, tipo, fecha_vencimiento').eq('empresa_id', empresaIdActual),
      supabase.from('vehiculos_mantenimientos').select('vehiculo_id, tipo, km_proximo, fecha').eq('empresa_id', empresaIdActual),
      supabase.from('compras').select('fecha, proveedor_id, total').gte('fecha', hace3d).eq('empresa_id', empresaIdActual),
      supabase.from('proveedores').select('id, nombre').eq('empresa_id', empresaIdActual),
    ])

    setEmpresaNombre(empresa?.nombre || '')
    setRutas(rutasData || [])

    // ---- inventario (global, no se filtra por ruta) ----
    const stockPorSku = {}
    ;(conteos || []).forEach(c => { if (!(c.sku in stockPorSku)) stockPorSku[c.sku] = { cantidad: c.cantidad_fisica, fecha: c.fecha } })
    const fechaMinima = Object.values(stockPorSku).reduce((min, c) => (!min || c.fecha < min) ? c.fecha : min, null)
    let compradoPorSku = {}, salidaPorSku = {}, despachadoPorSku = {}
    if (fechaMinima) {
      const [{ data: movimientos }, { data: detalles }] = await Promise.all([
        supabase.from('inventario_mov').select('sku, cantidad, fecha, tipo_movimiento').eq('empresa_id', empresaIdActual).in('tipo_movimiento', ['entrada', 'salida']).gte('fecha', fechaMinima),
        supabase.from('despachos_detalle').select('sku, total, despacho_id').eq('empresa_id', empresaIdActual),
      ])
      ;(movimientos || []).forEach(m => {
        const info = stockPorSku[m.sku]
        if (!info || m.fecha < info.fecha) return
        const destino = m.tipo_movimiento === 'entrada' ? compradoPorSku : salidaPorSku
        destino[m.sku] = (destino[m.sku] || 0) + (m.cantidad || 0)
      })
      const idsDespachos = [...new Set((detalles || []).map(d => d.despacho_id))]
      let encabPorId = {}
      if (idsDespachos.length > 0) {
        const { data: encabs } = await supabase.from('despachos_encab').select('id, fecha, estado').in('id', idsDespachos).gte('fecha', fechaMinima).neq('estado', 'cancelado')
        ;(encabs || []).forEach(e => { encabPorId[e.id] = e })
      }
      ;(detalles || []).forEach(d => {
        const encab = encabPorId[d.despacho_id]
        if (!encab) return
        const info = stockPorSku[d.sku]
        if (!info || encab.fecha < info.fecha) return
        despachadoPorSku[d.sku] = (despachadoPorSku[d.sku] || 0) + (d.total || 0)
      })
    }
    let enStock = 0, stockBajo = 0, agotados = 0, sinConteo = 0
    ;(productos || []).forEach(p => {
      const info = stockPorSku[p.sku]
      const stockActual = info ? info.cantidad + (compradoPorSku[p.sku] || 0) - (salidaPorSku[p.sku] || 0) - (despachadoPorSku[p.sku] || 0) : null
      if (stockActual === null) sinConteo++
      else if (stockActual <= 0) agotados++
      else if ((p.stock_minimo || 0) > 0 && stockActual < p.stock_minimo) stockBajo++
      else enStock++
    })
    const conteoHoyRegistrado = (conteos || []).some(c => c.fecha === hoy)

    // ---- ventas / despachos (filtrable por ruta vía despacho_id -> ruta_id) ----
    const despachoRutaMap = {}
    ;(despachos60 || []).forEach(d => { despachoRutaMap[d.id] = d.ruta_id })
    const liqFiltradas = rutaId ? (liquidaciones60 || []).filter(l => despachoRutaMap[l.despacho_id] === rutaId) : (liquidaciones60 || [])
    const despachosFiltrados = rutaId ? (despachos60 || []).filter(d => d.ruta_id === rutaId) : (despachos60 || [])

    const ventasHoy = liqFiltradas.filter(l => l.fecha === hoy).reduce((s, l) => s + (l.efectivo_esperado || 0), 0)
    const ventasAyer = liqFiltradas.filter(l => l.fecha === ayer).reduce((s, l) => s + (l.efectivo_esperado || 0), 0)
    const ventasUlt30 = liqFiltradas.filter(l => l.fecha >= hace30).reduce((s, l) => s + (l.efectivo_esperado || 0), 0)
    const ventasPrev30 = liqFiltradas.filter(l => l.fecha >= hace60 && l.fecha < hace30).reduce((s, l) => s + (l.efectivo_esperado || 0), 0)
    const variacion30 = ventasPrev30 > 0 ? ((ventasUlt30 - ventasPrev30) / ventasPrev30) * 100 : null

    const dias30 = Array.from({ length: 30 }, (_, i) => fechaISO(new Date(hoy + 'T12:00:00').getTime() - (29 - i) * 24 * 60 * 60 * 1000))
    const ventasPorDia = {}
    liqFiltradas.forEach(l => { ventasPorDia[l.fecha] = (ventasPorDia[l.fecha] || 0) + (l.efectivo_esperado || 0) })
    const chartVentas = dias30.map(f => ({ fecha: f.slice(5), valor: ventasPorDia[f] || 0 }))

    const despachosHoyCount = despachosFiltrados.filter(d => d.fecha === hoy && ['despachado', 'liquidado'].includes(d.estado)).length
    const despachosAyerCount = despachosFiltrados.filter(d => d.fecha === ayer && ['despachado', 'liquidado'].includes(d.estado)).length
    const variacionDespachos = despachosAyerCount > 0 ? ((despachosHoyCount - despachosAyerCount) / despachosAyerCount) * 100 : null

    const rutasFiltradas = rutaId ? rutasData.filter(r => r.id === rutaId) : (rutasData || [])
    const rutaIdsConDespachoHoy = new Set((despachos60 || []).filter(d => d.fecha === hoy && d.estado !== 'cancelado').map(d => d.ruta_id))
    const rutasPorDespachar = rutasFiltradas.filter(r => !rutaIdsConDespachoHoy.has(r.id)).length

    const productosMap = {}
    ;(productos || []).forEach(p => { productosMap[p.sku] = p.nombre })
    const vendidoPorSku = {}
    liqFiltradas.filter(l => l.fecha >= hace30).forEach(l => { vendidoPorSku[l.sku] = (vendidoPorSku[l.sku] || 0) + (l.vendido_neto || 0) })
    const topProductos = Object.entries(vendidoPorSku)
      .map(([sku, cantidad]) => ({ sku, nombre: productosMap[sku] || sku, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5)
    const maxProducto = topProductos[0]?.cantidad || 1

    // ---- recaudo (global) ----
    const recaudoHoy = (movimientosHoy || []).filter(m => m.tipo === 'entrada').reduce((s, m) => s + (m.monto || 0), 0)

    // ---- placeholders de modulos futuros (hoja de ruta de MaissyPos, aun no existen las tablas) ----
    // Cuando exista un modulo de Pedidos, reemplazar por un conteo real de pedidos en estado pendiente.
    const pedidosPendientes = 0
    // Cuando exista un modulo CRM de Clientes, reemplazar por un conteo real de clientes nuevos del periodo.
    const clientesNuevos = 0

    // ---- cartera (filtrable por ruta_id directo) ----
    const carteraFiltrada = rutaId ? (carteraPendiente || []).filter(f => f.ruta_id === rutaId) : (carteraPendiente || [])
    const totalCartera = carteraFiltrada.reduce((s, f) => s + (f.saldo || 0), 0)
    const bucketsCartera = { alDia: 0, vencidaReciente: 0, vencidaGrave: 0 }
    carteraFiltrada.forEach(f => { bucketsCartera[bucketCartera(f.fecha_pago)]++ })
    const carteraVencidaCount = bucketsCartera.vencidaReciente + bucketsCartera.vencidaGrave

    // ---- vehiculos (filtrable por ruta_id directo) ----
    const vehiculosFiltrados = rutaId ? (vehiculosData || []).filter(v => v.ruta_id === rutaId) : (vehiculosData || [])
    const totalVehiculos = vehiculosFiltrados.length
    const vehActivos = vehiculosFiltrados.filter(v => v.estado === 'activo').length
    const vehEnTaller = vehiculosFiltrados.filter(v => v.estado === 'en_taller').length
    const vehFueraServicio = vehiculosFiltrados.filter(v => v.estado === 'fuera_de_servicio').length
    const pctDisponible = totalVehiculos > 0 ? Math.round((vehActivos / totalVehiculos) * 100) : 0

    const vehiculoIdsFiltrados = new Set(vehiculosFiltrados.map(v => v.id))
    const docsFiltrados = (vehiculosDocs || []).filter(d => vehiculoIdsFiltrados.has(d.vehiculo_id))
    const docsPorVencerCount = docsFiltrados.filter(d => ['vencido', 'por_vencer'].includes(estadoDocumento(d.fecha_vencimiento).status)).length

    const mantsPorVehiculo = {}
    ;(vehiculosMants || []).forEach(m => { if (!mantsPorVehiculo[m.vehiculo_id]) mantsPorVehiculo[m.vehiculo_id] = []; mantsPorVehiculo[m.vehiculo_id].push(m) })
    const proximosMantenimientos = vehiculosFiltrados
      .map(v => { const prox = proximoMasCercano(mantsPorVehiculo[v.id] || [], v.kilometraje_actual); return prox ? { ...prox, vehiculo: v } : null })
      .filter(Boolean)
      .sort((a, b) => a.restante - b.restante)
      .slice(0, 5)

    // ---- actividad reciente ----
    const proveedoresMap = {}
    ;(proveedores || []).forEach(p => { proveedoresMap[p.id] = p.nombre })
    const actividad = []
    despachosFiltrados.filter(d => d.fecha >= hace3d && d.created_at).forEach(d => {
      actividad.push({ id: `desp-${d.id}`, icon: TruckIcon, tone: 'blue', title: `Despacho creado en ${d.rutas?.nombre || 'ruta'}`, timestamp: d.created_at })
      if (d.estado === 'liquidado') actividad.push({ id: `liq-${d.id}`, icon: CurrencyDollarIcon, tone: 'green', title: `Liquidación completada en ${d.rutas?.nombre || 'ruta'}`, timestamp: d.created_at })
    })
    ;(carteraPagadaReciente || []).filter(f => !rutaId || f.ruta_id === rutaId).forEach((f, i) => {
      actividad.push({ id: `cart-${i}-${f.fecha_pagado}`, icon: BookOpenIcon, tone: 'purple', title: `Pago de cartera registrado — ${f.nombre_cliente}`, description: f.rutas?.nombre, timestamp: f.fecha_pagado })
    })
    if (!rutaId) {
      const comprasPorGrupo = {}
      ;(comprasRecientes || []).forEach(c => {
        const key = `${c.fecha}-${c.proveedor_id}`
        if (!comprasPorGrupo[key]) comprasPorGrupo[key] = { fecha: c.fecha, proveedor_id: c.proveedor_id, total: 0 }
        comprasPorGrupo[key].total += (c.total || 0)
      })
      Object.values(comprasPorGrupo).forEach((c, i) => {
        actividad.push({ id: `compra-${i}-${c.fecha}`, icon: ShoppingCartIcon, tone: 'amber', title: `Compra registrada — ${proveedoresMap[c.proveedor_id] || 'proveedor'}`, description: fmt(c.total), timestamp: c.fecha })
      })
    }
    actividad.sort((a, b) => new Date(b.timestamp.length === 10 ? b.timestamp + 'T12:00:00' : b.timestamp) - new Date(a.timestamp.length === 10 ? a.timestamp + 'T12:00:00' : a.timestamp))
    const actividadTop = actividad.slice(0, 8).map(a => ({ ...a, timestamp: tiempoRelativo(a.timestamp) }))

    const totalAlertas = docsPorVencerCount + (stockBajo + agotados) + carteraVencidaCount + rutasPorDespachar + (conteoHoyRegistrado ? 0 : 1)
    // Nota: pedidosPendientes/clientesNuevos son placeholders (ver comentario mas arriba) -- no suman a totalAlertas ni a Centro de alertas, no son alertas reales.

    setDatos({
      hoy, fechaLegible: new Date(hoy + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }),
      ventasHoy, ventasAyer, chartVentas, ventasUlt30, variacion30,
      recaudoHoy,
      despachosHoyCount, variacionDespachos,
      rutasPorDespachar, rutasActivasTotal: rutasFiltradas.length,
      totalCartera, carteraCuentas: carteraFiltrada.length, bucketsCartera,
      enStock, stockBajo, agotados, sinConteo, conteoHoyRegistrado,
      totalVehiculos, vehActivos, vehEnTaller, vehFueraServicio, pctDisponible,
      docsPorVencerCount, proximosMantenimientos,
      topProductos, maxProducto,
      actividadTop, totalAlertas,
      pedidosPendientes, clientesNuevos,
    })
    setCargando(false)
  }

  if (!usuario) return null

  const primerNombre = (usuario.nombre || '').split(' ')[0]
  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div>
      <PageHeader
        showBack={false}
        title={`¡${saludo}, ${primerNombre}! 👋`}
        subtitle={`Así va la operación de ${empresaNombre || 'tu empresa'} hoy.`}
        actions={
          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap">
            <span className="hidden sm:flex items-center gap-2 border-2 border-gray-200 bg-gray-50 rounded-xl px-3 py-2 text-sm text-gray-500">
              <CalendarIcon className="w-4 h-4" /> {datos?.fechaLegible || 'Hoy'}
            </span>
            <select value={rutaId} onChange={e => setRutaId(e.target.value)}
              className="flex-1 min-w-0 sm:flex-initial border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 bg-white focus:border-brand focus:outline-none">
              <option value="">Todas las rutas</option>
              {rutas.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
            <button title="Próximamente" className="w-9 h-9 rounded-xl border-2 border-gray-200 flex items-center justify-center text-gray-400 cursor-default flex-shrink-0">
              <MagnifyingGlassIcon className="w-4 h-4" />
            </button>
            <button title="Próximamente" className="relative w-9 h-9 rounded-xl border-2 border-gray-200 flex items-center justify-center text-gray-400 cursor-default flex-shrink-0">
              <BellIcon className="w-4 h-4" />
              {datos?.totalAlertas > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-brand text-white text-[10px] font-bold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center">
                  {datos.totalAlertas > 9 ? '9+' : datos.totalAlertas}
                </span>
              )}
            </button>
          </div>
        }
      />

      {cargando || !datos ? (
        <p className="text-gray-400 text-center py-16">Cargando...</p>
      ) : (
        <div className="p-6 max-w-[1400px] mx-auto flex flex-col gap-5">
          <KPIGrid columns={6}>
            <MetricCard label="Ventas del día" value={fmt(datos.ventasHoy)} icon={CurrencyDollarIcon} tone="brand"
              trend={datos.ventasAyer > 0 ? `${(((datos.ventasHoy - datos.ventasAyer) / datos.ventasAyer) * 100).toFixed(1)}% vs ayer` : 'Sin datos de ayer'}
              trendDirection={datos.ventasAyer > 0 ? (datos.ventasHoy >= datos.ventasAyer ? 'up' : 'down') : undefined} />
            <MetricCard label="Recaudo del día" value={fmt(datos.recaudoHoy)} icon={BanknotesIcon} tone="green" trend="Caja y bancos" />
            <MetricCard label="Despachos realizados" value={datos.despachosHoyCount} icon={TruckIcon} tone="blue"
              trend={datos.variacionDespachos !== null ? `${datos.variacionDespachos.toFixed(1)}% vs ayer` : 'Sin datos de ayer'}
              trendDirection={datos.variacionDespachos !== null ? (datos.variacionDespachos >= 0 ? 'up' : 'down') : undefined} />
            <MetricCard label="Rutas por despachar" value={datos.rutasPorDespachar} icon={ClipboardDocumentListIcon} tone="amber"
              trend={`de ${datos.rutasActivasTotal} ${datos.rutasActivasTotal === 1 ? 'ruta activa' : 'rutas activas'}`} />
            <MetricCard label="Cartera por cobrar" value={fmt(datos.totalCartera)} icon={BookOpenIcon} tone="purple"
              trend={`${datos.carteraCuentas} cuentas pendientes`} />
            <MetricCard label="Vehículos activos" value={`${datos.vehActivos} / ${datos.totalVehiculos}`} icon={WrenchScrewdriverIcon} tone="green"
              trend={`${datos.pctDisponible}% disponibles`} />
          </KPIGrid>

          <DashboardSection title="Próximamente en MaissyPos" subtitle="Se activan automáticamente cuando se implemente el módulo correspondiente">
            <KPIGrid columns={2}>
              <StatMiniCard label="Pedidos pendientes" value={datos.pedidosPendientes} />
              <StatMiniCard label="Clientes nuevos" value={datos.clientesNuevos} />
            </KPIGrid>
          </DashboardSection>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2">
              <ChartCard title="Ventas últimos 30 días" subtitle={datos.variacion30 !== null ? `${fmt(datos.ventasUlt30)} · ${datos.variacion30 >= 0 ? '▲' : '▼'} ${Math.abs(datos.variacion30).toFixed(1)}% vs periodo anterior` : fmt(datos.ventasUlt30)} height={240}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={datos.chartVentas}>
                    <defs>
                      <linearGradient id="ventasGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#C41230" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#C41230" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval={4} />
                    <Tooltip formatter={(v) => fmt(v)} />
                    <Area type="monotone" dataKey="valor" stroke="#C41230" strokeWidth={2} fill="url(#ventasGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
            <DashboardWidget title="Productos más vendidos" subtitle="Últimos 30 días">
              {datos.topProductos.length === 0 ? (
                <p className="text-gray-400 text-sm">Sin ventas registradas</p>
              ) : datos.topProductos.map(p => (
                <div key={p.sku} className="mb-3 last:mb-0">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-700 font-semibold truncate">{p.nombre}</span>
                    <span className="text-gray-500 flex-shrink-0 ml-2">{p.cantidad} und</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand rounded-full" style={{ width: `${Math.max(4, (p.cantidad / datos.maxProducto) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </DashboardWidget>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <ChartCard title="Estado de inventario" height="auto">
              <Donut data={[
                { name: 'En stock', value: datos.enStock, color: '#22c55e' },
                { name: 'Stock bajo', value: datos.stockBajo, color: '#f59e0b' },
                { name: 'Agotados', value: datos.agotados, color: '#ef4444' },
                { name: 'Sin conteo', value: datos.sinConteo, color: '#9ca3af' },
              ]} />
            </ChartCard>
            <ChartCard title="Estado de cartera" height="auto">
              <Donut data={[
                { name: 'Al día', value: datos.bucketsCartera.alDia, color: '#22c55e' },
                { name: 'Vencida (1-15 días)', value: datos.bucketsCartera.vencidaReciente, color: '#f59e0b' },
                { name: 'Vencida (+15 días)', value: datos.bucketsCartera.vencidaGrave, color: '#ef4444' },
              ]} />
            </ChartCard>
            <DashboardWidget title="Vehículos en operación"
              footer={<a href="/vehiculos" className="text-xs font-semibold text-brand hover:text-brand-dark">Ver flota completa →</a>}>
              <Donut size={110} data={[
                { name: 'Activo', value: datos.vehActivos, color: '#22c55e' },
                { name: 'En taller', value: datos.vehEnTaller, color: '#f59e0b' },
                { name: 'Fuera de servicio', value: datos.vehFueraServicio, color: '#ef4444' },
              ]} />
            </DashboardWidget>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <DashboardWidget title="Centro de alertas" className="lg:col-span-1">
              <div className="flex flex-col gap-4">
                {datos.docsPorVencerCount > 0 && (
                  <AlertCard icon={ClockIconSolid} tone="red" title={`${datos.docsPorVencerCount} documentos por vencer`} description="SOAT, tecnomecánica, seguros" />
                )}
                {(datos.stockBajo + datos.agotados) > 0 && (
                  <AlertCard icon={ArchiveBoxIconSolid} tone="amber" title={`${datos.stockBajo + datos.agotados} productos con stock bajo`} description="Requieren reposición" />
                )}
                {datos.totalCartera > 0 && (datos.bucketsCartera.vencidaReciente + datos.bucketsCartera.vencidaGrave) > 0 && (
                  <AlertCard icon={BanknotesIconSolid} tone="red" title={`${datos.bucketsCartera.vencidaReciente + datos.bucketsCartera.vencidaGrave} cuentas de cartera vencidas`} description={`Por valor de ${fmt(datos.totalCartera)}`} />
                )}
                {datos.rutasPorDespachar > 0 && (
                  <AlertCard icon={TruckIconSolid} tone="blue" title={`${datos.rutasPorDespachar} rutas sin despachar`} description="Revisar y programar despacho" />
                )}
                {!datos.conteoHoyRegistrado && (
                  <AlertCard icon={ClipboardDocumentCheckIcon} tone="gray" title="Conteo de hoy pendiente" description="Aún no se ha registrado el conteo físico de hoy" />
                )}
                {datos.totalAlertas === 0 && <p className="text-gray-400 text-sm">Sin alertas por ahora</p>}
              </div>
            </DashboardWidget>
            <DashboardWidget title="Actividad reciente">
              <ActivityFeed items={datos.actividadTop} emptyState={<p className="text-gray-400 text-sm">Sin actividad reciente</p>} />
            </DashboardWidget>
            <DashboardWidget title="Acciones rápidas">
              <QuickActions actions={[
                { label: 'Despachar', icon: TruckIcon, href: '/despacho', tone: 'blue' },
                { label: 'Liquidar', icon: CurrencyDollarIcon, href: '/liquidacion', tone: 'green' },
                { label: 'Nueva compra', icon: ShoppingCartIcon, href: '/compras', tone: 'amber' },
                { label: 'Conteo diario', icon: ClipboardDocumentCheckIcon, href: '/conteo', tone: 'brand' },
                { label: 'Cambios', icon: ArrowsRightLeftIcon, href: '/cambios', tone: 'purple' },
                { label: 'Devoluciones', icon: ArrowUturnLeftIcon, href: '/devoluciones', tone: 'default' },
              ]} />
            </DashboardWidget>
          </div>

          <DashboardWidget title="Próximos mantenimientos" footer={<a href="/vehiculos" className="text-xs font-semibold text-brand hover:text-brand-dark">Ver todos →</a>}>
            {datos.proximosMantenimientos.length === 0 ? (
              <p className="text-gray-400 text-sm">Sin mantenimientos próximos</p>
            ) : (
              <div className="flex flex-col gap-3">
                {datos.proximosMantenimientos.map((m, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <TruckIcon className="w-5 h-5 text-gray-400" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{m.vehiculo.placa} · {m.vehiculo.marca}</p>
                        <p className="text-xs text-gray-500 truncate">{m.tipo}</p>
                      </div>
                    </div>
                    <StatusBadge status={m.restante <= 0 ? 'vencido' : 'por_vencer'} label={m.restante <= 0 ? 'Ya se cumplió' : `En ${Math.round(m.restante).toLocaleString('es-CO')} km`} />
                  </div>
                ))}
              </div>
            )}
          </DashboardWidget>
        </div>
      )}
    </div>
  )
}
