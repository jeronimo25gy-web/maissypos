'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { PageHeader } from '@/components/ui'

const hoy = obtenerFechaActual

export default function Produccion() {
  const [usuario, setUsuario] = useState(null)
  const [fecha, setFecha] = useState(hoy())
  const [operarioId, setOperarioId] = useState('')
  const [operarios, setOperarios] = useState([])
  const [formulas, setFormulas] = useState([])
  const [productosMap, setProductosMap] = useState({})
  const [cantidades, setCantidades] = useState({})
  const [observaciones, setObservaciones] = useState('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [lotesHoy, setLotesHoy] = useState([])
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (parsed.rol !== 'admin' && parsed.rol !== 'auxiliar') { router.push('/despacho'); return }
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
      supabase.from('productos').select('id, sku, nombre').eq('empresa_id', empresaId),
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
    setLotesHoy(data || [])
  }

  const guardar = async () => {
    const entradas = Object.entries(cantidades).filter(([, v]) => parseFloat(v) > 0)
    if (entradas.length === 0) { alert('Ingresa la cantidad producida de al menos una fórmula'); return }
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
        if (!materiaPrima) continue
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

    setCantidades({})
    setObservaciones('')
    setGuardando(false)
    cargarLotesDelDia()
  }

  if (!usuario) return null

  return (
    <div>
      <PageHeader title="Producción" subtitle="Registro diario de lo producido" />
      <div className="p-4 max-w-2xl mx-auto">
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
                return (
                  <div key={f.id} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                    <div className="flex-1">
                      <p className="font-bold text-gray-800 text-sm">{f.nombre}</p>
                      <p className="text-xs text-gray-400">{producto?.nombre || ''}</p>
                    </div>
                    <input type="number" min="0" step="0.01" placeholder="0"
                      value={cantidades[f.id] || ''}
                      onChange={e => setCantidades({ ...cantidades, [f.id]: e.target.value })}
                      className="w-24 text-center border-2 border-gray-200 rounded-lg px-2 py-2 text-sm font-bold text-gray-800 focus:border-brand focus:outline-none bg-white" />
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
                  return (
                    <p key={d.id} className="text-sm text-gray-700">
                      <span className="font-bold">{d.cantidad_producida}</span> {f?.nombre || 'Fórmula'}
                    </p>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
