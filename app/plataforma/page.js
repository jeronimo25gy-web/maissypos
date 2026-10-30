'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { cerrarSesionUsuario, sesionVigente } from '@/lib/sesion'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import InputDinero from '@/components/InputDinero'
import CampoFecha from '@/components/CampoFecha'

// Consola del dueño de MaissyPOS (rol plataforma): clientes, demos, pagos y
// cifras generales de uso. Nunca muestra datos del negocio de un cliente:
// las cifras salen de plataforma_uso() y plataforma_empresas(), que solo
// devuelven conteos y el plan de cada empresa.
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', linea: '#E3E1D8', suave: '#EFEDE6', rojo: '#C41230', rojoF: '#FBE9E9', amarillo: '#F2B21B', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8' }
const TITULO = 'var(--font-titulo), Georgia, serif'
const $ = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
const tam = (b) => b >= 1e9 ? `${(b / 1e9).toLocaleString('es-CO', { maximumFractionDigits: 1 })} GB` : b >= 1e6 ? `${(b / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 })} MB` : `${Math.round(b / 1e3)} KB`
const cuando = (iso) => {
  if (!iso) return 'Sin actividad'
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
const PLAN = { empresa: 'Empresa', mostrador: 'Punto de venta' }
const sugerirUsuario = (negocio) => (negocio || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '').slice(0, 24)
const MODELO = { distribucion: 'Distribución', produccion: 'Producción', mostrador: 'Punto de venta' }

const Pastilla = ({ tono, children }) => {
  const t = { verde: [C.verde, C.verdeF], ambar: [C.ambar, C.ambarF], rojo: [C.rojo, C.rojoF], gris: [C.gris, C.suave] }[tono]
  return <span className="text-[12px] font-bold rounded-full px-2.5 py-0.5 whitespace-nowrap" style={{ color: t[0], background: t[1] }}>{children}</span>
}
const Kpi = ({ rotulo, valor, nota, rojo }) => (
  <div className="bg-white rounded-[18px] p-3.5 flex flex-col gap-1 min-w-0">
    <span className="text-[12.5px] font-bold" style={{ color: C.gris }}>{rotulo}</span>
    <b className="text-[26px] leading-tight tabular-nums" style={{ fontFamily: TITULO, color: rojo ? C.rojo : C.tinta }}>{valor}</b>
    {nota && <span className="text-[13px]" style={{ color: C.gris }}>{nota}</span>}
  </div>
)

// Estado del cliente con su pastilla.
const estadoDe = (c) => {
  if (c.estado === 'activo') return ['verde', 'Activo']
  if (c.estado === 'suspendido') return ['gris', 'Suspendido']
  if (c.estado === 'vencido') return ['gris', 'Demo vencida · solo lectura']
  const d = diasHasta(c.demo_hasta)
  if (d == null) return ['ambar', 'Demo']
  if (d < 0) return ['gris', 'Demo vencida · solo lectura']
  if (d <= 1) return ['rojo', d === 0 ? 'Demo · vence hoy' : 'Demo · vence mañana']
  return ['ambar', `Demo · quedan ${d} días`]
}

// Proximo pago: el dia de pago de este mes o del siguiente.
const proximoPago = (dia) => {
  if (!dia) return null
  const hoy = new Date(obtenerFechaActual() + 'T12:00:00')
  const este = new Date(hoy.getFullYear(), hoy.getMonth(), Math.min(dia, 28), 12)
  const f = este >= hoy ? este : new Date(hoy.getFullYear(), hoy.getMonth() + 1, Math.min(dia, 28), 12)
  return f.toLocaleDateString('en-CA')
}

export default function Plataforma() {
  const router = useRouter()
  const [usuario, setUsuario] = useState(null)
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [pago, setPago] = useState(null) // { cliente_id, valor, fecha, medio }
  const [guardando, setGuardando] = useState(false)
  const [ficha, setFicha] = useState(null) // copia editable de un cliente con sus empresas
  const [demo, setDemo] = useState(null) // formulario de nueva demo
  const [creada, setCreada] = useState(null) // { usuario, clave, negocio, celular, demo_hasta }

  const cargar = useCallback(async () => {
    const [cli, emp, uso, sol, pag] = await Promise.all([
      supabase.from('clientes_plataforma').select('*').order('created_at'),
      supabase.rpc('plataforma_empresas'),
      supabase.rpc('plataforma_uso'),
      supabase.from('solicitudes_demo').select('*').eq('estado', 'nueva').order('created_at', { ascending: false }),
      supabase.from('pagos_plataforma').select('*').gte('fecha', obtenerFechaActual().slice(0, 7) + '-01').order('fecha', { ascending: false }),
    ])
    const fallo = [cli, emp, uso, sol, pag].find(r => r.error)
    if (fallo) { setError('No se pudo cargar la consola: ' + fallo.error.message); return }
    const usoPor = Object.fromEntries((uso.data || []).map(u => [u.empresa_id, u]))
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
    setD({ clientes, sueltas, solicitudes: sol.data || [], pagos: pag.data || [] })
  }, [])

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')
    if (!u || u.rol !== 'plataforma') { router.replace('/entrar'); return }
    sesionVigente().then(ok => { if (!ok) router.replace('/entrar') })
    setUsuario(u)
    cargar()
  }, [router, cargar])

  const salir = async () => { await cerrarSesionUsuario(usuario?.id); localStorage.removeItem('maissy_usuario'); router.replace('/entrar') }

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

  // Ficha del cliente: estado, demo, pago, contacto y el plan de cada empresa.
  const abrirFicha = (c) => setFicha({ ...c, empresas: c.empresas.map(e => ({ ...e, precio: String(e.precio_mensual ?? '') })) })
  const guardarFicha = async () => {
    setGuardando(true); setError('')
    const { error: e1 } = await supabase.from('clientes_plataforma').update({
      nombre: ficha.nombre.trim(), estado: ficha.estado, demo_hasta: ficha.demo_hasta || null, dia_pago: ficha.dia_pago ? Number(ficha.dia_pago) : null,
      contacto_nombre: ficha.contacto_nombre || null, contacto_celular: ficha.contacto_celular || null, ciudad: ficha.ciudad || null, notas: ficha.notas || null,
    }).eq('id', ficha.id)
    let e2 = null
    for (const e of ficha.empresas) {
      const r = await supabase.rpc('plataforma_actualizar_empresa', { p_id: e.id, p_plan: e.plan, p_precio: e.precio === '' ? null : Number(e.precio), p_activo: e.activo })
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

  // Nueva demo: cliente, empresa, caja y usuario administrador con su acceso.
  const generarClave = () => { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; return Array.from(crypto.getRandomValues(new Uint32Array(8)), n => a[n % a.length]).join('') }
  const abrirDemo = (sol) => setDemo({
    solicitud_id: sol?.id || null, negocio: sol?.negocio || '', contacto: sol?.nombre || '', celular: sol?.celular || '', ciudad: sol?.ciudad || '',
    actividades: sol?.actividades?.length ? sol.actividades : ['distribucion'], dias: 15, usuario: sugerirUsuario(sol?.negocio), clave: generarClave(),
  })
  const crearDemo = async () => {
    setGuardando(true); setError('')
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch('/api/plataforma', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` }, body: JSON.stringify({ accion: 'crear_demo', ...demo }) })
    const j = await r.json().catch(() => ({}))
    setGuardando(false)
    if (!r.ok) { setError(j.error || 'No se pudo crear la demo.'); return }
    setCreada({ usuario: j.usuario, clave: demo.clave, negocio: demo.negocio, contacto: demo.contacto, celular: demo.celular, demo_hasta: j.demo_hasta })
    setDemo(null); cargar()
  }

  if (!usuario) return null
  const nombre = (usuario.nombre || '').split(' ')[0]
  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'

  const activos = d?.clientes.filter(c => c.estado === 'activo') || []
  const demos = d?.clientes.filter(c => c.estado === 'demo') || []
  const porVencer = demos.filter(c => { const x = diasHasta(c.demo_hasta); return x != null && x >= 0 && x <= 1 })
  const ingreso = activos.reduce((s, c) => s + c.mensual, 0)
  const cobrado = (d?.pagos || []).reduce((s, p) => s + Number(p.valor || 0), 0)
  const sesiones = (d?.clientes || []).reduce((s, c) => s + c.sesiones, 0)
  const sesionesHora = (d?.clientes || []).reduce((s, c) => s + c.sesionesHora, 0)
  const espacio = (d?.clientes || []).reduce((s, c) => s + c.espacio, 0)
  const maxEspacio = Math.max(1, ...(d?.clientes || []).map(c => c.espacio))
  const boton = 'rounded-xl min-h-[40px] px-3.5 font-bold text-[14px] inline-flex items-center'

  return (
    <div className="min-h-screen" style={{ background: C.fondo, color: C.tinta, fontFamily: 'var(--font-texto), system-ui, sans-serif' }}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 md:px-6 py-3 text-white" style={{ background: '#1A1A1A' }}>
        <span className="bg-white rounded-lg px-2 py-1 inline-flex"><Image src="/maissypos-logo.png" width={70} height={26} alt="MaissyPOS" style={{ height: 24, width: 'auto' }} /></span>
        <span className="text-[12px] font-extrabold tracking-[.1em]" style={{ color: C.amarillo }}>PLATAFORMA</span>
        <span className="flex-1" />
        <span className="text-[13px]" style={{ color: '#D9D5CC' }}>{usuario.nombre}</span>
        <button onClick={salir} className="text-[13px] font-bold rounded-lg px-3 min-h-[36px]" style={{ background: '#262421', color: '#D9D5CC' }}>Cerrar sesión</button>
      </div>

      <div className="max-w-[1280px] mx-auto px-4 md:px-6 py-6 flex flex-col gap-5">
        <h1 className="m-0 text-[28px] font-extrabold" style={{ fontFamily: TITULO }}>{saludo}, {nombre}</h1>
        {error && <p className="m-0 rounded-2xl px-4 py-3 text-[14px] font-semibold" style={{ background: C.rojoF, color: C.rojo }} role="alert">{error}</p>}
        {!d ? <p style={{ color: C.gris }}>Cargando…</p> : (<>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <Kpi rotulo="Clientes activos" valor={activos.length} nota={`${activos.reduce((s, c) => s + c.empresas.length, 0)} empresas`} />
            <Kpi rotulo="En demo" valor={demos.length} nota={porVencer.length ? `${porVencer.length} vence${porVencer.length > 1 ? 'n' : ''} pronto` : 'Ninguna por vencer'} />
            <Kpi rotulo="Solicitudes nuevas" valor={d.solicitudes.length} nota="por aprobar" rojo={d.solicitudes.length > 0} />
            <Kpi rotulo="Ingreso del mes" valor={$(ingreso)} nota={`Cobrado ${$(cobrado)}`} />
            <Kpi rotulo="Sesiones abiertas" valor={sesiones} nota={`${sesionesHora} activa${sesionesHora === 1 ? '' : 's'} en la última hora`} />
            <Kpi rotulo="Espacio usado" valor={tam(espacio)} nota="datos y archivos" />
          </div>

          <section className="bg-white rounded-[18px] px-4 py-3.5 flex flex-col gap-1">
            <h2 className="m-0 text-[21px] font-extrabold" style={{ fontFamily: TITULO }}>Solicitudes de demo</h2>
            {d.solicitudes.length === 0 ? <p className="m-0 py-2 text-[14px]" style={{ color: C.gris }}>No hay solicitudes nuevas. Llegan desde "Probarlo en mi negocio" en la página.</p> : d.solicitudes.map(s => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 py-2.5" style={{ borderTop: `1px solid ${C.linea}` }}>
                <div className="flex-[1_1_300px] min-w-0">
                  <b className="block text-[16px]">{s.negocio}</b>
                  <span className="text-[13px]" style={{ color: C.gris }}>{[s.nombre, s.actividades?.join(', '), s.ciudad, s.rutas ? `${s.rutas} rutas` : null, cuando(s.created_at)].filter(Boolean).join(' · ')}</span>
                </div>
                <Pastilla tono="ambar">Por aprobar</Pastilla>
                <a href={`https://wa.me/57${String(s.celular).replace(/\D/g, '').slice(-10)}`} target="_blank" rel="noreferrer" className={boton} style={{ background: C.suave }}>WhatsApp</a>
                <button onClick={() => descartar(s)} className={boton} style={{ background: C.suave }}>Descartar</button>
                <button onClick={() => abrirDemo(s)} className={boton + ' text-white'} style={{ background: C.rojo }}>Aprobar demo</button>
              </div>
            ))}
          </section>

          <section className="bg-white rounded-[18px] px-4 py-3.5 flex flex-col gap-2">
            <div className="flex justify-between items-center gap-2">
              <h2 className="m-0 text-[21px] font-extrabold" style={{ fontFamily: TITULO }}>Clientes</h2>
              <button onClick={() => abrirDemo(null)} className={boton} style={{ background: C.suave }}>+ Nueva demo</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-[14px] tabular-nums">
                <thead><tr className="text-left text-[11.5px] tracking-[.06em]" style={{ color: C.gris }}>
                  {['CLIENTE', 'ESTADO', 'EMPRESAS Y PLAN', 'USUARIOS', 'SESIONES', 'ÚLTIMA ACTIVIDAD', 'ESPACIO', 'PAGO'].map((t, i) => <th key={t} className={`py-2 font-bold ${i === 0 ? 'pr-2' : 'px-2'} ${[3, 4, 6].includes(i) ? 'text-right' : ''}`}>{t}</th>)}
                </tr></thead>
                <tbody>
                  {d.clientes.map(c => {
                    const [tono, txt] = estadoDe(c)
                    const prox = proximoPago(c.dia_pago)
                    const dp = diasHasta(prox)
                    return (
                      <tr key={c.id} onClick={() => abrirFicha(c)} className="cursor-pointer hover:bg-[#F3F1EA]" style={{ borderTop: `1px solid ${C.linea}` }} title="Abrir la ficha del cliente">
                        <td className="py-3 pr-2"><b>{c.nombre}</b>{c.ciudad && <span className="block text-[12.5px]" style={{ color: C.gris }}>{c.ciudad}</span>}</td>
                        <td className="px-2"><Pastilla tono={tono}>{txt}</Pastilla></td>
                        <td className="px-2">{c.empresas.map(e => <span key={e.id} className="block">{e.nombre} <span style={{ color: C.gris }}>· {PLAN[e.plan] || e.plan} {$(e.precio_mensual)} · {(e.modelos || []).map(m => MODELO[m] || m).join(', ')}</span></span>)}</td>
                        <td className="px-2 text-right">{c.usuarios}</td>
                        <td className="px-2 text-right">{c.sesiones}</td>
                        <td className="px-2">{cuando(c.ultima)}</td>
                        <td className="px-2 text-right">{tam(c.espacio)}</td>
                        <td className="px-2">
                          {c.estado === 'demo' ? <span style={{ color: C.gris }}>En demo</span> : (<>
                            <b>{$(c.mensual)}</b> al mes
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
          </section>

          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
            <section className="bg-white rounded-[18px] px-4 py-3.5 flex flex-col gap-2.5">
              <h2 className="m-0 text-[21px] font-extrabold" style={{ fontFamily: TITULO }}>Espacio por cliente</h2>
              {d.clientes.map(c => (
                <div key={c.id} className="grid items-center gap-2.5 text-[14px]" style={{ gridTemplateColumns: 'minmax(0,150px) minmax(0,1fr) 70px' }}>
                  <span className="truncate">{c.nombre}</span>
                  <div className="h-2.5 rounded-full" style={{ background: C.suave }}><div className="h-2.5 rounded-full" style={{ width: `${Math.max(2, c.espacio / maxEspacio * 100)}%`, background: C.rojo }} /></div>
                  <b className="text-right tabular-nums">{tam(c.espacio)}</b>
                </div>
              ))}
              {d.clientes.flatMap(c => c.empresas).length > 1 && (
                <div className="flex flex-col gap-1 pt-1 text-[13px]" style={{ color: C.gris, borderTop: `1px solid ${C.linea}` }}>
                  {d.clientes.flatMap(c => c.empresas).map(e => <span key={e.id} className="flex justify-between"><span>{e.nombre}</span><span className="tabular-nums">{e.uso.usuarios || 0} usuarios · {tam(e.uso.espacio_bytes || 0)}</span></span>)}
                </div>
              )}
            </section>

            <section className="bg-white rounded-[18px] px-4 py-3.5 flex flex-col gap-2">
              <div className="flex justify-between items-center gap-2">
                <h2 className="m-0 text-[21px] font-extrabold" style={{ fontFamily: TITULO }}>Pagos del mes</h2>
                {!pago && <button onClick={() => setPago({ cliente_id: activos[0]?.id || '', valor: activos[0] ? String(activos[0].mensual) : '', fecha: obtenerFechaActual(), medio: 'Transferencia' })} className={boton} style={{ background: C.suave }}>Registrar pago</button>}
              </div>
              {pago && (
                <div className="rounded-2xl p-3 flex flex-col gap-2.5" style={{ background: C.fondo }}>
                  <label className="flex flex-col gap-1 text-[13px] font-bold" style={{ color: C.gris }}>Cliente
                    <select value={pago.cliente_id} onChange={e => { const c = d.clientes.find(x => x.id === e.target.value); setPago({ ...pago, cliente_id: e.target.value, valor: c ? String(c.mensual) : pago.valor }) }} className="min-h-[44px] rounded-xl bg-white px-3 text-[15px] font-medium" style={{ color: C.tinta }}>
                      {d.clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-[13px] font-bold min-w-0" style={{ color: C.gris }}>Valor<InputDinero value={pago.valor} onChange={e => setPago({ ...pago, valor: e.target.value })} className="min-h-[44px] rounded-xl bg-white px-3 text-[15px] font-medium w-full" style={{ color: C.tinta }} /></label>
                    <label className="flex flex-col gap-1 text-[13px] font-bold min-w-0" style={{ color: C.gris }}>Fecha<CampoFecha value={pago.fecha} onChange={e => setPago({ ...pago, fecha: e.target.value })} className="min-h-[44px] rounded-xl bg-white px-3 text-[15px] font-medium" style={{ color: C.tinta }} /></label>
                  </div>
                  <label className="flex flex-col gap-1 text-[13px] font-bold" style={{ color: C.gris }}>Medio<input value={pago.medio} onChange={e => setPago({ ...pago, medio: e.target.value })} className="min-h-[44px] rounded-xl bg-white px-3 text-[15px] font-medium" style={{ color: C.tinta }} /></label>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setPago(null)} className={boton} style={{ background: C.suave }}>Cancelar</button>
                    <button onClick={guardarPago} disabled={guardando} className={boton + ' text-white disabled:opacity-50'} style={{ background: C.rojo }}>{guardando ? 'Guardando…' : 'Guardar pago'}</button>
                  </div>
                </div>
              )}
              {d.pagos.length === 0 && !pago && <p className="m-0 text-[14px]" style={{ color: C.gris }}>Todavía no hay pagos este mes.</p>}
              {d.pagos.map(p => (
                <div key={p.id} className="flex justify-between gap-3 py-1.5 text-[14px]" style={{ borderTop: `1px solid ${C.linea}` }}>
                  <span>{d.clientes.find(c => c.id === p.cliente_id)?.nombre || 'Cliente'}<span className="block text-[12.5px]" style={{ color: C.gris }}>{fechaCorta(p.fecha)}{p.medio ? ` · ${p.medio}` : ''}</span></span>
                  <b className="tabular-nums">{$(p.valor)}</b>
                </div>
              ))}
              <div className="flex flex-col gap-0.5 pt-2 text-[13px]" style={{ color: C.gris, borderTop: `1px solid ${C.linea}` }}>
                <span><b style={{ color: C.tinta }}>Empresa</b> (rutas, despacho, producción) · $250.000 al mes</span>
                <span><b style={{ color: C.tinta }}>Punto de venta</b> (tienda, almacén o restaurante) · $150.000 al mes</span>
              </div>
            </section>
          </div>
        </>)}
      </div>

      {(ficha || demo || creada) && (
        <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center" onClick={() => { setFicha(null); setDemo(null); setCreada(null) }}
          style={{ background: 'rgba(243,241,234,.35)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
          <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} className="w-full md:max-w-[560px] max-h-[92vh] overflow-y-auto rounded-t-[28px] md:rounded-[28px] p-5 md:p-6 flex flex-col gap-3.5"
            style={{ background: '#fff', boxShadow: '0 16px 40px rgba(28,27,25,.18)' }}>
            {ficha && <FichaCliente ficha={ficha} setFicha={setFicha} alargar={alargar} guardar={guardarFicha} guardando={guardando} cerrar={() => setFicha(null)} error={error} pagos={d.pagos.filter(p => p.cliente_id === ficha.id)} />}
            {demo && <FormDemo demo={demo} setDemo={setDemo} crear={crearDemo} guardando={guardando} cerrar={() => setDemo(null)} error={error} generarClave={generarClave} />}
            {creada && <DemoCreada c={creada} cerrar={() => setCreada(null)} />}
          </div>
        </div>
      )}
    </div>
  )
}

const campo = 'w-full min-h-[44px] rounded-xl bg-white px-3 text-[15px] font-medium outline-none'
const bordeCampo = { boxShadow: `inset 0 0 0 1.5px ${C.linea}`, color: C.tinta }
const Etiqueta = ({ t, children, className = '' }) => <label className={`flex flex-col gap-1 text-[13px] font-bold min-w-0 ${className}`} style={{ color: C.gris }}>{t}{children}</label>
const Chip = ({ activo, onClick, children }) => (
  <button type="button" aria-pressed={activo} onClick={onClick} className="rounded-full min-h-[38px] px-3.5 text-[14px] font-bold"
    style={activo ? { background: '#fff', color: C.tinta, boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: C.suave, color: C.gris }}>{children}</button>
)
const Cabeza = ({ rotulo, titulo, cerrar }) => (
  <div className="flex justify-between items-start gap-3">
    <div className="min-w-0"><span className="text-[12px] font-bold tracking-[.06em]" style={{ color: C.gris }}>{rotulo}</span><h2 className="m-0 text-[24px] font-extrabold leading-tight" style={{ fontFamily: TITULO }}>{titulo}</h2></div>
    <button type="button" onClick={cerrar} aria-label="Cerrar" className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: C.suave }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  </div>
)

function FichaCliente({ ficha, setFicha, alargar, guardar, guardando, cerrar, error, pagos }) {
  const set = (k, v) => setFicha({ ...ficha, [k]: v })
  const setEmp = (i, k, v) => setFicha({ ...ficha, empresas: ficha.empresas.map((e, j) => j === i ? { ...e, [k]: v } : e) })
  const mensual = ficha.empresas.filter(e => e.activo).reduce((s, e) => s + (Number(e.precio) || 0), 0)
  return (<>
    <Cabeza rotulo="CLIENTE" titulo={ficha.nombre || 'Cliente'} cerrar={cerrar} />
    <div className="flex flex-wrap gap-1.5">
      {[['demo', 'Demo'], ['activo', 'Activo'], ['suspendido', 'Suspendido'], ['vencido', 'Vencido']].map(([v, t]) => <Chip key={v} activo={ficha.estado === v} onClick={() => set('estado', v)}>{t}</Chip>)}
    </div>
    {ficha.estado === 'demo' && (
      <div className="flex flex-wrap items-end gap-2">
        <Etiqueta t="Demo hasta" className="flex-[1_1_200px]"><CampoFecha value={ficha.demo_hasta || ''} onChange={e => set('demo_hasta', e.target.value)} className={campo} style={bordeCampo} /></Etiqueta>
        <button type="button" onClick={() => alargar(15)} className="rounded-xl min-h-[44px] px-3.5 font-bold text-[14px]" style={{ background: C.suave }}>+15 días</button>
        <button type="button" onClick={() => alargar(30)} className="rounded-xl min-h-[44px] px-3.5 font-bold text-[14px]" style={{ background: C.suave }}>+30 días</button>
      </div>
    )}
    <div className="grid grid-cols-2 gap-2.5">
      <Etiqueta t="Nombre del cliente" className="col-span-2"><input value={ficha.nombre} onChange={e => set('nombre', e.target.value)} className={campo} style={bordeCampo} /></Etiqueta>
      <Etiqueta t="Contacto"><input value={ficha.contacto_nombre || ''} onChange={e => set('contacto_nombre', e.target.value)} className={campo} style={bordeCampo} /></Etiqueta>
      <Etiqueta t="Celular"><input inputMode="tel" value={ficha.contacto_celular || ''} onChange={e => set('contacto_celular', e.target.value)} className={campo} style={bordeCampo} /></Etiqueta>
      <Etiqueta t="Ciudad"><input value={ficha.ciudad || ''} onChange={e => set('ciudad', e.target.value)} className={campo} style={bordeCampo} /></Etiqueta>
      <Etiqueta t="Día de pago"><input inputMode="numeric" value={ficha.dia_pago || ''} onChange={e => set('dia_pago', e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="1 a 28" className={campo} style={bordeCampo} /></Etiqueta>
    </div>
    <div className="flex flex-col gap-2 pt-1" style={{ borderTop: `1px solid ${C.linea}` }}>
      <span className="text-[12px] font-bold tracking-[.06em] pt-2" style={{ color: C.gris }}>EMPRESAS Y PLAN · {$(mensual)} AL MES</span>
      {ficha.empresas.length === 0 && <span className="text-[14px]" style={{ color: C.gris }}>Este cliente todavía no tiene empresas.</span>}
      {ficha.empresas.map((e, i) => (
        <div key={e.id} className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: C.fondo }}>
          <div className="flex justify-between items-center gap-2"><b>{e.nombre}</b>
            <label className="inline-flex items-center gap-2 text-[13px] font-bold" style={{ color: C.gris }}><input type="checkbox" checked={e.activo} onChange={x => setEmp(i, 'activo', x.target.checked)} className="w-[18px] h-[18px]" style={{ accentColor: C.tinta }} />Activa</label>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex gap-1.5">
              <Chip activo={e.plan === 'empresa'} onClick={() => setFicha({ ...ficha, empresas: ficha.empresas.map((x, j) => j === i ? { ...x, plan: 'empresa', precio: '250000' } : x) })}>Empresa</Chip>
              <Chip activo={e.plan === 'mostrador'} onClick={() => setFicha({ ...ficha, empresas: ficha.empresas.map((x, j) => j === i ? { ...x, plan: 'mostrador', precio: '150000' } : x) })}>Punto de venta</Chip>
            </div>
            <Etiqueta t="Valor al mes" className="flex-[1_1_140px]"><InputDinero value={e.precio} onChange={x => setEmp(i, 'precio', x.target.value)} className={campo} style={bordeCampo} /></Etiqueta>
          </div>
        </div>
      ))}
    </div>
    <Etiqueta t="Notas"><textarea value={ficha.notas || ''} onChange={e => set('notas', e.target.value)} rows={2} className="w-full rounded-xl bg-white px-3 py-2 text-[15px] outline-none" style={bordeCampo} /></Etiqueta>
    {pagos.length > 0 && (
      <div className="flex flex-col gap-1 text-[14px]">
        <span className="text-[12px] font-bold tracking-[.06em]" style={{ color: C.gris }}>PAGOS DE ESTE MES</span>
        {pagos.map(p => <div key={p.id} className="flex justify-between"><span>{fechaCorta(p.fecha)}{p.medio ? ` · ${p.medio}` : ''}</span><b className="tabular-nums">{$(p.valor)}</b></div>)}
      </div>
    )}
    {error && <p className="m-0 text-[13.5px] font-semibold pl-2.5" style={{ color: C.rojo, borderLeft: `3px solid ${C.rojo}` }} role="alert">{error}</p>}
    <div className="flex gap-2 justify-end pt-1">
      <button type="button" onClick={cerrar} className="rounded-xl min-h-[46px] px-4 font-bold" style={{ background: C.suave }}>Cancelar</button>
      <button type="button" onClick={guardar} disabled={guardando} className="rounded-xl min-h-[46px] px-5 font-bold text-white disabled:opacity-50" style={{ background: C.rojo }}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
    </div>
  </>)
}

function FormDemo({ demo, setDemo, crear, guardando, cerrar, error, generarClave }) {
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
    <div className="grid grid-cols-2 gap-2.5 rounded-2xl p-3" style={{ background: C.fondo }}>
      <Etiqueta t="Usuario para entrar"><input value={demo.usuario} onChange={e => set('usuario', e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))} className={campo} style={bordeCampo} /></Etiqueta>
      <Etiqueta t="Contraseña temporal"><div className="flex gap-1.5"><input value={demo.clave} onChange={e => set('clave', e.target.value)} className={campo + ' tabular-nums'} style={bordeCampo} /><button type="button" onClick={() => set('clave', generarClave())} className="rounded-xl px-2.5 text-[12.5px] font-bold shrink-0" style={{ background: '#fff' }}>Otra</button></div></Etiqueta>
      <span className="col-span-2 text-[13px]" style={{ color: C.gris }}>Se crea un usuario Administrador solo para esta empresa, con una caja de efectivo lista.</span>
    </div>
    {error && <p className="m-0 text-[13.5px] font-semibold pl-2.5" style={{ color: C.rojo, borderLeft: `3px solid ${C.rojo}` }} role="alert">{error}</p>}
    <div className="flex gap-2 justify-end">
      <button type="button" onClick={cerrar} className="rounded-xl min-h-[46px] px-4 font-bold" style={{ background: C.suave }}>Cancelar</button>
      <button type="button" onClick={crear} disabled={guardando || !listo} className="rounded-xl min-h-[46px] px-5 font-bold text-white disabled:opacity-50" style={{ background: C.rojo }}>{guardando ? 'Creando…' : 'Crear demo'}</button>
    </div>
  </>)
}

function DemoCreada({ c, cerrar }) {
  const texto = `Hola ${(c.contacto || '').split(' ')[0]}, ya tienes tu prueba de MaissyPOS hasta el ${fechaCorta(c.demo_hasta)}.\n\nEntra en maissypos.com/entrar\nUsuario: ${c.usuario}\nContraseña: ${c.clave}\n\nCualquier duda me escribes por aquí.`
  const tel = String(c.celular || '').replace(/\D/g, '').slice(-10)
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
      <button type="button" onClick={copiar} className="rounded-xl min-h-[46px] px-4 font-bold" style={{ background: C.suave }}>{copiado ? 'Copiado' : 'Copiar mensaje'}</button>
      {tel.length === 10 && <a href={`https://wa.me/57${tel}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer" className="rounded-xl min-h-[46px] px-5 font-bold text-white inline-flex items-center" style={{ background: C.rojo }}>Enviar por WhatsApp</a>}
    </div>
  </>)
}
