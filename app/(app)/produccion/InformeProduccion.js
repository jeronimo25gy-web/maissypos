'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const sumarDias = (fecha, dias) => {
  const d = new Date(fecha + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  return d.toLocaleDateString('en-CA')
}

const RANGOS = [
  { id: 'hoy', nombre: 'Hoy' },
  { id: '7d', nombre: 'Últimos 7 días' },
  { id: 'mes', nombre: 'Este mes' },
  { id: 'otro', nombre: 'Otro rango' },
]

const fmtNum = (v, dec = 0) => Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec })

// Informe de produccion por rango: que se produjo (paquetes y kg por
// referencia), cuanto maiz se puso de verdad vs lo que debia gastarse
// (rendimiento) y como salio el gramaje de las muestras.
export default function InformeProduccion() {
  const hoy = obtenerFechaActual()
  const [rango, setRango] = useState('hoy')
  const [desde, setDesde] = useState(hoy)
  const [hasta, setHasta] = useState(hoy)
  const [cargando, setCargando] = useState(true)
  const [datos, setDatos] = useState(null)

  const elegirRango = (r) => {
    setRango(r)
    if (r === 'hoy') { setDesde(hoy); setHasta(hoy) }
    if (r === '7d') { setDesde(sumarDias(hoy, -6)); setHasta(hoy) }
    if (r === 'mes') { setDesde(hoy.slice(0, 7) + '-01'); setHasta(hoy) }
  }

  useEffect(() => { cargar() }, [desde, hasta])

  const cargar = async () => {
    if (!desde || !hasta) return
    setCargando(true)
    const empresaId = getEmpresaId()
    const [{ data: lotes }, { data: formulas }, { data: productos }, { data: cochadas }] = await Promise.all([
      supabase.from('produccion_lotes').select('id, fecha, produccion_detalle(formula_id, cantidad_producida)')
        .eq('empresa_id', empresaId).gte('fecha', desde).lte('fecha', hasta),
      supabase.from('formulas').select('id, nombre, producto_id, rendimiento, formulas_detalle(materia_prima_id, cantidad)').eq('empresa_id', empresaId),
      supabase.from('productos').select('id, nombre, peso_estandar_g, tolerancia_gramaje_pct, consumo_por_cochada, costo_compra').eq('empresa_id', empresaId),
      supabase.from('produccion_cochadas').select('fecha, materia_prima_id, cantidad')
        .eq('empresa_id', empresaId).eq('anulada', false).gte('fecha', desde).lte('fecha', hasta),
    ])
    const loteIds = (lotes || []).map(l => l.id)
    const { data: muestras } = loteIds.length > 0
      ? await supabase.from('produccion_muestras_peso').select('lote_id, producto_id, peso_promedio_g, peso_estandar_g, desviacion_pct').in('lote_id', loteIds)
      : { data: [] }

    const formulaPorId = Object.fromEntries((formulas || []).map(f => [f.id, f]))
    const productoPorId = Object.fromEntries((productos || []).map(p => [p.id, p]))
    const fechaPorLote = Object.fromEntries((lotes || []).map(l => [l.id, l.fecha]))
    const materiasCochada = new Set((productos || []).filter(p => p.consumo_por_cochada).map(p => p.id))

    const porDia = {}
    const porRef = {}
    const dia = (f) => (porDia[f] ||= { fecha: f, paquetes: 0, kg: 0, maizReal: 0, maizEstandar: 0, muestras: 0, fueraRango: 0 })

    ;(lotes || []).forEach(l => (l.produccion_detalle || []).forEach(d => {
      const f = formulaPorId[d.formula_id]
      if (!f) return
      const prod = productoPorId[f.producto_id]
      const paquetes = Number(d.cantidad_producida) || 0
      const kg = paquetes * (Number(prod?.peso_estandar_g) || 0) / 1000
      const dd = dia(l.fecha)
      dd.paquetes += paquetes
      dd.kg += kg
      if (f.rendimiento > 0) {
        ;(f.formulas_detalle || []).forEach(i => {
          if (materiasCochada.has(i.materia_prima_id)) dd.maizEstandar += i.cantidad * (paquetes / f.rendimiento)
        })
      }
      const key = f.producto_id
      porRef[key] ||= { nombre: prod?.nombre || f.nombre, paquetes: 0, kg: 0, pesos: [], desviaciones: [], fueraRango: 0, estandar: Number(prod?.peso_estandar_g) || null }
      porRef[key].paquetes += paquetes
      porRef[key].kg += kg
    }))

    ;(cochadas || []).forEach(c => { if (materiasCochada.has(c.materia_prima_id)) dia(c.fecha).maizReal += Number(c.cantidad) || 0 })

    ;(muestras || []).forEach(m => {
      const prod = productoPorId[m.producto_id]
      const tolerancia = prod?.tolerancia_gramaje_pct ?? 5
      const fuera = m.peso_estandar_g && m.desviacion_pct !== null && Math.abs(m.desviacion_pct) > tolerancia
      const dd = dia(fechaPorLote[m.lote_id])
      dd.muestras += 1
      if (fuera) dd.fueraRango += 1
      const r = porRef[m.producto_id]
      if (r) {
        r.pesos.push(Number(m.peso_promedio_g))
        if (m.desviacion_pct !== null) r.desviaciones.push(Number(m.desviacion_pct))
        if (fuera) r.fueraRango += 1
      }
    })

    const dias = Object.values(porDia).sort((a, b) => a.fecha.localeCompare(b.fecha))
    const refs = Object.values(porRef).sort((a, b) => b.paquetes - a.paquetes)
    const totalPaquetes = dias.reduce((s, d) => s + d.paquetes, 0)
    const totalKg = dias.reduce((s, d) => s + d.kg, 0)
    const maizReal = dias.reduce((s, d) => s + d.maizReal, 0)
    const maizEstandar = dias.reduce((s, d) => s + d.maizEstandar, 0)
    const costoMaiz = (productos || []).find(p => p.consumo_por_cochada)?.costo_compra || 0
    setDatos({ dias, refs, totalPaquetes, totalKg, maizReal, maizEstandar, costoMaiz })
    setCargando(false)
  }

  const rendimiento = (real, estandar) => (real > 0 && estandar > 0 ? (estandar / real) * 100 : null)
  const colorRend = (pct) => (pct === null ? 'text-gray-400' : Math.abs(pct - 100) > 3 ? 'text-brand' : 'text-emerald-600')

  return (
    <div>
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
        <div className="flex flex-wrap gap-2 mb-2">
          {RANGOS.map(r => (
            <button key={r.id} onClick={() => elegirRango(r.id)}
              className={`text-xs font-bold px-3 py-2 rounded-lg ${rango === r.id ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}>
              {r.nombre}
            </button>
          ))}
        </div>
        {rango === 'otro' && (
          <div className="flex gap-2">
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
              className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
              className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
          </div>
        )}
        <p className="text-xs text-gray-400 mt-1">{desde === hasta ? desde : `${desde} a ${hasta}`}</p>
      </div>

      {cargando || !datos ? (
        <p className="text-gray-400 text-center py-10">Cargando...</p>
      ) : datos.totalPaquetes === 0 && datos.maizReal === 0 ? (
        <p className="text-gray-400 text-center py-10">Sin producción registrada en este rango</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Resumen label="Paquetes" valor={fmtNum(datos.totalPaquetes)} />
            <Resumen label="Kg producidos" valor={fmtNum(datos.totalKg, 1)} />
            <Resumen label="Maíz puesto" valor={`${fmtNum(datos.maizReal, 2)} bultos`} />
            <Resumen label="Rendimiento" valor={rendimiento(datos.maizReal, datos.maizEstandar) === null ? '—' : `${fmtNum(rendimiento(datos.maizReal, datos.maizEstandar), 1)}%`}
              clase={colorRend(rendimiento(datos.maizReal, datos.maizEstandar))} />
          </div>

          {datos.maizEstandar > 0 && datos.maizReal === 0 && (
            <div className="bg-white rounded-xl shadow-sm p-4 mb-4 text-sm">
              <p className="text-gray-600">Según lo producido debían gastarse <span className="font-bold text-gray-800">{fmtNum(datos.maizEstandar, 2)} bultos</span>, pero no hay cochadas registradas en este rango: registra los bultos puestos en Producción para ver el rendimiento real.</p>
            </div>
          )}
          {datos.maizReal > 0 && datos.maizEstandar > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-4 mb-4 text-sm">
              <p className="text-gray-600">
                Según lo producido debían gastarse <span className="font-bold text-gray-800">{fmtNum(datos.maizEstandar, 2)} bultos</span> y se pusieron <span className="font-bold text-gray-800">{fmtNum(datos.maizReal, 2)}</span>
                {' '}({datos.maizReal >= datos.maizEstandar ? '+' : ''}{fmtNum(datos.maizReal - datos.maizEstandar, 2)} bultos
                {datos.costoMaiz ? `, ${datos.maizReal >= datos.maizEstandar ? '' : '-'}$${fmtNum(Math.abs(datos.maizReal - datos.maizEstandar) * datos.costoMaiz)}` : ''}).
              </p>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
            <p className="font-black text-gray-700 mb-3">Por referencia</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr className="text-xs text-gray-400 text-right">
                    <th className="text-left font-bold pb-2">Referencia</th>
                    <th className="font-bold pb-2">Paquetes</th>
                    <th className="font-bold pb-2">% total</th>
                    <th className="font-bold pb-2">Kg</th>
                    <th className="font-bold pb-2">Peso prom.</th>
                    <th className="font-bold pb-2">vs estándar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {datos.refs.map(r => {
                    const pesoProm = r.pesos.length ? r.pesos.reduce((s, p) => s + p, 0) / r.pesos.length : null
                    const desvProm = r.desviaciones.length ? r.desviaciones.reduce((s, p) => s + p, 0) / r.desviaciones.length : null
                    return (
                      <tr key={r.nombre} className="text-right">
                        <td className="text-left py-2 font-bold text-gray-700">{r.nombre}</td>
                        <td className="py-2 text-gray-800 font-bold">{fmtNum(r.paquetes)}</td>
                        <td className="py-2 text-gray-500">{datos.totalPaquetes ? fmtNum((r.paquetes / datos.totalPaquetes) * 100, 0) : 0}%</td>
                        <td className="py-2 text-gray-600">{fmtNum(r.kg, 1)}</td>
                        <td className="py-2 text-gray-600">{pesoProm === null ? '—' : `${fmtNum(pesoProm, 0)} g`}</td>
                        <td className={`py-2 font-bold ${desvProm === null ? 'text-gray-300' : r.fueraRango > 0 ? 'text-brand' : 'text-emerald-600'}`}>
                          {desvProm === null ? 'sin muestra' : `${desvProm > 0 ? '+' : ''}${fmtNum(desvProm, 1)}%`}
                          {r.fueraRango > 0 ? ` ⚠${r.fueraRango}` : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-2">Peso promedio de las muestras registradas. ⚠ = muestras fuera de la tolerancia.</p>
          </div>

          {datos.dias.length > 1 && (
            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <p className="font-black text-gray-700 mb-3">Paquetes por día</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={datos.dias.map(d => ({ dia: d.fecha.slice(5), paquetes: Math.round(d.paquetes) }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="dia" fontSize={11} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip formatter={v => `${v.toLocaleString('es-CO')} paquetes`} />
                  <Bar dataKey="paquetes" fill="#C41230" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="font-black text-gray-700 mb-3">Día por día</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr className="text-xs text-gray-400 text-right">
                    <th className="text-left font-bold pb-2">Fecha</th>
                    <th className="font-bold pb-2">Paquetes</th>
                    <th className="font-bold pb-2">Kg</th>
                    <th className="font-bold pb-2">Maíz real</th>
                    <th className="font-bold pb-2">Estándar</th>
                    <th className="font-bold pb-2">Rend.</th>
                    <th className="font-bold pb-2">Muestras</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {datos.dias.slice().reverse().map(d => {
                    const rend = rendimiento(d.maizReal, d.maizEstandar)
                    return (
                      <tr key={d.fecha} className="text-right">
                        <td className="text-left py-2 font-bold text-gray-700">{d.fecha}</td>
                        <td className="py-2 text-gray-800">{fmtNum(d.paquetes)}</td>
                        <td className="py-2 text-gray-600">{fmtNum(d.kg, 1)}</td>
                        <td className="py-2 text-gray-600">{d.maizReal ? fmtNum(d.maizReal, 2) : '—'}</td>
                        <td className="py-2 text-gray-600">{fmtNum(d.maizEstandar, 2)}</td>
                        <td className={`py-2 font-bold ${colorRend(rend)}`}>{rend === null ? '—' : `${fmtNum(rend, 1)}%`}</td>
                        <td className={`py-2 ${d.fueraRango > 0 ? 'text-brand font-bold' : 'text-gray-500'}`}>
                          {d.muestras}{d.fueraRango > 0 ? ` (${d.fueraRango} ⚠)` : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-2">Rendimiento = maíz que debía gastarse según lo producido ÷ maíz puesto. 100% = lo esperado; en rojo si se aleja más de 3%.</p>
          </div>
        </>
      )}
    </div>
  )
}

function Resumen({ label, valor, clase }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-3 text-center">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-lg font-black ${clase || 'text-gray-800'}`}>{valor}</p>
    </div>
  )
}
