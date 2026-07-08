'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
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
    const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const { data } = await supabase
      .from('despachos_encab')
      .select('*, rutas(nombre), vendedores(nombre)')
      .eq('fecha', fecha)
      .eq('estado', 'borrador')
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
    const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
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
        alert(`${ruta.nombre} ya tiene un despacho registrado hoy. Si es un borrador, retomalo desde la lista de arriba.`)
        return
      }
    }
    setDespachoIdActual(null)
    setVendedorSeleccionado(null)
    setBaseEntregada('')
    setRutaSeleccionada(ruta)
    await cargarProductos(ruta)
  }

  const resumirBorrador = async (d) => {
    const ruta = rutas.find(r => r.id === d.ruta_id) || d.rutas
    const vend = vendedores.find(v => v.id === d.vendedor_id) || null
    setDespachoIdActual(d.id)
    setRutaSeleccionada({ id: d.ruta_id, nombre: d.rutas?.nombre || ruta?.nombre })
    setVendedorSeleccionado(vend)
    const prods = await cargarProductos({ nombre: d.rutas?.nombre || ruta?.nombre })

    const { data: detalle } = await supabase.from('despachos_detalle').select('*').eq('despacho_id', d.id)
    const { data: config } = await supabase.from('configuracion').select('valor').eq('parametro', `base_despacho_${d.id}`).single()

    if (detalle && detalle.length > 0) {
      const nuevasCantidades = {}
      prods.forEach(p => { nuevasCantidades[p.sku] = { viejo: '0', nuevo: '0' } })
      detalle.forEach(det => {
        nuevasCantidades[det.sku] = { viejo: String(det.lote_viejo_x || 0), nuevo: String(det.lote_nuevo_y || 0) }
      })
      setCantidades(nuevasCantidades)
    }
    if (config) setBaseEntregada(String(config.valor || ''))
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
    const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const empresaId = getEmpresaId()
    const payloadEncab = {
      empresa_id: empresaId,
      fecha,
      ruta_id: rutaSeleccionada.id,
      vendedor_id: vendedorSeleccionado.id,
      estado: estadoFinal,
      total_und: totalUnidades(),
      total_valor: totalValor(),
      hora_cargue: estadoFinal === 'despachado' ? new Date().toISOString() : null
    }

    let despachoId = despachoIdActual
    let detalleExistente = []
    if (despachoId) {
      const { error } = await supabase.from('despachos_encab').update(payloadEncab).eq('id', despachoId)
      if (error) { alert('Error: ' + error.message); setGuardando(false); return }
      const { data } = await supabase.from('despachos_detalle').select('id, sku').eq('despacho_id', despachoId)
      detalleExistente = data || []
    } else {
      const { data: encab, error } = await supabase.from('despachos_encab').insert(payloadEncab).select().single()
      if (error) { alert('Error: ' + error.message); setGuardando(false); return }
      despachoId = encab.id
      setDespachoIdActual(despachoId)
    }

    // no se puede borrar despachos_detalle/configuracion (RLS solo permite update/insert),
    // asi que cada producto se actualiza si ya existia o se inserta si es nuevo
    const idExistentePorSku = {}
    detalleExistente.forEach(d => { idExistentePorSku[d.sku] = d.id })

    for (const p of productos) {
      const payloadDetalle = {
        empresa_id: p.empresa_id,
        despacho_id: despachoId,
        sku: p.sku,
        lote_viejo_x: parseFloat(cantidades[p.sku]?.viejo || 0),
        lote_nuevo_y: parseFloat(cantidades[p.sku]?.nuevo || 0),
        total: parseFloat(cantidades[p.sku]?.viejo || 0) + parseFloat(cantidades[p.sku]?.nuevo || 0),
        precio_unitario: p.precio_venta
      }
      if (idExistentePorSku[p.sku]) {
        await supabase.from('despachos_detalle').update(payloadDetalle).eq('id', idExistentePorSku[p.sku])
      } else if (payloadDetalle.total > 0) {
        await supabase.from('despachos_detalle').insert(payloadDetalle)
      }
    }

    const parametroBase = `base_despacho_${despachoId}`
    const { data: baseActualizada } = await supabase.from('configuracion').update({ valor: baseEntregada }).eq('parametro', parametroBase).select()
    if (!baseActualizada || baseActualizada.length === 0) {
      await supabase.from('configuracion').insert({ empresa_id: empresaId, parametro: parametroBase, valor: baseEntregada })
    }

    setGuardando(false)
    if (estadoFinal === 'despachado') {
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
        <h1 className="text-xl font-black text-gray-900">Despacho</h1>
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
                <p className="text-sm font-bold text-gray-600 mb-3">Borradores pendientes</p>
                <div className="grid grid-cols-1 gap-2 mb-6">
                  {borradores.map(b => (
                    <button key={b.id} onClick={() => resumirBorrador(b)}
                      className="p-3 rounded-xl border-2 border-gray-200 bg-white text-left hover:border-brand transition-all flex justify-between items-center">
                      <div>
                        <p className="font-bold text-gray-800 text-sm">{b.rutas?.nombre}</p>
                        <p className="text-xs text-gray-400">{b.vendedores?.nombre || 'Sin vendedor'} · {b.total_und} und</p>
                      </div>
                      <span className="text-xs bg-brand/10 text-brand font-bold px-2 py-1 rounded-lg">Retomar</span>
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
                <p className="text-xs text-gray-500">Unidades</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-brand">${totalValor().toLocaleString('es-CO')}</p>
                <p className="text-xs text-gray-500">Valor total</p>
              </div>
            </div>

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
                        </div>
                        <p className="font-black text-gray-700 text-sm">
                          {parseFloat(cantidades[p.sku]?.viejo || 0) + parseFloat(cantidades[p.sku]?.nuevo || 0)} und
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="text-xs text-gray-400 block mb-1">X Viejo</label>
                          <input type="number" min="0" value={cantidades[p.sku]?.viejo}
                            onChange={e => setCantidades(prev => ({ ...prev, [p.sku]: { ...prev[p.sku], viejo: e.target.value } }))}
                            className="w-full text-center border-2 border-gray-200 rounded-lg py-2 font-bold text-gray-800 focus:border-brand focus:outline-none" />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-gray-400 block mb-1">Y Nuevo</label>
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
              <button onClick={() => setRutaSeleccionada(null)} className="flex-1 bg-gray-100 text-gray-600 font-bold py-4 rounded-xl text-base">
                Cancelar
              </button>
              <button onClick={() => guardarComoBorrador('borrador')} disabled={guardando}
                className="flex-1 bg-secondary hover:bg-black text-white font-bold py-4 rounded-xl text-base disabled:opacity-50">
                {guardando ? '...' : 'Guardar borrador'}
              </button>
              <button onClick={() => guardarComoBorrador('despachado')} disabled={guardando}
                className="flex-1 bg-brand hover:bg-brand-dark text-white font-black py-4 rounded-xl text-lg disabled:opacity-50">
                {guardando ? 'Guardando...' : 'Confirmar despacho'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
