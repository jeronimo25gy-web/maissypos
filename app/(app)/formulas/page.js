'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { puedeVerModulo } from '@/lib/permisos'
import { PageHeader } from '@/components/ui'

const fmt = (v) => `$${Math.round(v || 0).toLocaleString('es-CO')}`

export default function Formulas() {
  const [usuario, setUsuario] = useState(null)
  const [formulas, setFormulas] = useState([])
  const [productosTerminados, setProductosTerminados] = useState([])
  const [materiasPrimas, setMateriasPrimas] = useState([])
  const [editando, setEditando] = useState(null)
  const [creando, setCreando] = useState(false)
  const [cargando, setCargando] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (!puedeVerModulo(parsed, 'formulas', ['admin'])) { router.push('/despacho'); return }
    setUsuario(parsed)
    cargarTodo()
  }, [])

  const cargarTodo = async () => {
    setCargando(true)
    const empresaId = getEmpresaId()
    const [{ data: formulasData }, { data: productos } ] = await Promise.all([
      supabase.from('formulas').select('*, formulas_detalle(*)').eq('empresa_id', empresaId).order('nombre'),
      // Sin filtro de estado: si se desactiva una materia prima ya usada en
      // una formula, su costo_compra debe seguir resolviendo (no caer a 0).
      // El picker de ingredientes en FormFormula si filtra por activo.
      supabase.from('productos').select('id, sku, nombre, tipo, precio_venta, costo_compra, estado').eq('empresa_id', empresaId).order('nombre'),
    ])
    setProductosTerminados((productos || []).filter(p => p.tipo !== 'materia_prima' && p.estado))
    setMateriasPrimas((productos || []).filter(p => p.tipo === 'materia_prima'))
    setFormulas(formulasData || [])
    setCargando(false)
  }

  const costoUnitario = (materiaPrimaId) => materiasPrimas.find(m => m.id === materiaPrimaId)?.costo_compra || 0

  const costoFormula = (f) => (f.formulas_detalle || []).reduce((s, d) => s + d.cantidad * costoUnitario(d.materia_prima_id), 0)

  const eliminarFormula = async (f) => {
    if (!confirm(`¿Desactivar la formula "${f.nombre}"? No se borra, solo deja de aparecer para produccion nueva.`)) return
    await supabase.from('formulas').update({ activo: false }).eq('id', f.id)
    cargarTodo()
  }

  if (!usuario) return null

  return (
    <div>
      <PageHeader title="Fórmulas" subtitle="Receta y costeo de materia prima por producto" />
      <div className="p-4 max-w-2xl mx-auto">
        {cargando ? (
          <p className="text-gray-400 text-center py-10">Cargando...</p>
        ) : (
          <>
            <div className="flex justify-between items-center mb-3">
              <p className="text-xs text-gray-500">{formulas.filter(f => f.activo).length} fórmulas activas</p>
              <button onClick={() => { setCreando(true); setEditando(null) }}
                className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-lg text-sm font-bold">+ Nueva fórmula</button>
            </div>

            {creando && (
              <FormFormula
                productosTerminados={productosTerminados}
                materiasPrimas={materiasPrimas}
                onGuardado={() => { setCreando(false); cargarTodo() }}
                onCancelar={() => setCreando(false)}
              />
            )}

            <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
              {formulas.filter(f => f.activo).length === 0 && !creando && (
                <p className="text-gray-400 text-sm p-4">Sin fórmulas todavía — crea la primera arriba.</p>
              )}
              {formulas.filter(f => f.activo).map(f => {
                const producto = productosTerminados.find(p => p.id === f.producto_id)
                const costoTotal = costoFormula(f)
                const costoPorUnidad = f.rendimiento > 0 ? costoTotal / f.rendimiento : 0
                const margen = (producto?.precio_venta || 0) - costoPorUnidad
                const margenPct = producto?.precio_venta > 0 ? (margen / producto.precio_venta) * 100 : null
                return (
                  <div key={f.id} className="p-4">
                    {editando === f.id ? (
                      <FormFormula
                        formula={f}
                        productosTerminados={productosTerminados}
                        materiasPrimas={materiasPrimas}
                        onGuardado={() => { setEditando(null); cargarTodo() }}
                        onCancelar={() => setEditando(null)}
                      />
                    ) : (
                      <>
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-bold text-gray-800">{f.nombre}</p>
                            <p className="text-xs text-gray-400">{producto?.nombre || 'Producto no encontrado'} · rinde {f.rendimiento} und</p>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => { setEditando(f.id); setCreando(false) }} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg font-bold">Editar</button>
                            <button onClick={() => eliminarFormula(f)} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg font-bold">Desactivar</button>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 bg-gray-50 rounded-lg p-3">
                          <div className="text-center">
                            <p className="text-xs text-gray-400">Costo total</p>
                            <p className="font-black text-gray-800">{fmt(costoTotal)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-400">Costo/unidad</p>
                            <p className="font-black text-gray-800">{fmt(costoPorUnidad)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-400">Margen</p>
                            <p className={`font-black ${margen >= 0 ? 'text-gray-800' : 'text-brand'}`}>
                              {margenPct !== null ? `${margenPct.toFixed(0)}%` : '—'}
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function FormFormula({ formula, productosTerminados, materiasPrimas, onGuardado, onCancelar }) {
  const [nombre, setNombre] = useState(formula?.nombre || '')
  const [productoId, setProductoId] = useState(formula?.producto_id || '')
  const [rendimiento, setRendimiento] = useState(formula?.rendimiento ?? 1)
  const [ingredientes, setIngredientes] = useState(
    formula?.formulas_detalle?.length > 0
      ? formula.formulas_detalle.map(d => ({ materia_prima_id: d.materia_prima_id, cantidad: String(d.cantidad) }))
      : [{ materia_prima_id: '', cantidad: '' }]
  )
  const [guardando, setGuardando] = useState(false)

  const costoUnitario = (id) => materiasPrimas.find(m => m.id === id)?.costo_compra || 0
  const producto = productosTerminados.find(p => p.id === productoId)
  const costoTotal = ingredientes.reduce((s, i) => s + (parseFloat(i.cantidad) || 0) * costoUnitario(i.materia_prima_id), 0)
  const rend = parseFloat(rendimiento) || 1
  const costoPorUnidad = costoTotal / rend
  const margen = (producto?.precio_venta || 0) - costoPorUnidad
  const margenPct = producto?.precio_venta > 0 ? (margen / producto.precio_venta) * 100 : null

  const agregarIngrediente = () => setIngredientes([...ingredientes, { materia_prima_id: '', cantidad: '' }])
  const quitarIngrediente = (i) => setIngredientes(ingredientes.filter((_, idx) => idx !== i))
  const actualizarIngrediente = (i, campo, valor) => {
    const n = [...ingredientes]
    n[i] = { ...n[i], [campo]: valor }
    setIngredientes(n)
  }

  const guardar = async () => {
    const validos = ingredientes.filter(i => i.materia_prima_id && parseFloat(i.cantidad) > 0)
    if (!nombre || !productoId || validos.length === 0) {
      alert('Nombre, producto terminado y al menos un ingrediente con cantidad son obligatorios')
      return
    }
    setGuardando(true)
    const empresaId = getEmpresaId()

    if (formula) {
      const { error } = await supabase.from('formulas').update({ nombre, producto_id: productoId, rendimiento: rend }).eq('id', formula.id)
      if (error) { alert('Error: ' + error.message); setGuardando(false); return }
      await supabase.from('formulas_detalle').delete().eq('formula_id', formula.id)
      const { error: errDet } = await supabase.from('formulas_detalle').insert(
        validos.map(i => ({ empresa_id: empresaId, formula_id: formula.id, materia_prima_id: i.materia_prima_id, cantidad: parseFloat(i.cantidad) }))
      )
      if (errDet) { alert('Error guardando ingredientes: ' + errDet.message); setGuardando(false); return }
    } else {
      const { data: nueva, error } = await supabase.from('formulas').insert({
        empresa_id: empresaId, nombre, producto_id: productoId, rendimiento: rend, activo: true,
      }).select().single()
      if (error) { alert('Error: ' + error.message); setGuardando(false); return }
      const { error: errDet } = await supabase.from('formulas_detalle').insert(
        validos.map(i => ({ empresa_id: empresaId, formula_id: nueva.id, materia_prima_id: i.materia_prima_id, cantidad: parseFloat(i.cantidad) }))
      )
      if (errDet) { alert('La formula se creo pero fallo al guardar ingredientes: ' + errDet.message); setGuardando(false); return }
    }
    setGuardando(false)
    onGuardado()
  }

  return (
    <div className="bg-gray-50 rounded-xl p-4 mb-3 border border-gray-200">
      <div className="mb-2">
        <label className="text-xs font-bold text-gray-600 block mb-1">Nombre de la fórmula</label>
        <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
          placeholder="Ej: Masa Arepa Tela"
          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none bg-white" />
      </div>
      <div className="flex gap-2 mb-3">
        <div className="flex-1">
          <label className="text-xs font-bold text-gray-600 block mb-1">Producto terminado que produce</label>
          <select value={productoId} onChange={e => setProductoId(e.target.value)}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none bg-white">
            <option value="">Selecciona producto</option>
            {productosTerminados.map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.sku})</option>)}
          </select>
        </div>
        <div className="w-32">
          <label className="text-xs font-bold text-gray-600 block mb-1">Rinde (und)</label>
          <input type="number" min="0.01" step="0.01" value={rendimiento} onChange={e => setRendimiento(e.target.value)}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none bg-white" />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-3">
        <div className="grid grid-cols-12 gap-1 px-3 py-2 bg-gray-100 text-xs font-bold text-gray-500">
          <div className="col-span-6">Materia prima</div>
          <div className="col-span-2">Cantidad</div>
          <div className="col-span-2">Costo/und</div>
          <div className="col-span-2">Subtotal</div>
        </div>
        {ingredientes.map((ing, i) => {
          const cu = costoUnitario(ing.materia_prima_id)
          const subtotal = (parseFloat(ing.cantidad) || 0) * cu
          return (
            <div key={i} className="grid grid-cols-12 gap-1 px-3 py-2 border-t border-gray-100 items-center">
              <select value={ing.materia_prima_id} onChange={e => actualizarIngrediente(i, 'materia_prima_id', e.target.value)}
                className="col-span-6 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-brand">
                <option value="">Selecciona...</option>
                {materiasPrimas.filter(m => m.estado || m.id === ing.materia_prima_id).map(m => (
                  <option key={m.id} value={m.id}>{m.nombre}{!m.estado ? ' (inactiva)' : ''}</option>
                ))}
              </select>
              <input type="number" min="0" step="0.01" value={ing.cantidad} onChange={e => actualizarIngrediente(i, 'cantidad', e.target.value)}
                className="col-span-2 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-brand" />
              <p className="col-span-2 text-xs text-gray-500 text-right">{fmt(cu)}</p>
              <div className="col-span-2 flex items-center justify-end gap-1">
                <p className="text-xs font-bold text-gray-700">{fmt(subtotal)}</p>
                <button onClick={() => quitarIngrediente(i)} className="text-gray-300 hover:text-brand text-xs px-1">✕</button>
              </div>
            </div>
          )
        })}
        <button onClick={agregarIngrediente} className="w-full text-xs font-bold text-brand py-2 border-t border-gray-100 hover:bg-brand/5">+ Agregar ingrediente</button>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center bg-white rounded-lg p-2 border border-gray-200">
          <p className="text-xs text-gray-400">Costo total</p>
          <p className="font-black text-gray-800 text-sm">{fmt(costoTotal)}</p>
        </div>
        <div className="text-center bg-white rounded-lg p-2 border border-gray-200">
          <p className="text-xs text-gray-400">Costo/unidad</p>
          <p className="font-black text-gray-800 text-sm">{fmt(costoPorUnidad)}</p>
        </div>
        <div className="text-center bg-white rounded-lg p-2 border border-gray-200">
          <p className="text-xs text-gray-400">Margen vs. venta</p>
          <p className={`font-black text-sm ${margen >= 0 ? 'text-gray-800' : 'text-brand'}`}>
            {margenPct !== null ? `${margenPct.toFixed(0)}%` : 'sin precio'}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={onCancelar} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-lg text-sm">Cancelar</button>
        <button onClick={guardar} disabled={guardando} className="flex-1 bg-brand hover:bg-brand-dark text-white font-bold py-2 rounded-lg text-sm disabled:opacity-50">
          {guardando ? 'Guardando...' : 'Guardar fórmula'}
        </button>
      </div>
    </div>
  )
}
