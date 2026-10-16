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
import HoyEnLaCalle from './HoyEnLaCalle'
import PreciosEspecialesCliente from '@/components/PreciosEspecialesCliente'

// Modulo Rutas: el rutero de cada ruta por dia, en el orden en que se
// visitan. El cliente es uno solo (credito, ventas y visitas cuelgan de el);
// el rutero solo dice en que ruta, que dia(s) y en que puesto va.
const TIPOS = [['casa', 'Casa'], ['edificio', 'Edificio'], ['unidad', 'Unidad'], ['negocio', 'Negocio']]
const FRECUENCIAS = [[7, 'Cada 8 días'], [15, 'Cada 15 días'], [3, '2 veces por semana'], [30, 'Cada mes']]
const fmt = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO')
const hoyDia = () => { const d = new Date(obtenerFechaActual() + 'T12:00:00').getDay(); return d === 0 ? 1 : d }
const clienteVacio = { nombre: '', tipo_inmueble: 'casa', edificio: '', direccion: '', apto: '', barrio: '', telefono: '', frecuencia_dias: 7, notas: '' }
const input = 'w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none bg-white'
const etiqueta = 'text-xs font-bold text-gray-600 block mb-1'

export default function Rutas() {
  const router = useRouter()
  const [usuario, setUsuario] = useState(null)
  const [rutas, setRutas] = useState([])
  const [rutaId, setRutaId] = useState('')
  const [dia, setDia] = useState(hoyDia())
  const [filas, setFilas] = useState([])
  const [resumen, setResumen] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [panel, setPanel] = useState(null) // null | 'cliente' | 'edificio' | {editar: fila} | {mover: fila}
  const [form, setForm] = useState(clienteVacio)
  const [posicion, setPosicion] = useState('final')
  const [edificio, setEdificio] = useState({ edificio: '', direccion: '', barrio: '', aptos: '', notas: '' })
  const [destino, setDestino] = useState({ ruta_id: '', dia: 2, tambien: false })
  const [guardando, setGuardando] = useState(false)
  // Pedidos del vendedor para sacar clientes, y los que llevan 3 visitas seguidas sin comprar.
  const [solicitudes, setSolicitudes] = useState([])
  const [sugeridos, setSugeridos] = useState([])
  const [conDescuento, setConDescuento] = useState(new Set()) // clientes con precio pactado
  const arrastrando = useRef(null)

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (!puedeVerModulo(parsed, 'rutas', ['admin', 'auxiliar'])) { router.push('/despacho'); return }
    setUsuario(parsed)
    supabase.from('rutas').select('id, nombre').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
      .then(({ data }) => { setRutas(data || []); if (data?.length) setRutaId(data[0].id) })
  }, [])

  useEffect(() => { if (rutaId) { cargarRutero(); cargarResumen(); cargarSolicitudes() } }, [rutaId])

  const cargarRutero = async () => {
    setCargando(true)
    const { data } = await supabase.from('rutero')
      .select('id, dia_semana, orden, cliente_id, clientes(id, nombre, telefono, direccion, apto, edificio, barrio, tipo_inmueble, frecuencia_dias, notas, estado)')
      .eq('ruta_id', rutaId).eq('empresa_id', getEmpresaId()).order('orden')
    setFilas(data || [])
    setCargando(false)
    cargarDescuentos()
  }

  const cargarDescuentos = async () => {
    const { data } = await supabase.from('clientes_precios').select('cliente_id').eq('empresa_id', getEmpresaId())
    setConDescuento(new Set((data || []).map(x => x.cliente_id)))
  }

  const cargarResumen = async () => {
    const empresaId = getEmpresaId()
    const hoy = obtenerFechaActual()
    const mes = hoy.slice(0, 7)
    const inicio = mes + '-01'
    const [{ data: vends }, { data: vehs }, { data: cartera }, { data: desp }, { data: meta }] = await Promise.all([
      supabase.from('vendedores').select('id, nombre, telefono').eq('ruta_id', rutaId).eq('estado', true).eq('empresa_id', empresaId),
      supabase.from('vehiculos').select('placa, marca, modelo, kilometraje_actual').eq('ruta_id', rutaId).eq('empresa_id', empresaId),
      supabase.from('cartera_fiados').select('saldo, fecha_pago').eq('ruta_id', rutaId).eq('estado', 'pendiente').eq('empresa_id', empresaId),
      supabase.from('despachos_encab').select('id').eq('ruta_id', rutaId).gte('fecha', inicio).lte('fecha', hoy).eq('empresa_id', empresaId),
      supabase.from('metas_ventas').select('meta').eq('ruta_id', rutaId).eq('mes', mes).eq('empresa_id', empresaId).maybeSingle(),
    ])
    const ids = new Set((desp || []).map(d => d.id))
    let venta = 0
    if (ids.size > 0) {
      const { data: liq } = await supabase.from('liquidaciones').select('despacho_id, efectivo_esperado').in('despacho_id', [...ids]).eq('empresa_id', empresaId)
      const filasVenta = await conObsequiosRestados(liq || [], { desde: inicio, hasta: hoy })
      venta = filasVenta.filter(l => ids.has(l.despacho_id)).reduce((s, l) => s + (l.efectivo_esperado || 0), 0)
    }
    setResumen({
      vendedores: vends || [],
      vehiculo: (vehs || [])[0] || null,
      cartera: (cartera || []).reduce((s, f) => s + (f.saldo || 0), 0),
      creditos: (cartera || []).length,
      vencidos: (cartera || []).filter(f => f.fecha_pago && f.fecha_pago < hoy).length,
      venta,
      meta: meta?.meta || 0,
    })
  }

  const cargarSolicitudes = async () => {
    const empresaId = getEmpresaId()
    const desde = new Date(Date.now() - 90 * 864e5).toLocaleDateString('en-CA')
    const [{ data: sols }, { data: vis }, { data: enRutero }] = await Promise.all([
      supabase.from('solicitudes_rutero').select('*, clientes(nombre, apto, edificio, barrio), vendedores(nombre)')
        .eq('ruta_id', rutaId).eq('estado', 'pendiente').eq('empresa_id', empresaId).order('created_at'),
      supabase.from('visitas_ruta').select('cliente_id, fecha, resultado').eq('ruta_id', rutaId).gte('fecha', desde).eq('empresa_id', empresaId).order('fecha', { ascending: false }),
      supabase.from('rutero').select('cliente_id, clientes(nombre, apto, edificio, barrio)').eq('ruta_id', rutaId).eq('empresa_id', empresaId),
    ])
    setSolicitudes(sols || [])
    const porCliente = {}
    ;(vis || []).forEach(v => { (porCliente[v.cliente_id] = porCliente[v.cliente_id] || []).push(v) })
    const pedidos = new Set((sols || []).map(x => x.cliente_id))
    const vistos = new Set()
    const sug = []
    ;(enRutero || []).forEach(r => {
      if (vistos.has(r.cliente_id) || pedidos.has(r.cliente_id)) return
      vistos.add(r.cliente_id)
      const ult = (porCliente[r.cliente_id] || []).slice(0, 3)
      if (ult.length === 3 && ult.every(v => v.resultado !== 'compro')) sug.push({ cliente_id: r.cliente_id, clientes: r.clientes, desde: ult[2].fecha })
    })
    setSugeridos(sug)
  }

  // Saca al cliente del rutero de la ruta (de un dia o de todos) y reacomoda
  // el orden de los dias que toco. El cliente, su cartera y su historial quedan.
  const sacarDelRutero = async (clienteId, diaSemana) => {
    const empresaId = getEmpresaId()
    const quitar = filas.filter(f => f.cliente_id === clienteId && (diaSemana == null || f.dia_semana === diaSemana))
    if (quitar.length === 0) return true
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
    await supabase.from('solicitudes_rutero').update({ estado: aprobar ? 'aprobada' : 'rechazada', resuelto_por: usuario?.nombre || null, resuelto_at: new Date().toISOString() })
      .eq('id', sol.id).eq('empresa_id', getEmpresaId())
    cargarRutero(); cargarSolicitudes()
  }

  const sacarSugerido = async (sg) => {
    if (!confirm(`¿Sacar a ${sg.clientes?.nombre} de todos los días de esta ruta? El cliente, su cartera y su historial no se borran.`)) return
    if (await sacarDelRutero(sg.cliente_id, null)) { cargarRutero(); cargarSolicitudes() }
  }

  const detalleSol = (c) => [c?.edificio, c?.apto, c?.barrio].filter(Boolean).filter(t => !(c?.nombre || '').includes(t)).join(' · ')
  const delDia = filas.filter(f => f.dia_semana === dia).sort((a, b) => a.orden - b.orden)
  const visibles = busqueda.trim()
    ? delDia.filter(f => [f.clientes?.nombre, f.clientes?.edificio, f.clientes?.apto, f.clientes?.direccion, f.clientes?.barrio].join(' ').toLowerCase().includes(busqueda.toLowerCase()))
    : delDia
  const conteoDia = (n) => filas.filter(f => f.dia_semana === n).length
  const rutaActual = rutas.find(r => r.id === rutaId)

  // Guarda el orden de un dia completo (1..n) de una vez.
  const guardarOrden = async (lista) => {
    setFilas(prev => prev.map(f => { const i = lista.findIndex(x => x.id === f.id); return i >= 0 ? { ...f, orden: i + 1 } : f }))
    const { error } = await supabase.rpc('reordenar_rutero', { p_ids: lista.map(f => f.id) })
    if (error) { alert('No se pudo guardar el orden: ' + error.message); cargarRutero() }
  }
  const mover = (i, delta) => {
    const j = i + delta
    if (j < 0 || j >= delDia.length) return
    const lista = [...delDia];
    [lista[i], lista[j]] = [lista[j], lista[i]]
    guardarOrden(lista)
  }
  const soltarEn = (destinoId) => {
    const origenId = arrastrando.current
    arrastrando.current = null
    if (!origenId || origenId === destinoId) return
    const lista = delDia.filter(f => f.id !== origenId)
    const pos = lista.findIndex(f => f.id === destinoId)
    lista.splice(pos, 0, delDia.find(f => f.id === origenId))
    guardarOrden(lista)
  }

  const vendedorDeRuta = () => resumen?.vendedores?.[0]?.id || null

  // Crea los clientes y los mete en el rutero del dia en la posicion pedida
  // ('final' o despues del #N), renumerando el resto.
  const crearEnRutero = async (nuevos) => {
    const empresaId = getEmpresaId()
    const { data: creados, error } = await supabase.from('clientes').insert(nuevos.map(c => ({
      empresa_id: empresaId, ruta_id: rutaId, vendedor_id: vendedorDeRuta(), estado: true,
      nombre: c.nombre, tipo_inmueble: c.tipo_inmueble || null, edificio: c.edificio || null, direccion: c.direccion || null,
      apto: c.apto || null, barrio: c.barrio || null, telefono: c.telefono || null,
      frecuencia_dias: Number(c.frecuencia_dias) || 7, notas: c.notas || null,
    }))).select('id')
    if (error) { alert('No se pudo crear: ' + error.message); return false }
    const base = delDia.length
    const { data: rows, error: errR } = await supabase.from('rutero').insert(creados.map((c, i) => ({
      empresa_id: empresaId, cliente_id: c.id, ruta_id: rutaId, dia_semana: dia, orden: base + i + 1,
    }))).select('id')
    if (errR) { alert('Se creó el cliente pero no entró al rutero: ' + errR.message); return false }
    const despuesDe = posicion === 'final' ? delDia.length : Math.max(0, Math.min(delDia.length, parseInt(posicion) || 0))
    if (despuesDe < delDia.length) {
      const lista = [...delDia.map(f => f.id)]
      lista.splice(despuesDe, 0, ...rows.map(r => r.id))
      await supabase.rpc('reordenar_rutero', { p_ids: lista })
    }
    return true
  }

  const guardarCliente = async () => {
    const f = form
    const nombre = f.nombre.trim() || [f.edificio || f.direccion, f.apto].filter(Boolean).join(' · ')
    if (!nombre) { alert('Escribe al menos el nombre, o la dirección / edificio y el apto'); return }
    setGuardando(true)
    const ok = await crearEnRutero([{ ...f, nombre }])
    setGuardando(false)
    if (!ok) return
    setForm({ ...clienteVacio, barrio: f.barrio, tipo_inmueble: f.tipo_inmueble })
    if (posicion !== 'final') setPosicion(String((parseInt(posicion) || 0) + 1))
    cargarRutero()
  }

  const guardarEdificio = async () => {
    const aptos = edificio.aptos.split(/[\s,;]+/).map(a => a.trim()).filter(Boolean)
    if (!edificio.edificio.trim() || aptos.length === 0) { alert('Escribe el edificio y al menos un apto'); return }
    setGuardando(true)
    const ok = await crearEnRutero(aptos.map(a => ({
      nombre: `${edificio.edificio.trim()} · ${a}`, tipo_inmueble: 'edificio', edificio: edificio.edificio.trim(),
      direccion: edificio.direccion, apto: a, barrio: edificio.barrio, notas: edificio.notas, frecuencia_dias: 7,
    })))
    setGuardando(false)
    if (!ok) return
    if (posicion !== 'final') setPosicion(String((parseInt(posicion) || 0) + aptos.length))
    setEdificio({ ...edificio, aptos: '' })
    cargarRutero()
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
    setPanel(null)
    cargarRutero()
  }

  // Mover a otro dia o ruta (queda de ultimo alla), o agregarlo TAMBIEN a
  // otro dia sin quitarlo de este.
  const guardarMovimiento = async (fila) => {
    const empresaId = getEmpresaId()
    const rutaDestino = destino.ruta_id || rutaId
    const diaDestino = Number(destino.dia)
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
    setPanel(null)
    cargarRutero()
  }

  const quitarDelDia = async (fila) => {
    if (!confirm(`¿Quitar a ${fila.clientes?.nombre} del rutero del ${DIAS.find(d => d.n === dia)?.nombre.toLowerCase()}? El cliente, su cartera y su historial no se borran.`)) return
    const { error } = await supabase.from('rutero').delete().eq('id', fila.id).eq('empresa_id', getEmpresaId())
    if (error) { alert('Error: ' + error.message); return }
    await supabase.rpc('reordenar_rutero', { p_ids: delDia.filter(f => f.id !== fila.id).map(f => f.id) })
    cargarRutero()
  }

  const abrirEditar = (fila) => {
    const c = fila.clientes || {}
    setForm({ nombre: c.nombre || '', tipo_inmueble: c.tipo_inmueble || 'casa', edificio: c.edificio || '', direccion: c.direccion || '', apto: c.apto || '', barrio: c.barrio || '', telefono: c.telefono || '', frecuencia_dias: c.frecuencia_dias || 7, notas: c.notas || '' })
    setPanel({ editar: fila })
  }
  const abrirMover = (fila) => { setDestino({ ruta_id: rutaId, dia: fila.dia_semana, tambien: false }); setPanel({ mover: fila }) }

  if (!usuario) return null

  const posicionSelect = (
    <div>
      <label className={etiqueta}>¿Dónde va en el rutero?</label>
      <select value={posicion} onChange={e => setPosicion(e.target.value)} className={input}>
        <option value="final">De último (#{delDia.length + 1})</option>
        <option value="0">De primero</option>
        {delDia.map((f, i) => <option key={f.id} value={String(i + 1)}>Después del #{i + 1} · {f.clientes?.nombre}</option>)}
      </select>
    </div>
  )

  const camposCliente = (
    <>
      <div>
        <label className={etiqueta}>Nombre (si no se sabe, déjalo vacío)</label>
        <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Doña Marta" className={input} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={etiqueta}>Tipo</label>
          <select value={form.tipo_inmueble} onChange={e => setForm({ ...form, tipo_inmueble: e.target.value })} className={input}>
            {TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={etiqueta}>Apto / piso</label>
          <input value={form.apto} onChange={e => setForm({ ...form, apto: e.target.value })} placeholder="401 o Primer piso" className={input} />
        </div>
      </div>
      <div>
        <label className={etiqueta}>Edificio o negocio</label>
        <input value={form.edificio} onChange={e => setForm({ ...form, edificio: e.target.value })} placeholder="Edificio Bayona" className={input} />
      </div>
      <div>
        <label className={etiqueta}>Dirección</label>
        <input value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} placeholder="Carrera 78A #33A-76" className={input} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={etiqueta}>Barrio</label>
          <input value={form.barrio} onChange={e => setForm({ ...form, barrio: e.target.value })} className={input} />
        </div>
        <div>
          <label className={etiqueta}>Teléfono</label>
          <input value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} inputMode="tel" className={input} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={etiqueta}>Cada cuánto compra</label>
          <select value={form.frecuencia_dias} onChange={e => setForm({ ...form, frecuencia_dias: e.target.value })} className={input}>
            {FRECUENCIAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={etiqueta}>Nota</label>
          <input value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} placeholder="Timbrar al 401" className={input} />
        </div>
      </div>
    </>
  )

  return (
    <div>
      <PageHeader title="Rutas" subtitle="Rutero por día, en el orden de visita" />
      <div className="p-4 max-w-6xl mx-auto">
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
          {rutas.map(r => (
            <button key={r.id} onClick={() => { setRutaId(r.id); setPanel(null) }}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-bold ${r.id === rutaId ? 'bg-brand text-white' : 'bg-white text-gray-700 border border-gray-200'}`}>
              {r.nombre}
            </button>
          ))}
        </div>

        {resumen && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-white rounded-xl shadow-sm p-3">
              <p className="text-xs font-bold text-gray-500">Vendedor</p>
              <p className="font-black text-gray-900 truncate">{resumen.vendedores.map(v => v.nombre).join(', ') || 'Sin asignar'}</p>
              <p className="text-xs text-gray-500 truncate">{resumen.vendedores[0]?.telefono || 'Sin WhatsApp'}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-3">
              <p className="text-xs font-bold text-gray-500">Venta del mes</p>
              <p className="font-black text-gray-900">{fmt(resumen.venta)}</p>
              {resumen.meta > 0 ? (
                <>
                  <div className="h-2 rounded-full bg-gray-100 mt-1 overflow-hidden"><div className="h-full bg-amber-400" style={{ width: `${Math.min(100, resumen.venta / resumen.meta * 100)}%` }} /></div>
                  <p className="text-xs text-gray-500 mt-1">Meta {fmt(resumen.meta)} · faltan {fmt(Math.max(0, resumen.meta - resumen.venta))}</p>
                </>
              ) : <p className="text-xs text-gray-500">Sin meta este mes</p>}
            </div>
            <div className="bg-white rounded-xl shadow-sm p-3">
              <p className="text-xs font-bold text-gray-500">Cartera de la ruta</p>
              <p className="font-black text-brand">{fmt(resumen.cartera)}</p>
              <p className="text-xs text-gray-500">{resumen.creditos} créditos{resumen.vencidos ? ` · ${resumen.vencidos} vencidos` : ''}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-3">
              <p className="text-xs font-bold text-gray-500">Vehículo</p>
              <p className="font-black text-gray-900 truncate">{resumen.vehiculo ? `${resumen.vehiculo.placa} · ${resumen.vehiculo.modelo || resumen.vehiculo.marca || ''}` : 'Sin asignar'}</p>
              {resumen.vehiculo && <p className="text-xs text-gray-500">{Number(resumen.vehiculo.kilometraje_actual || 0).toLocaleString('es-CO')} km</p>}
            </div>
          </div>
        )}

        {rutaId && <HoyEnLaCalle key={rutaId} rutaId={rutaId} totalHoy={new Set(filas.filter(f => f.dia_semana === hoyDia()).map(f => f.cliente_id)).size} />}

        {(solicitudes.length > 0 || sugeridos.length > 0) && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
            {solicitudes.length > 0 && (
              <>
                <p className="font-black text-gray-900 mb-2">El vendedor pide sacar {solicitudes.length === 1 ? 'a 1 cliente' : `a ${solicitudes.length} clientes`}</p>
                <div className="flex flex-col gap-2 mb-2">
                  {solicitudes.map(sol => (
                    <div key={sol.id} className="bg-white rounded-xl p-3 flex flex-wrap items-center gap-3">
                      <div className="flex-1 min-w-[200px]">
                        <p className="font-bold text-gray-900">{sol.clientes?.nombre} <span className="text-xs font-normal text-gray-500">{detalleSol(sol.clientes)}</span></p>
                        <p className="text-sm text-gray-700"><b>{sol.motivo}</b>{sol.detalle ? ` · ${sol.detalle}` : ''}</p>
                        <p className="text-xs text-gray-500">{sol.dia_semana ? `Del ${DIAS.find(d => d.n === sol.dia_semana)?.nombre.toLowerCase()}` : 'De todos los días'} · lo pidió {sol.pedido_por || sol.vendedores?.nombre || 'el vendedor'} el {new Date(sol.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => resolverSolicitud(sol, false)} className="px-3 py-2 rounded-lg text-sm font-bold bg-gray-100 text-gray-700">Dejarlo</button>
                        <button onClick={() => resolverSolicitud(sol, true)} className="px-3 py-2 rounded-lg text-sm font-bold bg-brand text-white">Sacar</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {sugeridos.length > 0 && (
              <>
                <p className="font-black text-gray-900 mb-2">Llevan 3 visitas seguidas sin comprar</p>
                <div className="flex flex-col gap-2">
                  {sugeridos.map(sg => (
                    <div key={sg.cliente_id} className="bg-white rounded-xl p-3 flex flex-wrap items-center gap-3">
                      <div className="flex-1 min-w-[200px]">
                        <p className="font-bold text-gray-900">{sg.clientes?.nombre} <span className="text-xs font-normal text-gray-500">{detalleSol(sg.clientes)}</span></p>
                        <p className="text-xs text-gray-500">Sin comprar desde el {new Date(sg.desde + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}</p>
                      </div>
                      <button onClick={() => sacarSugerido(sg)} className="px-3 py-2 rounded-lg text-sm font-bold bg-gray-800 text-white">Sacar de la ruta</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-4 items-start">
          <div className="bg-white rounded-2xl shadow-sm p-4 min-w-0" style={{ flex: '999 1 560px' }}>
            <div className="flex flex-wrap gap-2 items-center justify-between mb-3">
              <div className="flex flex-wrap gap-1.5">
                {DIAS.map(d => (
                  <button key={d.n} onClick={() => { setDia(d.n); setPanel(null); setPosicion('final') }}
                    className={`px-3 py-2 rounded-lg text-sm font-bold ${d.n === dia ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}>
                    {d.corto} <span className="opacity-60 font-normal">{conteoDia(d.n)}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => { setForm(clienteVacio); setPanel('cliente') }} className="px-3 py-2 rounded-lg text-sm font-bold bg-brand text-white">+ Cliente</button>
                <button onClick={() => setPanel('edificio')} className="px-3 py-2 rounded-lg text-sm font-bold bg-gray-100 text-gray-800">+ Edificio</button>
                <a href={`/rutas/imprimir?ruta=${rutaId}&dia=${dia}`} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-lg text-sm font-bold bg-gray-900 text-white">Imprimir {DIAS.find(d => d.n === dia)?.nombre.toLowerCase()}</a>
              </div>
            </div>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar cliente, edificio, apto o barrio" className={input + ' mb-3'} />
            <p className="text-xs text-gray-500 mb-2">{rutaActual?.nombre} · {DIAS.find(d => d.n === dia)?.nombre} · {delDia.length} clientes · <span className="hidden md:inline">arrastra de la manija o </span>usa las flechas para cambiar el orden</p>

            {cargando ? <p className="text-gray-400 text-center py-10">Cargando...</p>
              : delDia.length === 0 ? (
                <div className="text-center py-10">
                  <p className="font-bold text-gray-700">Este día no tiene clientes todavía</p>
                  <p className="text-sm text-gray-500 mt-1">Dale &quot;+ Cliente&quot; o &quot;+ Edificio&quot;. Cada uno que agregas queda de último, así el orden se arma con el recorrido.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {visibles.map(f => {
                    const i = delDia.findIndex(x => x.id === f.id)
                    const c = f.clientes || {}
                    return (
                      <div key={f.id} draggable={!busqueda}
                        onDragStart={() => { arrastrando.current = f.id }}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => soltarEn(f.id)}
                        className={`flex items-center gap-2 py-2 ${c.estado === false ? 'opacity-50' : ''}`}>
                        <span className="hidden md:inline cursor-grab text-gray-300 select-none px-1" aria-hidden="true">⋮⋮</span>
                        <span className="w-8 text-right font-black text-gray-500 shrink-0">{f.orden}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-800 truncate">{c.nombre}{conDescuento.has(f.cliente_id) && <span className="ml-2 text-[11px] font-bold bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">Descuento</span>}</p>
                          <p className="text-xs text-gray-500 truncate">{detalleCliente(c) || 'Sin dirección'}{c.frecuencia_dias && c.frecuencia_dias !== 7 ? ` · cada ${c.frecuencia_dias} días` : ''}{c.notas ? ` · ${c.notas}` : ''}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir" className="w-8 h-8 rounded-lg bg-gray-100 text-gray-700 font-bold disabled:opacity-30">↑</button>
                          <button onClick={() => mover(i, 1)} disabled={i === delDia.length - 1} aria-label="Bajar" className="w-8 h-8 rounded-lg bg-gray-100 text-gray-700 font-bold disabled:opacity-30">↓</button>
                          <button onClick={() => abrirEditar(f)} className="px-2 h-8 rounded-lg bg-gray-100 text-gray-700 text-xs font-bold">Editar</button>
                          <button onClick={() => abrirMover(f)} className="px-2 h-8 rounded-lg bg-gray-100 text-gray-700 text-xs font-bold">Mover</button>
                          <button onClick={() => quitarDelDia(f)} aria-label="Quitar del día" className="w-8 h-8 rounded-lg bg-gray-100 text-brand font-bold">×</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
          </div>

          {/* En el celular el panel sale encima, desde abajo; en pantalla grande, al lado de la lista. */}
          {panel && (
            <div className="fixed inset-0 z-40 flex items-end bg-black/40 md:static md:inset-auto md:z-auto md:bg-transparent md:block md:min-w-0" style={{ flex: '1 1 320px' }}
              onClick={e => { if (e.target === e.currentTarget) setPanel(null) }}>
            <div className="bg-white w-full rounded-t-3xl md:rounded-2xl shadow-sm p-4 space-y-3 min-w-0 max-h-[88vh] overflow-y-auto md:max-h-none md:overflow-visible" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
              {panel === 'cliente' && (
                <>
                  <p className="font-black text-gray-800 text-lg">Nuevo cliente · {DIAS.find(d => d.n === dia)?.nombre}</p>
                  {camposCliente}
                  {posicionSelect}
                  <div className="flex gap-2">
                    <button onClick={() => setPanel(null)} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2.5 rounded-lg text-sm">Cerrar</button>
                    <button onClick={guardarCliente} disabled={guardando} className="flex-1 bg-brand text-white font-bold py-2.5 rounded-lg text-sm disabled:opacity-50">{guardando ? 'Guardando...' : 'Guardar y agregar otro'}</button>
                  </div>
                </>
              )}
              {panel === 'edificio' && (
                <>
                  <p className="font-black text-gray-800 text-lg">Agregar por edificio</p>
                  <p className="text-xs text-gray-500">El edificio una vez y los aptos de corrido. Nombre y teléfono se completan después con &quot;Editar&quot;.</p>
                  <div><label className={etiqueta}>Edificio</label><input value={edificio.edificio} onChange={e => setEdificio({ ...edificio, edificio: e.target.value })} placeholder="Edificio Bayona" className={input} /></div>
                  <div><label className={etiqueta}>Dirección</label><input value={edificio.direccion} onChange={e => setEdificio({ ...edificio, direccion: e.target.value })} className={input} /></div>
                  <div><label className={etiqueta}>Barrio</label><input value={edificio.barrio} onChange={e => setEdificio({ ...edificio, barrio: e.target.value })} className={input} /></div>
                  <div><label className={etiqueta}>Aptos (separados por espacio)</label><input value={edificio.aptos} onChange={e => setEdificio({ ...edificio, aptos: e.target.value })} placeholder="301 402 904" className={input} /></div>
                  <div><label className={etiqueta}>Nota de portería</label><input value={edificio.notas} onChange={e => setEdificio({ ...edificio, notas: e.target.value })} placeholder="La lista la hace el portero" className={input} /></div>
                  {posicionSelect}
                  <div className="flex gap-2">
                    <button onClick={() => setPanel(null)} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2.5 rounded-lg text-sm">Cerrar</button>
                    <button onClick={guardarEdificio} disabled={guardando} className="flex-1 bg-brand text-white font-bold py-2.5 rounded-lg text-sm disabled:opacity-50">
                      {guardando ? 'Guardando...' : `Crear ${edificio.aptos.split(/[\s,;]+/).filter(Boolean).length || ''} clientes`}
                    </button>
                  </div>
                </>
              )}
              {panel?.editar && (
                <>
                  <p className="font-black text-gray-800 text-lg">Editar cliente</p>
                  {camposCliente}
                  <PreciosEspecialesCliente clienteId={panel.editar.cliente_id} onCambio={cargarDescuentos} />
                  <div className="flex gap-2">
                    <button onClick={() => setPanel(null)} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2.5 rounded-lg text-sm">Cancelar</button>
                    <button onClick={() => guardarEdicion(panel.editar)} disabled={guardando} className="flex-1 bg-brand text-white font-bold py-2.5 rounded-lg text-sm disabled:opacity-50">{guardando ? 'Guardando...' : 'Guardar'}</button>
                  </div>
                </>
              )}
              {panel?.mover && (
                <>
                  <p className="font-black text-gray-800 text-lg">Mover a {panel.mover.clientes?.nombre}</p>
                  <div>
                    <label className={etiqueta}>Ruta</label>
                    <select value={destino.ruta_id} onChange={e => setDestino({ ...destino, ruta_id: e.target.value })} className={input}>
                      {rutas.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={etiqueta}>Día</label>
                    <select value={destino.dia} onChange={e => setDestino({ ...destino, dia: e.target.value })} className={input}>
                      {DIAS.map(d => <option key={d.n} value={d.n}>{d.nombre}</option>)}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={destino.tambien} onChange={e => setDestino({ ...destino, tambien: e.target.checked })} className="w-4 h-4" />
                    Dejarlo también en este día (se visita dos veces)
                  </label>
                  <p className="text-xs text-gray-500">Allá queda de último; después lo acomodas en su puesto.</p>
                  <div className="flex gap-2">
                    <button onClick={() => setPanel(null)} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2.5 rounded-lg text-sm">Cancelar</button>
                    <button onClick={() => guardarMovimiento(panel.mover)} disabled={guardando} className="flex-1 bg-brand text-white font-bold py-2.5 rounded-lg text-sm disabled:opacity-50">{guardando ? 'Guardando...' : (destino.tambien ? 'Agregar' : 'Mover')}</button>
                  </div>
                </>
              )}
            </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
