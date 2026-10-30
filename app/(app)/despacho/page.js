'use client'
import { useState, useEffect, useRef, Fragment } from 'react'
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
import { cargarLotes, repartir, etiquetaLote, AVISO_DIAS, DIAS_FUERA_NEVERA } from '@/lib/lotes'

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
  // Bolsas de reparto (Distri): salen del inventario de bolsas con el despacho, no se cobran a la ruta.
  const [bolsasProd, setBolsasProd] = useState([])
  const [bolsas, setBolsas] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const router = useRouter()
  const hayEdicionUsuario = useRef(false)
  // Borrador local recuperable (de una sesion que se dejo a medias en este
  // navegador). Se ofrece con un aviso dentro del formulario, no con confirm().
  const [autosavePendiente, setAutosavePendiente] = useState(null)
  // Tablero del dia y ayudas de la carga.
  const [ultimoPorRuta, setUltimoPorRuta] = useState({}) // ruta_id -> ultimo despacho confirmado
  const [esProduccion, setEsProduccion] = useState(false)
  const [stockSku, setStockSku] = useState({})
  // Arepas: lotes por dia de produccion y regla de la ruta (viejo/fresco).
  const [lotes, setLotes] = useState({})
  const [preferencia, setPreferencia] = useState('viejo')
  const [repartoManual, setRepartoManual] = useState({}) // sku -> [{ fecha, cantidad }]
  const [editandoReparto, setEditandoReparto] = useState(null) // { sku, partes }
  const [cargandoRuta, setCargandoRuta] = useState(false)

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (!puedeVerModulo(parsed, 'despacho', ['admin', 'auxiliar'])) { router.push('/kiosco'); return }
    setUsuario(parsed)
    supabase.from('empresas').select('modelos').eq('id', getEmpresaId()).maybeSingle().then(({ data }) => setEsProduccion((data?.modelos || []).includes('produccion')))
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
      .neq('estado', 'cancelado')
      .eq('empresa_id', getEmpresaId())
      .order('created_at', { ascending: false })
    if (data) setBorradores(data)
    // El ultimo despacho de cada ruta: su vendedor, su base y su carga sirven de punto de partida.
    const desde = new Date(new Date(fecha + 'T12:00:00').getTime() - 30 * 864e5).toLocaleDateString('en-CA')
    const { data: previos } = await supabase.from('despachos_encab').select('id, ruta_id, vendedor_id, fecha, total_und, created_at')
      .gte('fecha', desde).lt('fecha', fecha).in('estado', ['despachado', 'por_aprobar', 'liquidado']).eq('empresa_id', getEmpresaId())
      .order('fecha', { ascending: false }).order('created_at', { ascending: false })
    const m = {}
    ;(previos || []).forEach(d => { if (!m[d.ruta_id]) m[d.ruta_id] = d })
    setUltimoPorRuta(m)
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
    supabase.from('productos').select('sku, nombre').like('sku', 'BOL-%').eq('estado', true).eq('empresa_id', getEmpresaId()).order('sku').then(({ data }) => setBolsasProd(data || []))
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

  // Arepas: de que dia sale cada producto (regla de la ruta o lo que se cambio a mano).
  const hoyStr = obtenerFechaActual()
  const totalDe = (sku) => parseFloat(cantidades[sku]?.viejo || 0) + parseFloat(cantidades[sku]?.nuevo || 0)
  const repartoDe = (sku) => {
    const total = totalDe(sku)
    const manual = repartoManual[sku]
    if (manual && Math.abs(manual.reduce((s, x) => s + x.cantidad, 0) - total) < 0.001) return manual.filter(x => x.cantidad > 0)
    return total > 0 ? repartir(lotes[sku], total, preferencia) : []
  }
  const parte = (sku) => {
    const total = totalDe(sku)
    if (!esProduccion) return { viejo: 0, nuevo: total }
    const viejo = repartoDe(sku).filter(x => x.fecha < hoyStr).reduce((s, x) => s + x.cantidad, 0)
    return { viejo, nuevo: total - viejo }
  }

  // Stock (y lotes en Arepas) para mostrar en la carga.
  const prepararStock = async (despachoId) => {
    const stock = await calcularStockPorSku({ excluirDespachoId: despachoId, empresaId: getEmpresaId() })
    setStockSku(Object.fromEntries(Object.entries(stock).map(([k, v]) => [k, v.stockActual])))
    setLotes(esProduccion ? await cargarLotes({ excluirDespachoId: despachoId }) : {})
  }

  const llenarConUltimo = async () => {
    const ult = ultimoPorRuta[rutaSeleccionada?.id]
    if (!ult) return
    const { data } = await supabase.from('despachos_detalle').select('sku, total').eq('despacho_id', ult.id).eq('empresa_id', getEmpresaId())
    hayEdicionUsuario.current = true
    setRepartoManual({})
    setCantidades(prev => {
      const n = Object.fromEntries(Object.keys(prev).map(k => [k, { viejo: '0', nuevo: '0' }]))
      ;(data || []).forEach(d => { if (n[d.sku]) n[d.sku] = { viejo: '0', nuevo: String(d.total || 0) } })
      return n
    })
  }
  const llenarConEstandar = () => {
    hayEdicionUsuario.current = true
    setRepartoManual({})
    setCantidades(prev => Object.fromEntries(Object.keys(prev).map(k => [k, { viejo: '0', nuevo: String(cargaEstandarPorSku[k] || 0) }])))
  }

  const seleccionarRuta = async (ruta) => {
    hayEdicionUsuario.current = false
    setDespachoIdActual(null)
    setVendedorSeleccionado(null)
    setBaseEntregada('')
    setModoAgregar(false)
    setExistentePorSku({})
    setCargaEstandarPorSku({})
    setRutaSeleccionada(ruta)
    setRepartoManual({})
    setPreferencia(ruta.lote_preferencia || 'viejo')
    setCargandoRuta(true)
    await cargarProductos(ruta)
    // Vendedor y base: los del ultimo despacho de la ruta (o el vendedor ligado a ella).
    const ult = ultimoPorRuta[ruta.id]
    const ligados = vendedores.filter(v => v.ruta_id === ruta.id)
    setVendedorSeleccionado(vendedores.find(v => v.id === ult?.vendedor_id) || (ligados.length === 1 ? ligados[0] : null))
    // Base: la configurada para la ruta (Configuración → Parámetros) o la del último despacho.
    const { data: bRuta } = await supabase.from('configuracion').select('valor').eq('parametro', 'base_ruta_' + ruta.id).eq('empresa_id', getEmpresaId()).maybeSingle()
    if (bRuta?.valor !== undefined && bRuta?.valor !== null && bRuta.valor !== '') setBaseEntregada(String(bRuta.valor))
    else if (ult) {
      const { data: b } = await supabase.from('configuracion').select('valor').eq('parametro', 'base_despacho_' + ult.id).eq('empresa_id', getEmpresaId()).maybeSingle()
      if (b?.valor) setBaseEntregada(String(b.valor))
    }
    await prepararStock(null)
    setCargandoRuta(false)

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
    setRepartoManual({})
    setPreferencia(ruta?.lote_preferencia || 'viejo')
    setRutaSeleccionada({ id: d.ruta_id, nombre: d.rutas?.nombre || ruta?.nombre, lote_preferencia: ruta?.lote_preferencia })
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
        nuevasCantidades[det.sku] = { viejo: '0', nuevo: String((det.lote_viejo_x || 0) + (det.lote_nuevo_y || 0)) }
      }
    })
    setExistentePorSku(existente)
    setCantidades(nuevasCantidades)
    if (config) setBaseEntregada(String(config.valor || ''))
    // Bolsas ya anotadas en este despacho (al agregar producto se parte de cero).
    if (!esAgregar) {
      const { data: yaB } = await supabase.from('inventario_mov').select('sku, cantidad, tipo_movimiento').eq('despacho_id', d.id).like('referencia', 'Bolsas de reparto%').eq('empresa_id', getEmpresaId())
      const b = {}
      ;(yaB || []).forEach(m => { b[m.sku] = (b[m.sku] || 0) + (m.tipo_movimiento === 'salida' ? 1 : -1) * Number(m.cantidad || 0) })
      setBolsas(Object.fromEntries(Object.entries(b).filter(([, v]) => v > 0).map(([k, v]) => [k, String(v)])))
    } else setBolsas({})
    ofrecerRestaurarAutosave(claveAutosaveExistente(d.id), vendedores, null)
    await prepararStock(esAgregar ? null : d.id)
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
      const adicionViejo = parte(p.sku).viejo
      const adicionNuevo = parte(p.sku).nuevo
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
    if (estadoGuardar === 'despachado' && esProduccion) {
      // De que dia de produccion salio cada producto. Al confirmar se
      // reemplaza; al agregar producto se suma lo nuevo.
      if (!modoAgregar) await supabase.from('lotes_salida').delete().eq('despacho_id', despachoId).eq('empresa_id', empresaId)
      const filasLote = productos.flatMap(p => repartoDe(p.sku).map(x => ({ empresa_id: empresaId, despacho_id: despachoId, sku: p.sku, fecha_lote: x.fecha, cantidad: x.cantidad })))
      if (filasLote.length) {
        const { error: errLote } = await supabase.from('lotes_salida').insert(filasLote)
        if (errLote) alert('El despacho se guardo, pero no se pudo guardar de que dia salio cada producto: ' + errLote.message)
      }
    }
    if (estadoGuardar === 'despachado') {
      const fallo = await registrarSalidaBase(despachoId, fecha, empresaId)
      if (fallo) alert('El despacho se guardo, pero no se pudo registrar la salida de la base en Caja: ' + fallo)
      // Bolsas de reparto: salida de inventario ligada al despacho. Los movimientos no se
      // borran: al reconfirmar se registra solo la diferencia contra lo ya anotado.
      const { data: yaBolsas } = await supabase.from('inventario_mov').select('sku, cantidad, tipo_movimiento').eq('despacho_id', despachoId).like('referencia', 'Bolsas de reparto%').eq('empresa_id', empresaId)
      const previo = {}
      ;(yaBolsas || []).forEach(m => { previo[m.sku] = (previo[m.sku] || 0) + (m.tipo_movimiento === 'salida' ? 1 : -1) * Number(m.cantidad || 0) })
      const filasBolsas = bolsasProd.map(b => {
        const nueva = parseFloat(bolsas[b.sku]) || 0
        const dif = modoAgregar ? nueva : nueva - (previo[b.sku] || 0)
        return dif ? { empresa_id: empresaId, sku: b.sku, cantidad: Math.abs(dif), fecha, tipo_movimiento: dif > 0 ? 'salida' : 'entrada', referencia: `Bolsas de reparto · ${rutaSeleccionada.nombre}${dif < 0 ? ' (corrección)' : ''}`, despacho_id: despachoId } : null
      }).filter(Boolean)
      if (filasBolsas.length) {
        const { error: errB } = await supabase.from('inventario_mov').insert(filasBolsas)
        if (errB) alert('El despacho se guardo, pero no se pudieron registrar las bolsas de reparto: ' + errB.message)
      }
      setBolsas({})
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

  // ---------- pantalla (linea de Mi ruta) ----------
  const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', linea: '#E3E1D8', suave: '#EFEDE6', neutro: '#E9E4D6', rojo: '#C41230', rojoF: '#FBE9E9', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8' }
  const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
  const $ = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
  const millones = (n) => n >= 1e6 ? '$' + (n / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 2 }) + ' M' : $(n)
  const tarjeta = 'bg-white rounded-[18px] p-3.5 min-w-0'
  const pill = (texto, color, fondo, punto) => <span className="inline-flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap" style={{ color, background: fondo }}>{punto && <i className="w-[7px] h-[7px] rounded-full" style={{ background: '#F2B21B' }} />}{texto}</span>
  const hora = (iso) => iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) : ''
  const diaSemana = new Date(hoyStr + 'T12:00:00').getDay()
  const DIAS_NOMBRE = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  // "Lunes a Viernes", "Lunes a Sabado", "Lunes, Miercoles"... sin dato = lunes a sabado.
  const saleHoy = (r) => {
    const t = (r.dias_operacion || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    if (!t) return diaSemana !== 0
    const idx = (n) => ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'].findIndex(d => n.includes(d))
    const rango = t.match(/(\w+)\s+a\s+(\w+)/)
    if (rango) { const a = idx(rango[1]), b = idx(rango[2]); return a >= 0 && b >= 0 && diaSemana >= a && diaSemana <= b }
    return t.split(/[,y]/).some(x => idx(x.trim()) === diaSemana)
  }
  const colorLote = (l) => l.diasParaVencer != null && l.diasParaVencer <= AVISO_DIAS ? [C.rojo, C.rojoF] : l.fecha && l.fecha < hoyStr ? [C.ambar, C.ambarF] : [C.verde, C.verdeF]
  const textoReparto = (r) => r.map(x => `${x.cantidad} ${x.fecha === hoyStr ? 'de hoy' : 'del ' + etiquetaLote(x.fecha)}`).join(' + ')

  if (guardado) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: C.fondo, color: C.tinta }}>
      <div className="bg-white rounded-[22px] p-7 text-center max-w-md w-full flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: C.verdeF }} aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={C.verde} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
        </div>
        <h2 className="font-extrabold text-[24px]" style={titulo}>Despacho confirmado</h2>
        <p style={{ color: C.gris }}>{rutaSeleccionada?.nombre} · {vendedorSeleccionado?.nombre}</p>
        <p className="font-extrabold text-[28px] tabular-nums" style={titulo}>{totalUnidades().toLocaleString('es-CO')} unidades</p>
        <p className="text-[14px]" style={{ color: C.gris }}>Base {$(baseEntregada)} · ya le aparece el carro en Mi ruta</p>
        <div className="grid grid-cols-2 gap-2 w-full">
          <button onClick={() => router.push(despachoIdActual ? `/imprimir?despacho=${despachoIdActual}` : '/imprimir')} className="min-h-[48px] rounded-2xl font-bold" style={{ background: C.fondo }}>Imprimir hoja</button>
          <button onClick={volverAlInicio} className="min-h-[48px] rounded-2xl font-bold text-white" style={{ background: C.rojo }}>Otra ruta</button>
        </div>
      </div>
    </div>
  )

  // ---------- 1. Tablero de rutas del dia ----------
  if (!rutaSeleccionada) {
    const deHoy = (rutaId) => borradores.filter(b => b.ruta_id === rutaId)
    const confirmados = borradores.filter(b => b.estado !== 'borrador')
    const salen = rutas.filter(saleHoy)
    const noSalen = rutas.filter(r => !saleHoy(r))
    const despachadas = salen.filter(r => deHoy(r.id).some(b => b.estado !== 'borrador')).length
    const tarjetaRuta = (r) => {
      const ds = deHoy(r.id)
      const conf = ds.filter(b => b.estado !== 'borrador')
      const borr = ds.find(b => b.estado === 'borrador')
      const ult = ultimoPorRuta[r.id]
      const und = conf.reduce((s, b) => s + (b.total_und || 0), 0)
      const valor = conf.reduce((s, b) => s + (b.total_valor || 0), 0)
      const estado = conf.some(b => b.estado === 'liquidado') ? pill('Liquidada', C.verde, C.verdeF)
        : conf.some(b => b.estado === 'por_aprobar') ? pill('Por aprobar', C.ambar, C.ambarF)
          : conf.length ? pill('En la calle', C.tinta, C.neutro, true)
            : borr ? pill('Borrador', C.ambar, C.ambarF) : pill('Sin despachar', C.gris, C.suave)
      const vend = (conf[0] || borr)?.vendedores?.nombre || vendedores.find(v => v.id === ult?.vendedor_id)?.nombre || vendedores.filter(v => v.ruta_id === r.id).map(v => v.nombre).join(', ')
      return (
        <article key={r.id} className={tarjeta + ' flex flex-col gap-2.5'}>
          <div className="flex justify-between gap-3 items-start">
            <div className="min-w-0">
              <h3 className="font-extrabold text-[17px] leading-tight" style={titulo}>{r.nombre}</h3>
              <p className="text-[13px]" style={{ color: C.gris }}>
                {vend || 'Sin vendedor'}
                {conf.length ? ` · salió ${hora(conf[conf.length - 1].hora_cargue || conf[conf.length - 1].created_at)}` : borr ? ` · guardado ${hora(borr.created_at)}` : ult ? ` · la última vez salió con ${ult.total_und} und` : ''}
              </p>
            </div>
            {estado}
          </div>
          {(conf.length > 0 || borr) && (
            <div className="grid grid-cols-2 gap-1.5">
              {[['Unidades', (conf.length ? und : borr.total_und || 0).toLocaleString('es-CO')], ['Valor', millones(conf.length ? valor : borr.total_valor || 0)]].map(([t, v]) => (
                <div key={t} className="rounded-xl px-2.5 py-1.5" style={{ background: C.fondo }}><span className="block text-[11.5px] font-bold" style={{ color: C.gris }}>{t}</span><b className="tabular-nums" style={titulo}>{v}</b></div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {conf.length === 0 && !borr && <button onClick={() => seleccionarRuta(r)} className="px-4 min-h-[40px] rounded-xl text-[13.5px] font-bold" style={{ background: C.suave, color: C.tinta }}>Despachar</button>}
            {borr && <button onClick={() => resumirBorrador(borr)} className="px-4 min-h-[40px] rounded-xl text-[13.5px] font-bold text-white" style={{ background: C.rojo }}>Terminar y despachar</button>}
            {conf.filter(b => b.estado === 'despachado').slice(0, 1).map(b => <button key={b.id} onClick={() => resumirBorrador(b)} className="px-3 min-h-[40px] rounded-xl text-[13.5px] font-bold" style={{ background: C.suave }}>+ Agregar producto</button>)}
            {conf.map(b => <button key={'h' + b.id} onClick={() => router.push(`/imprimir?despacho=${b.id}`)} className="px-3 min-h-[40px] rounded-xl text-[13.5px] font-bold" style={{ background: C.suave }}>{conf.length > 1 ? `Hoja ${b.vendedores?.nombre?.split(' ')[0] || ''}`.trim() : 'Hoja'}</button>)}
          </div>
        </article>
      )
    }
    return (
      <div style={{ background: C.fondo, minHeight: '100vh', color: C.tinta }}>
        <PageHeader title="Despacho" subtitle={new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })} />
        <div className="p-4 max-w-6xl mx-auto flex flex-col gap-4">
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
            <div className={tarjeta + ' flex flex-col gap-0.5'}><span className="text-[12.5px] font-bold" style={{ color: C.gris }}>Despachadas</span><span className="font-extrabold text-[24px] tabular-nums" style={titulo}>{despachadas} de {salen.length}</span><span className="text-[12.5px]" style={{ color: C.gris }}>{borradores.filter(b => b.estado === 'borrador').length} en borrador</span></div>
            <div className={tarjeta + ' flex flex-col gap-0.5'}><span className="text-[12.5px] font-bold" style={{ color: C.gris }}>Unidades en ruta</span><span className="font-extrabold text-[24px] tabular-nums" style={titulo}>{confirmados.reduce((s, b) => s + (b.total_und || 0), 0).toLocaleString('es-CO')}</span><span className="text-[12.5px]" style={{ color: C.gris }}>Valor {millones(confirmados.reduce((s, b) => s + (b.total_valor || 0), 0))}</span></div>
            <div className={tarjeta + ' flex flex-col gap-0.5 col-span-2 lg:col-span-1'}><span className="text-[12.5px] font-bold" style={{ color: C.gris }}>Hoy es {DIAS_NOMBRE[diaSemana]}</span><span className="font-extrabold text-[24px] tabular-nums" style={titulo}>{salen.length} ruta{salen.length === 1 ? '' : 's'}</span><span className="text-[12.5px]" style={{ color: C.gris }}>{noSalen.length ? `${noSalen.length} no sale${noSalen.length === 1 ? '' : 'n'} hoy` : 'Salen todas'}</span></div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 items-start">{salen.map(tarjetaRuta)}</div>
          {noSalen.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-bold" style={{ color: C.gris }}>No salen hoy · se pueden despachar igual</span>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 items-start opacity-80">{noSalen.map(tarjetaRuta)}</div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ---------- 2. Cargar una ruta ----------
  const conCantidad = productos.filter(p => totalDe(p.sku) > 0)
  const noAlcanza = productos.filter(p => stockSku[p.sku] != null && totalDe(p.sku) > Math.max(0, stockSku[p.sku]))
  let fila = -1
  return (
    <div style={{ background: C.fondo, minHeight: '100vh', color: C.tinta }}>
      <PageHeader title="Despacho" subtitle={`${rutaSeleccionada.nombre}${modoAgregar ? ' · agregar producto' : ''}`}
        onBack={() => {
          if (rutaSeleccionada) localStorage.removeItem(despachoIdActual ? claveAutosaveExistente(despachoIdActual) : claveAutosaveNuevo(rutaSeleccionada.id))
          setAutosavePendiente(null); setRutaSeleccionada(null); setModoAgregar(false); setExistentePorSku({}); setEditandoReparto(null)
        }} />
      <div className="p-4 max-w-6xl mx-auto flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-extrabold text-[24px] leading-tight" style={titulo}>{rutaSeleccionada.nombre}</h1>
            <p style={{ color: C.gris }}>{modoAgregar ? `Ya salió con ${Object.values(existentePorSku).reduce((s, e) => s + e.total, 0)} und · lo que pongas se suma` : `${DIAS_NOMBRE[diaSemana]} ${new Date(hoyStr + 'T12:00:00').getDate()}`}{rutaSeleccionada.nombre === 'RUTA TAT MANRIQUE' ? ' · solo referencias TAT' : ''}</p>
          </div>
        </div>

        {autosavePendiente && (
          <div className="rounded-2xl px-3.5 py-3 flex flex-wrap items-center justify-between gap-2" style={{ background: C.ambarF }}>
            <span className="text-[14px]" style={{ color: C.ambar }}><b>Quedó un despacho sin terminar en este navegador:</b> {autosavePendiente.unidades} und{autosavePendiente.base ? ` · base ${$(autosavePendiente.base)}` : ''}{autosavePendiente.vendedor ? ` · ${autosavePendiente.vendedor.nombre}` : ''}</span>
            <span className="flex gap-2"><button onClick={recuperarAutosave} className="px-3 min-h-[36px] rounded-xl text-[13px] font-bold" style={{ background: '#fff', color: C.tinta }}>Recuperar</button><button onClick={descartarAutosave} className="px-3 min-h-[36px] rounded-xl text-[13px] font-bold bg-white">Descartar</button></span>
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_310px] items-start">
          <div className="flex flex-col gap-3 min-w-0">
            {!modoAgregar && (
              <div className={tarjeta + ' flex flex-col gap-2.5'}>
                <div className="flex justify-between gap-2 flex-wrap"><b>Vendedor</b>{ultimoPorRuta[rutaSeleccionada.id] && <span className="text-[12.5px]" style={{ color: C.gris }}>El de la última vez ya viene escogido</span>}</div>
                <div className="flex flex-wrap gap-1.5">
                  {vendedores.map(v => (
                    <button key={v.id} onClick={() => { hayEdicionUsuario.current = true; setVendedorSeleccionado(v) }} aria-pressed={vendedorSeleccionado?.id === v.id}
                      className="px-3 min-h-[36px] rounded-full text-[13px] font-bold" style={vendedorSeleccionado?.id === v.id ? { background: '#fff', color: C.tinta, boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: C.suave, color: C.gris }}>{v.nombre}</button>
                  ))}
                </div>
                <b className="mt-1">Llenar la tabla</b>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(cargaEstandarPorSku).length > 0 && <button onClick={llenarConEstandar} className="px-3 min-h-[38px] rounded-xl text-[13px] font-bold" style={{ background: C.suave, color: C.tinta }}>Usar carga estándar del {DIAS_NOMBRE[diaSemana]}</button>}
                  {ultimoPorRuta[rutaSeleccionada.id] && <button onClick={llenarConUltimo} className="px-3 min-h-[38px] rounded-xl text-[13px] font-bold" style={{ background: C.suave }}>Igual al último despacho ({new Date(ultimoPorRuta[rutaSeleccionada.id].fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })})</button>}
                  {!Object.keys(cargaEstandarPorSku).length && !ultimoPorRuta[rutaSeleccionada.id] && <span className="text-[13px]" style={{ color: C.gris }}>Esta ruta no tiene carga estándar ni despachos anteriores.</span>}
                </div>
              </div>
            )}

            <div className={tarjeta + ' flex flex-col gap-1'}>
              {esProduccion && (
                <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                  <span className="text-[13px]" style={{ color: C.gris }}>Sale primero</span>
                  <div className="flex gap-1.5">
                    {[['viejo', 'Lo más viejo'], ['fresco', 'Lo más fresco']].map(([id, t]) => (
                      <button key={id} onClick={() => { setPreferencia(id); setRepartoManual({}) }} aria-pressed={preferencia === id} className="px-3 min-h-[34px] rounded-full text-[13px] font-bold"
                        style={preferencia === id ? { background: '#fff', color: C.tinta, boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: C.suave, color: C.gris }}>{t}</button>
                    ))}
                  </div>
                </div>
              )}
              {cargandoRuta ? <p className="text-sm py-8 text-center" style={{ color: C.gris }}>Cargando…</p> : (
                <div className="overflow-x-auto -mx-1 px-1">
                  <table className="w-full text-[14px] tabular-nums" style={{ minWidth: esProduccion ? 600 : 420 }}>
                    <thead>
                      <tr className="text-[11.5px] uppercase tracking-wide" style={{ color: C.gris }}>
                        <th className="text-left font-bold py-1.5">Producto</th>
                        <th className="font-bold text-left">{esProduccion ? 'En bodega, por día' : 'En bodega'}</th>
                        {!modoAgregar && <th className="font-bold">Estándar</th>}
                        <th className="font-bold">{modoAgregar ? 'Agrega' : 'Sale'}</th>
                        {esProduccion && <th className="font-bold text-left">De qué día sale</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {categorias.map(cat => (
                        <Fragment key={cat}>
                          <tr><td colSpan={5} className="pt-3 pb-1 text-[11.5px] font-extrabold uppercase tracking-wider" style={{ color: C.gris }}>{cat}</td></tr>
                          {productos.filter(p => grupoDespacho(p) === cat).map(p => {
                            fila += 1
                            const i = fila
                            const total = totalDe(p.sku)
                            const stock = stockSku[p.sku]
                            const falta = stock != null && total > Math.max(0, stock)
                            const lts = lotes[p.sku] || []
                            const rep = esProduccion && total > 0 ? repartoDe(p.sku) : []
                            return (
                              <Fragment key={p.sku}>
                                <tr style={{ borderTop: `1px solid ${C.linea}` }}>
                                  <td className="py-2 pr-2 min-w-[150px]">
                                    <b className="block leading-tight">{p.nombre}</b>
                                    <span className="text-[12px]" style={{ color: C.gris }}>{$(p.precio_venta)}{modoAgregar && existentePorSku[p.sku] ? ` · ya lleva ${existentePorSku[p.sku].total}` : ''}</span>
                                  </td>
                                  <td className="py-2">
                                    {esProduccion ? (
                                      <div className="flex flex-wrap gap-1">
                                        {lts.length === 0 ? <span className="text-[12.5px]" style={{ color: C.gris }}>{stock != null ? Math.max(0, stock) : '—'}</span>
                                          : lts.map(l => { const [c, f] = colorLote(l); return <span key={l.fecha || 'x'} className="text-[12px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color: c, background: f }}>{l.cantidad} · {etiquetaLote(l.fecha)}</span> })}
                                      </div>
                                    ) : <span style={{ color: falta ? C.rojo : C.tinta, fontWeight: falta ? 700 : 400 }}>{stock != null ? Math.max(0, stock) : '—'}</span>}
                                  </td>
                                  {!modoAgregar && <td className="text-center" style={{ color: C.gris }}>{cargaEstandarPorSku[p.sku] || '—'}</td>}
                                  <td className="text-center px-1">
                                    <input type="text" inputMode="decimal" value={cantidades[p.sku]?.nuevo ?? ''} placeholder="0" data-grilla="nuevo" data-fila={i} aria-label={`Sale ${p.nombre}`}
                                      onFocus={e => e.target.select()} onKeyDown={e => navegarGrilla(e, 'nuevo', i)}
                                      onChange={e => { hayEdicionUsuario.current = true; const v = e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''); setRepartoManual(prev => { const n = { ...prev }; delete n[p.sku]; return n }); setCantidades(prev => ({ ...prev, [p.sku]: { viejo: '0', nuevo: v } })) }}
                                      className="w-[72px] text-center rounded-xl min-h-[40px] font-bold bg-white border outline-none focus:border-[#1C1B19]" style={{ borderColor: falta ? C.rojo : C.linea }} />
                                  </td>
                                  {esProduccion && (
                                    <td className="py-2 text-[13px] leading-snug">
                                      {rep.length > 0 && <>{textoReparto(rep)}{repartoManual[p.sku] && <span style={{ color: C.gris }}> · a mano</span>}<br /><button onClick={() => setEditandoReparto({ sku: p.sku, partes: Object.fromEntries([...lts.map(l => [l.fecha || hoyStr, 0]), [hoyStr, 0], ...rep.map(x => [x.fecha, x.cantidad])]) })} className="text-[12.5px] font-bold underline" style={{ color: C.gris }}>Cambiar</button></>}
                                    </td>
                                  )}
                                </tr>
                                {(() => {
                                  const corto = rep.map(x => lts.find(l => (l.fecha || hoyStr) === x.fecha)).filter(l => l?.diasParaVencer != null && l.diasParaVencer < DIAS_FUERA_NEVERA)
                                  if (!corto.length) return null
                                  const min = Math.min(...corto.map(l => l.diasParaVencer))
                                  return <tr><td colSpan={5} className="pb-2 text-[12.5px] font-bold" style={{ color: C.ambar }}>Lleva arepas que vencen {min <= 0 ? 'hoy o ya vencieron' : `en ${min} día${min === 1 ? '' : 's'}`}: sin nevera aguantan máximo {DIAS_FUERA_NEVERA}.{preferencia === 'fresco' ? ' Para tiendas, mejor lo más fresco.' : ''}</td></tr>
                                })()}
                                {falta && <tr><td colSpan={5} className="pb-2 text-[12.5px] font-bold" style={{ color: C.rojo }}>Solo hay {Math.max(0, stock)} en bodega. Faltan {total - Math.max(0, stock)}.{esProduccion ? ' Si está saliendo de producción, regístrala apenas puedas.' : ''}</td></tr>}
                              </Fragment>
                            )
                          })}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[12.5px] pt-1" style={{ color: C.gris }}>Enter baja a la siguiente fila.{esProduccion ? ' Los colores: rojo le quedan 3 días o menos (vence a los 10 de producida), ámbar de días anteriores, verde de hoy.' : ''}</p>
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 flex flex-col gap-2">
            <div className={tarjeta + ' flex flex-col gap-2.5'}>
              <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: C.gris }}>{rutaSeleccionada.nombre}{vendedorSeleccionado ? ` · ${vendedorSeleccionado.nombre}` : ''}</span>
              <div className="grid grid-cols-2 gap-1.5">
                {[['Unidades', totalUnidades().toLocaleString('es-CO')], ['Valor', millones(totalValor())]].map(([t, v]) => (
                  <div key={t} className="rounded-xl px-2.5 py-1.5" style={{ background: C.fondo }}><span className="block text-[11.5px] font-bold" style={{ color: C.gris }}>{t}</span><b className="text-[18px] tabular-nums" style={titulo}>{v}</b></div>
                ))}
              </div>
              {!modoAgregar && (
                <label className="flex flex-col gap-1 text-[12.5px] font-bold" style={{ color: C.gris }} htmlFor="desp-base">Base para el vendedor
                  <InputDinero id="desp-base" value={baseEntregada} onChange={e => { hayEdicionUsuario.current = true; setBaseEntregada(e.target.value) }} placeholder="$0"
                    className="w-full text-center rounded-xl min-h-[50px] text-[22px] font-extrabold bg-white border outline-none focus:border-[#1C1B19]" style={{ ...titulo, borderColor: C.linea, color: C.tinta }} />
                  <span className="font-normal">Sale de Efectivo al confirmar.</span>
                </label>
              )}
              {bolsasProd.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[12.5px] font-bold" style={{ color: C.gris }}>Bolsas de reparto</span>
                  {bolsasProd.map(b => (
                    <label key={b.sku} className="flex items-center gap-2 text-[13px]"><span className="flex-1 min-w-0">{b.nombre.replace(/^Bolsa /, '')}</span>
                      <input inputMode="numeric" value={bolsas[b.sku] || ''} onChange={e => { hayEdicionUsuario.current = true; setBolsas({ ...bolsas, [b.sku]: e.target.value.replace(/\D/g, '') }) }} aria-label={b.nombre} placeholder="0"
                        className="w-20 h-10 rounded-xl border text-center font-extrabold tabular-nums bg-white" style={{ ...titulo, borderColor: C.linea }} /></label>
                  ))}
                  <span className="text-[12px]" style={{ color: C.gris }}>No se cobran a la ruta; salen del inventario de bolsas.</span>
                </div>
              )}
              {noAlcanza.length > 0 && <span className="rounded-xl px-3 py-2 text-[13px] font-bold" style={{ background: C.rojoF, color: C.rojo }}>{noAlcanza.length} producto{noAlcanza.length === 1 ? '' : 's'} no alcanza{noAlcanza.length === 1 ? '' : 'n'} en bodega</span>}
              {modoAgregar ? (
                <button onClick={() => guardarComoBorrador('despachado')} disabled={guardando || conCantidad.length === 0} className="min-h-[50px] rounded-2xl font-bold text-white disabled:opacity-50" style={{ background: C.rojo }}>{guardando ? 'Guardando…' : 'Agregar al despacho'}</button>
              ) : (
                <>
                  <button onClick={() => guardarComoBorrador('despachado')} disabled={guardando} className="min-h-[50px] rounded-2xl font-bold text-white disabled:opacity-50" style={{ background: C.rojo }}>{guardando ? 'Guardando…' : 'Confirmar despacho'}</button>
                  <button onClick={() => guardarComoBorrador('borrador')} disabled={guardando} className="min-h-[44px] rounded-2xl font-bold disabled:opacity-50" style={{ background: C.suave }}>Guardar borrador</button>
                </>
              )}
            </div>
          </aside>
        </div>
      </div>

      {editandoReparto && (() => {
        const p = productos.find(x => x.sku === editandoReparto.sku)
        const total = totalDe(editandoReparto.sku)
        const lts = Object.fromEntries((lotes[editandoReparto.sku] || []).map(l => [l.fecha || hoyStr, l.cantidad]))
        const suma = Object.values(editandoReparto.partes).reduce((s, v) => s + (Number(v) || 0), 0)
        const fechas = Object.keys(editandoReparto.partes).sort()
        return (
          <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(28,27,25,.45)' }} onClick={() => setEditandoReparto(null)}>
            <div role="dialog" aria-modal="true" aria-label="De qué día sale" onClick={e => e.stopPropagation()} className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 flex flex-col gap-3" style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}>
              <div>
                <h3 className="font-extrabold text-[20px]" style={titulo}>¿De qué día sale?</h3>
                <p className="text-[14px]" style={{ color: C.gris }}>{p?.nombre} · sale {total}. Solo si el carro se cargó distinto.</p>
              </div>
              {fechas.map(f => (
                <div key={f} className="flex items-center justify-between gap-3">
                  <span className="text-[14px]"><b>{f === hoyStr ? 'Hoy' : etiquetaLote(f)}</b> <span style={{ color: C.gris }}>· hay {lts[f] || 0}</span></span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditandoReparto(e => ({ ...e, partes: { ...e.partes, [f]: Math.max(0, (Number(e.partes[f]) || 0) - 1) } }))} className="w-10 h-10 rounded-xl text-xl font-extrabold" style={{ background: C.suave }} aria-label="Menos">−</button>
                    <input type="text" inputMode="numeric" value={editandoReparto.partes[f]} onChange={e => setEditandoReparto(x => ({ ...x, partes: { ...x.partes, [f]: e.target.value.replace(/\D/g, '') } }))} className="w-14 h-10 text-center rounded-xl font-extrabold border" style={{ borderColor: C.linea }} aria-label={`Del ${f}`} />
                    <button onClick={() => setEditandoReparto(e => ({ ...e, partes: { ...e.partes, [f]: (Number(e.partes[f]) || 0) + 1 } }))} className="w-10 h-10 rounded-xl text-xl font-extrabold" style={{ background: C.suave }} aria-label="Más">+</button>
                  </div>
                </div>
              ))}
              <p className="text-[13px] font-bold" style={{ color: suma === total ? C.verde : C.rojo }}>{suma === total ? `Suma ${total}.` : `Suma ${suma}; tiene que sumar ${total}.`}</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setRepartoManual(prev => { const n = { ...prev }; delete n[editandoReparto.sku]; return n }); setEditandoReparto(null) }} className="min-h-[48px] rounded-2xl font-bold" style={{ background: C.suave }}>Volver a la regla</button>
                <button disabled={suma !== total} onClick={() => { setRepartoManual(prev => ({ ...prev, [editandoReparto.sku]: fechas.map(f => ({ fecha: f, cantidad: Number(editandoReparto.partes[f]) || 0 })).filter(x => x.cantidad > 0) })); hayEdicionUsuario.current = true; setEditandoReparto(null) }} className="min-h-[48px] rounded-2xl font-bold text-white disabled:opacity-40" style={{ background: C.rojo }}>Listo</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
