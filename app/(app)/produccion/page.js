'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { puedeVerModulo } from '@/lib/permisos'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { calcularStockPorSku } from '@/lib/inventario-helpers'
import { crearAlertaAdmin } from '@/lib/alertas-admin'
import { PageHeader } from '@/components/ui'
import InformeProduccion from './InformeProduccion'

const parsearPesos = (texto) => (texto || '')
  .split(/[,\s]+/)
  .map(v => parseFloat(v))
  .filter(v => !isNaN(v) && v > 0)

const hoy = obtenerFechaActual

export default function Produccion() {
  const [usuario, setUsuario] = useState(null)
  const [fecha, setFecha] = useState(hoy())
  const [operarioId, setOperarioId] = useState('')
  const [operarios, setOperarios] = useState([])
  const [formulas, setFormulas] = useState([])
  const [productosMap, setProductosMap] = useState({})
  const [cantidades, setCantidades] = useState({})
  const [muestrasPeso, setMuestrasPeso] = useState({})
  const [observaciones, setObservaciones] = useState('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [lotesHoy, setLotesHoy] = useState([])
  const [cochadasDia, setCochadasDia] = useState([])
  const [cochadaCant, setCochadaCant] = useState({})
  const [registrandoCochada, setRegistrandoCochada] = useState(false)
  const [vista, setVista] = useState('registrar')
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (!puedeVerModulo(parsed, 'produccion', ['admin', 'auxiliar'])) { router.push('/despacho'); return }
    setUsuario(parsed)
    cargarTodo()
  }, [])

  useEffect(() => { if (usuario) cargarLotesDelDia() }, [fecha, usuario])

  const cargarTodo = async () => {
    setCargando(true)
    const empresaId = getEmpresaId()
    const [{ data: emp }, { data: formulasData }, { data: productos }] = await Promise.all([
      supabase.from('empleados').select('id, nombre').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('formulas').select('*, formulas_detalle(*)').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('productos').select('id, sku, nombre, peso_estandar_g, tolerancia_gramaje_pct, consumo_por_cochada, costo_compra').eq('empresa_id', empresaId),
    ])
    setOperarios(emp || [])
    setFormulas(formulasData || [])
    setProductosMap(Object.fromEntries((productos || []).map(p => [p.id, p])))
    setCargando(false)
  }

  const cargarLotesDelDia = async () => {
    const { data } = await supabase.from('produccion_lotes')
      .select('*, produccion_detalle(*), empleados(nombre)')
      .eq('empresa_id', getEmpresaId()).eq('fecha', fecha).order('created_at', { ascending: false })
    const lotes = data || []
    if (lotes.length > 0) {
      const { data: muestras } = await supabase.from('produccion_muestras_peso')
        .select('*').in('lote_id', lotes.map(l => l.id))
      lotes.forEach(l => { l.muestras = (muestras || []).filter(m => m.lote_id === l.id) })
    }
    setLotesHoy(lotes)
    const { data: cochadas } = await supabase.from('produccion_cochadas')
      .select('*').eq('empresa_id', getEmpresaId()).eq('fecha', fecha).order('created_at', { ascending: true })
    setCochadasDia(cochadas || [])
  }

  // Materias primas que se descuentan por cochada (bultos reales puestos a
  // cocinar) en vez de por formula. Solo las que usa alguna formula activa.
  const materiasCochada = () => {
    const ids = new Set(formulas.flatMap(f => (f.formulas_detalle || []).map(d => d.materia_prima_id)))
    return Object.values(productosMap).filter(p => p.consumo_por_cochada && ids.has(p.id))
  }

  const registrarCochada = async (mp) => {
    const cantidad = parseFloat(cochadaCant[mp.id])
    if (!(cantidad > 0)) { alert('Ingresa cuantos bultos se pusieron'); return }
    setRegistrandoCochada(true)
    const empresaId = getEmpresaId()
    const { error } = await supabase.from('produccion_cochadas').insert({
      empresa_id: empresaId, fecha, materia_prima_id: mp.id, cantidad, registrado_por: usuario.nombre,
    })
    if (error) { alert('Error: ' + error.message); setRegistrandoCochada(false); return }
    const { error: errMov } = await supabase.from('inventario_mov').insert({
      empresa_id: empresaId, sku: mp.sku, cantidad, fecha, tipo_movimiento: 'salida',
      referencia: `Cochada: ${mp.nombre} puesto en produccion`,
    })
    if (errMov) alert('La cochada se guardo, pero no se pudo descontar del inventario: ' + errMov.message)
    setCochadaCant({ ...cochadaCant, [mp.id]: '' })
    setRegistrandoCochada(false)
    cargarLotesDelDia()
  }

  const anularCochada = async (c) => {
    const mp = productosMap[c.materia_prima_id]
    if (!confirm(`¿Anular la cochada de ${c.cantidad} bultos de ${mp?.nombre || 'materia prima'}? Se devuelve al inventario.`)) return
    const empresaId = getEmpresaId()
    const { error } = await supabase.from('produccion_cochadas')
      .update({ anulada: true, anulada_por: usuario.nombre }).eq('id', c.id).eq('empresa_id', empresaId)
    if (error) { alert('Error: ' + error.message); return }
    if (mp) {
      await supabase.from('inventario_mov').insert({
        empresa_id: empresaId, sku: mp.sku, cantidad: c.cantidad, fecha: c.fecha, tipo_movimiento: 'entrada',
        referencia: `Cochada anulada: ${mp.nombre}`,
      })
    }
    cargarLotesDelDia()
  }

  // Rendimiento del dia por materia prima de cochada: lo que la formula dice
  // que se debio gastar para lo producido (estandar) vs lo que realmente se
  // puso. 100% = rindio exactamente lo esperado.
  const rendimientoDia = () => materiasCochada().map(mp => {
    const real = cochadasDia.filter(c => !c.anulada && c.materia_prima_id === mp.id).reduce((s, c) => s + Number(c.cantidad), 0)
    let estandar = 0
    lotesHoy.forEach(l => (l.produccion_detalle || []).forEach(d => {
      const f = formulas.find(x => x.id === d.formula_id)
      if (!f || !(f.rendimiento > 0)) return
      ;(f.formulas_detalle || []).forEach(fd => {
        if (fd.materia_prima_id === mp.id) estandar += fd.cantidad * (d.cantidad_producida / f.rendimiento)
      })
    }))
    return { mp, real, estandar, pct: real > 0 ? (estandar / real) * 100 : null }
  })

  const guardar = async () => {
    const entradas = Object.entries(cantidades).filter(([, v]) => parseFloat(v) > 0)
    if (entradas.length === 0) { alert('Ingresa la cantidad producida de al menos una fórmula'); return }

    const consumoPorSku = {}
    for (const [formulaId, cant] of entradas) {
      const f = formulas.find(x => x.id === formulaId)
      if (!f) continue
      const factor = f.rendimiento > 0 ? parseFloat(cant) / f.rendimiento : 0
      for (const d of f.formulas_detalle || []) {
        const materiaPrima = productosMap[d.materia_prima_id]
        if (!materiaPrima || materiaPrima.consumo_por_cochada) continue
        consumoPorSku[materiaPrima.sku] = (consumoPorSku[materiaPrima.sku] || 0) + d.cantidad * factor
      }
    }
    if (Object.keys(consumoPorSku).length > 0) {
      const stockPorSku = await calcularStockPorSku()
      const nombrePorSku = Object.fromEntries(Object.values(productosMap).map(p => [p.sku, p.nombre]))
      const faltantes = Object.entries(consumoPorSku)
        .map(([sku, consumo]) => ({ sku, consumo, stock: stockPorSku[sku]?.stockActual }))
        .filter(f => f.stock !== undefined && f.consumo > f.stock)
      if (faltantes.length > 0) {
        const seguir = confirm(
          'Esta produccion va a dejar en negativo esta materia prima (segun el ultimo conteo):\n' +
          faltantes.map(f => `${nombrePorSku[f.sku] || f.sku}: disponible ${f.stock}, se va a consumir ${f.consumo}`).join('\n') +
          '\n\n¿Registrar de todas formas?'
        )
        if (!seguir) return
      }
    }

    setGuardando(true)
    const empresaId = getEmpresaId()

    const { data: lote, error: errLote } = await supabase.from('produccion_lotes').insert({
      empresa_id: empresaId, fecha, operario_id: operarioId || null, observaciones: observaciones || null,
    }).select().single()
    if (errLote) { alert('Error: ' + errLote.message); setGuardando(false); return }

    const { error: errDetalle } = await supabase.from('produccion_detalle').insert(
      entradas.map(([formulaId, cant]) => ({
        empresa_id: empresaId, lote_id: lote.id, formula_id: formulaId, cantidad_producida: parseFloat(cant),
      }))
    )
    if (errDetalle) { alert('El lote se creó pero fallaron los detalles: ' + errDetalle.message); setGuardando(false); return }

    const movimientos = []
    for (const [formulaId, cant] of entradas) {
      const f = formulas.find(x => x.id === formulaId)
      if (!f) continue
      const cantidadProducida = parseFloat(cant)
      const productoTerminado = productosMap[f.producto_id]
      if (productoTerminado) {
        movimientos.push({
          empresa_id: empresaId, sku: productoTerminado.sku, cantidad: cantidadProducida, fecha,
          tipo_movimiento: 'entrada', referencia: `Producción: ${f.nombre}`,
        })
      }
      const factor = f.rendimiento > 0 ? cantidadProducida / f.rendimiento : 0
      for (const d of f.formulas_detalle || []) {
        const materiaPrima = productosMap[d.materia_prima_id]
        // Las de cochada ya se descontaron con los bultos reales puestos.
        if (!materiaPrima || materiaPrima.consumo_por_cochada) continue
        movimientos.push({
          empresa_id: empresaId, sku: materiaPrima.sku, cantidad: d.cantidad * factor, fecha,
          tipo_movimiento: 'salida', referencia: `Producción: ${f.nombre}`,
        })
      }
    }
    if (movimientos.length > 0) {
      const { error: errMov } = await supabase.from('inventario_mov').insert(movimientos)
      if (errMov) alert('El lote se guardó, pero no se pudo actualizar el inventario: ' + errMov.message)
    }

    const muestrasAInsertar = []
    const fueraDeRango = []
    for (const [formulaId] of entradas) {
      const pesos = parsearPesos(muestrasPeso[formulaId])
      if (pesos.length === 0) continue
      const f = formulas.find(x => x.id === formulaId)
      const producto = f && productosMap[f.producto_id]
      if (!producto) continue
      const promedio = pesos.reduce((s, p) => s + p, 0) / pesos.length
      const estandar = producto.peso_estandar_g || null
      const desviacion = estandar ? ((promedio - estandar) / estandar) * 100 : null
      muestrasAInsertar.push({
        empresa_id: empresaId, lote_id: lote.id, producto_id: producto.id,
        pesos_individuales: pesos, peso_promedio_g: promedio,
        peso_estandar_g: estandar, desviacion_pct: desviacion,
      })
      const tolerancia = producto.tolerancia_gramaje_pct ?? 5
      if (estandar && Math.abs(desviacion) > tolerancia) {
        fueraDeRango.push({ nombre: producto.nombre, promedio, estandar, desviacion })
      }
    }
    if (muestrasAInsertar.length > 0) {
      await supabase.from('produccion_muestras_peso').insert(muestrasAInsertar)
    }
    if (fueraDeRango.length > 0) {
      const detalle = fueraDeRango.map(f =>
        `${f.nombre}: ${f.promedio.toFixed(0)}g promedio vs ${f.estandar.toFixed(0)}g estandar (${f.desviacion > 0 ? '+' : ''}${f.desviacion.toFixed(1)}%)`
      ).join('\n')
      await crearAlertaAdmin({
        empresaId, tipo: 'gramaje_fuera_de_rango',
        mensaje: `Gramaje fuera de tolerancia en produccion del ${fecha}:\n${detalle}`,
        referenciaTipo: 'produccion_lotes', referenciaId: lote.id,
      })
    }

    setCantidades({})
    setMuestrasPeso({})
    setObservaciones('')
    setGuardando(false)
    cargarLotesDelDia()
  }

  if (!usuario) return null

  return (
    <div>
      <PageHeader title="Producción" subtitle="Registro diario de lo producido" />
      <div className="p-4 max-w-2xl mx-auto">
        <div className="flex gap-2 mb-4">
          <button onClick={() => setVista('registrar')}
            className={`flex-1 py-2 rounded-xl text-sm font-bold ${vista === 'registrar' ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            Registrar
          </button>
          <button onClick={() => setVista('informe')}
            className={`flex-1 py-2 rounded-xl text-sm font-bold ${vista === 'informe' ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            Informe
          </button>
        </div>
        {vista === 'informe' ? <InformeProduccion /> : (
        <>
        {!cargando && materiasCochada().length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
            <p className="font-black text-gray-800 text-sm">Maíz puesto en producción ({fecha})</p>
            <p className="text-xs text-gray-400 mb-3">Registra los bultos reales cada vez que se monta una cochada (1, 1.5, 2...). Esto es lo que se descuenta del inventario; los paquetes se registran abajo por tandas.</p>
            {materiasCochada().map(mp => {
              const delDia = cochadasDia.filter(c => c.materia_prima_id === mp.id)
              return (
                <div key={mp.id} className="mb-2">
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-sm font-bold text-gray-700">{mp.nombre}</p>
                    <input type="number" min="0" step="0.5" placeholder="0"
                      value={cochadaCant[mp.id] || ''}
                      onChange={e => setCochadaCant({ ...cochadaCant, [mp.id]: e.target.value })}
                      className="w-20 text-center border-2 border-gray-200 rounded-lg px-2 py-2 text-sm font-bold text-gray-800 focus:border-brand focus:outline-none" />
                    <span className="text-xs text-gray-400">bultos</span>
                    <button onClick={() => registrarCochada(mp)} disabled={registrandoCochada}
                      className="bg-secondary hover:bg-black text-white text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50">
                      Registrar
                    </button>
                  </div>
                  {delDia.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {delDia.map(c => (
                        <div key={c.id} className="flex items-center justify-between text-xs">
                          <span className={c.anulada ? 'text-gray-300 line-through' : 'text-gray-600'}>
                            {Number(c.cantidad)} bultos · {new Date(c.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} · {c.registrado_por || ''}
                          </span>
                          {c.anulada
                            ? <span className="text-gray-400">anulada{c.anulada_por ? ` por ${c.anulada_por}` : ''}</span>
                            : <button onClick={() => anularCochada(c)} className="text-brand font-bold">Anular</button>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Operario</label>
              <select value={operarioId} onChange={e => setOperarioId(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
                <option value="">Sin especificar</option>
                {operarios.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
            </div>
          </div>

          {cargando ? (
            <p className="text-gray-400 text-center py-6 text-sm">Cargando fórmulas...</p>
          ) : formulas.length === 0 ? (
            <p className="text-gray-400 text-center py-6 text-sm">No hay fórmulas activas — crea una en Fórmulas primero.</p>
          ) : (
            <div className="space-y-2 mb-3">
              {formulas.map(f => {
                const producto = productosMap[f.producto_id]
                const pesos = parsearPesos(muestrasPeso[f.id])
                const promedio = pesos.length > 0 ? pesos.reduce((s, p) => s + p, 0) / pesos.length : null
                const estandar = producto?.peso_estandar_g || null
                const desviacion = promedio && estandar ? ((promedio - estandar) / estandar) * 100 : null
                const tolerancia = producto?.tolerancia_gramaje_pct ?? 5
                const dentroDeRango = desviacion === null || Math.abs(desviacion) <= tolerancia
                return (
                  <div key={f.id} className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <p className="font-bold text-gray-800 text-sm">{f.nombre}</p>
                        <p className="text-xs text-gray-400">{producto?.nombre || ''}</p>
                      </div>
                      <input type="number" min="0" step="0.01" placeholder="0"
                        value={cantidades[f.id] || ''}
                        onChange={e => setCantidades({ ...cantidades, [f.id]: e.target.value })}
                        className="w-24 text-center border-2 border-gray-200 rounded-lg px-2 py-2 text-sm font-bold text-gray-800 focus:border-brand focus:outline-none bg-white" />
                      <span className="text-xs text-gray-400 w-12">paquetes</span>
                    </div>
                    {parseFloat(cantidades[f.id]) > 0 && producto && (
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <label className="text-xs font-bold text-gray-500 block mb-1">
                          Muestra de peso (g) — opcional{estandar ? `, ej: pesa 10-15 paquetes de esta tanda` : ''}
                        </label>
                        <input type="text" placeholder="Ej: 530, 535, 540, 528, 542"
                          value={muestrasPeso[f.id] || ''}
                          onChange={e => setMuestrasPeso({ ...muestrasPeso, [f.id]: e.target.value })}
                          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none bg-white" />
                        {!estandar && pesos.length > 0 && (
                          <p className="text-xs text-gray-400 mt-1">Define un "Peso estandar" para {producto.nombre} en Maestros para poder comparar.</p>
                        )}
                        {promedio !== null && (
                          <p className={`text-xs font-bold mt-1 ${!estandar ? 'text-gray-500' : dentroDeRango ? 'text-secondary' : 'text-brand'}`}>
                            Promedio: {promedio.toFixed(1)} g
                            {estandar ? ` (${desviacion > 0 ? '+' : ''}${desviacion.toFixed(1)}% vs ${estandar}g estandar) ${dentroDeRango ? '✓ dentro de rango' : '⚠ fuera de rango'}` : ''}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="mb-3">
            <label className="text-xs font-bold text-gray-600 block mb-1">Observaciones (opcional)</label>
            <input type="text" value={observaciones} onChange={e => setObservaciones(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
          </div>

          <button onClick={guardar} disabled={guardando || formulas.length === 0}
            className="w-full bg-brand hover:bg-brand-dark text-white font-black py-3 rounded-xl disabled:opacity-50">
            {guardando ? 'Guardando...' : 'Registrar producción'}
          </button>
        </div>

        {rendimientoDia().some(r => r.real > 0 || r.estandar > 0) && (
          <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
            <p className="font-black text-gray-800 text-sm mb-2">Rendimiento del día</p>
            {rendimientoDia().filter(r => r.real > 0 || r.estandar > 0).map(r => {
              const diferencia = r.real - r.estandar
              const costo = (productosMap[r.mp.id]?.costo_compra || 0) * diferencia
              const fueraDeRango = r.pct !== null && Math.abs(r.pct - 100) > 3
              return (
                <div key={r.mp.id} className="text-sm">
                  <div className="flex justify-between py-1">
                    <span className="text-gray-600">{r.mp.nombre} puesto (real)</span>
                    <span className="font-bold text-gray-800">{r.real.toFixed(2)} bultos</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-gray-600">Lo que debía gastarse según lo producido</span>
                    <span className="font-bold text-gray-800">{r.estandar.toFixed(2)} bultos</span>
                  </div>
                  {r.pct !== null ? (
                    <>
                      <div className="flex justify-between py-1 border-t border-gray-100 mt-1">
                        <span className="font-bold text-gray-800">Rendimiento</span>
                        <span className={`font-black ${fueraDeRango ? 'text-brand' : 'text-emerald-600'}`}>{r.pct.toFixed(1)}%</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {Math.abs(diferencia) < 0.005
                          ? 'Rindió exactamente lo esperado.'
                          : diferencia > 0
                            ? `Se gastaron ${diferencia.toFixed(2)} bultos más de lo estándar${costo ? ` (≈ $${Math.round(costo).toLocaleString('es-CO')})` : ''}: merma, desperdicio o paquetes con sobrepeso. Revisa el gramaje.`
                            : `Rindió ${Math.abs(diferencia).toFixed(2)} bultos más de lo estándar: puede ser paquetes livianos. Revisa el gramaje.`}
                        {r.estandar === 0 ? ' Aún no hay paquetes registrados hoy.' : ''}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-500 mt-1">Registra arriba los bultos de maíz puestos hoy para ver el rendimiento real.</p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <p className="text-xs font-bold text-gray-500 mb-2 px-1">Lotes del día</p>
        {lotesHoy.length === 0 ? (
          <p className="text-gray-400 text-center py-6 text-sm">Sin producción registrada hoy</p>
        ) : (
          <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
            {lotesHoy.map(l => (
              <div key={l.id} className="p-4">
                <p className="text-xs text-gray-400 mb-1">{l.empleados?.nombre || 'Sin operario'}{l.observaciones ? ` · ${l.observaciones}` : ''}</p>
                {(l.produccion_detalle || []).map(d => {
                  const f = formulas.find(x => x.id === d.formula_id)
                  const muestra = (l.muestras || []).find(m => m.producto_id === f?.producto_id)
                  const fueraDeRango = muestra?.desviacion_pct !== null && muestra?.peso_estandar_g &&
                    Math.abs(muestra.desviacion_pct) > (productosMap[f?.producto_id]?.tolerancia_gramaje_pct ?? 5)
                  return (
                    <div key={d.id}>
                      <p className="text-sm text-gray-700">
                        <span className="font-bold">{d.cantidad_producida}</span> {f?.nombre || 'Fórmula'}
                      </p>
                      {muestra && (
                        <p className={`text-xs ${fueraDeRango ? 'text-brand font-bold' : 'text-gray-400'}`}>
                          Gramaje: {muestra.peso_promedio_g.toFixed(1)}g promedio
                          {muestra.peso_estandar_g ? ` (${muestra.desviacion_pct > 0 ? '+' : ''}${muestra.desviacion_pct.toFixed(1)}% vs ${muestra.peso_estandar_g}g)` : ''}
                          {fueraDeRango ? ' ⚠ fuera de rango' : ''}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
        </>
        )}
      </div>
    </div>
  )
}
