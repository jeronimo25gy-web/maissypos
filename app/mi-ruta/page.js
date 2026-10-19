'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { cerrarSesionUsuario, sesionVigente } from '@/lib/sesion'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { conObsequiosRestados } from '@/lib/ventas-helpers'
import { DIAS, linkComoLlegar } from '@/lib/rutero'
import { ordenarPorDespacho } from '@/lib/orden-productos'
import { Vender, Ticket } from './Vender'
import BurbujaDomicilios from './Domicilios'
import Cerrar from './Cerrar'
import PuntoVenta from './PuntoVenta'
import InputDinero from '@/components/InputDinero'
import { REF_PAGO_CREDITO } from '@/components/ComprobantesTransferencia'
import { anotarEnCurso, leerEnCurso } from '@/lib/borrador-ruta'
import { subirSoporte } from '@/lib/soportes'
import { ubicacionActual } from '@/lib/ubicacion'
import { cargarPromos, promoVigente, precioConPromo } from '@/lib/promociones'

// Inicio del vendedor: su ruta como dashboard (venta contra meta, cartera,
// vehiculo), el rutero del dia (ficha completa de cada cliente, organizar el
// orden, agregar clientes en cualquier puesto, vender con ticket y marcar quien
// no compro) y el cierre del dia (Cerrar mi ruta, antes el kiosco). Los puntos
// de venta (carros parqueados) usan el rutero para sus puntos del dia y anotan
// transferencias y fiados.
const fmt = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO')
const diaDeHoy = () => { const d = new Date(obtenerFechaActual() + 'T12:00:00').getDay(); return d === 0 ? 1 : d }
const iniciales = (n) => (n || '').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()
const soloDigitos = (t) => (t || '').replace(/\D/g, '')
// Debajo del nombre: lo que el nombre no dice ya (muchos importados se llaman
// "Carrera 93A#36-39 · Primer Piso"), y siempre el barrio.
const lineaDireccion = (c) => {
  const n = (c.nombre || '').toLowerCase()
  return [c.edificio, c.apto, c.direccion].filter(p => p && !n.includes(p.toLowerCase())).concat(c.barrio ? [c.barrio] : []).join(' · ')
}
const mapa = linkComoLlegar
const VACIO = { nombre: '', edificio: '', direccion: '', apto: '', barrio: '', telefono: '', notas: '' }
// Fecha del proximo dia de la semana d (1 lunes ... 6 sabado), hoy incluido.
const fechaDeDia = (d) => {
  const base = new Date(obtenerFechaActual() + 'T12:00:00')
  base.setDate(base.getDate() + ((d - base.getDay() + 7) % 7))
  return base.toLocaleDateString('en-CA')
}
const fechaCortaDe = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' })
// Proximos 6 dias de ruta (sin domingos), para reprogramar.
const proximosDias = () => {
  const out = []
  const d = new Date(obtenerFechaActual() + 'T12:00:00')
  while (out.length < 6) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0) out.push(d.toLocaleDateString('en-CA')) }
  return out
}

const TINTA = '#1C1B19', GRIS = '#5A5750', FONDO = '#F3F1EA', LINEA = '#E3E1D8'
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }

export default function MiRuta() {
  const router = useRouter()
  const [usuario, setUsuario] = useState(null)
  const [vendedor, setVendedor] = useState(null)
  const [datos, setDatos] = useState(null)
  const [dia, setDia] = useState(diaDeHoy())
  const [rutero, setRutero] = useState([])
  const [vista, setVista] = useState('inicio') // inicio | rutero | cuenta | venta | ticket
  const [carro, setCarro] = useState({ despachoId: null, productos: [] })
  const [visitas, setVisitas] = useState({}) // cliente_id -> { resultado, total } de hoy
  const [empresa, setEmpresa] = useState(null)
  const [todos, setTodos] = useState([]) // clientes de la ruta, para vender a uno de otro dia
  const [clienteVenta, setClienteVenta] = useState(null)
  const [ticket, setTicket] = useState(null)
  const [sacar, setSacar] = useState(null) // { c, motivo, detalle, todos }
  const [pedidosSacar, setPedidosSacar] = useState(new Set()) // clientes que ya pidio sacar
  const [preciosCliente, setPreciosCliente] = useState({}) // cliente_id -> { sku: precio pactado }
  const [reprog, setReprog] = useState([]) // visitas reprogramadas para el dia que se esta viendo
  const [reprogramar, setReprogramar] = useState(null) // { c, fecha, nota }
  const [abono, setAbono] = useState(null) // { c, valor, forma, foto, error }
  const [abonosHoy, setAbonosHoy] = useState({}) // cartera_fiados_id -> lo abonado hoy (sin aprobar)
  const [domicilios, setDomicilios] = useState([]) // pendientes de la ruta
  const [avisoDom, setAvisoDom] = useState(null) // el ultimo que entro
  const [domEnVenta, setDomEnVenta] = useState(null) // el que se esta entregando
  const domConocidos = useRef(null)
  const [buscar, setBuscar] = useState('')
  const [abierto, setAbierto] = useState(null)
  const [orden, setOrden] = useState(null) // copia del rutero mientras se organiza
  const [ficha, setFicha] = useState(null) // { id?, puesto, campos }
  const [guardando, setGuardando] = useState(false)
  const [clave, setClave] = useState({ nueva: '', repetir: '', msg: '' })

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (parsed.rol !== 'vendedor') { router.push('/despacho'); return }
    sesionVigente().then(ok => { if (!ok) router.replace('/') })
    setUsuario(parsed)
    cargar(parsed)
  }, [])

  // Mientras Mi ruta esta abierta, la posicion del vendedor cada 3 minutos
  // (para ver en Rutas donde va). Con la pantalla apagada el celular no la manda.
  useEffect(() => {
    if (!vendedor?.ruta_id) return
    const mandar = async () => {
      if (document.visibilityState !== 'visible') return
      const g = await ubicacionActual(10000)
      if (g.lat == null) return
      supabase.from('ubicaciones_ruta').insert({ empresa_id: getEmpresaId(), vendedor_id: vendedor.id, ruta_id: vendedor.ruta_id, fecha: obtenerFechaActual(), ...g }).then(() => {})
    }
    mandar()
    const t = setInterval(mandar, 180000)
    cargarDomicilios(vendedor.ruta_id)
    const td = setInterval(() => { if (document.visibilityState === 'visible') cargarDomicilios(vendedor.ruta_id) }, 60000)
    return () => { clearInterval(t); clearInterval(td) }
  }, [vendedor])

  // Domicilios pendientes de la ruta; si entra uno nuevo, sale el aviso.
  const cargarDomicilios = async (rutaId) => {
    const { data } = await supabase.from('domicilios').select('*, domicilios_detalle(sku, nombre, cantidad, subtotal)')
      .eq('ruta_id', rutaId).eq('estado', 'pendiente').lte('fecha', obtenerFechaActual()).eq('empresa_id', getEmpresaId())
      .order('hora_limite', { ascending: true, nullsFirst: false }).order('created_at')
    const lista = data || []
    if (domConocidos.current) {
      const nuevos = lista.filter(d => !domConocidos.current.has(d.id))
      if (nuevos.length) setAvisoDom(nuevos[nuevos.length - 1])
    }
    domConocidos.current = new Set(lista.map(d => d.id))
    setDomicilios(lista)
  }

  const entregarDomicilio = (d) => {
    setDomEnVenta(d)
    setAvisoDom(null)
    abrirVenta({ id: d.cliente_id, nombre: d.nombre_cliente, telefono: d.telefono, direccion: d.direccion, edificio: d.edificio, apto: d.apto, barrio: d.barrio, frecuencia_dias: 7 })
  }

  const domicilioNoSePudo = async (d, motivo) => {
    const { error } = await supabase.from('domicilios').update({ estado: 'no_entregado', motivo, resuelto_at: new Date().toISOString() }).eq('id', d.id).eq('empresa_id', getEmpresaId())
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    cargarDomicilios(vendedor.ruta_id)
  }

  const cargar = async (u) => {
    const empresaId = getEmpresaId()
    const { data: vend } = await supabase.from('vendedores').select('id, nombre, ruta_id, telefono, rutas(id, nombre, tipo)')
      .eq('nombre', u.vendedor_nombre || u.nombre || '').eq('empresa_id', empresaId).maybeSingle()
    setVendedor(vend || null)
    if (!vend?.ruta_id) { setDatos({ sinRuta: true }); return }
    const hoy = obtenerFechaActual()
    const mes = hoy.slice(0, 7)
    const inicio = mes + '-01'
    const [{ data: vehs }, { data: cartera }, { data: desp }, { data: meta }, { data: pendientes }] = await Promise.all([
      supabase.from('vehiculos').select('placa, marca, modelo, kilometraje_actual').eq('ruta_id', vend.ruta_id).eq('empresa_id', empresaId),
      supabase.from('cartera_fiados').select('id, nombre_cliente, cliente_id, saldo, fecha_pago, fecha_fiado').eq('ruta_id', vend.ruta_id).eq('estado', 'pendiente').eq('empresa_id', empresaId).order('fecha_pago', { ascending: true, nullsFirst: false }),
      supabase.from('despachos_encab').select('id').eq('vendedor_id', vend.id).gte('fecha', inicio).lte('fecha', hoy).eq('empresa_id', empresaId),
      supabase.from('metas_ventas').select('meta').eq('ruta_id', vend.ruta_id).eq('mes', mes).eq('empresa_id', empresaId).maybeSingle(),
      supabase.from('despachos_encab').select('id, fecha, estado, rutas(nombre)').eq('vendedor_id', vend.id).in('estado', ['despachado', 'por_aprobar']).eq('empresa_id', empresaId),
    ])
    const ids = new Set((desp || []).map(d => d.id))
    let venta = 0
    if (ids.size > 0) {
      const { data: liq } = await supabase.from('liquidaciones').select('despacho_id, efectivo_esperado').in('despacho_id', [...ids]).eq('empresa_id', empresaId)
      const filas = await conObsequiosRestados(liq || [], { desde: inicio, hasta: hoy })
      venta = filas.filter(l => ids.has(l.despacho_id)).reduce((s, l) => s + (l.efectivo_esperado || 0), 0)
    }
    setDatos({
      vehiculo: (vehs || [])[0] || null,
      venta, meta: meta?.meta || 0,
      cartera: cartera || [],
      carteraTotal: (cartera || []).reduce((s, f) => s + (f.saldo || 0), 0),
      cobrarHoy: (cartera || []).filter(f => f.fecha_pago && f.fecha_pago <= hoy),
      porLiquidar: pendientes || [],
    })
    cargarRutero(vend.ruta_id, dia)
    cargarCarro(vend)
    cargarVisitas(vend.ruta_id)
    const [{ data: emp }, { data: cls }] = await Promise.all([
      supabase.from('empresas').select('nombre, nit, telefono, logo_url').eq('id', empresaId).maybeSingle(),
      supabase.from('clientes').select('id, nombre, telefono, direccion, apto, edificio, barrio, notas, frecuencia_dias').eq('ruta_id', vend.ruta_id).eq('estado', true).eq('empresa_id', empresaId).order('nombre'),
    ])
    setEmpresa(emp || { nombre: 'Maissy' })
    setTodos(cls || [])
    const { data: pc } = await supabase.from('clientes_precios').select('cliente_id, sku, precio_especial').eq('empresa_id', empresaId)
    const mp = {}
    ;(pc || []).forEach(x => { (mp[x.cliente_id] = mp[x.cliente_id] || {})[x.sku] = Number(x.precio_especial) })
    setPreciosCliente(mp)
  }

  // Lo que lleva en el carro: su despacho abierto mas reciente (si son varios
  // del mismo dia se suman; las ventas quedan en el primero, como en Liquidacion)
  // menos lo que ya vendio con ticket.
  const cargarCarro = async (vend) => {
    const empresaId = getEmpresaId()
    const { data: abiertos } = await supabase.from('despachos_encab').select('id, fecha, created_at')
      .eq('vendedor_id', vend.id).eq('estado', 'despachado').eq('empresa_id', empresaId)
      .order('fecha', { ascending: false }).order('created_at', { ascending: true })
    if (!abiertos?.length) { setCarro({ despachoId: null, productos: [] }); return }
    const ids = abiertos.filter(d => d.fecha === abiertos[0].fecha).map(d => d.id)
    const [{ data: det }, { data: prods }, { data: precios }, { data: vendidas }] = await Promise.all([
      supabase.from('despachos_detalle').select('sku, total').in('despacho_id', ids).eq('empresa_id', empresaId),
      supabase.from('productos').select('sku, nombre, precio_venta, orden_despacho').eq('empresa_id', empresaId),
      supabase.from('rutas_precios').select('sku, precio_especial').eq('ruta_id', vend.ruta_id).eq('empresa_id', empresaId),
      supabase.from('ventas_ruta').select('ventas_ruta_detalle(sku, cantidad)').in('despacho_id', ids).eq('estado', 'activa').eq('empresa_id', empresaId),
    ])
    const llevo = {}
    ;(det || []).forEach(d => { llevo[d.sku] = (llevo[d.sku] || 0) + Number(d.total || 0) })
    const vendido = {}
    ;(vendidas || []).forEach(v => (v.ventas_ruta_detalle || []).forEach(l => { vendido[l.sku] = (vendido[l.sku] || 0) + Number(l.cantidad || 0) }))
    const especial = Object.fromEntries((precios || []).map(p => [p.sku, p.precio_especial]))
    const promos = await cargarPromos(empresaId)
    const hoy = obtenerFechaActual()
    const productos = (prods || []).filter(p => llevo[p.sku] > 0).map(p => {
      const promo = promoVigente(promos, p.sku, vend.ruta_id, hoy, { sinFecha: true })
      return { ...p, promo, precio: precioConPromo(Number(especial[p.sku] ?? p.precio_venta ?? 0), promo), quedan: llevo[p.sku] - (vendido[p.sku] || 0) }
    })
    setCarro({ despachoId: ids[0], productos: ordenarPorDespacho(productos) })
    cargarAbonosHoy(ids[0])
  }

  // Abonos a creditos que el vendedor ya anoto hoy (llegan solos al cierre).
  const cargarAbonosHoy = async (despachoId) => {
    const b = await leerEnCurso(despachoId)
    const m = {}
    ;(b?.datos?.pagosFiados || []).forEach(p => { if (p.cartera_fiados_id) m[p.cartera_fiados_id] = (m[p.cartera_fiados_id] || 0) + (parseFloat(p.valor) || 0) })
    setAbonosHoy(m)
  }

  const creditosDe = (c) => (datos?.cartera || [])
    .filter(f => f.cliente_id ? f.cliente_id === c.id : (f.nombre_cliente || '').trim().toLowerCase() === (c.nombre || '').trim().toLowerCase())
    .sort((a, b) => (a.fecha_pago || a.fecha_fiado || '').localeCompare(b.fecha_pago || b.fecha_fiado || ''))

  // El abono paga primero el credito mas viejo. Se anota en el cierre del dia;
  // la cartera baja cuando el encargado aprueba la liquidacion.
  const guardarAbono = async () => {
    const valor = parseFloat(abono.valor) || 0
    if (!carro.despachoId) { setAbono({ ...abono, error: 'No tienes un despacho abierto hoy.' }); return }
    if (valor <= 0) { setAbono({ ...abono, error: 'Escribe cuánto pagó.' }); return }
    let resta = valor
    const pagos = [], comps = []
    for (const f of creditosDe(abono.c)) {
      if (resta <= 0) break
      const pendiente = (f.saldo || 0) - (abonosHoy[f.id] || 0)
      if (pendiente <= 0) continue
      const v = Math.min(resta, pendiente)
      resta -= v
      const pago = { cartera_fiados_id: f.id, nombre_manual: '', valor: String(v), forma: abono.forma, hora: new Date().toISOString() }
      if (abono.forma === 'transferencia') {
        const key = 'ab' + Date.now() + pagos.length
        comps.push({ key, valor: String(v), referencia: REF_PAGO_CREDITO + (f.nombre_cliente || ''), estado: 'por_verificar', fecha_limite: '', origen: 'manual', foto: abono.foto || null })
        pago.compKey = key
      }
      pagos.push(pago)
    }
    if (resta > 0.5) { setAbono({ ...abono, error: `Debe ${fmt(valor - resta)}; no puede abonar más de eso.` }); return }
    setGuardando(true)
    try {
      await anotarEnCurso({ despachoId: carro.despachoId, vendedorId: vendedor.id, usuarioNombre: usuario.nombre, agregar: { pagosFiados: pagos, ...(comps.length ? { comprobantes: comps } : {}) } })
      await cargarAbonosHoy(carro.despachoId)
      setAbono(null)
    } catch (e) { setAbono({ ...abono, error: e.message }) }
    setGuardando(false)
  }
  const fotoAbono = async (file) => {
    if (!file) return
    setAbono(a => ({ ...a, subiendo: true }))
    try { const foto = await subirSoporte(file, 'transferencias'); setAbono(a => ({ ...a, foto, subiendo: false })) }
    catch (e) { setAbono(a => ({ ...a, subiendo: false, error: 'No se pudo subir la foto: ' + e.message })) }
  }

  const cargarVisitas = async (rutaId) => {
    const hoy = obtenerFechaActual()
    const [{ data: vis }, { data: vts }] = await Promise.all([
      supabase.from('visitas_ruta').select('cliente_id, resultado, reprogramada_para').eq('ruta_id', rutaId).eq('fecha', hoy).eq('empresa_id', getEmpresaId()),
      supabase.from('ventas_ruta').select('cliente_id, total').eq('ruta_id', rutaId).eq('fecha', hoy).eq('estado', 'activa').eq('empresa_id', getEmpresaId()),
    ])
    const m = {}
    ;(vis || []).forEach(v => { m[v.cliente_id] = { resultado: v.resultado, total: 0, para: v.reprogramada_para } })
    ;(vts || []).forEach(v => { if (v.cliente_id) m[v.cliente_id] = { resultado: 'compro', total: (m[v.cliente_id]?.total || 0) + Number(v.total || 0) } })
    setVisitas(m)
    const { data: sols } = await supabase.from('solicitudes_rutero').select('cliente_id').eq('ruta_id', rutaId).eq('estado', 'pendiente').eq('empresa_id', getEmpresaId())
    setPedidosSacar(new Set((sols || []).map(x => x.cliente_id)))
  }

  // Sacar clientes lo decide el admin en Rutas: aqui solo se pide, con el motivo.
  const pedirSacar = async () => {
    if (!sacar.motivo) { alert('Escoge el motivo'); return }
    setGuardando(true)
    const { error } = await supabase.from('solicitudes_rutero').insert({
      empresa_id: getEmpresaId(), cliente_id: sacar.c.id, ruta_id: vendedor.ruta_id, dia_semana: sacar.todos ? null : dia,
      vendedor_id: vendedor.id, motivo: sacar.motivo, detalle: sacar.detalle.trim() || null, pedido_por: usuario.nombre,
    })
    setGuardando(false)
    if (error) { alert('No se pudo enviar: ' + error.message); return }
    setPedidosSacar(p => new Set([...p, sacar.c.id]))
    setSacar(null)
  }

  const siguienteDe = (clienteId) => {
    const i = rutero.findIndex(f => f.cliente_id === clienteId)
    return i >= 0 ? rutero.slice(i + 1).find(f => !visitas[f.cliente_id])?.id || null : null
  }

  const marcarVisita = async (c, resultado, extra = {}) => {
    const geo = await ubicacionActual(4000)
    const { error } = await supabase.from('visitas_ruta').upsert({
      empresa_id: getEmpresaId(), fecha: obtenerFechaActual(), cliente_id: c.id, ruta_id: vendedor.ruta_id, vendedor_id: vendedor.id, resultado,
      reprogramada_para: null, nota: null, ...extra, ...geo,
    }, { onConflict: 'cliente_id,fecha' })
    if (error) { alert('No se pudo marcar: ' + error.message); return false }
    setVisitas(v => ({ ...v, [c.id]: { resultado, total: 0, para: extra.reprogramada_para } }))
    setAbierto(siguienteDe(c.id))
    return true
  }

  // Reprogramar: hoy queda marcado y ese dia le sale de primero en el rutero.
  const guardarReprogramar = async () => {
    setGuardando(true)
    const ok = await marcarVisita(reprogramar.c, 'reprogramada', { reprogramada_para: reprogramar.fecha, nota: reprogramar.nota.trim() || null })
    setGuardando(false)
    if (ok) setReprogramar(null)
  }

  const deshacerVisita = async (c) => {
    await supabase.from('visitas_ruta').delete().eq('cliente_id', c.id).eq('fecha', obtenerFechaActual()).is('venta_id', null).eq('empresa_id', getEmpresaId())
    setVisitas(v => { const n = { ...v }; delete n[c.id]; return n })
  }

  const abrirVenta = (c) => { setClienteVenta(c); setVista('venta'); window.scrollTo(0, 0) }
  const alVender = (v) => {
    const c = clienteVenta
    setTicket({ ...v, empresa: empresa || { nombre: 'Maissy' }, direccion: c.id ? lineaDireccion(c) : '', vendedor: vendedor.nombre })
    if (c.id) setVisitas(m => ({ ...m, [c.id]: { resultado: 'compro', total: (m[c.id]?.total || 0) + v.total } }))
    setVista('ticket')
    window.scrollTo(0, 0)
    cargarCarro(vendedor)
    if (domEnVenta) {
      supabase.from('domicilios').update({ estado: 'entregado', venta_id: v.id, resuelto_at: new Date().toISOString() }).eq('id', domEnVenta.id).eq('empresa_id', getEmpresaId())
        .then(() => cargarDomicilios(vendedor.ruta_id))
      setDomEnVenta(null)
    }
  }
  const siguienteCliente = () => { setAbierto(siguienteDe(clienteVenta?.id)); setTicket(null); setVista('rutero') }

  const cargarRutero = async (rutaId, d) => {
    const { data } = await supabase.from('rutero')
      .select('id, orden, cliente_id, clientes(id, nombre, telefono, direccion, apto, edificio, barrio, notas, frecuencia_dias, estado)')
      .eq('ruta_id', rutaId).eq('dia_semana', d).eq('empresa_id', getEmpresaId()).order('orden')
    setRutero((data || []).filter(f => f.clientes?.estado !== false))
    const { data: rp } = await supabase.from('visitas_ruta')
      .select('id, fecha, nota, cliente_id, clientes(id, nombre, telefono, direccion, apto, edificio, barrio, notas, frecuencia_dias, estado)')
      .eq('ruta_id', rutaId).eq('resultado', 'reprogramada').eq('reprogramada_para', fechaDeDia(d)).eq('empresa_id', getEmpresaId())
    setReprog((rp || []).filter(r => r.clientes))
  }

  const cambiarDia = (d) => { setDia(d); setAbierto(null); setOrden(null); if (vendedor?.ruta_id) cargarRutero(vendedor.ruta_id, d) }

  const deudaDe = (c) => (datos?.cartera || [])
    .filter(f => f.cliente_id ? f.cliente_id === c.id : (f.nombre_cliente || '').trim().toLowerCase() === (c.nombre || '').trim().toLowerCase())
    .reduce((s, f) => s + (f.saldo || 0), 0)

  // --- Organizar el orden de visita ---
  const mover = (i, a) => {
    if (a < 0 || a >= orden.length || a === i) return
    const l = [...orden]; const [f] = l.splice(i, 1); l.splice(a, 0, f); setOrden(l)
  }
  const guardarOrden = async () => {
    setGuardando(true)
    const { error } = await supabase.rpc('reordenar_rutero', { p_ids: orden.map(f => f.id) })
    setGuardando(false)
    if (error) { alert('No se pudo guardar el orden: ' + error.message); return }
    setOrden(null)
    cargarRutero(vendedor.ruta_id, dia)
  }

  // --- Cliente nuevo (en cualquier puesto) o editar sus datos ---
  const abrirNuevo = (puesto) => setFicha({ puesto, campos: { ...VACIO } })
  const abrirEditar = (c) => setFicha({ id: c.id, campos: Object.fromEntries(Object.keys(VACIO).map(k => [k, c[k] || ''])) })

  const guardarFicha = async (otro) => {
    const n = ficha.campos
    const nombre = n.nombre.trim() || [n.edificio || n.direccion, n.apto].map(t => t.trim()).filter(Boolean).join(' · ')
    if (!nombre) { alert('Escribe el nombre, o la dirección o edificio y el apto'); return }
    setGuardando(true)
    const empresaId = getEmpresaId()
    const campos = {
      nombre, edificio: n.edificio.trim() || null, direccion: n.direccion.trim() || null, apto: n.apto.trim() || null,
      barrio: n.barrio.trim() || null, telefono: n.telefono.trim() || null, notas: n.notas.trim() || null,
    }
    if (ficha.id) {
      const { error } = await supabase.from('clientes').update(campos).eq('id', ficha.id).eq('empresa_id', empresaId)
      setGuardando(false)
      if (error) { alert('No se pudo guardar: ' + error.message); return }
      setFicha(null)
    } else {
      const { data: c, error } = await supabase.from('clientes').insert({
        ...campos, empresa_id: empresaId, ruta_id: vendedor.ruta_id, vendedor_id: vendedor.id, estado: true,
        tipo_inmueble: campos.edificio ? 'edificio' : 'casa',
      }).select('id').single()
      if (error) { setGuardando(false); alert('No se pudo crear: ' + error.message); return }
      const { data: fila, error: e2 } = await supabase.from('rutero')
        .insert({ empresa_id: empresaId, cliente_id: c.id, ruta_id: vendedor.ruta_id, dia_semana: dia, orden: rutero.length + 1 }).select('id').single()
      if (e2) { setGuardando(false); alert('Se creó el cliente pero no entró al rutero: ' + e2.message); return }
      const puesto = Math.min(Math.max(1, Number(ficha.puesto) || rutero.length + 1), rutero.length + 1)
      const ids = rutero.map(f => f.id)
      ids.splice(puesto - 1, 0, fila.id)
      await supabase.rpc('reordenar_rutero', { p_ids: ids })
      setGuardando(false)
      // Para seguir con el mismo edificio: se quedan la direccion y el barrio, y avanza un puesto.
      setFicha(otro ? { puesto: puesto + 1, campos: { ...VACIO, edificio: n.edificio, direccion: n.edificio ? n.direccion : '', barrio: n.barrio } } : null)
    }
    cargarRutero(vendedor.ruta_id, dia)
  }

  const cambiarClave = async () => {
    if (clave.nueva.length < 6) { setClave({ ...clave, msg: 'Mínimo 6 caracteres' }); return }
    if (clave.nueva !== clave.repetir) { setClave({ ...clave, msg: 'Las dos no coinciden' }); return }
    const { error } = await supabase.auth.updateUser({ password: clave.nueva })
    setClave({ nueva: '', repetir: '', msg: error ? 'No se pudo: ' + error.message : 'Listo, tu contraseña quedó cambiada' })
  }

  const salir = async () => { await cerrarSesionUsuario(usuario?.id); localStorage.removeItem('maissy_usuario'); router.push('/') }

  if (!usuario) return null
  const nombreDia = DIAS.find(d => d.n === dia)?.nombre || ''
  const nombreHoy = DIAS.find(d => d.n === diaDeHoy())?.nombre.toLowerCase() || ''
  const hoy = obtenerFechaActual()
  const fechaCorta = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })
  const q = buscar.trim().toLowerCase()
  const coincide = (c) => [c?.nombre, c?.edificio, c?.apto, c?.direccion, c?.barrio].some(t => (t || '').toLowerCase().includes(q))
  const visibles = q ? rutero.filter(f => coincide(f.clientes)) : rutero
  const deOtrosDias = q ? todos.filter(c => !rutero.some(f => f.cliente_id === c.id) && coincide(c)).slice(0, 15) : []
  const esHoy = dia === diaDeHoy()
  const visitadosHoy = esHoy ? rutero.filter(f => visitas[f.cliente_id]).length : 0
  const ESTADO = { compro: ['Compró', '#2E5E3A', '#E6F0E8'], no_compro: ['No compró', '#5A5750', '#EFEDE6'], no_estaba: ['No estaba', '#5A5750', '#EFEDE6'], reprogramada: ['Reprogramado', '#8A5A00', '#FFF4CC'] }
  // Los reprogramados para este dia van de primero (aunque no esten en el rutero de este dia).
  const idsReprog = new Set(reprog.map(r => r.cliente_id))
  const filasReprog = reprog.filter(r => !q || coincide(r.clientes)).map(r => ({ id: 'rp-' + r.id, orden: '↻', cliente_id: r.cliente_id, clientes: r.clientes, reprogramado: r }))
  const listaDia = [...filasReprog, ...visibles.filter(f => !idsReprog.has(f.cliente_id))]
  const campo = 'w-full border-2 rounded-xl px-3 min-h-[48px] text-base bg-white focus:outline-none focus:border-[#1C1B19]'
  const ic = (d) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  const esPdV = vendedor?.rutas?.tipo === 'punto_venta'
  const itemNav = (activo) => `flex flex-col items-center justify-center gap-0.5 min-h-[58px] text-xs font-bold ${activo ? 'text-brand' : ''}`

  return (
    <div className="min-h-screen pb-28" style={{ background: FONDO, color: TINTA }}>
      <header className="bg-white border-b" style={{ borderColor: LINEA }}>
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <Image src="/maissypos-logo.png" width={118} height={44} alt="MaissyPOS" priority style={{ width: '118px', height: 'auto' }} />
          <button onClick={salir} className="text-sm font-bold px-3 min-h-[40px] rounded-xl" style={{ background: FONDO }}>Salir</button>
        </div>
      </header>

      {!datos ? <p className="text-center py-16" style={{ color: GRIS }}>Cargando...</p>
        : datos.sinRuta ? (
          <div className="max-w-md mx-auto px-4 pt-6">
            <div className="bg-white rounded-2xl p-6 text-center">
              <p className="font-bold">Tu usuario no está ligado a una ruta.</p>
              <p className="text-sm mt-1" style={{ color: GRIS }}>Pídele al administrador que te asigne tu vendedor y tu ruta.</p>
            </div>
          </div>
        ) : vista === 'inicio' ? (
          <>
            <div className="bg-brand text-white">
              <div className="max-w-md mx-auto px-5 pt-5 pb-14 flex items-center gap-3">
                <div className="w-[52px] h-[52px] rounded-full flex items-center justify-center font-extrabold text-xl shrink-0" style={{ ...titulo, background: '#F2B21B', color: TINTA }}>{iniciales(usuario.nombre)}</div>
                <div className="min-w-0">
                  <p className="font-extrabold text-[22px] leading-tight truncate" style={titulo}>{usuario.nombre}</p>
                  <p className="text-sm opacity-90 truncate">{vendedor?.rutas?.nombre} · {fechaCorta}</p>
                </div>
              </div>
            </div>
            <div className="max-w-md mx-auto px-4 -mt-10 flex flex-col gap-3">
              <div className="bg-white rounded-[20px] p-[18px] flex flex-col gap-2.5" style={{ boxShadow: '0 6px 18px rgba(28,27,25,.08)' }}>
                <span className="text-[13px] font-bold uppercase tracking-wider" style={{ color: GRIS }}>Venta de {new Date().toLocaleDateString('es-CO', { month: 'long' })}</span>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-extrabold text-[34px] tracking-tight tabular-nums" style={titulo}>{fmt(datos.venta)}</span>
                  {datos.meta > 0 && <span className="text-sm" style={{ color: GRIS }}>de {fmt(datos.meta)}</span>}
                </div>
                {datos.meta > 0 ? (
                  <>
                    <div className="h-3 rounded-full overflow-hidden" style={{ background: '#EFEDE6' }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, datos.venta / datos.meta * 100)}%`, background: '#F2B21B' }} /></div>
                    <span className="text-sm font-bold" style={{ color: '#2E5E3A' }}>{datos.venta >= datos.meta ? '¡Cumpliste la meta!' : `Te faltan ${fmt(datos.meta - datos.venta)}`}</span>
                  </>
                ) : <span className="text-sm" style={{ color: GRIS }}>Este mes todavía no tiene meta</span>}
              </div>

              {esPdV ? <PuntoVenta vendedor={vendedor} usuario={usuario} carro={carro} onCerrar={() => setVista('cerrar')} /> : (
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => { cambiarDia(diaDeHoy()); setVista('rutero') }} className="bg-white rounded-2xl p-3.5 flex flex-col gap-1 text-left">
                  <span className="text-[13px] font-bold" style={{ color: GRIS }}>Rutero del {nombreHoy}</span>
                  <span className="font-extrabold text-[28px] tabular-nums" style={titulo}>{dia === diaDeHoy() ? rutero.length : '—'}</span>
                  <span className="text-[13px]" style={{ color: GRIS }}>clientes · {Object.keys(visitas).length} visitados</span>
                </button>
                <div className="bg-white rounded-2xl p-3.5 flex flex-col gap-1">
                  <span className="text-[13px] font-bold" style={{ color: GRIS }}>Cobrar hoy</span>
                  <span className="font-extrabold text-[28px] tabular-nums text-brand" style={titulo}>{fmt(datos.cobrarHoy.reduce((s, f) => s + (f.saldo || 0), 0))}</span>
                  <span className="text-[13px]" style={{ color: GRIS }}>{datos.cobrarHoy.length} créditos · {datos.cobrarHoy.filter(f => f.fecha_pago < hoy).length} vencidos</span>
                </div>
              </div>
              )}

              <div className="bg-white rounded-2xl p-3.5 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#FFF4CC' }} aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={TINTA} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="font-bold truncate">{datos.vehiculo ? [datos.vehiculo.placa, datos.vehiculo.marca, datos.vehiculo.modelo].filter(Boolean).join(' · ') : 'Sin vehículo asignado'}</p>
                  {datos.vehiculo && <p className="text-[13px]" style={{ color: GRIS }}>{Number(datos.vehiculo.kilometraje_actual || 0).toLocaleString('es-CO')} km</p>}
                </div>
              </div>

              {(datos.porLiquidar.length > 0 || datos.cobrarHoy.length > 0) && (
                <div className="bg-white rounded-2xl p-3.5 flex flex-col gap-2">
                  <span className="text-[13px] font-bold" style={{ color: GRIS }}>Avisos</span>
                  {datos.porLiquidar.map(d => (
                    <button key={d.id} onClick={() => setVista('cerrar')} className="flex gap-2 items-start text-sm text-left">
                      <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: TINTA }} />
                      <span>{d.estado === 'por_aprobar' ? <>Liquidación del {d.fecha} enviada · <b>esperando aprobación</b></> : <>Despacho del {d.fecha} por liquidar · <b className="text-brand">cerrar</b></>}</span>
                    </button>
                  ))}
                  {datos.cobrarHoy.slice(0, 6).map((f, i) => (
                    <div key={i} className="flex gap-2 items-start text-sm">
                      <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: f.fecha_pago < hoy ? '#C41230' : '#F2B21B' }} />
                      <span className="flex-1 min-w-0">Cobrar a {f.nombre_cliente}{f.fecha_pago < hoy ? ' · vencido' : ''}</span>
                      <b className="tabular-nums">{fmt(f.saldo)}</b>
                    </div>
                  ))}
                  {datos.cobrarHoy.length > 6 && <span className="text-[13px]" style={{ color: GRIS }}>y {datos.cobrarHoy.length - 6} más · la ruta debe {fmt(datos.carteraTotal)} en total</span>}
                </div>
              )}

              {esPdV ? <button onClick={() => { cambiarDia(diaDeHoy()); setVista('rutero') }} className="min-h-[52px] rounded-2xl font-bold text-[16px] bg-white">
                Puntos del {nombreHoy} · {dia === diaDeHoy() ? rutero.length : '—'}
              </button> : <button onClick={() => { cambiarDia(diaDeHoy()); setVista('rutero') }} className="min-h-[56px] rounded-2xl text-white font-bold text-[17px] bg-brand">
                Empezar ruta del {nombreHoy}
              </button>}
            </div>
          </>
        ) : vista === 'venta' && clienteVenta ? (
          <Vender cliente={clienteVenta} carro={carro} vendedor={vendedor} usuario={usuario} debe={deudaDe(clienteVenta)} precios={preciosCliente[clienteVenta.id]}
            inicial={domEnVenta ? Object.fromEntries((domEnVenta.domicilios_detalle || []).map(x => [x.sku, x.cantidad])) : null}
            pagoInicial={domEnVenta?.forma_pago}
            valorDomicilio={domEnVenta ? Number(domEnVenta.valor_domicilio) || 0 : 0}
            onVolver={() => { setDomEnVenta(null); setVista('rutero') }} onVendido={alVender} />
        ) : vista === 'ticket' && ticket ? (
          <Ticket ticket={ticket} cliente={clienteVenta || {}} onSiguiente={siguienteCliente}
            onAnular={() => { cargarCarro(vendedor); cargarVisitas(vendedor.ruta_id); setTicket(null); setVista('rutero') }} />
        ) : vista === 'cerrar' ? (
          <Cerrar usuario={usuario} vendedor={vendedor} onVolver={() => setVista('inicio')} onEnviado={() => { cargar(usuario) }} />
        ) : vista === 'rutero' ? (
          <>
            <div className="bg-white border-b sticky top-0 z-10" style={{ borderColor: LINEA }}>
              <div className="max-w-md mx-auto px-4 pt-4 pb-3 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-extrabold text-2xl" style={titulo}>Rutero · {nombreDia.toLowerCase()}</p>
                    <p className="text-sm truncate" style={{ color: GRIS }}>{vendedor?.rutas?.nombre} · {rutero.length} clientes</p>
                  </div>
                  {!orden && (
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => { setOrden(rutero); setAbierto(null); setBuscar('') }} disabled={rutero.length < 2} className="min-h-[44px] px-3 rounded-xl font-bold text-sm disabled:opacity-40" style={{ background: FONDO }}>Organizar</button>
                      <button onClick={() => abrirNuevo(rutero.length + 1)} className="min-h-[44px] px-3 rounded-xl font-bold text-sm" style={{ background: '#FFF4CC', color: TINTA }}>+ Cliente</button>
                    </div>
                  )}
                </div>
                {esHoy && rutero.length > 0 && !orden && (
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: '#EFEDE6' }}><div className="h-full" style={{ width: `${visitadosHoy / rutero.length * 100}%`, background: '#2E5E3A' }} /></div>
                    <span className="text-[13px] font-bold tabular-nums" style={{ color: '#2E5E3A' }}>{visitadosHoy} de {rutero.length}</span>
                  </div>
                )}
                <div className="flex gap-1.5 overflow-x-auto">
                  {DIAS.map(d => (
                    <button key={d.n} onClick={() => cambiarDia(d.n)} className="shrink-0 px-3 min-h-[40px] rounded-xl text-sm font-bold"
                      style={d.n === dia ? { background: '#fff', color: TINTA, boxShadow: `inset 0 0 0 2px ${TINTA}` } : { background: FONDO }}>{d.corto}</button>
                  ))}
                </div>
                {!orden && (
                  <input type="search" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar cliente, apto, edificio o barrio" aria-label="Buscar cliente" className={campo} style={{ borderColor: LINEA }} />
                )}
              </div>
            </div>

            <div className="max-w-md mx-auto px-3 pt-3 flex flex-col gap-2">
              {orden ? (
                <>
                  <p className="text-sm px-1" style={{ color: GRIS }}>Sube o baja cada cliente con las flechas, o escríbele el puesto. Al final toca <b>Guardar orden</b>.</p>
                  {orden.map((f, i) => (
                    <div key={f.id} className="bg-white rounded-2xl p-2.5 flex items-center gap-2">
                      <input type="number" inputMode="numeric" defaultValue={i + 1} key={`${f.id}-${i}`} aria-label={`Puesto de ${f.clientes?.nombre}`}
                        onFocus={e => e.target.select()}
                        onBlur={e => { const a = Number(e.target.value) - 1; if (!isNaN(a)) mover(i, Math.min(Math.max(0, a), orden.length - 1)) }}
                        onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                        className="w-14 min-h-[44px] text-center font-extrabold rounded-xl border-2 tabular-nums" style={{ ...titulo, borderColor: LINEA }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold leading-snug">{f.clientes?.nombre}</p>
                        <p className="text-[13px] leading-snug" style={{ color: GRIS }}>{lineaDireccion(f.clientes || {})}</p>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <button onClick={() => mover(i, i - 1)} disabled={i === 0} aria-label="Subir" className="w-11 h-9 rounded-lg font-bold disabled:opacity-30" style={{ background: FONDO }}>↑</button>
                        <button onClick={() => mover(i, i + 1)} disabled={i === orden.length - 1} aria-label="Bajar" className="w-11 h-9 rounded-lg font-bold disabled:opacity-30" style={{ background: FONDO }}>↓</button>
                      </div>
                    </div>
                  ))}
                  <div className="sticky bottom-20 grid grid-cols-2 gap-2 pt-2">
                    <button onClick={() => setOrden(null)} className="min-h-[52px] rounded-2xl font-bold bg-white border-2" style={{ borderColor: LINEA }}>Cancelar</button>
                    <button onClick={guardarOrden} disabled={guardando} className="min-h-[52px] rounded-2xl font-bold text-white bg-brand disabled:opacity-50">{guardando ? 'Guardando...' : 'Guardar orden'}</button>
                  </div>
                </>
              ) : (
                <>
                  {rutero.length === 0 && <p className="text-center py-10" style={{ color: GRIS }}>Este día no tiene clientes todavía. Agrégalos con <b>+ Cliente</b> a medida que haces el recorrido.</p>}
                  {q && visibles.length === 0 && deOtrosDias.length === 0 && <p className="text-center py-6" style={{ color: GRIS }}>Nadie coincide con “{buscar}”.</p>}
                  {filasReprog.length > 0 && <p className="text-[13px] font-bold px-1" style={{ color: '#8A5A00' }}>Reprogramados para este día · van de primero</p>}
                  {listaDia.map(f => {
                    const c = f.clientes || {}
                    const esteAbierto = abierto === f.id
                    const debe = esteAbierto ? deudaDe(c) : 0
                    const abonadoHoy = esteAbierto ? creditosDe(c).reduce((s, x) => s + (abonosHoy[x.id] || 0), 0) : 0
                    const boton = 'min-h-[48px] rounded-xl font-bold text-sm flex items-center justify-center'
                    const vis = esHoy ? visitas[c.id] : null
                    return (
                      <div key={f.id} className="bg-white rounded-2xl" style={esteAbierto ? { outline: `2px solid ${TINTA}` } : vis ? { opacity: 0.72 } : undefined}>
                        <button onClick={() => setAbierto(esteAbierto ? null : f.id)} aria-expanded={esteAbierto} className="w-full text-left p-3 flex gap-2.5">
                          <span className="w-7 shrink-0 text-right font-extrabold text-lg tabular-nums" style={{ ...titulo, color: esteAbierto ? TINTA : GRIS }}>{f.orden}</span>
                          <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                            <span className="font-bold leading-snug">{c.nombre}</span>
                            {lineaDireccion(c) && <span className="text-[13px] leading-snug" style={{ color: GRIS }}>{lineaDireccion(c)}</span>}
                            {c.notas && !esteAbierto && <span className="text-[13px] leading-snug" style={{ color: '#8A5A00' }}>{c.notas}</span>}
                            {f.reprogramado && <span className="text-[13px] leading-snug" style={{ color: '#8A5A00' }}>Reprogramado el {fechaCortaDe(f.reprogramado.fecha)}{f.reprogramado.nota ? ` · ${f.reprogramado.nota}` : ''}</span>}
                            {preciosCliente[c.id] && <span className="text-[12px] font-bold" style={{ color: '#8A5A00' }}>Tiene descuento</span>}
                          </span>
                          {!vis && pedidosSacar.has(c.id) && <span className="self-center shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-full" style={{ color: GRIS, background: FONDO }}>Pidió sacar</span>}
                          {vis && <span className="self-center shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-full tabular-nums" style={{ color: ESTADO[vis.resultado][1], background: ESTADO[vis.resultado][2] }}>{ESTADO[vis.resultado][0]}{vis.resultado === 'reprogramada' && vis.para ? ' → ' + fechaCortaDe(vis.para) : ''}{vis.total > 0 ? ' ' + fmt(vis.total) : ''}</span>}
                        </button>
                        {esteAbierto && (
                          <div className="px-3 pb-3 flex flex-col gap-3">
                            <button onClick={() => abrirVenta(c)} className={boton + ' text-white bg-brand text-base'}>{vis?.resultado === 'compro' ? 'Vender otra vez' : 'Vender'}</button>
                            {vis && vis.resultado !== 'compro'
                              ? <button onClick={() => deshacerVisita(c)} className={boton} style={{ background: FONDO }}>Deshacer «{ESTADO[vis.resultado][0]}»</button>
                              : !vis && (
                                <div className="grid grid-cols-3 gap-2">
                                  <button onClick={() => marcarVisita(c, 'no_compro')} className={boton} style={{ background: FONDO }}>No compró</button>
                                  <button onClick={() => marcarVisita(c, 'no_estaba')} className={boton} style={{ background: FONDO }}>No estaba</button>
                                  <button onClick={() => setReprogramar({ c, fecha: proximosDias()[0], nota: '' })} className={boton} style={{ background: '#FFF4CC', color: '#8A5A00' }}>Reprogramar</button>
                                </div>
                              )}
                            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm rounded-xl p-3" style={{ background: FONDO }}>
                              {c.edificio && <><dt style={{ color: GRIS }}>Edificio</dt><dd className="font-bold">{c.edificio}</dd></>}
                              {c.apto && <><dt style={{ color: GRIS }}>Apto / piso</dt><dd className="font-bold">{c.apto}</dd></>}
                              <dt style={{ color: GRIS }}>Dirección</dt><dd className="font-bold">{c.direccion || '—'}</dd>
                              <dt style={{ color: GRIS }}>Barrio</dt><dd className="font-bold">{c.barrio || '—'}</dd>
                              <dt style={{ color: GRIS }}>Teléfono</dt><dd className="font-bold tabular-nums">{c.telefono || '—'}</dd>
                              {c.notas && <><dt style={{ color: GRIS }}>Nota</dt><dd className="font-bold">{c.notas}</dd></>}
                              {preciosCliente[c.id] && <><dt style={{ color: GRIS }}>Descuento</dt><dd className="font-bold">{Object.entries(preciosCliente[c.id]).map(([sku, pr]) => `${carro.productos.find(p => p.sku === sku)?.nombre || sku} ${fmt(pr)}`).join(' · ')}</dd></>}
                              <dt style={{ color: GRIS }}>Debe</dt><dd className={`font-bold tabular-nums ${debe > 0 ? 'text-brand' : ''}`}>{debe > 0 ? fmt(debe) : 'Nada'}{abonadoHoy > 0 ? <span className="font-normal" style={{ color: '#2E5E3A' }}> · abonó hoy {fmt(abonadoHoy)}</span> : null}</dd>
                            </dl>
                            {debe - abonadoHoy > 0 && <button onClick={() => setAbono({ c, valor: '', forma: 'efectivo', foto: null, error: '' })} className={boton} style={{ background: '#FFF4CC' }}>Registrar abono</button>}
                            <div className="grid grid-cols-3 gap-2">
                              {c.telefono
                                ? <a href={`tel:${soloDigitos(c.telefono)}`} className={boton} style={{ background: FONDO }}>Llamar</a>
                                : <span className={boton + ' font-normal'} style={{ background: FONDO, color: GRIS }}>Sin teléfono</span>}
                              {c.telefono
                                ? <a href={`https://wa.me/57${soloDigitos(c.telefono).slice(-10)}`} target="_blank" rel="noreferrer" className={boton} style={{ background: FONDO }}>WhatsApp</a>
                                : <span />}
                              <a href={mapa(c)} target="_blank" rel="noreferrer" className={boton} style={{ background: FONDO }}>Cómo llegar</a>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <button onClick={() => abrirEditar(c)} className={boton + ' border-2'} style={{ borderColor: LINEA }}>Editar datos</button>
                              {f.reprogramado ? <span /> : <button onClick={() => abrirNuevo(f.orden + 1)} className={boton} style={{ background: '#FFF4CC' }}>+ Cliente después</button>}
                            </div>
                            {pedidosSacar.has(c.id)
                              ? <p className="text-[13px] text-center" style={{ color: GRIS }}>Ya pediste sacarlo del rutero; el admin lo revisa.</p>
                              : <button onClick={() => setSacar({ c, motivo: '', detalle: '', todos: false })} className="text-[13px] font-bold underline self-center py-1" style={{ color: GRIS }}>Pedir sacar del rutero</button>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {deOtrosDias.length > 0 && (
                    <>
                      <p className="text-[13px] font-bold px-1 pt-2" style={{ color: GRIS }}>De la ruta, otros días</p>
                      {deOtrosDias.map(c => (
                        <div key={c.id} className="bg-white rounded-2xl p-3 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold leading-snug">{c.nombre}</p>
                            <p className="text-[13px] leading-snug" style={{ color: GRIS }}>{lineaDireccion(c)}</p>
                          </div>
                          <button onClick={() => abrirVenta(c)} className="min-h-[44px] px-4 rounded-xl font-bold text-sm text-white bg-brand shrink-0">Vender</button>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <div className="max-w-md mx-auto px-4 pt-4">
            <div className="bg-white rounded-2xl p-4 flex flex-col gap-3">
              <p className="font-extrabold text-2xl" style={titulo}>Mi cuenta</p>
              <p className="text-sm" style={{ color: GRIS }}>{usuario.nombre} · usuario <b>{usuario.usuario}</b> · {vendedor?.rutas?.nombre}</p>
              <p className="font-bold mt-2">Cambiar contraseña</p>
              <input type="password" value={clave.nueva} onChange={e => setClave({ ...clave, nueva: e.target.value, msg: '' })} placeholder="Nueva contraseña" aria-label="Nueva contraseña" className={campo} style={{ borderColor: LINEA }} />
              <input type="password" value={clave.repetir} onChange={e => setClave({ ...clave, repetir: e.target.value, msg: '' })} placeholder="Repítela" aria-label="Repetir contraseña" className={campo} style={{ borderColor: LINEA }} />
              {clave.msg && <p className="text-sm font-bold">{clave.msg}</p>}
              <button onClick={cambiarClave} className="min-h-[52px] rounded-2xl text-white font-bold bg-brand">Guardar contraseña</button>
            </div>
          </div>
        )}

      {abono && (
        <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center" style={{ background: 'rgba(28,27,25,.45)' }} onClick={() => !guardando && setAbono(null)}>
          <div role="dialog" aria-modal="true" aria-label="Registrar abono" onClick={e => e.stopPropagation()}
            className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-4 flex flex-col gap-3" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
            <div>
              <p className="font-extrabold text-xl" style={titulo}>Registrar abono</p>
              <p className="text-sm" style={{ color: GRIS }}>{abono.c.nombre} · debe {fmt(deudaDe(abono.c) - creditosDe(abono.c).reduce((s, x) => s + (abonosHoy[x.id] || 0), 0))}. Paga primero lo más viejo.</p>
            </div>
            <div className="flex gap-2">
              <InputDinero autoFocus value={abono.valor} onChange={e => setAbono({ ...abono, valor: e.target.value, error: '' })} placeholder="¿Cuánto pagó?" aria-label="Valor del abono"
                className={campo + ' flex-1 font-bold text-center text-lg'} style={{ borderColor: LINEA }} />
              <button type="button" onClick={() => setAbono({ ...abono, valor: String(deudaDe(abono.c) - creditosDe(abono.c).reduce((s, x) => s + (abonosHoy[x.id] || 0), 0)), error: '' })} className="px-4 rounded-xl font-bold" style={{ background: FONDO }}>Todo</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[['efectivo', 'Efectivo'], ['transferencia', 'Transferencia']].map(([id, t]) => (
                <button key={id} type="button" onClick={() => setAbono({ ...abono, forma: id })} aria-pressed={abono.forma === id}
                  className="min-h-[48px] rounded-xl font-bold text-sm" style={abono.forma === id ? { background: '#fff', color: TINTA, boxShadow: `inset 0 0 0 2px ${TINTA}` } : { background: FONDO }}>{t}</button>
              ))}
            </div>
            {abono.forma === 'transferencia' && (
              <label className="min-h-[48px] rounded-xl font-bold text-sm flex items-center justify-center cursor-pointer" style={abono.foto ? { background: '#E6F0E8', color: '#2E5E3A' } : { background: FONDO }}>
                {abono.subiendo ? 'Subiendo…' : abono.foto ? '✓ Foto del comprobante' : 'Foto del comprobante (opcional)'}
                <input type="file" accept="image/*" className="hidden" onChange={e => { fotoAbono(e.target.files?.[0]); e.target.value = '' }} />
              </label>
            )}
            {abono.error && <p className="text-sm" style={{ color: '#C41230' }}>{abono.error}</p>}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={() => setAbono(null)} className="min-h-[52px] rounded-2xl font-bold border-2" style={{ borderColor: LINEA }}>Cancelar</button>
              <button onClick={guardarAbono} disabled={guardando || abono.subiendo} className="min-h-[52px] rounded-2xl font-bold text-white bg-brand disabled:opacity-50">{guardando ? 'Guardando...' : 'Anotar abono'}</button>
            </div>
            <p className="text-[12.5px] text-center" style={{ color: GRIS }}>Llega solo a tu cierre del día. La deuda baja cuando aprueben tu liquidación.</p>
          </div>
        </div>
      )}

      {reprogramar && (
        <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center" style={{ background: 'rgba(28,27,25,.45)' }} onClick={() => !guardando && setReprogramar(null)}>
          <div role="dialog" aria-modal="true" aria-label="Reprogramar visita" onClick={e => e.stopPropagation()}
            className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-4 flex flex-col gap-3" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
            <div>
              <p className="font-extrabold text-xl" style={titulo}>Reprogramar visita</p>
              <p className="text-sm" style={{ color: GRIS }}>{reprogramar.c.nombre} · ese día te sale de primero en el rutero.</p>
            </div>
            <fieldset className="grid grid-cols-3 gap-2">
              <legend className="text-[13px] font-bold mb-1.5" style={{ color: GRIS }}>¿Para qué día?</legend>
              {proximosDias().map((f, i) => (
                <button key={f} type="button" onClick={() => setReprogramar({ ...reprogramar, fecha: f })} aria-pressed={reprogramar.fecha === f}
                  className="min-h-[52px] rounded-xl font-bold text-sm leading-tight" style={reprogramar.fecha === f ? { background: '#fff', color: TINTA, boxShadow: `inset 0 0 0 2px ${TINTA}` } : { background: FONDO }}>
                  {i === 0 ? 'Mañana' : fechaCortaDe(f).split(' ')[0]}<br /><span className="font-normal text-xs">{fechaCortaDe(f)}</span>
                </button>
              ))}
            </fieldset>
            <input value={reprogramar.nota} onChange={e => setReprogramar({ ...reprogramar, nota: e.target.value })} placeholder="Nota (pasar después de las 3, etc.)" aria-label="Nota" className={campo} style={{ borderColor: LINEA }} />
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={() => setReprogramar(null)} className="min-h-[52px] rounded-2xl font-bold border-2" style={{ borderColor: LINEA }}>Cancelar</button>
              <button onClick={guardarReprogramar} disabled={guardando} className="min-h-[52px] rounded-2xl font-bold text-white disabled:opacity-50 bg-brand">{guardando ? 'Guardando...' : 'Reprogramar'}</button>
            </div>
          </div>
        </div>
      )}

      {sacar && (
        <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center" style={{ background: 'rgba(28,27,25,.45)' }} onClick={() => !guardando && setSacar(null)}>
          <div role="dialog" aria-modal="true" aria-label="Pedir sacar del rutero" onClick={e => e.stopPropagation()}
            className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-4 flex flex-col gap-3" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
            <div>
              <p className="font-extrabold text-xl" style={titulo}>Pedir sacar del rutero</p>
              <p className="text-sm" style={{ color: GRIS }}>{sacar.c.nombre} · lo revisa el admin antes de sacarlo.</p>
            </div>
            <fieldset className="grid grid-cols-2 gap-2">
              <legend className="text-[13px] font-bold mb-1.5" style={{ color: GRIS }}>¿Por qué?</legend>
              {['Se mudó', 'Ya no compra', 'No quiere que pasen', 'Otro'].map(m => (
                <button key={m} type="button" onClick={() => setSacar({ ...sacar, motivo: m })} aria-pressed={sacar.motivo === m}
                  className="min-h-[48px] rounded-xl font-bold text-sm" style={sacar.motivo === m ? { background: '#fff', color: TINTA, boxShadow: `inset 0 0 0 2px ${TINTA}` } : { background: FONDO }}>{m}</button>
              ))}
            </fieldset>
            <input value={sacar.detalle} onChange={e => setSacar({ ...sacar, detalle: e.target.value })} placeholder="Detalle (opcional)" aria-label="Detalle" className={campo} style={{ borderColor: LINEA }} />
            <div className="grid grid-cols-2 gap-2">
              {[[false, `Solo del ${nombreDia.toLowerCase()}`], [true, 'De todos los días']].map(([v, t]) => (
                <button key={t} type="button" onClick={() => setSacar({ ...sacar, todos: v })} aria-pressed={sacar.todos === v}
                  className="min-h-[44px] rounded-xl font-bold text-sm border-2" style={{ borderColor: sacar.todos === v ? TINTA : LINEA }}>{t}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={() => setSacar(null)} className="min-h-[52px] rounded-2xl font-bold border-2" style={{ borderColor: LINEA }}>Cancelar</button>
              <button onClick={pedirSacar} disabled={guardando} className="min-h-[52px] rounded-2xl font-bold text-white bg-brand disabled:opacity-50">{guardando ? 'Enviando...' : 'Enviar al admin'}</button>
            </div>
          </div>
        </div>
      )}

      {ficha && (
        <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center" style={{ background: 'rgba(28,27,25,.45)' }} onClick={() => !guardando && setFicha(null)}>
          <div role="dialog" aria-modal="true" aria-label={ficha.id ? 'Editar cliente' : 'Cliente nuevo'} onClick={e => e.stopPropagation()}
            className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-4 flex flex-col gap-2.5 max-h-[92vh] overflow-y-auto" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-extrabold text-xl" style={titulo}>{ficha.id ? 'Editar cliente' : 'Cliente nuevo'}</p>
              {!ficha.id && (
                <label className="flex items-center gap-2 text-sm font-bold" style={{ color: GRIS }}>Puesto #
                  <input type="number" inputMode="numeric" value={ficha.puesto} onChange={e => setFicha({ ...ficha, puesto: e.target.value })} onFocus={e => e.target.select()}
                    className="w-16 min-h-[44px] text-center rounded-xl border-2 font-extrabold" style={{ ...titulo, borderColor: LINEA, color: TINTA }} />
                </label>
              )}
            </div>
            {!ficha.id && <p className="text-[13px] -mt-1" style={{ color: GRIS }}>Queda el {nombreDia.toLowerCase()} en ese puesto; los de ahí para abajo bajan uno.</p>}
            {[['nombre', 'Nombre (si lo sabes)'], ['edificio', 'Edificio o negocio']].map(([k, t]) => (
              <input key={k} value={ficha.campos[k]} onChange={e => setFicha({ ...ficha, campos: { ...ficha.campos, [k]: e.target.value } })} placeholder={t} aria-label={t} className={campo} style={{ borderColor: LINEA }} />
            ))}
            <div className="grid grid-cols-2 gap-2">
              {[['direccion', 'Dirección'], ['apto', 'Apto / piso'], ['barrio', 'Barrio'], ['telefono', 'Teléfono']].map(([k, t]) => (
                <input key={k} value={ficha.campos[k]} onChange={e => setFicha({ ...ficha, campos: { ...ficha.campos, [k]: e.target.value } })} placeholder={t} aria-label={t}
                  inputMode={k === 'telefono' ? 'tel' : undefined} className={campo} style={{ borderColor: LINEA }} />
              ))}
            </div>
            <input value={ficha.campos.notas} onChange={e => setFicha({ ...ficha, campos: { ...ficha.campos, notas: e.target.value } })} placeholder="Nota (timbrar al 401, compra los viernes...)" aria-label="Nota" className={campo} style={{ borderColor: LINEA }} />
            <div className="grid grid-cols-2 gap-2 pt-1">
              {ficha.id
                ? <button onClick={() => setFicha(null)} className="min-h-[52px] rounded-2xl font-bold border-2" style={{ borderColor: LINEA }}>Cancelar</button>
                : <button onClick={() => guardarFicha(true)} disabled={guardando} className="min-h-[52px] rounded-2xl font-bold border-2 disabled:opacity-50" style={{ borderColor: LINEA }}>Guardar y otro</button>}
              <button onClick={() => guardarFicha(false)} disabled={guardando} className="min-h-[52px] rounded-2xl font-bold text-white bg-brand disabled:opacity-50">{guardando ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {datos && !datos.sinRuta && (vista === 'inicio' || vista === 'rutero') && !orden && (
        <BurbujaDomicilios domicilios={domicilios} aviso={avisoDom} onCerrarAviso={() => setAvisoDom(null)}
          onEntregar={entregarDomicilio} onNoSePudo={domicilioNoSePudo} />
      )}

      {vista !== 'venta' && vista !== 'ticket' && <nav aria-label="Menú del vendedor" className="fixed bottom-0 inset-x-0 bg-white border-t z-20" style={{ borderColor: LINEA, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="max-w-md mx-auto grid grid-cols-5" style={{ color: GRIS }}>
          <button onClick={() => setVista('inicio')} className={itemNav(vista === 'inicio')}>{ic('M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z')}Inicio</button>
          <button onClick={() => setVista('rutero')} className={itemNav(vista === 'rutero')}>{ic('M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01')}{esPdV ? 'Puntos' : 'Rutero'}</button>
          <button onClick={() => abrirVenta({ id: null, nombre: 'Venta en la calle' })} className={itemNav(false)}>{ic('M6 6h15l-1.5 9h-12zM6 6L5 3H2M9 20h.01M18 20h.01')}Vender</button>
          <button onClick={() => setVista('cerrar')} className={itemNav(vista === 'cerrar')}>{ic('M3 7h18v10H3zM12 12h.01M7 7V5h10v2')}Cerrar</button>
          <button onClick={() => setVista('cuenta')} className={itemNav(vista === 'cuenta')}>{ic('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0')}Mi cuenta</button>
        </div>
      </nav>}
    </div>
  )
}
