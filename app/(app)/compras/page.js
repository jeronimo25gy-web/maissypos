'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { inicioDelRol } from '@/lib/navegacion'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { generarYCompartirPDF } from '@/lib/compartir'
import { puedeVerModulo } from '@/lib/permisos'
import { crearAlertaAdmin } from '@/lib/alertas-admin'
import { calcularStockPorSku } from '@/lib/inventario-helpers'
import Stepper from '@/components/Stepper'
import { PageHeader } from '@/components/ui'
import InputDinero from '@/components/InputDinero'
import { cargarPorPagar } from '@/lib/por-pagar'

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
const esInsumo = (p) => ['materia_prima', 'insumo'].includes(p.tipo)
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
  const [preciosCompra, setPreciosCompra] = useState({})
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
  const [cxpAbonos, setCxpAbonos] = useState({})
  const [valorAbono, setValorAbono] = useState('')
  const [notaAbono, setNotaAbono] = useState('')

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
  const [compartiendo, setCompartiendo] = useState(false)
  const [alertarCambioPrecio, setAlertarCambioPrecio] = useState(true)
  const [modeloProduccion, setModeloProduccion] = useState(false)
  // Por pagar: vencimiento por proveedor (plazo propio o el general) y lo pagado en el mes.
  const [venceInfo, setVenceInfo] = useState({})
  const [pagadoMes, setPagadoMes] = useState({ total: 0, n: 0 })
  const [editandoPlazo, setEditandoPlazo] = useState(null) // { id, dias }
  // Lo que se pago la ultima vez por cada producto de este proveedor.
  const [ultimosPrecios, setUltimosPrecios] = useState({})
  // Sugerido de insumos (Arepas): para cuantos dias se compra.
  const [diasCompra, setDiasCompra] = useState(15)
  const [insumos, setInsumos] = useState([])

  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (!puedeVerModulo(parsed, 'compras', ['admin', 'auxiliar'])) { router.push('/despacho'); return }
    setUsuario(parsed)
    if (parsed.rol === 'admin') { setVista('cuentas'); cargarCuentasPorPagar() }
    cargarProveedores()
    cargarCuentas()
    cargarBorradores()
    cargarProductosNombres()
    cargarConfigAlerta()
  }, [])

  const cargarConfigAlerta = async () => {
    const { data } = await supabase.from('empresas').select('alertar_cambio_precio_compra, modelos').eq('id', getEmpresaId()).maybeSingle()
    setAlertarCambioPrecio(data?.alertar_cambio_precio_compra ?? true)
    setModeloProduccion((data?.modelos || []).includes('produccion'))
  }

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
    cargarUltimosPrecios(prov.id, encab.id)
    setCompraEditId(encab.id)
    setEstadoPrevioCompra(encab.estado)
    setEstadoPago(encab.estado_pago || 'cuenta_por_pagar')
    setCuentaCompraId(encab.cuenta_pago_id || '')
    const { data: prods } = await supabase.from('productos').select('*').eq('proveedor_id', prov.id).eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    const { data: detalle } = await supabase.from('compras').select('sku, cantidad, precio_unitario').eq('compra_id', encab.id)
    const cantidadesPrefill = {}
    const preciosPrefill = {}
    ;(prods || []).forEach(p => { cantidadesPrefill[p.sku] = ''; preciosPrefill[p.sku] = String(p.costo_compra || 0) })
    ;(detalle || []).forEach(d => {
      cantidadesPrefill[d.sku] = String(d.cantidad)
      preciosPrefill[d.sku] = String(d.precio_unitario || 0)
    })
    setProductos(prods || [])
    setCantidades(cantidadesPrefill)
    setPreciosCompra(preciosPrefill)
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
      }).filter(p => !esInsumo(p) && p.tipo !== 'terminado' && (p.cantidadSugerida > 0 || (p.cantidad_sugerida_manual || 0) > 0))

      setSugeridos(calculados)
      // Insumos (materia prima): se compran para varios dias. Lo que se gasta
      // sale de la produccion de las ultimas 4 semanas (cochadas y formulas).
      const mps = todosProductos.filter(esInsumo)
      if (mps.length) {
        const desde = new Date(new Date(obtenerFechaActual() + 'T12:00:00').getTime() - 28 * 864e5).toLocaleDateString('en-CA')
        const [stock, { data: salidas }] = await Promise.all([
          calcularStockPorSku({ empresaId: getEmpresaId() }),
          supabase.from('inventario_mov').select('sku, cantidad, referencia').eq('tipo_movimiento', 'salida').in('sku', mps.map(p => p.sku)).gte('fecha', desde).eq('empresa_id', getEmpresaId()),
        ])
        const gastado = {}
        ;(salidas || []).filter(m => /^(Cochada|Producci)/.test(m.referencia || '')).forEach(m => { gastado[m.sku] = (gastado[m.sku] || 0) + Number(m.cantidad || 0) })
        // 24 dias de trabajo en 4 semanas (sin domingos).
        setInsumos(mps.map(p => ({ ...p, hay: Math.max(0, stock[p.sku]?.stockActual || 0), alDia: (gastado[p.sku] || 0) / 24 })))
      } else setInsumos([])
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
    const hoy = obtenerFechaActual()
    const [deudas, { data: abonosMes }] = await Promise.all([
      cargarPorPagar([getEmpresaId()], hoy).catch(() => []),
      supabase.from('abonos_proveedores').select('valor').gte('fecha', hoy.slice(0, 7) + '-01').lte('fecha', hoy).eq('empresa_id', getEmpresaId()),
    ])
    setVenceInfo(Object.fromEntries(deudas.map(d => [d.proveedor_id, d])))
    setPagadoMes({ total: (abonosMes || []).reduce((s, a) => s + Number(a.valor || 0), 0), n: (abonosMes || []).length })
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
    cargarAbonosProveedor(proveedorId)
  }

  const cargarAbonosProveedor = async (proveedorId) => {
    const { data } = await supabase.from('abonos_proveedores').select('fecha, valor, nota, registrado_por, cuentas(nombre)')
      .eq('proveedor_id', proveedorId).eq('empresa_id', getEmpresaId())
      .order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(30)
    setCxpAbonos(prev => ({ ...prev, [proveedorId]: data || [] }))
  }

  // Abono parcial o pago total (valor = todo el saldo): la funcion de la
  // base registra el abono en el historial, baja el saldo y saca la plata de
  // la cuenta, todo junto.
  const registrarAbonoProveedor = async (proveedorId, total) => {
    const valor = parseFloat(valorAbono) || 0
    if (valor <= 0) { alert('Escribe cuanto se abona'); return }
    if (valor > total) { alert(`El abono no puede ser mayor que lo que se debe ($${total.toLocaleString('es-CO')})`); return }
    if (!cuentaPagoId) { alert('Selecciona de que cuenta sale el pago'); return }
    setPagando(proveedorId)
    const { data: resta, error } = await supabase.rpc('abonar_proveedor', {
      p_proveedor_id: proveedorId,
      p_valor: valor,
      p_cuenta_id: cuentaPagoId,
      p_fecha: obtenerFechaActual(),
      p_nota: notaAbono,
      p_usuario: usuario?.nombre || null,
    })
    if (error) { alert('Error: ' + error.message); setPagando(null); return }
    setPagandoConCuenta(null)
    setCuentaPagoId('')
    setValorAbono('')
    setNotaAbono('')
    await cargarCuentasPorPagar()
    cargarAbonosProveedor(proveedorId)
    setPagando(null)
    if (Number(resta) > 0) alert(`Abono registrado. Queda debiendo $${Number(resta).toLocaleString('es-CO')}.`)
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
    cargarUltimosPrecios(prov.id, null)
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
      const preciosIniciales = {}
      data.forEach(p => { initial[p.sku] = ''; preciosIniciales[p.sku] = String(p.costo_compra || 0) })
      setCantidades(initial)
      setPreciosCompra(preciosIniciales)
    }
  }

  const guardarPlazo = async () => {
    const dias = parseInt(editandoPlazo.dias, 10)
    if (!(dias >= 0)) { alert('Escribe los días de crédito'); return }
    const { error } = await supabase.from('proveedores').update({ dias_credito: dias }).eq('id', editandoPlazo.id).eq('empresa_id', getEmpresaId())
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    setEditandoPlazo(null)
    await cargarProveedores()
    cargarCuentasPorPagar()
  }

  const cargarUltimosPrecios = async (provId, excluirCompraId) => {
    const { data } = await supabase.from('compras').select('sku, precio_unitario, fecha, compra_id')
      .eq('proveedor_id', provId).in('estado', ['confirmada', 'pagada']).eq('empresa_id', getEmpresaId())
      .order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(300)
    const m = {}
    ;(data || []).forEach(c => { if (c.compra_id !== excluirCompraId && !(c.sku in m)) m[c.sku] = { precio: Number(c.precio_unitario || 0), fecha: c.fecha } })
    setUltimosPrecios(m)
  }

  const cambiarProveedor = () => {
    setProveedorSel(null)
    setProductos([])
    setCompraEditId(null)
    setEstadoPrevioCompra(null)
  }

  const precioDe = (p) => {
    const editado = preciosCompra[p.sku]
    return editado !== undefined && editado !== '' ? parseFloat(editado) : (p.costo_compra || 0)
  }

  const totalCompra = () => {
    return productos.reduce((sum, p) => {
      const cant = parseFloat(cantidades[p.sku] || 0)
      return sum + cant * precioDe(p)
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
      const precio = precioDe(p)
      const payload = {
        empresa_id: empresaId, fecha, proveedor_id: proveedorSel.id, compra_id: compraId,
        sku: p.sku, cantidad, precio_unitario: precio, total: cantidad * precio,
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
      // Stock ANTES de que esta compra le sume su entrada -- lo necesita el
      // costo promedio ponderado de abajo (si se calcula despues del RPC, el
      // stock ya incluiria esta misma compra y el promedio saldria mal). Solo
      // hace falta pedirlo si la empresa usa CPP (ver mas abajo).
      const stockPorSkuPrevio = modeloProduccion ? await calcularStockPorSku() : null

      const { error: errEfectos } = await supabase.rpc('aplicar_efectos_compra', {
        p_compra_id: compraId,
        p_proveedor_id: proveedorSel.id,
        p_proveedor_nombre: proveedorSel.nombre,
        p_estado_final: estadoFinal,
        p_total: total,
        p_fecha: fecha,
        p_items: conCantidad.map(p => ({ sku: p.sku, cantidad: parseFloat(cantidades[p.sku]) })),
        p_cuenta_pago_id: estadoFinal === 'pagada' ? cuentaCompraId : null,
      })
      if (errEfectos) alert('La compra se guardo, pero no se pudo aplicar el efecto en inventario, saldo de proveedor o caja: ' + errEfectos.message)

      // El costo de referencia del producto: en empresas con modelo
      // 'produccion' (hoy Arepas Maissy) queda en costo promedio ponderado
      // (CPP) -- si todavia queda stock de la compra anterior a otro precio,
      // se mezcla proporcional a la cantidad de cada uno en vez de botar ese
      // costo. El resto de empresas (Distri Maissy) sigue exactamente igual
      // que siempre: el precio de esta factura pisa el costo anterior.
      const cambiosDeCosto = conCantidad.filter(p => precioDe(p) !== (p.costo_compra || 0))
      for (const p of cambiosDeCosto) {
        let costoNuevo = precioDe(p)
        if (modeloProduccion) {
          const stockPrevio = Math.max(0, stockPorSkuPrevio[p.sku]?.stockActual || 0)
          const cantidadComprada = parseFloat(cantidades[p.sku])
          const costoPrevio = p.costo_compra || 0
          costoNuevo = (stockPrevio + cantidadComprada) > 0
            ? (stockPrevio * costoPrevio + cantidadComprada * precioDe(p)) / (stockPrevio + cantidadComprada)
            : precioDe(p)
        }
        await supabase.from('productos').update({ costo_compra: costoNuevo }).eq('id', p.id).eq('empresa_id', empresaId)
      }

      // Precio editable en Compras = alguien distinto al admin puede cambiar
      // el costo de un producto sin pasar por Maestros. Si la empresa activo
      // la alerta, avisar por Ejecutivo + WhatsApp para que se pida la
      // factura real y se confirme el cambio.
      if (alertarCambioPrecio && cambiosDeCosto.length > 0) {
        const detalleTexto = cambiosDeCosto
          .map(p => `${p.nombre}: de $${(p.costo_compra || 0).toLocaleString('es-CO')} a $${precioDe(p).toLocaleString('es-CO')}`)
          .join('; ')
        await crearAlertaAdmin({
          empresaId,
          tipo: 'cambio_precio_compra',
          mensaje: `${usuario.nombre} registro un precio distinto al del producto en una compra a ${proveedorSel.nombre}: ${detalleTexto}`,
          referenciaTipo: 'compra_encab',
          referenciaId: compraId,
        })
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
  const compartir = async () => {
    setCompartiendo(true)
    try { await generarYCompartirPDF('comprobante-compra-imprimible', `Compra-${obtenerFechaActual()}`) }
    finally { setCompartiendo(false) }
  }

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
          <button onClick={compartir} disabled={compartiendo} className="bg-gray-800 hover:bg-gray-900 text-white px-6 py-2 rounded-lg font-bold text-sm disabled:opacity-50">
            {compartiendo ? 'Generando...' : '📤 Compartir'}
          </button>
        </div>
        <div id="comprobante-compra-imprimible" style={{ padding: '20px', maxWidth: '750px', margin: '0 auto', background: 'white' }}>
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

  // ---------- pantalla (linea de Mi ruta) ----------
  const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', linea: '#E3E1D8', suave: '#EFEDE6', neutro: '#E9E4D6', rojo: '#C41230', rojoF: '#FBE9E9', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8' }
  const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
  const $ = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
  const fechaCorta = (f) => f ? new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }) : ''
  const tarjeta = 'bg-white rounded-[18px] p-3.5 min-w-0'
  const campo = 'w-full rounded-xl px-3 min-h-[42px] text-[14.5px] bg-white border outline-none focus:border-[#1C1B19]'
  const pill = (texto, color, fondo) => <span className="inline-flex items-center text-[12px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap" style={{ color, background: fondo }}>{texto}</span>
  const chip = (activo, onClick, contenido, key) => (
    <button key={key} onClick={onClick} aria-pressed={activo} className="shrink-0 px-3 min-h-[36px] rounded-full text-[13px] font-bold whitespace-nowrap"
      style={activo ? { background: C.tinta, color: '#fff' } : { background: '#fff', color: C.gris }}>{contenido}</button>
  )
  const plazoDe = (prov) => Number(prov?.dias_credito) || venceInfo[prov?.id]?.plazo || 30
  const estadoVence = (info) => {
    if (!info?.vence) return pill('Sin fecha', C.gris, C.suave)
    const d = info.diasParaVencer
    if (d < 0) return pill(`Vencido hace ${-d} día${d === -1 ? '' : 's'}`, C.rojo, C.rojoF)
    if (d === 0) return pill('Vence hoy', C.ambar, C.ambarF)
    if (d <= 7) return pill(`Vence ${fechaCorta(info.vence)}`, C.ambar, C.ambarF)
    return pill(`Próximo: ${fechaCorta(info.vence)}`, C.gris, C.suave)
  }
  const copiarPedido = async (prov, items) => {
    const lineas = items.filter(i => i.cantidad > 0)
    if (!lineas.length) { alert('No hay nada por pedir a este proveedor'); return }
    const texto = [`Hola${prov?.contacto ? ' ' + prov.contacto : ''}, pedido de ${(usuario?.empresa_nombre || 'Maissy')}:`, '', ...lineas.map(i => `• ${i.nombre}${i.presentacion ? ` (${i.presentacion})` : ''}: ${i.cantidad}`), '', 'Gracias.'].join('\n')
    try { await navigator.clipboard.writeText(texto) } catch {}
    const tel = (prov?.telefono || '').replace(/\D/g, '').slice(-10)
    if (tel.length === 10) window.open(`https://wa.me/57${tel}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
    else alert('Pedido copiado. Pégalo en el chat del proveedor.')
  }

  if (guardado) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: C.fondo, color: C.tinta }}>
      <div className="bg-white rounded-[22px] p-7 text-center max-w-md w-full flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: C.verdeF }} aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={C.verde} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
        </div>
        <h2 className="font-extrabold text-[24px]" style={titulo}>Compra confirmada</h2>
        <p style={{ color: C.gris }}>{proveedorSel?.nombre} · {estadoPago === 'pagado_momento' ? 'pagada' : `a crédito, vence ${fechaCorta(new Date(Date.now() + plazoDe(proveedorSel) * 864e5).toLocaleDateString('en-CA'))}`}</p>
        <p className="font-extrabold text-[30px] tabular-nums" style={titulo}>{$(totalCompra())}</p>
        <div className="grid grid-cols-2 gap-2 w-full">
          <button onClick={() => { setProveedorSel(null); setProductos([]); setGuardado(false); setCompraEditId(null); setEstadoPrevioCompra(null) }} className="min-h-[48px] rounded-2xl font-bold text-white" style={{ background: C.tinta }}>Nueva compra</button>
          <button onClick={() => router.push(inicioDelRol())} className="min-h-[48px] rounded-2xl font-bold" style={{ background: C.fondo }}>Ir al inicio</button>
        </div>
      </div>
    </div>
  )

  const totalPorPagar = cuentasPorPagar.reduce((s, g) => s + g.total, 0)
  const infos = cuentasPorPagar.map(g => venceInfo[g.proveedorId]).filter(Boolean)
  const vencido = infos.filter(i => i.diasParaVencer != null && i.diasParaVencer < 0)
  const semana = infos.filter(i => i.diasParaVencer != null && i.diasParaVencer >= 0 && i.diasParaVencer <= 7)
  const listaPagar = [...cuentasPorPagar].sort((a, b) => (venceInfo[a.proveedorId]?.vence || '9').localeCompare(venceInfo[b.proveedorId]?.vence || '9'))
  const deudaCon = (provId) => cuentasPorPagar.find(g => g.proveedorId === provId)?.total || 0
  const pestanas = [['cuentas', 'Por pagar', vencido.length], ['compra', 'Registrar compra', 0], ['sugerido', 'Sugerido de pedido', 0], ['historial', 'Historial', 0]]
  const irA = (v) => { cambiarProveedor(); if (v === 'cuentas') irACuentas(); else if (v === 'sugerido') irASugerido(); else setVista(v) }
  const historialTotal = historialCompras.filter(c => c.estado !== 'borrador').reduce((s, c) => s + (c.total || 0), 0)

  return (
    <div style={{ background: C.fondo, minHeight: '100vh', color: C.tinta }}>
      <PageHeader title="Compras" subtitle={new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })} />
      <div className="p-4 max-w-6xl mx-auto flex flex-col gap-4">
        {!proveedorSel && (
          <div className="flex gap-1 bg-white rounded-full p-1 self-start max-w-full overflow-x-auto" role="tablist">
            {pestanas.map(([v, t, n]) => (
              <button key={v} role="tab" aria-selected={vista === v} onClick={() => irA(v)} className="px-4 min-h-[38px] rounded-full text-[13.5px] font-bold whitespace-nowrap"
                style={vista === v ? { background: C.tinta, color: '#fff' } : { color: C.gris }}>
                {t}{n > 0 && <span className="ml-1.5 text-[11px] font-extrabold rounded-full px-1.5 py-0.5" style={{ background: '#F2B21B', color: C.tinta }}>{n}</span>}
              </button>
            ))}
          </div>
        )}

        {/* ---------- POR PAGAR ---------- */}
        {!proveedorSel && vista === 'cuentas' && (
          cargandoCuentas ? <p className="text-sm py-10 text-center" style={{ color: C.gris }}>Cargando…</p> : (
            <>
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                {[
                  ['Por pagar', $(totalPorPagar), `${cuentasPorPagar.length} proveedor${cuentasPorPagar.length === 1 ? '' : 'es'}`],
                  ['Vencido', $(vencido.reduce((s, i) => s + i.saldo, 0)), vencido.map(i => i.nombre).join(', ') || 'Nada vencido', vencido.length ? C.rojo : null],
                  ['Vence esta semana', $(semana.reduce((s, i) => s + i.saldo, 0)), semana.map(i => i.nombre).join(', ') || 'Nada esta semana'],
                  ['Pagado este mes', $(pagadoMes.total), `${pagadoMes.n} abono${pagadoMes.n === 1 ? '' : 's'}`],
                ].map(([et, va, sub, color]) => (
                  <div key={et} className={tarjeta + ' flex flex-col gap-0.5'}>
                    <span className="text-[12.5px] font-bold" style={{ color: C.gris }}>{et}</span>
                    <span className="font-extrabold text-[24px] tabular-nums leading-tight" style={{ ...titulo, color: color || C.tinta }}>{va}</span>
                    <span className="text-[12.5px] truncate" style={{ color: C.gris }}>{sub}</span>
                  </div>
                ))}
              </div>
              {listaPagar.length === 0 ? <p className="text-sm py-10 text-center" style={{ color: C.gris }}>No se le debe nada a ningún proveedor.</p> : (
                <div className="grid gap-3 md:grid-cols-2 items-start">
                  {listaPagar.map(g => {
                    const info = venceInfo[g.proveedorId]
                    const prov = proveedores.find(p => p.id === g.proveedorId)
                    const atrasado = info?.diasParaVencer < 0
                    return (
                      <article key={g.proveedorId || 'sin'} className={tarjeta + ' flex flex-col gap-2'}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="font-extrabold text-[17px] leading-tight" style={titulo}>{g.nombre}</h3>
                            {prov && (editandoPlazo?.id === prov.id ? (
                              <div className="flex items-center gap-1.5 mt-1">
                                <input type="number" min="0" autoFocus value={editandoPlazo.dias} onChange={e => setEditandoPlazo({ ...editandoPlazo, dias: e.target.value })} aria-label="Días de crédito"
                                  className="w-20 rounded-lg px-2 min-h-[34px] text-center font-bold bg-white border" style={{ borderColor: C.linea }} />
                                <span className="text-[13px]" style={{ color: C.gris }}>días</span>
                                <button onClick={guardarPlazo} className="px-2.5 min-h-[34px] rounded-lg text-[13px] font-bold text-white" style={{ background: C.tinta }}>Guardar</button>
                                <button onClick={() => setEditandoPlazo(null)} className="px-2 min-h-[34px] rounded-lg text-[13px] font-bold" style={{ background: C.suave }}>×</button>
                              </div>
                            ) : (
                              <p className="text-[13px]" style={{ color: C.gris }}>{prov.productos ? prov.productos + ' · ' : ''}plazo {plazoDe(prov)} días{usuario?.rol === 'admin' && <> · <button onClick={() => setEditandoPlazo({ id: prov.id, dias: String(plazoDe(prov)) })} className="underline font-bold">cambiar</button></>}</p>
                            ))}
                          </div>
                          <div className="text-right shrink-0 flex flex-col items-end gap-1">
                            <span className="font-extrabold text-[21px] tabular-nums" style={{ ...titulo, color: atrasado ? C.rojo : C.tinta }}>{$(g.total)}</span>
                            {estadoVence(info)}
                          </div>
                        </div>
                        {info?.desde && <p className="text-[12.5px]" style={{ color: C.gris }}>Lo más viejo sin pagar es la compra del {fechaCorta(info.desde)}.</p>}

                        {cxpExpandido === g.proveedorId && (
                          <div className="flex flex-col gap-2 pt-1" style={{ borderTop: `1px solid ${C.linea}` }}>
                            {!cxpDetalle[g.proveedorId] ? <p className="text-[13px]" style={{ color: C.gris }}>Cargando…</p>
                              : cxpDetalle[g.proveedorId].length === 0 ? <p className="text-[13px]" style={{ color: C.gris }}>Sin compras confirmadas pendientes.</p>
                                : cxpDetalle[g.proveedorId].map(c => (
                                  <div key={c.id} className="rounded-xl px-3 py-2" style={{ background: C.fondo }}>
                                    <div className="flex justify-between text-[13px] font-bold"><span>Compra del {fechaCorta(c.fecha)}</span><span className="tabular-nums">{$(c.total)}</span></div>
                                    {c.items.map(d => <div key={d.sku} className="flex justify-between text-[12.5px]" style={{ color: C.gris }}><span>{productosNombrePorSku[d.sku] || d.sku} x{d.cantidad}</span><span className="tabular-nums">{$(d.total)}</span></div>)}
                                  </div>
                                ))}
                            {(cxpAbonos[g.proveedorId] || []).length > 0 && (
                              <div className="flex flex-col">
                                <span className="text-[12.5px] font-bold mb-1" style={{ color: C.gris }}>Abonos y pagos</span>
                                {cxpAbonos[g.proveedorId].map((a, i) => (
                                  <div key={i} className="flex justify-between gap-3 text-[13px] py-1" style={{ borderTop: i ? `1px solid ${C.linea}` : 0 }}>
                                    <span className="min-w-0" style={{ color: C.gris }}>{fechaCorta(a.fecha)} · {a.cuentas?.nombre || 'Cuenta'}{a.nota ? ` · ${a.nota}` : ''}{a.registrado_por ? ` · ${a.registrado_por}` : ''}</span>
                                    <b className="tabular-nums shrink-0">−{$(a.valor)}</b>
                                  </div>
                                ))}
                              </div>
                            )}
                            {(cxpDescuentos[g.proveedorId] || []).length > 0 && (
                              <div className="flex flex-col">
                                <span className="text-[12.5px] font-bold mb-1" style={{ color: C.gris }}>Descuentos por cambios</span>
                                {cxpDescuentos[g.proveedorId].map((d, i) => (
                                  <div key={i} className="flex justify-between gap-3 text-[13px] py-1"><span style={{ color: C.gris }}>{fechaCorta(d.fecha)} · {productosNombrePorSku[d.sku] || d.sku} x{d.cantidad}{d.motivo ? ` · ${d.motivo}` : ''}</span><b className="tabular-nums" style={{ color: C.rojo }}>−{$(d.valor)}</b></div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {pagandoConCuenta === g.proveedorId && (
                          <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: C.fondo }}>
                            <div className="flex gap-2 items-end">
                              <label className="flex-1 min-w-0 text-[12.5px] font-bold" style={{ color: C.gris }}>Valor
                                <InputDinero value={valorAbono} onChange={e => setValorAbono(e.target.value)} placeholder="0" className={campo + ' font-bold mt-1'} style={{ borderColor: C.linea, color: C.tinta }} />
                              </label>
                              <button type="button" onClick={() => setValorAbono(String(g.total))} className="shrink-0 bg-white px-4 min-h-[42px] rounded-xl text-sm font-bold">Todo</button>
                            </div>
                            <select value={cuentaPagoId} onChange={e => setCuentaPagoId(e.target.value)} className={campo} style={{ borderColor: C.linea }}>
                              <option value="">¿De qué cuenta sale?</option>
                              {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                            <input type="text" value={notaAbono} onChange={e => setNotaAbono(e.target.value)} placeholder="Nota (opcional): transferencia, recibo…" className={campo} style={{ borderColor: C.linea }} />
                            {parseFloat(valorAbono) > 0 && parseFloat(valorAbono) <= g.total && <p className="text-[13px]" style={{ color: C.gris }}>{parseFloat(valorAbono) >= g.total ? 'Queda pagado del todo.' : `Queda debiendo ${$(g.total - parseFloat(valorAbono))}.`} Paga primero la compra más vieja.</p>}
                            <div className="flex gap-2">
                              <button onClick={() => { setPagandoConCuenta(null); setCuentaPagoId(''); setValorAbono(''); setNotaAbono('') }} className="flex-1 bg-white min-h-[44px] rounded-xl text-sm font-bold">Cancelar</button>
                              <button onClick={() => registrarAbonoProveedor(g.proveedorId, g.total)} disabled={pagando === g.proveedorId} className="flex-1 min-h-[44px] rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: C.rojo }}>{pagando === g.proveedorId ? 'Guardando…' : 'Registrar abono'}</button>
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {usuario?.rol === 'admin' && g.proveedorId && pagandoConCuenta !== g.proveedorId && (
                            <button onClick={() => { setPagandoConCuenta(g.proveedorId); setValorAbono(''); setNotaAbono('') }} className="px-3 min-h-[40px] rounded-xl text-[13.5px] font-bold text-white" style={{ background: C.rojo }}>Abonar o pagar</button>
                          )}
                          {g.proveedorId && <button onClick={() => toggleExpandirCxp(g.proveedorId)} className="px-3 min-h-[40px] rounded-xl text-[13.5px] font-bold" style={{ background: C.suave }}>{cxpExpandido === g.proveedorId ? 'Ocultar detalle' : 'Ver compras y abonos'}</button>}
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </>
          )
        )}

        {/* ---------- REGISTRAR: escoger proveedor ---------- */}
        {!proveedorSel && vista === 'compra' && (
          <>
            {borradores.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-[13px] font-bold" style={{ color: C.gris }}>Borradores guardados</span>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {borradores.map(b => (
                    <button key={b.id} onClick={() => cargarBorrador(b.id)} className="rounded-2xl p-3.5 text-left flex justify-between items-center gap-3 border-[1.5px] border-dashed bg-white" style={{ borderColor: C.linea }}>
                      <span><b className="block">{b.proveedores?.nombre}</b><span className="text-[12.5px]" style={{ color: C.gris }}>{fechaCorta(b.fecha)} · {$(b.total)}</span></span>
                      <span className="text-[13px] font-bold" style={{ color: C.rojo }}>Continuar</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <span className="text-[13px] font-bold" style={{ color: C.gris }}>¿A quién le compraste?</span>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {proveedores.map(p => (
                <button key={p.id} onClick={() => seleccionarProveedor(p)} className={tarjeta + ' text-left flex justify-between items-center gap-3 hover:ring-2 hover:ring-[#1C1B19]/10'}>
                  <span className="min-w-0"><b className="block text-[16px] leading-tight" style={titulo}>{p.nombre}</b><span className="block text-[12.5px] truncate" style={{ color: C.gris }}>{p.productos || 'Sin productos anotados'}</span></span>
                  {deudaCon(p.id) > 0 && <span className="text-[12.5px] font-bold shrink-0 tabular-nums" style={{ color: C.gris }}>Debes {$(deudaCon(p.id))}</span>}
                </button>
              ))}
            </div>
          </>
        )}

        {/* ---------- REGISTRAR: la compra ---------- */}
        {proveedorSel && (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="font-extrabold text-[24px] leading-tight" style={titulo}>{proveedorSel.nombre}</h1>
                <p style={{ color: C.gris }}>{compraEditId ? 'Borrador · ' : ''}¿Qué llegó?{deudaCon(proveedorSel.id) > 0 ? ` · le debes ${$(deudaCon(proveedorSel.id))}` : ''}</p>
              </div>
              <button onClick={cambiarProveedor} className="px-3 min-h-[38px] rounded-xl text-[13px] font-bold bg-white">Cambiar proveedor</button>
            </div>
            {productos.length === 0 ? (
              <div className={tarjeta + ' text-center py-8'}><p style={{ color: C.gris }}>Este proveedor no tiene productos asignados. Asígnaselos en Maestros.</p></div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
                <div className={tarjeta + ' flex flex-col'}>
                  <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_140px_90px_110px] gap-2 text-[11.5px] uppercase tracking-wide font-bold pb-1" style={{ color: C.gris }}>
                    <span>Producto</span><span>Precio</span><span className="text-center">Cantidad</span><span className="text-right">Subtotal</span>
                  </div>
                  {productos.map((p, i) => {
                    const ult = ultimosPrecios[p.sku]
                    const precio = precioDe(p)
                    const cambio = ult && precio && Math.abs(precio - ult.precio) >= 1 ? precio - ult.precio : 0
                    const cant = parseFloat(cantidades[p.sku] || 0)
                    return (
                      <div key={p.sku} className="py-2.5 flex flex-col gap-1" style={{ borderTop: i ? `1px solid ${C.linea}` : 0 }}>
                        <div className="grid grid-cols-[minmax(0,1fr)_120px_76px] sm:grid-cols-[minmax(0,1fr)_140px_90px_110px] gap-2 items-center">
                          <div className="min-w-0 leading-tight">
                            <b className="block text-[14.5px]">{p.nombre}</b>
                            <span className="text-[12px]" style={{ color: C.gris }}>{[p.presentacion, ult ? `la última vez ${$(ult.precio)}` : 'primera compra'].filter(Boolean).join(' · ')}</span>
                          </div>
                          <InputDinero value={preciosCompra[p.sku] ?? ''} onChange={e => setPreciosCompra(prev => ({ ...prev, [p.sku]: e.target.value }))} placeholder="$0" aria-label={`Precio ${p.nombre}`}
                            className={campo + ' font-bold text-right'} style={{ borderColor: cambio ? '#F2B21B' : C.linea }} />
                          <input type="number" min="0" inputMode="decimal" value={cantidades[p.sku]} placeholder="0" aria-label={`Cantidad ${p.nombre}`} onChange={e => setCantidades(prev => ({ ...prev, [p.sku]: e.target.value }))}
                            className={campo + ' font-bold text-center'} style={{ borderColor: C.linea }} />
                          <b className="hidden sm:block text-right tabular-nums" style={{ color: cant > 0 ? C.tinta : C.gris }}>{cant > 0 ? $(cant * precio) : '—'}</b>
                        </div>
                        {cambio !== 0 && <p className="text-[12.5px] font-bold" style={{ color: cambio > 0 ? C.ambar : C.verde }}>{cambio > 0 ? 'Subió' : 'Bajó'} {$(Math.abs(cambio))} ({Math.round(Math.abs(cambio) / ult.precio * 100)}%) frente a la compra del {fechaCorta(ult.fecha)}</p>}
                      </div>
                    )
                  })}
                </div>

                <aside className="lg:sticky lg:top-24 flex flex-col gap-2">
                  <div className={tarjeta + ' flex flex-col gap-2.5'}>
                    <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: C.gris }}>Total de la compra</span>
                    <span className="font-extrabold text-[30px] tabular-nums leading-tight" style={titulo}>{$(totalCompra())}</span>
                    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Cómo se paga">
                      {[['cuenta_por_pagar', 'A crédito', `Vence ${fechaCorta(new Date(new Date(obtenerFechaActual() + 'T12:00:00').getTime() + plazoDe(proveedorSel) * 864e5).toLocaleDateString('en-CA'))}`], ['pagado_momento', 'Pagada ya', 'Escoges la cuenta']].map(([id, t, sub]) => (
                        <button key={id} onClick={() => setEstadoPago(id)} aria-pressed={estadoPago === id} className="rounded-2xl px-3 py-2 text-left min-h-[58px] border-[1.5px] bg-white"
                          style={{ borderColor: estadoPago === id ? C.tinta : C.linea, boxShadow: estadoPago === id ? `inset 0 0 0 1px ${C.tinta}` : 'none' }}>
                          <b className="block text-[14px]">{t}</b><span className="text-[12px]" style={{ color: C.gris }}>{sub}</span>
                        </button>
                      ))}
                    </div>
                    {estadoPago === 'pagado_momento' && (
                      <select value={cuentaCompraId} onChange={e => setCuentaCompraId(e.target.value)} className={campo} style={{ borderColor: C.linea }}>
                        <option value="">¿De qué cuenta salió?</option>
                        {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    )}
                    <button onClick={() => guardarCompra(estadoPago === 'pagado_momento' ? 'pagada' : 'confirmada')} disabled={guardando} className="min-h-[50px] rounded-2xl font-bold text-white disabled:opacity-50" style={{ background: C.rojo }}>{guardando ? 'Guardando…' : 'Confirmar compra'}</button>
                    <button onClick={() => guardarCompra('borrador')} disabled={guardando} className="min-h-[44px] rounded-2xl font-bold disabled:opacity-50" style={{ background: C.suave }}>Guardar borrador</button>
                    <p className="text-[12px]" style={{ color: C.gris }}>Al confirmar entra al inventario{estadoPago === 'pagado_momento' ? ' y sale la plata de la cuenta' : ' y suma a lo que se le debe al proveedor'}.</p>
                  </div>
                </aside>
              </div>
            )}
          </>
        )}

        {/* ---------- SUGERIDO ---------- */}
        {!proveedorSel && vista === 'sugerido' && (
          cargandoSugerido ? <p className="text-sm py-10 text-center" style={{ color: C.gris }}>Calculando…</p> : (
            <>
              {insumos.length > 0 && (() => {
                const filas = insumos.map(p => {
                  const alcanza = p.alDia > 0 ? p.hay / p.alDia : null
                  const sugerido = Math.max(0, Math.ceil(p.alDia * diasCompra + (p.stock_minimo || 0) - p.hay))
                  const pedir = cantidadesEditadas['mp:' + p.sku] ?? String(sugerido)
                  return { ...p, alcanza, pedir }
                })
                const porProv = {}
                filas.forEach(f => { const k = f.proveedor_id || 'sin'; (porProv[k] = porProv[k] || []).push(f) })
                const hoyD = new Date(obtenerFechaActual() + 'T12:00:00')
                return (
                  <section className="flex flex-col gap-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="font-extrabold text-[19px]" style={titulo}>Insumos · para cuántos días alcanza</h2>
                        <p className="text-[13px]" style={{ color: C.gris }}>Lo que se gasta sale de la producción de las últimas 4 semanas: el maíz por las cochadas y lo demás por la fórmula de cada producto.</p>
                      </div>
                      <div className="flex gap-1.5 items-center"><span className="text-[13px] font-bold" style={{ color: C.gris }}>Comprar para</span>{[7, 15, 30].map(d => chip(diasCompra === d, () => { setDiasCompra(d); setCantidadesEditadas(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith('mp:')))) }, `${d} días`, d))}</div>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2 items-start">
                      {Object.entries(porProv).map(([provId, items]) => {
                        const prov = proveedores.find(p => p.id === provId)
                        return (
                          <article key={provId} className={tarjeta + ' flex flex-col gap-1'}>
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <h3 className="font-extrabold text-[16px]" style={titulo}>{prov?.nombre || 'Sin proveedor asignado'}</h3>
                              {prov && <button onClick={() => copiarPedido(prov, items.map(i => ({ nombre: i.nombre, presentacion: i.presentacion, cantidad: parseFloat(i.pedir) || 0 })))} className="px-3 min-h-[36px] rounded-xl text-[13px] font-bold text-white" style={{ background: C.tinta }}>Pedir por WhatsApp</button>}
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-[14px] tabular-nums" style={{ minWidth: 460 }}>
                                <thead><tr className="text-[11.5px] uppercase tracking-wide" style={{ color: C.gris }}><th className="text-left font-bold py-1.5">Insumo</th><th className="font-bold">Hay</th><th className="font-bold">Gasta/día</th><th className="font-bold">Alcanza</th><th className="font-bold">Pedir</th></tr></thead>
                                <tbody>
                                  {items.map(f => {
                                    const fin = f.alcanza != null ? new Date(hoyD.getTime() + Math.floor(f.alcanza) * 864e5) : null
                                    return (
                                      <tr key={f.sku} style={{ borderTop: `1px solid ${C.linea}` }}>
                                        <td className="py-2 pr-2"><b className="block leading-tight">{f.nombre}</b><span className="text-[12px]" style={{ color: C.gris }}>{f.presentacion}</span></td>
                                        <td className="text-center">{Math.round(f.hay * 10) / 10}</td>
                                        <td className="text-center">{f.alDia ? (Math.round(f.alDia * 10) / 10).toLocaleString('es-CO') : '—'}</td>
                                        <td className="text-center">{f.alcanza == null ? pill('Sin consumo', C.gris, C.suave) : f.alcanza < 4 ? pill(`${Math.floor(f.alcanza)} días · ${fin.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' })}`, C.rojo, C.rojoF) : f.alcanza < 10 ? pill(`${Math.floor(f.alcanza)} días`, C.ambar, C.ambarF) : pill(`${Math.floor(f.alcanza)} días`, C.verde, C.verdeF)}</td>
                                        <td className="text-center px-1"><input type="number" min="0" value={f.pedir} onChange={e => setCantidadesEditadas(prev => ({ ...prev, ['mp:' + f.sku]: e.target.value }))} aria-label={`Pedir ${f.nombre}`} className="w-20 text-center rounded-xl min-h-[38px] font-bold bg-white border" style={{ borderColor: C.linea }} /></td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </section>
                )
              })()}

              {(sugeridos.length > 0 || insumos.length === 0) && (
                <section className="flex flex-col gap-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="font-extrabold text-[19px]" style={titulo}>{insumos.length > 0 ? 'Productos de reventa · por día' : 'Por día de la semana'}</h2>
                      <p className="text-[13px]" style={{ color: C.gris }}>Según lo vendido ese día en las últimas 4 semanas y el stock mínimo.</p>
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto">{DIAS_SEMANA.filter(d => d.id !== 0).map(d => chip(diaSemana === d.id, () => cambiarDiaSugerido(d.id), d.nombre.slice(0, 3), d.id))}</div>
                  </div>
                  {sugeridos.length === 0 ? <p className="text-sm py-6 text-center" style={{ color: C.gris }}>No hay nada por pedir según el stock mínimo y lo vendido.</p> : (
                    <div className="grid gap-3 lg:grid-cols-2 items-start">
                      {Object.entries(grupoPorProveedor()).map(([nombreProv, items]) => {
                        const prov = proveedores.find(p => p.nombre === nombreProv)
                        return (
                          <article key={nombreProv} className={tarjeta + ' flex flex-col gap-1'}>
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <h3 className="font-extrabold text-[16px]" style={titulo}>{nombreProv}</h3>
                              {prov && <button onClick={() => copiarPedido(prov, items.map(p => ({ nombre: p.nombre, presentacion: p.presentacion, cantidad: parseFloat(cantidadesEditadas[p.sku] ?? p.cantidadSugerida) || 0 })))} className="px-3 min-h-[36px] rounded-xl text-[13px] font-bold text-white" style={{ background: C.tinta }}>Pedir por WhatsApp</button>}
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-[14px] tabular-nums" style={{ minWidth: 520 }}>
                                <thead><tr className="text-[11.5px] uppercase tracking-wide" style={{ color: C.gris }}><th className="text-left font-bold py-1.5">Producto</th><th className="font-bold">Stock</th><th className="font-bold">Mínimo</th><th className="font-bold">Prom. día</th><th className="font-bold">Base</th><th className="font-bold">Pedir</th></tr></thead>
                                <tbody>
                                  {items.map(p => (
                                    <tr key={p.sku} style={{ borderTop: `1px solid ${C.linea}` }}>
                                      <td className="py-2 pr-2">
                                        <b className="block leading-tight">{p.nombre}</b>
                                        <span className="text-[12px]" style={{ color: C.gris }}>{p.presentacion}</span>
                                        {p.ventasPorRuta.length > 0 && <button onClick={() => setExpandidoSku(expandidoSku === p.sku ? null : p.sku)} className="block text-[12px] font-bold underline" style={{ color: C.gris }}>{expandidoSku === p.sku ? 'Ocultar por ruta' : 'Ver por ruta'}</button>}
                                        {expandidoSku === p.sku && p.ventasPorRuta.map(([ruta, cant]) => <span key={ruta} className="block text-[12px]" style={{ color: C.gris }}>{ruta}: <b>{cant}</b></span>)}
                                      </td>
                                      <td className="text-center" style={{ color: p.stockActual < (p.stock_minimo || 0) ? C.rojo : C.tinta, fontWeight: p.stockActual < (p.stock_minimo || 0) ? 700 : 400 }}>{p.stockActual}</td>
                                      <td className="text-center">{p.stock_minimo || 0}</td>
                                      <td className="text-center">{p.promedioVentas}</td>
                                      <td className="text-center px-1"><input type="number" min="0" placeholder="—" value={basesManuales[p.sku] ?? ''} onChange={e => setBasesManuales(prev => ({ ...prev, [p.sku]: e.target.value }))} onBlur={e => guardarBaseManual(p.id, e.target.value)} aria-label={`Base manual ${p.nombre}`} className="w-16 text-center rounded-xl min-h-[38px] bg-white border" style={{ borderColor: C.linea }} /></td>
                                      <td className="text-center px-1"><input type="number" min="0" value={cantidadesEditadas[p.sku] ?? p.cantidadSugerida} onChange={e => setCantidadesEditadas(prev => ({ ...prev, [p.sku]: e.target.value }))} aria-label={`Pedir ${p.nombre}`} className="w-20 text-center rounded-xl min-h-[38px] font-bold bg-white border" style={{ borderColor: C.linea }} /></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </section>
              )}
            </>
          )
        )}

        {/* ---------- HISTORIAL ---------- */}
        {!proveedorSel && vista === 'historial' && (
          <>
            <div className="flex flex-wrap gap-2 items-center justify-between">
              <select value={historialProveedor} onChange={e => setHistorialProveedor(e.target.value)} className="bg-white rounded-full px-4 min-h-[38px] text-[13.5px] font-bold outline-none" style={{ color: C.tinta }} aria-label="Proveedor">
                <option value="">Todos los proveedores</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <div className="flex gap-1.5">{[['semana', 'Semana'], ['mes', 'Mes'], ['año', 'Año']].map(([id, t]) => chip(historialPeriodo === id, () => setHistorialPeriodo(id), t, id))}</div>
            </div>
            <div className={tarjeta + ' flex flex-wrap justify-between items-center gap-3'}>
              <div>
                <span className="text-[13px] font-bold" style={{ color: C.gris }}>{historialProveedor ? proveedores.find(p => p.id === historialProveedor)?.nombre : 'Todos los proveedores'} · {{ semana: 'última semana', mes: 'último mes', año: 'último año' }[historialPeriodo]}</span>
                <span className="block"><b className="font-extrabold text-[24px] tabular-nums" style={titulo}>{$(historialTotal)}</b> <span className="text-[13px]" style={{ color: C.gris }}>· {historialCompras.filter(c => c.estado !== 'borrador').length} compras</span></span>
              </div>
              {historialProveedor && historialCompras.some(c => c.estado !== 'borrador') && (
                <button onClick={() => setImprimiendo({ tipo: 'proveedor', proveedor: proveedores.find(p => p.id === historialProveedor), compras: historialCompras.filter(c => c.estado !== 'borrador'), periodo: historialPeriodo })}
                  className="px-4 min-h-[40px] rounded-xl text-[13.5px] font-bold text-white" style={{ background: C.tinta }}>Imprimir el rango</button>
              )}
            </div>
            {cargandoHistorial ? <p className="text-sm py-10 text-center" style={{ color: C.gris }}>Cargando…</p>
              : historialCompras.length === 0 ? <p className="text-sm py-10 text-center" style={{ color: C.gris }}>No hay compras en este periodo.</p> : (
                <div className={tarjeta + ' flex flex-col py-1.5'}>
                  {historialCompras.map((c, i) => (
                    <div key={c.id} style={{ borderTop: i ? `1px solid ${C.linea}` : 0 }}>
                      <button onClick={() => toggleExpandirHistorial(c)} className="w-full py-2.5 grid grid-cols-[84px_minmax(0,1fr)_auto_auto] gap-3 items-center text-left text-[14px]">
                        <b className="tabular-nums">{fechaCorta(c.fecha)}</b>
                        <span className="truncate" style={{ color: historialProveedor ? C.gris : C.tinta }}>{historialProveedor ? '' : c.proveedores?.nombre}</span>
                        {c.estado === 'borrador' ? pill('Borrador', C.gris, C.suave) : c.estado === 'pagada' || c.estado_pago === 'pagado_momento' ? pill('Pagada', C.verde, C.verdeF) : pill('A crédito', C.ambar, C.ambarF)}
                        <b className="tabular-nums text-right">{$(c.total)}</b>
                      </button>
                      {historialExpandido === c.id && (
                        <div className="pb-3 flex flex-col gap-1">
                          {(historialDetalle[c.id] || []).map(d => (
                            <div key={d.sku} className="flex justify-between text-[13px]" style={{ color: C.gris }}><span>{productosNombrePorSku[d.sku] || d.sku} x{d.cantidad} · {$(d.precio_unitario)}</span><b className="tabular-nums" style={{ color: C.tinta }}>{$(d.total)}</b></div>
                          ))}
                          <button onClick={() => prepararImprimirCompra(c)} className="self-start mt-1 px-3 min-h-[34px] rounded-lg text-[13px] font-bold" style={{ background: C.suave }}>Imprimir esta compra</button>
                        </div>
                      )}
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
