'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { puedeVerModulo } from '@/lib/permisos'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { calcularStockPorSku } from '@/lib/inventario-helpers'
import { crearAlertaAdmin } from '@/lib/alertas-admin'
import CampoFecha from '@/components/CampoFecha'

const parsearPesos = (texto) => (texto || '')
  .split(/[,\s]+/)
  .map(v => parseFloat(v))
  .filter(v => !isNaN(v) && v > 0)

const hoy = obtenerFechaActual
// El Kilo de Masa no se anota aquí: se registra al venderlo en el mostrador y
// esa venta cuenta como producción del día (rendimiento del maíz).
const esMasa = (p) => !!p && (p.por_peso || /kilo de masa/i.test(p.nombre || ''))

// Anotar producción a mano: el registro de antes (maíz puesto y paquetes por
// fórmula). Solo para un día sin tablet en la planta.
export default function AnotarAMano() {
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
  const [corrigiendo, setCorrigiendo] = useState(null)
  const [guardandoCorreccion, setGuardandoCorreccion] = useState(false)
  // Cierre del día: con el día cerrado ya no se suma producción ni maíz.
  const [dia, setDia] = useState(null)
  const [cerrando, setCerrando] = useState(null) // { [materia_prima_id]: bultos }
  const [guardandoCierre, setGuardandoCierre] = useState(false)
  const [masaVendida, setMasaVendida] = useState(0) // kilos de masa vendidos ese día en el mostrador
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/entrar'); return }
    const parsed = JSON.parse(u)
    if (!puedeVerModulo(parsed, 'produccion', ['admin', 'auxiliar'])) { router.push('/despacho'); return }
    setUsuario(parsed)
    cargarTodo()
  }, [])

  useEffect(() => { if (usuario && !cargando) cargarLotesDelDia() }, [fecha, usuario, cargando])

  const cargarTodo = async () => {
    setCargando(true)
    const empresaId = getEmpresaId()
    const [{ data: emp }, { data: formulasData }, { data: productos }] = await Promise.all([
      supabase.from('empleados').select('id, nombre').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('formulas').select('*, formulas_detalle(*)').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('productos').select('id, sku, nombre, peso_estandar_g, tolerancia_gramaje_pct, consumo_por_cochada, costo_compra, bolsa_id, por_peso').eq('empresa_id', empresaId),
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
    const masa = Object.values(productosMap).find(esMasa)
    if (masa) {
      const { data: vm } = await supabase.from('ventas_detalle').select('cantidad, ventas_encab!inner(fecha, estado)')
        .eq('empresa_id', getEmpresaId()).eq('sku', masa.sku).eq('ventas_encab.fecha', fecha).neq('ventas_encab.estado', 'anulada')
      setMasaVendida((vm || []).reduce((t, x) => t + Number(x.cantidad || 0), 0))
    } else setMasaVendida(0)
    const { data: d } = await supabase.from('produccion_dias').select('*').eq('empresa_id', getEmpresaId()).eq('fecha', fecha).maybeSingle()
    setDia(d || null)
    setCerrando(null)
  }

  const diaCerrado = !!dia?.cerrado_at
  const bultosRegistrados = (mpId) => cochadasDia.filter(c => !c.anulada && c.materia_prima_id === mpId).reduce((t, c) => t + Number(c.cantidad), 0)

  const abrirCierre = () => {
    if (Object.values(cantidades).some(v => parseFloat(v) > 0)) { alert('Hay cantidades escritas sin sumar. Súmalas o bórralas antes de cerrar el día.'); return }
    setCerrando(Object.fromEntries(materiasCochada().map(mp => [mp.id, String(bultosRegistrados(mp.id) || '')])))
  }

  // Al cerrar se dejan los bultos del día en lo que se escribió: si cambió,
  // se anulan las cochadas anotadas y queda una sola con el total.
  const cerrarDia = async () => {
    setGuardandoCierre(true)
    const empresaId = getEmpresaId()
    for (const mp of materiasCochada()) {
      const nuevo = parseFloat(cerrando[mp.id]) || 0
      const actual = bultosRegistrados(mp.id)
      if (Math.abs(nuevo - actual) < 0.001) continue
      for (const c of cochadasDia.filter(x => !x.anulada && x.materia_prima_id === mp.id)) {
        await supabase.from('produccion_cochadas').update({ anulada: true, anulada_por: usuario.nombre }).eq('id', c.id).eq('empresa_id', empresaId)
      }
      if (actual > 0) await supabase.from('inventario_mov').insert({ empresa_id: empresaId, sku: mp.sku, cantidad: actual, fecha, tipo_movimiento: 'entrada', referencia: `Cochada anulada: ${mp.nombre}` })
      if (nuevo > 0) {
        const { error } = await supabase.from('produccion_cochadas').insert({ empresa_id: empresaId, fecha, materia_prima_id: mp.id, cantidad: nuevo, registrado_por: usuario.nombre })
        if (error) { alert('No se pudo guardar el maíz: ' + error.message); setGuardandoCierre(false); return }
        await supabase.from('inventario_mov').insert({ empresa_id: empresaId, sku: mp.sku, cantidad: nuevo, fecha, tipo_movimiento: 'salida', referencia: `Cochada: ${mp.nombre} puesto en produccion` })
      }
    }
    const { error } = await supabase.from('produccion_dias').upsert({ empresa_id: empresaId, fecha, cerrado_at: new Date().toISOString(), cerrado_por: usuario.nombre }, { onConflict: 'empresa_id,fecha' })
    setGuardandoCierre(false)
    if (error) { alert('No se pudo cerrar el día: ' + error.message); return }
    cargarLotesDelDia()
  }

  const reabrirDia = async () => {
    const { error } = await supabase.from('produccion_dias').update({ cerrado_at: null, cerrado_por: null }).eq('id', dia.id).eq('empresa_id', getEmpresaId())
    if (error) { alert('No se pudo reabrir: ' + error.message); return }
    cargarLotesDelDia()
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

  // Corrige un lote mal digitado: la funcion de la base guarda la cantidad
  // original y quien corrigio, y ajusta el inventario con la diferencia.
  const guardarCorreccion = async () => {
    const cantidad = parseFloat(corrigiendo.valor)
    if (isNaN(cantidad) || cantidad < 0) { alert('Ingresa una cantidad valida'); return }
    setGuardandoCorreccion(true)
    const { error } = await supabase.rpc('corregir_produccion_detalle', {
      p_detalle_id: corrigiendo.id, p_cantidad: cantidad, p_usuario_nombre: usuario.nombre,
    })
    setGuardandoCorreccion(false)
    if (error) { alert('No se pudo corregir: ' + error.message); return }
    setCorrigiendo(null)
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
    const fMasa = formulas.find(f => esMasa(productosMap[f.producto_id]))
    if (fMasa && fMasa.rendimiento > 0 && masaVendida > 0) {
      ;(fMasa.formulas_detalle || []).forEach(fd => { if (fd.materia_prima_id === mp.id) estandar += fd.cantidad * (masaVendida / fMasa.rendimiento) })
    }
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

    // Si ese día ya tiene producción anotada, lo nuevo se suma a ese mismo
    // registro: es el mismo lote del día, no uno nuevo.
    let lote = lotesHoy.find(l => l.fecha === fecha) || null
    if (lote) {
      const cambios = {}
      if (operarioId && !lote.operario_id) cambios.operario_id = operarioId
      if (observaciones) cambios.observaciones = [lote.observaciones, observaciones].filter(Boolean).join(' · ')
      if (Object.keys(cambios).length) await supabase.from('produccion_lotes').update(cambios).eq('id', lote.id).eq('empresa_id', empresaId)
    } else {
      const { data: nuevo, error: errLote } = await supabase.from('produccion_lotes').insert({
        empresa_id: empresaId, fecha, operario_id: operarioId || null, observaciones: observaciones || null,
      }).select().single()
      if (errLote) { alert('Error: ' + errLote.message); setGuardando(false); return }
      lote = nuevo
    }

    const { error: errDetalle } = await supabase.from('produccion_detalle').insert(
      entradas.map(([formulaId, cant]) => ({
        empresa_id: empresaId, lote_id: lote.id, formula_id: formulaId, cantidad_producida: parseFloat(cant),
      }))
    )
    if (errDetalle) { alert('No se pudo guardar la producción: ' + errDetalle.message); setGuardando(false); return }

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
      // Anotado a mano no se sabe en cuál se empacó: sale de la bolsa principal.
      const bolsa = productosMap[productoTerminado?.bolsa_id]
      if (bolsa) {
        movimientos.push({
          empresa_id: empresaId, sku: bolsa.sku, cantidad: cantidadProducida, fecha,
          tipo_movimiento: 'salida', referencia: `Producción: ${f.nombre}`,
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
      <div className="max-w-2xl">
        <div className="rounded-2xl px-4 py-3 mb-4 text-sm font-bold" style={{ background: '#FFF4CC', color: '#8A5A00' }}>
          Solo para un día sin tablet. Si la planta está registrando, esto saca el maíz dos veces del inventario.
        </div>
        <>
        {!cargando && materiasCochada().length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
            <p className="font-black text-gray-800 text-sm">Maíz puesto en producción ({fecha})</p>
            {materiasCochada().map(mp => {
              const delDia = cochadasDia.filter(c => c.materia_prima_id === mp.id)
              return (
                <div key={mp.id} className="mb-2">
                  {diaCerrado ? (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-gray-700">{mp.nombre}</p>
                      <p className="text-sm font-black text-gray-800 tabular-nums">{bultosRegistrados(mp.id)} bultos</p>
                    </div>
                  ) : <>
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-sm font-bold text-gray-700">{mp.nombre}</p>
                    <input type="number" min="0" step="0.01" placeholder="0"
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
                  </>}
                </div>
              )
            })}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Fecha</label>
              <CampoFecha value={fecha} onChange={e => setFecha(e.target.value)}
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

          {diaCerrado ? (
            <div className="rounded-xl p-3 flex flex-wrap items-center justify-between gap-2" style={{ border: '1.5px solid #2E5E3A', background: '#E6F0E8' }}>
              <div>
                <p className="font-black text-sm" style={{ color: '#2E5E3A' }}>Producción del día cerrada</p>
                <p className="text-xs text-gray-600">{dia.cerrado_por || ''} · {new Date(dia.cerrado_at).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              {usuario.rol === 'admin' && <button onClick={reabrirDia} className="text-xs font-bold px-3 py-2 rounded-lg bg-white">Reabrir</button>}
            </div>
          ) : cargando ? (
            <p className="text-gray-400 text-center py-6 text-sm">Cargando fórmulas...</p>
          ) : formulas.length === 0 ? (
            <p className="text-gray-400 text-center py-6 text-sm">Sin fórmulas activas</p>
          ) : (
            <div className="space-y-2 mb-3">
              {formulas.filter(f => !esMasa(productosMap[f.producto_id])).map(f => {
                const producto = productosMap[f.producto_id]
                const yaAnotado = lotesHoy.filter(l => l.fecha === fecha).flatMap(l => l.produccion_detalle || [])
                  .filter(d => d.formula_id === f.id).reduce((t, d) => t + Number(d.cantidad_producida || 0), 0)
                const sumando = parseFloat(cantidades[f.id]) || 0
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
                        {yaAnotado > 0 && (
                          <p className="text-xs font-bold text-gray-600 tabular-nums">
                            Anotado hoy: {yaAnotado}{sumando > 0 ? ` · queda en ${yaAnotado + sumando}` : ''}
                          </p>
                        )}
                      </div>
                      <input type="number" min="0" step="0.01" placeholder={yaAnotado > 0 ? '+0' : '0'}
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
                            {estandar ? ` (${desviacion > 0 ? '+' : ''}${desviacion.toFixed(1)}% vs ${estandar}g estandar) ${dentroDeRango ? 'dentro de rango' : 'fuera de rango'}` : ''}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {!diaCerrado && <>
          <div className="mb-3">
            <label className="text-xs font-bold text-gray-600 block mb-1">Observaciones (opcional)</label>
            <input type="text" value={observaciones} onChange={e => setObservaciones(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
          </div>

          <button onClick={guardar} disabled={guardando || formulas.length === 0}
            className="w-full bg-brand hover:bg-brand-dark text-white font-black py-3 rounded-xl disabled:opacity-50">
            {guardando ? 'Guardando...' : lotesHoy.some(l => l.fecha === fecha) ? 'Sumar a la producción del día' : 'Registrar producción'}
          </button>

          {lotesHoy.some(l => l.fecha === fecha) && !cerrando && (
            <button onClick={abrirCierre} className="w-full mt-2 font-black py-3 rounded-xl text-gray-800" style={{ border: '1.5px solid #1C1B19' }}>
              Cerrar producción del día
            </button>
          )}
          {cerrando && (
            <div className="mt-3 rounded-xl p-3" style={{ border: '1.5px dashed #1C1B19' }}>
              <p className="font-black text-sm text-gray-800 mb-2">Maíz puesto en el día</p>
              {materiasCochada().map(mp => (
                <div key={mp.id} className="flex items-center gap-2 mb-2">
                  <p className="flex-1 text-sm font-bold text-gray-700">{mp.nombre}</p>
                  <input type="number" min="0" step="0.5" placeholder="0" value={cerrando[mp.id] || ''}
                    onChange={e => setCerrando({ ...cerrando, [mp.id]: e.target.value })}
                    className="w-20 text-center border-2 border-gray-200 rounded-lg px-2 py-2 text-sm font-bold text-gray-800 focus:border-brand focus:outline-none" />
                  <span className="text-xs text-gray-400">bultos</span>
                </div>
              ))}
              <div className="flex gap-2 mt-1">
                <button onClick={cerrarDia} disabled={guardandoCierre} className="flex-1 bg-brand text-white font-black py-2.5 rounded-xl disabled:opacity-50">{guardandoCierre ? 'Cerrando...' : 'Cerrar el día'}</button>
                <button onClick={() => setCerrando(null)} className="px-4 font-bold text-gray-600 rounded-xl bg-gray-100">Cancelar</button>
              </div>
            </div>
          )}
          </>}
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
                  ) : null}
                </div>
              )
            })}
          </div>
        )}

        <p className="text-xs font-bold text-gray-500 mb-2 px-1">Lotes del día</p>
        {masaVendida > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4 mb-2 flex justify-between gap-2 text-sm">
            <span className="text-gray-700">Kilo de Masa vendido en el mostrador</span>
            <span className="font-bold text-gray-800 tabular-nums">{masaVendida.toLocaleString('es-CO', { maximumFractionDigits: 3 })} kg</span>
          </div>
        )}
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
                      {corrigiendo?.id === d.id ? (
                        <div className="flex items-center gap-2 py-1">
                          <input type="number" min="0" step="0.01" value={corrigiendo.valor} autoFocus
                            onChange={e => setCorrigiendo({ ...corrigiendo, valor: e.target.value })}
                            className="w-24 text-center border-2 border-brand rounded-lg px-2 py-1 text-sm font-bold text-gray-800 focus:outline-none" />
                          <span className="text-sm text-gray-600 flex-1 min-w-0">{f?.nombre || 'Fórmula'}</span>
                          <button onClick={guardarCorreccion} disabled={guardandoCorreccion}
                            className="bg-brand text-white text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50">
                            {guardandoCorreccion ? '...' : 'Guardar'}
                          </button>
                          <button onClick={() => setCorrigiendo(null)} className="text-xs text-gray-500 font-bold px-2">Cancelar</button>
                        </div>
                      ) : (
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm text-gray-700">
                            <span className="font-bold">{d.cantidad_producida}</span> {f?.nombre || 'Fórmula'}
                          </p>
                          {usuario.rol === 'admin' && (
                            <button onClick={() => setCorrigiendo({ id: d.id, valor: String(d.cantidad_producida) })}
                              className="text-xs text-brand font-bold shrink-0">Corregir</button>
                          )}
                        </div>
                      )}
                      {d.corregido_por && (
                        <p className="text-xs text-amber-700">Corregido de {Number(d.cantidad_original)} por {d.corregido_por}</p>
                      )}
                      {muestra && (
                        <p className={`text-xs ${fueraDeRango ? 'text-brand font-bold' : 'text-gray-400'}`}>
                          Gramaje: {muestra.peso_promedio_g.toFixed(1)}g promedio
                          {muestra.peso_estandar_g ? ` (${muestra.desviacion_pct > 0 ? '+' : ''}${muestra.desviacion_pct.toFixed(1)}% vs ${muestra.peso_estandar_g}g)` : ''}
                          {fueraDeRango ? ' · fuera de rango' : ''}
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
      </div>
    </div>
  )
}
