'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { puedeVerModulo } from '@/lib/permisos'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { PageHeader } from '@/components/ui'
import { cargarContextoPreciosRuta, precioEfectivo } from '@/lib/precios-ruta-helpers'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts'

const fmt = (v) => `$${Math.round(v || 0).toLocaleString('es-CO')}`
const mesActual = () => obtenerFechaActual().slice(0, 7)
const rangoMes = (mes) => {
  const [y, m] = mes.split('-').map(Number)
  const ultimoDia = new Date(y, m, 0).getDate()
  return { inicio: `${mes}-01`, fin: `${mes}-${String(ultimoDia).padStart(2, '0')}` }
}

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
    if (!puedeVerModulo(parsed, 'costeo', ['admin'])) { router.push('/despacho'); return }
    setUsuario(parsed)
  }, [])

  useEffect(() => { if (usuario) cargar() }, [mes, usuario])

  const cargar = async () => {
    setCargando(true)
    const empresaId = getEmpresaId()
    const { inicio: desde, fin: hasta } = rangoMes(mes)

    const resultados = await Promise.all([
      supabase.from('ventas_encab').select('total').eq('empresa_id', empresaId).eq('estado', 'confirmada').gte('fecha', desde).lte('fecha', hasta),
      supabase.from('liquidaciones').select('despacho_id, sku, vendido_neto').eq('empresa_id', empresaId).gte('fecha', desde).lte('fecha', hasta),
      supabase.from('produccion_lotes').select('id, produccion_detalle(formula_id, cantidad_producida)').eq('empresa_id', empresaId).gte('fecha', desde).lte('fecha', hasta),
      supabase.from('formulas').select('*, formulas_detalle(*)').eq('empresa_id', empresaId),
      supabase.from('productos').select('id, sku, nombre, precio_venta, costo_compra, peso_estandar_g, consumo_por_cochada').eq('empresa_id', empresaId),
      supabase.from('empleados').select('salario_base').eq('empresa_id', empresaId).eq('activo', true).eq('es_mano_obra_directa', true),
      supabase.from('gastos_admin').select('categoria, valor').eq('empresa_id', empresaId).gte('fecha', desde).lte('fecha', hasta),
      supabase.from('categorias_gasto').select('nombre, tipo_costo').eq('empresa_id', empresaId).eq('tipo', 'admin'),
      supabase.from('produccion_cochadas').select('materia_prima_id, cantidad').eq('empresa_id', empresaId).eq('anulada', false).gte('fecha', desde).lte('fecha', hasta),
    ])
    const errorQuery = resultados.find(r => r.error)
    if (errorQuery) alert('Error cargando el costeo del mes: ' + errorQuery.error.message)
    const [
      { data: ventas },
      { data: liquidaciones },
      { data: lotes },
      { data: formulas },
      { data: productos },
      { data: empleados },
      { data: gastos },
      { data: categoriasGasto },
      { data: cochadas },
    ] = resultados

    const precioVentaPorSku = Object.fromEntries((productos || []).map(p => [p.sku, p.precio_venta || 0]))
    const costoCompraPorId = Object.fromEntries((productos || []).map(p => [p.id, p.costo_compra || 0]))
    const formulasPorId = Object.fromEntries((formulas || []).map(f => [f.id, f]))
    const tipoCostoPorCategoria = Object.fromEntries((categoriasGasto || []).map(c => [c.nombre, c.tipo_costo]))
    const ctxPreciosRuta = await cargarContextoPreciosRuta((liquidaciones || []).map(l => l.despacho_id))

    const ventasDirectas = (ventas || []).reduce((s, v) => s + (v.total || 0), 0)
    const ventasRuta = (liquidaciones || []).reduce((s, l) =>
      s + (l.vendido_neto || 0) * precioEfectivo(l.despacho_id, l.sku, precioVentaPorSku[l.sku] || 0, ctxPreciosRuta), 0)
    const ingresos = ventasDirectas + ventasRuta

    const productoPorId = Object.fromEntries((productos || []).map(p => [p.id, p]))

    // Consumo estandar (segun formula) por materia prima y paquetes por formula.
    const estandarPorMP = {}
    const paquetesPorFormula = {}
    ;(lotes || []).forEach(lote => {
      ;(lote.produccion_detalle || []).forEach(d => {
        const f = formulasPorId[d.formula_id]
        if (!f || !f.rendimiento) return
        paquetesPorFormula[f.id] = (paquetesPorFormula[f.id] || 0) + d.cantidad_producida
        const factor = d.cantidad_producida / f.rendimiento
        ;(f.formulas_detalle || []).forEach(i => {
          estandarPorMP[i.materia_prima_id] = (estandarPorMP[i.materia_prima_id] || 0) + i.cantidad * factor
        })
      })
    })

    // Materias primas por cochada (maiz): se cuesta lo realmente puesto. Si en
    // el mes no se registro ninguna cochada se usa el estandar, para no dejar
    // la materia prima en $0.
    const realPorMP = {}
    ;(cochadas || []).forEach(c => { realPorMP[c.materia_prima_id] = (realPorMP[c.materia_prima_id] || 0) + Number(c.cantidad) })
    const consumoCosteadoPorMP = {}
    const rendimientos = []
    Object.keys(estandarPorMP).concat(Object.keys(realPorMP)).forEach(mpId => {
      if (mpId in consumoCosteadoPorMP) return
      const mp = productoPorId[mpId]
      const estandar = estandarPorMP[mpId] || 0
      const real = realPorMP[mpId] || 0
      if (mp?.consumo_por_cochada && real > 0) {
        consumoCosteadoPorMP[mpId] = real
        rendimientos.push({ nombre: mp.nombre, real, estandar, costoUnit: costoCompraPorId[mpId] || 0 })
      } else {
        consumoCosteadoPorMP[mpId] = estandar
      }
    })
    const costoMPD = Object.entries(consumoCosteadoPorMP).reduce((s, [mpId, cant]) => s + cant * (costoCompraPorId[mpId] || 0), 0)
    const factorRealPorMP = Object.fromEntries(Object.keys(consumoCosteadoPorMP).map(mpId => [
      mpId, estandarPorMP[mpId] > 0 ? consumoCosteadoPorMP[mpId] / estandarPorMP[mpId] : 1,
    ]))

    // En el mes en curso la nomina se prorratea a los dias transcurridos, para
    // poder ver el costo dia a dia sin cargar el mes completo desde el dia 1.
    const nominaMes = (empleados || []).reduce((s, e) => s + (e.salario_base || 0), 0)
    const [anio, mesNum] = mes.split('-').map(Number)
    const diasMes = new Date(anio, mesNum, 0).getDate()
    const hoyStr = obtenerFechaActual()
    const esMesEnCurso = hoyStr.slice(0, 7) === mes
    const diasTranscurridos = esMesEnCurso ? Number(hoyStr.slice(8, 10)) : diasMes
    const costoMOD = nominaMes * (diasTranscurridos / diasMes)

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

    // Costo por paquete: materia prima por formula (ajustada por el rendimiento
    // real del mes) + mano de obra y CIF repartidos por gramo producido (un
    // paquete de 1.350 g carga mas que uno de 537 g).
    const filasFormula = (formulas || []).filter(f => paquetesPorFormula[f.id] > 0 && f.rendimiento > 0)
    const pesoDe = (f) => Number(productoPorId[f.producto_id]?.peso_estandar_g) || 0
    const usarGramos = filasFormula.every(f => pesoDe(f) > 0)
    const baseReparto = filasFormula.reduce((s, f) => s + paquetesPorFormula[f.id] * (usarGramos ? pesoDe(f) : 1), 0)
    const conversionPorUnidadBase = baseReparto > 0 ? (costoMOD + cif) / baseReparto : 0
    const costosPorPaquete = filasFormula.map(f => {
      const prod = productoPorId[f.producto_id]
      const mp = (f.formulas_detalle || []).reduce((s, i) =>
        s + (i.cantidad / f.rendimiento) * (costoCompraPorId[i.materia_prima_id] || 0) * (factorRealPorMP[i.materia_prima_id] || 1), 0)
      const conversion = conversionPorUnidadBase * (usarGramos ? pesoDe(f) : 1)
      const total = mp + conversion
      const precio = prod?.precio_venta || 0
      return { id: f.id, nombre: prod?.nombre || f.nombre, paquetes: paquetesPorFormula[f.id], mp, conversion, total, precio, margen: precio > 0 ? (precio - total) / precio : null }
    }).sort((a, b) => b.paquetes - a.paquetes)
    const faltanCostos = (formulas || []).some(f => (f.formulas_detalle || []).some(i => !costoCompraPorId[i.materia_prima_id]))

    setDatos({
      ingresos, ventasDirectas, ventasRuta, costoMPD, costoMOD, costosVariables,
      costosFijos, cif, costosFijosTotal, sinClasificar,
      margenContribucion, margenContribucionPct, utilidad, puntoEquilibrio, costoProduccion,
      rendimientos, costosPorPaquete, usarGramos, faltanCostos,
      esMesEnCurso, diasTranscurridos, diasMes,
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

            <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
              <p className="font-black text-gray-700 mb-3">Ingresos, costos y utilidad</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={[
                  { nombre: 'Ingresos', valor: datos.ingresos },
                  { nombre: 'Materia prima', valor: datos.costoMPD },
                  { nombre: 'Mano de obra', valor: datos.costoMOD },
                  { nombre: 'CIF', valor: datos.cif },
                  { nombre: 'Costos fijos', valor: datos.costosFijos },
                  { nombre: 'Utilidad', valor: datos.utilidad },
                ]} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" fontSize={12} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="nombre" fontSize={12} width={110} />
                  <Tooltip formatter={v => `$${v.toLocaleString('es-CO')}`} />
                  <Bar dataKey="valor" radius={[0, 6, 6, 0]}>
                    {[datos.ingresos, datos.costoMPD, datos.costoMOD, datos.cif, datos.costosFijos, datos.utilidad].map((v, i) => (
                      <Cell key={i} fill={i === 0 ? '#1a1a1a' : i === 5 ? (v >= 0 ? '#059669' : '#C41230') : '#9c0e26'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <p className="font-black text-gray-700 mb-3">Cascada del mes</p>
              <FilaWaterfall label="Ingresos" valor={datos.ingresos} bold />
              <FilaWaterfall label="− Materia prima consumida (MPD)" valor={-datos.costoMPD} />
              <FilaWaterfall label={datos.esMesEnCurso && datos.diasTranscurridos < datos.diasMes
                ? `− Mano de obra directa (MOD, ${datos.diasTranscurridos} de ${datos.diasMes} días)`
                : '− Mano de obra directa (MOD)'} valor={-datos.costoMOD} />
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

            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <p className="font-black text-gray-700 mb-2">Costo de producción (MPD + MOD + CIF)</p>
              <p className="text-2xl font-black text-gray-800">{fmt(datos.costoProduccion)}</p>
            </div>

            {datos.rendimientos.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
                <p className="font-black text-gray-700 mb-1">Rendimiento del mes</p>
                <p className="text-xs text-gray-400 mb-3">Lo que se puso de verdad (cochadas) vs lo que debía gastarse según los paquetes producidos.</p>
                {datos.rendimientos.map(r => {
                  const pct = r.real > 0 ? (r.estandar / r.real) * 100 : 0
                  const dif = r.real - r.estandar
                  return (
                    <div key={r.nombre} className="text-sm">
                      <FilaWaterfall label={`${r.nombre} real`} valor={null} texto={`${r.real.toFixed(2)} bultos`} />
                      <FilaWaterfall label="Estándar según producción" valor={null} texto={`${r.estandar.toFixed(2)} bultos`} />
                      <FilaWaterfall label="Rendimiento" valor={null} texto={`${pct.toFixed(1)}%`} bold />
                      <p className="text-xs text-gray-500 mt-1">
                        {dif > 0
                          ? `Se gastaron ${dif.toFixed(2)} bultos más de lo estándar${r.costoUnit ? ` (${fmt(dif * r.costoUnit)})` : ''}.`
                          : `Se gastaron ${Math.abs(dif).toFixed(2)} bultos menos de lo estándar — revisa que el gramaje no esté por debajo.`}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}

            {datos.costosPorPaquete.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-4">
                <p className="font-black text-gray-700 mb-1">Costo por paquete {datos.esMesEnCurso ? '(mes en curso, se actualiza cada día)' : ''}</p>
                <p className="text-xs text-gray-400 mb-3">
                  Materia prima según fórmula, ajustada por el rendimiento real del mes. Mano de obra y CIF del mes repartidos {datos.usarGramos ? 'por gramo producido' : 'por paquete'}.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <thead>
                      <tr className="text-xs text-gray-400 text-right">
                        <th className="text-left font-bold pb-2">Producto</th>
                        <th className="font-bold pb-2">Paq.</th>
                        <th className="font-bold pb-2">Mat. prima</th>
                        <th className="font-bold pb-2">MO + CIF</th>
                        <th className="font-bold pb-2">Costo</th>
                        <th className="font-bold pb-2">Precio</th>
                        <th className="font-bold pb-2">Margen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {datos.costosPorPaquete.map(c => (
                        <tr key={c.id} className="text-right">
                          <td className="text-left py-2 font-bold text-gray-700">{c.nombre}</td>
                          <td className="py-2 text-gray-600">{c.paquetes.toLocaleString('es-CO')}</td>
                          <td className="py-2 text-gray-600">{fmt(c.mp)}</td>
                          <td className="py-2 text-gray-600">{fmt(c.conversion)}</td>
                          <td className="py-2 font-black text-gray-800">{fmt(c.total)}</td>
                          <td className="py-2 text-gray-600">{c.precio ? fmt(c.precio) : '—'}</td>
                          <td className={`py-2 font-bold ${c.margen === null ? 'text-gray-400' : c.margen >= 0 ? 'text-emerald-600' : 'text-brand'}`}>
                            {c.margen === null ? '—' : `${(c.margen * 100).toFixed(0)}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {datos.faltanCostos && (
                  <p className="text-xs text-amber-600 mt-3">⚠ Hay materias primas sin costo de compra en Maestros — el costo de materia prima sale incompleto.</p>
                )}
                {datos.esMesEnCurso && (
                  <p className="text-xs text-gray-400 mt-2">Los gastos que se pagan una vez al mes (luz, gas, arriendo de planta) entran al CIF cuando se registran en Gastos Admin; antes de eso el costo sale por debajo.</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function FilaWaterfall({ label, valor, bold, destacar, texto }) {
  return (
    <div className="flex justify-between items-center py-1">
      <p className={`text-sm ${bold ? 'font-bold text-gray-800' : 'text-gray-500'}`}>{label}</p>
      <p className={`text-sm ${bold ? 'font-black' : 'font-bold'} ${destacar ? (valor >= 0 ? 'text-emerald-600' : 'text-brand') : 'text-gray-800'}`}>{texto ?? fmt(valor)}</p>
    </div>
  )
}
