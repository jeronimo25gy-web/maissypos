'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { cerrarSesionUsuario, sesionVigente } from '@/lib/sesion'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import InputDinero from '@/components/InputDinero'
import CampoFecha from '@/components/CampoFecha'

// Consola del dueño de MaissyPOS (rol plataforma): clientes, demos, pagos,
// usuarios de cada cliente y cifras generales de uso. Nunca muestra datos del
// negocio de un cliente ni claves: las cifras salen de plataforma_uso(),
// plataforma_empresas() y plataforma_usuarios(), que solo devuelven conteos,
// planes y quién es cada usuario.
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', linea: '#E3E1D8', suave: '#EFEDE6', rojo: '#C41230', rojoF: '#FBE9E9', amarillo: '#F2B21B', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8', noche: '#1A1A1A' }
const TITULO = 'var(--font-titulo), Georgia, serif'
const $ = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
const tam = (b) => b >= 1e9 ? `${(b / 1e9).toLocaleString('es-CO', { maximumFractionDigits: 1 })} GB` : b >= 1e6 ? `${(b / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 })} MB` : `${Math.round(b / 1e3)} KB`
const cuando = (iso) => {
  if (!iso) return 'Nunca'
  const d = new Date(iso), min = (Date.now() - d) / 60000
  if (min < 60) return `Hace ${Math.max(1, Math.round(min))} min`
  const hoy = new Date().toDateString() === d.toDateString()
  const hora = d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })
  if (hoy) return `Hoy ${hora}`
  const dias = Math.round(min / 1440)
  return dias <= 1 ? `Ayer ${hora}` : `Hace ${dias} días`
}
const diasHasta = (f) => f ? Math.round((new Date(f + 'T12:00:00') - new Date(obtenerFechaActual() + 'T12:00:00')) / 864e5) : null
const fechaCorta = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')
const iniciales = (n) => (n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()
const PLAN = { empresa: 'Empresa', mostrador: 'Punto de venta' }
const MODELO = { distribucion: 'Distribución', produccion: 'Producción', mostrador: 'Punto de venta' }
const ROL = { gerencia: 'Gerencia', admin: 'Administrador', auxiliar: 'Auxiliar', vendedor: 'Vendedor', planta: 'Planta' }
const ACCION = { clave_temporal: 'Clave temporal', activar_usuario: 'Activó usuario', desactivar_usuario: 'Desactivó usuario', crear_demo: 'Creó demo' }
const sugerirUsuario = (negocio) => (negocio || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '').slice(0, 24)
const generarClave = () => { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; return Array.from(crypto.getRandomValues(new Uint32Array(8)), n => a[n % a.length]).join('') }
const telefono = (c) => String(c || '').replace(/\D/g, '').slice(-10)

const SECCIONES = [
  ['resumen', 'Resumen', 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10'],
  ['clientes', 'Clientes', 'M3 21V7l9-4 9 4v14M9 21v-6h6v6M8 10h.01M12 10h.01M16 10h.01'],
  ['usuarios', 'Usuarios', 'M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7M21 19v-1a4 4 0 00-3-3.9M16 3.1a3.5 3.5 0 010 6.8'],
  ['solicitudes', 'Solicitudes', 'M4 4h16v12H7l-3 3V4M8 9h8M8 12h5'],
  ['pagos', 'Pagos', 'M3 7h18v12H3zM3 11h18M7 15h3'],
  ['registro', 'Registro', 'M12 8v4l3 2M12 21a9 9 0 110-18 9 9 0 010 18'],
]

// Estado del cliente con su pastilla.
const estadoDe = (c) => {
  if (c.estado === 'activo') return ['verde', 'Activo']
  if (c.estado === 'suspendido') return ['gris', 'Suspendido']
  if (c.estado === 'vencido') return ['gris', 'Demo vencida']
  const d = diasHasta(c.demo_hasta)
  if (d == null) return ['ambar', 'Demo']
  if (d < 0) return ['gris', 'Demo vencida']
  if (d <= 1) return ['rojo', d === 0 ? 'Demo · vence hoy' : 'Demo · vence mañana']
  return ['ambar', `Demo · ${d} días`]
}

// Proximo pago: el dia de pago de este mes o del siguiente.
const proximoPago = (dia) => {
  if (!dia) return null
  const hoy = new Date(obtenerFechaActual() + 'T12:00:00')
  const este = new Date(hoy.getFullYear(), hoy.getMonth(), Math.min(dia, 28), 12)
  const f = este >= hoy ? este : new Date(hoy.getFullYear(), hoy.getMonth() + 1, Math.min(dia, 28), 12)
  return f.toLocaleDateString('en-CA')
}

const Icono = ({ d, size = 18 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
const Pastilla = ({ tono, children }) => {
  const t = { verde: [C.verde, C.verdeF], ambar: [C.ambar, C.ambarF], rojo: [C.rojo, C.rojoF], gris: [C.gris, C.suave] }[tono]
  return <span className="text-[12px] font-bold rounded-full px-2.5 py-0.5 whitespace-nowrap" style={{ color: t[0], background: t[1] }}>{children}</span>
}
const Kpi = ({ rotulo, valor, nota, rojo, onClick }) => (
  <button type="button" onClick={onClick} disabled={!onClick} className="bg-white rounded-[18px] p-4 flex flex-col gap-1 min-w-0 text-left enabled:hover:shadow-[0_0_0_1.5px_#E3E1D8]">
    <span className="text-[12.5px] font-bold" style={{ color: C.gris }}>{rotulo}</span>
    <b className="text-[28px] leading-tight tabular-nums" style={{ fontFamily: TITULO, color: rojo ? C.rojo : C.tinta }}>{valor}</b>
    {nota && <span className="text-[13px]" style={{ color: C.gris }}>{nota}</span>}
  </button>
)
const Tarjeta = ({ titulo, accion, children, className = '' }) => (
  <section className={`bg-white rounded-[18px] px-4 md:px-5 py-4 flex flex-col gap-2 min-w-0 ${className}`}>
    {(titulo || accion) && <div className="flex justify-between items-center gap-2 flex-wrap">
      {titulo && <h2 className="m-0 text-[20px] font-extrabold" style={{ fontFamily: TITULO }}>{titulo}</h2>}
      {accion}
    </div>}
    {children}
  </section>
)
const Vacio = ({ children }) => <p className="m-0 py-3 text-[14px]" style={{ color: C.gris }}>{children}</p>
const boton = 'rounded-xl min-h-[40px] px-3.5 font-bold text-[14px] inline-flex items-center justify-center gap-1.5 disabled:opacity-50'
const campo = 'w-full min-h-[44px] rounded-xl bg-white px-3 text-[15px] font-medium outline-none'
const bordeCampo = { boxShadow: `inset 0 0 0 1.5px ${C.linea}`, color: C.tinta }
const Etiqueta = ({ t, children, className = '' }) => <label className={`flex flex-col gap-1 text-[13px] font-bold min-w-0 ${className}`} style={{ color: C.gris }}>{t}{children}</label>
const Chip = ({ activo, onClick, children }) => (
  <button type="button" aria-pressed={activo} onClick={onClick} className="rounded-full min-h-[38px] px-3.5 text-[14px] font-bold"
    style={activo ? { background: '#fff', color: C.tinta, boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: C.suave, color: C.gris }}>{children}</button>
)
const Cerrar = ({ onClick }) => (
  <button type="button" onClick={onClick} aria-label="Cerrar" className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: C.suave }}>
    <Icono d="M6 6l12 12M18 6L6 18" size={16} />
  </button>
)
const Cabeza = ({ rotulo, titulo, cerrar }) => (
  <div className="flex justify-between items-start gap-3">
    <div className="min-w-0"><span className="text-[12px] font-bold tracking-[.06em]" style={{ color: C.gris }}>{rotulo}</span><h2 className="m-0 text-[24px] font-extrabold leading-tight" style={{ fontFamily: TITULO }}>{titulo}</h2></div>
    <Cerrar onClick={cerrar} />
  </div>
)
const MensajeError = ({ children }) => children ? <p className="m-0 text-[13.5px] font-semibold pl-2.5" style={{ color: C.rojo, borderLeft: `3px solid ${C.rojo}` }} role="alert">{children}</p> : null
const Avatar = ({ nombre, size = 34, oscuro }) => (
  <span className="rounded-full inline-flex items-center justify-center font-extrabold shrink-0" style={{ width: size, height: size, fontSize: size * 0.38, background: oscuro ? C.amarillo : C.suave, color: oscuro ? C.noche : C.tinta }}>{iniciales(nombre)}</span>
)

export default function Plataforma() {
  const router = useRouter()
  const [usuario, setUsuario] = useState(null)
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [seccion, setSeccion] = useState('resumen')
  const [pago, setPago] = useState(null) // { cliente_id, valor, fecha, medio }
  const [guardando, setGuardando] = useState(false)
  const [ficha, setFicha] = useState(null) // copia editable de un cliente con sus empresas, y la pestaña abierta
  const [demo, setDemo] = useState(null) // formulario de nueva demo
  const [creada, setCreada] = useState(null) // { usuario, clave, negocio, celular, demo_hasta }
  const [claveTemp, setClaveTemp] = useState(null) // { u, clave, lista }
  const [perfil, setPerfil] = useState(null) // { nombre }
  const [menu, setMenu] = useState(false)
  const [buscar, setBuscar] = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')

  const cargar = useCallback(async () => {
    const [cli, emp, uso, sol, pag, usr, avi, reg] = await Promise.all([
      supabase.from('clientes_plataforma').select('*').order('created_at'),
      supabase.rpc('plataforma_empresas'),
      supabase.rpc('plataforma_uso'),
      supabase.from('solicitudes_demo').select('*').eq('estado', 'nueva').order('created_at', { ascending: false }),
      supabase.from('pagos_plataforma').select('*').gte('fecha', obtenerFechaActual().slice(0, 7) + '-01').order('fecha', { ascending: false }),
      supabase.rpc('plataforma_usuarios'),
      supabase.from('plataforma_avisos').select('*').eq('atendido', false).order('created_at', { ascending: false }),
      supabase.from('plataforma_registro').select('*').order('created_at', { ascending: false }).limit(100),
    ])
    const fallo = [cli, emp, uso, sol, pag].find(r => r.error)
    if (fallo) { setError('No se pudo cargar la consola: ' + fallo.error.message); return }
    const usoPor = Object.fromEntries((uso.data || []).map(u => [u.empresa_id, u]))
    const nombreEmpresa = Object.fromEntries((emp.data || []).map(e => [e.id, e.nombre]))
    // Los usuarios, avisos y registro llegan con la migracion 0144; sin ella la consola sigue funcionando.
    const usuarios = usr.error ? null : (usr.data || []).map(u => ({ ...u, empresasNombre: Array.isArray(u.empresas) ? u.empresas.map(id => nombreEmpresa[id]).filter(Boolean) : null }))
    const clientes = (cli.data || []).map(c => {
      const empresas = (emp.data || []).filter(e => e.cliente_id === c.id).map(e => ({ ...e, uso: usoPor[e.id] || {} }))
      const suma = (k) => empresas.reduce((s, e) => s + Number(e.uso[k] || 0), 0)
      return {
        ...c, empresas,
        usuarios: suma('usuarios'), sesiones: suma('sesiones_abiertas'), sesionesHora: suma('sesiones_hora'), espacio: suma('espacio_bytes'),
        ultima: empresas.map(e => e.uso.ultima_actividad).filter(Boolean).sort().pop() || null,
        mensual: empresas.filter(e => e.activo).reduce((s, e) => s + Number(e.precio_mensual || 0), 0),
        pagadoMes: (pag.data || []).filter(p => p.cliente_id === c.id).reduce((s, p) => s + Number(p.valor || 0), 0),
      }
    })
    const sueltas = (emp.data || []).filter(e => !e.cliente_id)
    setD({ clientes, sueltas, solicitudes: sol.data || [], pagos: pag.data || [], usuarios, avisos: avi.error ? [] : avi.data || [], registro: reg.error ? [] : reg.data || [], sinMigracion: !!usr.error })
  }, [])

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')
    if (!u || u.rol !== 'plataforma') { router.replace('/entrar'); return }
    sesionVigente().then(ok => { if (!ok) router.replace('/entrar') })
    const h = window.location.hash.slice(1)
    Promise.resolve().then(() => {
      setUsuario(u)
      if (SECCIONES.some(([id]) => id === h)) setSeccion(h)
    })
    cargar()
  }, [router, cargar])

  const ir = (s) => { setSeccion(s); window.history.replaceState(null, '', `#${s}`); window.scrollTo({ top: 0 }) }
  const salir = async () => { await cerrarSesionUsuario(usuario?.id); localStorage.removeItem('maissy_usuario'); router.replace('/entrar') }
  const llamarApi = async (cuerpo) => {
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch('/api/plataforma', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` }, body: JSON.stringify(cuerpo) })
    const j = await r.json().catch(() => ({}))
    return r.ok ? j : { error: j.error || 'No se pudo completar.' }
  }

  const descartar = async (s) => {
    const { error } = await supabase.from('solicitudes_demo').update({ estado: 'descartada' }).eq('id', s.id)
    if (error) { setError('No se pudo descartar: ' + error.message); return }
    cargar()
  }

  const guardarPago = async () => {
    if (!pago.cliente_id || !(Number(pago.valor) > 0)) { setError('Escoge el cliente y escribe el valor del pago.'); return }
    setGuardando(true)
    const { error } = await supabase.from('pagos_plataforma').insert({ cliente_id: pago.cliente_id, valor: Number(pago.valor), fecha: pago.fecha, medio: pago.medio || null, periodo: pago.fecha.slice(0, 7), registrado_por: usuario?.nombre || null })
    setGuardando(false)
    if (error) { setError('No se pudo guardar el pago: ' + error.message); return }
    setPago(null); setError(''); cargar()
  }
  const nuevoPago = (c) => setPago({ cliente_id: c?.id || d.clientes.find(x => x.estado === 'activo')?.id || '', valor: c ? String(c.mensual) : String(d.clientes.find(x => x.estado === 'activo')?.mensual || ''), fecha: obtenerFechaActual(), medio: 'Transferencia' })

  // Ficha del cliente: estado, demo, contacto, plan de cada empresa, usuarios y pagos.
  const abrirFicha = (c, pestana = 'general') => { setError(''); setFicha({ ...c, pestana, empresas: c.empresas.map(e => ({ ...e, precio: String(e.precio_mensual ?? '') })) }) }
  const guardarFicha = async () => {
    const antes = d.clientes.find(c => c.id === ficha.id)
    if (ficha.estado === 'suspendido' && antes?.estado !== 'suspendido' && !confirm(`¿Suspender a ${ficha.nombre}? Sus ${antes?.usuarios || 0} usuarios dejan de entrar de inmediato, incluidos los vendedores en la calle.`)) return
    setGuardando(true); setError('')
    const { error: e1 } = await supabase.from('clientes_plataforma').update({
      nombre: ficha.nombre.trim(), estado: ficha.estado, demo_hasta: ficha.demo_hasta || null, dia_pago: ficha.dia_pago ? Number(ficha.dia_pago) : null,
      contacto_nombre: ficha.contacto_nombre || null, contacto_celular: ficha.contacto_celular || null, ciudad: ficha.ciudad || null, notas: ficha.notas || null,
    }).eq('id', ficha.id)
    let e2 = null
    for (const e of ficha.empresas) {
      const r = await supabase.rpc('plataforma_actualizar_empresa', { p_id: e.id, p_plan: e.plan, p_precio: e.precio === '' ? null : Number(e.precio), p_activo: e.activo, p_modelos: e.modelos })
      if (r.error) { e2 = r.error; break }
    }
    setGuardando(false)
    if (e1 || e2) { setError('No se pudo guardar: ' + (e1 || e2).message); return }
    setFicha(null); cargar()
  }
  const alargar = (dias) => {
    const base = ficha.demo_hasta && ficha.demo_hasta > obtenerFechaActual() ? ficha.demo_hasta : obtenerFechaActual()
    const f = new Date(base + 'T12:00:00'); f.setDate(f.getDate() + dias)
    setFicha({ ...ficha, estado: 'demo', demo_hasta: f.toLocaleDateString('en-CA') })
  }

  // Nueva demo: cliente, empresa, caja y usuario Gerencia con su acceso.
  const abrirDemo = (sol) => { setError(''); setDemo({
    solicitud_id: sol?.id || null, negocio: sol?.negocio || '', contacto: sol?.nombre || '', celular: sol?.celular || '', ciudad: sol?.ciudad || '',
    actividades: sol?.actividades?.length ? sol.actividades : ['distribucion'], dias: 15, ejemplos: true, usuario: sugerirUsuario(sol?.negocio), clave: generarClave(),
  }) }
  const crearDemo = async () => {
    setGuardando(true); setError('')
    const j = await llamarApi({ accion: 'crear_demo', ...demo })
    setGuardando(false)
    if (j.error) { setError(j.error); return }
    setCreada({ usuario: j.usuario, clave: demo.clave, negocio: demo.negocio, contacto: demo.contacto, celular: demo.celular, demo_hasta: j.demo_hasta })
    setDemo(null); cargar()
  }

  // Usuarios: clave temporal (el usuario la cambia al entrar) y activar/desactivar.
  const abrirClave = (u) => { setError(''); setClaveTemp({ u, clave: generarClave(), lista: false }) }
  const ponerClave = async () => {
    setGuardando(true); setError('')
    const j = await llamarApi({ accion: 'clave_temporal', usuario_id: claveTemp.u.id, clave: claveTemp.clave })
    setGuardando(false)
    if (j.error) { setError(j.error); return }
    setClaveTemp({ ...claveTemp, lista: true }); cargar()
  }
  const alternarActivo = async (u) => {
    if (u.activo && !confirm(`¿Desactivar a ${u.nombre}? Deja de entrar de inmediato.`)) return
    setError('')
    const j = await llamarApi({ accion: 'activar_usuario', usuario_id: u.id, activo: !u.activo })
    if (j.error) { setError(j.error); return }
    cargar()
  }

  const guardarPerfil = async () => {
    setGuardando(true); setError('')
    const { error: e } = await supabase.rpc('plataforma_mi_nombre', { p_nombre: perfil.nombre })
    setGuardando(false)
    if (e) { setError('No se pudo guardar: ' + e.message); return }
    const u = { ...usuario, nombre: perfil.nombre.trim() }
    localStorage.setItem('maissy_usuario', JSON.stringify(u)); setUsuario(u); setPerfil(null)
  }

  if (!usuario) return null
  // Si el nombre guardado es el mismo usuario de entrada, se invita a poner el nombre real.
  const sinNombre = !usuario.nombre || usuario.nombre.trim().toLowerCase() === (usuario.usuario || '').toLowerCase()
  const nombre = sinNombre ? '' : usuario.nombre.split(' ')[0]
  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'

  const clienteDe = (id) => d?.clientes.find(c => c.id === id)
  const activos = d?.clientes.filter(c => c.estado === 'activo') || []
  const demos = d?.clientes.filter(c => c.estado === 'demo') || []
  const porVencer = demos.filter(c => { const x = diasHasta(c.demo_hasta); return x != null && x >= 0 && x <= 1 })
  const pagosPendientes = activos.filter(c => { const x = diasHasta(proximoPago(c.dia_pago)); return c.mensual > 0 && c.pagadoMes < c.mensual && x != null && x <= 3 })
  const ingreso = activos.reduce((s, c) => s + c.mensual, 0)
  const cobrado = (d?.pagos || []).reduce((s, p) => s + Number(p.valor || 0), 0)
  const sesiones = (d?.clientes || []).reduce((s, c) => s + c.sesiones, 0)
  const sesionesHora = (d?.clientes || []).reduce((s, c) => s + c.sesionesHora, 0)
  const espacio = (d?.clientes || []).reduce((s, c) => s + c.espacio, 0)
  const atencion = d ? [
    ...d.avisos.map(a => ({ id: a.id, tono: 'rojo', texto: a.mensaje, nota: `${clienteDe(a.cliente_id)?.nombre || 'Cliente'} · ${cuando(a.created_at)}`, accion: 'Poner clave temporal', hacer: () => { const u = d.usuarios?.find(x => x.id === a.usuario_id); if (u) abrirClave(u) } })),
    ...d.solicitudes.map(s => ({ id: s.id, tono: 'ambar', texto: `${s.negocio} pidió una demo`, nota: `${s.nombre} · ${cuando(s.created_at)}`, accion: 'Revisar', hacer: () => ir('solicitudes') })),
    ...porVencer.map(c => ({ id: c.id, tono: 'rojo', texto: `La demo de ${c.nombre} ${diasHasta(c.demo_hasta) === 0 ? 'vence hoy' : 'vence mañana'}`, nota: c.contacto_nombre || '', accion: 'Abrir', hacer: () => abrirFicha(c) })),
    ...pagosPendientes.map(c => ({ id: 'p' + c.id, tono: 'ambar', texto: `${c.nombre} paga ${$(c.mensual)}`, nota: `Vence ${fechaCorta(proximoPago(c.dia_pago))}`, accion: 'Registrar pago', hacer: () => { ir('pagos'); nuevoPago(c) } })),
  ] : []
  const conteo = { solicitudes: d?.solicitudes.length || 0, usuarios: d?.avisos.length || 0 }

  const usuariosFiltrados = (d?.usuarios || []).filter(u => (!filtroCliente || u.cliente_id === filtroCliente) && (!buscar || `${u.nombre} ${u.usuario} ${clienteDe(u.cliente_id)?.nombre || ''}`.toLowerCase().includes(buscar.toLowerCase())))

  return (
    <div className="min-h-screen md:flex" style={{ background: C.fondo, color: C.tinta, fontFamily: 'var(--font-texto), system-ui, sans-serif' }}>
      {/* Menu lateral (computador) / barra superior con pestañas (celular). */}
      <aside className="relative md:w-[232px] md:shrink-0 md:h-screen md:sticky md:top-0 flex flex-col text-white" style={{ background: C.noche }}>
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
          <span className="bg-white rounded-lg px-2 py-1 inline-flex"><Image src="/maissypos-logo.png" width={70} height={26} alt="MaissyPOS" style={{ height: 24, width: 'auto' }} /></span>
          <span className="text-[11px] font-extrabold tracking-[.12em]" style={{ color: C.amarillo }}>PLATAFORMA</span>
          <span className="flex-1 md:hidden" />
          <button type="button" onClick={() => setMenu(!menu)} className="md:hidden" aria-label="Mi cuenta"><Avatar nombre={usuario.nombre} oscuro /></button>
        </div>
        <nav className="flex md:flex-col gap-1 px-2 md:px-3 pb-2 md:pb-0 overflow-x-auto" aria-label="Secciones">
          {SECCIONES.map(([id, t, icono]) => {
            const activo = seccion === id, n = conteo[id]
            return (
              <button key={id} type="button" onClick={() => ir(id)} aria-current={activo ? 'page' : undefined}
                className="flex items-center gap-2.5 rounded-xl px-3 min-h-[42px] text-[14.5px] font-bold whitespace-nowrap"
                style={activo ? { background: '#2B2925', color: '#fff' } : { color: '#B9B4AA' }}>
                <Icono d={icono} />{t}
                {n > 0 && <span className="ml-auto text-[11.5px] font-extrabold rounded-full px-1.5 min-w-[20px] text-center" style={{ background: C.rojo, color: '#fff' }}>{n}</span>}
              </button>
            )
          })}
        </nav>
        <div className="flex-1 hidden md:block" />
        <div className="relative hidden md:block p-3" style={{ borderTop: '1px solid #2B2925' }}>
          <button type="button" onClick={() => setMenu(!menu)} className="w-full flex items-center gap-2.5 rounded-xl p-2 text-left hover:bg-[#2B2925]" aria-expanded={menu}>
            <Avatar nombre={usuario.nombre} oscuro />
            <span className="min-w-0"><b className="block text-[14px] truncate">{usuario.nombre || usuario.usuario}</b><span className="block text-[12px] truncate" style={{ color: '#B9B4AA' }}>@{usuario.usuario} · Plataforma</span></span>
          </button>
        </div>
        {menu && (
          <div className="absolute md:fixed right-3 md:right-auto md:left-3 top-[60px] md:top-auto md:bottom-[76px] z-[80] w-[220px] rounded-2xl bg-white p-1.5 flex flex-col shadow-[0_12px_32px_rgba(0,0,0,.18)]" style={{ color: C.tinta }}>
            <button type="button" onClick={() => { setMenu(false); setError(''); setPerfil({ nombre: sinNombre ? '' : usuario.nombre }) }} className="text-left rounded-xl px-3 min-h-[42px] font-bold text-[14px] hover:bg-[#F3F1EA]">Mi perfil</button>
            <button type="button" onClick={salir} className="text-left rounded-xl px-3 min-h-[42px] font-bold text-[14px] hover:bg-[#F3F1EA]" style={{ color: C.rojo }}>Cerrar sesión</button>
          </div>
        )}
      </aside>

      <main className="flex-1 min-w-0 px-4 md:px-8 py-6 md:py-8 flex flex-col gap-5 max-w-[1320px]">
        {error && !ficha && !demo && !claveTemp && !perfil && <p className="m-0 rounded-2xl px-4 py-3 text-[14px] font-semibold" style={{ background: C.rojoF, color: C.rojo }} role="alert">{error}</p>}
        {d?.sinMigracion && <p className="m-0 rounded-2xl px-4 py-3 text-[14px] font-semibold" style={{ background: C.ambarF, color: C.ambar }}>Falta aplicar la migración 0144 en la base de datos: sin ella no aparecen los usuarios, los avisos ni el registro.</p>}

        {seccion === 'resumen' && (<>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="text-[13px] font-bold" style={{ color: C.gris }}>{new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
              <h1 className="m-0 text-[30px] font-extrabold leading-tight" style={{ fontFamily: TITULO }}>{saludo}{nombre ? `, ${nombre}` : ''}</h1>
            </div>
            <button type="button" onClick={() => abrirDemo(null)} className={boton + ' text-white'} style={{ background: C.rojo }}>+ Nueva demo</button>
          </div>
          {sinNombre && <button type="button" onClick={() => { setError(''); setPerfil({ nombre: '' }) }} className="text-left rounded-2xl px-4 py-3 text-[14px] font-semibold" style={{ background: C.ambarF, color: C.ambar }}>Tu cuenta aparece como “{usuario.nombre || usuario.usuario}”. Toca aquí para poner tu nombre.</button>}
          {!d ? <Vacio>Cargando…</Vacio> : (<>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))' }}>
              <Kpi rotulo="Ingreso del mes" valor={$(ingreso)} nota={`Cobrado ${$(cobrado)}`} onClick={() => ir('pagos')} />
              <Kpi rotulo="Clientes activos" valor={activos.length} nota={`${activos.reduce((s, c) => s + c.empresas.length, 0)} empresas`} onClick={() => ir('clientes')} />
              <Kpi rotulo="En demo" valor={demos.length} nota={porVencer.length ? `${porVencer.length} vence${porVencer.length > 1 ? 'n' : ''} pronto` : 'Ninguna por vencer'} rojo={porVencer.length > 0} onClick={() => ir('clientes')} />
              <Kpi rotulo="Usuarios" valor={d.usuarios ? d.usuarios.filter(u => u.activo).length : activos.reduce((s, c) => s + c.usuarios, 0)} nota={`${sesionesHora} activo${sesionesHora === 1 ? '' : 's'} en la última hora`} onClick={() => ir('usuarios')} />
            </div>
            <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))' }}>
              <Tarjeta titulo="Requiere tu atención">
                {atencion.length === 0 ? <Vacio>Todo al día. No hay claves olvidadas, demos por vencer ni pagos atrasados.</Vacio> : atencion.map(a => (
                  <div key={a.id} className="flex items-center gap-3 py-2.5" style={{ borderTop: `1px solid ${C.linea}` }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: a.tono === 'rojo' ? C.rojo : C.amarillo }} />
                    <span className="flex-1 min-w-0"><b className="block text-[14.5px]">{a.texto}</b>{a.nota && <span className="block text-[12.5px]" style={{ color: C.gris }}>{a.nota}</span>}</span>
                    <button type="button" onClick={a.hacer} className={boton} style={{ background: C.suave }}>{a.accion}</button>
                  </div>
                ))}
              </Tarjeta>
              <Tarjeta titulo="Clientes" accion={<button type="button" onClick={() => ir('clientes')} className="text-[13.5px] font-bold underline underline-offset-[3px]">Ver todos</button>}>
                {d.clientes.length === 0 ? <Vacio>Todavía no hay clientes.</Vacio> : d.clientes.slice().sort((a, b) => (b.ultima || '').localeCompare(a.ultima || '')).slice(0, 6).map(c => {
                  const [tono, txt] = estadoDe(c)
                  return (
                    <button key={c.id} type="button" onClick={() => abrirFicha(c)} className="flex items-center gap-3 py-2.5 text-left" style={{ borderTop: `1px solid ${C.linea}` }}>
                      <Avatar nombre={c.nombre} />
                      <span className="flex-1 min-w-0"><b className="block text-[14.5px] truncate">{c.nombre}</b><span className="block text-[12.5px]" style={{ color: C.gris }}>{c.usuarios} usuario{c.usuarios === 1 ? "" : "s"} · {cuando(c.ultima)}</span></span>
                      <Pastilla tono={tono}>{txt}</Pastilla>
                    </button>
                  )
                })}
              </Tarjeta>
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))' }}>
              <Kpi rotulo="Sesiones abiertas" valor={sesiones} nota="en todos los clientes" />
              <Kpi rotulo="Espacio usado" valor={tam(espacio)} nota="datos y archivos" />
              <Kpi rotulo="Solicitudes de demo" valor={d.solicitudes.length} nota="por revisar" rojo={d.solicitudes.length > 0} onClick={() => ir('solicitudes')} />
            </div>
          </>)}
        </>)}

        {seccion === 'clientes' && d && (
          <Tarjeta titulo="Clientes" accion={<button type="button" onClick={() => abrirDemo(null)} className={boton + ' text-white'} style={{ background: C.rojo }}>+ Nueva demo</button>}>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full min-w-[920px] border-collapse text-[14px] tabular-nums">
                <thead><tr className="text-left text-[11.5px] tracking-[.06em]" style={{ color: C.gris }}>
                  {['CLIENTE', 'ESTADO', 'EMPRESAS Y PLAN', 'USUARIOS', 'ÚLTIMA ACTIVIDAD', 'ESPACIO', 'PAGO'].map((t, i) => <th key={t} className={`py-2 px-2 font-bold ${[3, 5].includes(i) ? 'text-right' : ''}`}>{t}</th>)}
                </tr></thead>
                <tbody>
                  {d.clientes.map(c => {
                    const [tono, txt] = estadoDe(c)
                    const prox = proximoPago(c.dia_pago)
                    const dp = diasHasta(prox)
                    return (
                      <tr key={c.id} onClick={() => abrirFicha(c)} className="cursor-pointer hover:bg-[#F7F6F1]" style={{ borderTop: `1px solid ${C.linea}` }} title="Abrir la ficha del cliente">
                        <td className="py-3 px-2"><span className="flex items-center gap-2.5"><Avatar nombre={c.nombre} size={32} /><span className="min-w-0"><b className="block">{c.nombre}</b><span className="block text-[12.5px]" style={{ color: C.gris }}>{[c.contacto_nombre, c.ciudad].filter(Boolean).join(' · ')}</span></span></span></td>
                        <td className="px-2"><Pastilla tono={tono}>{txt}</Pastilla></td>
                        <td className="px-2">{c.empresas.map(e => <span key={e.id} className="block">{e.nombre} <span style={{ color: C.gris }}>· {PLAN[e.plan] || e.plan}</span></span>)}</td>
                        <td className="px-2 text-right">{c.usuarios}</td>
                        <td className="px-2">{cuando(c.ultima)}</td>
                        <td className="px-2 text-right">{tam(c.espacio)}</td>
                        <td className="px-2">
                          {c.estado === 'demo' ? <span style={{ color: C.gris }}>En demo</span> : (<>
                            <b>{$(c.mensual)}</b><span style={{ color: C.gris }}> al mes</span>
                            {prox && <span className="block text-[12.5px]" style={{ color: c.pagadoMes >= c.mensual ? C.verde : dp != null && dp <= 3 ? C.ambar : C.gris }}>{c.pagadoMes >= c.mensual ? 'Pagado este mes' : `Vence ${fechaCorta(prox)}`}</span>}
                          </>)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {d.sueltas.length > 0 && <p className="m-0 text-[13px]" style={{ color: C.ambar }}>{d.sueltas.length} empresa{d.sueltas.length > 1 ? 's' : ''} sin cliente asignado: {d.sueltas.map(e => e.nombre).join(', ')}.</p>}
          </Tarjeta>
        )}

        {seccion === 'usuarios' && d && (
          <Tarjeta titulo="Usuarios de tus clientes">
            <p className="m-0 text-[13.5px]" style={{ color: C.gris }}>Ves quién es cada usuario y cuándo entró. Nunca su contraseña: si la olvida, le pones una temporal y el sistema le pide cambiarla al entrar.</p>
            {!d.usuarios ? <Vacio>Aparecen cuando se aplique la migración 0144.</Vacio> : (<>
              <div className="flex flex-wrap gap-2 pt-1">
                <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre, usuario o cliente" className={campo + ' flex-[1_1_260px]'} style={bordeCampo} />
                <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} className={campo + ' flex-[0_1_240px]'} style={bordeCampo} aria-label="Cliente">
                  <option value="">Todos los clientes</option>
                  {d.clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <ListaUsuarios usuarios={usuariosFiltrados} clienteDe={clienteDe} avisos={d.avisos} abrirClave={abrirClave} alternarActivo={alternarActivo} conCliente />
            </>)}
          </Tarjeta>
        )}

        {seccion === 'solicitudes' && d && (
          <Tarjeta titulo="Solicitudes de demo">
            {d.solicitudes.length === 0 ? <Vacio>No hay solicitudes nuevas. Llegan desde “Probarlo en mi negocio” en la página.</Vacio> : d.solicitudes.map(s => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 py-3" style={{ borderTop: `1px solid ${C.linea}` }}>
                <div className="flex-[1_1_300px] min-w-0">
                  <b className="block text-[16px]">{s.negocio}</b>
                  <span className="text-[13px]" style={{ color: C.gris }}>{[s.nombre, s.actividades?.join(', '), s.ciudad, s.rutas ? `${s.rutas} rutas` : null, cuando(s.created_at)].filter(Boolean).join(' · ')}</span>
                </div>
                <a href={`https://wa.me/57${telefono(s.celular)}`} target="_blank" rel="noreferrer" className={boton} style={{ background: C.suave }}>WhatsApp</a>
                <button type="button" onClick={() => descartar(s)} className={boton} style={{ background: C.suave }}>Descartar</button>
                <button type="button" onClick={() => abrirDemo(s)} className={boton + ' text-white'} style={{ background: C.rojo }}>Aprobar demo</button>
              </div>
            ))}
          </Tarjeta>
        )}

        {seccion === 'pagos' && d && (
          <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))' }}>
            <Tarjeta titulo="Pagos del mes" accion={!pago && <button type="button" onClick={() => nuevoPago(null)} className={boton + ' text-white'} style={{ background: C.rojo }}>Registrar pago</button>}>
              {pago && (
                <div className="rounded-2xl p-3 flex flex-col gap-2.5" style={{ background: C.fondo }}>
                  <Etiqueta t="Cliente">
                    <select value={pago.cliente_id} onChange={e => { const c = clienteDe(e.target.value); setPago({ ...pago, cliente_id: e.target.value, valor: c ? String(c.mensual) : pago.valor }) }} className={campo}>
                      {d.clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </Etiqueta>
                  <div className="grid grid-cols-2 gap-2">
                    <Etiqueta t="Valor"><InputDinero value={pago.valor} onChange={e => setPago({ ...pago, valor: e.target.value })} className={campo} /></Etiqueta>
                    <Etiqueta t="Fecha"><CampoFecha value={pago.fecha} onChange={e => setPago({ ...pago, fecha: e.target.value })} className={campo} /></Etiqueta>
                  </div>
                  <Etiqueta t="Medio"><input value={pago.medio} onChange={e => setPago({ ...pago, medio: e.target.value })} className={campo} /></Etiqueta>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setPago(null)} className={boton} style={{ background: '#fff' }}>Cancelar</button>
                    <button type="button" onClick={guardarPago} disabled={guardando} className={boton + ' text-white'} style={{ background: C.rojo }}>{guardando ? 'Guardando…' : 'Guardar pago'}</button>
                  </div>
                </div>
              )}
              <div className="flex justify-between text-[14px] py-1"><span style={{ color: C.gris }}>Cobrado de {$(ingreso)}</span><b className="tabular-nums">{$(cobrado)}</b></div>
              <div className="h-2.5 rounded-full" style={{ background: C.suave }}><div className="h-2.5 rounded-full" style={{ width: `${Math.min(100, ingreso ? cobrado / ingreso * 100 : 0)}%`, background: C.verde }} /></div>
              {d.pagos.length === 0 && !pago && <Vacio>Todavía no hay pagos este mes.</Vacio>}
              {d.pagos.map(p => (
                <div key={p.id} className="flex justify-between gap-3 py-2 text-[14px]" style={{ borderTop: `1px solid ${C.linea}` }}>
                  <span>{clienteDe(p.cliente_id)?.nombre || 'Cliente'}<span className="block text-[12.5px]" style={{ color: C.gris }}>{fechaCorta(p.fecha)}{p.medio ? ` · ${p.medio}` : ''}{p.registrado_por ? ` · ${p.registrado_por}` : ''}</span></span>
                  <b className="tabular-nums">{$(p.valor)}</b>
                </div>
              ))}
            </Tarjeta>
            <Tarjeta titulo="Por cobrar">
              {activos.length === 0 ? <Vacio>No hay clientes activos.</Vacio> : activos.map(c => {
                const prox = proximoPago(c.dia_pago), pagado = c.pagadoMes >= c.mensual
                return (
                  <div key={c.id} className="flex items-center gap-3 py-2.5 text-[14px]" style={{ borderTop: `1px solid ${C.linea}` }}>
                    <span className="flex-1 min-w-0"><b className="block truncate">{c.nombre}</b><span className="block text-[12.5px]" style={{ color: C.gris }}>{$(c.mensual)} al mes{prox ? ` · vence ${fechaCorta(prox)}` : ' · sin día de pago'}</span></span>
                    {pagado ? <Pastilla tono="verde">Pagado</Pastilla> : <button type="button" onClick={() => nuevoPago(c)} className={boton} style={{ background: C.suave }}>Registrar</button>}
                  </div>
                )
              })}
              <div className="flex flex-col gap-0.5 pt-2 text-[13px]" style={{ color: C.gris, borderTop: `1px solid ${C.linea}` }}>
                <span><b style={{ color: C.tinta }}>Empresa</b> (rutas, despacho, producción) · $250.000 al mes</span>
                <span><b style={{ color: C.tinta }}>Punto de venta</b> (tienda, almacén o restaurante) · $150.000 al mes</span>
              </div>
            </Tarjeta>
          </div>
        )}

        {seccion === 'registro' && d && (
          <Tarjeta titulo="Registro de la plataforma">
            <p className="m-0 text-[13.5px]" style={{ color: C.gris }}>Todo lo que se hace desde aquí sobre los usuarios de un cliente: quién, cuándo y a quién. No se puede borrar.</p>
            {d.registro.length === 0 ? <Vacio>{d.sinMigracion ? 'Aparece cuando se aplique la migración 0144.' : 'Todavía no hay acciones registradas.'}</Vacio> : d.registro.map(r => (
              <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[14px]" style={{ borderTop: `1px solid ${C.linea}` }}>
                <span className="w-[110px] shrink-0 text-[12.5px]" style={{ color: C.gris }}>{cuando(r.created_at)}</span>
                <b className="flex-[0_0_auto]">{ACCION[r.accion] || r.accion}</b>
                <span className="flex-1 min-w-[200px]">{r.detalle}<span style={{ color: C.gris }}>{clienteDe(r.cliente_id) ? ` · ${clienteDe(r.cliente_id).nombre}` : ''}</span></span>
                <span className="text-[12.5px]" style={{ color: C.gris }}>por {r.actor}</span>
              </div>
            ))}
          </Tarjeta>
        )}
      </main>

      {(ficha || demo || creada || claveTemp || perfil) && (
        <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center" onClick={() => { setFicha(null); setDemo(null); setCreada(null); setClaveTemp(null); setPerfil(null) }}
          style={{ background: 'rgba(28,27,25,.28)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
          <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} className={`w-full ${ficha ? 'md:max-w-[680px]' : 'md:max-w-[520px]'} max-h-[92vh] overflow-y-auto rounded-t-[28px] md:rounded-[28px] p-5 md:p-6 flex flex-col gap-3.5`}
            style={{ background: '#fff', boxShadow: '0 16px 40px rgba(28,27,25,.18)' }}>
            {claveTemp ? <ClaveTemporal c={claveTemp} setC={setClaveTemp} cliente={clienteDe(claveTemp.u.cliente_id)} poner={ponerClave} guardando={guardando} error={error} cerrar={() => setClaveTemp(null)} />
              : ficha ? <FichaCliente ficha={ficha} setFicha={setFicha} alargar={alargar} guardar={guardarFicha} guardando={guardando} cerrar={() => setFicha(null)} error={error}
                  pagos={d.pagos.filter(p => p.cliente_id === ficha.id)} usuarios={d.usuarios} avisos={d.avisos} abrirClave={abrirClave} alternarActivo={alternarActivo} registrarPago={() => { const c = clienteDe(ficha.id); setFicha(null); ir('pagos'); nuevoPago(c) }} />
              : demo ? <FormDemo demo={demo} setDemo={setDemo} crear={crearDemo} guardando={guardando} cerrar={() => setDemo(null)} error={error} />
              : creada ? <DemoCreada c={creada} cerrar={() => setCreada(null)} />
              : <MiPerfil perfil={perfil} setPerfil={setPerfil} usuario={usuario} guardar={guardarPerfil} guardando={guardando} error={error} cerrar={() => setPerfil(null)} />}
          </div>
        </div>
      )}
    </div>
  )
}

function ListaUsuarios({ usuarios, clienteDe, avisos, abrirClave, alternarActivo, conCliente }) {
  if (usuarios.length === 0) return <Vacio>No hay usuarios con ese filtro.</Vacio>
  return (
    <div className="flex flex-col">
      {usuarios.map(u => {
        const olvido = avisos.some(a => a.usuario_id === u.id)
        return (
          <div key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5" style={{ borderTop: `1px solid ${C.linea}` }}>
            <span className="flex items-center gap-3 flex-[1_1_320px] min-w-0" style={{ opacity: u.activo ? 1 : 0.55 }}>
              <Avatar nombre={u.nombre} />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <b className="text-[14.5px]">{u.nombre}</b>
                  {olvido && <Pastilla tono="rojo">Olvidó su clave</Pastilla>}
                  {u.debe_cambiar_clave && <Pastilla tono="ambar">Con clave temporal</Pastilla>}
                  {!u.activo && <Pastilla tono="gris">Inactivo</Pastilla>}
                  {!u.tiene_acceso && <Pastilla tono="gris">Sin acceso</Pastilla>}
                </span>
                <span className="block text-[12.5px]" style={{ color: C.gris }}>@{u.usuario} · {ROL[u.rol] || u.rol}{conCliente && clienteDe(u.cliente_id) ? ` · ${clienteDe(u.cliente_id).nombre}` : ''}{u.empresasNombre?.length ? ` · ${u.empresasNombre.join(', ')}` : ''} · Entró: {cuando(u.ultimo_acceso).toLowerCase()}</span>
              </span>
            </span>
            <span className="flex gap-1.5 ml-auto">
              <button type="button" onClick={() => abrirClave(u)} className={boton} style={{ background: olvido ? C.rojo : C.suave, color: olvido ? '#fff' : C.tinta }}>Clave temporal</button>
              <button type="button" onClick={() => alternarActivo(u)} className={boton} style={{ background: C.suave }}>{u.activo ? 'Desactivar' : 'Activar'}</button>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function FichaCliente({ ficha, setFicha, alargar, guardar, guardando, cerrar, error, pagos, usuarios, avisos, abrirClave, alternarActivo, registrarPago }) {
  const set = (k, v) => setFicha({ ...ficha, [k]: v })
  const setEmp = (i, k, v) => setFicha({ ...ficha, empresas: ficha.empresas.map((e, j) => j === i ? { ...e, [k]: v } : e) })
  const mensual = ficha.empresas.filter(e => e.activo).reduce((s, e) => s + (Number(e.precio) || 0), 0)
  const suyos = (usuarios || []).filter(u => u.cliente_id === ficha.id)
  const tel = telefono(ficha.contacto_celular)
  const [tono, txt] = estadoDe(ficha)
  const pestanas = [['general', 'General'], ['plan', 'Empresas y plan'], ['usuarios', `Usuarios${usuarios ? ` (${suyos.length})` : ''}`], ['pagos', 'Pagos']]
  return (<>
    <div className="flex justify-between items-start gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <Avatar nombre={ficha.nombre} size={46} />
        <div className="min-w-0"><h2 className="m-0 text-[24px] font-extrabold leading-tight truncate" style={{ fontFamily: TITULO }}>{ficha.nombre || 'Cliente'}</h2>
          <span className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: C.gris }}><Pastilla tono={tono}>{txt}</Pastilla>{$(mensual)} al mes</span></div>
      </div>
      <Cerrar onClick={cerrar} />
    </div>
    <div className="flex gap-1 overflow-x-auto rounded-2xl p-1" style={{ background: C.suave }} role="tablist">
      {pestanas.map(([id, t]) => <button key={id} type="button" role="tab" aria-selected={ficha.pestana === id} onClick={() => set('pestana', id)} className="flex-1 whitespace-nowrap rounded-xl min-h-[38px] px-3 text-[13.5px] font-bold" style={ficha.pestana === id ? { background: '#fff', color: C.tinta } : { color: C.gris }}>{t}</button>)}
    </div>

    {ficha.pestana === 'general' && (<>
      <div className="flex flex-wrap gap-1.5">
        {[['demo', 'Demo'], ['activo', 'Activo'], ['suspendido', 'Suspendido'], ['vencido', 'Vencido']].map(([v, t]) => <Chip key={v} activo={ficha.estado === v} onClick={() => set('estado', v)}>{t}</Chip>)}
      </div>
      {ficha.estado === 'demo' && (
        <div className="flex flex-wrap items-end gap-2">
          <Etiqueta t="Demo hasta" className="flex-[1_1_200px]"><CampoFecha value={ficha.demo_hasta || ''} onChange={e => set('demo_hasta', e.target.value)} className={campo} style={bordeCampo} /></Etiqueta>
          <button type="button" onClick={() => alargar(15)} className={boton + ' min-h-[44px]'} style={{ background: C.suave }}>+15 días</button>
          <button type="button" onClick={() => alargar(30)} className={boton + ' min-h-[44px]'} style={{ background: C.suave }}>+30 días</button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <Etiqueta t="Nombre del cliente" className="col-span-2"><input value={ficha.nombre} onChange={e => set('nombre', e.target.value)} className={campo} style={bordeCampo} /></Etiqueta>
        <Etiqueta t="Contacto"><input value={ficha.contacto_nombre || ''} onChange={e => set('contacto_nombre', e.target.value)} className={campo} style={bordeCampo} /></Etiqueta>
        <Etiqueta t="Celular"><div className="flex gap-1.5"><input inputMode="tel" value={ficha.contacto_celular || ''} onChange={e => set('contacto_celular', e.target.value)} className={campo} style={bordeCampo} />{tel.length === 10 && <a href={`https://wa.me/57${tel}`} target="_blank" rel="noreferrer" className={boton + ' shrink-0'} style={{ background: C.suave, color: C.tinta }}>WhatsApp</a>}</div></Etiqueta>
        <Etiqueta t="Ciudad"><input value={ficha.ciudad || ''} onChange={e => set('ciudad', e.target.value)} className={campo} style={bordeCampo} /></Etiqueta>
        <Etiqueta t="Día de pago"><input inputMode="numeric" value={ficha.dia_pago || ''} onChange={e => set('dia_pago', e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="1 a 28" className={campo} style={bordeCampo} /></Etiqueta>
      </div>
      <Etiqueta t="Notas"><textarea value={ficha.notas || ''} onChange={e => set('notas', e.target.value)} rows={3} className="w-full rounded-xl bg-white px-3 py-2 text-[15px] outline-none" style={bordeCampo} /></Etiqueta>
      <div className="grid grid-cols-3 gap-2 text-[13px]">
        {[['Usuarios', ficha.usuarios], ['Última actividad', cuando(ficha.ultima)], ['Espacio', tam(ficha.espacio)]].map(([t, v]) => <div key={t} className="rounded-2xl p-3" style={{ background: C.fondo }}><span className="block font-bold" style={{ color: C.gris }}>{t}</span><b className="text-[15px]">{v}</b></div>)}
      </div>
    </>)}

    {ficha.pestana === 'plan' && (<>
      {ficha.empresas.length === 0 && <Vacio>Este cliente todavía no tiene empresas.</Vacio>}
      {ficha.empresas.map((e, i) => (
        <div key={e.id} className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: C.fondo }}>
          <div className="flex flex-wrap justify-between items-center gap-2"><b className="flex-1 min-w-0">{e.nombre}</b>
            <Link href={`/plataforma/migracion/${e.id}`} className={boton + ' min-h-[38px]'} style={{ background: '#fff' }}>Migrar datos</Link>
            <label className="inline-flex items-center gap-2 text-[13px] font-bold" style={{ color: C.gris }}><input type="checkbox" checked={e.activo} onChange={x => setEmp(i, 'activo', x.target.checked)} className="w-[18px] h-[18px]" style={{ accentColor: C.tinta }} />Activa</label>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex gap-1.5">
              <Chip activo={e.plan === 'empresa'} onClick={() => setFicha({ ...ficha, empresas: ficha.empresas.map((x, j) => j === i ? { ...x, plan: 'empresa', precio: '250000' } : x) })}>Empresa</Chip>
              <Chip activo={e.plan === 'mostrador'} onClick={() => setFicha({ ...ficha, empresas: ficha.empresas.map((x, j) => j === i ? { ...x, plan: 'mostrador', precio: '150000' } : x) })}>Punto de venta</Chip>
            </div>
            <Etiqueta t="Valor al mes" className="flex-[1_1_140px]"><InputDinero value={e.precio} onChange={x => setEmp(i, 'precio', x.target.value)} className={campo} style={bordeCampo} /></Etiqueta>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-bold" style={{ color: C.gris }}>Módulos</span>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(MODELO).map(([id, t]) => <Chip key={id} activo={(e.modelos || []).includes(id)} onClick={() => { const m = e.modelos || []; const n = m.includes(id) ? m.filter(x => x !== id) : [...m, id]; if (n.length) setEmp(i, 'modelos', n) }}>{t}</Chip>)}
            </div>
          </div>
          <span className="text-[12.5px]" style={{ color: C.gris }}>{e.uso?.usuarios || 0} usuarios · {tam(e.uso?.espacio_bytes || 0)}</span>
        </div>
      ))}
    </>)}

    {ficha.pestana === 'usuarios' && (!usuarios ? <Vacio>Aparecen cuando se aplique la migración 0144.</Vacio>
      : <ListaUsuarios usuarios={suyos} clienteDe={() => null} avisos={avisos} abrirClave={abrirClave} alternarActivo={alternarActivo} />)}

    {ficha.pestana === 'pagos' && (<>
      {pagos.length === 0 ? <Vacio>No hay pagos este mes.</Vacio> : pagos.map(p => <div key={p.id} className="flex justify-between py-2 text-[14px]" style={{ borderTop: `1px solid ${C.linea}` }}><span>{fechaCorta(p.fecha)}{p.medio ? ` · ${p.medio}` : ''}</span><b className="tabular-nums">{$(p.valor)}</b></div>)}
      {ficha.estado !== 'demo' && <button type="button" onClick={registrarPago} className={boton + ' self-start'} style={{ background: C.suave }}>Registrar pago</button>}
    </>)}

    <MensajeError>{error}</MensajeError>
    {['general', 'plan'].includes(ficha.pestana) && (
      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={cerrar} className={boton + ' min-h-[46px] px-4'} style={{ background: C.suave }}>Cancelar</button>
        <button type="button" onClick={guardar} disabled={guardando} className={boton + ' min-h-[46px] px-5 text-white'} style={{ background: C.rojo }}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
      </div>
    )}
  </>)
}

function ClaveTemporal({ c, setC, cliente, poner, guardando, error, cerrar }) {
  const { u } = c
  const texto = `Hola ${(u.nombre || '').split(' ')[0]}, te dejo una contraseña temporal para MaissyPOS.\n\nEntra en maissypos.com/entrar\nUsuario: ${u.usuario}\nContraseña temporal: ${c.clave}\n\nAl entrar te va a pedir que pongas una nueva que solo sepas tú.`
  const tel = telefono(cliente?.contacto_celular)
  const [copiado, setCopiado] = useState(false)
  if (c.lista) return (<>
    <Cabeza rotulo="CLAVE TEMPORAL LISTA" titulo={u.nombre} cerrar={cerrar} />
    <div className="rounded-2xl p-4 flex flex-col gap-1 text-[15px]" style={{ background: C.verdeF }}>
      <span>Usuario: <b className="select-all">{u.usuario}</b></span>
      <span>Contraseña temporal: <b className="select-all tabular-nums">{c.clave}</b></span>
      <span className="text-[13px]" style={{ color: C.verde }}>Al entrar debe ponerla nueva. Queda en el registro.</span>
    </div>
    <pre className="m-0 whitespace-pre-wrap rounded-2xl p-3 text-[13.5px]" style={{ background: C.fondo, fontFamily: 'inherit' }}>{texto}</pre>
    <div className="flex flex-wrap gap-2 justify-end">
      <button type="button" onClick={() => navigator.clipboard?.writeText(texto).then(() => setCopiado(true)).catch(() => {})} className={boton + ' min-h-[46px] px-4'} style={{ background: C.suave }}>{copiado ? 'Copiado' : 'Copiar mensaje'}</button>
      {tel.length === 10 && <a href={`https://wa.me/57${tel}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer" className={boton + ' min-h-[46px] px-5 text-white'} style={{ background: C.rojo }}>Enviar al contacto</a>}
    </div>
  </>)
  return (<>
    <Cabeza rotulo="CLAVE TEMPORAL" titulo={u.nombre} cerrar={cerrar} />
    <p className="m-0 text-[14px]" style={{ color: C.gris }}>@{u.usuario} · {ROL[u.rol] || u.rol}{cliente ? ` · ${cliente.nombre}` : ''}. Su contraseña actual deja de servir. Al entrar con la temporal, el sistema le pide poner una nueva que tú no conoces.</p>
    <Etiqueta t="Contraseña temporal"><div className="flex gap-1.5"><input value={c.clave} onChange={e => setC({ ...c, clave: e.target.value })} className={campo + ' tabular-nums'} style={bordeCampo} /><button type="button" onClick={() => setC({ ...c, clave: generarClave() })} className={boton + ' shrink-0'} style={{ background: C.suave }}>Otra</button></div></Etiqueta>
    <MensajeError>{error}</MensajeError>
    <div className="flex gap-2 justify-end">
      <button type="button" onClick={cerrar} className={boton + ' min-h-[46px] px-4'} style={{ background: C.suave }}>Cancelar</button>
      <button type="button" onClick={poner} disabled={guardando || c.clave.length < 6} className={boton + ' min-h-[46px] px-5 text-white'} style={{ background: C.rojo }}>{guardando ? 'Poniendo…' : 'Poner clave temporal'}</button>
    </div>
  </>)
}

function MiPerfil({ perfil, setPerfil, usuario, guardar, guardando, error, cerrar }) {
  return (<>
    <Cabeza rotulo="MI PERFIL" titulo={perfil.nombre || 'Tu nombre'} cerrar={cerrar} />
    <p className="m-0 text-[14px]" style={{ color: C.gris }}>Es el nombre con el que te saluda la consola y el que queda en el registro y en los pagos. Entras con el usuario <b style={{ color: C.tinta }}>@{usuario.usuario}</b>.</p>
    <Etiqueta t="Tu nombre"><input value={perfil.nombre} onChange={e => setPerfil({ nombre: e.target.value })} placeholder="Nombre y apellido" autoFocus className={campo} style={bordeCampo} /></Etiqueta>
    <MensajeError>{error}</MensajeError>
    <div className="flex gap-2 justify-end">
      <button type="button" onClick={cerrar} className={boton + ' min-h-[46px] px-4'} style={{ background: C.suave }}>Cancelar</button>
      <button type="button" onClick={guardar} disabled={guardando || perfil.nombre.trim().length < 2} className={boton + ' min-h-[46px] px-5 text-white'} style={{ background: C.rojo }}>{guardando ? 'Guardando…' : 'Guardar'}</button>
    </div>
  </>)
}

function FormDemo({ demo, setDemo, crear, guardando, cerrar, error }) {
  const set = (k, v) => setDemo({ ...demo, [k]: v })
  const alternar = (a) => set('actividades', demo.actividades.includes(a) ? demo.actividades.filter(x => x !== a) : [...demo.actividades, a])
  const listo = demo.negocio.trim() && demo.contacto.trim() && demo.usuario.trim() && demo.clave.length >= 6 && demo.actividades.length > 0
  const soloMostrador = demo.actividades.length === 1 && demo.actividades[0] === 'mostrador'
  return (<>
    <Cabeza rotulo={demo.solicitud_id ? 'APROBAR DEMO' : 'NUEVA DEMO'} titulo={demo.negocio || 'Nuevo negocio'} cerrar={cerrar} />
    <div className="grid grid-cols-2 gap-2.5">
      <Etiqueta t="Nombre del negocio" className="col-span-2"><input value={demo.negocio} onChange={e => setDemo({ ...demo, negocio: e.target.value, usuario: !demo.usuario || demo.usuario === sugerirUsuario(demo.negocio) ? sugerirUsuario(e.target.value) : demo.usuario })} className={campo} style={bordeCampo} /></Etiqueta>
      <Etiqueta t="Contacto"><input value={demo.contacto} onChange={e => set('contacto', e.target.value)} className={campo} style={bordeCampo} /></Etiqueta>
      <Etiqueta t="Celular (WhatsApp)"><input inputMode="tel" value={demo.celular} onChange={e => set('celular', e.target.value)} className={campo} style={bordeCampo} /></Etiqueta>
      <Etiqueta t="Ciudad" className="col-span-2"><input value={demo.ciudad} onChange={e => set('ciudad', e.target.value)} className={campo} style={bordeCampo} /></Etiqueta>
    </div>
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-bold" style={{ color: C.gris }}>Qué hace el negocio</span>
      <div className="flex flex-wrap gap-1.5">
        <Chip activo={demo.actividades.includes('distribucion')} onClick={() => alternar('distribucion')}>Reparto por rutas</Chip>
        <Chip activo={demo.actividades.includes('produccion')} onClick={() => alternar('produccion')}>Fabrica productos</Chip>
        <Chip activo={demo.actividades.includes('mostrador')} onClick={() => alternar('mostrador')}>Tienda o punto de venta</Chip>
      </div>
      <span className="text-[13px]" style={{ color: C.gris }}>Plan al terminar: {soloMostrador ? 'Punto de venta · $150.000 al mes' : 'Empresa · $250.000 al mes'}</span>
    </div>
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-bold" style={{ color: C.gris }}>Días de demo</span>
      <div className="flex flex-wrap gap-1.5 items-center">
        {[15, 30].map(n => <Chip key={n} activo={Number(demo.dias) === n} onClick={() => set('dias', n)}>{n} días</Chip>)}
        <input inputMode="numeric" value={[15, 30].includes(Number(demo.dias)) ? '' : demo.dias} onChange={e => set('dias', e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Otro" aria-label="Otro número de días" className="w-20 min-h-[38px] rounded-full bg-white px-3 text-[14px] font-bold text-center outline-none" style={bordeCampo} />
      </div>
    </div>
    <label className="flex items-center gap-2.5 text-[14px] font-semibold"><input type="checkbox" checked={demo.ejemplos} onChange={e => set('ejemplos', e.target.checked)} className="w-[18px] h-[18px]" style={{ accentColor: C.tinta }} />Cargar datos de ejemplo (productos, clientes{demo.actividades.includes('distribucion') ? ' y una ruta' : ''})</label>
    <div className="grid grid-cols-2 gap-2.5 rounded-2xl p-3" style={{ background: C.fondo }}>
      <Etiqueta t="Usuario para entrar"><input value={demo.usuario} onChange={e => set('usuario', e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))} className={campo} style={bordeCampo} /></Etiqueta>
      <Etiqueta t="Contraseña temporal"><div className="flex gap-1.5"><input value={demo.clave} onChange={e => set('clave', e.target.value)} className={campo + ' tabular-nums'} style={bordeCampo} /><button type="button" onClick={() => set('clave', generarClave())} className="rounded-xl px-2.5 text-[12.5px] font-bold shrink-0" style={{ background: '#fff' }}>Otra</button></div></Etiqueta>
      <span className="col-span-2 text-[13px]" style={{ color: C.gris }}>Se crea el usuario Gerencia de este negocio, con una caja de efectivo lista. Desde ahí crea a sus vendedores.</span>
    </div>
    <MensajeError>{error}</MensajeError>
    <div className="flex gap-2 justify-end">
      <button type="button" onClick={cerrar} className={boton + ' min-h-[46px] px-4'} style={{ background: C.suave }}>Cancelar</button>
      <button type="button" onClick={crear} disabled={guardando || !listo} className={boton + ' min-h-[46px] px-5 text-white'} style={{ background: C.rojo }}>{guardando ? 'Creando…' : 'Crear demo'}</button>
    </div>
  </>)
}

function DemoCreada({ c, cerrar }) {
  const texto = `Hola ${(c.contacto || '').split(' ')[0]}, ya tienes tu prueba de MaissyPOS hasta el ${fechaCorta(c.demo_hasta)}.\n\nEntra en maissypos.com/entrar\nUsuario: ${c.usuario}\nContraseña: ${c.clave}\n\nCualquier duda me escribes por aquí.`
  const tel = telefono(c.celular)
  const [copiado, setCopiado] = useState(false)
  const copiar = () => navigator.clipboard?.writeText(texto).then(() => setCopiado(true)).catch(() => {})
  return (<>
    <Cabeza rotulo="DEMO CREADA" titulo={c.negocio} cerrar={cerrar} />
    <div className="rounded-2xl p-4 flex flex-col gap-1.5 text-[15px]" style={{ background: C.verdeF, color: C.verde }}>
      <b>Lista hasta el {fechaCorta(c.demo_hasta)}</b>
      <span style={{ color: C.tinta }}>Usuario: <b className="select-all">{c.usuario}</b></span>
      <span style={{ color: C.tinta }}>Contraseña temporal: <b className="select-all tabular-nums">{c.clave}</b></span>
      <span style={{ color: C.tinta }}>Entra en <b>maissypos.com/entrar</b></span>
    </div>
    <pre className="m-0 whitespace-pre-wrap rounded-2xl p-3 text-[13.5px]" style={{ background: C.fondo, fontFamily: 'inherit' }}>{texto}</pre>
    <div className="flex flex-wrap gap-2 justify-end">
      <button type="button" onClick={copiar} className={boton + ' min-h-[46px] px-4'} style={{ background: C.suave }}>{copiado ? 'Copiado' : 'Copiar mensaje'}</button>
      {tel.length === 10 && <a href={`https://wa.me/57${tel}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer" className={boton + ' min-h-[46px] px-5 text-white'} style={{ background: C.rojo }}>Enviar por WhatsApp</a>}
    </div>
  </>)
}
