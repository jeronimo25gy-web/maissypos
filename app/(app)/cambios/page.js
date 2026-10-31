'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { inicioDelRol } from '@/lib/navegacion'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { calcularStockPorSku } from '@/lib/inventario-helpers'
import { PageHeader } from '@/components/ui'
import { GraficaHorizontal } from '@/components/Graficas'
import InputDinero from '@/components/InputDinero'
import CampoFecha from '@/components/CampoFecha'

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
  const vistaInicial = useRef(false)

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/entrar'); return }
    const parsed = JSON.parse(u)
    if (!['admin', 'auxiliar', 'vendedor'].includes(parsed.rol)) { router.push('/despacho'); return }
    setUsuario(parsed)
    cargarProductos()
    cargarProveedores()
    cargarPendientes()
    cargarPorReponer()
    cargarConfigEmpresa()
    cargarMotivosCambio()
    cargarResumenMes()
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

  // El proveedor no va a reponer: pasa a perdida del negocio. No mueve
  // inventario (la unidad mala ya habia salido: apartada en bodega o cambiada
  // al cliente en ruta); solo registra el gasto al costo de compra.
  const pasarAPerdida = async (n) => {
    const p = getProducto(n.sku)
    let costo = Number(p?.costo_compra) || 0
    if (!costo) {
      const { data: ult } = await supabase.from('compras').select('precio_unitario').eq('empresa_id', getEmpresaId()).eq('sku', n.sku)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      costo = Number(ult?.precio_unitario) || 0
    }
    const valor = Math.round(costo * Number(n.cantidad || 0))
    if (!confirm(`${n.proveedores?.nombre || 'El proveedor'} no va a reponer ${n.cantidad} und de ${p?.nombre || n.sku}.\n\nPasa a pérdida del negocio por $${valor.toLocaleString('es-CO')} (al costo) y se registra en Gastos Admin. ¿Seguro?`)) return
    setProcesandoId(n.id)
    const { error } = await supabase.from('novedades')
      .update({ tipo: 'perdida_negocio', pendiente_reponer: false, valor, revisado: true })
      .eq('id', n.id).eq('empresa_id', getEmpresaId())
    if (error) { setProcesandoId(null); alert('Error: ' + error.message); return }
    const { error: errGasto } = await supabase.from('gastos_admin').insert({
      empresa_id: getEmpresaId(), fecha: obtenerFechaActual(), categoria: 'Pérdida por calidad',
      descripcion: `${p?.nombre || n.sku} (${n.sku}) x${n.cantidad} - ${n.proveedores?.nombre || 'proveedor'} no repuso${n.motivo ? ' - ' + n.motivo : ''}`,
      valor, registrado_por: usuario.nombre,
    })
    setProcesandoId(null)
    if (errGasto) alert('Quedo como perdida, pero no se pudo registrar el gasto: ' + errGasto.message)
    cargarPorReponer()
  }

  const diasDesde = (fecha) => Math.max(0, Math.round((new Date(obtenerFechaActual() + 'T12:00:00') - new Date(fecha + 'T12:00:00')) / 86400000))

  const cargarPendientes = async () => {
    setCargandoPendientes(true)
    const { data } = await supabase.from('novedades').select('*, vendedores(nombre)')
      .eq('empresa_id', getEmpresaId()).eq('revisado', false).order('fecha', { ascending: false })
    setPendientes(data || [])
    setCargandoPendientes(false)
    if (!vistaInicial.current) { vistaInicial.current = true; if ((data || []).length) setVista('pendientes') }
  }

  // Por defecto: proveedor del producto y valor = cantidad x costo (se corrige si hace falta).
  const valorSugerido = (n) => { const p = getProducto(n.sku); return String(Math.round(Number(n.cantidad || 0) * Number(p?.costo_compra || p?.precio_venta || 0))) }
  const getClasificacion = (n) => clasificacion[n.id] || { tipo: 'mano_a_mano', proveedorId: n.proveedor_id || getProducto(n.sku)?.proveedor_id || '', valor: valorSugerido(n), motivo: n.motivo || '', repone: !!n.pendiente_reponer }
  const actualizarClasificacion = (n, campo, valor) => {
    setClasificacion(prev => ({ ...prev, [n.id]: { ...getClasificacion(n), ...prev[n.id], [campo]: valor } }))
  }

  const confirmarPendiente = async (n, forzado) => {
    const conf = forzado || getClasificacion(n)
    if (conf.tipo === 'mano_a_mano' && conf.repone && !conf.proveedorId) { alert('Escoge el proveedor que repone'); return }
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
      // Mano a mano que el proveedor debe reponer conserva su proveedor; si se
      // reclasifica a descuento o perdida, ya no queda nada por reponer.
      proveedor_id: conf.tipo === 'descuenta_proveedor' ? conf.proveedorId
        : conf.tipo === 'mano_a_mano' && (conf.repone || n.pendiente_reponer) ? (conf.proveedorId || n.proveedor_id) : null,
      pendiente_reponer: conf.tipo === 'mano_a_mano' && !!(conf.repone || n.pendiente_reponer),
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
    if (conf.tipo === 'mano_a_mano' && conf.repone) cargarPorReponer()
    cargarResumenMes()
  }

  // Todos los pendientes como mano a mano (lo mas comun), de una vez.
  const clasificarTodosManoAMano = async () => {
    for (const n of [...pendientes]) await confirmarPendiente(n, { ...getClasificacion(n), tipo: 'mano_a_mano' })
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

  // ---------- pantalla (linea de Mi ruta) ----------
  const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: 'var(--hoja)', linea: '#E3E1D8', suave: '#EFEDE6', rojo: 'var(--rojo)', rojoF: 'var(--rojo-suave)', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8' }
  const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
  const $ = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
  const fechaCorta = (f) => f ? new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }) : ''
  const tarjeta = 'bg-white rounded-[18px] p-3.5 min-w-0'
  const campo = 'w-full rounded-xl px-3 min-h-[42px] text-[14.5px] bg-white border outline-none focus:border-[#1C1B19]'
  const pill = (texto, color, fondo) => <span className="inline-flex items-center text-[12px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap" style={{ color, background: fondo }}>{texto}</span>
  const chip = (activo, onClick, contenido, key) => (
    <button key={key} type="button" onClick={onClick} aria-pressed={activo} className="px-3 min-h-[36px] rounded-full text-[13px] font-bold"
      style={activo ? { background: '#fff', color: C.tinta, boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: C.suave, color: C.gris }}>{contenido}</button>
  )
  const opcion = (activo, onClick, t, sub, key) => (
    <button key={key} type="button" onClick={onClick} aria-pressed={activo} className="rounded-2xl px-3 py-2 text-left border-[1.5px] bg-white min-w-0"
      style={{ borderColor: activo ? C.tinta : C.linea, boxShadow: activo ? `inset 0 0 0 1px ${C.tinta}` : 'none' }}>
      <b className="block text-[13.5px] leading-tight">{t}</b>{sub && <span className="block text-[11.5px] leading-snug mt-0.5" style={{ color: C.gris }}>{sub}</span>}
    </button>
  )
  const nombreTipo = (id) => ({ mano_a_mano: 'Mano a mano', descuenta_proveedor: 'Descuenta al proveedor', perdida_negocio: 'Pérdida', devolucion: 'Devolución', devolucion_cliente: 'Devolución de cliente' }[id] || id)
  const subTipo = (id) => id === 'mano_a_mano' ? (esFabricante ? 'Sale de bodega la unidad buena' : 'Solo registro') : id === 'descuenta_proveedor' ? 'Nota crédito al proveedor' : (esFabricante ? 'Va a Gastos' : 'Sale de bodega y va a Gastos')

  if (guardado) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: C.fondo, color: C.tinta }}>
      <div className="bg-white rounded-[22px] p-7 text-center max-w-md w-full flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: C.verdeF }} aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={C.verde} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
        </div>
        <h2 className="font-extrabold text-[24px]" style={titulo}>Cambio registrado</h2>
        <p style={{ color: C.gris }}>{nombreTipo(tipo)}{tipo === 'mano_a_mano' && pendienteReponer ? ' · queda en Por reponer' : ''}</p>
        <div className="grid grid-cols-2 gap-2 w-full">
          <button onClick={() => { cambiarTipo(tipo); setGuardado(false) }} className="min-h-[48px] rounded-2xl font-bold text-white" style={{ background: 'var(--primario)' }}>Otro cambio</button>
          <button onClick={() => router.push(inicioDelRol())} className="min-h-[48px] rounded-2xl font-bold" style={{ background: C.fondo }}>Ir al inicio</button>
        </div>
      </div>
    </div>
  )

  const undPendientes = pendientes.reduce((s, n) => s + Number(n.cantidad || 0), 0)
  const undReponer = porReponer.reduce((s, n) => s + Number(n.cantidad || 0), 0)
  const provReponer = new Set(porReponer.map(n => n.proveedor_id)).size
  const masViejoReponer = porReponer.length ? Math.max(...porReponer.map(n => diasDesde(n.fecha))) : 0
  const descontadoMes = resumenProveedores.reduce((s, r) => s + r.total, 0)
  const pestanas = [['pendientes', 'Por clasificar', pendientes.length], ['nuevo', 'Registrar cambio', 0], ...(incluyeProveedor ? [['por_reponer', 'Por reponer', porReponer.length]] : []), ['historial', 'Historial y motivos', 0]]
  const irA = (v) => { if (v === 'pendientes') cargarPendientes(); if (v === 'por_reponer') cargarPorReponer(); if (v === 'historial') irAHistorial(); else setVista(v) }

  return (
    <div style={{ background: C.fondo, minHeight: '100vh', color: C.tinta }}>
      <PageHeader buscar="Cambios" title="Cambios" />
      <div className="p-4 max-w-6xl mx-auto flex flex-col gap-4">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {[
            ['Por clasificar', String(pendientes.length), `${undPendientes} und de la liquidación`, pendientes.length ? C.rojo : null],
            incluyeProveedor ? ['Por reponer', `${undReponer} und`, porReponer.length ? `${provReponer} proveedor${provReponer === 1 ? '' : 'es'} · el más viejo hace ${masViejoReponer} día${masViejoReponer === 1 ? '' : 's'}` : 'Nada pendiente', masViejoReponer > 7 ? C.rojo : null]
              : ['Cambios del mes', `${resumenPorMotivo.reduce((s, m) => s + m.cantidad, 0)} und`, cambiosVsProduccion ? `${cambiosVsProduccion.pct.toLocaleString('es-CO', { maximumFractionDigits: 1 })}% de lo producido` : 'Este mes'],
            incluyeProveedor ? ['Descontado a proveedores', $(descontadoMes), 'Este mes'] : ['Producido este mes', Math.round(cambiosVsProduccion?.producidos || 0).toLocaleString('es-CO'), 'paquetes'],
            ['Pérdidas del negocio', $(resumenPerdidas), 'Este mes · van a Gastos'],
          ].map(([et, va, sub, color]) => (
            <div key={et} className={tarjeta + ' flex flex-col gap-0.5'}>
              <span className="text-[12.5px] font-bold" style={{ color: C.gris }}>{et}</span>
              <span className="font-extrabold text-[24px] tabular-nums leading-tight" style={{ ...titulo, color: color || C.tinta }}>{va}</span>
              <span className="text-[12.5px]" style={{ color: C.gris }}>{sub}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-1 bg-white rounded-full p-1 self-start max-w-full overflow-x-auto" role="tablist">
          {pestanas.map(([v, t, n]) => (
            <button key={v} role="tab" aria-selected={vista === v} onClick={() => irA(v)} className="px-4 min-h-[38px] rounded-full text-[13.5px] font-bold whitespace-nowrap"
              style={vista === v ? { background: C.tinta, color: '#fff' } : { color: C.gris }}>
              {t}{n > 0 && <span className="ml-1.5 text-[11px] font-extrabold rounded-full px-1.5 py-0.5" style={{ background: 'var(--acento)', color: C.tinta }}>{n}</span>}
            </button>
          ))}
        </div>

        {/* ---------- POR CLASIFICAR ---------- */}
        {vista === 'pendientes' && (
          cargandoPendientes ? <p className="text-sm py-10 text-center" style={{ color: C.gris }}>Cargando…</p>
            : pendientes.length === 0 ? <div className={tarjeta + ' text-center py-8'}><b>Nada por clasificar.</b><p className="text-[14px]" style={{ color: C.gris }}>Los cambios que lleguen de las liquidaciones aparecen aquí.</p></div> : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13.5px]" style={{ color: C.gris }}>Llegan de las liquidaciones aprobadas. Hasta clasificarlos no tocan proveedor ni gastos.</span>
                  {pendientes.length > 1 && <button onClick={clasificarTodosManoAMano} disabled={!!procesandoId} className="px-3 min-h-[38px] rounded-xl text-[13px] font-bold bg-white disabled:opacity-50">Clasificar los {pendientes.length} como mano a mano</button>}
                </div>
                <div className="grid gap-3 md:grid-cols-2 items-start">
                  {pendientes.map(n => {
                    const conf = getClasificacion(n)
                    const p = getProducto(n.sku)
                    const prov = proveedores.find(x => x.id === conf.proveedorId)
                    return (
                      <article data-fila key={n.id} className={tarjeta + ' flex flex-col gap-2.5'}>
                        <div className="flex justify-between gap-3 items-start">
                          <div className="min-w-0">
                            <h3 className="font-extrabold text-[17px] leading-tight" style={titulo}>{p?.nombre || n.sku} · {n.cantidad} und</h3>
                            <p className="text-[13px]" style={{ color: C.gris }}>{n.vendedores?.nombre || 'Sin vendedor'} · {fechaCorta(n.fecha)}</p>
                          </div>
                          {n.motivo && n.motivo !== 'Reportado en liquidacion del kiosco' && pill(n.motivo, C.gris, C.suave)}
                        </div>
                        <div className={`grid gap-1.5 ${tiposDisponibles.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`} role="group" aria-label="Qué se hace">
                          {tiposDisponibles.map(t => opcion(conf.tipo === t.id, () => actualizarClasificacion(n, 'tipo', t.id), t.id === 'mano_a_mano' && conf.repone ? 'Mano a mano' : nombreTipo(t.id), t.id === 'mano_a_mano' && conf.repone ? 'El proveedor repone' : subTipo(t.id), t.id))}
                        </div>
                        {conf.tipo === 'mano_a_mano' && incluyeProveedor && (
                          <label className="flex items-center gap-2 text-[13.5px]">
                            <input type="checkbox" checked={!!conf.repone} onChange={e => actualizarClasificacion(n, 'repone', e.target.checked)} className="w-4 h-4 accent-[#1C1B19]" />
                            <span>{prov ? <><b>{prov.nombre}</b> lo repone</> : 'El proveedor lo repone'} (queda en “Por reponer”)</span>
                          </label>
                        )}
                        {(conf.tipo === 'descuenta_proveedor' || (conf.tipo === 'mano_a_mano' && conf.repone)) && (
                          <select value={conf.proveedorId} onChange={e => actualizarClasificacion(n, 'proveedorId', e.target.value)} className={campo} style={{ borderColor: C.linea }} aria-label="Proveedor">
                            <option value="">¿Qué proveedor?</option>
                            {proveedores.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                          </select>
                        )}
                        {(conf.tipo === 'descuenta_proveedor' || conf.tipo === 'perdida_negocio') && (
                          <label className="text-[12.5px] font-bold" style={{ color: C.gris }}>Valor {conf.tipo === 'descuenta_proveedor' ? 'de la nota crédito' : 'de la pérdida'}
                            <InputDinero value={conf.valor} onChange={e => actualizarClasificacion(n, 'valor', e.target.value)} className={campo + ' font-bold mt-1'} style={{ borderColor: C.linea, color: C.tinta }} />
                            <span className="block font-normal mt-1">{n.cantidad} × {$(p?.costo_compra || p?.precio_venta)} (costo){conf.tipo === 'descuenta_proveedor' && prov ? ` · se le resta a lo que le debes a ${prov.nombre}` : ''}</span>
                          </label>
                        )}
                        {motivosCambio.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">{motivosCambio.map(m => chip(conf.motivo === m.nombre, () => actualizarClasificacion(n, 'motivo', conf.motivo === m.nombre ? '' : m.nombre), m.nombre, m.id))}</div>
                        )}
                        <button onClick={() => confirmarPendiente(n)} disabled={procesandoId === n.id} className="min-h-[44px] rounded-2xl font-bold text-white disabled:opacity-50" style={{ background: 'var(--primario)' }}>{procesandoId === n.id ? 'Guardando…' : 'Confirmar'}</button>
                      </article>
                    )
                  })}
                </div>
              </>
            )
        )}

        {/* ---------- REGISTRAR ---------- */}
        {vista === 'nuevo' && (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
            <div className="flex flex-col gap-3 min-w-0">
              <div className={tarjeta + ' flex flex-col gap-2.5'}>
                <div className="flex flex-wrap justify-between gap-2 items-center"><b>¿Dónde pasó?</b>
                  <div className="flex gap-1.5">{chip(momento === 'en_ruta', () => setMomento('en_ruta'), 'En ruta', 'r')}{chip(momento === 'en_bodega', () => setMomento('en_bodega'), 'En bodega', 'b')}</div>
                </div>
                {usuario.rol === 'vendedor' ? <p className="text-[14px]"><b>{vendedorPropio?.nombre || 'Cargando…'}</b></p> : (
                  <select value={vendedorId} onChange={e => setVendedorId(e.target.value)} className={campo} style={{ borderColor: C.linea }} aria-label="Vendedor">
                    <option value="">{momento === 'en_bodega' ? 'Sin vendedor (opcional)' : '¿Qué vendedor?'}</option>
                    {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                  </select>
                )}
                {usuario.rol !== 'vendedor' && <div className="flex flex-wrap items-center gap-1.5"><span className="text-[13px]" style={{ color: C.gris }}>Registra</span>{QUIEN_REGISTRA_OPCIONES.map(o => chip(quienRegistra === o.id, () => setQuienRegistra(o.id), o.label, o.id))}</div>}
              </div>

              <div className={tarjeta + ' flex flex-col'}>
                <b className="pb-1">Productos</b>
                {items.map((it, i) => {
                  const p = getProducto(it.sku)
                  const n = parseFloat(it.cantidad) || 0
                  return (
                    <div key={i} className="py-2.5 flex flex-col gap-2" style={{ borderTop: i ? `1px solid ${C.linea}` : 0 }}>
                      <div className="flex gap-2 items-center">
                        <select value={it.sku} onChange={e => actualizarItem(i, 'sku', e.target.value)} className={campo + ' flex-1 min-w-0'} style={{ borderColor: C.linea }} aria-label="Producto">
                          <option value="">Producto</option>
                          {productos.map(x => <option key={x.sku} value={x.sku}>{x.nombre}</option>)}
                        </select>
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" onClick={() => actualizarItem(i, 'cantidad', String(Math.max(0, n - 1)))} className="w-10 h-10 rounded-xl text-xl font-extrabold" style={{ background: C.suave }} aria-label="Menos">−</button>
                          <input type="text" inputMode="numeric" value={it.cantidad} placeholder="0" onChange={e => actualizarItem(i, 'cantidad', e.target.value.replace(/[^0-9.]/g, ''))} aria-label="Cantidad"
                            className="w-12 h-10 text-center rounded-xl font-extrabold text-[17px] bg-white border" style={{ ...titulo, borderColor: C.linea }} />
                          <button type="button" onClick={() => actualizarItem(i, 'cantidad', String(n + 1))} className="w-10 h-10 rounded-xl text-xl font-extrabold" style={{ background: C.suave }} aria-label="Más">+</button>
                        </div>
                        {items.length > 1 && <button type="button" onClick={() => quitarItem(i)} className="w-9 h-10 rounded-xl text-lg font-bold" style={{ background: C.suave }} aria-label="Quitar">×</button>}
                      </div>
                      {p && (tipo === 'descuenta_proveedor' || (tipo === 'mano_a_mano' && incluyeProveedor && pendienteReponer)) && (
                        <select value={it.proveedorId} onChange={e => actualizarItem(i, 'proveedorId', e.target.value)} className={campo} style={{ borderColor: C.linea }} aria-label="Proveedor">
                          <option value="">{tipo === 'mano_a_mano' ? '¿Quién lo repone?' : '¿Qué proveedor?'}</option>
                          {proveedores.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                        </select>
                      )}
                      {p && (tipo === 'descuenta_proveedor' || tipo === 'perdida_negocio') && (
                        <label className="flex items-center gap-2 text-[12.5px] font-bold" style={{ color: C.gris }}>Valor
                          <InputDinero value={it.valor} onChange={e => actualizarItem(i, 'valor', e.target.value)} className={campo + ' font-bold flex-1'} style={{ borderColor: C.linea, color: C.tinta }} />
                        </label>
                      )}
                      {motivosCambio.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">{motivosCambio.map(m => chip(it.motivo === m.nombre, () => actualizarItem(i, 'motivo', it.motivo === m.nombre ? '' : m.nombre), m.nombre, m.id))}</div>
                      ) : <input value={it.motivo} onChange={e => actualizarItem(i, 'motivo', e.target.value)} placeholder="Motivo" className={campo} style={{ borderColor: C.linea }} />}
                    </div>
                  )
                })}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button type="button" onClick={agregarItem} className="px-3 min-h-[38px] rounded-xl text-[13px] font-bold" style={{ background: C.suave }}>+ Otro producto</button>
                  {usuario.rol === 'admin' && <button type="button" onClick={() => setAgregandoMotivo(!agregandoMotivo)} className="px-3 min-h-[38px] rounded-xl text-[13px] font-bold" style={{ background: C.suave }}>+ Nuevo motivo</button>}
                </div>
                {agregandoMotivo && (
                  <div className="flex gap-2 pt-2">
                    <input value={nuevoMotivoNombre} onChange={e => setNuevoMotivoNombre(e.target.value)} placeholder="Nombre del motivo" className={campo + ' flex-1'} style={{ borderColor: C.linea }} />
                    <button type="button" onClick={agregarMotivoCambio} className="px-4 rounded-xl font-bold" style={{ background: C.suave, color: C.tinta }}>Guardar</button>
                  </div>
                )}
              </div>
            </div>

            <aside className="lg:sticky lg:top-24 flex flex-col gap-2">
              <div className={tarjeta + ' flex flex-col gap-2'}>
                <b>¿Qué se hace?</b>
                {tiposDisponibles.map(t => opcion(tipo === t.id, () => cambiarTipo(t.id), nombreTipo(t.id), descTipo(t), t.id))}
                {tipo === 'mano_a_mano' && incluyeProveedor && (
                  <label className="flex items-start gap-2 text-[13.5px] pt-1">
                    <input type="checkbox" checked={pendienteReponer} onChange={e => setPendienteReponer(e.target.checked)} className="w-4 h-4 mt-0.5 accent-[#1C1B19]" />
                    <span><b>El proveedor lo repone después</b><span className="block text-[12px]" style={{ color: C.gris }}>Queda en “Por reponer”; la unidad buena entra cuando la traiga.</span></span>
                  </label>
                )}
                <button onClick={guardarCambios} disabled={guardando} className="min-h-[50px] rounded-2xl font-bold text-white mt-1 disabled:opacity-50" style={{ background: 'var(--primario)' }}>
                  {guardando ? 'Guardando…' : (() => { const n = items.reduce((s, it) => s + (parseFloat(it.cantidad) || 0), 0); return n ? `Registrar ${n} und` : 'Registrar cambio' })()}
                </button>
              </div>
            </aside>
          </div>
        )}

        {/* ---------- POR REPONER ---------- */}
        {vista === 'por_reponer' && (
          cargandoPorReponer ? <p className="text-sm py-10 text-center" style={{ color: C.gris }}>Cargando…</p>
            : porReponer.length === 0 ? <div className={tarjeta + ' text-center py-8'}><b>Ningún proveedor debe reponer.</b></div> : (
              <>
                <div className="grid gap-3 md:grid-cols-2 items-start">
                  {Object.values(porReponer.reduce((acc, n) => { const k = n.proveedor_id || 'sin'; (acc[k] = acc[k] || { nombre: n.proveedores?.nombre || 'Sin proveedor', items: [] }).items.push(n); return acc }, {})).map(g => {
                    const viejo = Math.max(...g.items.map(n => diasDesde(n.fecha)))
                    return (
                      <article key={g.nombre} className={tarjeta + ' flex flex-col gap-1'}>
                        <div className="flex justify-between gap-2 items-center pb-1">
                          <h3 className="font-extrabold text-[17px]" style={titulo}>{g.nombre}</h3>
                          {pill(`${g.items.reduce((s, n) => s + Number(n.cantidad || 0), 0)} und · ${viejo === 0 ? 'hoy' : `hace ${viejo} día${viejo === 1 ? '' : 's'}`}`, viejo > 7 ? C.rojo : C.gris, viejo > 7 ? C.rojoF : C.suave)}
                        </div>
                        {g.items.map((n, i) => (
                          <div data-fila key={n.id} className="flex justify-between gap-3 items-center py-2 text-[14px]" style={{ borderTop: i ? `1px solid ${C.linea}` : `1px solid ${C.linea}` }}>
                            <span className="min-w-0"><b>{getProducto(n.sku)?.nombre || n.sku}</b> · {n.cantidad} und<span className="block text-[12.5px]" style={{ color: C.gris }}>{fechaCorta(n.fecha)}{n.motivo ? ` · ${n.motivo}` : ''}</span></span>
                            <span className="flex gap-1.5 shrink-0">
                              <button onClick={() => pasarAPerdida(n)} disabled={procesandoId === n.id} className="px-3 min-h-[36px] rounded-xl text-[13px] font-bold disabled:opacity-50" style={{ background: C.suave }}>Pérdida</button>
                              <button onClick={() => marcarRepuesto(n)} disabled={procesandoId === n.id} className="px-3 min-h-[36px] rounded-xl text-[13px] font-bold disabled:opacity-50" style={{ background: C.verdeF, color: C.verde }}>{procesandoId === n.id ? '…' : 'Repuesto'}</button>
                            </span>
                          </div>
                        ))}
                      </article>
                    )
                  })}
                </div>
              </>
            )
        )}

        {/* ---------- HISTORIAL ---------- */}
        {vista === 'historial' && (
          <>
            <div className="grid gap-3 lg:grid-cols-2 items-start">
              <div className={tarjeta + ' flex flex-col gap-2'}>
                <div className="flex justify-between gap-2"><b>Cambios por motivo · {new Date(obtenerFechaActual() + 'T12:00:00').toLocaleDateString('es-CO', { month: 'long' })}</b><span className="text-[12.5px]" style={{ color: C.gris }}>unidades</span></div>
                {resumenPorMotivo.length === 0 ? <p className="text-[14px]" style={{ color: C.gris }}>Sin cambios este mes.</p>
                  : <GraficaHorizontal etiqueta="Cambios por motivo" filas={resumenPorMotivo.slice(0, 8).map(m => [m.nombre, m.cantidad])} />}
                {cambiosVsProduccion && <p className="text-[13px]" style={{ color: C.gris }}><b style={{ color: C.tinta }}>{cambiosVsProduccion.pct.toLocaleString('es-CO', { maximumFractionDigits: 1 })}%</b> de lo producido terminó en cambios ({cambiosVsProduccion.unidadesCambio.toLocaleString('es-CO')} de {Math.round(cambiosVsProduccion.producidos).toLocaleString('es-CO')} paquetes).</p>}
              </div>
              <div className={tarjeta + ' flex flex-col gap-1'}>
                <b className="pb-1">{incluyeProveedor ? 'Descontado a proveedores este mes' : 'Pérdidas este mes'}</b>
                {incluyeProveedor && (resumenProveedores.length === 0 ? <p className="text-[14px]" style={{ color: C.gris }}>Sin descuentos este mes.</p>
                  : resumenProveedores.map((r, i) => <div key={r.nombre} className="flex justify-between gap-3 py-1.5 text-[14px]" style={{ borderTop: i ? `1px solid ${C.linea}` : 0 }}><span>{r.nombre}</span><b className="tabular-nums">{$(r.total)}</b></div>))}
                <div className="flex justify-between gap-3 py-1.5 text-[14px] mt-1" style={{ borderTop: `1px solid ${C.linea}` }}><span>Pérdidas del negocio</span><b className="tabular-nums" style={{ color: C.rojo }}>{$(resumenPerdidas)}</b></div>
              </div>
            </div>

            <div className={tarjeta + ' flex flex-wrap gap-2 items-center'}>
              <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className="rounded-full px-3 min-h-[38px] text-[13px] font-bold bg-white border" style={{ borderColor: C.linea }} aria-label="Tipo">
                <option value="todos">Todos los tipos</option>
                {tiposDisponibles.map(t => <option key={t.id} value={t.id}>{nombreTipo(t.id)}</option>)}
              </select>
              {incluyeProveedor && (
                <select value={filtroProveedor} onChange={e => setFiltroProveedor(e.target.value)} className="rounded-full px-3 min-h-[38px] text-[13px] font-bold bg-white border" style={{ borderColor: C.linea }} aria-label="Proveedor">
                  <option value="todos">Todos los proveedores</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              )}
              <CampoFecha value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} className="rounded-full px-3 min-h-[38px] text-[13px] bg-white border" style={{ borderColor: C.linea }} aria-label="Desde" />
              <CampoFecha value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} className="rounded-full px-3 min-h-[38px] text-[13px] bg-white border" style={{ borderColor: C.linea }} aria-label="Hasta" />
              <button onClick={() => cargarHistorial(filtroDesde, filtroHasta)} className="px-4 min-h-[38px] rounded-full text-[13px] font-bold" style={{ background: C.suave, color: C.tinta }}>Buscar</button>
            </div>
            {cargandoHistorial ? <p className="text-sm py-10 text-center" style={{ color: C.gris }}>Cargando…</p>
              : historialFiltrado.length === 0 ? <p className="text-sm py-10 text-center" style={{ color: C.gris }}>Sin cambios en ese rango.</p> : (
                <div className={tarjeta + ' flex flex-col py-1.5'}>
                  {historialFiltrado.map((n, i) => (
                    <div data-fila key={n.id} className="py-2.5 flex justify-between gap-3 text-[14px]" style={{ borderTop: i ? `1px solid ${C.linea}` : 0 }}>
                      <span className="min-w-0">
                        <b>{getProducto(n.sku)?.nombre || n.sku}</b> · {n.cantidad} und
                        <span className="block text-[12.5px]" style={{ color: C.gris }}>
                          {fechaCorta(n.fecha)} · {nombreTipo(n.tipo)} · {n.momento === 'en_bodega' ? 'en bodega' : 'en ruta'}{n.vendedores?.nombre ? ` · ${n.vendedores.nombre}` : ''}{n.proveedores?.nombre ? ` · ${n.proveedores.nombre}` : ''}{n.motivo ? ` · ${n.motivo}` : ''}
                        </span>
                        {n.pendiente_reponer && <span className="block text-[12.5px] font-bold" style={{ color: n.repuesto_at ? C.verde : C.ambar }}>{n.repuesto_at ? `Repuesto el ${new Date(n.repuesto_at).toLocaleDateString('es-CO')}${n.repuesto_por ? ` (${n.repuesto_por})` : ''}` : 'Pendiente por reponer'}</span>}
                      </span>
                      {n.valor ? <b className="tabular-nums shrink-0">{$(n.valor)}</b> : null}
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
