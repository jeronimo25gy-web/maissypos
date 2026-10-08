'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { grupoDespacho } from '@/lib/orden-productos'
import { calcularStockPorSku } from '@/lib/inventario-helpers'
import { puedeVerModulo } from '@/lib/permisos'
import Stepper from '@/components/Stepper'
import { PageHeader } from '@/components/ui'
import InputDinero from '@/components/InputDinero'

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
  const [cargaEstandarPorSku, setCargaEstandarPorSku] = useState({})
  const [baseEntregada, setBaseEntregada] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const router = useRouter()
  const hayEdicionUsuario = useRef(false)
  // Borrador local recuperable (de una sesion que se dejo a medias en este
  // navegador). Se ofrece con un aviso dentro del formulario, no con confirm().
  const [autosavePendiente, setAutosavePendiente] = useState(null)

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (!puedeVerModulo(parsed, 'despacho', ['admin', 'auxiliar'])) { router.push('/kiosco'); return }
    setUsuario(parsed)
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

  const claveAutosaveNuevo = (rutaId) => `despacho_borrador_nuevo_${rutaId}`
  const claveAutosaveExistente = (id) => `despacho_borrador_${id}`

  useEffect(() => {
    if (!rutaSeleccionada || !hayEdicionUsuario.current) return
    const clave = despachoIdActual ? claveAutosaveExistente(despachoIdActual) : claveAutosaveNuevo(rutaSeleccionada.id)
    const snapshot = { fecha: obtenerFechaActual(), guardadoEn: Date.now(), vendedorId: vendedorSeleccionado?.id || null, baseEntregada, cantidades }
    localStorage.setItem(clave, JSON.stringify(snapshot))
  }, [rutaSeleccionada, despachoIdActual, vendedorSeleccionado, baseEntregada, cantidades])

  // Solo se marca en true desde una edicion real del usuario (elegir vendedor, escribir base
  // o cantidades), nunca durante la carga inicial de una ruta o de un borrador -- si no, el
  // efecto de arriba deja siempre un autoguardado "de hoy" apenas se abre un despacho, y el
  // recuperador de abajo lo detecta como "cambios sin guardar" aunque nadie haya tocado nada.
  //
  // Antes salia un confirm() bloqueante cada vez que en este navegador quedaba
  // un formulario a medias (bastaba con elegir vendedor y salir por el menu).
  // Ahora solo se ofrece si habia unidades o base digitadas, y se descarta solo
  // si esa ruta ya tiene un despacho guardado despues de ese borrador.
  const ofrecerRestaurarAutosave = (clave, listaVendedores, despachoGuardadoEn) => {
    setAutosavePendiente(null)
    const guardado = localStorage.getItem(clave)
    if (!guardado) return
    try {
      const snap = JSON.parse(guardado)
      if (snap.fecha !== obtenerFechaActual()) { localStorage.removeItem(clave); return }
      const unidades = Object.values(snap.cantidades || {}).reduce((s, c) => s + (parseFloat(c?.viejo) || 0) + (parseFloat(c?.nuevo) || 0), 0)
      const base = parseFloat(snap.baseEntregada) || 0
      const yaSeGuardoDespues = despachoGuardadoEn && (!snap.guardadoEn || new Date(despachoGuardadoEn).getTime() >= snap.guardadoEn)
      if ((unidades === 0 && base === 0) || yaSeGuardoDespues) { localStorage.removeItem(clave); return }
      setAutosavePendiente({ clave, snap, unidades, base, vendedor: listaVendedores.find(x => x.id === snap.vendedorId) || null })
    } catch {
      localStorage.removeItem(clave)
    }
  }

  const recuperarAutosave = () => {
    const { snap, vendedor } = autosavePendiente
    if (vendedor) setVendedorSeleccionado(vendedor)
    if (snap.baseEntregada) setBaseEntregada(snap.baseEntregada)
    if (snap.cantidades) setCantidades(prev => ({ ...prev, ...snap.cantidades }))
    hayEdicionUsuario.current = true
    setAutosavePendiente(null)
  }

  const descartarAutosave = () => {
    localStorage.removeItem(autosavePendiente.clave)
    setAutosavePendiente(null)
  }

  const cargarProductos = async (ruta) => {
    let query = supabase.from('productos').select('*').eq('estado', true).neq('tipo', 'materia_prima').eq('empresa_id', getEmpresaId()).order('orden_despacho', { ascending: true, nullsFirst: false }).order('nombre')
    if (ruta.nombre === 'RUTA TAT MANRIQUE') {
      query = query.eq('categoria', 'Arepas TAT')
    } else {
      query = query.neq('categoria', 'Arepas TAT')
    }
    const { data } = await query
    if (data) {
      // Precio especial por ruta (Maestros > Rutas): si esta ruta tiene un
      // precio pactado para el sku, pisa el precio_venta de catalogo aqui
      // mismo -- asi todo lo que ya usa p.precio_venta abajo (totales,
      // precio_unitario guardado, display) queda correcto sin duplicar logica.
      if (ruta.id) {
        const { data: preciosRuta } = await supabase.from('rutas_precios').select('sku, precio_especial').eq('ruta_id', ruta.id)
        const preciosPorSku = Object.fromEntries((preciosRuta || []).map(p => [p.sku, p.precio_especial]))
        data.forEach(p => { if (preciosPorSku[p.sku] !== undefined) p.precio_venta = preciosPorSku[p.sku] })
      }
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

  const seleccionarRuta = async (ruta) => {
    hayEdicionUsuario.current = false
    setDespachoIdActual(null)
    setVendedorSeleccionado(null)
    setBaseEntregada('')
    setModoAgregar(false)
    setExistentePorSku({})
    setCargaEstandarPorSku({})
    setRutaSeleccionada(ruta)
    await cargarProductos(ruta)

    const diaSemanaHoy = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' })).getDay()
    const { data: cargaEstandar } = await supabase
      .from('cargas_ruta')
      .select('sku, cantidad')
      .eq('ruta_id', ruta.id)
      .eq('dia_semana', diaSemanaHoy)
      .eq('empresa_id', getEmpresaId())
    if (cargaEstandar && cargaEstandar.length > 0) {
      const mapa = {}
      cargaEstandar.forEach(c => { if (c.cantidad > 0) mapa[c.sku] = c.cantidad })
      setCargaEstandarPorSku(mapa)
    }
    // Si otra sesion ya guardo hoy un despacho de esta ruta despues del
    // borrador local, ese borrador ya no aplica.
    const ultimoDeLaRuta = borradores.filter(b => b.ruta_id === ruta.id).map(b => b.created_at).sort().pop()
    ofrecerRestaurarAutosave(claveAutosaveNuevo(ruta.id), vendedores, ultimoDeLaRuta)
  }

  const resumirBorrador = async (d) => {
    hayEdicionUsuario.current = false
    const ruta = rutas.find(r => r.id === d.ruta_id) || d.rutas
    const vend = vendedores.find(v => v.id === d.vendedor_id) || null
    const esAgregar = d.estado === 'despachado'
    setDespachoIdActual(d.id)
    setModoAgregar(esAgregar)
    setCargaEstandarPorSku({})
    setRutaSeleccionada({ id: d.ruta_id, nombre: d.rutas?.nombre || ruta?.nombre })
    setVendedorSeleccionado(vend)
    const prods = await cargarProductos({ id: d.ruta_id, nombre: d.rutas?.nombre || ruta?.nombre })

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
    ofrecerRestaurarAutosave(claveAutosaveExistente(d.id), vendedores, null)
  }

  // Misma formula que Inventario (lib/inventario-helpers): base = lo que el
  // sistema esperaba en el ultimo conteo + movimientos/devoluciones desde
  // entonces. Antes aqui se partia de lo contado y ademas se sumaba el ajuste
  // aprobado, asi que una diferencia aprobada quedaba contada dos veces.
  const calcularStockDisponible = async (skus, esProduccion) => {
    const stock = await calcularStockPorSku({ excluirDespachoId: despachoIdActual })
    const disponible = {}
    // En Distri, sin conteo fisico no se valida (igual que antes). En Arepas
    // se valida tambien el stock calculado desde produccion, pero solo como
    // aviso (ver guardarComoBorrador).
    skus.forEach(sku => { disponible[sku] = stock[sku] && (esProduccion || !stock[sku].sinConteo) ? stock[sku].stockActual : null })
    return disponible
  }

  const registrarSalidaBase = async (despachoId, fecha, empresaId) => {
    const monto = parseFloat(baseEntregada) || 0
    const { data: existente } = await supabase.from('movimientos_tesoreria').select('id')
      .eq('referencia_tipo', 'base_despacho').eq('referencia_id', despachoId).eq('empresa_id', empresaId).maybeSingle()
    if (monto <= 0) {
      if (existente) await supabase.from('movimientos_tesoreria').delete().eq('id', existente.id)
      return null
    }
    if (existente) {
      const { error } = await supabase.from('movimientos_tesoreria').update({ monto }).eq('id', existente.id)
      return error?.message || null
    }
    const { data: cuentaEfectivo } = await supabase.from('cuentas').select('id').eq('tipo', 'efectivo').eq('empresa_id', empresaId).maybeSingle()
    if (!cuentaEfectivo) return 'no hay cuenta de Efectivo configurada'
    const { error } = await supabase.from('movimientos_tesoreria').insert({
      empresa_id: empresaId, cuenta_id: cuentaEfectivo.id, fecha, tipo: 'salida', monto,
      concepto: `Base entregada ${rutaSeleccionada.nombre} - ${vendedorSeleccionado.nombre}`,
      referencia_tipo: 'base_despacho', referencia_id: despachoId
    })
    return error?.message || null
  }

  const guardarComoBorrador = async (estadoFinal) => {
    if (guardando) return
    if (!rutaSeleccionada) { alert('Selecciona una ruta'); return }
    if (!vendedorSeleccionado) { alert('Selecciona el vendedor'); return }
    if (!baseEntregada) { alert('Ingresa la base entregada al vendedor'); return }
    const productosConCantidad = productos.filter(p => {
      return parseFloat(cantidades[p.sku]?.viejo || 0) + parseFloat(cantidades[p.sku]?.nuevo || 0) > 0
    })
    if (productosConCantidad.length === 0) { alert('Ingresa al menos un producto'); return }

    setGuardando(true)

    const { data: empresaRow } = await supabase.from('empresas').select('modelos').eq('id', getEmpresaId()).maybeSingle()
    const esProduccion = (empresaRow?.modelos || []).includes('produccion')
    const disponible = await calcularStockDisponible(productosConCantidad.map(p => p.sku), esProduccion)
    const faltantes = productosConCantidad
      .map(p => ({
        p,
        solicitado: parseFloat(cantidades[p.sku]?.viejo || 0) + parseFloat(cantidades[p.sku]?.nuevo || 0),
        disp: disponible[p.sku]
      }))
      .filter(f => f.disp !== null && f.solicitado > f.disp)
    if (faltantes.length > 0) {
      const detalle = faltantes.map(f => `${f.p.nombre}: disponible ${f.disp}, solicitado ${f.solicitado}`).join('\n')
      // En Arepas la produccion del dia se registra por tandas y a veces la
      // ruta sale antes de registrar lo que esta saliendo de la maquina: se
      // avisa pero se deja despachar (el inventario cuadra cuando se registre).
      if (!esProduccion) {
        alert('Stock insuficiente segun el inventario:\n' + detalle)
        setGuardando(false)
        return
      }
      if (!confirm('Segun la produccion registrada no alcanza:\n' + detalle +
        '\n\nSi hay paquetes saliendo de produccion que aun no se registran, registralos en Produccion apenas puedas.\n\n¿Despachar de todas formas?')) {
        setGuardando(false)
        return
      }
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

    // La base sale de Efectivo cuando el despacho queda confirmado, y vuelve a
    // entrar dentro del efectivo de la liquidacion. Antes solo se registraba la
    // entrada, asi que cada base inflaba el saldo de Efectivo.
    if (estadoGuardar === 'despachado') {
      const fallo = await registrarSalidaBase(despachoId, fecha, empresaId)
      if (fallo) alert('El despacho se guardo, pero no se pudo registrar la salida de la base en Caja: ' + fallo)
    }

    localStorage.removeItem(claveAutosaveNuevo(rutaSeleccionada.id))
    localStorage.removeItem(claveAutosaveExistente(despachoId))
    hayEdicionUsuario.current = false
    setAutosavePendiente(null)

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

  // Grupos en el orden en que se carga el carro (lib/orden-productos).
  const categorias = [...new Set(productos.map(grupoDespacho))]

  // Navegacion tipo Excel en la grilla de cantidades.
  const navegarGrilla = (e, col, fila) => {
    const ir = (c, f) => {
      const el = document.querySelector(`[data-grilla="${c}"][data-fila="${f}"]`)
      if (el) { e.preventDefault(); el.focus() }
    }
    if (e.key === 'Enter' || e.key === 'ArrowDown') ir(col, fila + 1)
    else if (e.key === 'ArrowUp') ir(col, fila - 1)
    else if (e.key === 'ArrowRight' && col === 'viejo') ir('nuevo', fila)
    else if (e.key === 'ArrowLeft' && col === 'nuevo') ir('viejo', fila)
  }

  // Ya estamos en /despacho: router.push a la misma ruta no remonta la
  // pantalla, asi que hay que limpiar el estado a mano para volver a la lista.
  const volverAlInicio = () => {
    setGuardado(false)
    setRutaSeleccionada(null)
    setVendedorSeleccionado(null)
    setDespachoIdActual(null)
    setBaseEntregada('')
    setModoAgregar(false)
    setExistentePorSku({})
    setCargaEstandarPorSku({})
    cargarBorradores()
  }

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
          <button onClick={volverAlInicio} className="flex-1 bg-brand hover:bg-brand-dark text-white px-4 py-3 rounded-xl font-bold">
            Volver al inicio
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <PageHeader title="Despacho" subtitle={new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })} />

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
              {Object.keys(cargaEstandarPorSku).length > 0 && !modoAgregar && (
                <p className="text-xs text-brand font-bold mt-1">
                  Esta ruta tiene carga estandar sugerida para hoy — se muestra junto a cada producto, decide cuanto sale de viejo y cuanto de nuevo.
                </p>
              )}
            </div>

            {autosavePendiente && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <p className="text-sm font-bold text-gray-800">Quedó un despacho sin terminar en este navegador</p>
                <p className="text-xs text-gray-600 mt-1">
                  {autosavePendiente.unidades} und
                  {autosavePendiente.base ? ` · base $${autosavePendiente.base.toLocaleString('es-CO')}` : ''}
                  {autosavePendiente.vendedor ? ` · ${autosavePendiente.vendedor.nombre}` : ''}
                  {autosavePendiente.snap.guardadoEn ? ` · ${new Date(autosavePendiente.snap.guardadoEn).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}` : ''}
                </p>
                <div className="flex gap-2 mt-3">
                  <button onClick={recuperarAutosave} className="flex-1 bg-secondary hover:bg-black text-white text-sm font-bold py-2 rounded-lg">Recuperar</button>
                  <button onClick={descartarAutosave} className="flex-1 bg-white border border-gray-200 text-gray-600 text-sm font-bold py-2 rounded-lg">Descartar</button>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <label className="text-sm font-black text-gray-700 block mb-2">👤 Vendedor asignado</label>
              <div className="grid grid-cols-2 gap-2">
                {vendedores.map(v => (
                  <button key={v.id} onClick={() => { hayEdicionUsuario.current = true; setVendedorSeleccionado(v) }}
                    className={`p-3 rounded-xl border-2 text-sm font-semibold transition-all ${vendedorSeleccionado?.id === v.id ? 'border-brand bg-brand/5 text-brand' : 'border-gray-200 text-gray-600'}`}>
                    {v.nombre}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <label className="text-sm font-black text-gray-700 block mb-2">💰 Base entregada al vendedor</label>
              <InputDinero value={baseEntregada} onChange={e => { hayEdicionUsuario.current = true; setBaseEntregada(e.target.value) }}
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

            {/* Tipo hoja de calculo: una fila por producto. Enter / flecha abajo
                baja al siguiente, flecha arriba sube, izquierda/derecha cambia
                entre X Viejo y Y Nuevo. Al entrar se selecciona el numero. */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-4">
              <div className="grid grid-cols-[1fr_4.5rem_4.5rem_3rem] gap-2 px-3 py-2 bg-gray-50 text-[11px] font-bold text-gray-500 uppercase tracking-wide sticky top-0">
                <span>Producto</span>
                <span className="text-center">X Viejo{modoAgregar ? ' +' : ''}</span>
                <span className="text-center">Y Nuevo{modoAgregar ? ' +' : ''}</span>
                <span className="text-right">Total</span>
              </div>
              {(() => {
                let fila = -1
                return categorias.map(cat => (
                  <div key={cat}>
                    <p className="px-3 pt-2 pb-1 text-[11px] font-black text-gray-400 uppercase tracking-wide border-t border-gray-100">{cat}</p>
                    {productos.filter(p => grupoDespacho(p) === cat).map(p => {
                      fila += 1
                      const i = fila
                      return (
                        <div key={p.sku} className="grid grid-cols-[1fr_4.5rem_4.5rem_3rem] gap-2 px-3 py-1.5 items-center border-t border-gray-50">
                          <div className="min-w-0">
                            <p className="font-medium text-gray-800 text-sm truncate">{p.nombre}</p>
                            <p className="text-[11px] text-gray-400 truncate">
                              {p.sku} · ${p.precio_venta?.toLocaleString('es-CO')}
                              {modoAgregar && existentePorSku[p.sku] ? <span className="text-secondary"> · ya enviado {existentePorSku[p.sku].total}</span> : null}
                              {!modoAgregar && cargaEstandarPorSku[p.sku] ? <span className="text-brand font-bold"> · sugerido {cargaEstandarPorSku[p.sku]}</span> : null}
                            </p>
                          </div>
                          <input type="text" inputMode="decimal" value={cantidades[p.sku]?.viejo ?? ''}
                            data-grilla="viejo" data-fila={i}
                            onFocus={e => e.target.select()} onKeyDown={e => navegarGrilla(e, 'viejo', i)}
                            onChange={e => { hayEdicionUsuario.current = true; const v = e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''); setCantidades(prev => ({ ...prev, [p.sku]: { ...prev[p.sku], viejo: v } })) }}
                            className="w-full text-center border-2 border-gray-200 rounded-lg py-1.5 font-bold text-gray-800 focus:border-brand focus:outline-none" />
                          <input type="text" inputMode="decimal" value={cantidades[p.sku]?.nuevo ?? ''}
                            data-grilla="nuevo" data-fila={i}
                            onFocus={e => e.target.select()} onKeyDown={e => navegarGrilla(e, 'nuevo', i)}
                            onChange={e => { hayEdicionUsuario.current = true; const v = e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''); setCantidades(prev => ({ ...prev, [p.sku]: { ...prev[p.sku], nuevo: v } })) }}
                            className="w-full text-center border-2 border-gray-200 rounded-lg py-1.5 font-bold text-gray-800 focus:border-brand focus:outline-none" />
                          <p className="text-right font-black text-gray-700 text-sm">
                            {parseFloat(cantidades[p.sku]?.viejo || 0) + parseFloat(cantidades[p.sku]?.nuevo || 0)}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                ))
              })()}
            </div>

            <div className="flex gap-3 mt-4">
              <button onClick={() => {
                if (rutaSeleccionada) localStorage.removeItem(despachoIdActual ? claveAutosaveExistente(despachoIdActual) : claveAutosaveNuevo(rutaSeleccionada.id))
                setAutosavePendiente(null)
                setRutaSeleccionada(null); setModoAgregar(false); setExistentePorSku({})
              }} className="flex-1 bg-gray-100 text-gray-600 font-bold py-4 rounded-xl text-base">
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
