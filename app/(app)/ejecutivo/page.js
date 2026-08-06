'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { estadoDocumento, proximoMasCercano } from '@/lib/vehiculos-helpers'
import Stepper from '@/components/Stepper'
import { PageHeader, AlertCard } from '@/components/ui'
import {
  ArrowsRightLeftIcon as ArrowsRightLeftIconSolid,
  ArchiveBoxIcon as ArchiveBoxIconSolid,
  BanknotesIcon as BanknotesIconSolid,
  ClockIcon as ClockIconSolid,
  TruckIcon as TruckIconSolid,
} from '@heroicons/react/24/solid'
import { ClipboardDocumentCheckIcon, TruckIcon } from '@heroicons/react/24/outline'

const UMBRAL_ALERTA_DIFERENCIA = 50000

const ALERTA_ADMIN_META = {
  transferencia_rechazada: { icon: ArrowsRightLeftIconSolid, tone: 'red', desc: 'Transferencia rechazada por el vendedor', href: '/transferencias' },
  transferencia_pendiente: { icon: ArrowsRightLeftIconSolid, tone: 'amber', desc: 'Transferencia de mercancia pendiente de confirmar', href: '/transferencias' },
  descuadre_conteo: { icon: ArchiveBoxIconSolid, tone: 'amber', desc: 'El conteo no coincide con el inventario', href: '/conteo' },
  descuadre_caja: { icon: BanknotesIconSolid, tone: 'red', desc: 'Diferencia de caja al cerrar una liquidacion', href: '/liquidacion' },
}

export default function Ejecutivo() {
  const [usuario, setUsuario] = useState(null)
  const [fecha, setFecha] = useState(obtenerFechaActual())
  const [resumen, setResumen] = useState([])
  const [totales, setTotales] = useState({ ventas: 0, unidades: 0, gastos: 0, fiados: 0, transferencias: 0, efectivo: 0 })
  const [alertas, setAlertas] = useState([])
  const [topProductos, setTopProductos] = useState([])
  const [ventasSemanaPasada, setVentasSemanaPasada] = useState(0)
  const [gastosPorCategoria, setGastosPorCategoria] = useState([])
  const [fiadosNuevosDia, setFiadosNuevosDia] = useState(0)
  const [cargando, setCargando] = useState(true)

  const [cargandoGlobal, setCargandoGlobal] = useState(true)
  const [resumenMes, setResumenMes] = useState({ ventas: 0, gastos: 0, margen: 0 })
  const [carteraPendiente, setCarteraPendiente] = useState(0)
  const [fiadosPorVencer, setFiadosPorVencer] = useState([])
  const [alertasStock, setAlertasStock] = useState([])
  const [ventasMostradorDia, setVentasMostradorDia] = useState(0)
  const [alertasAdmin, setAlertasAdmin] = useState([])
  const [docsPorVencerCount, setDocsPorVencerCount] = useState(0)
  const [proximosMantenimientos, setProximosMantenimientos] = useState([])
  const [rutasSinDespachar, setRutasSinDespachar] = useState(0)
  const [conteoHoyPendiente, setConteoHoyPendiente] = useState(false)

  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (parsed.rol !== 'admin') { router.push('/despacho'); return }
    setUsuario(parsed)
    cargarDatos(fecha)
    cargarResumenGlobal()
  }, [])

  const cargarResumenGlobal = async () => {
    setCargandoGlobal(true)
    const hoy = obtenerFechaActual()
    const inicioMes = hoy.slice(0, 7) + '-01'
    const en7dias = new Date(new Date(hoy + 'T12:00:00').getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

    const [
      { data: liqMes },
      { data: gastosRutaMes },
      { data: gastosAdminMes },
      { data: ventasMostradorMes },
      { data: carteraTotal },
      { data: fiadosPorVencerData },
      { data: productos },
      { data: conteos },
      { data: alertasAdminData },
      { data: rutasActivas },
      { data: despachosHoyData },
      { data: vehiculosData },
      { data: vehiculosDocs },
      { data: vehiculosMants },
    ] = await Promise.all([
      supabase.from('liquidaciones').select('efectivo_esperado').gte('fecha', inicioMes).lte('fecha', hoy).eq('empresa_id', getEmpresaId()),
      supabase.from('liquidaciones_gastos').select('valor').gte('fecha', inicioMes).lte('fecha', hoy).eq('empresa_id', getEmpresaId()),
      supabase.from('gastos_admin').select('valor').gte('fecha', inicioMes).lte('fecha', hoy).eq('empresa_id', getEmpresaId()),
      supabase.from('ventas_encab').select('total').gte('fecha', inicioMes).lte('fecha', hoy).eq('empresa_id', getEmpresaId()),
      supabase.from('cartera_fiados').select('saldo').eq('estado', 'pendiente').eq('empresa_id', getEmpresaId()),
      supabase.from('cartera_fiados').select('*, vendedores(nombre)').eq('estado', 'pendiente').gte('fecha_pago', hoy).lte('fecha_pago', en7dias).eq('empresa_id', getEmpresaId()).order('fecha_pago'),
      supabase.from('productos').select('sku, nombre, stock_minimo').eq('estado', true).gt('stock_minimo', 0).eq('empresa_id', getEmpresaId()).order('nombre'),
      supabase.from('conteo_fisico').select('sku, fecha, cantidad_fisica, created_at').eq('empresa_id', getEmpresaId()).order('fecha', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('alertas_admin').select('id, tipo, mensaje, created_at').eq('leida', false).eq('empresa_id', getEmpresaId()).order('created_at', { ascending: false }),
      supabase.from('rutas').select('id').eq('estado', true).eq('empresa_id', getEmpresaId()),
      supabase.from('despachos_encab').select('ruta_id').eq('fecha', hoy).neq('estado', 'cancelado').eq('empresa_id', getEmpresaId()),
      supabase.from('vehiculos').select('id, placa, marca, kilometraje_actual').eq('empresa_id', getEmpresaId()),
      supabase.from('vehiculos_documentos').select('vehiculo_id, tipo, fecha_vencimiento').eq('empresa_id', getEmpresaId()),
      supabase.from('vehiculos_mantenimientos').select('vehiculo_id, tipo, km_proximo, fecha').eq('empresa_id', getEmpresaId()),
    ])
    setAlertasAdmin(alertasAdminData || [])

    const rutaIdsConDespachoHoy = new Set((despachosHoyData || []).map(d => d.ruta_id))
    setRutasSinDespachar((rutasActivas || []).filter(r => !rutaIdsConDespachoHoy.has(r.id)).length)
    setConteoHoyPendiente(!(conteos || []).some(c => c.fecha === hoy))

    setDocsPorVencerCount((vehiculosDocs || []).filter(d => ['vencido', 'por_vencer'].includes(estadoDocumento(d.fecha_vencimiento).status)).length)
    const mantsPorVehiculo = {}
    ;(vehiculosMants || []).forEach(m => { if (!mantsPorVehiculo[m.vehiculo_id]) mantsPorVehiculo[m.vehiculo_id] = []; mantsPorVehiculo[m.vehiculo_id].push(m) })
    setProximosMantenimientos(
      (vehiculosData || [])
        .map(v => { const prox = proximoMasCercano(mantsPorVehiculo[v.id] || [], v.kilometraje_actual); return prox ? { ...prox, vehiculo: v } : null })
        .filter(Boolean)
        .sort((a, b) => a.restante - b.restante)
        .slice(0, 5)
    )

    const ventasMes = (liqMes || []).reduce((s, l) => s + (l.efectivo_esperado || 0), 0) + (ventasMostradorMes || []).reduce((s, v) => s + (v.total || 0), 0)
    const gastosMes = (gastosRutaMes || []).reduce((s, g) => s + (g.valor || 0), 0) + (gastosAdminMes || []).reduce((s, g) => s + (g.valor || 0), 0)
    setResumenMes({ ventas: ventasMes, gastos: gastosMes, margen: ventasMes - gastosMes })
    setCarteraPendiente((carteraTotal || []).reduce((s, c) => s + (c.saldo || 0), 0))
    setFiadosPorVencer(fiadosPorVencerData || [])

    const stockPorSku = {}
    ;(conteos || []).forEach(c => { if (!(c.sku in stockPorSku)) stockPorSku[c.sku] = c.cantidad_fisica })
    const bajoMinimo = (productos || [])
      .map(p => ({ ...p, stockActual: stockPorSku[p.sku] ?? 0 }))
      .filter(p => p.stockActual < p.stock_minimo)
    setAlertasStock(bajoMinimo)

    setCargandoGlobal(false)
  }

  const cargarDatos = async (f) => {
    setCargando(true)
    const fechaAnterior = new Date(new Date(f + 'T12:00:00').getTime() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

    const [
      { data: despachos },
      { data: liquidaciones },
      { data: liquidacionesSemanaPasada },
      { data: liqDetalle },
      { data: gastos },
      { data: fiadosNuevos },
      { data: productos },
      { data: ventasMostrador },
    ] = await Promise.all([
      supabase.from('despachos_encab').select('*, rutas(nombre), vendedores(nombre)').eq('fecha', f).eq('empresa_id', getEmpresaId()),
      supabase.from('liquidaciones').select('*').eq('fecha', f).eq('empresa_id', getEmpresaId()),
      supabase.from('liquidaciones').select('efectivo_esperado').eq('fecha', fechaAnterior).eq('empresa_id', getEmpresaId()),
      supabase.from('liquidaciones_detalle').select('*, vendedores(nombre)').eq('fecha', f).eq('empresa_id', getEmpresaId()),
      supabase.from('liquidaciones_gastos').select('categoria, valor').eq('fecha', f).eq('empresa_id', getEmpresaId()),
      supabase.from('cartera_fiados').select('valor_original').eq('fecha_fiado', f).eq('empresa_id', getEmpresaId()),
      supabase.from('productos').select('sku, nombre').eq('empresa_id', getEmpresaId()).order('nombre'),
      supabase.from('ventas_encab').select('total').eq('fecha', f).eq('empresa_id', getEmpresaId()),
    ])

    setVentasMostradorDia((ventasMostrador || []).reduce((s, v) => s + (v.total || 0), 0))

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

      const productosMap = {}
      ;(productos || []).forEach(p => { productosMap[p.sku] = p.nombre })
      const vendidoPorSku = {}
      liquidaciones.forEach(l => { vendidoPorSku[l.sku] = (vendidoPorSku[l.sku] || 0) + (l.vendido_neto || 0) })
      const top3 = Object.entries(vendidoPorSku)
        .map(([sku, cantidad]) => ({ sku, nombre: productosMap[sku] || sku, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 3)
      setTopProductos(top3)
    }

    setAlertas((liqDetalle || []).filter(l => Math.abs(l.diferencia || 0) > UMBRAL_ALERTA_DIFERENCIA))

    setVentasSemanaPasada((liquidacionesSemanaPasada || []).reduce((sum, l) => sum + (l.efectivo_esperado || 0), 0))

    const gastosAgrupados = {}
    ;(gastos || []).forEach(g => {
      const key = g.categoria || 'Sin categoria'
      gastosAgrupados[key] = (gastosAgrupados[key] || 0) + (g.valor || 0)
    })
    setGastosPorCategoria(Object.entries(gastosAgrupados).sort((a, b) => b[1] - a[1]))

    setFiadosNuevosDia((fiadosNuevos || []).reduce((sum, f) => sum + (f.valor_original || 0), 0))

    setCargando(false)
  }

  const cambiarFecha = (f) => {
    setFecha(f)
    cargarDatos(f)
  }

  return (
    <div>
      <PageHeader title="Resumen ejecutivo" subtitle="Maissy Group"
        actions={usuario?.rol === 'admin' && (
          <button onClick={() => router.push('/reportes')} className="bg-brand hover:bg-brand-dark text-white px-3 py-1 rounded-lg text-sm font-bold">Ver Reportes</button>
        )} />

      <div className="p-4 max-w-3xl mx-auto">
        {(alertasAdmin.length > 0 || docsPorVencerCount > 0 || rutasSinDespachar > 0 || conteoHoyPendiente) && (
          <div className="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden">
            <div className="px-4 py-3 bg-brand/5">
              <p className="font-black text-sm text-brand">🔔 Centro de alertas ({alertasAdmin.length + (docsPorVencerCount > 0 ? 1 : 0) + (rutasSinDespachar > 0 ? 1 : 0) + (conteoHoyPendiente ? 1 : 0)})</p>
            </div>
            <div className="divide-y divide-gray-100 px-4">
              {docsPorVencerCount > 0 && (
                <div className="py-2">
                  <AlertCard icon={ClockIconSolid} tone="red" title={`${docsPorVencerCount} documento${docsPorVencerCount > 1 ? 's' : ''} de vehiculo por vencer`} description="SOAT, tecnomecanica, seguros" href="/vehiculos" />
                </div>
              )}
              {rutasSinDespachar > 0 && (
                <div className="py-2">
                  <AlertCard icon={TruckIconSolid} tone="blue" title={`${rutasSinDespachar} ruta${rutasSinDespachar > 1 ? 's' : ''} sin despachar hoy`} description="Revisar y programar despacho" href="/despacho" />
                </div>
              )}
              {conteoHoyPendiente && (
                <div className="py-2">
                  <AlertCard icon={ClipboardDocumentCheckIcon} tone="gray" title="Conteo de hoy pendiente" description="Aun no se ha registrado el conteo fisico de hoy" href="/conteo" />
                </div>
              )}
              {alertasAdmin.map(a => {
                const meta = ALERTA_ADMIN_META[a.tipo] || { icon: ArrowsRightLeftIconSolid, tone: 'red', desc: 'Alerta', href: '/ejecutivo' }
                return (
                  <div key={a.id} className="py-2">
                    <AlertCard icon={meta.icon} tone={meta.tone} title={a.mensaje} description={meta.desc} href={meta.href} />
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {proximosMantenimientos.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden">
            <div className="px-4 py-3 bg-brand/5 flex justify-between items-center">
              <p className="font-black text-sm text-brand">Proximos mantenimientos</p>
              <a href="/vehiculos" className="text-xs font-semibold text-brand hover:text-brand-dark">Ver todos →</a>
            </div>
            <div className="divide-y divide-gray-100 px-4">
              {proximosMantenimientos.map((m, i) => (
                <div key={i} className="py-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <TruckIcon className="w-5 h-5 text-gray-400" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{m.vehiculo.placa} · {m.vehiculo.marca}</p>
                      <p className="text-xs text-gray-500 truncate">{m.tipo}</p>
                    </div>
                  </div>
                  <p className={`text-xs font-bold px-2 py-1 rounded-lg ${m.restante <= 0 ? 'bg-brand/10 text-brand' : 'bg-amber-100 text-amber-700'}`}>
                    {m.restante <= 0 ? 'Ya se cumplio' : `En ${Math.round(m.restante).toLocaleString('es-CO')} km`}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {alertas.length > 0 && (
          <div className="bg-brand text-white rounded-2xl p-4 mb-4 shadow-sm">
            <p className="font-black mb-2">⚠ Diferencias mayores a ${UMBRAL_ALERTA_DIFERENCIA.toLocaleString('es-CO')}</p>
            {alertas.map((a, i) => (
              <p key={i} className="text-sm">
                {a.vendedores?.nombre || 'Vendedor'}: {a.diferencia >= 0 ? '+' : ''}${(a.diferencia || 0).toLocaleString('es-CO')}
              </p>
            ))}
          </div>
        )}

        {cargandoGlobal ? (
          <div className="text-center py-8 text-gray-400">Cargando resumen...</div>
        ) : (
          <>
            <p className="text-xs font-black uppercase tracking-wide text-gray-500 mb-2">Resumen del mes en curso</p>
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
              <div className="bg-white rounded-2xl p-3 sm:p-5 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Ventas</p>
                <p className="text-sm sm:text-lg font-black text-gray-900">${resumenMes.ventas.toLocaleString('es-CO')}</p>
              </div>
              <div className="bg-white rounded-2xl p-3 sm:p-5 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Gastos</p>
                <p className="text-sm sm:text-lg font-black text-brand">${resumenMes.gastos.toLocaleString('es-CO')}</p>
              </div>
              <div className="bg-white rounded-2xl p-3 sm:p-5 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Margen</p>
                <p className="text-sm sm:text-lg font-black text-gray-900">${resumenMes.margen.toLocaleString('es-CO')}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-3 sm:p-5 shadow-sm mb-4">
              <p className="text-xs text-gray-500 mb-1">Cartera pendiente total</p>
              <p className="text-lg sm:text-2xl font-black text-brand">${carteraPendiente.toLocaleString('es-CO')}</p>
            </div>

            {fiadosPorVencer.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden">
                <div className="px-4 py-3 bg-brand/5">
                  <p className="font-black text-sm text-brand">Fiados por vencer esta semana</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {fiadosPorVencer.map(f => (
                    <div key={f.id} className="px-4 py-2 flex justify-between items-center">
                      <div>
                        <p className="text-sm text-gray-800 font-medium">{f.nombre_cliente}</p>
                        <p className="text-xs text-gray-400">{f.vendedores?.nombre || 'Sin vendedor'} · Vence: {f.fecha_pago}</p>
                      </div>
                      <p className="text-sm font-bold text-gray-800">${(f.saldo || 0).toLocaleString('es-CO')}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {alertasStock.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden">
                <div className="px-4 py-3 bg-brand/5">
                  <p className="font-black text-sm text-brand">⚠ Stock bajo el minimo</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {alertasStock.map(p => (
                    <div key={p.sku} className="px-4 py-2 flex justify-between items-center">
                      <p className="text-sm text-gray-800">{p.nombre}</p>
                      <p className="text-sm font-bold text-brand">{p.stockActual} / {p.stock_minimo} min</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex items-center gap-3 mb-4 mt-2">
          <input type="date" value={fecha} onChange={e => cambiarFecha(e.target.value)}
            className="border-2 border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
          <p className="text-gray-500 text-sm">{new Date(fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>

        {ventasMostradorDia > 0 && (
          <div className="bg-white rounded-2xl p-3 sm:p-5 shadow-sm mb-4 flex justify-between items-center">
            <p className="text-xs text-gray-500">Ventas mostrador (Ventas)</p>
            <p className="text-lg sm:text-xl font-black text-gray-900">${ventasMostradorDia.toLocaleString('es-CO')}</p>
          </div>
        )}

        {cargando ? (
          <div className="text-center py-16 text-gray-400">Cargando...</div>
        ) : resumen.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <p className="text-gray-500">No hay despachos registrados para esta fecha</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4">
              <div className="bg-white rounded-2xl p-3 sm:p-5 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Ventas del dia</p>
                <p className="text-lg sm:text-2xl font-black text-gray-900">${totales.ventas.toLocaleString('es-CO')}</p>
              </div>
              <div className="bg-white rounded-2xl p-3 sm:p-5 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Despachado</p>
                <p className="text-lg sm:text-2xl font-black text-gray-900">${totales.despachado?.toLocaleString('es-CO')}</p>
              </div>
              <div className="bg-white rounded-2xl p-3 sm:p-5 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Unidades vendidas</p>
                <p className="text-lg sm:text-2xl font-black text-gray-800">{totales.unidades}</p>
              </div>
              <div className="bg-white rounded-2xl p-3 sm:p-5 shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Rutas liquidadas</p>
                <p className="text-lg sm:text-2xl font-black text-gray-800">{totales.rutas_liquidadas}/{totales.rutas_total}</p>
              </div>
            </div>

            {topProductos.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2">Top 3 productos mas vendidos</p>
                <div className="grid grid-cols-3 gap-2">
                  {topProductos.map((p, i) => (
                    <div key={p.sku} className="bg-white rounded-2xl p-3 shadow-sm text-center">
                      <p className="text-2xl">{['🥇', '🥈', '🥉'][i]}</p>
                      <p className="text-xs font-bold text-gray-700 truncate">{p.nombre}</p>
                      <p className="text-lg font-black text-gray-900">{p.cantidad} und</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
              <p className="text-xs text-gray-500 mb-2">Ventas vs mismo dia semana pasada</p>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs text-gray-400">Hoy</p>
                  <p className="text-xl font-black text-gray-900">${totales.ventas.toLocaleString('es-CO')}</p>
                </div>
                <p className="text-2xl text-gray-800">vs</p>
                <div>
                  <p className="text-xs text-gray-400">Semana pasada</p>
                  <p className="text-xl font-black text-gray-500">${ventasSemanaPasada.toLocaleString('es-CO')}</p>
                </div>
              </div>
              {ventasSemanaPasada > 0 && (
                <p className={`text-sm font-bold mt-2 text-center ${totales.ventas >= ventasSemanaPasada ? 'text-gray-900' : 'text-brand'}`}>
                  {totales.ventas >= ventasSemanaPasada ? '+' : ''}{(((totales.ventas - ventasSemanaPasada) / ventasSemanaPasada) * 100).toFixed(1)}%
                </p>
              )}
            </div>

            {gastosPorCategoria.length > 0 && (
              <div className="bg-white rounded-2xl p-3 sm:p-5 shadow-sm mb-4">
                <p className="text-xs text-gray-500 mb-2">Gastos del dia por categoria</p>
                {gastosPorCategoria.map(([categoria, valor]) => (
                  <div key={categoria} className="flex justify-between py-1">
                    <p className="text-sm text-gray-600">{categoria}</p>
                    <p className="text-sm font-bold text-brand">${valor.toLocaleString('es-CO')}</p>
                  </div>
                ))}
                <div className="flex justify-between pt-2 mt-1 border-t border-gray-100">
                  <p className="text-sm font-black text-gray-700">Total</p>
                  <p className="text-sm font-black text-brand">${gastosPorCategoria.reduce((sum, [, v]) => sum + v, 0).toLocaleString('es-CO')}</p>
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
              <p className="text-xs text-gray-500 mb-1">Fiados nuevos hoy</p>
              <p className="text-xl font-black text-gray-700">${fiadosNuevosDia.toLocaleString('es-CO')}</p>
            </div>

            <h3 className="font-black text-gray-700 mb-3">Detalle por ruta</h3>
            {resumen.map((r, i) => (
              <div key={i} className="bg-white rounded-2xl shadow-sm p-4 mb-3">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-black text-gray-800">{r.ruta}</p>
                    <p className="text-xs text-gray-400">{r.vendedor}</p>
                  </div>
                  <Stepper estado={r.estado} compact />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center bg-gray-50 rounded-xl p-2">
                    <p className="text-xs text-gray-400">Despachado</p>
                    <p className="font-black text-gray-700">{r.total_und} und</p>
                  </div>
                  <div className="text-center bg-gray-50 rounded-xl p-2">
                    <p className="text-xs text-gray-400">Vendido</p>
                    <p className="font-black text-gray-900">{r.vendido_und} und</p>
                  </div>
                  <div className="text-center bg-gray-50 rounded-xl p-2">
                    <p className="text-xs text-gray-400">Devuelto</p>
                    <p className="font-black text-gray-700">{r.devuelto_und} und</p>
                  </div>
                </div>
                {r.liquidado && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between">
                    <p className="text-sm text-gray-500">Venta neta</p>
                    <p className="font-black text-gray-900">${r.vendido_valor.toLocaleString('es-CO')}</p>
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
