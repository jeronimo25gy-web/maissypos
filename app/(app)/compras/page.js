'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import Stepper from '@/components/Stepper'
import { PageHeader } from '@/components/ui'

const DIAS_SEMANA = [
  { id: 1, nombre: 'Lunes' },
  { id: 2, nombre: 'Martes' },
  { id: 3, nombre: 'Miercoles' },
  { id: 4, nombre: 'Jueves' },
  { id: 5, nombre: 'Viernes' },
  { id: 6, nombre: 'Sabado' },
  { id: 0, nombre: 'Domingo' },
]

const FASES_COMPRA = ['Borrador', 'Confirmada', 'Pagada']
const indiceEstadoCompra = (estado) => estado === 'pagada' ? 2 : estado === 'confirmada' ? 1 : 0

const hoyBogota = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }))

const fechasMismoDiaSemana = (diaObjetivo) => {
  const diffDias = (hoyBogota().getDay() - diaObjetivo + 7) % 7
  const msMasReciente = Date.now() - diffDias * 24 * 60 * 60 * 1000
  return Array.from({ length: 4 }, (_, i) =>
    new Date(msMasReciente - i * 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  )
}

const rangoPeriodo = (periodo) => {
  const hoy = obtenerFechaActual()
  const dias = periodo === 'semana' ? 7 : periodo === 'mes' ? 30 : 365
  const inicio = new Date(new Date(hoy + 'T12:00:00').getTime() - dias * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  return { inicio, fin: hoy }
}

export default function Compras() {
  const [usuario, setUsuario] = useState(null)
  const [proveedores, setProveedores] = useState([])
  const [proveedorSel, setProveedorSel] = useState(null)
  const [productos, setProductos] = useState([])
  const [cantidades, setCantidades] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [vista, setVista] = useState('compra')
  const [sugeridos, setSugeridos] = useState([])
  const [basesManuales, setBasesManuales] = useState({})
  const [cargandoSugerido, setCargandoSugerido] = useState(false)
  const [diaSemana, setDiaSemana] = useState(() => hoyBogota().getDay())
  const [cantidadesEditadas, setCantidadesEditadas] = useState({})
  const [expandidoSku, setExpandidoSku] = useState(null)
  const [textoExportado, setTextoExportado] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [cuentasPorPagar, setCuentasPorPagar] = useState([])
  const [cargandoCuentas, setCargandoCuentas] = useState(false)
  const [pagando, setPagando] = useState(null)
  const [pagandoConCuenta, setPagandoConCuenta] = useState(null)
  const [cuentaPagoId, setCuentaPagoId] = useState('')
  const [cuentas, setCuentas] = useState([])
  const [cxpExpandido, setCxpExpandido] = useState(null)
  const [cxpDetalle, setCxpDetalle] = useState({})
  const [cxpDescuentos, setCxpDescuentos] = useState({})

  // --- nuevo: estado de pago + stepper borrador/confirmada/pagada ---
  const [estadoPago, setEstadoPago] = useState('cuenta_por_pagar')
  const [cuentaCompraId, setCuentaCompraId] = useState('')
  const [compraEditId, setCompraEditId] = useState(null)
  const [estadoPrevioCompra, setEstadoPrevioCompra] = useState(null)
  const [borradores, setBorradores] = useState([])
  const [productosNombrePorSku, setProductosNombrePorSku] = useState({})

  // --- nuevo: historial ---
  const [historialProveedor, setHistorialProveedor] = useState('')
  const [historialPeriodo, setHistorialPeriodo] = useState('semana')
  const [historialCompras, setHistorialCompras] = useState([])
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  const [historialExpandido, setHistorialExpandido] = useState(null)
  const [historialDetalle, setHistorialDetalle] = useState({})

  // --- nuevo: por proveedor ---
  const [porProveedorId, setPorProveedorId] = useState('')
  const [porProveedorPeriodo, setPorProveedorPeriodo] = useState('mes')
  const [porProveedorCompras, setPorProveedorCompras] = useState([])
  const [cargandoPorProveedor, setCargandoPorProveedor] = useState(false)

  // --- nuevo: impresion ---
  const [imprimiendo, setImprimiendo] = useState(null)

  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    setUsuario(JSON.parse(u))
    cargarProveedores()
    cargarCuentas()
    cargarBorradores()
    cargarProductosNombres()
  }, [])

  useEffect(() => {
    if (vista === 'historial') cargarHistorial()
  }, [vista, historialPeriodo, historialProveedor])

  useEffect(() => {
    if (vista === 'porProveedor' && porProveedorId) cargarPorProveedor()
    else if (vista === 'porProveedor') setPorProveedorCompras([])
  }, [vista, porProveedorId, porProveedorPeriodo])

  const cargarCuentas = async () => {
    const { data } = await supabase.from('cuentas').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('tipo').order('nombre')
    if (data) setCuentas(data)
  }

  const cargarProveedores = async () => {
    const { data } = await supabase.from('proveedores').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    if (data) setProveedores(data)
  }

  const cargarProductosNombres = async () => {
    const { data } = await supabase.from('productos').select('sku, nombre').eq('empresa_id', getEmpresaId()).order('nombre')
    const map = {}
    ;(data || []).forEach(p => { map[p.sku] = p.nombre })
    setProductosNombrePorSku(map)
  }

  const cargarBorradores = async () => {
    const { data } = await supabase.from('compras_encab').select('*, proveedores(nombre)').eq('estado', 'borrador').eq('empresa_id', getEmpresaId()).order('updated_at', { ascending: false })
    if (data) setBorradores(data)
  }

  const cargarBorrador = async (id) => {
    const { data: encab } = await supabase.from('compras_encab').select('*').eq('id', id).single()
    if (!encab) return
    const prov = proveedores.find(p => p.id === encab.proveedor_id)
    if (!prov) { alert('El proveedor de este borrador ya no esta activo'); return }
    setGuardado(false)
    setProveedorSel(prov)
    setCompraEditId(encab.id)
    setEstadoPrevioCompra(encab.estado)
    setEstadoPago(encab.estado_pago || 'cuenta_por_pagar')
    setCuentaCompraId(encab.cuenta_pago_id || '')
    const { data: prods } = await supabase.from('productos').select('*').eq('proveedor_id', prov.id).eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    const { data: detalle } = await supabase.from('compras').select('sku, cantidad').eq('compra_id', encab.id)
    const cantidadesPrefill = {}
    ;(prods || []).forEach(p => { cantidadesPrefill[p.sku] = '' })
    ;(detalle || []).forEach(d => { cantidadesPrefill[d.sku] = String(d.cantidad) })
    setProductos(prods || [])
    setCantidades(cantidadesPrefill)
  }

  const irASugerido = () => {
    setVista('sugerido')
    setTextoExportado('')
    setCopiado(false)
    cargarSugeridos(diaSemana)
  }

  const cambiarDiaSugerido = (dia) => {
    setDiaSemana(dia)
    cargarSugeridos(dia)
  }

  const cargarSugeridos = async (dia) => {
    setCargandoSugerido(true)
    setExpandidoSku(null)
    const fechasComparables = fechasMismoDiaSemana(dia)

    const { data: todosProductos } = await supabase.from('productos').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    const { data: conteos } = await supabase
      .from('conteo_fisico')
      .select('sku, fecha, cantidad_fisica, created_at')
      .eq('empresa_id', getEmpresaId())
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    const { data: ventas } = await supabase
      .from('liquidaciones')
      .select('sku, vendido_neto, fecha, despacho_id')
      .eq('empresa_id', getEmpresaId())
      .in('fecha', fechasComparables)
    const despachoIds = [...new Set((ventas || []).map(v => v.despacho_id))]
    const { data: despachos } = despachoIds.length > 0
      ? await supabase.from('despachos_encab').select('id, rutas(nombre)').in('id', despachoIds)
      : { data: [] }
    const rutaPorDespacho = {}
    ;(despachos || []).forEach(d => { rutaPorDespacho[d.id] = d.rutas?.nombre || 'Sin ruta' })

    if (todosProductos) {
      const stockPorSku = {}
      ;(conteos || []).forEach(c => {
        if (!(c.sku in stockPorSku)) stockPorSku[c.sku] = c.cantidad_fisica
      })
      const ventasPorSku = {}
      const ventasPorSkuYRuta = {}
      ;(ventas || []).forEach(v => {
        ventasPorSku[v.sku] = (ventasPorSku[v.sku] || 0) + (v.vendido_neto || 0)
        const ruta = rutaPorDespacho[v.despacho_id] || 'Sin ruta'
        if (!ventasPorSkuYRuta[v.sku]) ventasPorSkuYRuta[v.sku] = {}
        ventasPorSkuYRuta[v.sku][ruta] = (ventasPorSkuYRuta[v.sku][ruta] || 0) + (v.vendido_neto || 0)
      })

      const calculados = todosProductos.map(p => {
        const stockActual = stockPorSku[p.sku] ?? 0
        const promedioVentas = Math.ceil((ventasPorSku[p.sku] || 0) / 4)
        const cantidadSugerida = Math.max(0, Math.ceil((p.stock_minimo || 0) - stockActual + promedioVentas * (p.dias_cobertura || 0)))
        const ventasPorRuta = Object.entries(ventasPorSkuYRuta[p.sku] || {}).sort((a, b) => b[1] - a[1])
        return { ...p, stockActual, promedioVentas, cantidadSugerida, ventasPorRuta }
      }).filter(p => p.cantidadSugerida > 0 || (p.cantidad_sugerida_manual || 0) > 0)

      setSugeridos(calculados)
      const editables = {}
      const bases = {}
      calculados.forEach(p => {
        editables[p.sku] = String(p.cantidadSugerida)
        bases[p.sku] = p.cantidad_sugerida_manual != null ? String(p.cantidad_sugerida_manual) : ''
      })
      setCantidadesEditadas(editables)
      setBasesManuales(bases)
    }
    setCargandoSugerido(false)
  }

  const guardarBaseManual = async (productoId, valor) => {
    const numero = valor === '' ? null : parseFloat(valor)
    await supabase.from('productos').update({ cantidad_sugerida_manual: numero }).eq('id', productoId).eq('empresa_id', getEmpresaId())
  }

  const irACuentas = () => {
    setVista('cuentas')
    cargarCuentasPorPagar()
  }

  const cargarCuentasPorPagar = async () => {
    setCargandoCuentas(true)
    const { data } = await supabase
      .from('facturas_proveedores')
      .select('*, proveedores(nombre)')
      .eq('estado', 'pendiente')
      .eq('empresa_id', getEmpresaId())
      .order('updated_at', { ascending: false })
    if (data) {
      const lista = data
        .filter(f => (f.total_pendiente || 0) > 0)
        .map(f => ({ proveedorId: f.proveedor_id, nombre: f.proveedores?.nombre || 'Sin proveedor', total: f.total_pendiente || 0 }))
        .sort((a, b) => b.total - a.total)
      setCuentasPorPagar(lista)
    }
    setCargandoCuentas(false)
  }

  const toggleExpandirCxp = async (proveedorId) => {
    if (cxpExpandido === proveedorId) { setCxpExpandido(null); return }
    setCxpExpandido(proveedorId)
    if (!cxpDetalle[proveedorId]) {
      const { data: encabezados } = await supabase.from('compras_encab').select('id, fecha, total')
        .eq('proveedor_id', proveedorId).eq('estado', 'confirmada').eq('empresa_id', getEmpresaId())
        .order('fecha', { ascending: false })
      const compraIds = (encabezados || []).map(e => e.id)
      let items = []
      if (compraIds.length > 0) {
        const { data } = await supabase.from('compras').select('compra_id, sku, cantidad, precio_unitario, total')
          .in('compra_id', compraIds).eq('empresa_id', getEmpresaId())
        items = data || []
      }
      const grupos = (encabezados || []).map(e => ({ ...e, items: items.filter(it => it.compra_id === e.id) }))

      // Compras registradas antes de la reestructuracion (sin compras_encab, con su propio estado 'pendiente')
      const { data: legacy } = await supabase.from('compras').select('id, fecha, sku, cantidad, precio_unitario, total')
        .eq('proveedor_id', proveedorId).eq('estado', 'pendiente').is('compra_id', null).eq('empresa_id', getEmpresaId())
      if (legacy && legacy.length > 0) {
        const porFecha = {}
        legacy.forEach(l => {
          if (!porFecha[l.fecha]) porFecha[l.fecha] = { id: 'legacy-' + l.fecha, fecha: l.fecha, total: 0, items: [] }
          porFecha[l.fecha].total += l.total || 0
          porFecha[l.fecha].items.push(l)
        })
        grupos.push(...Object.values(porFecha))
      }
      grupos.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
      setCxpDetalle(prev => ({ ...prev, [proveedorId]: grupos }))
    }
    if (!cxpDescuentos[proveedorId]) {
      const { data: descuentos } = await supabase.from('novedades').select('fecha, sku, cantidad, valor, motivo')
        .eq('proveedor_id', proveedorId).eq('tipo', 'descuenta_proveedor').eq('empresa_id', getEmpresaId())
        .order('fecha', { ascending: false })
      setCxpDescuentos(prev => ({ ...prev, [proveedorId]: descuentos || [] }))
    }
  }

  const marcarPagado = async (proveedorId, nombreProveedor, total) => {
    if (!cuentaPagoId) { alert('Selecciona de que cuenta sale el pago'); return }
    setPagando(proveedorId)
    const empresaId = getEmpresaId()
    const { error: errFactura } = await supabase.from('facturas_proveedores')
      .update({ estado: 'pagado', updated_at: new Date().toISOString() })
      .eq('proveedor_id', proveedorId).eq('estado', 'pendiente').eq('empresa_id', empresaId)
    if (errFactura) { alert('Error: ' + errFactura.message); setPagando(null); return }
    const { error: errEncab } = await supabase.from('compras_encab').update({ estado: 'pagada', updated_at: new Date().toISOString() })
      .eq('proveedor_id', proveedorId).eq('estado', 'confirmada').eq('empresa_id', empresaId)
    if (errEncab) { alert('Error: ' + errEncab.message); setPagando(null); return }
    const { error } = await supabase.from('compras').update({ estado: 'pagada' }).eq('proveedor_id', proveedorId).eq('estado', 'confirmada').eq('empresa_id', empresaId)
    if (error) { alert('Error: ' + error.message); setPagando(null); return }
    const { error: errTesoreria } = await supabase.from('movimientos_tesoreria').insert({
      empresa_id: empresaId, cuenta_id: cuentaPagoId, fecha: obtenerFechaActual(), tipo: 'salida',
      monto: total, concepto: `Pago a ${nombreProveedor}`, referencia_tipo: 'compra', referencia_id: proveedorId
    })
    if (errTesoreria) alert('El pago se marco, pero no se pudo registrar el movimiento de caja/bancos: ' + errTesoreria.message)
    setPagandoConCuenta(null)
    setCuentaPagoId('')
    await cargarCuentasPorPagar()
    setPagando(null)
  }

  const grupoPorProveedor = () => {
    const grupos = {}
    sugeridos.forEach(p => {
      const prov = proveedores.find(pr => pr.id === p.proveedor_id)
      const key = prov?.nombre || 'Sin proveedor asignado'
      if (!grupos[key]) grupos[key] = []
      grupos[key].push(p)
    })
    return grupos
  }

  const generarPedido = () => {
    const grupos = grupoPorProveedor()
    const fecha = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })
    let texto = `Pedido sugerido - ${fecha}\n`
    Object.entries(grupos).forEach(([proveedor, items]) => {
      const conCantidad = items.filter(p => parseFloat(cantidadesEditadas[p.sku] ?? p.cantidadSugerida) > 0)
      if (conCantidad.length === 0) return
      texto += `\n${proveedor}\n`
      conCantidad.forEach(p => {
        texto += `- ${p.nombre}: ${cantidadesEditadas[p.sku] ?? p.cantidadSugerida} und\n`
      })
    })
    setTextoExportado(texto)
    setCopiado(false)
    if (navigator.clipboard) {
      navigator.clipboard.writeText(texto).then(() => setCopiado(true)).catch(() => {})
    }
  }

  const seleccionarProveedor = async (prov) => {
    setProveedorSel(prov)
    setGuardado(false)
    setCompraEditId(null)
    setEstadoPrevioCompra(null)
    setEstadoPago('cuenta_por_pagar')
    setCuentaCompraId('')
    const { data } = await supabase
      .from('productos')
      .select('*')
      .eq('proveedor_id', prov.id)
      .eq('estado', true)
      .eq('empresa_id', getEmpresaId())
      .order('nombre')
    if (data) {
      setProductos(data)
      const initial = {}
      data.forEach(p => { initial[p.sku] = '' })
      setCantidades(initial)
    }
  }

  const cambiarProveedor = () => {
    setProveedorSel(null)
    setProductos([])
    setCompraEditId(null)
    setEstadoPrevioCompra(null)
  }

  const totalCompra = () => {
    return productos.reduce((sum, p) => {
      const cant = parseFloat(cantidades[p.sku] || 0)
      return sum + cant * (p.costo_compra || 0)
    }, 0)
  }

  const guardarCompra = async (estadoFinal) => {
    const conCantidad = productos.filter(p => parseFloat(cantidades[p.sku] || 0) > 0)
    if (conCantidad.length === 0) { alert('Ingresa al menos una cantidad'); return }
    if (estadoFinal !== 'borrador' && estadoPago === 'pagado_momento' && !cuentaCompraId) {
      alert('Selecciona de que cuenta sale el pago'); return
    }
    setGuardando(true)
    const empresaId = getEmpresaId()
    const fecha = obtenerFechaActual()
    const total = totalCompra()
    const estadoPagoGuardar = estadoFinal === 'borrador' ? (estadoPago || null) : estadoPago
    const cuentaPagoGuardar = estadoPago === 'pagado_momento' ? (cuentaCompraId || null) : null

    let compraId = compraEditId
    if (!compraId) {
      const { data: encab, error: errEncab } = await supabase.from('compras_encab').insert({
        empresa_id: empresaId, proveedor_id: proveedorSel.id, fecha,
        estado: estadoFinal, estado_pago: estadoPagoGuardar, cuenta_pago_id: cuentaPagoGuardar, total,
      }).select().single()
      if (errEncab) { alert('Error: ' + errEncab.message); setGuardando(false); return }
      compraId = encab.id
    } else {
      const { error: errEncab } = await supabase.from('compras_encab').update({
        proveedor_id: proveedorSel.id, fecha, estado: estadoFinal, estado_pago: estadoPagoGuardar,
        cuenta_pago_id: cuentaPagoGuardar, total, updated_at: new Date().toISOString(),
      }).eq('id', compraId)
      if (errEncab) { alert('Error: ' + errEncab.message); setGuardando(false); return }
    }

    const { data: detalleExistente } = await supabase.from('compras').select('id, sku').eq('compra_id', compraId)
    const detallePorSku = {}
    ;(detalleExistente || []).forEach(d => { detallePorSku[d.sku] = d })

    const erroresDetalle = []
    for (const p of conCantidad) {
      const cantidad = parseFloat(cantidades[p.sku])
      const payload = {
        empresa_id: empresaId, fecha, proveedor_id: proveedorSel.id, compra_id: compraId,
        sku: p.sku, cantidad, precio_unitario: p.costo_compra || 0, total: cantidad * (p.costo_compra || 0),
        tipo_soporte: 'registro_manual', estado: estadoFinal,
      }
      const previo = detallePorSku[p.sku]
      const { error: errDetalle } = previo
        ? await supabase.from('compras').update(payload).eq('id', previo.id)
        : await supabase.from('compras').insert(payload)
      if (errDetalle) erroresDetalle.push(`${p.nombre}: ${errDetalle.message}`)
    }
    if (erroresDetalle.length > 0) {
      alert('No se pudieron guardar algunos productos:\n' + erroresDetalle.join('\n'))
    }

    const yaTeniaEfectos = estadoPrevioCompra === 'confirmada' || estadoPrevioCompra === 'pagada'
    const entraAConfirmadaOPagada = (estadoFinal === 'confirmada' || estadoFinal === 'pagada') && !yaTeniaEfectos

    if (entraAConfirmadaOPagada) {
      const movimientos = conCantidad.map(p => ({
        empresa_id: empresaId, sku: p.sku, cantidad: parseFloat(cantidades[p.sku]), fecha,
        tipo_movimiento: 'entrada', referencia: `Compra a ${proveedorSel.nombre}`,
      }))
      const { error: errMov } = await supabase.from('inventario_mov').insert(movimientos)
      if (errMov) alert('La compra se guardo, pero no se pudo actualizar el inventario disponible: ' + errMov.message)

      if (estadoFinal === 'confirmada') {
        const { data: facturaExistente } = await supabase.from('facturas_proveedores').select('id, total_pendiente')
          .eq('proveedor_id', proveedorSel.id).eq('empresa_id', empresaId).eq('estado', 'pendiente').maybeSingle()
        if (facturaExistente) {
          const { error: errFactura } = await supabase.from('facturas_proveedores')
            .update({ total_pendiente: (facturaExistente.total_pendiente || 0) + total, updated_at: new Date().toISOString() })
            .eq('id', facturaExistente.id)
          if (errFactura) alert('La compra se guardo, pero no se pudo actualizar el saldo del proveedor: ' + errFactura.message)
        } else {
          const { error: errFactura } = await supabase.from('facturas_proveedores')
            .insert({ empresa_id: empresaId, proveedor_id: proveedorSel.id, total_pendiente: total, estado: 'pendiente' })
          if (errFactura) alert('La compra se guardo, pero no se pudo crear el saldo del proveedor: ' + errFactura.message)
        }
      } else if (estadoFinal === 'pagada') {
        const { error: errTesoreria } = await supabase.from('movimientos_tesoreria').insert({
          empresa_id: empresaId, cuenta_id: cuentaCompraId, fecha, tipo: 'salida',
          monto: total, concepto: `Compra pagada a ${proveedorSel.nombre}`, referencia_tipo: 'compra', referencia_id: compraId,
        })
        if (errTesoreria) alert('La compra se confirmo, pero no se pudo registrar el movimiento de caja/bancos: ' + errTesoreria.message)
      }
    }

    setGuardando(false)
    await cargarBorradores()
    if (estadoFinal === 'borrador') {
      setCompraEditId(compraId)
      setEstadoPrevioCompra('borrador')
      alert('Borrador guardado')
    } else {
      setGuardado(true)
    }
  }

  const cargarHistorial = async () => {
    setCargandoHistorial(true)
    const { inicio, fin } = rangoPeriodo(historialPeriodo)
    let query = supabase.from('compras_encab').select('*, proveedores(nombre)').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', getEmpresaId()).order('fecha', { ascending: false })
    if (historialProveedor) query = query.eq('proveedor_id', historialProveedor)
    const { data } = await query
    setHistorialCompras(data || [])
    setCargandoHistorial(false)
  }

  const toggleExpandirHistorial = async (compra) => {
    if (historialExpandido === compra.id) { setHistorialExpandido(null); return }
    setHistorialExpandido(compra.id)
    if (!historialDetalle[compra.id]) {
      const { data } = await supabase.from('compras').select('sku, cantidad, precio_unitario, total').eq('compra_id', compra.id)
      setHistorialDetalle(prev => ({ ...prev, [compra.id]: data || [] }))
    }
  }

  const cargarPorProveedor = async () => {
    setCargandoPorProveedor(true)
    const { inicio, fin } = rangoPeriodo(porProveedorPeriodo)
    const { data } = await supabase.from('compras_encab').select('*')
      .eq('proveedor_id', porProveedorId).in('estado', ['confirmada', 'pagada'])
      .gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', getEmpresaId()).order('fecha', { ascending: false })
    setPorProveedorCompras(data || [])
    setCargandoPorProveedor(false)
  }

  const prepararImprimirCompra = async (compra) => {
    let detalle = historialDetalle[compra.id]
    if (!detalle) {
      const { data } = await supabase.from('compras').select('sku, cantidad, precio_unitario, total').eq('compra_id', compra.id)
      detalle = data || []
    }
    setImprimiendo({ tipo: 'compra', compra, detalle })
  }

  const prepararImprimirProveedor = () => {
    if (!porProveedorId || porProveedorCompras.length === 0) return
    const prov = proveedores.find(p => p.id === porProveedorId)
    setImprimiendo({ tipo: 'proveedor', proveedor: prov, compras: porProveedorCompras, periodo: porProveedorPeriodo })
  }

  const imprimir = () => window.print()

  if (!usuario) return null

  if (imprimiendo) {
    const totalImpresion = imprimiendo.tipo === 'compra'
      ? (imprimiendo.compra.total || 0)
      : imprimiendo.compras.reduce((s, c) => s + (c.total || 0), 0)
    return (
      <>
        <style>{`
          @media print { .no-print { display: none !important; } body { margin: 0; background: white; } }
          body { font-family: Arial, sans-serif; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #000; padding: 5px 8px; }
          th { background: #f0f0f0; font-weight: bold; text-align: center; }
          td { text-align: center; } td:first-child { text-align: left; }
        `}</style>
        <div className="no-print bg-gray-100 p-4 flex gap-3 items-center sticky top-0 z-10">
          <button onClick={() => setImprimiendo(null)} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-bold text-sm">← Volver</button>
          <button onClick={imprimir} className="bg-brand hover:bg-brand-dark text-white px-6 py-2 rounded-lg font-bold text-sm">Imprimir</button>
        </div>
        <div style={{ padding: '20px', maxWidth: '750px', margin: '0 auto', background: 'white' }}>
          {imprimiendo.tipo === 'compra' ? (
            <>
              <h2 style={{ fontWeight: 'bold', fontSize: '20px', marginBottom: '4px' }}>Compra — {imprimiendo.compra.proveedores?.nombre}</h2>
              <p style={{ color: '#555', marginBottom: '16px' }}>{imprimiendo.compra.fecha} · Estado: {imprimiendo.compra.estado}</p>
              <table>
                <thead><tr><th>Producto</th><th>Cantidad</th><th>Precio unit.</th><th>Total</th></tr></thead>
                <tbody>
                  {imprimiendo.detalle.map(d => (
                    <tr key={d.sku}>
                      <td>{productosNombrePorSku[d.sku] || d.sku}</td>
                      <td>{d.cantidad}</td>
                      <td>${(d.precio_unitario || 0).toLocaleString('es-CO')}</td>
                      <td>${(d.total || 0).toLocaleString('es-CO')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <>
              <h2 style={{ fontWeight: 'bold', fontSize: '20px', marginBottom: '4px' }}>Compras — {imprimiendo.proveedor?.nombre}</h2>
              <p style={{ color: '#555', marginBottom: '16px' }}>Periodo: {imprimiendo.periodo}</p>
              <table>
                <thead><tr><th>Fecha</th><th>Estado</th><th>Total</th></tr></thead>
                <tbody>
                  {imprimiendo.compras.map(c => (
                    <tr key={c.id}><td>{c.fecha}</td><td>{c.estado}</td><td>${(c.total || 0).toLocaleString('es-CO')}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <p style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '18px', marginTop: '12px' }}>
            Total: ${totalImpresion.toLocaleString('es-CO')}
          </p>
        </div>
      </>
    )
  }

  if (guardado) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-md w-full">
        <Stepper fases={FASES_COMPRA} indiceActual={indiceEstadoCompra(estadoPago === 'pagado_momento' ? 'pagada' : 'confirmada')} />
        <h2 className="text-2xl font-black text-gray-800 mt-4">Compra confirmada</h2>
        <p className="text-gray-500 mt-1">{proveedorSel?.nombre}</p>
        <p className="text-3xl font-black text-gray-900 mt-4">${totalCompra().toLocaleString('es-CO')}</p>
        <div className="flex gap-3 mt-6">
          <button onClick={() => { setProveedorSel(null); setProductos([]); setGuardado(false); setCompraEditId(null); setEstadoPrevioCompra(null) }}
            className="flex-1 bg-brand hover:bg-brand-dark text-white px-4 py-3 rounded-xl font-bold">
            Nueva compra
          </button>
          <button onClick={() => router.push('/dashboard')}
            className="flex-1 bg-gray-100 text-gray-600 px-4 py-3 rounded-xl font-bold">
            Inicio
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <PageHeader title="Compras" subtitle={new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })} />

      <div className="p-4 max-w-2xl mx-auto">
        {!proveedorSel && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            <button onClick={() => setVista('compra')}
              className={`flex-1 py-2 px-3 rounded-xl text-sm font-bold whitespace-nowrap ${vista === 'compra' ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              Registrar compra
            </button>
            <button onClick={irASugerido}
              className={`flex-1 py-2 px-3 rounded-xl text-sm font-bold whitespace-nowrap ${vista === 'sugerido' ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              Sugerido de pedido
            </button>
            <button onClick={irACuentas}
              className={`flex-1 py-2 px-3 rounded-xl text-sm font-bold whitespace-nowrap ${vista === 'cuentas' ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              Cuentas por pagar
            </button>
            <button onClick={() => setVista('historial')}
              className={`flex-1 py-2 px-3 rounded-xl text-sm font-bold whitespace-nowrap ${vista === 'historial' ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              Historial
            </button>
            <button onClick={() => setVista('porProveedor')}
              className={`flex-1 py-2 px-3 rounded-xl text-sm font-bold whitespace-nowrap ${vista === 'porProveedor' ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              Por proveedor
            </button>
          </div>
        )}

        {!proveedorSel && vista === 'cuentas' ? (
          <div>
            {cargandoCuentas ? (
              <p className="text-gray-400 text-center py-10">Cargando...</p>
            ) : cuentasPorPagar.length === 0 ? (
              <p className="text-gray-400 text-center py-10">No hay cuentas pendientes de pago</p>
            ) : (
              cuentasPorPagar.map(g => (
                <div key={g.proveedorId || 'sin-proveedor'} className="bg-white rounded-xl shadow-sm mb-4 overflow-hidden">
                  <button onClick={() => g.proveedorId && toggleExpandirCxp(g.proveedorId)} className="w-full p-4 flex justify-between items-center text-left">
                    <div>
                      <p className="font-black text-gray-900">{g.nombre}</p>
                      <p className="text-xs text-gray-500">Saldo pendiente · toca para ver que se va a pagar</p>
                    </div>
                    <p className="text-xl font-black text-brand">${g.total.toLocaleString('es-CO')}</p>
                  </button>
                  {cxpExpandido === g.proveedorId && (
                    <div className="border-t border-gray-100 p-4 bg-gray-50">
                      {!cxpDetalle[g.proveedorId] ? (
                        <p className="text-gray-400 text-sm">Cargando...</p>
                      ) : cxpDetalle[g.proveedorId].length === 0 ? (
                        <p className="text-gray-400 text-sm">Sin compras confirmadas pendientes de pago</p>
                      ) : (
                        cxpDetalle[g.proveedorId].map(c => (
                          <div key={c.id} className="mb-4 last:mb-0">
                            <div className="flex justify-between text-xs font-bold text-gray-500 mb-1.5">
                              <span>{c.fecha}</span>
                              <span>${(c.total || 0).toLocaleString('es-CO')}</span>
                            </div>
                            <div className="bg-white rounded-lg overflow-hidden border border-gray-200">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-gray-100 text-xs text-gray-500 font-bold uppercase">
                                    <th className="text-left px-3 py-1.5">Producto</th>
                                    <th className="text-right px-3 py-1.5">Cantidad</th>
                                    <th className="text-right px-3 py-1.5">Valor total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {c.items.map(d => (
                                    <tr key={d.sku}>
                                      <td className="px-3 py-1.5 text-gray-700">{productosNombrePorSku[d.sku] || d.sku}</td>
                                      <td className="px-3 py-1.5 text-right text-gray-700">{d.cantidad}</td>
                                      <td className="px-3 py-1.5 text-right font-bold text-gray-800">${(d.total || 0).toLocaleString('es-CO')}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))
                      )}
                      {(cxpDescuentos[g.proveedorId] || []).length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-bold text-gray-500 mb-1.5">Descuentos aplicados (cambios)</p>
                          <div className="bg-white rounded-lg overflow-hidden border border-gray-200 divide-y divide-gray-100">
                            {cxpDescuentos[g.proveedorId].map((d, i) => (
                              <div key={i} className="flex justify-between items-center px-3 py-1.5 text-sm">
                                <span className="text-gray-700">
                                  {d.fecha} · {productosNombrePorSku[d.sku] || d.sku} x{d.cantidad}
                                  {d.motivo && <span className="text-gray-400"> · {d.motivo}</span>}
                                </span>
                                <span className="font-bold text-brand">-${(d.valor || 0).toLocaleString('es-CO')}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {usuario?.rol === 'admin' && g.proveedorId && (
                    pagandoConCuenta === g.proveedorId ? (
                      <div className="p-4 border-t border-gray-100">
                        <label className="text-xs font-bold text-gray-600 block mb-1">De que cuenta sale el pago</label>
                        <select value={cuentaPagoId} onChange={e => setCuentaPagoId(e.target.value)}
                          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none mb-2">
                          <option value="">Selecciona cuenta</option>
                          {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                        <div className="flex gap-2">
                          <button onClick={() => { setPagandoConCuenta(null); setCuentaPagoId('') }} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-lg text-sm">
                            Cancelar
                          </button>
                          <button onClick={() => marcarPagado(g.proveedorId, g.nombre, g.total)} disabled={pagando === g.proveedorId}
                            className="flex-1 bg-brand hover:bg-brand-dark text-white font-bold py-2 rounded-lg text-sm disabled:opacity-50">
                            {pagando === g.proveedorId ? 'Marcando...' : 'Confirmar pago'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setPagandoConCuenta(g.proveedorId)}
                        className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-3">
                        Marcar pagado
                      </button>
                    )
                  )}
                </div>
              ))
            )}
          </div>
        ) : !proveedorSel && vista === 'historial' ? (
          <div>
            <div className="flex gap-2 mb-3">
              <select value={historialProveedor} onChange={e => setHistorialProveedor(e.target.value)}
                className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
                <option value="">Todos los proveedores</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div className="flex gap-2 mb-4">
              {[['semana', 'Ultima semana'], ['mes', 'Ultimo mes'], ['año', 'Ultimo año']].map(([id, nombre]) => (
                <button key={id} onClick={() => setHistorialPeriodo(id)}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold ${historialPeriodo === id ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
                  {nombre}
                </button>
              ))}
            </div>
            {cargandoHistorial ? (
              <p className="text-gray-400 text-center py-10">Cargando...</p>
            ) : historialCompras.length === 0 ? (
              <p className="text-gray-400 text-center py-10">No hay compras en este periodo</p>
            ) : (
              <div className="space-y-3">
                {historialCompras.map(c => (
                  <div key={c.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                    <button onClick={() => toggleExpandirHistorial(c)} className="w-full p-4 flex items-center justify-between text-left">
                      <div>
                        <p className="font-black text-gray-800">{c.proveedores?.nombre}</p>
                        <p className="text-xs text-gray-400">{c.fecha}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Stepper fases={FASES_COMPRA} indiceActual={indiceEstadoCompra(c.estado)} compact />
                        <p className="font-black text-gray-900">${(c.total || 0).toLocaleString('es-CO')}</p>
                      </div>
                    </button>
                    {historialExpandido === c.id && (
                      <div className="border-t border-gray-100 p-4">
                        <div className="divide-y divide-gray-100 mb-3">
                          {(historialDetalle[c.id] || []).map(d => (
                            <div key={d.sku} className="flex justify-between py-2 text-sm">
                              <span className="text-gray-700">{productosNombrePorSku[d.sku] || d.sku} <span className="text-gray-400">x{d.cantidad}</span></span>
                              <span className="font-bold text-gray-800">${(d.total || 0).toLocaleString('es-CO')}</span>
                            </div>
                          ))}
                        </div>
                        <button onClick={() => prepararImprimirCompra(c)} className="text-xs font-bold text-brand">Imprimir esta compra</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : !proveedorSel && vista === 'porProveedor' ? (
          <div>
            <div className="flex gap-2 mb-3">
              <select value={porProveedorId} onChange={e => setPorProveedorId(e.target.value)}
                className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
                <option value="">Selecciona proveedor</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div className="flex gap-2 mb-4">
              {[['semana', 'Ultima semana'], ['mes', 'Ultimo mes'], ['año', 'Ultimo año']].map(([id, nombre]) => (
                <button key={id} onClick={() => setPorProveedorPeriodo(id)}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold ${porProveedorPeriodo === id ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
                  {nombre}
                </button>
              ))}
            </div>
            {!porProveedorId ? (
              <p className="text-gray-400 text-center py-10">Selecciona un proveedor</p>
            ) : cargandoPorProveedor ? (
              <p className="text-gray-400 text-center py-10">Cargando...</p>
            ) : (
              <>
                <div className="bg-white rounded-xl p-4 shadow-sm mb-4 flex justify-between items-center">
                  <p className="font-bold text-gray-600">Total acumulado</p>
                  <p className="font-black text-gray-900 text-xl">${porProveedorCompras.reduce((s, c) => s + (c.total || 0), 0).toLocaleString('es-CO')}</p>
                </div>
                {porProveedorCompras.length > 0 && (
                  <button onClick={prepararImprimirProveedor} className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-3 rounded-xl mb-4">
                    Imprimir rango completo
                  </button>
                )}
                {porProveedorCompras.length === 0 ? (
                  <p className="text-gray-400 text-center py-10">No hay compras en este periodo</p>
                ) : (
                  <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
                    {porProveedorCompras.map(c => (
                      <div key={c.id} className="p-4 flex justify-between items-center">
                        <div>
                          <p className="font-bold text-gray-800 text-sm">{c.fecha}</p>
                          <Stepper fases={FASES_COMPRA} indiceActual={indiceEstadoCompra(c.estado)} compact />
                        </div>
                        <p className="font-black text-gray-900">${(c.total || 0).toLocaleString('es-CO')}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ) : !proveedorSel && vista === 'sugerido' ? (
          <div>
            <p className="text-xs font-bold text-gray-500 mb-2">Calcular sugerido segun el consumo de este dia (ultimas 4 semanas)</p>
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
              {DIAS_SEMANA.map(d => (
                <button key={d.id} onClick={() => cambiarDiaSugerido(d.id)}
                  className={`px-3 py-2 rounded-xl text-sm font-bold whitespace-nowrap ${diaSemana === d.id ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
                  {d.nombre}
                </button>
              ))}
            </div>
            {cargandoSugerido ? (
              <p className="text-gray-400 text-center py-10">Cargando...</p>
            ) : sugeridos.length === 0 ? (
              <p className="text-gray-400 text-center py-10">No hay productos por pedir segun el stock minimo y el consumo reciente</p>
            ) : (
              <>
                <button onClick={generarPedido}
                  className="w-full bg-brand hover:bg-brand-dark text-white font-black py-3 rounded-xl mb-4">
                  Generar pedido
                </button>
                {textoExportado && (
                  <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
                    <p className="text-xs font-bold text-gray-500 mb-2">{copiado ? 'Copiado al portapapeles' : 'Copia el texto manualmente'}</p>
                    <textarea readOnly value={textoExportado}
                      className="w-full border border-gray-200 rounded-lg p-3 text-xs font-mono text-gray-700 h-48" />
                  </div>
                )}
                {Object.entries(grupoPorProveedor()).map(([proveedor, items]) => (
                  <div key={proveedor} className="mb-6">
                    <h2 className="font-black text-gray-700 mb-2">{proveedor}</h2>
                    <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
                      {items.map(p => (
                        <div key={p.sku} className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <p className="font-bold text-gray-800 text-sm">{p.nombre}</p>
                              <p className="text-xs text-gray-400">{p.sku} · {p.presentacion}</p>
                              {p.ventasPorRuta.length > 0 && (
                                <button onClick={() => setExpandidoSku(expandidoSku === p.sku ? null : p.sku)}
                                  className="text-xs text-brand font-bold mt-1">
                                  {expandidoSku === p.sku ? 'Ocultar por ruta' : 'Ver por ruta'}
                                </button>
                              )}
                            </div>
                            <div className="flex gap-4 items-center">
                              <div className="text-center">
                                <p className="text-xs text-gray-400">Stock</p>
                                <p className="font-bold text-gray-600">{p.stockActual}</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-gray-400">Minimo</p>
                                <p className="font-bold text-gray-600">{p.stock_minimo || 0}</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-gray-400">Prom. mismo dia</p>
                                <p className="font-bold text-gray-600">{p.promedioVentas}</p>
                              </div>
                              <div className="text-center w-20">
                                <p className="text-xs text-gray-400">Base manual</p>
                                <input type="number" min="0" placeholder="—" value={basesManuales[p.sku] ?? ''}
                                  onChange={e => setBasesManuales(prev => ({ ...prev, [p.sku]: e.target.value }))}
                                  onBlur={e => guardarBaseManual(p.id, e.target.value)}
                                  className="w-full text-center border-2 border-gray-200 rounded-lg py-1 text-lg font-black text-gray-600 focus:border-brand focus:outline-none" />
                              </div>
                              <div className="text-center w-20">
                                <p className="text-xs text-gray-400">Pedir</p>
                                <input type="number" min="0" value={cantidadesEditadas[p.sku] ?? p.cantidadSugerida}
                                  onChange={e => setCantidadesEditadas(prev => ({ ...prev, [p.sku]: e.target.value }))}
                                  className="w-full text-center border-2 border-gray-200 rounded-lg py-1 text-lg font-black text-brand focus:border-brand focus:outline-none" />
                              </div>
                            </div>
                          </div>
                          {expandidoSku === p.sku && (
                            <div className="mt-3 bg-gray-50 rounded-lg p-3">
                              <p className="text-xs font-bold text-gray-500 mb-2">Vendido por ruta ese dia (ultimas 4 semanas)</p>
                              {p.ventasPorRuta.map(([ruta, cantidad]) => (
                                <div key={ruta} className="flex justify-between text-xs text-gray-600 mb-1">
                                  <span>{ruta}</span>
                                  <span className="font-bold">{cantidad}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        ) : !proveedorSel && vista === 'compra' ? (
          <div>
            {borradores.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-bold text-gray-500 mb-2">Borradores pendientes</p>
                <div className="grid grid-cols-1 gap-2">
                  {borradores.map(b => (
                    <button key={b.id} onClick={() => cargarBorrador(b.id)}
                      className="bg-white rounded-xl p-4 shadow-sm text-left hover:shadow-md transition-all flex justify-between items-center border-2 border-dashed border-gray-200">
                      <div>
                        <p className="font-black text-gray-800">{b.proveedores?.nombre}</p>
                        <p className="text-xs text-gray-400">{b.fecha} · ${(b.total || 0).toLocaleString('es-CO')}</p>
                      </div>
                      <span className="text-xs font-bold text-gray-400">Continuar →</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="text-sm font-bold text-gray-600 mb-3">Selecciona el proveedor</p>
            <div className="grid grid-cols-1 gap-2">
              {proveedores.map(p => (
                <button key={p.id} onClick={() => seleccionarProveedor(p)}
                  className="bg-white rounded-xl p-4 shadow-sm text-left hover:shadow-md transition-all flex justify-between items-center">
                  <div>
                    <p className="font-black text-gray-800">{p.nombre}</p>
                    <p className="text-xs text-gray-400">{p.productos}</p>
                  </div>
                  <span className="text-gray-400">→</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-4">
              <Stepper fases={FASES_COMPRA} indiceActual={indiceEstadoCompra(estadoPrevioCompra || 'borrador')} compact />
            </div>
            <div className="bg-gray-100 border border-gray-300 rounded-xl p-4 mb-4 flex justify-between items-center">
              <div>
                <p className="font-black text-gray-900">{proveedorSel.nombre}</p>
                <p className="text-sm text-gray-600">Ingresa las cantidades recibidas</p>
              </div>
              <button onClick={cambiarProveedor} className="text-brand text-sm font-bold">Cambiar</button>
            </div>

            {productos.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center shadow-sm">
                <p className="text-4xl mb-3">X</p>
                <p className="text-gray-500">Este proveedor no tiene productos asignados</p>
              </div>
            ) : (
              <div>
                <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-4">
                  {productos.map((p, i) => (
                    <div key={p.sku} className={`flex items-center px-4 py-3 ${i < productos.length - 1 ? 'border-b border-gray-100' : ''}`}>
                      <div className="flex-1">
                        <p className="font-medium text-gray-800 text-sm">{p.nombre}</p>
                        <p className="text-xs text-gray-400">
                          {p.presentacion}
                          {p.costo_compra ? ' · $' + p.costo_compra.toLocaleString('es-CO') : ' · Sin costo'}
                        </p>
                      </div>
                      <input
                        type="number" min="0"
                        value={cantidades[p.sku]}
                        onChange={e => setCantidades(prev => ({ ...prev, [p.sku]: e.target.value }))}
                        className="w-20 text-center border-2 border-gray-200 rounded-lg py-2 font-bold text-gray-800 focus:border-brand focus:outline-none ml-3"
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>

                <div className="bg-white rounded-xl p-4 shadow-sm mb-4 flex justify-between items-center">
                  <p className="font-bold text-gray-600">Total compra</p>
                  <p className="font-black text-gray-900 text-xl">${totalCompra().toLocaleString('es-CO')}</p>
                </div>

                <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
                  <p className="text-xs font-bold text-gray-600 mb-2">Estado de pago</p>
                  <div className="flex gap-2">
                    <button onClick={() => setEstadoPago('cuenta_por_pagar')}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold ${estadoPago === 'cuenta_por_pagar' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}>
                      Cuenta por pagar
                    </button>
                    <button onClick={() => setEstadoPago('pagado_momento')}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold ${estadoPago === 'pagado_momento' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}>
                      Pagado en el momento
                    </button>
                  </div>
                  {estadoPago === 'pagado_momento' && (
                    <div className="mt-3">
                      <label className="text-xs font-bold text-gray-600 block mb-1">Cuenta de pago</label>
                      <select value={cuentaCompraId} onChange={e => setCuentaCompraId(e.target.value)}
                        className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
                        <option value="">Selecciona cuenta</option>
                        {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button onClick={() => guardarCompra('borrador')} disabled={guardando}
                    className="flex-1 bg-secondary hover:bg-black text-white font-bold py-4 rounded-xl text-base disabled:opacity-50">
                    {guardando ? '...' : 'Guardar borrador'}
                  </button>
                  <button onClick={() => guardarCompra(estadoPago === 'pagado_momento' ? 'pagada' : 'confirmada')} disabled={guardando}
                    className="flex-1 bg-brand hover:bg-brand-dark text-white font-black py-4 rounded-xl text-lg disabled:opacity-50">
                    {guardando ? 'Guardando...' : 'Confirmar compra'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
