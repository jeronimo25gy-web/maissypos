'use client'
import { puedeVerModulo } from '@/lib/permisos'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { cargarPendientes } from '@/lib/pendientes'
import { cargarDia, cargarMes } from '@/lib/inicio-datos'
import { cargarRepartoTareas, filtrarTareas } from '@/lib/tareas-rol'
import { cargarCalendario } from '@/lib/agenda'
import Calendario from './Calendario'
import { cargarProduccion, telasSemana } from '@/lib/produccion-admin'
import { PageHeader } from '@/components/ui'
import Exportar from '@/components/Exportar'
import { armarInformeGrupo } from '@/lib/informe'
import { mesAnterior } from '@/lib/finanzas'
import { pesos, pesosCorto } from '@/components/Graficas'

// Inicio: vista previa del negocio. Lo mas importante primero (la venta de hoy
// y su tendencia), despues lo que viene, las tareas y las rutas. Cada bloque
// abre su modulo. El de antes quedo en /inicio-anterior.
const C = { tinta: '#1C1B19', gris: '#5A5750', hoja: 'var(--hoja)', linea: '#E3E1D8', suave: '#EFEDE6', rojo: 'var(--rojo)', amarillo: 'var(--acento)', verde: '#2E5E3A', suaveHeroe: 'var(--heroe-suave)', lineaHeroe: 'var(--heroe-linea)' }
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const sumar = (f, d) => { const x = new Date(f + 'T12:00:00'); x.setDate(x.getDate() + d); return x.toLocaleDateString('en-CA') }
const fechaTxt = (f, op) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', op)
const horaAhora = () => new Date().toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })

const GRUPOS = [['alta', 'Urgente', C.rojo, '#fff'], ['hoy', 'Hoy', C.amarillo, C.tinta], ['semana', 'Esta semana', 'var(--bloque)', 'var(--bloque-texto)']]
const ESTADO_RUTA = { calle: ['En la calle', C.amarillo], aprobar: ['Por aprobar', C.amarillo], liquidada: ['Liquidada', C.verde], sin: ['Sin despachar', C.gris] }
const TONO = { nomina: [C.tinta, '#fff'], pagos: [C.amarillo, C.tinta], cobros: [C.verde, '#fff'], vehiculos: [C.gris, '#fff'], propios: [C.tinta, '#fff'] }
const RANGOS = [['7', '7 días'], ['15', '15 días'], ['mes', 'Mes']]

export default function Inicio() {
  const router = useRouter()
  const hoy = obtenerFechaActual()
  const [usuario, setUsuario] = useState(null)
  const [empresas, setEmpresas] = useState([])
  const [sel, setSel] = useState(null)
  const [pendientes, setPendientes] = useState(null)
  const [dia, setDia] = useState(null)
  const [mes, setMes] = useState(null)
  const [reparto, setReparto] = useState(null)
  const [cuarto, setCuarto] = useState(null) // Producción (Arepas) o Cambios (Distri)
  const [eventos, setEventos] = useState(null)
  const [grupo, setGrupo] = useState(null)
  const [verCalendario, setVerCalendario] = useState(false)
  const [hora, setHora] = useState('')

  useEffect(() => {
    setHora(horaAhora())
    const reloj = setInterval(() => setHora(horaAhora()), 20000)
    return () => clearInterval(reloj)
  }, [])

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/entrar'); return }
    const parsed = JSON.parse(u)
    if (!puedeVerModulo(parsed, 'ejecutivo', ['admin'])) { router.push('/despacho'); return }
    setUsuario(parsed)
    supabase.from('empresas').select('id, nombre, modelos').eq('activo', true).order('nombre').then(({ data }) => {
      const acc = (data || []).filter(e => !parsed.empresas || parsed.empresas.includes(e.id))
      setEmpresas(acc)
      setSel((acc.find(e => e.id === getEmpresaId()) || acc[0])?.id || null)
    })
  }, [router])

  const ids = sel ? [sel] : []
  const productora = empresas.find(e => e.id === sel && (e.modelos || []).includes('produccion'))

  useEffect(() => {
    if (!ids.length) return
    let vivo = true
    cargarRepartoTareas().then(r => vivo && setReparto(r)).catch(() => {})
    cargarPendientes(ids, { completo: true }).then(p => vivo && setPendientes(p)).catch(() => vivo && setPendientes([]))
    cargarMes(ids, hoy, empresas, { consolidado: false }).then(m => vivo && setMes(m))
    cargarDia(ids, hoy, empresas, { consolidado: false }).then(d => vivo && setDia(d))
    cargarCalendario(ids, hoy.slice(0, 8) + '01', sumar(hoy, 45), empresas, usuario).then(e => vivo && setEventos(e)).catch(() => vivo && setEventos([]))
    if (productora) {
      cargarProduccion(productora.id).then(e => {
        if (!vivo) return
        const s = telasSemana(e)
        setCuarto({ rotulo: 'Telas por bulto', href: '/produccion', valor: s.valor != null ? Math.round(s.valor).toLocaleString('es-CO') : 'Sin dato' })
      }).catch(() => vivo && setCuarto(null))
    } else {
      supabase.from('novedades').select('cantidad').in('empresa_id', ids).eq('pendiente_reponer', true).is('repuesto_at', null).then(({ data }) => {
        if (!vivo) return
        setCuarto({ rotulo: 'Por reponer', href: '/cambios', valor: `${(data || []).reduce((s, x) => s + Number(x.cantidad || 0), 0).toLocaleString('es-CO')} und` })
      })
    }
    return () => { vivo = false }
  }, [sel, empresas.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!usuario) return null
  // Las tareas que le tocan a su rol (Gerencia decide el reparto en Configuración).
  const misPendientes = (pendientes && reparto ? filtrarTareas(pendientes, usuario, reparto) : pendientes) || []
  const cuantas = (p) => misPendientes.filter(x => x.prioridad === p).length
  const activo = grupo || GRUPOS.find(([p]) => cuantas(p))?.[0] || 'alta'
  const lista = misPendientes.filter(x => x.prioridad === activo)

  const proximos = (eventos || []).filter(e => e.fecha >= hoy).slice(0, 3)
  const cambio = dia?.totalAntes ? Math.round((dia.total - dia.totalAntes) / dia.totalAntes * 100) : null
  const diaSemana = dia ? fechaTxt(dia.fechaAntes, { weekday: 'long' }) : ''

  return (
    <div style={{ color: C.tinta }}>
      <PageHeader title="Inicio" showBack={false}
        actions={empresas.length > 0 && <Exportar etiqueta="Informe del mes" periodos={[hoy.slice(0, 7), mesAnterior(hoy.slice(0, 7))].map(m => ({ valor: m, nombre: new Date(m + '-15T12:00:00').toLocaleDateString('es-CO', { month: 'long' }) }))}
          armar={(mesElegido) => armarInformeGrupo(mesElegido, empresas)} />} />

      <div className="px-4 md:px-6 py-4 flex flex-col gap-3.5">
        <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_330px] items-stretch">
          <section aria-label="Resumen" className="rounded-[24px] p-5 md:p-6 flex flex-col gap-3.5 min-w-0" style={{ background: 'var(--heroe)', color: 'var(--heroe-texto)' }}>
            <div className="min-w-0">
              <Link href="/reportes" className="text-[15px] font-bold" style={{ color: C.suaveHeroe }}>Ventas de hoy</Link>
              <div className="font-extrabold tabular-nums" style={{ ...titulo, fontSize: '34px', lineHeight: '40px' }}>{dia ? pesos(dia.total) : '…'}</div>
              {cambio != null && (
                <span className="inline-flex items-center h-7 px-3 mt-1 rounded-full text-[13.5px] font-bold text-white" style={{ background: cambio < 0 ? C.rojo : C.verde }}>
                  {cambio > 0 ? '+' : cambio < 0 ? '−' : ''}{Math.abs(cambio)} % frente al {diaSemana} anterior
                </span>
              )}
            </div>
            {mes && <GraficaDias mes={mes} dia={dia} hoy={hoy} />}
            <div className="grid gap-5 grid-cols-2 lg:grid-cols-4 pt-3.5 border-t" style={{ borderColor: C.lineaHeroe }}>
              <Dato rotulo="Ventas del mes" href="/reportes" valor={mes ? pesosCorto(mes.ventas) : '…'}>
                {mes?.meta ? <Barra pct={mes.ventas / mes.meta * 100} /> : mes ? <Nota>Sin meta</Nota> : null}
              </Dato>
              <Dato rotulo="Cartera" href="/cartera" valor={mes ? pesosCorto(mes.cartera) : '…'}>
                {mes?.vencida > 0 && <Pastilla fondo={C.rojo} color="#fff">{pesosCorto(mes.vencida)} vencida</Pastilla>}
              </Dato>
              <Dato rotulo="Por pagar" href="/compras?vista=cuentas" valor={mes ? pesosCorto(mes.porPagar) : '…'}>
                {mes?.porPagarVencido > 0 ? <Pastilla fondo={C.rojo} color="#fff">{pesosCorto(mes.porPagarVencido)} vencido</Pastilla>
                  : mes?.porPagarProximo ? <Pastilla fondo={C.amarillo} color={C.tinta}>Vence {fechaTxt(mes.porPagarProximo.vence, { weekday: 'short', day: 'numeric' }).replace('.', '')}</Pastilla> : null}
              </Dato>
              <Dato rotulo={cuarto?.rotulo || (productora ? 'Telas por bulto' : 'Por reponer')} href={cuarto?.href || '/cambios'} valor={cuarto?.valor || '…'} />
            </div>
          </section>

          <section aria-label="Fecha y próximos" className="bg-white rounded-[24px] p-4 flex flex-col gap-2.5 min-w-0">
            <div className="flex items-center gap-3">
              <span className="font-extrabold text-[34px] leading-10 tabular-nums" style={titulo}>{Number(hoy.slice(8))}</span>
              <span className="flex-1 min-w-0">
                <b className="block text-[19px] leading-[23px] capitalize" style={titulo}>{fechaTxt(hoy, { weekday: 'long' })}</b>
                <span className="block text-[13.5px]" style={{ color: C.gris }}>{fechaTxt(hoy, { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())}</span>
              </span>
              <span className="rounded-[11px] px-2.5 py-1.5 font-extrabold text-[14px] tabular-nums whitespace-nowrap" style={{ background: C.suave }}>{hora}</span>
            </div>
            <MiniCalendario hoy={hoy} eventos={eventos || []} />
            {eventos && proximos.length > 0 && <div className="pt-2 border-t flex flex-col" style={{ borderColor: C.linea }}>
              {proximos.map((e, i) => {
                const [tono, texto] = TONO[e.tipo] || TONO.propios
                const fila = (
                  <>
                    <span className="dia-tile" style={{ '--t': tono, '--c': texto, background: C.suave, color: C.tinta }}>
                      <span className="text-[11px] font-bold capitalize">{fechaTxt(e.fecha, { weekday: 'short' }).replace('.', '')}</span>
                      <span className="font-extrabold text-[19px]" style={titulo}>{Number(e.fecha.slice(8))}</span>
                    </span>
                    <span className="min-w-0">
                      <b className="block text-[14px] leading-[18px] truncate">{e.titulo}</b>
                      <span className="block text-[13px] leading-[17px] truncate" style={{ color: C.gris }}>{e.valor ? pesos(e.valor) : e.detalle}</span>
                    </span>
                  </>
                )
                return e.href ? <Link key={i} href={e.href} className="fila-fecha">{fila}</Link> : <div key={i} className="fila-fecha">{fila}</div>
              })}
            </div>}
            <button type="button" onClick={() => setVerCalendario(!verCalendario)} className="mt-auto text-left text-[14px] font-bold underline underline-offset-4">{verCalendario ? 'Ocultar calendario' : 'Ver calendario'}</button>
          </section>
        </div>

        {verCalendario && ids.length > 0 && <Calendario ids={ids} empresas={empresas} usuario={usuario} hoy={hoy} />}

        <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_330px] items-stretch">
          <section aria-label="Tareas" className="bg-white rounded-[24px] p-4 md:px-5 flex flex-col gap-2.5 min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="m-0 font-extrabold text-[21px] leading-[26px]" style={titulo}>Tareas</h2>
              {misPendientes.length > 0 && <Link href="/tareas" className="text-[14px] font-bold underline underline-offset-4">Ver las {misPendientes.length}</Link>}
            </div>
            <div className="grid gap-3.5 md:grid-cols-[200px_minmax(0,1fr)]">
              <div className="grid grid-cols-3 md:grid-cols-1 gap-1.5 content-start">
                {GRUPOS.map(([p, nombre, fondo, color]) => {
                  const es = activo === p, n = cuantas(p)
                  return (
                    <button key={p} type="button" aria-pressed={es} onClick={() => setGrupo(p)} className="rounded-[14px] px-3.5 min-h-[50px] flex flex-col md:flex-row md:items-center md:justify-between py-1.5 md:py-0 text-left"
                      style={{ background: fondo, color, boxShadow: es ? `0 0 0 3px #fff, 0 0 0 5px ${fondo}` : 'none' }}>
                      <span className="text-[14px] font-bold flex items-center gap-2">
                        {p === 'alta' && n > 0 && <i className="late w-[9px] h-[9px] rounded-full bg-white shrink-0" />}{nombre}
                      </span>
                      <span className="font-extrabold text-[24px] leading-7 tabular-nums" style={titulo}>{pendientes ? n : '…'}</span>
                    </button>
                  )
                })}
              </div>
              <div className="flex flex-col min-w-0">
                {pendientes && lista.length === 0 && <p className="text-sm py-2 m-0" style={{ color: C.gris }}>Sin pendientes</p>}
                {lista.slice(0, 4).map(it => (
                  <Link key={it.clave} href={it.href} className="rounded-xl px-2.5 py-2 hover:bg-[#F3F1EA] min-w-0">
                    <b className="block text-[15.5px] leading-5 truncate">{it.titulo}</b>
                    {it.detalle && <span className="block text-[13.5px] leading-[18px] truncate" style={{ color: C.gris }}>{it.detalle}</span>}
                  </Link>
                ))}
              </div>
            </div>
          </section>

          <section aria-label="Rutas de hoy" className="bg-white rounded-[24px] p-4 md:px-5 flex flex-col gap-2 min-w-0">
            <h2 className="m-0 font-extrabold text-[21px] leading-[26px]" style={titulo}><Link href="/despacho">Rutas de hoy</Link></h2>
            {dia?.filasRutas.length === 0 && <p className="text-sm py-2 m-0" style={{ color: C.gris }}>{new Date(hoy + 'T12:00:00').getDay() === 0 ? 'Domingo: no salen rutas.' : 'No hay rutas activas.'}</p>}
            {(dia?.filasRutas || []).map((f, i) => {
              const [estado, color] = ESTADO_RUTA[f.estado] || ['', C.gris]
              const pct = f.estado === 'liquidada' ? 100 : f.enRutero ? Math.min(100, f.visitados / f.enRutero * 100) : 0
              return (
                <div key={i} className="min-w-0">
                  <div className="flex justify-between gap-2.5 text-[14.5px]"><b className="min-w-0 truncate">{f.ruta}</b><b className="tabular-nums">{f.venta ? pesos(f.venta) : ''}</b></div>
                  <div className="h-[7px] rounded-full overflow-hidden my-1" style={{ background: C.suave }}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} /></div>
                  <div className="text-[12.5px]" style={{ color: C.gris }}>{estado}{f.enRutero && f.estado === 'calle' ? ` · ${f.visitados} de ${f.enRutero}` : ''}</div>
                </div>
              )
            })}
          </section>
        </div>
      </div>
    </div>
  )
}

function Dato({ rotulo, valor, href, children }) {
  return (
    <Link href={href} className="min-w-0 block">
      <span className="block text-[13.5px] font-bold" style={{ color: C.suaveHeroe }}>{rotulo}</span>
      <span className="block font-extrabold text-[24px] leading-7 tabular-nums truncate" style={titulo}>{valor}</span>
      {children}
    </Link>
  )
}
const Pastilla = ({ fondo, color, children }) => <span className="inline-flex items-center h-[26px] px-2.5 rounded-full text-[13px] font-bold whitespace-nowrap" style={{ background: fondo, color }}>{children}</span>
const Nota = ({ children }) => <span className="block text-[13px]" style={{ color: C.suaveHeroe }}>{children}</span>
const Barra = ({ pct }) => (
  <>
    <span className="block h-2 rounded-full overflow-hidden mt-1" style={{ background: C.lineaHeroe }}><span className="block h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: C.amarillo }} /></span>
    <Nota>{Math.round(pct)} % de la meta</Nota>
  </>
)

// Calendario pequeño: solo los numeros. Los dias con fechas van en negrilla y
// toman el color de su tipo al pasar el mouse; abajo sale el detalle.
function MiniCalendario({ hoy, eventos }) {
  const [visto, setVisto] = useState(null)
  const primero = hoy.slice(0, 8) + '01'
  const huecos = (new Date(primero + 'T12:00:00').getDay() + 6) % 7
  const total = new Date(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)), 0).getDate()
  const fecha = (n) => hoy.slice(0, 8) + String(n).padStart(2, '0')
  const de = (f) => eventos.filter(e => e.fecha === f)
  const dia = visto || hoy
  const delDia = de(dia)
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-7 text-center text-[11.5px] font-bold" style={{ color: C.gris }}>{['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <span key={i}>{d}</span>)}</div>
      <div className="grid grid-cols-7 gap-y-0.5 justify-items-center" onMouseLeave={() => setVisto(null)}>
        {Array.from({ length: huecos }, (_, i) => <span key={'h' + i} />)}
        {Array.from({ length: total }, (_, i) => {
          const n = i + 1, f = fecha(n), ev = de(f), encima = visto === f, tono = ev[0] && TONO[ev[0].tipo]
          return (
            <button key={n} type="button" aria-label={`${n}${ev.length ? ': ' + ev.map(e => e.titulo).join(', ') : ''}`} onMouseEnter={() => setVisto(f)} onFocus={() => setVisto(f)}
              className="w-[34px] h-[28px] rounded-[9px] text-[13px] tabular-nums transition-colors"
              style={{ background: encima ? (tono ? tono[0] : C.suave) : 'transparent', color: encima && tono ? tono[1] : ev.length ? C.tinta : C.gris, fontWeight: ev.length ? 800 : 500, boxShadow: f === hoy && !(encima && tono) ? `inset 0 0 0 2px ${C.tinta}` : 'none' }}>{n}</button>
          )
        })}
      </div>
      <div className="min-h-[20px] text-[13px] truncate"><b className="capitalize">{fechaTxt(dia, { weekday: 'short', day: 'numeric' }).replace('.', '')}</b>{delDia.length ? ` · ${delDia[0].titulo}${delDia.length > 1 ? ` y ${delDia.length - 1} más` : ''}` : ''}</div>
    </div>
  )
}

// Ventas por dia del mes en curso, con el detalle del dia al pasar el mouse.
function GraficaDias({ mes, dia, hoy }) {
  const [rango, setRango] = useState('mes')
  const [punto, setPunto] = useState(null)
  const dias = mes.rutas.map((r, i) => ({ dia: i + 1, rutas: r, mostrador: mes.mostrador[i], domicilios: mes.domicilios[i], total: r + mes.mostrador[i] + mes.domicilios[i] }))
  // El mes solo trae lo ya liquidado: el dia de hoy se toma de la venta en curso.
  if (dia) dias[dias.length - 1] = { dia: dias.length, rutas: dia.ventasRutas, mostrador: dia.ventasMostrador, domicilios: dia.ventasDomicilios, total: dia.total }
  const vis = rango === 'mes' ? dias : dias.slice(-Number(rango))
  if (vis.length < 2) return null
  const max = Math.max(...vis.map(d => d.total), 1)
  const n = vis.length
  const X = (i) => i / (n - 1) * 600
  const Y = (v) => 190 - v / max * 170
  const trazo = vis.map((d, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(d.total).toFixed(1)}`).join(' ')
  const idx = punto == null || punto >= n ? n - 1 : punto
  const sel = vis[idx]
  const left = X(idx) / 6, top = Y(sel.total) / 2
  const detalle = [['Rutas', sel.rutas], ['Mostrador', sel.mostrador], ['Domicilios', sel.domicilios]].filter(([, v]) => v > 0)
  const fecha = hoy.slice(0, 8) + String(sel.dia).padStart(2, '0')

  return (
    <div className="min-w-0">
      <div className="flex justify-end pb-1 md:-mt-12">
        <div role="group" aria-label="Periodo" className="flex gap-0.5 p-[3px] rounded-full" style={{ background: 'var(--heroe-control)' }}>
          {RANGOS.map(([id, nombre]) => (
            <button key={id} type="button" aria-pressed={rango === id} onClick={() => { setRango(id); setPunto(null) }} className="rounded-full h-9 px-3.5 text-[13.5px] font-extrabold"
              style={rango === id ? { background: 'var(--opcion-activa)', color: 'var(--opcion-activa-texto)', boxShadow: 'var(--opcion-borde)' } : { color: C.suaveHeroe }}>{nombre}</button>
          ))}
        </div>
      </div>
      <div className="relative h-[150px]">
        <svg viewBox="0 0 600 200" preserveAspectRatio="none" width="100%" height="100%" role="img" aria-label="Ventas por día" className="block overflow-visible">
          <line x1="0" y1="190" x2="600" y2="190" stroke={C.lineaHeroe} strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <path d={`${trazo} L600 190 L0 190 Z`} fill={C.amarillo} fillOpacity="0.2" />
          <path d={trazo} fill="none" stroke={C.amarillo} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="absolute w-3 h-3 rounded-full pointer-events-none" style={{ left: `${left}%`, top: `${top}%`, background: C.amarillo, boxShadow: '0 0 0 3px var(--heroe)', transform: 'translate(-50%,-50%)' }} />
        <div className="absolute rounded-[14px] px-3 py-2 min-w-[160px] pointer-events-none" style={{ left: `${left}%`, top: `${top}%`, background: 'var(--heroe-globo)', color: 'var(--heroe-globo-texto)', transform: `translate(${left > 65 ? '-100%' : left < 35 ? '0' : '-50%'},${top > 45 ? '-112%' : '14px'})` }}>
          <div className="text-[12.5px] font-bold" style={{ color: 'var(--heroe-globo-suave)' }}>{fechaTxt(fecha, { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^\w/, c => c.toUpperCase())}</div>
          <div className="flex justify-between gap-3.5 text-[14.5px]"><b>Total</b><b className="tabular-nums">{pesos(sel.total)}</b></div>
          {detalle.map(([k, v]) => <div key={k} className="flex justify-between gap-3.5 text-[13px]"><span>{k}</span><span className="tabular-nums">{pesos(v)}</span></div>)}
        </div>
        <div className="absolute inset-0 flex">
          {vis.map((d, i) => <button key={d.dia} type="button" aria-label={`Día ${d.dia}`} onMouseEnter={() => setPunto(i)} onFocus={() => setPunto(i)} className="flex-1 bg-transparent p-0" />)}
        </div>
      </div>
      <div className="flex justify-between text-[12.5px] font-bold pt-1.5" style={{ color: C.suaveHeroe }}>
        {[vis[0], vis[Math.floor((n - 1) / 2)], vis[n - 1]].map(d => <span key={d.dia}>{d.dia}</span>)}
      </div>
    </div>
  )
}
