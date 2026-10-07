'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { calcularStockPorSku } from '@/lib/inventario-helpers'

const fmt = (v, dec = 0) => Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: dec })
const DIAS_CONSUMO = 14

const haceDias = (fecha, dias) => {
  const d = new Date(fecha + 'T12:00:00')
  d.setDate(d.getDate() - dias)
  return d.toLocaleDateString('en-CA')
}

// Inventario de una empresa que fabrica (Arepas Maissy). A diferencia de
// Distri, separa producto terminado (paquetes, sale de produccion) de materias
// primas (maiz en bultos, insumos), muestra el movimiento del dia y cuantos
// dias de produccion alcanza cada materia prima.
export default function InventarioProduccion() {
  const [cargando, setCargando] = useState(true)
  const [terminados, setTerminados] = useState([])
  const [materias, setMaterias] = useState([])
  const [expandido, setExpandido] = useState(null)

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setCargando(true)
    const empresaId = getEmpresaId()
    const hoy = obtenerFechaActual()
    const desdeConsumo = haceDias(hoy, DIAS_CONSUMO - 1)

    const [
      { data: productos }, { data: formulas }, { data: movsHoy }, { data: despHoy },
      { data: liqHoy }, { data: salidasPeriodo }, { data: lotesPeriodo }, { data: ultimasCompras },
    ] = await Promise.all([
      supabase.from('productos').select('id, sku, nombre, categoria, stock_minimo, consumo_por_cochada').eq('estado', true).eq('empresa_id', empresaId).order('nombre'),
      supabase.from('formulas').select('producto_id, formulas_detalle(materia_prima_id)').eq('empresa_id', empresaId),
      supabase.from('inventario_mov').select('sku, tipo_movimiento, cantidad, referencia').eq('empresa_id', empresaId).eq('fecha', hoy),
      supabase.from('despachos_detalle').select('sku, total, despachos_encab!inner(fecha, estado)').eq('empresa_id', empresaId)
        .eq('despachos_encab.fecha', hoy).neq('despachos_encab.estado', 'cancelado'),
      supabase.from('liquidaciones').select('sku, devuelto').eq('empresa_id', empresaId).eq('fecha', hoy),
      supabase.from('inventario_mov').select('sku, cantidad, fecha').eq('empresa_id', empresaId).eq('tipo_movimiento', 'salida').gte('fecha', desdeConsumo).lte('fecha', hoy),
      supabase.from('produccion_lotes').select('fecha').eq('empresa_id', empresaId).gte('fecha', desdeConsumo).lte('fecha', hoy),
      supabase.from('inventario_mov').select('sku, cantidad, fecha').eq('empresa_id', empresaId).eq('tipo_movimiento', 'entrada').like('referencia', 'Compra%').order('fecha', { ascending: false }).limit(200),
    ])
    const stock = await calcularStockPorSku()

    const idsTerminado = new Set((formulas || []).map(f => f.producto_id))
    const idsMateria = new Set((formulas || []).flatMap(f => (f.formulas_detalle || []).map(d => d.materia_prima_id)))

    const hoyPorSku = {}
    const h = (sku) => (hoyPorSku[sku] ||= { producido: 0, vendido: 0, cambios: 0, otrasEntradas: 0, otrasSalidas: 0, despachado: 0, devuelto: 0, comprado: 0, consumido: 0 })
    ;(movsHoy || []).forEach(m => {
      const r = m.referencia || ''
      const c = Number(m.cantidad) || 0
      if (m.tipo_movimiento === 'entrada') {
        if (r.startsWith('Producción')) h(m.sku).producido += c
        else if (r.startsWith('Compra')) h(m.sku).comprado += c
        else h(m.sku).otrasEntradas += c
      } else {
        if (!r) h(m.sku).vendido += c
        else if (r.startsWith('Cambio')) h(m.sku).cambios += c
        else if (r.startsWith('Cochada') || r.startsWith('Producción')) h(m.sku).consumido += c
        else h(m.sku).otrasSalidas += c
      }
    })
    ;(despHoy || []).forEach(d => { h(d.sku).despachado += Number(d.total) || 0 })
    ;(liqHoy || []).forEach(l => { h(l.sku).devuelto += Number(l.devuelto) || 0 })

    const consumoPorSku = {}
    ;(salidasPeriodo || []).forEach(m => { consumoPorSku[m.sku] = (consumoPorSku[m.sku] || 0) + (Number(m.cantidad) || 0) })
    const diasConProduccion = new Set((lotesPeriodo || []).map(l => l.fecha)).size
    const ultimaCompraPorSku = {}
    ;(ultimasCompras || []).forEach(m => { if (!ultimaCompraPorSku[m.sku]) ultimaCompraPorSku[m.sku] = m })

    const filas = (productos || []).map(p => {
      const s = stock[p.sku]
      return {
        ...p,
        stockActual: s ? s.stockActual : null,
        detalle: s || null,
        hoy: hoyPorSku[p.sku] || h(p.sku),
        unidad: idsTerminado.has(p.id) ? 'paq' : p.consumo_por_cochada ? 'bultos' : 'und',
      }
    })

    setTerminados(filas.filter(p => idsTerminado.has(p.id)))
    setMaterias(filas.filter(p => !idsTerminado.has(p.id)).map(p => {
      const consumo = consumoPorSku[p.sku] || 0
      const porDia = diasConProduccion > 0 ? consumo / diasConProduccion : 0
      return {
        ...p,
        esMateriaPrima: idsMateria.has(p.id),
        consumoPorDia: porDia,
        diasAlcanza: porDia > 0 && p.stockActual !== null ? p.stockActual / porDia : null,
        ultimaCompra: ultimaCompraPorSku[p.sku] || null,
      }
    }).sort((a, b) => Number(b.esMateriaPrima) - Number(a.esMateriaPrima) || a.nombre.localeCompare(b.nombre)))
    setCargando(false)
  }

  if (cargando) return <p className="text-gray-400 text-center py-10">Cargando...</p>

  const totalPaquetes = terminados.reduce((s, p) => s + Math.max(0, p.stockActual || 0), 0)
  const producidoHoy = terminados.reduce((s, p) => s + p.hoy.producido, 0)
  const salioHoy = terminados.reduce((s, p) => s + p.hoy.despachado + p.hoy.vendido + p.hoy.cambios, 0)

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Tarjeta label="Paquetes en bodega" valor={fmt(totalPaquetes)} />
        <Tarjeta label="Producido hoy" valor={fmt(producidoHoy)} />
        <Tarjeta label="Salió hoy" valor={fmt(salioHoy)} />
      </div>

      <p className="text-xs font-bold text-gray-500 mb-2 px-1 uppercase tracking-wide">Arepas (producto terminado)</p>
      <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100 mb-2">
        {terminados.map(p => {
          const negativo = p.stockActual !== null && p.stockActual < 0
          const bajo = p.stockActual !== null && p.stockActual < (p.stock_minimo || 0)
          const movHoy = p.hoy.producido + p.hoy.despachado + p.hoy.vendido + p.hoy.cambios + p.hoy.devuelto
          return (
            <div key={p.id}>
              <button onClick={() => setExpandido(expandido === p.sku ? null : p.sku)}
                className={`w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-gray-50 ${negativo ? 'bg-red-50' : bajo ? 'bg-brand/5' : ''}`}>
                <div className="min-w-0">
                  <p className="font-bold text-gray-800 text-sm">{p.nombre}</p>
                  <p className="text-xs text-gray-400">
                    {movHoy === 0 ? 'Sin movimiento hoy' : [
                      p.hoy.producido ? `+${fmt(p.hoy.producido)} producido` : null,
                      p.hoy.despachado ? `−${fmt(p.hoy.despachado)} despachado` : null,
                      p.hoy.vendido ? `−${fmt(p.hoy.vendido)} vendido` : null,
                      p.hoy.cambios ? `−${fmt(p.hoy.cambios)} cambios` : null,
                      p.hoy.devuelto ? `+${fmt(p.hoy.devuelto)} devuelto` : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-xl font-black ${negativo ? 'text-red-600' : 'text-gray-800'}`}>{p.stockActual === null ? '—' : fmt(p.stockActual)}</p>
                  <p className="text-[10px] text-gray-400">paquetes</p>
                </div>
              </button>
              {expandido === p.sku && <Desglose p={p} terminado />}
            </div>
          )
        })}
        {terminados.length === 0 && <p className="text-gray-400 text-center py-6 text-sm">No hay productos con fórmula</p>}
      </div>
      <p className="text-xs text-gray-400 mb-6 px-1">Se calcula desde lo producido: producción − despachos − ventas − cambios + devoluciones. No necesita conteo diario; si haces un conteo, arranca desde ahí.</p>

      <p className="text-xs font-bold text-gray-500 mb-2 px-1 uppercase tracking-wide">Materias primas e insumos</p>
      <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
        {materias.map(p => {
          const negativo = p.stockActual !== null && p.stockActual < 0
          const poco = p.diasAlcanza !== null && p.diasAlcanza < 3
          return (
            <div key={p.id}>
              <button onClick={() => setExpandido(expandido === p.sku ? null : p.sku)}
                className={`w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-gray-50 ${negativo ? 'bg-red-50' : poco ? 'bg-brand/5' : ''}`}>
                <div className="min-w-0">
                  <p className="font-bold text-gray-800 text-sm">{p.nombre}</p>
                  <p className="text-xs text-gray-400">
                    {p.consumoPorDia > 0
                      ? `Gasta ≈ ${fmt(p.consumoPorDia, 2)} ${p.unidad} por día de producción`
                      : p.esMateriaPrima ? 'Sin consumo registrado en los últimos 14 días' : 'Insumo'}
                    {p.ultimaCompra ? ` · última compra ${p.ultimaCompra.fecha}` : ''}
                  </p>
                  {p.diasAlcanza !== null && (
                    <p className={`text-xs font-bold ${poco ? 'text-brand' : 'text-emerald-600'}`}>
                      Alcanza para ≈ {fmt(Math.max(0, p.diasAlcanza), 1)} días de producción
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-xl font-black ${negativo ? 'text-red-600' : 'text-gray-800'}`}>{p.stockActual === null ? '—' : fmt(p.stockActual, 2)}</p>
                  <p className="text-[10px] text-gray-400">{p.unidad}</p>
                </div>
              </button>
              {expandido === p.sku && <Desglose p={p} />}
            </div>
          )
        })}
        {materias.length === 0 && <p className="text-gray-400 text-center py-6 text-sm">Sin materias primas registradas</p>}
      </div>
      <p className="text-xs text-gray-400 mt-2 px-1">El maíz baja con las cochadas registradas en Producción; los demás insumos, según la fórmula.</p>
    </div>
  )
}

function Tarjeta({ label, valor }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-3 text-center">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-xl font-black text-gray-800" style={{ fontVariantNumeric: 'tabular-nums' }}>{valor}</p>
    </div>
  )
}

// Como se llega al stock actual, desde el ultimo conteo (o desde el inicio si
// nunca se ha contado).
function Desglose({ p, terminado }) {
  const d = p.detalle
  if (!d) return <p className="px-4 pb-4 text-xs text-gray-500">Sin movimientos registrados todavía.</p>
  const dec = terminado ? 0 : 2
  const fila = (label, valor, signo, color) => valor > 0 && (
    <div className="flex justify-between py-1">
      <span className="text-gray-600">{label}</span>
      <span className={`font-bold ${color}`}>{signo}{fmt(valor, dec)}</span>
    </div>
  )
  return (
    <div className="px-4 pb-4 bg-gray-50">
      <div className="bg-white rounded-lg border border-gray-200 p-3 text-sm">
        <div className="flex justify-between py-1">
          <span className="text-gray-600">{d.sinConteo ? 'Arranque (sin conteo físico)' : `Base del conteo del ${d.fechaConteo}`}</span>
          <span className="font-bold text-gray-800">{fmt(d.cantidadConteo, dec)}</span>
        </div>
        {fila(terminado ? '+ Producido / entradas' : '+ Comprado / entradas', d.comprado, '+', 'text-green-600')}
        {fila('+ Devuelto por rutas', d.devuelto, '+', 'text-green-600')}
        {fila('− Despachado a rutas', d.despachado, '−', 'text-brand')}
        {fila(terminado ? '− Vendido, cambios y otras salidas' : '− Consumido en producción y otras salidas', d.salida, '−', 'text-brand')}
        <div className="flex justify-between pt-2 mt-1 border-t border-gray-100">
          <span className="font-bold text-gray-800">= Stock actual</span>
          <span className="font-black text-gray-900">{fmt(d.stockActual, dec)}</span>
        </div>
      </div>
    </div>
  )
}
