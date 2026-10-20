'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { puedeVerModulo } from '@/lib/permisos'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { conObsequiosRestados } from '@/lib/ventas-helpers'
import { PageHeader } from '@/components/ui'
import { DIAS, detalleCliente } from '@/lib/rutero'
import { armarParadas, ordenDeParadas, etiquetaApto, primerNombre, FRECUENCIA_OBSEQUIO } from '@/lib/paradas'
import HoyEnLaCalle from './HoyEnLaCalle'
import PreciosEspecialesCliente from '@/components/PreciosEspecialesCliente'

// Rutas: cómo va cada ruta y su rutero por día en el orden de visita. El
// edificio es una parada con sus apartamentos adentro, su portero y el
// obsequio a la portería; los descuentos y los obsequios solo los autoriza el
// admin aquí. El cliente es uno solo (crédito, ventas y visitas cuelgan de él).
// La pantalla de antes quedó en /rutas-anterior.
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', linea: '#E3E1D8', suave: '#EFEDE6', rojo: '#C41230', rojoF: '#FBE9E9', amarillo: '#F2B21B', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8' }
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const TIPOS = [['casa', 'Casa'], ['edificio', 'Edificio'], ['unidad', 'Unidad'], ['negocio', 'Negocio']]
const FRECUENCIAS = [[7, 'Cada 8 días'], [15, 'Cada 15 días'], [3, '2 veces por semana'], [30, 'Cada mes']]
const fmt = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO')
const hoyDia = () => { const d = new Date(obtenerFechaActual() + 'T12:00:00').getDay(); return d === 0 ? 1 : d }
const diasDesde = (f) => f ? Math.round((new Date(obtenerFechaActual() + 'T12:00:00') - new Date(f + 'T12:00:00')) / 864e5) : null
const clienteVacio = { nombre: '', tipo_inmueble: 'casa', edificio: '', direccion: '', apto: '', barrio: '', telefono: '', frecuencia_dias: 7, notas: '' }
const edificioVacio = { id: null, nombre: '', direccion: '', barrio: '', portero_nombre: '', portero_telefono: '', notas: '', obsequio_sku: '', obsequio_cantidad: '', obsequio_frecuencia: 'semana' }
const aptoVacio = () => ({ apto: '', nombre: '', telefono: '', nota: '' })
const campo = 'w-full h-11 rounded-xl border-2 px-3 text-[15px] bg-white focus:outline-none focus:border-[#1C1B19]'
const etq = 'text-[13px] font-bold block mb-1'
const Pill = ({ tono = 'gris', children }) => {
  const t = { gris: [C.suave, C.gris], ambar: [C.ambarF, C.ambar], verde: [C.verdeF, C.verde], rojo: [C.rojoF, C.rojo] }[tono]
  return <span className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: t[0], color: t[1] }}>{children}</span>
}
const Boton = ({ tipo = 'suave', className = '', ...p }) => <button type="button" {...p} className={`rounded-xl min-h-[40px] px-3.5 text-sm font-bold disabled:opacity-40 ${className}`}
  style={tipo === 'rojo' ? { background: C.rojo, color: '#fff' } : tipo === 'tinta' ? { background: C.tinta, color: '#fff' } : { background: C.suave, color: C.tinta }} />

// "201 Ana Gómez 3001234567" → apto, nombre y teléfono.
const leerLista = (texto) => texto.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
  const p = l.split(/\s+/)
  const apto = p.shift() || ''
  const tel = p.length && /^\+?\d[\d-]{6,}$/.test(p[p.length - 1]) ? p.pop() : ''
  return { apto, nombre: p.join(' '), telefono: tel, nota: '' }
})

export default function Rutas() {
  const router = useRouter()
  const [usuario, setUsuario] = useState(null)
  const [rutas, setRutas] = useState([])
  const [rutaId, setRutaId] = useState('')
  const [dia, setDia] = useState(hoyDia())
  const [tab, setTab] = useState('rutero')
  const [filas, setFilas] = useState([])
  const [edificios, setEdificios] = useState({})
  const [productos, setProductos] = useState([])
  const [actividad, setActividad] = useState({ ventas: {}, deuda: {}, precios: {} })
  const [resumen, setResumen] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [ficha, setFicha] = useState(null) // id de fila del rutero con la ficha abierta
  const [panel, setPanel] = useState(null) // 'cliente' | {edificio} | {editar: fila} | {mover: fila} | {descuento: clienteId}
  const [form, setForm] = useState(clienteVacio)
  const [edif, setEdif] = useState(edificioVacio)
  const [aptos, setAptos] = useState([aptoVacio()])
  const [pegar, setPegar] = useState('')
  const [posicion, setPosicion] = useState('final')
  const [destino, setDestino] = useState({ ruta_id: '', dia: 2, tambien: false })
  const [guardando, setGuardando] = useState(false)
  const [solicitudes, setSolicitudes] = useState([])
  const [sugeridos, setSugeridos] = useState([])
  const [filtro, setFiltro] = useState('todos')
  const arrastrando = useRef(null)
  const esAdmin = usuario?.rol === 'admin'

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')
    if (!u) { router.push('/'); return }
    if (!puedeVerModulo(u, 'rutas', ['admin', 'auxiliar'])) { router.push('/despacho'); return }
    setUsuario(u)
    const empresaId = getEmpresaId()
    supabase.from('rutas').select('id, nombre').eq('estado', true).eq('empresa_id', empresaId).order('nombre')
      .then(({ data }) => { setRutas(data || []); if (data?.length) setRutaId(data[0].id) })
    supabase.from('productos').select('sku, nombre, precio_venta').eq('estado', true).neq('tipo', 'materia_prima').eq('empresa_id', empresaId).order('nombre')
      .then(({ data }) => setProductos(data || []))
  }, [router])

  useEffect(() => { if (rutaId) { cargarRutero(); cargarResumen(); cargarSolicitudes(); setFicha(null); setPanel(null) } }, [rutaId]) // eslint-disable-line react-hooks/exhaustive-deps

  const cargarRutero = async () => {
    setCargando(true)
    const empresaId = getEmpresaId()
    const [{ data }, { data: eds }] = await Promise.all([
      supabase.from('rutero').select('id, dia_semana, orden, cliente_id, clientes(id, nombre, telefono, direccion, apto, edificio, edificio_id, barrio, tipo_inmueble, frecuencia_dias, notas, estado)')
        .eq('ruta_id', rutaId).eq('empresa_id', empresaId).order('orden'),
      supabase.from('edificios').select('*').eq('empresa_id', empresaId).eq('activo', true),
    ])
    setFilas(data || [])
    setEdificios(Object.fromEntries((eds || []).map(e => [e.id, e])))
    setCargando(false)
    cargarActividad((data || []).map(f => f.cliente_id))
  }

  // Por cliente: última compra y lo de este mes, lo que debe y si tiene descuento.
  const cargarActividad = async (ids) => {
    const empresaId = getEmpresaId()
    const desde = new Date(Date.now() - 90 * 864e5).toLocaleDateString('en-CA')
    const [{ data: vts }, { data: cart }, { data: pc }] = await Promise.all([
      supabase.from('ventas_ruta').select('cliente_id, fecha, total').eq('ruta_id', rutaId).eq('estado', 'activa').gte('fecha', desde).eq('empresa_id', empresaId),
      supabase.from('cartera_fiados').select('cliente_id, saldo').eq('estado', 'pendiente').gt('saldo', 0).eq('empresa_id', empresaId),
      supabase.from('clientes_precios').select('cliente_id, sku, precio_especial').eq('empresa_id', empresaId),
    ])
    const mes = obtenerFechaActual().slice(0, 7)
    const ventas = {}, deuda = {}, precios = {}
    ;(vts || []).forEach(v => { if (!v.cliente_id) return; const x = (ventas[v.cliente_id] = ventas[v.cliente_id] || { ultima: null, mes: 0 }); if (!x.ultima || v.fecha > x.ultima) x.ultima = v.fecha; if (v.fecha.startsWith(mes)) x.mes += Number(v.total || 0) })
    ;(cart || []).forEach(c => { if (c.cliente_id) deuda[c.cliente_id] = (deuda[c.cliente_id] || 0) + Number(c.saldo || 0) })
    const enRuta = new Set(ids)
    ;(pc || []).filter(p => enRuta.has(p.cliente_id)).forEach(p => { (precios[p.cliente_id] = precios[p.cliente_id] || []).push(p) })
    setActividad({ ventas, deuda, precios })
  }

  const cargarResumen = async () => {
    const empresaId = getEmpresaId()
    const hoy = obtenerFechaActual()
    const mes = hoy.slice(0, 7)
    const inicio = mes + '-01'
    const hace14 = new Date(Date.now() - 13 * 864e5).toLocaleDateString('en-CA')
    const [{ data: vends }, { data: vehs }, { data: cartera }, { data: desp }, { data: meta }, { data: vis }, { data: rut }, { data: compras14 }] = await Promise.all([
      supabase.from('vendedores').select('id, nombre, telefono').eq('ruta_id', rutaId).eq('estado', true).eq('empresa_id', empresaId),
      supabase.from('vehiculos').select('placa, marca, modelo, kilometraje_actual').eq('ruta_id', rutaId).eq('empresa_id', empresaId),
      supabase.from('cartera_fiados').select('saldo, fecha_pago').eq('ruta_id', rutaId).eq('estado', 'pendiente').eq('empresa_id', empresaId),
      supabase.from('despachos_encab').select('id').eq('ruta_id', rutaId).gte('fecha', inicio).lte('fecha', hoy).eq('empresa_id', empresaId),
      supabase.from('metas_ventas').select('meta').eq('ruta_id', rutaId).eq('mes', mes).eq('empresa_id', empresaId).maybeSingle(),
      supabase.from('visitas_ruta').select('resultado').eq('ruta_id', rutaId).gte('fecha', inicio).in('resultado', ['compro', 'no_compro', 'no_estaba']).eq('empresa_id', empresaId),
      supabase.from('rutero').select('cliente_id').eq('ruta_id', rutaId).eq('empresa_id', empresaId),
      supabase.from('ventas_ruta').select('cliente_id').eq('ruta_id', rutaId).eq('estado', 'activa').gte('fecha', hace14).eq('empresa_id', empresaId),
    ])
    const ids = (desp || []).map(d => d.id)
    let venta = 0, obsequios = { valor: 0, und: 0, edificios: 0 }
    if (ids.length) {
      const [{ data: liq }, { data: obs }] = await Promise.all([
        supabase.from('liquidaciones').select('despacho_id, efectivo_esperado').in('despacho_id', ids).eq('empresa_id', empresaId),
        supabase.from('obsequios').select('cantidad, valor_unitario, edificio_id').in('despacho_id', ids).eq('empresa_id', empresaId),
      ])
      const filasVenta = await conObsequiosRestados(liq || [], { desde: inicio, hasta: hoy })
      const set = new Set(ids)
      venta = filasVenta.filter(l => set.has(l.despacho_id)).reduce((s, l) => s + (l.efectivo_esperado || 0), 0)
      obsequios = { valor: (obs || []).reduce((s, o) => s + Number(o.cantidad || 0) * Number(o.valor_unitario || 0), 0), und: (obs || []).reduce((s, o) => s + Number(o.cantidad || 0), 0), edificios: new Set((obs || []).map(o => o.edificio_id).filter(Boolean)).size }
    }
    const clientes = new Set((rut || []).map(r => r.cliente_id))
    const compraron = new Set((compras14 || []).map(v => v.cliente_id).filter(c => clientes.has(c)))
    const compro = (vis || []).filter(v => v.resultado === 'compro').length
    const diasMes = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate()
    setResumen({
      vendedores: vends || [], vehiculo: (vehs || [])[0] || null,
      cartera: (cartera || []).reduce((s, f) => s + (f.saldo || 0), 0), creditos: (cartera || []).length,
      vencidos: (cartera || []).filter(f => f.fecha_pago && f.fecha_pago < hoy).length,
      venta, meta: meta?.meta || 0, ritmo: Number(hoy.slice(8, 10)) / diasMes * 100,
      clientes: clientes.size, compraron: compraron.size, visitas: (vis || []).length, compro, obsequios,
    })
  }

  const cargarSolicitudes = async () => {
    const empresaId = getEmpresaId()
    const desde = new Date(Date.now() - 90 * 864e5).toLocaleDateString('en-CA')
    const [{ data: sols }, { data: vis }, { data: enRutero }] = await Promise.all([
      supabase.from('solicitudes_rutero').select('*, clientes(nombre, apto, edificio, barrio), vendedores(nombre)').eq('ruta_id', rutaId).eq('estado', 'pendiente').eq('empresa_id', empresaId).order('created_at'),
      supabase.from('visitas_ruta').select('cliente_id, fecha, resultado').eq('ruta_id', rutaId).gte('fecha', desde).eq('empresa_id', empresaId).order('fecha', { ascending: false }),
      supabase.from('rutero').select('cliente_id, clientes(nombre, apto, edificio, barrio)').eq('ruta_id', rutaId).eq('empresa_id', empresaId),
    ])
    setSolicitudes(sols || [])
    const porCliente = {}
    ;(vis || []).forEach(v => { (porCliente[v.cliente_id] = porCliente[v.cliente_id] || []).push(v) })
    const pedidos = new Set((sols || []).map(x => x.cliente_id))
    const vistos = new Set(), sug = []
    ;(enRutero || []).forEach(r => {
      if (vistos.has(r.cliente_id) || pedidos.has(r.cliente_id)) return
      vistos.add(r.cliente_id)
      const ult = (porCliente[r.cliente_id] || []).slice(0, 3)
      if (ult.length === 3 && ult.every(v => v.resultado !== 'compro')) sug.push({ cliente_id: r.cliente_id, clientes: r.clientes, desde: ult[2].fecha })
    })
    setSugeridos(sug)
  }

  const recargar = () => { cargarRutero(); cargarResumen() }

  // Saca al cliente del rutero (de un día o de todos) y reacomoda el orden de los días que tocó.
  const sacarDelRutero = async (clienteId, diaSemana) => {
    const empresaId = getEmpresaId()
    const quitar = filas.filter(f => f.cliente_id === clienteId && (diaSemana == null || f.dia_semana === diaSemana))
    if (!quitar.length) return true
    const { error } = await supabase.from('rutero').delete().in('id', quitar.map(f => f.id)).eq('empresa_id', empresaId)
    if (error) { alert('No se pudo sacar: ' + error.message); return false }
    for (const d of new Set(quitar.map(f => f.dia_semana))) {
      const quedan = filas.filter(f => f.dia_semana === d && f.cliente_id !== clienteId).sort((a, b) => a.orden - b.orden).map(f => f.id)
      if (quedan.length) await supabase.rpc('reordenar_rutero', { p_ids: quedan })
    }
    return true
  }
  const resolverSolicitud = async (sol, aprobar) => {
    if (aprobar && !(await sacarDelRutero(sol.cliente_id, sol.dia_semana))) return
    await supabase.from('solicitudes_rutero').update({ estado: aprobar ? 'aprobada' : 'rechazada', resuelto_por: usuario?.nombre || null, resuelto_at: new Date().toISOString() }).eq('id', sol.id).eq('empresa_id', getEmpresaId())
    cargarRutero(); cargarSolicitudes()
  }
  const sacarSugerido = async (sg) => {
    if (!confirm(`¿Sacar a ${sg.clientes?.nombre} de todos los días de esta ruta? El cliente, su cartera y su historial no se borran.`)) return
    if (await sacarDelRutero(sg.cliente_id, null)) { cargarRutero(); cargarSolicitudes() }
  }

  if (!usuario) return null

  const delDia = filas.filter(f => f.dia_semana === dia).sort((a, b) => a.orden - b.orden)
  const paradas = armarParadas(delDia, edificios)
  const q = busqueda.trim().toLowerCase()
  const coincide = (f) => [f.clientes?.nombre, f.clientes?.edificio, f.clientes?.apto, f.clientes?.direccion, f.clientes?.barrio].join(' ').toLowerCase().includes(q)
  const visibles = q ? paradas.filter(p => p.filas.some(coincide) || (p.edificio?.nombre || '').toLowerCase().includes(q)) : paradas
  const paradasDia = (n) => armarParadas(filas.filter(f => f.dia_semana === n), edificios).length
  const rutaActual = rutas.find(r => r.id === rutaId)
  const vendedorDeRuta = () => resumen?.vendedores?.[0]?.id || null
  const nombreDia = DIAS.find(d => d.n === dia)?.nombre

  // --- Orden ---
  const guardarOrden = async (lista) => {
    const ids = ordenDeParadas(lista)
    setFilas(prev => prev.map(f => { const i = ids.indexOf(f.id); return i >= 0 ? { ...f, orden: i + 1 } : f }))
    const { error } = await supabase.rpc('reordenar_rutero', { p_ids: ids })
    if (error) { alert('No se pudo guardar el orden: ' + error.message); cargarRutero() }
  }
  const moverParada = (i, delta) => { const j = i + delta; if (j < 0 || j >= paradas.length) return; const l = [...paradas]; [l[i], l[j]] = [l[j], l[i]]; guardarOrden(l) }
  const soltarEn = (destinoClave) => {
    const origen = arrastrando.current; arrastrando.current = null
    if (!origen || origen === destinoClave) return
    const l = paradas.filter(p => p.clave !== origen)
    l.splice(l.findIndex(p => p.clave === destinoClave), 0, paradas.find(p => p.clave === origen))
    guardarOrden(l)
  }

  // --- Crear clientes en el rutero del día, en la posición pedida ---
  const crearEnRutero = async (nuevos, pos = posicion) => {
    const empresaId = getEmpresaId()
    const { data: creados, error } = await supabase.from('clientes').insert(nuevos.map(c => ({
      empresa_id: empresaId, ruta_id: rutaId, vendedor_id: vendedorDeRuta(), estado: true,
      nombre: c.nombre, tipo_inmueble: c.tipo_inmueble || null, edificio: c.edificio || null, edificio_id: c.edificio_id || null, direccion: c.direccion || null,
      apto: c.apto || null, barrio: c.barrio || null, telefono: c.telefono || null, frecuencia_dias: Number(c.frecuencia_dias) || 7, notas: c.notas || null,
    }))).select('id')
    if (error) { alert('No se pudo crear: ' + error.message); return false }
    const { data: rows, error: errR } = await supabase.from('rutero').insert(creados.map((c, i) => ({ empresa_id: empresaId, cliente_id: c.id, ruta_id: rutaId, dia_semana: dia, orden: delDia.length + i + 1 }))).select('id')
    if (errR) { alert('Se creó el cliente pero no entró al rutero: ' + errR.message); return false }
    // "Después de la parada N": van detrás de todos los clientes de esa parada.
    if (pos !== 'final') {
      const n = Math.max(0, Math.min(paradas.length, parseInt(pos) || 0))
      const antes = ordenDeParadas(paradas.slice(0, n)), despues = ordenDeParadas(paradas.slice(n))
      await supabase.rpc('reordenar_rutero', { p_ids: [...antes, ...rows.map(r => r.id), ...despues] })
    }
    return true
  }

  const guardarCliente = async () => {
    const f = form
    const nombre = f.nombre.trim() || [f.edificio || f.direccion, f.apto].filter(Boolean).join(' · ')
    if (!nombre) { alert('Escribe al menos el nombre, o la dirección y el apto'); return }
    setGuardando(true)
    const ok = await crearEnRutero([{ ...f, nombre }])
    setGuardando(false)
    if (!ok) return
    setForm({ ...clienteVacio, barrio: f.barrio, tipo_inmueble: f.tipo_inmueble })
    if (posicion !== 'final') setPosicion(String((parseInt(posicion) || 0) + 1))
    recargar()
  }

  const guardarEdicion = async (fila) => {
    const f = form
    setGuardando(true)
    const { error } = await supabase.from('clientes').update({
      nombre: f.nombre.trim() || [f.edificio || f.direccion, f.apto].filter(Boolean).join(' · '),
      tipo_inmueble: f.tipo_inmueble || null, edificio: f.edificio || null, direccion: f.direccion || null, apto: f.apto || null,
      barrio: f.barrio || null, telefono: f.telefono || null, frecuencia_dias: Number(f.frecuencia_dias) || 7, notas: f.notas || null,
    }).eq('id', fila.cliente_id).eq('empresa_id', getEmpresaId())
    setGuardando(false)
    if (error) { alert('Error: ' + error.message); return }
    setPanel(null); cargarRutero()
  }

  const guardarMovimiento = async (fila) => {
    const empresaId = getEmpresaId()
    const rutaDestino = destino.ruta_id || rutaId, diaDestino = Number(destino.dia)
    if (rutaDestino === rutaId && diaDestino === fila.dia_semana) { setPanel(null); return }
    setGuardando(true)
    const { data: ya } = await supabase.from('rutero').select('id').eq('cliente_id', fila.cliente_id).eq('ruta_id', rutaDestino).eq('dia_semana', diaDestino).maybeSingle()
    const { data: ultimo } = await supabase.from('rutero').select('orden').eq('ruta_id', rutaDestino).eq('dia_semana', diaDestino).order('orden', { ascending: false }).limit(1).maybeSingle()
    const ordenFinal = (ultimo?.orden || 0) + 1
    let error = null
    if (destino.tambien) {
      if (!ya) ({ error } = await supabase.from('rutero').insert({ empresa_id: empresaId, cliente_id: fila.cliente_id, ruta_id: rutaDestino, dia_semana: diaDestino, orden: ordenFinal }))
    } else {
      if (ya) ({ error } = await supabase.from('rutero').delete().eq('id', fila.id))
      else ({ error } = await supabase.from('rutero').update({ ruta_id: rutaDestino, dia_semana: diaDestino, orden: ordenFinal }).eq('id', fila.id))
      if (!error && rutaDestino !== rutaId) {
        const { data: vend } = await supabase.from('vendedores').select('id').eq('ruta_id', rutaDestino).eq('estado', true).eq('empresa_id', empresaId).limit(1).maybeSingle()
        await supabase.from('clientes').update({ ruta_id: rutaDestino, vendedor_id: vend?.id || null }).eq('id', fila.cliente_id).eq('empresa_id', empresaId)
      }
      if (!error) await supabase.rpc('reordenar_rutero', { p_ids: delDia.filter(f => f.id !== fila.id).map(f => f.id) })
    }
    setGuardando(false)
    if (error) { alert('Error: ' + error.message); return }
    setPanel(null); setFicha(null); recargar()
  }

  const quitarDelDia = async (fila) => {
    if (!confirm(`¿Quitar a ${fila.clientes?.nombre} del rutero del ${nombreDia?.toLowerCase()}? El cliente, su cartera y su historial no se borran.`)) return
    const { error } = await supabase.from('rutero').delete().eq('id', fila.id).eq('empresa_id', getEmpresaId())
    if (error) { alert('Error: ' + error.message); return }
    await supabase.rpc('reordenar_rutero', { p_ids: delDia.filter(f => f.id !== fila.id).map(f => f.id) })
    setFicha(null); recargar()
  }

  // --- Edificios ---
  const abrirEdificio = (e) => {
    setEdif(e ? { ...edificioVacio, ...Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v ?? ''])), obsequio_frecuencia: e.obsequio_frecuencia || 'semana' } : edificioVacio)
    setAptos([aptoVacio()]); setPegar('')
    setPanel({ edificio: e?.id || 'nuevo' })
  }
  const guardarEdificio = async () => {
    const nombre = edif.nombre.trim()
    if (!nombre) { alert('Escribe el nombre del edificio'); return }
    const nuevos = [...aptos, ...leerLista(pegar)].filter(a => a.apto.trim())
    if (!edif.id && !nuevos.length) { alert('Escribe al menos un apartamento'); return }
    const conObsequio = esAdmin && edif.obsequio_sku && Number(edif.obsequio_cantidad) > 0
    setGuardando(true)
    const empresaId = getEmpresaId()
    const datos = {
      empresa_id: empresaId, nombre, direccion: edif.direccion || null, barrio: edif.barrio || null,
      portero_nombre: edif.portero_nombre || null, portero_telefono: edif.portero_telefono || null, notas: edif.notas || null,
      ...(esAdmin ? {
        obsequio_sku: conObsequio ? edif.obsequio_sku : null, obsequio_cantidad: conObsequio ? Number(edif.obsequio_cantidad) : null,
        obsequio_frecuencia: conObsequio ? edif.obsequio_frecuencia : null, obsequio_autorizado_por: conObsequio ? usuario.nombre : null,
      } : {}),
    }
    let id = edif.id
    const r = id ? await supabase.from('edificios').update(datos).eq('id', id).eq('empresa_id', empresaId) : await supabase.from('edificios').insert(datos).select('id').single()
    if (r.error) { setGuardando(false); alert('No se pudo guardar el edificio: ' + r.error.message); return }
    id = id || r.data.id
    if (edif.id) await supabase.from('clientes').update({ edificio: nombre, ...(edif.direccion ? { direccion: edif.direccion } : {}), ...(edif.barrio ? { barrio: edif.barrio } : {}) }).eq('edificio_id', id).eq('empresa_id', empresaId)
    if (nuevos.length) {
      // Los apartamentos nuevos van con su edificio: si ya está en el día, detrás de él.
      const enDia = paradas.findIndex(p => p.edificio?.id === id)
      const ok = await crearEnRutero(nuevos.map(a => ({
        nombre: a.nombre.trim() || `${nombre} · ${a.apto.trim()}`, tipo_inmueble: 'edificio', edificio: nombre, edificio_id: id,
        apto: a.apto.trim(), telefono: a.telefono || null, notas: a.nota || null, direccion: edif.direccion, barrio: edif.barrio, frecuencia_dias: 7,
      })), enDia >= 0 ? String(enDia + 1) : posicion)
      if (!ok) { setGuardando(false); return }
    }
    setGuardando(false)
    setPanel(null)
    recargar()
  }

  const abrirEditar = (fila) => {
    const c = fila.clientes || {}
    setForm({ nombre: c.nombre || '', tipo_inmueble: c.tipo_inmueble || 'casa', edificio: c.edificio || '', direccion: c.direccion || '', apto: c.apto || '', barrio: c.barrio || '', telefono: c.telefono || '', frecuencia_dias: c.frecuencia_dias || 7, notas: c.notas || '' })
    setPanel({ editar: fila })
  }
  const abrirMover = (fila) => { setDestino({ ruta_id: rutaId, dia: fila.dia_semana, tambien: false }); setPanel({ mover: fila }) }

  // --- Clientes de la ruta (todos los días) ---
  const unicos = []
  const vistos = new Set()
  filas.forEach(f => { if (!vistos.has(f.cliente_id)) { vistos.add(f.cliente_id); unicos.push(f) } })
  const diasDe = (cid) => filas.filter(f => f.cliente_id === cid).map(f => DIAS.find(d => d.n === f.dia_semana)?.corto).join(' ')
  const sinComprar = (cid) => { const u = actividad.ventas[cid]?.ultima; return !u || diasDesde(u) >= 14 }
  const FILTROS = [['todos', 'Todos', unicos], ['sin', 'Sin comprar 14 días', unicos.filter(f => sinComprar(f.cliente_id))], ['deuda', 'Con deuda', unicos.filter(f => actividad.deuda[f.cliente_id] > 0)], ['desc', 'Con descuento', unicos.filter(f => actividad.precios[f.cliente_id])]]
  const listaClientes = (FILTROS.find(x => x[0] === filtro)?.[2] || unicos).filter(f => !q || coincide(f))
  const edificiosRuta = Object.values(edificios).filter(e => unicos.some(f => f.clientes?.edificio_id === e.id)).sort((a, b) => a.nombre.localeCompare(b.nombre))
  const nombreProducto = (sku) => productos.find(p => p.sku === sku)?.nombre || sku
  const nombreCliente = (c) => c?.edificio_id ? `${etiquetaApto(c)} · ${c.edificio}` : c?.nombre

  const posicionSelect = (
    <div>
      <label className={etq}>¿Dónde va en el rutero del {nombreDia?.toLowerCase()}?</label>
      <select value={posicion} onChange={e => setPosicion(e.target.value)} className={campo} style={{ borderColor: C.linea }}>
        <option value="final">De última parada (#{paradas.length + 1})</option>
        <option value="0">De primera</option>
        {paradas.map((p, i) => <option key={p.clave} value={String(i + 1)}>Después de la #{i + 1} · {p.edificio?.nombre || p.fila.clientes?.nombre}</option>)}
      </select>
    </div>
  )
  const inp = (val, set, props = {}) => <input value={val} onChange={e => set(e.target.value)} className={campo} style={{ borderColor: C.linea }} {...props} />

  const camposCliente = (
    <div className="flex flex-col gap-3">
      <div><label className={etq}>Nombre (si no se sabe, déjalo vacío)</label>{inp(form.nombre, v => setForm({ ...form, nombre: v }), { placeholder: 'Doña Marta' })}</div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className={etq}>Tipo</label><select value={form.tipo_inmueble} onChange={e => setForm({ ...form, tipo_inmueble: e.target.value })} className={campo} style={{ borderColor: C.linea }}>{TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
        <div><label className={etq}>Apto o piso</label>{inp(form.apto, v => setForm({ ...form, apto: v }), { placeholder: '401' })}</div>
      </div>
      <div><label className={etq}>Dirección</label>{inp(form.direccion, v => setForm({ ...form, direccion: v }), { placeholder: 'Carrera 78A #33A-76' })}</div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className={etq}>Barrio</label>{inp(form.barrio, v => setForm({ ...form, barrio: v }))}</div>
        <div><label className={etq}>Teléfono</label>{inp(form.telefono, v => setForm({ ...form, telefono: v }), { inputMode: 'tel' })}</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className={etq}>Cada cuánto compra</label><select value={form.frecuencia_dias} onChange={e => setForm({ ...form, frecuencia_dias: e.target.value })} className={campo} style={{ borderColor: C.linea }}>{FRECUENCIAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
        <div><label className={etq}>Nota</label>{inp(form.notas, v => setForm({ ...form, notas: v }), { placeholder: 'Timbrar al 401' })}</div>
      </div>
    </div>
  )

  const Ficha = ({ f }) => {
    const c = f.clientes || {}, v = actividad.ventas[f.cliente_id], d = actividad.deuda[f.cliente_id], pr = actividad.precios[f.cliente_id]
    const dato = (k, val) => <span className="min-w-0"><span className="block text-[12px]" style={{ color: C.gris }}>{k}</span><span className="font-bold break-words">{val}</span></span>
    return (
      <div className="rounded-2xl p-3.5 grid gap-x-4 gap-y-2.5 text-sm" style={{ background: C.fondo, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {dato('Cliente', primerNombre(c) ? c.nombre : 'Sin nombre todavía')}
        {dato('Dónde', [c.edificio_id ? `Apto ${c.apto || '—'}` : null, c.direccion, c.barrio].filter(Boolean).join(' · ') || '—')}
        {dato('WhatsApp', c.telefono || 'Sin teléfono')}
        {dato('Nota', c.notas || '—')}
        {dato('Debe', d ? fmt(d) : 'Nada')}
        {dato('Compras', v?.ultima ? `Última ${diasDesde(v.ultima) === 0 ? 'hoy' : `hace ${diasDesde(v.ultima)} días`}${v.mes ? ` · este mes ${fmt(v.mes)}` : ''}` : 'Nunca ha comprado')}
        {pr && <span className="col-span-full">{dato('Descuento', pr.map(p => `${nombreProducto(p.sku)} a ${fmt(p.precio_especial)}`).join(' · '))}</span>}
        <span className="col-span-full flex gap-2 flex-wrap">
          <Boton onClick={() => abrirEditar(f)} className="bg-white">Editar datos</Boton>
          {esAdmin && <Boton onClick={() => setPanel({ descuento: f.cliente_id, nombre: nombreCliente(c) })}>{pr ? 'Cambiar descuento' : 'Poner descuento'}</Boton>}
          <Boton onClick={() => abrirMover(f)}>Mover</Boton>
          <Boton onClick={() => quitarDelDia(f)} style={{ color: C.rojo }}>Quitar del {nombreDia?.toLowerCase()}</Boton>
        </span>
      </div>
    )
  }

  const chip = (f) => {
    const c = f.clientes || {}, portero = /porter/i.test(c.apto || '') || /porter/i.test(c.nombre || '')
    const desc = actividad.precios[f.cliente_id], debe = actividad.deuda[f.cliente_id] > 0
    const [bg, col] = portero ? [C.verdeF, C.verde] : desc ? [C.ambarF, C.ambar] : debe ? [C.rojoF, C.rojo] : [C.fondo, C.tinta]
    return (
      <button key={f.id} type="button" onClick={() => setFicha(ficha === f.id ? null : f.id)} aria-expanded={ficha === f.id}
        className="text-[13px] font-bold px-2.5 py-1.5 rounded-lg" style={{ background: bg, color: col, boxShadow: ficha === f.id ? `inset 0 0 0 2px ${C.tinta}` : 'none' }}>
        {etiquetaApto(c)}
      </button>
    )
  }

  return (
    <div style={{ background: C.fondo, color: C.tinta }} className="min-h-screen">
      <PageHeader title="Rutas" subtitle="Rutero, clientes, edificios y descuentos de cada ruta" />
      <div className="p-4 max-w-6xl mx-auto flex flex-col gap-4">
        <div className="bg-white rounded-[18px] p-3 flex gap-2.5 flex-wrap items-center">
          <div className="flex gap-1 rounded-full p-1 flex-wrap" style={{ background: C.fondo }} role="group" aria-label="Ruta">
            {rutas.map(r => <button key={r.id} type="button" aria-pressed={r.id === rutaId} onClick={() => setRutaId(r.id)} className="rounded-full min-h-[36px] px-3.5 text-[13.5px] font-bold"
              style={r.id === rutaId ? { background: '#fff', boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { color: C.gris }}>{r.nombre.replace(/^RUTA\s+/i, '').replace(/\b(\w)(\w*)/g, (_, a, b) => a + b.toLowerCase())}</button>)}
          </div>
          {resumen && <span className="text-[13px] ml-auto" style={{ color: C.gris }}>{resumen.vendedores.map(v => v.nombre).join(', ') || 'Sin vendedor'}{resumen.vendedores[0]?.telefono ? ` · ${resumen.vendedores[0].telefono}` : ''} · {resumen.vehiculo ? `${resumen.vehiculo.placa}${resumen.vehiculo.modelo ? ' ' + resumen.vehiculo.modelo : ''}` : 'sin vehículo'}</span>}
        </div>

        {resumen && (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <Kpi rotulo="Ventas del mes" valor={fmt(resumen.venta)} nota={resumen.meta ? `${Math.round(resumen.venta / resumen.meta * 100)}% de la meta de ${fmt(resumen.meta)} · al ritmo, ${Math.round(resumen.ritmo)}%` : 'Sin meta este mes'}
              pill={resumen.meta ? (resumen.venta / resumen.meta * 100 >= resumen.ritmo ? ['verde', 'Al ritmo'] : resumen.venta / resumen.meta * 100 >= resumen.ritmo * 0.9 ? ['ambar', 'Cerca'] : ['rojo', 'Lejos de la meta']) : null} />
            <Kpi rotulo="Clientes que compran" valor={`${resumen.compraron} de ${resumen.clientes}`} nota="Compraron en los últimos 14 días" />
            <Kpi rotulo="Visitas con venta" valor={resumen.visitas ? `${Math.round(resumen.compro / resumen.visitas * 100)}%` : 'Sin dato'} nota={resumen.visitas ? `${resumen.compro} ventas en ${resumen.visitas} visitas este mes` : 'Se marcan en Mi ruta'} />
            <Kpi rotulo="Por cobrar" valor={fmt(resumen.cartera)} nota={`${resumen.creditos} créditos${resumen.vencidos ? ` · ${resumen.vencidos} vencidos` : ''}`} rojo={resumen.vencidos > 0} />
            <Kpi rotulo="Obsequios del mes" valor={fmt(resumen.obsequios.valor)} nota={resumen.obsequios.und ? `${resumen.obsequios.und.toLocaleString('es-CO')} unidades${resumen.obsequios.edificios ? ` · ${resumen.obsequios.edificios} porterías` : ''}` : 'Ninguno este mes'} />
          </div>
        )}

        {rutaId && <HoyEnLaCalle key={rutaId} rutaId={rutaId} totalHoy={new Set(filas.filter(f => f.dia_semana === hoyDia()).map(f => f.cliente_id)).size} />}

        {(solicitudes.length > 0 || sugeridos.length > 0) && (
          <div className="rounded-[18px] p-4 flex flex-col gap-2" style={{ background: C.ambarF }}>
            {solicitudes.length > 0 && <b>El vendedor pide sacar {solicitudes.length === 1 ? 'a 1 cliente' : `a ${solicitudes.length} clientes`}</b>}
            {solicitudes.map(sol => (
              <div key={sol.id} className="bg-white rounded-xl p-3 flex flex-wrap items-center gap-3">
                <span className="flex-1 min-w-[200px] text-sm"><b>{sol.clientes?.nombre}</b><br /><b>{sol.motivo}</b>{sol.detalle ? ` · ${sol.detalle}` : ''}<br /><span style={{ color: C.gris }}>{sol.dia_semana ? `Del ${DIAS.find(d => d.n === sol.dia_semana)?.nombre.toLowerCase()}` : 'De todos los días'} · lo pidió {sol.pedido_por || sol.vendedores?.nombre || 'el vendedor'}</span></span>
                <Boton onClick={() => resolverSolicitud(sol, false)}>Dejarlo</Boton><Boton tipo="tinta" onClick={() => resolverSolicitud(sol, true)}>Sacar</Boton>
              </div>
            ))}
            {sugeridos.length > 0 && <b className="pt-1">Llevan 3 visitas seguidas sin comprar</b>}
            {sugeridos.map(sg => (
              <div key={sg.cliente_id} className="bg-white rounded-xl p-3 flex flex-wrap items-center gap-3">
                <span className="flex-1 min-w-[200px] text-sm"><b>{sg.clientes?.nombre}</b><br /><span style={{ color: C.gris }}>Sin comprar desde el {new Date(sg.desde + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}</span></span>
                <Boton tipo="tinta" onClick={() => sacarSugerido(sg)}>Sacar de la ruta</Boton>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-1 bg-white rounded-full p-1 w-max max-w-full overflow-x-auto" role="tablist">
          {[['rutero', 'Rutero'], ['clientes', 'Clientes'], ['edificios', 'Edificios'], ['descuentos', 'Descuentos']].map(([id, n]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setFicha(null) }} className="rounded-full min-h-[40px] px-4 text-sm font-bold whitespace-nowrap"
              style={tab === id ? { background: C.tinta, color: '#fff' } : { color: C.gris }}>{n}</button>
          ))}
        </div>

        <div className="flex flex-wrap gap-4 items-start">
          <div className="bg-white rounded-[18px] p-4 min-w-0 flex flex-col gap-3" style={{ flex: '999 1 560px' }}>
            {tab === 'rutero' && <>
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <div className="flex gap-1 rounded-full p-1 flex-wrap" style={{ background: C.fondo }} role="group" aria-label="Día">
                  {DIAS.map(d => <button key={d.n} type="button" aria-pressed={d.n === dia} onClick={() => { setDia(d.n); setPanel(null); setFicha(null); setPosicion('final') }} className="rounded-full min-h-[36px] px-3 text-[13.5px] font-bold"
                    style={d.n === dia ? { background: '#fff', boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { color: C.gris }}>{d.corto} <span className="font-normal opacity-60">{paradasDia(d.n)}</span></button>)}
                </div>
                <span className="flex gap-2 flex-wrap">
                  <Boton onClick={() => { setForm(clienteVacio); setPanel('cliente') }}>+ Cliente</Boton>
                  <Boton onClick={() => abrirEdificio(null)}>+ Edificio</Boton>
                  <a href={`/rutas/imprimir?ruta=${rutaId}&dia=${dia}`} target="_blank" rel="noreferrer" className="rounded-xl min-h-[40px] px-3.5 text-sm font-bold flex items-center" style={{ background: C.suave }}>Imprimir</a>
                </span>
              </div>
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar cliente, edificio, apto o barrio" className={campo} style={{ borderColor: C.linea }} />
              <p className="text-[13px]" style={{ color: C.gris }}>{nombreDia} · {paradas.length} paradas · {delDia.length} clientes. Edificios y clientes sueltos van juntos, en el orden de visita. Toca un apartamento para ver su ficha. Ámbar: descuento · verde: portero · rojo: debe.</p>
              {cargando ? <p className="text-center py-10" style={{ color: C.gris }}>Cargando…</p> : paradas.length === 0 ? (
                <div className="text-center py-10"><b>Este día no tiene clientes todavía</b><p className="text-sm" style={{ color: C.gris }}>Dale “+ Cliente” o “+ Edificio”.</p></div>
              ) : visibles.map(p => {
                const i = paradas.indexOf(p)
                const e = p.edificio, f = p.fila
                const compraron = p.filas.filter(x => actividad.ventas[x.cliente_id]?.ultima && diasDesde(actividad.ventas[x.cliente_id].ultima) < 14).length
                return (
                  <div key={p.clave} draggable={!q} onDragStart={() => { arrastrando.current = p.clave }} onDragOver={ev => ev.preventDefault()} onDrop={() => soltarEn(p.clave)}
                    className="rounded-2xl p-3 grid gap-2.5 items-start" style={{ gridTemplateColumns: '28px minmax(0,1fr) auto', ...(e ? { boxShadow: `inset 0 0 0 1.5px ${C.linea}` } : { background: C.fondo }) }}>
                    <span className="text-right font-extrabold pt-0.5" style={{ ...titulo, color: C.gris }}>{i + 1}</span>
                    {e ? (
                      <span className="min-w-0 flex flex-col gap-2">
                        <button type="button" onClick={() => abrirEdificio(e)} className="text-left"><b>{e.nombre}</b><br /><span className="text-[13px]" style={{ color: C.gris }}>{[e.barrio, `${p.filas.length} ${p.filas.length === 1 ? 'apartamento' : 'apartamentos'}`, e.obsequio_sku ? 'portero con obsequio' : null].filter(Boolean).join(' · ')}</span></button>
                        <span className="flex flex-wrap gap-1.5">{p.filas.filter(x => !q || coincide(x) || e.nombre.toLowerCase().includes(q)).map(chip)}</span>
                        {p.filas.some(x => x.id === ficha) && <Ficha f={p.filas.find(x => x.id === ficha)} />}
                      </span>
                    ) : (
                      <span className="min-w-0 flex flex-col gap-2">
                        <button type="button" onClick={() => setFicha(ficha === f.id ? null : f.id)} aria-expanded={ficha === f.id} className="text-left min-w-0">
                          <b className="break-words">{f.clientes?.nombre}</b><br /><span className="text-[13px] break-words" style={{ color: C.gris }}>{detalleCliente(f.clientes || {}) || 'Sin dirección'}{f.clientes?.notas ? ` · ${f.clientes.notas}` : ''}</span>
                        </button>
                        {ficha === f.id && <Ficha f={f} />}
                      </span>
                    )}
                    <span className="flex flex-col items-end gap-1.5">
                      <span className="flex gap-1">
                        <button type="button" onClick={() => moverParada(i, -1)} disabled={i === 0 || !!q} aria-label="Subir" className="w-8 h-8 rounded-lg font-bold disabled:opacity-30" style={{ background: e ? C.suave : '#fff' }}>↑</button>
                        <button type="button" onClick={() => moverParada(i, 1)} disabled={i === paradas.length - 1 || !!q} aria-label="Bajar" className="w-8 h-8 rounded-lg font-bold disabled:opacity-30" style={{ background: e ? C.suave : '#fff' }}>↓</button>
                      </span>
                      {e?.obsequio_sku && <Pill tono="verde">Obsequio</Pill>}
                      {e && <Pill>{compraron} {compraron === 1 ? 'compra' : 'compran'}</Pill>}
                      {!e && actividad.deuda[f.cliente_id] > 0 && <Pill tono="rojo">Debe {fmt(actividad.deuda[f.cliente_id])}</Pill>}
                      {!e && actividad.precios[f.cliente_id] && <Pill tono="ambar">Descuento</Pill>}
                    </span>
                  </div>
                )
              })}
            </>}

            {tab === 'clientes' && <>
              <div className="flex gap-1 rounded-full p-1 flex-wrap w-max max-w-full" style={{ background: C.fondo }} role="group" aria-label="Filtro">
                {FILTROS.map(([id, n, l]) => <button key={id} type="button" aria-pressed={filtro === id} onClick={() => setFiltro(id)} className="rounded-full min-h-[36px] px-3 text-[13.5px] font-bold"
                  style={filtro === id ? { background: '#fff', boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { color: C.gris }}>{n} · {l.length}</button>)}
              </div>
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar cliente, edificio, apto o barrio" className={campo} style={{ borderColor: C.linea }} />
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                  <thead><tr className="text-left text-xs uppercase tracking-wide" style={{ color: C.gris }}><th className="py-2 pr-2">Cliente</th><th className="py-2 pr-2">Días</th><th className="py-2 pr-2 text-right">Última compra</th><th className="py-2 pr-2 text-right">Este mes</th><th className="py-2 text-right">Debe</th></tr></thead>
                  <tbody>
                    {listaClientes.slice(0, 300).map(f => {
                      const c = f.clientes || {}, v = actividad.ventas[f.cliente_id], d = actividad.deuda[f.cliente_id]
                      return (
                        <tr key={f.cliente_id} className="border-t align-top" style={{ borderColor: C.linea }}>
                          <td className="py-2.5 pr-2"><b>{c.edificio_id ? etiquetaApto(c) : c.nombre}</b>{actividad.precios[f.cliente_id] && <> <Pill tono="ambar">Descuento</Pill></>}<br /><span className="text-[13px]" style={{ color: C.gris }}>{c.edificio_id ? c.edificio : detalleCliente(c)}</span></td>
                          <td className="py-2.5 pr-2">{diasDe(f.cliente_id)}</td>
                          <td className="py-2.5 pr-2 text-right tabular-nums">{v?.ultima ? (diasDesde(v.ultima) === 0 ? 'hoy' : `hace ${diasDesde(v.ultima)} días`) : 'nunca'}</td>
                          <td className="py-2.5 pr-2 text-right tabular-nums">{v?.mes ? fmt(v.mes) : '—'}</td>
                          <td className="py-2.5 text-right tabular-nums" style={{ color: d ? C.rojo : C.gris }}>{d ? fmt(d) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[13px]" style={{ color: C.gris }}>“Sin comprar 14 días” es la lista para limpiar el rutero: visitarlos o sacarlos.</p>
            </>}

            {tab === 'edificios' && <>
              <div className="flex justify-between gap-2 flex-wrap items-center"><span className="text-[13px]" style={{ color: C.gris }}>{edificiosRuta.length} edificios en esta ruta · toca uno para ver o cambiar sus datos, su portero y su obsequio</span><Boton tipo="rojo" onClick={() => abrirEdificio(null)}>+ Edificio</Boton></div>
              <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                {edificiosRuta.filter(e => !q || e.nombre.toLowerCase().includes(q)).map(e => {
                  const n = unicos.filter(f => f.clientes?.edificio_id === e.id).length
                  return (
                    <button key={e.id} type="button" onClick={() => abrirEdificio(e)} className="text-left rounded-2xl p-3 flex flex-col gap-1" style={{ background: C.fondo }}>
                      <b>{e.nombre}</b>
                      <span className="text-[13px]" style={{ color: C.gris }}>{[e.barrio, `${n} ${n === 1 ? 'apartamento' : 'apartamentos'}`, e.portero_nombre ? `portero ${e.portero_nombre}` : null].filter(Boolean).join(' · ')}</span>
                      {e.obsequio_sku && <span><Pill tono="verde">Obsequio: {Number(e.obsequio_cantidad).toLocaleString('es-CO')} {nombreProducto(e.obsequio_sku)} · {FRECUENCIA_OBSEQUIO[e.obsequio_frecuencia]?.toLowerCase()}</Pill></span>}
                    </button>
                  )
                })}
              </div>
            </>}

            {tab === 'descuentos' && <>
              <div className="flex justify-between gap-2 flex-wrap items-center"><span className="text-[13px]" style={{ color: C.gris }}>Solo el admin los pone. En Mi ruta el vendedor los ve y se aplican solos al venderle a ese cliente.</span></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead><tr className="text-left text-xs uppercase tracking-wide" style={{ color: C.gris }}><th className="py-2 pr-2">Cliente</th><th className="py-2 pr-2">Producto</th><th className="py-2 pr-2 text-right">Lista</th><th className="py-2 pr-2 text-right">Le cobramos</th><th className="py-2 text-right">Descuento</th></tr></thead>
                  <tbody>
                    {unicos.filter(f => actividad.precios[f.cliente_id]).flatMap(f => actividad.precios[f.cliente_id].map(p => {
                      const lista = Number(productos.find(x => x.sku === p.sku)?.precio_venta) || 0
                      return (
                        <tr key={f.cliente_id + p.sku} className="border-t" style={{ borderColor: C.linea }}>
                          <td className="py-2.5 pr-2"><button type="button" onClick={() => esAdmin && setPanel({ descuento: f.cliente_id, nombre: nombreCliente(f.clientes) })} className="text-left font-bold underline-offset-2 hover:underline">{nombreCliente(f.clientes)}</button></td>
                          <td className="py-2.5 pr-2">{nombreProducto(p.sku)}</td>
                          <td className="py-2.5 pr-2 text-right tabular-nums">{lista ? fmt(lista) : '—'}</td>
                          <td className="py-2.5 pr-2 text-right tabular-nums font-bold">{fmt(p.precio_especial)}</td>
                          <td className="py-2.5 text-right tabular-nums">{lista ? `${((p.precio_especial / lista - 1) * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 }).replace('-', '−')}%` : '—'}</td>
                        </tr>
                      )
                    }))}
                  </tbody>
                </table>
              </div>
              {esAdmin && (
                <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: C.fondo }}>
                  <b>Nuevo descuento</b>
                  <select defaultValue="" onChange={e => { const f = unicos.find(x => x.cliente_id === e.target.value); if (f) setPanel({ descuento: f.cliente_id, nombre: nombreCliente(f.clientes) }); e.target.value = '' }} className={campo} style={{ borderColor: C.linea }} aria-label="Escoger cliente">
                    <option value="">Escoge el cliente de la ruta…</option>
                    {unicos.map(f => <option key={f.cliente_id} value={f.cliente_id}>{nombreCliente(f.clientes)}</option>)}
                  </select>
                </div>
              )}
            </>}
          </div>

          {/* En el celular el panel sale encima, desde abajo; en pantalla grande, al lado. */}
          {panel && (
            <div className="fixed inset-0 z-40 flex items-end bg-black/40 md:static md:inset-auto md:z-auto md:bg-transparent md:block md:min-w-0" style={{ flex: '1 1 340px' }} onClick={e => { if (e.target === e.currentTarget) setPanel(null) }}>
              <div className="bg-white w-full rounded-t-3xl md:rounded-[18px] p-4 flex flex-col gap-3 min-w-0 max-h-[88vh] overflow-y-auto md:max-h-none md:overflow-visible" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
                {panel === 'cliente' && <>
                  <h3 className="text-lg font-extrabold" style={titulo}>Nuevo cliente · {nombreDia}</h3>
                  {camposCliente}{posicionSelect}
                  <div className="flex gap-2"><Boton className="flex-1" onClick={() => setPanel(null)}>Cerrar</Boton><Boton tipo="rojo" className="flex-1" onClick={guardarCliente} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar y agregar otro'}</Boton></div>
                </>}

                {panel?.edificio && <>
                  <h3 className="text-lg font-extrabold" style={titulo}>{edif.id ? edif.nombre : 'Nuevo edificio'}</h3>
                  <div><label className={etq}>Nombre</label>{inp(edif.nombre, v => setEdif({ ...edif, nombre: v }), { placeholder: 'Edificio Bayona' })}</div>
                  <div><label className={etq}>Dirección</label>{inp(edif.direccion, v => setEdif({ ...edif, direccion: v }), { placeholder: 'Cra 76 #33-21' })}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className={etq}>Barrio</label>{inp(edif.barrio, v => setEdif({ ...edif, barrio: v }))}</div>
                    <div><label className={etq}>Nota de portería</label>{inp(edif.notas, v => setEdif({ ...edif, notas: v }), { placeholder: 'La lista la hace el portero' })}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className={etq}>Portero</label>{inp(edif.portero_nombre, v => setEdif({ ...edif, portero_nombre: v }), { placeholder: 'Luis' })}</div>
                    <div><label className={etq}>Teléfono de la portería</label>{inp(edif.portero_telefono, v => setEdif({ ...edif, portero_telefono: v }), { inputMode: 'tel' })}</div>
                  </div>
                  <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: C.verdeF }}>
                    <b style={{ color: C.verde }}>Obsequio al portero</b>
                    {esAdmin ? <>
                      <select value={edif.obsequio_sku} onChange={e => setEdif({ ...edif, obsequio_sku: e.target.value })} className={campo} style={{ borderColor: C.linea }} aria-label="Producto del obsequio">
                        <option value="">Sin obsequio</option>
                        {productos.map(p => <option key={p.sku} value={p.sku}>{p.nombre}</option>)}
                      </select>
                      {edif.obsequio_sku && <div className="grid grid-cols-2 gap-2">
                        <div><label className={etq}>Cantidad (unidades)</label>{inp(edif.obsequio_cantidad, v => setEdif({ ...edif, obsequio_cantidad: v.replace(/[^\d.,]/g, '') }), { inputMode: 'decimal', placeholder: '1' })}</div>
                        <div><label className={etq}>Cada cuánto</label><select value={edif.obsequio_frecuencia} onChange={e => setEdif({ ...edif, obsequio_frecuencia: e.target.value })} className={campo} style={{ borderColor: C.linea }}>{Object.entries(FRECUENCIA_OBSEQUIO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
                      </div>}
                      <span className="text-[12.5px]" style={{ color: C.verde }}>En Mi ruta le sale al vendedor un botón en esta parada. Se descuenta del carro y queda como obsequio en la liquidación.</span>
                    </> : <span className="text-sm" style={{ color: C.verde }}>{edif.obsequio_sku ? `${edif.obsequio_cantidad} ${nombreProducto(edif.obsequio_sku)} · ${FRECUENCIA_OBSEQUIO[edif.obsequio_frecuencia]?.toLowerCase()}. Solo el admin lo cambia.` : 'Sin obsequio. Solo el admin lo autoriza.'}</span>}
                  </div>
                  {edif.id && (() => {
                    const deEste = unicos.filter(f => f.clientes?.edificio_id === edif.id)
                    return deEste.length > 0 && <div className="flex flex-col gap-1.5"><b className="text-sm">Apartamentos · {deEste.length}</b><span className="flex flex-wrap gap-1.5">{deEste.map(f => <span key={f.cliente_id} className="text-[13px] font-bold px-2.5 py-1.5 rounded-lg" style={{ background: C.fondo }}>{etiquetaApto(f.clientes)}</span>)}</span></div>
                  })()}
                  <b className="text-sm pt-1">{edif.id ? 'Agregar apartamentos' : 'Apartamentos y clientes'}</b>
                  <span className="text-[12.5px]" style={{ color: C.gris }}>Con los datos que se tengan de cada cliente; lo que falte se completa después o lo completa el vendedor.</span>
                  {aptos.map((a, i) => (
                    <div key={i} className="grid gap-1.5" style={{ gridTemplateColumns: '70px minmax(0,1fr) minmax(0,1fr)' }}>
                      <input value={a.apto} onChange={e => setAptos(l => l.map((x, j) => j === i ? { ...x, apto: e.target.value } : x))} placeholder="Apto" aria-label="Apto" className={campo + ' !px-2'} style={{ borderColor: C.linea }} />
                      <input value={a.nombre} onChange={e => setAptos(l => l.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))} placeholder="Nombre" aria-label="Nombre" className={campo} style={{ borderColor: C.linea }} />
                      <input value={a.telefono} onChange={e => setAptos(l => l.map((x, j) => j === i ? { ...x, telefono: e.target.value } : x))} placeholder="Teléfono" inputMode="tel" aria-label="Teléfono" className={campo} style={{ borderColor: C.linea }} />
                      <input value={a.nota} onChange={e => setAptos(l => l.map((x, j) => j === i ? { ...x, nota: e.target.value } : x))} placeholder="Nota (opcional)" aria-label="Nota" className={campo + ' col-span-3 !h-10'} style={{ borderColor: C.linea }} />
                    </div>
                  ))}
                  <Boton onClick={() => setAptos(l => [...l, aptoVacio()])}>+ Otro apartamento</Boton>
                  <label className="flex flex-col gap-1"><span className={etq}>O pega una lista, uno por línea: “201 Ana Gómez 3001234567”</span>
                    <textarea value={pegar} onChange={e => setPegar(e.target.value)} rows={3} className="w-full rounded-xl border-2 p-3 text-[15px] bg-white" style={{ borderColor: C.linea }} /></label>
                  {!edif.id && posicionSelect}
                  <div className="flex gap-2"><Boton className="flex-1" onClick={() => setPanel(null)}>Cerrar</Boton>
                    <Boton tipo="rojo" className="flex-1" onClick={guardarEdificio} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar edificio'}</Boton></div>
                </>}

                {panel?.editar && <>
                  <h3 className="text-lg font-extrabold" style={titulo}>Editar cliente</h3>
                  {camposCliente}
                  <div className="flex gap-2"><Boton className="flex-1" onClick={() => setPanel(null)}>Cancelar</Boton><Boton tipo="rojo" className="flex-1" onClick={() => guardarEdicion(panel.editar)} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton></div>
                </>}

                {panel?.descuento && <>
                  <h3 className="text-lg font-extrabold" style={titulo}>Descuento · {panel.nombre}</h3>
                  <PreciosEspecialesCliente clienteId={panel.descuento} onCambio={() => cargarActividad(filas.map(f => f.cliente_id))} />
                  <Boton onClick={() => setPanel(null)}>Listo</Boton>
                </>}

                {panel?.mover && <>
                  <h3 className="text-lg font-extrabold" style={titulo}>Mover a {panel.mover.clientes?.nombre}</h3>
                  <div><label className={etq}>Ruta</label><select value={destino.ruta_id} onChange={e => setDestino({ ...destino, ruta_id: e.target.value })} className={campo} style={{ borderColor: C.linea }}>{rutas.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select></div>
                  <div><label className={etq}>Día</label><select value={destino.dia} onChange={e => setDestino({ ...destino, dia: e.target.value })} className={campo} style={{ borderColor: C.linea }}>{DIAS.map(d => <option key={d.n} value={d.n}>{d.nombre}</option>)}</select></div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={destino.tambien} onChange={e => setDestino({ ...destino, tambien: e.target.checked })} className="w-4 h-4" />Dejarlo también en este día (se visita dos veces)</label>
                  <p className="text-[13px]" style={{ color: C.gris }}>Allá queda de último; después lo acomodas en su puesto.</p>
                  <div className="flex gap-2"><Boton className="flex-1" onClick={() => setPanel(null)}>Cancelar</Boton><Boton tipo="rojo" className="flex-1" onClick={() => guardarMovimiento(panel.mover)} disabled={guardando}>{guardando ? 'Guardando…' : destino.tambien ? 'Agregar' : 'Mover'}</Boton></div>
                </>}
              </div>
            </div>
          )}
        </div>
        <p className="text-[12.5px]" style={{ color: C.gris }}>{rutaActual?.nombre}</p>
      </div>
    </div>
  )
}

function Kpi({ rotulo, valor, nota, pill, rojo }) {
  const t = pill && { verde: [C.verdeF, C.verde], ambar: [C.ambarF, C.ambar], rojo: [C.rojoF, C.rojo] }[pill[0]]
  return (
    <div className="bg-white rounded-[18px] p-3.5 flex flex-col gap-1 min-w-0">
      <span className="text-[13px] font-bold" style={{ color: C.gris }}>{rotulo}</span>
      <span className="cifra-caja"><span className="cifra font-extrabold tabular-nums" style={{ ...titulo, color: rojo ? C.rojo : C.tinta, '--cifra-max': '24px' }}>{valor}</span></span>
      <span className="text-[13px]" style={{ color: C.gris }}>{nota}</span>
      {pill && <span className="text-xs font-bold px-2.5 py-1 rounded-full self-start" style={{ background: t[0], color: t[1] }}>{pill[1]}</span>}
    </div>
  )
}
