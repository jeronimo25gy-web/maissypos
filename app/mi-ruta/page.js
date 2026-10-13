'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { cerrarSesionUsuario } from '@/lib/sesion'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { conObsequiosRestados } from '@/lib/ventas-helpers'
import { DIAS } from '@/lib/rutero'

// Inicio del vendedor: su ruta como dashboard (venta contra meta, cartera,
// vehiculo), el rutero del dia (ficha completa de cada cliente, organizar el
// orden, agregar clientes en cualquier puesto) y la puerta al kiosco para liquidar.
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
const mapa = (c) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([c.edificio, c.direccion, c.barrio, 'Medellín'].filter(Boolean).join(', '))
const VACIO = { nombre: '', edificio: '', direccion: '', apto: '', barrio: '', telefono: '', notas: '' }

const TINTA = '#1C1B19', GRIS = '#5A5750', FONDO = '#F3F1EA', LINEA = '#E3E1D8'
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }

export default function MiRuta() {
  const router = useRouter()
  const [usuario, setUsuario] = useState(null)
  const [vendedor, setVendedor] = useState(null)
  const [datos, setDatos] = useState(null)
  const [dia, setDia] = useState(diaDeHoy())
  const [rutero, setRutero] = useState([])
  const [vista, setVista] = useState('inicio') // inicio | rutero | cuenta
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
    setUsuario(parsed)
    cargar(parsed)
  }, [])

  const cargar = async (u) => {
    const empresaId = getEmpresaId()
    const { data: vend } = await supabase.from('vendedores').select('id, nombre, ruta_id, telefono, rutas(id, nombre)')
      .eq('nombre', u.vendedor_nombre || u.nombre || '').eq('empresa_id', empresaId).maybeSingle()
    setVendedor(vend || null)
    if (!vend?.ruta_id) { setDatos({ sinRuta: true }); return }
    const hoy = obtenerFechaActual()
    const mes = hoy.slice(0, 7)
    const inicio = mes + '-01'
    const [{ data: vehs }, { data: cartera }, { data: desp }, { data: meta }, { data: pendientes }] = await Promise.all([
      supabase.from('vehiculos').select('placa, marca, modelo, kilometraje_actual').eq('ruta_id', vend.ruta_id).eq('empresa_id', empresaId),
      supabase.from('cartera_fiados').select('nombre_cliente, cliente_id, saldo, fecha_pago').eq('ruta_id', vend.ruta_id).eq('estado', 'pendiente').eq('empresa_id', empresaId).order('fecha_pago', { ascending: true, nullsFirst: false }),
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
  }

  const cargarRutero = async (rutaId, d) => {
    const { data } = await supabase.from('rutero')
      .select('id, orden, cliente_id, clientes(id, nombre, telefono, direccion, apto, edificio, barrio, notas, frecuencia_dias, estado)')
      .eq('ruta_id', rutaId).eq('dia_semana', d).eq('empresa_id', getEmpresaId()).order('orden')
    setRutero((data || []).filter(f => f.clientes?.estado !== false))
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
  const visibles = q ? rutero.filter(f => [f.clientes?.nombre, f.clientes?.edificio, f.clientes?.apto, f.clientes?.direccion, f.clientes?.barrio].some(t => (t || '').toLowerCase().includes(q))) : rutero
  const campo = 'w-full border-2 rounded-xl px-3 min-h-[48px] text-base bg-white focus:outline-none focus:border-[#1C1B19]'
  const ic = (d) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
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
              <p className="text-sm mt-1" style={{ color: GRIS }}>Pídele al administrador que te asigne tu vendedor y tu ruta. Mientras tanto puedes liquidar desde el kiosco.</p>
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

              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => { cambiarDia(diaDeHoy()); setVista('rutero') }} className="bg-white rounded-2xl p-3.5 flex flex-col gap-1 text-left">
                  <span className="text-[13px] font-bold" style={{ color: GRIS }}>Rutero del {nombreHoy}</span>
                  <span className="font-extrabold text-[28px] tabular-nums" style={titulo}>{dia === diaDeHoy() ? rutero.length : '—'}</span>
                  <span className="text-[13px]" style={{ color: GRIS }}>clientes · ver lista</span>
                </button>
                <div className="bg-white rounded-2xl p-3.5 flex flex-col gap-1">
                  <span className="text-[13px] font-bold" style={{ color: GRIS }}>Cobrar hoy</span>
                  <span className="font-extrabold text-[28px] tabular-nums text-brand" style={titulo}>{fmt(datos.cobrarHoy.reduce((s, f) => s + (f.saldo || 0), 0))}</span>
                  <span className="text-[13px]" style={{ color: GRIS }}>{datos.cobrarHoy.length} créditos · {datos.cobrarHoy.filter(f => f.fecha_pago < hoy).length} vencidos</span>
                </div>
              </div>

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
                    <a key={d.id} href="/kiosco" className="flex gap-2 items-start text-sm">
                      <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: TINTA }} />
                      <span>{d.estado === 'por_aprobar' ? <>Liquidación del {d.fecha} enviada · <b>esperando aprobación</b></> : <>Despacho del {d.fecha} por liquidar · <b className="text-brand">liquidar</b></>}</span>
                    </a>
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

              <button onClick={() => { cambiarDia(diaDeHoy()); setVista('rutero') }} className="min-h-[56px] rounded-2xl text-white font-bold text-[17px]" style={{ background: TINTA }}>
                Empezar ruta del {nombreHoy}
              </button>
            </div>
          </>
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
                      <button onClick={() => abrirNuevo(rutero.length + 1)} className="min-h-[44px] px-3 rounded-xl font-bold text-sm text-white" style={{ background: TINTA }}>+ Cliente</button>
                    </div>
                  )}
                </div>
                <div className="flex gap-1.5 overflow-x-auto">
                  {DIAS.map(d => (
                    <button key={d.n} onClick={() => cambiarDia(d.n)} className="shrink-0 px-3 min-h-[40px] rounded-xl text-sm font-bold"
                      style={d.n === dia ? { background: TINTA, color: '#fff' } : { background: FONDO }}>{d.corto}</button>
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
                  {q && visibles.length === 0 && <p className="text-center py-6" style={{ color: GRIS }}>Nadie coincide con “{buscar}”.</p>}
                  {visibles.map(f => {
                    const c = f.clientes || {}
                    const esteAbierto = abierto === f.id
                    const debe = esteAbierto ? deudaDe(c) : 0
                    const boton = 'min-h-[48px] rounded-xl font-bold text-sm flex items-center justify-center'
                    return (
                      <div key={f.id} className="bg-white rounded-2xl" style={esteAbierto ? { outline: `2px solid ${TINTA}` } : undefined}>
                        <button onClick={() => setAbierto(esteAbierto ? null : f.id)} aria-expanded={esteAbierto} className="w-full text-left p-3 flex gap-2.5">
                          <span className="w-7 shrink-0 text-right font-extrabold text-lg tabular-nums" style={{ ...titulo, color: esteAbierto ? TINTA : GRIS }}>{f.orden}</span>
                          <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                            <span className="font-bold leading-snug">{c.nombre}</span>
                            {lineaDireccion(c) && <span className="text-[13px] leading-snug" style={{ color: GRIS }}>{lineaDireccion(c)}</span>}
                            {c.notas && !esteAbierto && <span className="text-[13px] leading-snug" style={{ color: '#8A5A00' }}>{c.notas}</span>}
                          </span>
                        </button>
                        {esteAbierto && (
                          <div className="px-3 pb-3 flex flex-col gap-3">
                            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm rounded-xl p-3" style={{ background: FONDO }}>
                              {c.edificio && <><dt style={{ color: GRIS }}>Edificio</dt><dd className="font-bold">{c.edificio}</dd></>}
                              {c.apto && <><dt style={{ color: GRIS }}>Apto / piso</dt><dd className="font-bold">{c.apto}</dd></>}
                              <dt style={{ color: GRIS }}>Dirección</dt><dd className="font-bold">{c.direccion || '—'}</dd>
                              <dt style={{ color: GRIS }}>Barrio</dt><dd className="font-bold">{c.barrio || '—'}</dd>
                              <dt style={{ color: GRIS }}>Teléfono</dt><dd className="font-bold tabular-nums">{c.telefono || '—'}</dd>
                              {c.notas && <><dt style={{ color: GRIS }}>Nota</dt><dd className="font-bold">{c.notas}</dd></>}
                              <dt style={{ color: GRIS }}>Debe</dt><dd className={`font-bold tabular-nums ${debe > 0 ? 'text-brand' : ''}`}>{debe > 0 ? fmt(debe) : 'Nada'}</dd>
                            </dl>
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
                              <button onClick={() => abrirNuevo(f.orden + 1)} className={boton} style={{ background: '#FFF4CC' }}>+ Cliente después</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
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
              <button onClick={cambiarClave} className="min-h-[52px] rounded-2xl text-white font-bold" style={{ background: TINTA }}>Guardar contraseña</button>
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

      <nav aria-label="Menú del vendedor" className="fixed bottom-0 inset-x-0 bg-white border-t z-20" style={{ borderColor: LINEA, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="max-w-md mx-auto grid grid-cols-4" style={{ color: GRIS }}>
          <button onClick={() => setVista('inicio')} className={itemNav(vista === 'inicio')}>{ic('M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z')}Inicio</button>
          <button onClick={() => setVista('rutero')} className={itemNav(vista === 'rutero')}>{ic('M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01')}Rutero</button>
          <a href="/kiosco" className={itemNav(false)}>{ic('M3 7h18v10H3zM12 12h.01M7 7V5h10v2')}Liquidar</a>
          <button onClick={() => setVista('cuenta')} className={itemNav(vista === 'cuenta')}>{ic('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0')}Mi cuenta</button>
        </div>
      </nav>
    </div>
  )
}
