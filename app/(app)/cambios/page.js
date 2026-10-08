'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { calcularStockPorSku } from '@/lib/inventario-helpers'
import { PageHeader } from '@/components/ui'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import InputDinero from '@/components/InputDinero'

const TIPOS = [
  { id: 'mano_a_mano', nombre: 'Mano a mano', desc: 'Solo registro informativo — no afecta inventario ni proveedor' },
  { id: 'descuenta_proveedor', nombre: 'Descuenta al proveedor', desc: 'Baja de inventario + nota credito contra el saldo pendiente del proveedor' },
  { id: 'perdida_negocio', nombre: 'Perdida del negocio', desc: 'Baja de inventario + se registra como perdida por calidad en Gastos Admin' },
]

const QUIEN_REGISTRA_OPCIONES = [
  { id: 'vendedor', label: 'Vendedor' },
  { id: 'bodega', label: 'Bodega' },
  { id: 'admin', label: 'Admin' },
]

const itemVacio = () => ({ sku: '', cantidad: '', motivo: '', valor: '', valorEditado: false, proveedorId: '', proveedorManual: false })

export default function Cambios() {
  const [usuario, setUsuario] = useState(null)
  const [vendedores, setVendedores] = useState([])
  const [vendedorPropio, setVendedorPropio] = useState(null)
  const [vendedorId, setVendedorId] = useState('')
  const [proveedores, setProveedores] = useState([])
  const [productos, setProductos] = useState([])
  const [tipo, setTipo] = useState('mano_a_mano')
  const [momento, setMomento] = useState('en_ruta')
  const [quienRegistra, setQuienRegistra] = useState('admin')
  const [items, setItems] = useState([itemVacio()])
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [vista, setVista] = useState('nuevo')
  const [historialItems, setHistorialItems] = useState([])
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroProveedor, setFiltroProveedor] = useState('todos')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')
  const [resumenProveedores, setResumenProveedores] = useState([])
  const [resumenPerdidas, setResumenPerdidas] = useState(0)
  const [resumenPorMotivo, setResumenPorMotivo] = useState([])
  const [cambiosVsProduccion, setCambiosVsProduccion] = useState(null)
  const [motivosCambio, setMotivosCambio] = useState([])
  const [agregandoMotivo, setAgregandoMotivo] = useState(false)
  const [nuevoMotivoNombre, setNuevoMotivoNombre] = useState('')
  const [pendientes, setPendientes] = useState([])
  const [cargandoPendientes, setCargandoPendientes] = useState(false)
  const [clasificacion, setClasificacion] = useState({})
  const [procesandoId, setProcesandoId] = useState(null)
  const [incluyeProveedor, setIncluyeProveedor] = useState(true)
  const [pendienteReponer, setPendienteReponer] = useState(false)
  const [porReponer, setPorReponer] = useState([])
  const [cargandoPorReponer, setCargandoPorReponer] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (!['admin', 'auxiliar', 'vendedor'].includes(parsed.rol)) { router.push('/despacho'); return }
    setUsuario(parsed)
    cargarProductos()
    cargarProveedores()
    cargarPendientes()
    cargarPorReponer()
    cargarConfigEmpresa()
    cargarMotivosCambio()
    if (parsed.rol === 'vendedor') {
      setQuienRegistra('vendedor')
      resolverVendedorPropio(parsed.vendedor_nombre)
    } else {
      cargarVendedores()
      setQuienRegistra(parsed.rol === 'auxiliar' ? 'bodega' : 'admin')
    }
  }, [])

  const cargarVendedores = async () => {
    const { data } = await supabase.from('vendedores').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    if (data) setVendedores(data)
  }

  const resolverVendedorPropio = async (nombre) => {
    const { data } = await supabase.from('vendedores').select('*').eq('nombre', nombre).eq('empresa_id', getEmpresaId()).single()
    if (data) { setVendedorPropio(data); setVendedorId(data.id) }
  }

  const cargarProductos = async () => {
    const { data } = await supabase.from('productos').select('sku, nombre, precio_venta, costo_compra, proveedor_id').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    if (data) setProductos(data)
  }

  const cargarProveedores = async () => {
    const { data } = await supabase.from('proveedores').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    if (data) setProveedores(data)
  }

  const cargarConfigEmpresa = async () => {
    const { data } = await supabase.from('empresas').select('cambios_incluye_proveedor').eq('id', getEmpresaId()).maybeSingle()
    setIncluyeProveedor(data?.cambios_incluye_proveedor ?? true)
  }

  // Si la empresa no tiene ningun motivo cargado (hoy: solo Arepas Maissy),
  // el formulario sigue con el campo de texto libre de siempre -- no cambia
  // nada para quien no use esto.
  const cargarMotivosCambio = async () => {
    const { data } = await supabase.from('motivos_cambio').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    setMotivosCambio(data || [])
  }

  const agregarMotivoCambio = async () => {
    if (!nuevoMotivoNombre.trim()) return
    const { error } = await supabase.from('motivos_cambio').insert({ empresa_id: getEmpresaId(), nombre: nuevoMotivoNombre.trim() })
    if (error) { alert('Error: ' + error.message); return }
    setNuevoMotivoNombre('')
    setAgregandoMotivo(false)
    await cargarMotivosCambio()
  }

  const getProducto = (sku) => productos.find(p => p.sku === sku)

  // En Distri Maissy (revende, cambios con proveedor), "mano a mano" es solo
  // informativo y "perdida del negocio"/"descuenta proveedor" si descuentan
  // inventario. En Arepas Maissy (fabrica, sin proveedor que reponga) es al
  // reves segun lo que definimos con el usuario: mano a mano SI descuenta
  // inventario (se entrego una unidad buena de reposicion sin venta real),
  // perdida del negocio NO descuenta inventario (el producto nunca vuelve
  // fisico, ya se habia descontado cuando se vendio la primera vez) -- solo
  // genera el gasto real en caja. Antes esto se decidia por "tiene catalogo
  // de motivos", lo que impedia darle motivos a Distri sin cambiarle la logica.
  const esFabricante = !incluyeProveedor
  const afectaInventario = (t) => (esFabricante ? t === 'mano_a_mano' : t !== 'mano_a_mano')
  const descTipo = (t) => {
    if (!esFabricante) return t.desc
    if (t.id === 'mano_a_mano') return 'Baja de inventario (se entrego una unidad buena de reposicion) — no genera gasto en caja'
    if (t.id === 'perdida_negocio') return 'No descuenta inventario (el producto no vuelve fisico) + se registra el gasto real en Gastos Admin'
    return t.desc
  }

  // Confirma con quien registra si alguna salida va a dejar el stock en
  // negativo segun el ultimo conteo -- no bloquea, solo avisa.
  const confirmarSiDejaNegativo = async (consumoPorSku) => {
    if (Object.keys(consumoPorSku).length === 0) return true
    const stockPorSku = await calcularStockPorSku()
    const faltantes = Object.entries(consumoPorSku)
      .map(([sku, consumo]) => ({ sku, consumo, stock: stockPorSku[sku]?.stockActual }))
      .filter(f => f.stock !== undefined && f.consumo > f.stock)
    if (faltantes.length === 0) return true
    return confirm(
      'Este cambio va a dejar en negativo el stock (segun el ultimo conteo):\n' +
      faltantes.map(f => `${getProducto(f.sku)?.nombre || f.sku}: disponible ${f.stock}, se va a descontar ${f.consumo}`).join('\n') +
      '\n\n¿Registrar de todas formas?'
    )
  }

  const cambiarTipo = (t) => {
    setTipo(t)
    setItems([itemVacio()])
    setPendienteReponer(false)
  }

  // Arepas Maissy (y cualquier empresa productora sin reventa) no tiene
  // proveedor que le reponga sus propios productos terminados -- ese tipo
  // de clasificacion solo aplica a negocios que revenden producto ajeno.
  const tiposDisponibles = incluyeProveedor ? TIPOS : TIPOS.filter(t => t.id !== 'descuenta_proveedor')

  const agregarItem = () => setItems([...items, itemVacio()])
  const quitarItem = (i) => setItems(items.filter((_, idx) => idx !== i))
  const actualizarItem = (i, campo, valor) => {
    const n = [...items]
    n[i][campo] = valor
    if (campo === 'sku') {
      const p = getProducto(valor)
      n[i].proveedorId = p?.proveedor_id || ''
      n[i].proveedorManual = false
    }
    if (campo === 'sku' || campo === 'cantidad') {
      const p = getProducto(n[i].sku)
      const costo = p?.costo_compra || p?.precio_venta || 0
      if (n[i].sku && n[i].cantidad && !n[i].valorEditado) {
        n[i].valor = String(parseFloat(n[i].cantidad || 0) * costo)
      }
    }
    if (campo === 'valor') n[i].valorEditado = true
    if (campo === 'proveedorId') n[i].proveedorManual = true
    setItems(n)
  }

  const guardarCambios = async () => {
    if (momento === 'en_ruta' && !vendedorId) { alert('Selecciona el vendedor'); return }
    const validos = items.filter(it => it.sku && parseFloat(it.cantidad) > 0)
    if (validos.length === 0) { alert('Ingresa al menos un producto con cantidad'); return }
    const quedaPorReponer = tipo === 'mano_a_mano' && incluyeProveedor && pendienteReponer
    if ((tipo === 'descuenta_proveedor' || quedaPorReponer) && validos.some(it => !it.proveedorId)) {
      alert(quedaPorReponer ? 'Selecciona el proveedor que debe reponer cada producto' : 'Selecciona el proveedor afectado en cada producto')
      return
    }
    // Distri, cambio en bodega que el proveedor repone despues: la unidad mala
    // queda apartada (no se puede vender ni se cuenta en el conteo), asi que
    // sale del inventario ya; entra la buena cuando se marca "Repuesto".
    const bajaPorReponer = quedaPorReponer && momento === 'en_bodega'
    if (afectaInventario(tipo) || bajaPorReponer) {
      const consumoPorSku = {}
      validos.forEach(it => { consumoPorSku[it.sku] = (consumoPorSku[it.sku] || 0) + parseFloat(it.cantidad) })
      if (!(await confirmarSiDejaNegativo(consumoPorSku))) return
    }
    setGuardando(true)
    const empresaId = getEmpresaId()
    const fecha = obtenerFechaActual()

    const registros = validos.map(it => ({
      empresa_id: empresaId,
      fecha,
      vendedor_id: momento === 'en_ruta' ? vendedorId : (vendedorId || null),
      sku: it.sku,
      cantidad: parseFloat(it.cantidad),
      tipo,
      momento,
      quien_registra: quienRegistra,
      proveedor_id: (tipo === 'descuenta_proveedor' || quedaPorReponer) ? it.proveedorId : null,
      pendiente_reponer: quedaPorReponer,
      motivo: it.motivo || null,
      valor: (tipo === 'descuenta_proveedor' || tipo === 'perdida_negocio') && it.valor ? parseFloat(it.valor) : null
    }))
    const { error } = await supabase.from('novedades').insert(registros)
    if (error) { alert('Error: ' + error.message); setGuardando(false); return }

    const fallos = []

    if (afectaInventario(tipo)) {
      const movimientos = validos.map(it => ({
        empresa_id: empresaId,
        sku: it.sku,
        cantidad: parseFloat(it.cantidad),
        fecha,
        tipo_movimiento: 'salida',
        referencia: tipo === 'descuenta_proveedor' ? 'Cambio - descuento a proveedor' : tipo === 'mano_a_mano' ? 'Cambio - mano a mano' : 'Cambio - perdida del negocio'
      }))
      const { error: errMov } = await supabase.from('inventario_mov').insert(movimientos)
      if (errMov) fallos.push('actualizar el inventario disponible')
    }
    if (bajaPorReponer) {
      const { error: errMov } = await supabase.from('inventario_mov').insert(validos.map(it => ({
        empresa_id: empresaId, sku: it.sku, cantidad: parseFloat(it.cantidad), fecha,
        tipo_movimiento: 'salida', referencia: 'Cambio - apartado por reponer',
      })))
      if (errMov) fallos.push('apartar del inventario la unidad mala')
    }

    if (tipo === 'perdida_negocio') {
      const gastos = validos.map(it => {
        const p = getProducto(it.sku)
        return {
          empresa_id: empresaId,
          fecha,
          categoria: 'Pérdida por calidad',
          descripcion: `${p?.nombre || it.sku} (${it.sku}) x${it.cantidad}${it.motivo ? ' - ' + it.motivo : ''}`,
          valor: parseFloat(it.valor) || 0,
          registrado_por: usuario.nombre
        }
      })
      const { error: errGasto } = await supabase.from('gastos_admin').insert(gastos)
      if (errGasto) fallos.push('registrar la perdida en Gastos Admin')
    }

    if (tipo === 'descuenta_proveedor') {
      const porProveedor = {}
      validos.forEach(it => {
        porProveedor[it.proveedorId] = (porProveedor[it.proveedorId] || 0) + parseFloat(it.valor || 0)
      })
      for (const [proveedorId, creditoTotal] of Object.entries(porProveedor)) {
        const { data: factura } = await supabase.from('facturas_proveedores').select('id, total_pendiente')
          .eq('proveedor_id', proveedorId).eq('empresa_id', empresaId).eq('estado', 'pendiente').maybeSingle()
        const saldoActual = factura?.total_pendiente || 0
        const nuevoSaldo = Math.max(0, saldoActual - creditoTotal)
        if (creditoTotal > saldoActual) {
          const prov = proveedores.find(p => p.id === proveedorId)
          alert(`${prov?.nombre || 'El proveedor'} no tenia suficiente saldo pendiente. Se descontaron $${saldoActual.toLocaleString('es-CO')} de $${creditoTotal.toLocaleString('es-CO')}; el resto no se pudo aplicar.`)
        }
        if (factura) {
          const { error: errFactura } = await supabase.from('facturas_proveedores')
            .update({ total_pendiente: nuevoSaldo, updated_at: new Date().toISOString() })
            .eq('id', factura.id)
          if (errFactura) fallos.push('actualizar el saldo del proveedor')
        }
      }
    }

    if (fallos.length > 0) {
      alert('El cambio se registro, pero algo fallo en: ' + fallos.join(', ') + '. Avisale al admin para que lo revise.')
    }
    if (quedaPorReponer) cargarPorReponer()
    setGuardado(true)
    setGuardando(false)
  }

  // Cambios mano a mano que el proveedor todavia no ha repuesto (Distri).
  const cargarPorReponer = async () => {
    setCargandoPorReponer(true)
    const { data } = await supabase.from('novedades').select('*, proveedores(nombre)')
      .eq('empresa_id', getEmpresaId()).eq('pendiente_reponer', true).is('repuesto_at', null)
      .order('fecha', { ascending: true })
    setPorReponer(data || [])
    setCargandoPorReponer(false)
  }

  const marcarRepuesto = async (n) => {
    if (!confirm(`¿${n.proveedores?.nombre || 'El proveedor'} ya repuso ${n.cantidad} und de ${getProducto(n.sku)?.nombre || n.sku}?`)) return
    setProcesandoId(n.id)
    const { error } = await supabase.from('novedades')
      .update({ repuesto_at: new Date().toISOString(), repuesto_por: usuario.nombre })
      .eq('id', n.id).eq('empresa_id', getEmpresaId())
    if (error) { setProcesandoId(null); alert('Error: ' + error.message); return }
    // La unidad buena que trajo el proveedor entra a bodega (la mala ya habia
    // salido: apartada en bodega o cambiada al cliente en ruta).
    const { error: errMov } = await supabase.from('inventario_mov').insert({
      empresa_id: getEmpresaId(), sku: n.sku, cantidad: n.cantidad, fecha: obtenerFechaActual(),
      tipo_movimiento: 'entrada', referencia: 'Cambio - repuesto por proveedor',
    })
    setProcesandoId(null)
    if (errMov) alert('Quedo marcado como repuesto, pero no se pudo sumar al inventario: ' + errMov.message)
    cargarPorReponer()
  }

  const diasDesde = (fecha) => Math.max(0, Math.round((new Date(obtenerFechaActual() + 'T12:00:00') - new Date(fecha + 'T12:00:00')) / 86400000))

  const cargarPendientes = async () => {
    setCargandoPendientes(true)
    const { data } = await supabase.from('novedades').select('*, vendedores(nombre)')
      .eq('empresa_id', getEmpresaId()).eq('revisado', false).order('fecha', { ascending: false })
    setPendientes(data || [])
    setCargandoPendientes(false)
  }

  const getClasificacion = (n) => clasificacion[n.id] || { tipo: 'mano_a_mano', proveedorId: n.proveedor_id || '', valor: '', motivo: n.motivo || '' }
  const actualizarClasificacion = (n, campo, valor) => {
    setClasificacion(prev => ({ ...prev, [n.id]: { ...getClasificacion(n), ...prev[n.id], [campo]: valor } }))
  }

  const confirmarPendiente = async (n) => {
    const conf = getClasificacion(n)
    if (conf.tipo === 'descuenta_proveedor' && !conf.proveedorId) { alert('Selecciona el proveedor afectado'); return }
    if ((conf.tipo === 'descuenta_proveedor' || conf.tipo === 'perdida_negocio') && !parseFloat(conf.valor || 0)) {
      alert('Ingresa el valor'); return
    }
    if (afectaInventario(conf.tipo) && !(await confirmarSiDejaNegativo({ [n.sku]: n.cantidad }))) return
    setProcesandoId(n.id)
    const empresaId = getEmpresaId()
    const valorFinal = (conf.tipo === 'descuenta_proveedor' || conf.tipo === 'perdida_negocio') ? parseFloat(conf.valor || 0) : null

    const { error: errUpd } = await supabase.from('novedades').update({
      tipo: conf.tipo,
      proveedor_id: conf.tipo === 'descuenta_proveedor' ? conf.proveedorId : null,
      valor: valorFinal,
      motivo: conf.motivo || n.motivo,
      revisado: true
    }).eq('id', n.id).eq('empresa_id', empresaId)
    if (errUpd) { alert('Error: ' + errUpd.message); setProcesandoId(null); return }

    const fallos = []
    // Si este cambio vino de un despacho (kiosco o liquidacion), esas unidades ya se
    // restaron del stock cuando se calculo el despachado total -- nunca se sumaron de
    // vuelta como "devuelto" porque no volvieron a bodega. Restarlas otra vez aqui las
    // contaria dos veces. Solo se resta cuando el cambio se registro directo en este
    // modulo (nunca paso por un despacho, asi que nunca se descontaron).
    const vinoDeDespacho = n.motivo === 'Reportado en liquidacion del kiosco'
    if (afectaInventario(conf.tipo) && !vinoDeDespacho) {
      const { error: errMov } = await supabase.from('inventario_mov').insert({
        empresa_id: empresaId, sku: n.sku, cantidad: n.cantidad, fecha: n.fecha,
        tipo_movimiento: 'salida',
        referencia: conf.tipo === 'descuenta_proveedor' ? 'Cambio - descuento a proveedor' : conf.tipo === 'mano_a_mano' ? 'Cambio - mano a mano' : 'Cambio - perdida del negocio'
      })
      if (errMov) fallos.push('actualizar el inventario')
    }

    if (conf.tipo === 'perdida_negocio') {
      const p = getProducto(n.sku)
      const { error: errGasto } = await supabase.from('gastos_admin').insert({
        empresa_id: empresaId, fecha: n.fecha, categoria: 'Pérdida por calidad',
        descripcion: `${p?.nombre || n.sku} (${n.sku}) x${n.cantidad}${conf.motivo ? ' - ' + conf.motivo : ''}`,
        valor: valorFinal || 0, registrado_por: usuario.nombre
      })
      if (errGasto) fallos.push('registrar la perdida en Gastos Admin')
    }

    if (conf.tipo === 'descuenta_proveedor') {
      const { data: factura } = await supabase.from('facturas_proveedores').select('id, total_pendiente')
        .eq('proveedor_id', conf.proveedorId).eq('empresa_id', empresaId).eq('estado', 'pendiente').maybeSingle()
      const saldoActual = factura?.total_pendiente || 0
      const nuevoSaldo = Math.max(0, saldoActual - valorFinal)
      if (valorFinal > saldoActual) {
        const prov = proveedores.find(p => p.id === conf.proveedorId)
        alert(`${prov?.nombre || 'El proveedor'} no tenia suficiente saldo pendiente. Se descontaron $${saldoActual.toLocaleString('es-CO')} de $${valorFinal.toLocaleString('es-CO')}; el resto no se pudo aplicar.`)
      }
      if (factura) {
        const { error: errFactura } = await supabase.from('facturas_proveedores')
          .update({ total_pendiente: nuevoSaldo, updated_at: new Date().toISOString() })
          .eq('id', factura.id)
        if (errFactura) fallos.push('actualizar el saldo del proveedor')
      }
    }

    if (fallos.length > 0) alert('Se clasifico, pero fallo: ' + fallos.join(', ') + '. Avisale al admin para que lo revise.')
    setPendientes(prev => prev.filter(p => p.id !== n.id))
    setClasificacion(prev => { const c = { ...prev }; delete c[n.id]; return c })
    setProcesandoId(null)
  }

  const cargarHistorial = async (desde, hasta) => {
    setCargandoHistorial(true)
    const { data } = await supabase.from('novedades').select('*, vendedores(nombre), proveedores(nombre)')
      .eq('empresa_id', getEmpresaId()).gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false })
    setHistorialItems(data || [])
    setCargandoHistorial(false)
  }

  const cargarResumenMes = async () => {
    const hoy = obtenerFechaActual()
    const inicioMes = hoy.slice(0, 7) + '-01'
    const { data } = await supabase.from('novedades').select('proveedor_id, valor, cantidad, tipo, motivo, proveedores(nombre)')
      .eq('empresa_id', getEmpresaId()).gte('fecha', inicioMes).lte('fecha', hoy)
    const porProveedor = {}
    const porMotivo = {}
    let perdidas = 0
    ;(data || []).forEach(n => {
      if (n.tipo === 'descuenta_proveedor') {
        const key = n.proveedor_id || 'sin-proveedor'
        if (!porProveedor[key]) porProveedor[key] = { nombre: n.proveedores?.nombre || 'Sin proveedor', total: 0 }
        porProveedor[key].total += (n.valor || 0)
      } else if (n.tipo === 'perdida_negocio') {
        perdidas += (n.valor || 0)
      }
      const key = n.motivo || 'Sin motivo'
      porMotivo[key] = (porMotivo[key] || 0) + (n.cantidad || 1)
    })
    setResumenProveedores(Object.values(porProveedor).sort((a, b) => b.total - a.total))
    setResumenPerdidas(perdidas)
    setResumenPorMotivo(Object.entries(porMotivo).map(([nombre, cantidad]) => ({ nombre, cantidad })).sort((a, b) => b.cantidad - a.cantidad))

    // Para quien fabrica (hay produccion registrada): los cambios son
    // paquetes producidos que no se convirtieron en venta. Se mide contra la
    // produccion del mes.
    const { data: lotes } = await supabase.from('produccion_lotes').select('produccion_detalle(cantidad_producida)')
      .eq('empresa_id', getEmpresaId()).gte('fecha', inicioMes).lte('fecha', hoy)
    const producidos = (lotes || []).reduce((s, l) => s + (l.produccion_detalle || []).reduce((t, d) => t + (d.cantidad_producida || 0), 0), 0)
    const unidadesCambio = (data || []).filter(n => n.tipo === 'mano_a_mano' || n.tipo === 'perdida_negocio').reduce((s, n) => s + (n.cantidad || 0), 0)
    setCambiosVsProduccion(producidos > 0 ? { producidos, unidadesCambio, pct: (unidadesCambio / producidos) * 100 } : null)
  }

  const irAHistorial = () => {
    setVista('historial')
    const hoy = obtenerFechaActual()
    const inicioMes = hoy.slice(0, 7) + '-01'
    setFiltroDesde(inicioMes)
    setFiltroHasta(hoy)
    setFiltroTipo('todos')
    setFiltroProveedor('todos')
    cargarHistorial(inicioMes, hoy)
    cargarResumenMes()
  }

  const historialFiltrado = historialItems.filter(n => {
    const matchTipo = filtroTipo === 'todos' || n.tipo === filtroTipo
    const matchProv = filtroProveedor === 'todos' || n.proveedor_id === filtroProveedor
    return matchTipo && matchProv
  })

  if (!usuario) return null

  if (guardado) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-md w-full">
        <h2 className="text-2xl font-black text-gray-800">Registrado</h2>
        <p className="text-gray-500 mt-2">{TIPOS.find(t => t.id === tipo)?.nombre} guardado correctamente.</p>
        <div className="flex gap-3 mt-6">
          <button onClick={() => { cambiarTipo(tipo); setGuardado(false) }}
            className="flex-1 bg-brand hover:bg-brand-dark text-white px-4 py-3 rounded-xl font-bold">
            Nuevo registro
          </button>
          <button onClick={() => router.push('/despacho')} className="flex-1 bg-gray-100 text-gray-600 px-4 py-3 rounded-xl font-bold">
            Inicio
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <PageHeader title="Cambios" subtitle="Cambios por proveedor, perdidas de calidad y registros informativos" />

      <div className="p-4 max-w-2xl mx-auto">
        <div className="flex gap-2 mb-4">
          <button onClick={() => setVista('nuevo')}
            className={`flex-1 py-2 rounded-xl text-sm font-bold ${vista === 'nuevo' ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            Registrar cambio
          </button>
          <button onClick={() => { setVista('pendientes'); cargarPendientes() }}
            className={`flex-1 py-2 rounded-xl text-sm font-bold relative ${vista === 'pendientes' ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            Pendientes
            {pendientes.length > 0 && (
              <span className="ml-1 bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 align-middle">{pendientes.length}</span>
            )}
          </button>
          {incluyeProveedor && (
            <button onClick={() => { setVista('por_reponer'); cargarPorReponer() }}
              className={`flex-1 py-2 rounded-xl text-sm font-bold ${vista === 'por_reponer' ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              Por reponer
              {porReponer.length > 0 && (
                <span className="ml-1 bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 align-middle">{porReponer.length}</span>
              )}
            </button>
          )}
          <button onClick={irAHistorial}
            className={`flex-1 py-2 rounded-xl text-sm font-bold ${vista === 'historial' ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            Historial
          </button>
        </div>

        {vista === 'por_reponer' ? (
          <div>
            <p className="text-xs text-gray-500 mb-3">Cambios mano a mano que el proveedor todavía debe reponer. Cuando entregue el producto bueno, márcalo como repuesto. No mueve inventario.</p>
            {cargandoPorReponer ? (
              <p className="text-gray-400 text-center py-10">Cargando...</p>
            ) : porReponer.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center shadow-sm">
                <p className="text-4xl mb-3">✅</p>
                <p className="text-gray-500">Ningún proveedor tiene cambios pendientes por reponer</p>
              </div>
            ) : (
              Object.values(porReponer.reduce((acc, n) => {
                const key = n.proveedor_id || 'sin'
                if (!acc[key]) acc[key] = { nombre: n.proveedores?.nombre || 'Sin proveedor', items: [] }
                acc[key].items.push(n)
                return acc
              }, {})).map(g => (
                <div key={g.nombre} className="bg-white rounded-xl shadow-sm p-4 mb-3">
                  <div className="flex justify-between items-baseline mb-2">
                    <p className="font-black text-gray-800">{g.nombre}</p>
                    <p className="text-xs font-bold text-brand">{g.items.reduce((s, n) => s + Number(n.cantidad || 0), 0)} und por reponer</p>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {g.items.map(n => {
                      const dias = diasDesde(n.fecha)
                      return (
                        <div key={n.id} className="py-2 flex justify-between items-center gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-700">{getProducto(n.sku)?.nombre || n.sku} · {n.cantidad} und</p>
                            <p className={`text-xs ${dias >= 3 ? 'text-brand font-bold' : 'text-gray-400'}`}>
                              {n.fecha} · {dias === 0 ? 'hoy' : `hace ${dias} día${dias > 1 ? 's' : ''}`}
                            </p>
                            {n.motivo && <p className="text-xs text-gray-500">{n.motivo}</p>}
                          </div>
                          <button onClick={() => marcarRepuesto(n)} disabled={procesandoId === n.id}
                            className="shrink-0 bg-secondary hover:bg-black text-white text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50">
                            {procesandoId === n.id ? '...' : 'Repuesto'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : vista === 'pendientes' ? (
          <div>
            <p className="text-xs text-gray-500 mb-3">Cambios reportados por vendedores desde el Kiosco. Clasifica cada uno para decidir si se maneja mano a mano, se descuenta al proveedor o es perdida del negocio.</p>
            {cargandoPendientes ? (
              <p className="text-gray-400 text-center py-10">Cargando...</p>
            ) : pendientes.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center shadow-sm">
                <p className="text-4xl mb-3">✅</p>
                <p className="text-gray-500">No hay cambios pendientes de clasificar</p>
              </div>
            ) : (
              pendientes.map(n => {
                const conf = getClasificacion(n)
                return (
                  <div key={n.id} className="bg-white rounded-xl shadow-sm p-4 mb-3">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-bold text-gray-800 text-sm">{getProducto(n.sku)?.nombre || n.sku}</p>
                        <p className="text-xs text-gray-400">{n.fecha} · {n.vendedores?.nombre || 'vendedor'} · {n.cantidad} und</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 mb-2">
                      {tiposDisponibles.map(t => (
                        <button key={t.id} onClick={() => actualizarClasificacion(n, 'tipo', t.id)}
                          className={`text-left p-2 rounded-lg border-2 transition-colors ${conf.tipo === t.id ? 'border-brand bg-brand/5' : 'border-gray-200'}`}>
                          <p className={`font-bold text-xs ${conf.tipo === t.id ? 'text-brand' : 'text-gray-800'}`}>{t.nombre}</p>
                        </button>
                      ))}
                    </div>
                    {conf.tipo === 'descuenta_proveedor' && (
                      <select value={conf.proveedorId} onChange={e => actualizarClasificacion(n, 'proveedorId', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 mb-2 focus:outline-none focus:border-brand">
                        <option value="">Selecciona proveedor</option>
                        {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                      </select>
                    )}
                    {(conf.tipo === 'descuenta_proveedor' || conf.tipo === 'perdida_negocio') && (
                      <InputDinero placeholder={`Valor ${conf.tipo === 'descuenta_proveedor' ? 'de la nota credito' : 'de la perdida'}`}
                        value={conf.valor} onChange={e => actualizarClasificacion(n, 'valor', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 mb-2 focus:outline-none focus:border-brand" />
                    )}
                    {motivosCambio.length > 0 ? (
                      <select value={conf.motivo} onChange={e => actualizarClasificacion(n, 'motivo', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 mb-2 focus:outline-none focus:border-brand bg-white">
                        <option value="">Motivo (opcional)</option>
                        {motivosCambio.map(m => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
                      </select>
                    ) : (
                      <input type="text" placeholder="Motivo (opcional)" value={conf.motivo}
                        onChange={e => actualizarClasificacion(n, 'motivo', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 mb-2 focus:outline-none focus:border-brand" />
                    )}
                    <button onClick={() => confirmarPendiente(n)} disabled={procesandoId === n.id}
                      className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-2 rounded-lg text-sm disabled:opacity-50">
                      {procesandoId === n.id ? 'Guardando...' : 'Confirmar clasificacion'}
                    </button>
                  </div>
                )
              })
            )}
          </div>
        ) : vista === 'historial' ? (
          <div>
            <div className="grid grid-cols-1 gap-3 mb-4">
              <div className="bg-white rounded-xl shadow-sm p-4">
                <p className="text-xs text-gray-500 mb-2">Descontado a proveedores este mes</p>
                {resumenProveedores.length === 0 ? (
                  <p className="text-sm text-gray-400">Sin descuentos este mes</p>
                ) : (
                  resumenProveedores.map(r => (
                    <div key={r.nombre} className="flex justify-between py-1">
                      <p className="text-sm text-gray-700">{r.nombre}</p>
                      <p className="text-sm font-bold text-gray-900">${r.total.toLocaleString('es-CO')}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4 flex justify-between items-center">
                <p className="text-sm font-bold text-gray-700">Perdidas propias este mes</p>
                <p className="text-xl font-black text-brand">${resumenPerdidas.toLocaleString('es-CO')}</p>
              </div>
            </div>

            {resumenPorMotivo.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
                <p className="font-black text-gray-700 mb-1">Cambios por motivo (mes en curso)</p>
                <p className="text-xs text-gray-400 mb-3">Indicador para identificar de donde vienen mas cambios y tomar decisiones</p>
                {cambiosVsProduccion && (
                  <div className="flex justify-between items-baseline bg-gray-50 rounded-lg px-3 py-2 mb-3">
                    <p className="text-xs text-gray-600">
                      {cambiosVsProduccion.unidadesCambio.toLocaleString('es-CO')} paquetes en cambios de {cambiosVsProduccion.producidos.toLocaleString('es-CO')} producidos este mes
                    </p>
                    <p className="text-lg font-black text-brand">{cambiosVsProduccion.pct.toFixed(1)}%</p>
                  </div>
                )}
                <ResponsiveContainer width="100%" height={Math.max(120, resumenPorMotivo.length * 40)}>
                  <BarChart data={resumenPorMotivo} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" fontSize={12} allowDecimals={false} />
                    <YAxis type="category" dataKey="nombre" fontSize={12} width={160} />
                    <Tooltip formatter={v => `${v} und`} />
                    <Bar dataKey="cantidad" fill="#C41230" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <div className="flex gap-2 mb-2">
                <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
                  className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
                  <option value="todos">Todos los tipos</option>
                  {tiposDisponibles.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
                <select value={filtroProveedor} onChange={e => setFiltroProveedor(e.target.value)}
                  className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
                  <option value="todos">Todos los proveedores</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)}
                  className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
                <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)}
                  className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
                <button onClick={() => cargarHistorial(filtroDesde, filtroHasta)}
                  className="bg-brand hover:bg-brand-dark text-white px-4 rounded-xl text-sm font-bold">
                  Buscar
                </button>
              </div>
            </div>

            {cargandoHistorial ? (
              <p className="text-gray-400 text-center py-10">Cargando...</p>
            ) : historialFiltrado.length === 0 ? (
              <p className="text-gray-400 text-center py-10">Sin cambios registrados en ese rango</p>
            ) : (
              <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
                {historialFiltrado.map(n => (
                  <div key={n.id} className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-gray-800 text-sm">{getProducto(n.sku)?.nombre || n.sku}</p>
                        <p className="text-xs text-gray-400">
                          {n.fecha} · {TIPOS.find(t => t.id === n.tipo)?.nombre || n.tipo} · {n.momento === 'en_bodega' ? 'En bodega' : 'En ruta'}
                        </p>
                        {n.proveedores?.nombre && <p className="text-xs text-gray-400">Proveedor: {n.proveedores.nombre}</p>}
                        {n.vendedores?.nombre && <p className="text-xs text-gray-400">Vendedor: {n.vendedores.nombre}</p>}
                        {n.motivo && <p className="text-xs text-gray-500 mt-1">{n.motivo}</p>}
                        {n.pendiente_reponer && (
                          <p className={`text-xs font-bold mt-1 ${n.repuesto_at ? 'text-emerald-600' : 'text-brand'}`}>
                            {n.repuesto_at
                              ? `Repuesto el ${new Date(n.repuesto_at).toLocaleDateString('es-CO')}${n.repuesto_por ? ` (${n.repuesto_por})` : ''}`
                              : 'Pendiente por reponer'}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-black text-gray-700 text-sm">{n.cantidad} und</p>
                        {n.valor ? <p className="text-xs text-brand font-bold">${n.valor.toLocaleString('es-CO')}</p> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 mb-4">
              {tiposDisponibles.map(t => (
                <button key={t.id} onClick={() => cambiarTipo(t.id)}
                  className={`text-left p-3 rounded-xl border-2 transition-colors ${tipo === t.id ? 'border-brand bg-brand/5' : 'border-gray-200 bg-white'}`}>
                  <p className={`font-bold text-sm ${tipo === t.id ? 'text-brand' : 'text-gray-800'}`}>{t.nombre}</p>
                  <p className="text-xs text-gray-500">{descTipo(t)}</p>
                </button>
              ))}
            </div>

            {tipo === 'mano_a_mano' && incluyeProveedor && (
              <label className="bg-white rounded-xl shadow-sm p-4 mb-4 flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={pendienteReponer} onChange={e => setPendienteReponer(e.target.checked)}
                  className="mt-1 w-4 h-4 accent-brand" />
                <span>
                  <span className="block text-sm font-bold text-gray-800">Queda pendiente por reponer</span>
                  <span className="block text-xs text-gray-500">El proveedor cambia el producto después (ej. mañana). Queda en la pestaña Por reponer hasta que lo marques como repuesto.</span>
                </span>
              </label>
            )}

            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <label className="text-xs font-bold text-gray-600 block mb-2">Quien registra</label>
              {usuario.rol === 'vendedor' ? (
                <p className="font-bold text-gray-800">Vendedor</p>
              ) : (
                <div className="flex gap-2">
                  {QUIEN_REGISTRA_OPCIONES.map(o => (
                    <button key={o.id} onClick={() => setQuienRegistra(o.id)}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold ${quienRegistra === o.id ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <label className="text-xs font-bold text-gray-600 block mb-2">Momento</label>
              <div className="flex gap-2">
                <button onClick={() => setMomento('en_bodega')}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold ${momento === 'en_bodega' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}>
                  En bodega
                </button>
                <button onClick={() => setMomento('en_ruta')}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold ${momento === 'en_ruta' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}>
                  En ruta
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {momento === 'en_bodega' ? 'Ocurre antes del despacho, sin pasar por un vendedor' : 'Reportado por un vendedor durante su ruta'}
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <label className="text-xs font-bold text-gray-600 block mb-1">Vendedor{momento === 'en_bodega' ? ' (opcional)' : ''}</label>
              {usuario.rol === 'vendedor' ? (
                <p className="font-bold text-gray-800">{vendedorPropio?.nombre || 'Cargando...'}</p>
              ) : (
                <select value={vendedorId} onChange={e => setVendedorId(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
                  <option value="">{momento === 'en_bodega' ? 'Sin vendedor asociado' : 'Selecciona vendedor'}</option>
                  {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                </select>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <div className="flex justify-between items-center mb-3">
                <p className="font-black text-gray-700">Productos</p>
                <button onClick={agregarItem} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg font-bold">+ Agregar</button>
              </div>
              {items.map((it, i) => (
                <div key={i} className="mb-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0 last:mb-0">
                  <div className="flex gap-2 mb-2">
                    <select value={it.sku} onChange={e => actualizarItem(i, 'sku', e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand">
                      <option value="">Selecciona producto</option>
                      {productos.map(p => <option key={p.sku} value={p.sku}>{p.nombre}</option>)}
                    </select>
                    <input type="number" min="0" placeholder="Cant" value={it.cantidad}
                      onChange={e => actualizarItem(i, 'cantidad', e.target.value)}
                      className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 focus:outline-none focus:border-brand" />
                    {items.length > 1 && (
                      <button onClick={() => quitarItem(i)} className="text-brand text-sm px-2">✕</button>
                    )}
                  </div>
                  {motivosCambio.length > 0 ? (
                    <div className="mb-2">
                      <div className="flex gap-2">
                        <select value={it.motivo} onChange={e => actualizarItem(i, 'motivo', e.target.value)}
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand bg-white">
                          <option value="">Motivo</option>
                          {motivosCambio.map(m => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
                        </select>
                        {usuario?.rol === 'admin' && i === 0 && (
                          <button type="button" onClick={() => setAgregandoMotivo(!agregandoMotivo)}
                            className="text-xs bg-gray-100 text-gray-600 px-3 rounded-lg font-bold shrink-0">+ Nuevo</button>
                        )}
                      </div>
                      {i === 0 && agregandoMotivo && (
                        <div className="flex gap-2 mt-2">
                          <input type="text" placeholder="Nombre del motivo nuevo" value={nuevoMotivoNombre}
                            onChange={e => setNuevoMotivoNombre(e.target.value)}
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand" />
                          <button type="button" onClick={agregarMotivoCambio}
                            className="bg-brand text-white px-3 rounded-lg text-xs font-bold shrink-0">Guardar</button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <input type="text" placeholder="Motivo" value={it.motivo}
                      onChange={e => actualizarItem(i, 'motivo', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 mb-2 focus:outline-none focus:border-brand" />
                  )}

                  {(tipo === 'descuenta_proveedor' || (tipo === 'mano_a_mano' && incluyeProveedor && pendienteReponer)) && (
                    <div className="mb-2">
                      <label className="text-xs text-gray-500 block mb-1">{tipo === 'mano_a_mano' ? 'Proveedor que debe reponer' : 'Proveedor afectado'}</label>
                      {(!it.proveedorManual && it.proveedorId) ? (
                        <div className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
                          <p className="text-sm font-bold text-gray-800">{proveedores.find(p => p.id === it.proveedorId)?.nombre || 'Proveedor asignado'}</p>
                          <button onClick={() => actualizarItem(i, 'proveedorManual', true)} className="text-xs text-brand font-bold">Cambiar</button>
                        </div>
                      ) : (
                        <select value={it.proveedorId} onChange={e => actualizarItem(i, 'proveedorId', e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand">
                          <option value="">Selecciona proveedor</option>
                          {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                        </select>
                      )}
                    </div>
                  )}

                  {(tipo === 'descuenta_proveedor' || tipo === 'perdida_negocio') && (
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Valor {tipo === 'descuenta_proveedor' ? 'de la nota credito' : 'de la perdida'}</label>
                      <InputDinero placeholder="0" value={it.valor}
                        onChange={e => actualizarItem(i, 'valor', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 focus:outline-none focus:border-brand" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button onClick={guardarCambios} disabled={guardando}
              className="w-full bg-brand hover:bg-brand-dark text-white font-black py-4 rounded-xl text-lg disabled:opacity-50">
              {guardando ? 'Guardando...' : 'Registrar'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
