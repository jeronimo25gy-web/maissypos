'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'

export default function Historial() {
  const [usuario, setUsuario] = useState(null)
  const [fecha, setFecha] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }))
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
  const [cargando, setCargando] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (parsed.rol !== 'admin' && parsed.rol !== 'auxiliar') { router.push('/dashboard'); return }
    setUsuario(parsed)
    cargarFiltros()
    cargarHistorial(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }), '', '')
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
    const [liqRes, prodsRes, liqDetRes, fiadosRes, gastosRes] = await Promise.all([
      supabase.from('liquidaciones').select('*').eq('despacho_id', d.id),
      supabase.from('productos').select('sku, nombre, precio_venta').eq('empresa_id', getEmpresaId()),
      supabase.from('liquidaciones_detalle').select('*').eq('despacho_id', d.id).single(),
      supabase.from('liquidaciones_fiados').select('*').eq('despacho_id', d.id),
      supabase.from('liquidaciones_gastos').select('*').eq('despacho_id', d.id)
    ])
    if (liqRes.data && prodsRes.data) {
      const pm = {}
      prodsRes.data.forEach(p => { pm[p.sku] = p })
      setDetalle(liqRes.data.map(l => ({ ...l, producto: pm[l.sku] || {} })))
    }
    setLiqDetalle(liqDetRes.data || null)
    setFiados(fiadosRes.data || [])
    setGastos(gastosRes.data || [])
  }

  const totalVendido = () => detalle.reduce((sum, l) => sum + (l.vendido_neto * (l.producto?.precio_venta || 0)), 0)
  const totalDespachado = () => detalle.reduce((sum, l) => sum + l.despachado, 0)
  const totalDevuelto = () => detalle.reduce((sum, l) => sum + (l.devuelto || 0), 0)
  const totalCambio = () => detalle.reduce((sum, l) => sum + (l.cambio || 0), 0)
  const fiadosNuevos = () => fiados.filter(f => f.tipo === 'fiado')
  const pagosFiados = () => fiados.filter(f => f.tipo === 'pago_fiado')

  if (despachSel) return (
    <div>
      <div className="bg-white shadow-sm px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-black text-gray-900">Detalle Liquidacion</h1>
          <p className="text-xs text-gray-500">{despachSel.rutas?.nombre} · {despachSel.vendedores?.nombre} · {new Date(despachSel.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <button onClick={() => { setDespachSel(null); setDetalle([]); setLiqDetalle(null); setFiados([]); setGastos([]) }} className="text-brand font-bold text-sm">← Volver</button>
      </div>

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
          <p className="text-3xl font-black text-gray-900">${totalVendido().toLocaleString('es-CO')}</p>
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
                <p className="font-bold text-gray-800 text-sm">${(l.vendido_neto * (l.producto?.precio_venta || 0)).toLocaleString('es-CO')}</p>
              </div>
            </div>
          ))}
        </div>

        {liqDetalle && (
          <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
            <p className="font-black text-gray-700 mb-3">Cuadre de caja</p>
            <div className="flex justify-between mb-2">
              <p className="text-sm text-gray-600">Efectivo</p>
              <p className="font-bold">${(liqDetalle.efectivo || 0).toLocaleString('es-CO')}</p>
            </div>
            <div className="flex justify-between mb-2">
              <p className="text-sm text-gray-600">Transferencias bancarias</p>
              <p className="font-bold">${(liqDetalle.transferencias_bancarias || 0).toLocaleString('es-CO')}</p>
            </div>
            <div className="flex justify-between mb-2">
              <p className="text-sm text-gray-600">Gastos ruta</p>
              <p className="font-bold text-brand">-${(liqDetalle.total_gastos || 0).toLocaleString('es-CO')}</p>
            </div>
            <div className="flex justify-between mb-2">
              <p className="text-sm text-gray-600">Fiados nuevos</p>
              <p className="font-bold text-gray-700">-${(liqDetalle.total_fiados || 0).toLocaleString('es-CO')}</p>
            </div>
            <div className="flex justify-between mb-2">
              <p className="text-sm text-gray-600">Pagos fiados recibidos</p>
              <p className="font-bold text-gray-900">+${(liqDetalle.total_pagos_fiados || 0).toLocaleString('es-CO')}</p>
            </div>
            <div className="flex justify-between mb-2">
              <p className="text-sm text-gray-600">Merc enviada</p>
              <p className="font-bold text-gray-900">+${(liqDetalle.total_merc_enviada || 0).toLocaleString('es-CO')}</p>
            </div>
            <div className={`border-t border-gray-200 mt-2 pt-2 flex justify-between`}>
              <p className="font-black text-gray-700">Diferencia</p>
              <p className={`font-black text-xl ${(liqDetalle.diferencia || 0) >= 0 ? 'text-gray-900' : 'text-brand'}`}>
                {(liqDetalle.diferencia || 0) >= 0 ? '+' : ''}${(liqDetalle.diferencia || 0).toLocaleString('es-CO')}
              </p>
            </div>
          </div>
        )}

        {fiadosNuevos().length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
            <p className="font-black text-gray-900 mb-3">Fiados del dia</p>
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
            <p className="font-black text-gray-900 mb-3">Pagos de fiados recibidos</p>
            {pagosFiados().map((f, i) => (
              <div key={i} className="flex justify-between mb-1">
                <p className="text-sm text-gray-700">{f.nombre_cliente}</p>
                <p className="font-bold text-gray-900">${(f.valor || 0).toLocaleString('es-CO')}</p>
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
      </div>
    </div>
  )

  return (
    <div>
      <div className="bg-white shadow-sm px-6 py-4 sticky top-0 z-10">
        <h1 className="text-xl font-black text-gray-900">Historial de Liquidaciones</h1>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 block mb-1">Fecha</label>
              <input type="date" value={fecha}
                onChange={e => { setFecha(e.target.value); cargarHistorial(e.target.value, vendedorFiltro, rutaFiltro) }}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
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
