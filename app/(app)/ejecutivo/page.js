'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { cargarPendientes } from '@/lib/pendientes'
import { cargarDia, cargarMes } from '@/lib/inicio-datos'
import { cargarAgenda } from '@/lib/agenda'
import { cargarProduccion, telasSemana } from '@/lib/produccion-admin'
import { PageHeader } from '@/components/ui'
import Exportar from '@/components/Exportar'
import { armarInformeGrupo } from '@/lib/informe'
import { mesAnterior } from '@/lib/finanzas'
import { GraficaLineas, Leyenda, COLORES, pesos } from '@/components/Graficas'

// Inicio del admin: un panel de control. Lo más importante a primera vista y
// cada bloque abre su módulo con el detalle: tareas (las dos primeras de cada
// grupo; el resto en Tareas), un número clave por área, el mes contra la meta,
// las rutas de hoy y los próximos 7 días. El de antes quedó en /inicio-anterior.
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', linea: '#E3E1D8', suave: '#EFEDE6', rojo: '#C41230', rojoF: '#FBE9E9', amarillo: '#F2B21B', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8' }
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const corto = (n) => (n || '').replace(/ SAS$/i, '').replace(/ Maissy$/i, '')
const saludo = () => { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches' }
const GRUPOS = [['alta', 'Urgente', C.rojo, C.rojoF], ['hoy', 'Hoy', C.amarillo, C.ambarF], ['semana', 'Esta semana', '#8C877C', C.suave]]
const ESTADO_RUTA = { calle: ['En la calle', C.amarillo], aprobar: ['Por aprobar', C.amarillo], liquidada: ['Liquidada', C.verde], sin: ['Sin despachar', C.rojo] }
const TONO = { rojo: C.rojo, ambar: C.amarillo, gris: '#8C877C' }

export default function Inicio() {
  const router = useRouter()
  const hoy = obtenerFechaActual()
  const [usuario, setUsuario] = useState(null)
  const [empresas, setEmpresas] = useState([])
  const [sel, setSel] = useState(null) // id de empresa o 'consolidado'
  const [pendientes, setPendientes] = useState(null)
  const [dia, setDia] = useState(null)
  const [mes, setMes] = useState(null)
  const [agenda, setAgenda] = useState(null)
  const [cuarto, setCuarto] = useState(null) // bloque de Producción (Arepas) o de Cambios (Distri)

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (parsed.rol !== 'admin') { router.push('/despacho'); return }
    setUsuario(parsed)
    supabase.from('empresas').select('id, nombre, modelos').eq('activo', true).order('nombre').then(({ data }) => {
      const acc = (data || []).filter(e => !parsed.empresas || parsed.empresas.includes(e.id))
      setEmpresas(acc)
      setSel(acc.length > 1 ? 'consolidado' : acc[0]?.id || getEmpresaId())
    })
  }, [router])

  const ids = sel === 'consolidado' ? empresas.map(e => e.id) : sel ? [sel] : []
  const consolidado = sel === 'consolidado'
  const productora = empresas.find(e => ids.includes(e.id) && (e.modelos || []).includes('produccion'))

  useEffect(() => {
    if (!ids.length) return
    let vivo = true
    setPendientes(null); setMes(null); setDia(null); setAgenda(null); setCuarto(null)
    cargarPendientes(ids, { completo: true }).then(p => vivo && setPendientes(p)).catch(() => vivo && setPendientes([]))
    cargarMes(ids, hoy, empresas, { consolidado }).then(m => vivo && setMes(m))
    cargarDia(ids, hoy, empresas, { consolidado }).then(d => vivo && setDia(d))
    cargarAgenda(ids, hoy).then(a => vivo && setAgenda(a)).catch(() => vivo && setAgenda({ dias: [], eventos: [] }))
    if (productora) {
      cargarProduccion(productora.id).then(e => {
        if (!vivo) return
        const s = telasSemana(e)
        const enCurso = e.lista.filter(c => c.estado === 'abierto').length
        setCuarto({ modulo: 'Producción', href: '/produccion', rotulo: 'Telas por bulto', valor: s.valor != null ? Math.round(s.valor).toLocaleString('es-CO') : 'Sin dato',
          nota: `${enCurso} ${enCurso === 1 ? 'lote' : 'lotes'} en curso${e.telasFormula ? ` · la fórmula dice ${Math.round(e.telasFormula)}` : ''}` })
      }).catch(() => vivo && setCuarto(null))
    } else {
      supabase.from('novedades').select('cantidad').in('empresa_id', ids).eq('pendiente_reponer', true).is('repuesto_at', null).then(({ data }) => {
        if (!vivo) return
        const n = (data || []).length, und = (data || []).reduce((s, x) => s + Number(x.cantidad || 0), 0)
        setCuarto({ modulo: 'Cambios', href: '/cambios', rotulo: 'Por reponer', valor: `${und.toLocaleString('es-CO')} und`, nota: n ? `${n} ${n === 1 ? 'cambio espera' : 'cambios esperan'} al proveedor` : 'Nada pendiente' })
      })
    }
    return () => { vivo = false }
  }, [sel, empresas.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!usuario) return null
  const total = (pendientes || []).length
  const urgentes = (pendientes || []).filter(p => p.prioridad === 'alta').length

  return (
    <div style={{ background: C.fondo, minHeight: '100vh', color: C.tinta }}>
      <PageHeader title="Inicio" subtitle="Maissy Group" showBack={false}
        actions={empresas.length > 0 && <Exportar etiqueta="Informe del mes" periodos={[hoy.slice(0, 7), mesAnterior(hoy.slice(0, 7))].map(m => ({ valor: m, nombre: new Date(m + '-15T12:00:00').toLocaleDateString('es-CO', { month: 'long' }) }))}
          armar={(mesElegido) => armarInformeGrupo(mesElegido, empresas)} />} />
      <div className="p-4 md:p-5 max-w-6xl mx-auto flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-[26px] md:text-[28px] leading-tight" style={titulo}>{saludo()}, {usuario.nombre?.split(' ')[0]}</h2>
            <p style={{ color: C.gris }}>{new Date(hoy + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}{pendientes ? ` · ${total} ${total === 1 ? 'tarea' : 'tareas'}${urgentes ? `, ${urgentes} ${urgentes === 1 ? 'urgente' : 'urgentes'}` : ''}` : ''}</p>
          </div>
          {empresas.length > 1 && (
            <div className="flex gap-1 bg-white rounded-full p-1 max-w-full overflow-x-auto" role="tablist">
              {[...empresas.map(e => [e.id, corto(e.nombre)]), ['consolidado', 'Las dos']].map(([id, n]) => (
                <button key={id} type="button" role="tab" aria-selected={sel === id} onClick={() => setSel(id)} className="rounded-full min-h-[38px] px-3.5 text-sm font-bold whitespace-nowrap"
                  style={sel === id ? { background: C.tinta, color: '#fff' } : { color: C.gris }}>{n}</button>
              ))}
            </div>
          )}
        </div>

        {/* Tareas: las dos primeras de cada grupo */}
        <section aria-label="Tareas" className="flex flex-col gap-2">
          <div className="grid gap-2.5 md:grid-cols-3">
            {GRUPOS.map(([p, nombre, color, fondo]) => {
              const lista = (pendientes || []).filter(x => x.prioridad === p)
              return (
                <div key={p} className="bg-white rounded-2xl p-3 flex flex-col gap-2 min-w-0">
                  <div className="flex items-center justify-between"><b className="text-sm">{nombre}</b>
                    <span className="text-[13px] font-extrabold px-2 py-0.5 rounded-full" style={{ background: fondo, color: p === 'semana' ? C.gris : p === 'hoy' ? C.ambar : C.rojo }}>{pendientes ? lista.length : '…'}</span></div>
                  {pendientes && lista.length === 0 && <p className="text-[13px] px-1" style={{ color: C.gris }}>Nada por ahora.</p>}
                  {lista.slice(0, 2).map(it => (
                    <Link key={it.clave} href={it.href} className="flex gap-2 items-start rounded-[10px] px-2.5 py-2 text-[13.5px] leading-snug" style={{ background: C.fondo }}>
                      <i className="w-2 h-2 rounded-full shrink-0 mt-[5px]" style={{ background: color }} />
                      <span className="min-w-0"><span className="line-clamp-2">{it.titulo}</span>{it.detalle && <span className="block text-xs truncate" style={{ color: C.gris }}>{it.detalle}</span>}</span>
                    </Link>
                  ))}
                </div>
              )
            })}
          </div>
          {total > 0 && <div className="flex justify-end"><Link href="/tareas" className="text-sm font-bold underline underline-offset-4">Ver {total === 1 ? 'la tarea' : `las ${total} tareas`}</Link></div>}
        </section>

        {/* Un número clave por área; cada bloque abre su módulo */}
        <section aria-label="Cómo va el negocio" className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Bloque modulo="Ventas" href="/reportes" rotulo="Hoy" valor={dia ? pesos(dia.total) : '…'}
            nota={dia ? (dia.totalAntes ? `El ${new Date(dia.fechaAntes + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long' })} pasado: ${pesos(dia.totalAntes)}` : 'Sin ventas el mismo día de la semana pasada') : ''} />
          <Bloque modulo="Ventas" href="/reportes" rotulo="El mes" valor={mes ? pesos(mes.ventas) : '…'}
            nota={mes ? (mes.meta ? `${Math.round(mes.ventas / mes.meta * 100)}% de la meta · van ${mes.dias} de ${mes.diasMes} días` : `Van ${mes.dias} de ${mes.diasMes} días · sin meta`) : ''}
            barra={mes?.meta ? Math.min(100, mes.ventas / mes.meta * 100) : null} />
          <Bloque modulo="Finanzas" href="/financiero" rotulo="Plata en la calle" valor={mes ? pesos(mes.cartera) : '…'}
            nota={mes ? <><b style={{ color: mes.vencida ? C.rojo : C.gris }}>{pesos(mes.vencida)} vencida</b> · por pagar {pesos(mes.porPagar)}</> : ''} />
          <Bloque modulo={cuarto?.modulo || (productora ? 'Producción' : 'Cambios')} href={cuarto?.href || (productora ? '/produccion' : '/cambios')} rotulo={cuarto?.rotulo || '…'} valor={cuarto?.valor || '…'} nota={cuarto?.nota || ''} />
        </section>

        <section className="grid gap-2.5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-start">
          <div className="bg-white rounded-[18px] p-3.5 min-w-0">
            <div className="flex justify-between items-baseline gap-2 flex-wrap"><b>El mes contra la meta</b><span className="text-[12.5px]" style={{ color: C.gris }}>Ventas acumuladas</span></div>
            {!mes ? <p className="text-sm py-10 text-center" style={{ color: C.gris }}>Cargando…</p> : (
              <>
                <Leyenda items={[{ nombre: 'Acumulado', color: COLORES.rutas, linea: true }, ...(mes.meta ? [{ nombre: 'Ritmo de la meta', color: COLORES.anterior, linea: true }] : [])]} />
                <GraficaLineas etiqueta="Ventas acumuladas del mes contra la meta" alto={200}
                  etiquetas={Array.from({ length: mes.diasMes }, (_, i) => String(i + 1))}
                  series={[
                    ...(mes.meta ? [{ nombre: 'Ritmo de la meta', datos: Array.from({ length: mes.diasMes }, (_, i) => mes.meta * (i + 1) / mes.diasMes), color: COLORES.anterior }] : []),
                    { nombre: 'Acumulado', datos: Array.from({ length: mes.diasMes }, (_, i) => (i < mes.acumulado.length ? mes.acumulado[i] : null)), color: COLORES.rutas, punto: true },
                  ]} />
              </>
            )}
          </div>
          <div className="bg-white rounded-[18px] p-3.5 min-w-0">
            <div className="flex justify-between items-baseline gap-2"><b>Rutas de hoy</b><Link href="/despacho" className="text-[13px] font-bold underline underline-offset-4">Despacho</Link></div>
            {!dia ? <p className="text-sm py-6 text-center" style={{ color: C.gris }}>Cargando…</p> : dia.filasRutas.length === 0
              ? <p className="text-sm py-4" style={{ color: C.gris }}>{new Date(hoy + 'T12:00:00').getDay() === 0 ? 'Domingo: no salen rutas.' : 'No hay rutas activas.'}</p>
              : dia.filasRutas.map((f, i) => {
                const [et, color] = ESTADO_RUTA[f.estado] || ['', C.gris]
                return (
                  <div key={i} className="grid gap-2.5 items-center py-2 border-t first:border-t-0 text-sm" style={{ borderColor: C.linea, gridTemplateColumns: '10px minmax(0,1fr) auto' }}>
                    <i className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                    <span className="min-w-0"><b className="block truncate">{f.ruta}</b><span className="text-[12.5px]" style={{ color: C.gris }}>{et}{f.enRutero && f.estado === 'calle' ? ` · ${f.visitados} de ${f.enRutero} visitas` : ''}</span></span>
                    <span className="tabular-nums font-bold">{f.venta ? pesos(f.venta) : <span style={{ color: C.gris }}>—</span>}</span>
                  </div>
                )
              })}
          </div>
        </section>

        <section className="bg-white rounded-[18px] p-3.5 flex flex-col gap-2.5" aria-label="Próximos 7 días">
          <div className="flex justify-between items-baseline gap-2 flex-wrap"><b>Próximos 7 días</b><span className="text-[12.5px]" style={{ color: C.gris }}>Pagos, vencimientos y créditos que vencen</span></div>
          {!agenda ? <p className="text-sm py-4 text-center" style={{ color: C.gris }}>Cargando…</p> : (
            <>
              <div className="grid grid-cols-7 gap-1.5">
                {agenda.dias.map(f => {
                  const ev = agenda.eventos.filter(e => e.fecha === f)
                  const d = new Date(f + 'T12:00:00')
                  return (
                    <div key={f} className="rounded-xl py-2 flex flex-col items-center gap-1 min-w-0" style={f === hoy ? { background: '#fff', boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: C.fondo }}>
                      <span className="text-[11px] font-bold uppercase" style={{ color: C.gris }}>{d.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '')}</span>
                      <b className="text-lg leading-none" style={titulo}>{d.getDate()}</b>
                      <span className="flex gap-0.5 min-h-[7px]">{ev.slice(0, 3).map((e, i) => <i key={i} className="w-[7px] h-[7px] rounded-full" style={{ background: TONO[e.tono] }} />)}</span>
                    </div>
                  )
                })}
              </div>
              {agenda.eventos.length === 0 ? <p className="text-sm" style={{ color: C.gris }}>Nada con fecha en los próximos días.</p> : (
                <div>
                  {agenda.eventos.slice(0, 5).map((e, i) => (
                    <Link key={i} href={e.href} className="grid gap-2.5 items-center py-2 border-t first:border-t-0 text-[13.5px]" style={{ borderColor: C.linea, gridTemplateColumns: '64px minmax(0,1fr) auto' }}>
                      <span style={{ color: C.gris }}>{new Date(e.fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' })}</span>
                      <b className="truncate">{e.titulo}</b>
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap" style={e.tono === 'rojo' ? { background: C.rojoF, color: C.rojo } : { background: C.suave, color: C.gris }}>{e.modulo}</span>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function Bloque({ modulo, href, rotulo, valor, nota, barra }) {
  return (
    <Link href={href} className="bg-white rounded-2xl p-3.5 flex flex-col gap-0.5 min-w-0 hover:shadow-[inset_0_0_0_2px_#E3E1D8]">
      <span className="flex justify-between text-xs font-extrabold uppercase tracking-wider pb-1" style={{ color: C.gris }}>{modulo}<span aria-hidden="true">→</span></span>
      <span className="text-[13px] font-bold" style={{ color: C.gris }}>{rotulo}</span>
      <span className="text-[26px] font-extrabold leading-tight tabular-nums truncate" style={titulo}>{valor}</span>
      <span className="text-[12.5px]" style={{ color: C.gris }}>{nota}</span>
      {barra != null && <span className="h-2 rounded-full overflow-hidden mt-1" style={{ background: C.suave }}><span className="block h-full rounded-full" style={{ width: `${barra}%`, background: C.amarillo }} /></span>}
    </Link>
  )
}
