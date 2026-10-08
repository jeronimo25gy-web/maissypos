'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { puedeVerModulo } from '@/lib/permisos'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { PageHeader } from '@/components/ui'

export default function Historial() {
  const [usuario, setUsuario] = useState(null)
  const [fecha, setFecha] = useState(obtenerFechaActual())
  const [vendedorFiltro, setVendedorFiltro] = useState('')
  const [rutaFiltro, setRutaFiltro] = useState('')
  const [vendedores, setVendedores] = useState([])
  const [rutas, setRutas] = useState([])
  const [despachos, setDespachos] = useState([])
  const [despachSel, setDespachSel] = useState(null)
  const [detalle, setDetalle] = useState([])
  const [liqDetalle, setLiqDetalle] = useState(null)
  const [fiados, setFiados] = useState([])
  const [gastos, setGastos] = useState([])
  const [transEnviadas, setTransEnviadas] = useState([])
  const [transRecibidas, setTransRecibidas] = useState([])
  const [obsequios, setObsequios] = useState([])
  const [consumos, setConsumos] = useState([])
  const [descuentos, setDescuentos] = useState([])
  const [transfRuta, setTransfRuta] = useState([])
  const [base, setBase] = useState(0)
  const [cargando, setCargando] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (!puedeVerModulo(parsed, 'historial', ['admin', 'auxiliar'])) { router.push('/despacho'); return }
    setUsuario(parsed)
    cargarFiltros()
    cargarHistorial(obtenerFechaActual(), '', '')
  }, [])

  const cargarFiltros = async () => {
    const { data: vends } = await supabase.from('vendedores').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    const { data: ruts } = await supabase.from('rutas').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    if (vends) setVendedores(vends)
    if (ruts) setRutas(ruts)
  }

  const cargarHistorial = async (f, vId, rId) => {
    setCargando(true)
    let query = supabase
      .from('despachos_encab')
      .select('*, rutas(nombre), vendedores(nombre)')
      .eq('fecha', f)
      .eq('estado', 'liquidado')
      .eq('empresa_id', getEmpresaId())
      .order('created_at', { ascending: false })
    if (vId) query = query.eq('vendedor_id', vId)
    if (rId) query = query.eq('ruta_id', rId)
    const { data } = await query
    if (data) setDespachos(data)
    setCargando(false)
  }

  const verDetalle = async (d) => {
    setDespachSel(d)
    const [liqRes, prodsRes, liqDetRes, fiadosRes, gastosRes, transEnvRes, transRecRes, obsRes, consRes, descRes, transfRutaRes, baseRes] = await Promise.all([
      supabase.from('liquidaciones').select('*').eq('despacho_id', d.id),
      supabase.from('productos').select('sku, nombre, precio_venta').eq('empresa_id', getEmpresaId()).order('nombre'),
      supabase.from('liquidaciones_detalle').select('*').eq('despacho_id', d.id).single(),
      supabase.from('liquidaciones_fiados').select('*').eq('despacho_id', d.id),
      supabase.from('liquidaciones_gastos').select('*').eq('despacho_id', d.id),
      supabase.from('transferencias_mercancia').select('*').eq('vendedor_origen_id', d.vendedor_id).eq('fecha', d.fecha).eq('empresa_id', getEmpresaId()),
      supabase.from('transferencias_mercancia').select('*').eq('vendedor_destino_id', d.vendedor_id).eq('fecha', d.fecha).eq('empresa_id', getEmpresaId()),
      supabase.from('obsequios').select('*').eq('despacho_id', d.id),
      supabase.from('consumos_empleado').select('*').eq('despacho_id', d.id).is('venta_id', null),
      supabase.from('liquidaciones_descuentos').select('*').eq('despacho_id', d.id),
      supabase.from('transferencias_ruta').select('*').eq('despacho_id', d.id),
      supabase.from('configuracion').select('valor').eq('parametro', 'base_despacho_' + d.id).eq('empresa_id', getEmpresaId()).maybeSingle(),
    ])
    let pm = {}
    if (liqRes.data && prodsRes.data) {
      prodsRes.data.forEach(p => { pm[p.sku] = p })
      // Precio especial por ruta (Maestros > Rutas), igual que en Liquidacion.
      if (d.ruta_id) {
        const { data: preciosRuta } = await supabase.from('rutas_precios').select('sku, precio_especial').eq('ruta_id', d.ruta_id).eq('empresa_id', getEmpresaId())
        ;(preciosRuta || []).forEach(pr => { if (pm[pr.sku]) pm[pr.sku] = { ...pm[pr.sku], precio_venta: pr.precio_especial } })
      }
      setDetalle(liqRes.data.map(l => ({ ...l, producto: pm[l.sku] || {} })))
    }
    setLiqDetalle(liqDetRes.data || null)
    setFiados(fiadosRes.data || [])
    setGastos(gastosRes.data || [])
    setObsequios((obsRes.data || []).map(o => ({ ...o, producto: pm[o.sku]?.nombre || o.sku })))
    setConsumos((consRes.data || []).map(c => ({ ...c, producto: pm[c.sku]?.nombre || c.sku })))
    setDescuentos((descRes.data || []).map(x => ({ ...x, producto: pm[x.sku]?.nombre || x.sku || '' })))
    setTransfRuta(transfRutaRes.data || [])
    setBase(parseFloat(baseRes.data?.valor || 0))
    const vm = {}
    vendedores.forEach(v => { vm[v.id] = v.nombre })
    setTransEnviadas((transEnvRes.data || []).map(t => ({ ...t, producto: pm[t.sku]?.nombre || t.sku, vendedor: vm[t.vendedor_destino_id] || 'Vendedor' })))
    setTransRecibidas((transRecRes.data || []).map(t => ({ ...t, producto: pm[t.sku]?.nombre || t.sku, vendedor: vm[t.vendedor_origen_id] || 'Vendedor' })))
  }

  // Valor guardado al liquidar (efectivo_esperado), no el precio de hoy: si
  // el precio cambio despues, el historial debe seguir cuadrando con lo que
  // se le cobro al vendedor ese dia.
  const valorLinea = (l) => l.efectivo_esperado ?? (l.vendido_neto * (l.producto?.precio_venta || 0))
  const totalVendido = () => detalle.reduce((sum, l) => sum + valorLinea(l), 0)
  const totalDespachado = () => detalle.reduce((sum, l) => sum + l.despachado, 0)
  const totalDevuelto = () => detalle.reduce((sum, l) => sum + (l.devuelto || 0), 0)
  const totalCambio = () => detalle.reduce((sum, l) => sum + (l.cambio || 0), 0)
  const fiadosNuevos = () => fiados.filter(f => f.tipo === 'fiado')
  const pagosFiados = () => fiados.filter(f => f.tipo === 'pago_fiado')
  const totalObsequios = () => obsequios.reduce((s, o) => s + (o.valor_unitario || 0) * (o.cantidad || 0), 0)
  const totalConsumos = () => consumos.reduce((s, c) => s + (c.valor || (c.valor_unitario || 0) * (c.cantidad || 0)), 0)
  const totalDescuentos = () => descuentos.reduce((s, x) => s + (x.valor || 0), 0)
  const transfPorVerificar = () => transfRuta.filter(t => t.estado === 'por_verificar')
  const totalPorVerificar = () => transfPorVerificar().reduce((s, t) => s + (t.valor || 0), 0)
  const obsequiosPorSku = () => obsequios.reduce((m, o) => ({ ...m, [o.sku]: (m[o.sku] || 0) + (o.cantidad || 0) }), {})
  // Misma formula que Liquidacion (totalAEntregar / totalEntregado).
  const totalAEntregar = () => totalVendido() + base - (liqDetalle?.total_fiados || 0) + (liqDetalle?.total_pagos_fiados || 0)
    - totalDescuentos() - totalObsequios() - totalConsumos() - totalPorVerificar()
  const totalEntregado = () => (liqDetalle?.efectivo || 0) + (liqDetalle?.transferencias_bancarias || 0) + (liqDetalle?.total_gastos || 0)
  const fmt = (n) => Math.round(n || 0).toLocaleString('es-CO')

  if (despachSel) return (
    <div>
      <PageHeader title="Detalle Liquidacion"
        subtitle={`${despachSel.rutas?.nombre} · ${despachSel.vendedores?.nombre} · ${new Date(despachSel.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
        onBack={() => { setDespachSel(null); setDetalle([]); setLiqDetalle(null); setFiados([]); setGastos([]); setTransEnviadas([]); setTransRecibidas([]); setObsequios([]); setConsumos([]); setDescuentos([]); setTransfRuta([]); setBase(0) }} />

      <div className="p-4 max-w-2xl mx-auto">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-xl p-3 shadow-sm text-center">
            <p className="text-xs text-gray-500">Despachado</p>
            <p className="font-black text-gray-800 text-xl">{totalDespachado()}</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm text-center">
            <p className="text-xs text-gray-500">Devuelto</p>
            <p className="font-black text-gray-700 text-xl">{totalDevuelto()}</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm text-center">
            <p className="text-xs text-gray-500">Cambio</p>
            <p className="font-black text-brand text-xl">{totalCambio()}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <p className="text-sm font-black text-gray-500 mb-1">Total vendido neto</p>
          <p className="text-3xl font-black text-gray-900">${fmt(totalVendido() - totalObsequios())}</p>
          {totalObsequios() > 0 && (
            <p className="text-xs text-gray-500 mt-1">Salió y no volvió ${fmt(totalVendido())} − obsequios ${fmt(totalObsequios())}</p>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-4">
          <div className="grid grid-cols-4 bg-gray-50 px-4 py-2 text-xs font-bold text-gray-500 border-b">
            <span className="col-span-2">Producto</span>
            <span className="text-center">Desp/Dev/Cam</span>
            <span className="text-right">Vendido</span>
          </div>
          {detalle.map((l, i) => (
            <div key={i} className={`grid grid-cols-4 px-4 py-3 ${i < detalle.length - 1 ? 'border-b border-gray-100' : ''}`}>
              <div className="col-span-2">
                <p className="font-medium text-gray-800 text-sm">{l.producto?.nombre}</p>
                <p className="text-xs text-gray-400">{l.sku}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-600">{l.despachado} / <span className="text-gray-700">{l.devuelto || 0}</span> / <span className="text-brand">{l.cambio || 0}</span></p>
                <p className="text-xs font-black text-gray-900">{l.vendido_neto} neto</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-gray-800 text-sm">${fmt(valorLinea(l))}</p>
                {obsequiosPorSku()[l.sku] > 0 && <p className="text-xs text-brand">incluye {obsequiosPorSku()[l.sku]} obsequio</p>}
              </div>
            </div>
          ))}
        </div>

        {liqDetalle && (() => {
          const fila = (label, valor, signo, color = 'text-gray-900') => (
            <div className="flex justify-between mb-1.5">
              <p className="text-sm text-gray-600">{label}</p>
              <p className={`font-bold ${color}`}>{signo}${fmt(valor)}</p>
            </div>
          )
          const dif = liqDetalle.diferencia || 0
          return (
            <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
              <p className="font-black text-gray-700 mb-3">Cuadre de caja</p>
              <p className="text-xs font-black uppercase tracking-wide text-gray-400 mb-2">Debía entregar</p>
              {fila('Salió y no volvió (productos)', totalVendido(), '')}
              {base > 0 && fila('Base', base, '+')}
              {(liqDetalle.total_pagos_fiados || 0) > 0 && fila('Pagos de créditos recibidos', liqDetalle.total_pagos_fiados, '+')}
              {(liqDetalle.total_fiados || 0) > 0 && fila('Créditos nuevos', liqDetalle.total_fiados, '−', 'text-brand')}
              {totalDescuentos() > 0 && fila('Descuentos', totalDescuentos(), '−', 'text-brand')}
              {totalObsequios() > 0 && fila('Obsequios', totalObsequios(), '−', 'text-brand')}
              {totalConsumos() > 0 && fila('Consumo propio', totalConsumos(), '−', 'text-brand')}
              {totalPorVerificar() > 0 && fila('Transferencias por verificar', totalPorVerificar(), '−', 'text-brand')}
              <div className="flex justify-between border-t border-gray-100 pt-1.5 mb-3">
                <p className="text-sm font-black text-gray-700">Total a entregar</p>
                <p className="font-black text-gray-900">${fmt(totalAEntregar())}</p>
              </div>
              <p className="text-xs font-black uppercase tracking-wide text-gray-400 mb-2">Entregó</p>
              {fila('Efectivo', liqDetalle.efectivo, '')}
              {(liqDetalle.transferencias_bancarias || 0) > 0 && fila('Transferencias verificadas', liqDetalle.transferencias_bancarias, '+')}
              {(liqDetalle.total_gastos || 0) > 0 && fila('Gastos de ruta (soportados)', liqDetalle.total_gastos, '+')}
              <div className="flex justify-between border-t border-gray-100 pt-1.5 mb-2">
                <p className="text-sm font-black text-gray-700">Total entregado</p>
                <p className="font-black text-gray-900">${fmt(totalEntregado())}</p>
              </div>
              {((liqDetalle.total_merc_enviada || 0) > 0 || (liqDetalle.total_merc_recibida || 0) > 0) && (
                <p className="text-xs text-gray-400 mb-2">
                  Informativo (ya incluido en productos): merc. enviada ${fmt(liqDetalle.total_merc_enviada)} · recibida ${fmt(liqDetalle.total_merc_recibida)}
                </p>
              )}
              <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between">
                <p className="font-black text-gray-700">Diferencia</p>
                <p className={`font-black text-xl ${dif >= 0 ? 'text-gray-900' : 'text-brand'}`}>
                  {dif >= 0 ? '+' : '−'}${fmt(Math.abs(dif))}
                </p>
              </div>
            </div>
          )
        })()}

        {fiadosNuevos().length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
            <p className="font-black text-gray-900 mb-3">Créditos del día</p>
            {fiadosNuevos().map((f, i) => (
              <div key={i} className="flex justify-between mb-1">
                <p className="text-sm text-gray-700">{f.nombre_cliente}</p>
                <p className="font-bold text-gray-900">${(f.valor || 0).toLocaleString('es-CO')}</p>
              </div>
            ))}
          </div>
        )}

        {pagosFiados().length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
            <p className="font-black text-gray-900 mb-3">Pagos de créditos recibidos</p>
            {pagosFiados().map((f, i) => (
              <div key={i} className="flex justify-between mb-1">
                <p className="text-sm text-gray-700">{f.nombre_cliente}</p>
                <p className="font-bold text-gray-900">${(f.valor || 0).toLocaleString('es-CO')}</p>
              </div>
            ))}
          </div>
        )}

        {obsequios.length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
            <p className="font-black text-gray-900 mb-3">Obsequios</p>
            {obsequios.map((o, i) => (
              <div key={i} className="flex justify-between mb-1">
                <div>
                  <p className="text-sm text-gray-700">{o.producto} · {o.cantidad} und</p>
                  <p className="text-xs text-gray-400">Autorizó: {o.autorizado_por || '—'}</p>
                </div>
                <p className="font-bold text-brand">${((o.valor_unitario || 0) * (o.cantidad || 0)).toLocaleString('es-CO')}</p>
              </div>
            ))}
          </div>
        )}

        {consumos.length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
            <p className="font-black text-gray-900 mb-3">Consumo propio</p>
            {consumos.map((c, i) => (
              <div key={i} className="flex justify-between mb-1">
                <p className="text-sm text-gray-700">{c.producto} · {c.cantidad} und</p>
                <p className="font-bold text-brand">${(c.valor || (c.valor_unitario || 0) * (c.cantidad || 0)).toLocaleString('es-CO')}</p>
              </div>
            ))}
          </div>
        )}

        {descuentos.length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
            <p className="font-black text-gray-900 mb-3">Descuentos</p>
            {descuentos.map((x, i) => (
              <div key={i} className="flex justify-between mb-1">
                <div>
                  <p className="text-sm text-gray-700">{x.concepto || 'Descuento'}</p>
                  {x.producto && <p className="text-xs text-gray-400">{x.producto}</p>}
                </div>
                <p className="font-bold text-brand">${(x.valor || 0).toLocaleString('es-CO')}</p>
              </div>
            ))}
          </div>
        )}

        {transfRuta.length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
            <p className="font-black text-gray-900 mb-3">Transferencias bancarias</p>
            {transfRuta.map((t, i) => (
              <div key={i} className="flex justify-between mb-1">
                <div>
                  <p className="text-sm text-gray-700">{t.banco || 'Transferencia'}{t.referencia ? ` · ${t.referencia}` : ''}</p>
                  <p className="text-xs text-gray-400">
                    {t.estado === 'por_verificar' ? `Por verificar${t.fecha_limite ? ` · límite ${t.fecha_limite}` : ''}` : t.estado === 'descontada' ? 'Descontada en nómina' : t.estado === 'recibida' ? 'Llegó después' : 'Verificada'}
                  </p>
                </div>
                <p className={`font-bold ${t.estado === 'por_verificar' ? 'text-brand' : 'text-gray-900'}`}>${(t.valor || 0).toLocaleString('es-CO')}</p>
              </div>
            ))}
          </div>
        )}

        {gastos.length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
            <p className="font-black text-brand mb-3">Gastos de ruta</p>
            {gastos.map((g, i) => (
              <div key={i} className="flex justify-between mb-1">
                <div>
                  <p className="text-sm text-gray-700 font-bold">{g.categoria || g.concepto}</p>
                  {g.categoria && g.concepto && <p className="text-xs text-gray-400">{g.concepto}</p>}
                </div>
                <p className="font-bold text-brand">${(g.valor || 0).toLocaleString('es-CO')}</p>
              </div>
            ))}
          </div>
        )}

        {(transEnviadas.length > 0 || transRecibidas.length > 0) && (
          <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
            <p className="font-black text-gray-900 mb-3">Transferencias de mercancia</p>
            {transEnviadas.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-bold text-gray-500 mb-1">Enviada</p>
                {transEnviadas.map((t, i) => (
                  <div key={i} className="flex justify-between mb-1">
                    <div>
                      <p className="text-sm text-gray-700">{t.producto} · {t.cantidad} und</p>
                      <p className="text-xs text-gray-400">A: {t.vendedor}</p>
                    </div>
                    <p className="font-bold text-gray-900">${(t.valor_total || 0).toLocaleString('es-CO')}</p>
                  </div>
                ))}
              </div>
            )}
            {transRecibidas.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-500 mb-1">Recibida</p>
                {transRecibidas.map((t, i) => (
                  <div key={i} className="flex justify-between mb-1">
                    <div>
                      <p className="text-sm text-gray-700">{t.producto} · {t.cantidad} und</p>
                      <p className="text-xs text-gray-400">De: {t.vendedor}</p>
                    </div>
                    <p className="font-bold text-gray-900">${(t.valor_total || 0).toLocaleString('es-CO')}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div>
      <PageHeader title="Historial de Liquidaciones" />

      <div className="p-4 max-w-2xl mx-auto">
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 block mb-1">Fecha</label>
              <input type="date" value={fecha}
                onChange={e => { setFecha(e.target.value); cargarHistorial(e.target.value, vendedorFiltro, rutaFiltro) }}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">Vendedor</label>
                <select value={vendedorFiltro}
                  onChange={e => { setVendedorFiltro(e.target.value); cargarHistorial(fecha, e.target.value, rutaFiltro) }}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
                  <option value="">Todos</option>
                  {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">Ruta</label>
                <select value={rutaFiltro}
                  onChange={e => { setRutaFiltro(e.target.value); cargarHistorial(fecha, vendedorFiltro, e.target.value) }}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
                  <option value="">Todas</option>
                  {rutas.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {cargando ? (
          <div className="text-center py-8">
            <p className="text-gray-400">Cargando...</p>
          </div>
        ) : despachos.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center shadow-sm">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-gray-500">No hay liquidaciones para esta fecha</p>
          </div>
        ) : (
          <>
            <p className="text-xs font-bold text-gray-500 mb-2">{despachos.length} liquidaciones encontradas</p>
            {despachos.map(d => (
              <button key={d.id} onClick={() => verDetalle(d)}
                className="w-full bg-white rounded-xl p-4 shadow-sm mb-3 text-left hover:shadow-md transition-all">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-black text-gray-800">{d.rutas?.nombre}</p>
                    <p className="text-sm text-gray-500">{d.vendedores?.nombre}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-gray-900">${d.total_valor?.toLocaleString('es-CO')}</p>
                    <p className="text-xs text-gray-400">{d.total_und} und</p>
                  </div>
                </div>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
