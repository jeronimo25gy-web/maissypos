'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import Stepper from '@/components/Stepper'

export default function Despacho() {
  const [usuario, setUsuario] = useState(null)
  const [rutas, setRutas] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [borradores, setBorradores] = useState([])
  const [despachoIdActual, setDespachoIdActual] = useState(null)
  const [rutaSeleccionada, setRutaSeleccionada] = useState(null)
  const [vendedorSeleccionado, setVendedorSeleccionado] = useState(null)
  const [productos, setProductos] = useState([])
  const [cantidades, setCantidades] = useState({})
  const [modoAgregar, setModoAgregar] = useState(false)
  const [existentePorSku, setExistentePorSku] = useState({})
  const [baseEntregada, setBaseEntregada] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    setUsuario(JSON.parse(u))
    cargarRutas()
    cargarVendedores()
    cargarBorradores()
  }, [])

  const cargarRutas = async () => {
    const { data } = await supabase.from('rutas').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    if (data) setRutas(data)
  }

  const cargarVendedores = async () => {
    const { data } = await supabase.from('vendedores').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    if (data) setVendedores(data)
  }

  const cargarBorradores = async () => {
    const fecha = obtenerFechaActual()
    const { data } = await supabase
      .from('despachos_encab')
      .select('*, rutas(nombre), vendedores(nombre)')
      .eq('fecha', fecha)
      .in('estado', ['borrador', 'despachado'])
      .eq('empresa_id', getEmpresaId())
      .order('created_at', { ascending: false })
    if (data) setBorradores(data)
  }

  const cargarProductos = async (ruta) => {
    let query = supabase.from('productos').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('categoria')
    if (ruta.nombre === 'RUTA TAT MANRIQUE') {
      query = query.eq('categoria', 'Arepas TAT')
    } else {
      query = query.neq('categoria', 'Arepas TAT')
    }
    const { data } = await query
    if (data) {
      setProductos(data)
      const initial = {}
      data.forEach(p => { initial[p.sku] = { viejo: '0', nuevo: '0' } })
      setCantidades(initial)
    }
    return data || []
  }

  const totalUnidades = () => productos.reduce((sum, p) => {
    return sum + parseFloat(cantidades[p.sku]?.viejo || 0) + parseFloat(cantidades[p.sku]?.nuevo || 0)
  }, 0)

  const totalValor = () => productos.reduce((sum, p) => {
    const t = parseFloat(cantidades[p.sku]?.viejo || 0) + parseFloat(cantidades[p.sku]?.nuevo || 0)
    return sum + t * (p.precio_venta || 0)
  }, 0)

  const verificarDespachoExistente = async (rutaId) => {
    const fecha = obtenerFechaActual()
    const { data } = await supabase
      .from('despachos_encab')
      .select('id')
      .eq('fecha', fecha)
      .eq('ruta_id', rutaId)
      .eq('empresa_id', getEmpresaId())
      .neq('estado', 'cancelado')
    return data && data.length > 0
  }

  const seleccionarRuta = async (ruta) => {
    if (ruta.nombre !== 'RUTA TAT MANRIQUE') {
      const existe = await verificarDespachoExistente(ruta.id)
      if (existe) {
        const crearNuevo = confirm(
          `${ruta.nombre} ya tiene un despacho registrado hoy.\n\n` +
          `Aceptar: crear un despacho NUEVO e independiente para esta ruta (por ejemplo, un envio atrasado a otro destino).\n` +
          `Cancelar: ir a "Pendientes de hoy" arriba para retomarlo o agregarle cantidades al que ya existe.`
        )
        if (!crearNuevo) return
      }
    }
    setDespachoIdActual(null)
    setVendedorSeleccionado(null)
    setBaseEntregada('')
    setModoAgregar(false)
    setExistentePorSku({})
    setRutaSeleccionada(ruta)
    await cargarProductos(ruta)
  }

  const resumirBorrador = async (d) => {
    const ruta = rutas.find(r => r.id === d.ruta_id) || d.rutas
    const vend = vendedores.find(v => v.id === d.vendedor_id) || null
    const esAgregar = d.estado === 'despachado'
    setDespachoIdActual(d.id)
    setModoAgregar(esAgregar)
    setRutaSeleccionada({ id: d.ruta_id, nombre: d.rutas?.nombre || ruta?.nombre })
    setVendedorSeleccionado(vend)
    const prods = await cargarProductos({ nombre: d.rutas?.nombre || ruta?.nombre })

    const { data: detalle } = await supabase.from('despachos_detalle').select('*').eq('despacho_id', d.id)
    const { data: config } = await supabase.from('configuracion').select('valor').eq('parametro', `base_despacho_${d.id}`).single()

    const nuevasCantidades = {}
    prods.forEach(p => { nuevasCantidades[p.sku] = { viejo: '0', nuevo: '0' } })
    const existente = {}
    ;(detalle || []).forEach(det => {
      existente[det.sku] = { viejo: det.lote_viejo_x || 0, nuevo: det.lote_nuevo_y || 0, total: det.total || 0 }
      if (!esAgregar) {
        nuevasCantidades[det.sku] = { viejo: String(det.lote_viejo_x || 0), nuevo: String(det.lote_nuevo_y || 0) }
      }
    })
    setExistentePorSku(existente)
    setCantidades(nuevasCantidades)
    if (config) setBaseEntregada(String(config.valor || ''))
  }

  const calcularStockDisponible = async (skus) => {
    const empresaId = getEmpresaId()
    const { data: conteos } = await supabase
      .from('conteo_fisico')
      .select('sku, fecha, cantidad_fisica')
      .eq('empresa_id', empresaId)
      .in('sku', skus)
      .order('fecha', { ascending: false })
    const conteoPorSku = {}
    ;(conteos || []).forEach(c => { if (!(c.sku in conteoPorSku)) conteoPorSku[c.sku] = c })

    const fechaMinima = Object.values(conteoPorSku).reduce((min, c) => (!min || c.fecha < min) ? c.fecha : min, null)

    const despachadoPorSku = {}
    if (fechaMinima) {
      let detallesQuery = supabase.from('despachos_detalle').select('sku, total, despacho_id').eq('empresa_id', empresaId).in('sku', skus)
      if (despachoIdActual) detallesQuery = detallesQuery.neq('despacho_id', despachoIdActual)
      const { data: detalles } = await detallesQuery

      const idsDespachos = [...new Set((detalles || []).map(d => d.despacho_id))]
      const encabPorId = {}
      if (idsDespachos.length > 0) {
        const { data: encabs } = await supabase
          .from('despachos_encab')
          .select('id, fecha, estado')
          .in('id', idsDespachos)
          .gte('fecha', fechaMinima)
          .neq('estado', 'cancelado')
        ;(encabs || []).forEach(e => { encabPorId[e.id] = e })
      }

      ;(detalles || []).forEach(d => {
        const encab = encabPorId[d.despacho_id]
        if (!encab) return
        const conteo = conteoPorSku[d.sku]
        if (!conteo || encab.fecha < conteo.fecha) return
        despachadoPorSku[d.sku] = (despachadoPorSku[d.sku] || 0) + (d.total || 0)
      })
    }

    const compradoPorSku = {}
    if (fechaMinima) {
      const { data: movimientos } = await supabase
        .from('inventario_mov')
        .select('sku, cantidad, fecha')
        .eq('empresa_id', empresaId)
        .eq('tipo_movimiento', 'entrada')
        .in('sku', skus)
        .gte('fecha', fechaMinima)
      ;(movimientos || []).forEach(m => {
        const conteo = conteoPorSku[m.sku]
        if (!conteo || m.fecha < conteo.fecha) return
        compradoPorSku[m.sku] = (compradoPorSku[m.sku] || 0) + (m.cantidad || 0)
      })
    }

    const salidaPorSku = {}
    if (fechaMinima) {
      const { data: salidas } = await supabase
        .from('inventario_mov')
        .select('sku, cantidad, fecha')
        .eq('empresa_id', empresaId)
        .eq('tipo_movimiento', 'salida')
        .in('sku', skus)
        .gte('fecha', fechaMinima)
      ;(salidas || []).forEach(m => {
        const conteo = conteoPorSku[m.sku]
        if (!conteo || m.fecha < conteo.fecha) return
        salidaPorSku[m.sku] = (salidaPorSku[m.sku] || 0) + (m.cantidad || 0)
      })
    }

    const disponible = {}
    skus.forEach(sku => {
      const conteo = conteoPorSku[sku]
      disponible[sku] = conteo ? (conteo.cantidad_fisica + (compradoPorSku[sku] || 0) - (despachadoPorSku[sku] || 0) - (salidaPorSku[sku] || 0)) : null
    })
    return disponible
  }

  const guardarComoBorrador = async (estadoFinal) => {
    if (!rutaSeleccionada) { alert('Selecciona una ruta'); return }
    if (!vendedorSeleccionado) { alert('Selecciona el vendedor'); return }
    if (!baseEntregada) { alert('Ingresa la base entregada al vendedor'); return }
    const productosConCantidad = productos.filter(p => {
      return parseFloat(cantidades[p.sku]?.viejo || 0) + parseFloat(cantidades[p.sku]?.nuevo || 0) > 0
    })
    if (productosConCantidad.length === 0) { alert('Ingresa al menos un producto'); return }

    setGuardando(true)

    const disponible = await calcularStockDisponible(productosConCantidad.map(p => p.sku))
    const faltantes = productosConCantidad
      .map(p => ({
        p,
        solicitado: parseFloat(cantidades[p.sku]?.viejo || 0) + parseFloat(cantidades[p.sku]?.nuevo || 0),
        disp: disponible[p.sku]
      }))
      .filter(f => f.disp !== null && f.solicitado > f.disp)
    if (faltantes.length > 0) {
      alert('Stock insuficiente segun el ultimo conteo fisico:\n' +
        faltantes.map(f => `${f.p.nombre}: disponible ${f.disp}, solicitado ${f.solicitado}`).join('\n'))
      setGuardando(false)
      return
    }
    const fecha = obtenerFechaActual()
    const empresaId = getEmpresaId()
    const estadoGuardar = modoAgregar ? 'despachado' : estadoFinal

    let despachoId = despachoIdActual
    let detalleExistente = []
    if (despachoId) {
      const { data } = await supabase.from('despachos_detalle').select('id, sku, lote_viejo_x, lote_nuevo_y, total').eq('despacho_id', despachoId)
      detalleExistente = data || []
    }

    let totalExistenteUnd = 0
    let totalExistenteValor = 0
    if (modoAgregar) {
      detalleExistente.forEach(d => {
        totalExistenteUnd += d.total || 0
        totalExistenteValor += (d.total || 0) * (productos.find(p => p.sku === d.sku)?.precio_venta || 0)
      })
    }

    const payloadEncab = {
      empresa_id: empresaId,
      fecha,
      ruta_id: rutaSeleccionada.id,
      vendedor_id: vendedorSeleccionado.id,
      estado: estadoGuardar,
      total_und: totalExistenteUnd + totalUnidades(),
      total_valor: totalExistenteValor + totalValor(),
      ...(modoAgregar ? {} : { hora_cargue: estadoGuardar === 'despachado' ? new Date().toISOString() : null })
    }

    if (despachoId) {
      const { error } = await supabase.from('despachos_encab').update(payloadEncab).eq('id', despachoId)
      if (error) { alert('Error: ' + error.message); setGuardando(false); return }
    } else {
      const { data: encab, error } = await supabase.from('despachos_encab').insert(payloadEncab).select().single()
      if (error) { alert('Error: ' + error.message); setGuardando(false); return }
      despachoId = encab.id
      setDespachoIdActual(despachoId)
    }

    // no se puede borrar despachos_detalle/configuracion (RLS solo permite update/insert),
    // asi que cada producto se actualiza si ya existia o se inserta si es nuevo
    const detalleExistentePorSku = {}
    detalleExistente.forEach(d => { detalleExistentePorSku[d.sku] = d })

    for (const p of productos) {
      const adicionViejo = parseFloat(cantidades[p.sku]?.viejo || 0)
      const adicionNuevo = parseFloat(cantidades[p.sku]?.nuevo || 0)
      const previo = detalleExistentePorSku[p.sku]

      if (modoAgregar) {
        if (adicionViejo + adicionNuevo === 0) continue
        const viejoFinal = (previo?.lote_viejo_x || 0) + adicionViejo
        const nuevoFinal = (previo?.lote_nuevo_y || 0) + adicionNuevo
        const payloadDetalle = {
          empresa_id: p.empresa_id,
          despacho_id: despachoId,
          sku: p.sku,
          lote_viejo_x: viejoFinal,
          lote_nuevo_y: nuevoFinal,
          total: viejoFinal + nuevoFinal,
          precio_unitario: p.precio_venta
        }
        if (previo) {
          await supabase.from('despachos_detalle').update(payloadDetalle).eq('id', previo.id)
        } else {
          await supabase.from('despachos_detalle').insert(payloadDetalle)
        }
      } else {
        const payloadDetalle = {
          empresa_id: p.empresa_id,
          despacho_id: despachoId,
          sku: p.sku,
          lote_viejo_x: adicionViejo,
          lote_nuevo_y: adicionNuevo,
          total: adicionViejo + adicionNuevo,
          precio_unitario: p.precio_venta
        }
        if (previo) {
          await supabase.from('despachos_detalle').update(payloadDetalle).eq('id', previo.id)
        } else if (payloadDetalle.total > 0) {
          await supabase.from('despachos_detalle').insert(payloadDetalle)
        }
      }
    }

    const parametroBase = `base_despacho_${despachoId}`
    const { data: baseActualizada } = await supabase.from('configuracion').update({ valor: baseEntregada }).eq('parametro', parametroBase).select()
    if (!baseActualizada || baseActualizada.length === 0) {
      await supabase.from('configuracion').insert({ empresa_id: empresaId, parametro: parametroBase, valor: baseEntregada })
    }

    setGuardando(false)
    if (modoAgregar) {
      alert(`Se agregaron ${totalUnidades()} unidades adicionales a ${rutaSeleccionada.nombre}.`)
      setRutaSeleccionada(null)
      setVendedorSeleccionado(null)
      setDespachoIdActual(null)
      setBaseEntregada('')
      setModoAgregar(false)
      setExistentePorSku({})
      cargarBorradores()
    } else if (estadoGuardar === 'despachado') {
      setGuardado(true)
    } else {
      alert('Borrador guardado. Podes retomarlo mas tarde desde esta misma pantalla.')
      setRutaSeleccionada(null)
      setVendedorSeleccionado(null)
      setDespachoIdActual(null)
      setBaseEntregada('')
      cargarBorradores()
    }
  }

  const categorias = [...new Set(productos.map(p => p.categoria))]

  if (guardado) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-md w-full">
        <div className="flex justify-center mb-4">
          <Stepper estado="despachado" />
        </div>
        <div className="text-6xl mb-4">🚚</div>
        <h2 className="text-2xl font-black text-gray-800">Despacho confirmado</h2>
        <p className="text-gray-500 mt-2">{rutaSeleccionada?.nombre}</p>
        <p className="text-sm text-gray-500">Vendedor: {vendedorSeleccionado?.nombre}</p>
        <p className="text-3xl font-black text-brand mt-4">{totalUnidades()} unidades</p>
        <p className="text-gray-500">${totalValor().toLocaleString('es-CO')}</p>
        <p className="text-sm text-gray-500 mt-2">Base entregada: ${parseFloat(baseEntregada).toLocaleString('es-CO')}</p>
        <div className="flex gap-3 mt-6">
          <button onClick={() => router.push('/imprimir')} className="flex-1 bg-secondary hover:bg-black text-white px-4 py-3 rounded-xl font-bold">
            Imprimir hoja
          </button>
          <button onClick={() => router.push('/dashboard')} className="flex-1 bg-brand hover:bg-brand-dark text-white px-4 py-3 rounded-xl font-bold">
            Volver al inicio
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <div className="bg-white shadow-sm px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-gray-700" aria-label="Volver al dashboard">←</button>
          <h1 className="text-xl font-black text-gray-900">Despacho</h1>
        </div>
        <p className="text-xs text-gray-500">{new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {rutaSeleccionada && (
          <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex justify-center overflow-x-auto">
            <Stepper estado="borrador" />
          </div>
        )}

        {!rutaSeleccionada ? (
          <>
            {borradores.length > 0 && (
              <>
                <p className="text-sm font-bold text-gray-600 mb-3">Pendientes de hoy</p>
                <div className="grid grid-cols-1 gap-2 mb-6">
                  {borradores.map(b => (
                    <button key={b.id} onClick={() => resumirBorrador(b)}
                      className="p-3 rounded-xl border-2 border-gray-200 bg-white text-left hover:border-brand transition-all flex justify-between items-center">
                      <div>
                        <p className="font-bold text-gray-800 text-sm">{b.rutas?.nombre}</p>
                        <p className="text-xs text-gray-400">
                          {b.vendedores?.nombre || 'Sin vendedor'} · {b.total_und} und
                          {b.created_at && ` · ${new Date(b.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`}
                        </p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg ${b.estado === 'despachado' ? 'bg-secondary/10 text-secondary' : 'bg-brand/10 text-brand'}`}>
                        {b.estado === 'despachado' ? 'Agregar' : 'Retomar'}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <p className="text-sm font-bold text-gray-600 mb-3">Selecciona la ruta</p>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {rutas.map(r => (
                <button key={r.id} onClick={() => seleccionarRuta(r)}
                  className="p-3 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-600 hover:border-brand hover:text-brand transition-all">
                  {r.nombre}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="bg-brand/5 border border-brand/30 rounded-xl p-4 mb-4">
              <p className="font-black text-gray-900">{rutaSeleccionada.nombre}</p>
              <p className="text-sm text-brand">
                {rutaSeleccionada.nombre === 'RUTA TAT MANRIQUE' ? 'Solo referencias TAT' : 'X = Stock viejo (FIFO) · Y = Stock nuevo'}
              </p>
              {modoAgregar && (
                <p className="text-xs text-secondary font-bold mt-1">
                  Este despacho ya fue confirmado. Lo que ingreses aqui se suma a lo que ya se envio.
                </p>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <label className="text-sm font-black text-gray-700 block mb-2">👤 Vendedor asignado</label>
              <div className="grid grid-cols-2 gap-2">
                {vendedores.map(v => (
                  <button key={v.id} onClick={() => setVendedorSeleccionado(v)}
                    className={`p-3 rounded-xl border-2 text-sm font-semibold transition-all ${vendedorSeleccionado?.id === v.id ? 'border-brand bg-brand/5 text-brand' : 'border-gray-200 text-gray-600'}`}>
                    {v.nombre}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <label className="text-sm font-black text-gray-700 block mb-2">💰 Base entregada al vendedor</label>
              <input type="number" min="0" value={baseEntregada} onChange={e => setBaseEntregada(e.target.value)}
                className="w-full text-center border-2 border-brand/30 rounded-xl py-3 text-2xl font-black text-gray-800 focus:border-brand focus:outline-none"
                placeholder="0" />
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex justify-between">
              <div className="text-center">
                <p className="text-2xl font-black text-gray-800">{totalUnidades()}</p>
                <p className="text-xs text-gray-500">{modoAgregar ? 'Unidades adicionales' : 'Unidades'}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-brand">${totalValor().toLocaleString('es-CO')}</p>
                <p className="text-xs text-gray-500">{modoAgregar ? 'Valor adicional' : 'Valor total'}</p>
              </div>
            </div>
            {modoAgregar && (
              <p className="text-xs text-gray-400 mb-4 -mt-3 text-center">
                Ya enviado antes: {Object.values(existentePorSku).reduce((s, e) => s + e.total, 0)} und
              </p>
            )}

            {categorias.map(cat => (
              <div key={cat} className="mb-4">
                <h3 className="font-bold text-gray-600 text-sm uppercase tracking-wide mb-2 px-1">{cat}</h3>
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  {productos.filter(p => p.categoria === cat).map((p, i, arr) => (
                    <div key={p.sku} className={`px-4 py-3 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                      <div className="flex justify-between items-center mb-2">
                        <div>
                          <p className="font-medium text-gray-800 text-sm">{p.nombre}</p>
                          <p className="text-xs text-gray-400">{p.sku} · ${p.precio_venta?.toLocaleString('es-CO')}</p>
                          {modoAgregar && existentePorSku[p.sku] && (
                            <p className="text-xs text-secondary">Ya enviado: {existentePorSku[p.sku].total} und</p>
                          )}
                        </div>
                        <p className="font-black text-gray-700 text-sm">
                          {parseFloat(cantidades[p.sku]?.viejo || 0) + parseFloat(cantidades[p.sku]?.nuevo || 0)} und
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="text-xs text-gray-400 block mb-1">X Viejo{modoAgregar ? ' adicional' : ''}</label>
                          <input type="number" min="0" value={cantidades[p.sku]?.viejo}
                            onChange={e => setCantidades(prev => ({ ...prev, [p.sku]: { ...prev[p.sku], viejo: e.target.value } }))}
                            className="w-full text-center border-2 border-gray-200 rounded-lg py-2 font-bold text-gray-800 focus:border-brand focus:outline-none" />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-gray-400 block mb-1">Y Nuevo{modoAgregar ? ' adicional' : ''}</label>
                          <input type="number" min="0" value={cantidades[p.sku]?.nuevo}
                            onChange={e => setCantidades(prev => ({ ...prev, [p.sku]: { ...prev[p.sku], nuevo: e.target.value } }))}
                            className="w-full text-center border-2 border-gray-200 rounded-lg py-2 font-bold text-gray-800 focus:border-brand focus:outline-none" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="flex gap-3 mt-4">
              <button onClick={() => { setRutaSeleccionada(null); setModoAgregar(false); setExistentePorSku({}) }} className="flex-1 bg-gray-100 text-gray-600 font-bold py-4 rounded-xl text-base">
                Cancelar
              </button>
              {modoAgregar ? (
                <button onClick={() => guardarComoBorrador('despachado')} disabled={guardando}
                  className="flex-1 bg-brand hover:bg-brand-dark text-white font-black py-4 rounded-xl text-lg disabled:opacity-50">
                  {guardando ? 'Guardando...' : 'Agregar al despacho'}
                </button>
              ) : (
                <>
                  <button onClick={() => guardarComoBorrador('borrador')} disabled={guardando}
                    className="flex-1 bg-secondary hover:bg-black text-white font-bold py-4 rounded-xl text-base disabled:opacity-50">
                    {guardando ? '...' : 'Guardar borrador'}
                  </button>
                  <button onClick={() => guardarComoBorrador('despachado')} disabled={guardando}
                    className="flex-1 bg-brand hover:bg-brand-dark text-white font-black py-4 rounded-xl text-lg disabled:opacity-50">
                    {guardando ? 'Guardando...' : 'Confirmar despacho'}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
