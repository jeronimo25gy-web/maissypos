'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { PageHeader } from '@/components/ui'

const fmt = (v) => `$${Math.round(v || 0).toLocaleString('es-CO')}`
const mesActual = () => obtenerFechaActual().slice(0, 7)

export default function Costeo() {
  const [usuario, setUsuario] = useState(null)
  const [mes, setMes] = useState(mesActual())
  const [cargando, setCargando] = useState(true)
  const [datos, setDatos] = useState(null)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (parsed.rol !== 'admin') { router.push('/despacho'); return }
    setUsuario(parsed)
  }, [])

  useEffect(() => { if (usuario) cargar() }, [mes, usuario])

  const cargar = async () => {
    setCargando(true)
    const empresaId = getEmpresaId()
    const desde = `${mes}-01`
    const hasta = `${mes}-31`

    const [
      { data: ventas },
      { data: liquidaciones },
      { data: lotes },
      { data: formulas },
      { data: productos },
      { data: empleados },
      { data: gastos },
      { data: categoriasGasto },
    ] = await Promise.all([
      supabase.from('ventas_encab').select('total').eq('empresa_id', empresaId).eq('estado', 'confirmada').gte('fecha', desde).lte('fecha', hasta),
      supabase.from('liquidaciones').select('sku, vendido_neto').eq('empresa_id', empresaId).gte('fecha', desde).lte('fecha', hasta),
      supabase.from('produccion_lotes').select('id, produccion_detalle(formula_id, cantidad_producida)').eq('empresa_id', empresaId).gte('fecha', desde).lte('fecha', hasta),
      supabase.from('formulas').select('*, formulas_detalle(*)').eq('empresa_id', empresaId),
      supabase.from('productos').select('id, sku, precio_venta, costo_compra').eq('empresa_id', empresaId),
      supabase.from('empleados').select('salario_base').eq('empresa_id', empresaId).eq('activo', true).eq('es_mano_obra_directa', true),
      supabase.from('gastos_admin').select('categoria, valor').eq('empresa_id', empresaId).gte('fecha', desde).lte('fecha', hasta),
      supabase.from('categorias_gasto').select('nombre, tipo_costo').eq('empresa_id', empresaId).eq('tipo', 'admin'),
    ])

    const precioVentaPorSku = Object.fromEntries((productos || []).map(p => [p.sku, p.precio_venta || 0]))
    const costoCompraPorId = Object.fromEntries((productos || []).map(p => [p.id, p.costo_compra || 0]))
    const formulasPorId = Object.fromEntries((formulas || []).map(f => [f.id, f]))
    const tipoCostoPorCategoria = Object.fromEntries((categoriasGasto || []).map(c => [c.nombre, c.tipo_costo]))

    const ventasDirectas = (ventas || []).reduce((s, v) => s + (v.total || 0), 0)
    const ventasRuta = (liquidaciones || []).reduce((s, l) => s + (l.vendido_neto || 0) * (precioVentaPorSku[l.sku] || 0), 0)
    const ingresos = ventasDirectas + ventasRuta

    let costoMPD = 0
    ;(lotes || []).forEach(lote => {
      ;(lote.produccion_detalle || []).forEach(d => {
        const f = formulasPorId[d.formula_id]
        if (!f || !f.rendimiento) return
        const factor = d.cantidad_producida / f.rendimiento
        const costoFormulaUnitario = (f.formulas_detalle || []).reduce((s, i) => s + i.cantidad * (costoCompraPorId[i.materia_prima_id] || 0), 0)
        costoMPD += costoFormulaUnitario * factor
      })
    })

    const costoMOD = (empleados || []).reduce((s, e) => s + (e.salario_base || 0), 0)

    let costosFijos = 0
    let cif = 0
    let sinClasificar = 0
    ;(gastos || []).forEach(g => {
      const tipo = tipoCostoPorCategoria[g.categoria]
      if (tipo === 'costo_fijo') costosFijos += g.valor || 0
      else if (tipo === 'cif') cif += g.valor || 0
      else sinClasificar += g.valor || 0
    })

    const costosVariables = costoMPD + costoMOD
    const costosFijosTotal = costosFijos + cif
    const margenContribucion = ingresos - costosVariables
    const margenContribucionPct = ingresos > 0 ? margenContribucion / ingresos : 0
    const utilidad = margenContribucion - costosFijosTotal
    const puntoEquilibrio = margenContribucionPct > 0 ? costosFijosTotal / margenContribucionPct : null
    const costoProduccion = costoMPD + costoMOD + cif

    setDatos({
      ingresos, ventasDirectas, ventasRuta, costoMPD, costoMOD, costosVariables,
      costosFijos, cif, costosFijosTotal, sinClasificar,
      margenContribucion, margenContribucionPct, utilidad, puntoEquilibrio, costoProduccion,
    })
    setCargando(false)
  }

  if (!usuario) return null

  return (
    <div>
      <PageHeader title="Costeo" subtitle="Margen de contribución y punto de equilibrio" />
      <div className="p-4 max-w-2xl mx-auto">
        <div className="mb-4">
          <input type="month" value={mes} onChange={e => setMes(e.target.value)}
            className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
        </div>

        {cargando || !datos ? (
          <p className="text-gray-400 text-center py-10">Cargando...</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-white rounded-xl shadow-sm p-4 text-center">
                <p className="text-xs text-gray-400 mb-1">Margen de contribución</p>
                <p className="text-2xl font-black text-gray-800">{(datos.margenContribucionPct * 100).toFixed(0)}%</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4 text-center">
                <p className="text-xs text-gray-400 mb-1">Punto de equilibrio</p>
                <p className="text-lg font-black text-gray-800">{datos.puntoEquilibrio !== null ? fmt(datos.puntoEquilibrio) : '—'}</p>
              </div>
            </div>

            <div className={`rounded-xl p-4 mb-4 ${datos.utilidad >= 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-brand/5 border border-brand/20'}`}>
              {datos.puntoEquilibrio === null ? (
                <p className="text-sm font-bold text-gray-600 text-center">Sin margen de contribución positivo este mes — no se puede calcular punto de equilibrio</p>
              ) : datos.ingresos >= datos.puntoEquilibrio ? (
                <p className="text-sm font-bold text-emerald-700 text-center">✓ Punto de equilibrio alcanzado — {fmt(datos.ingresos - datos.puntoEquilibrio)} por encima</p>
              ) : (
                <p className="text-sm font-bold text-brand text-center">Faltan {fmt(datos.puntoEquilibrio - datos.ingresos)} en ventas para llegar al punto de equilibrio</p>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <p className="font-black text-gray-700 mb-3">Cascada del mes</p>
              <FilaWaterfall label="Ingresos" valor={datos.ingresos} bold />
              <FilaWaterfall label="− Materia prima consumida (MPD)" valor={-datos.costoMPD} />
              <FilaWaterfall label="− Mano de obra directa (MOD)" valor={-datos.costoMOD} />
              <div className="border-t border-gray-100 my-2" />
              <FilaWaterfall label="= Margen de contribución" valor={datos.margenContribucion} bold />
              <FilaWaterfall label="− Costos fijos" valor={-datos.costosFijos} />
              <FilaWaterfall label="− CIF (indirectos de fabricación)" valor={-datos.cif} />
              <div className="border-t border-gray-100 my-2" />
              <FilaWaterfall label="= Utilidad" valor={datos.utilidad} bold destacar />
              {datos.sinClasificar > 0 && (
                <p className="text-xs text-amber-600 mt-3">⚠ {fmt(datos.sinClasificar)} en gastos sin clasificar como costo fijo o CIF — clasifícalos en Gastos Admin para que el cálculo sea exacto.</p>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4">
              <p className="font-black text-gray-700 mb-2">Costo de producción (MPD + MOD + CIF)</p>
              <p className="text-2xl font-black text-gray-800">{fmt(datos.costoProduccion)}</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function FilaWaterfall({ label, valor, bold, destacar }) {
  return (
    <div className="flex justify-between items-center py-1">
      <p className={`text-sm ${bold ? 'font-bold text-gray-800' : 'text-gray-500'}`}>{label}</p>
      <p className={`text-sm ${bold ? 'font-black' : 'font-bold'} ${destacar ? (valor >= 0 ? 'text-emerald-600' : 'text-brand') : 'text-gray-800'}`}>{fmt(valor)}</p>
    </div>
  )
}
