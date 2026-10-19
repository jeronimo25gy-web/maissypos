'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { cargarPendientes, marcarAlertaVista, invalidarPendientes } from '@/lib/pendientes'
import { cargarDia, cargarMes } from '@/lib/inicio-datos'
import { PageHeader } from '@/components/ui'
import { GraficaLineas, GraficaBarras, GraficaHorizontal, Leyenda, COLORES, pesos } from '@/components/Graficas'

// Inicio del admin: pendientes por urgencia (salen de estados reales y se
// apagan solos al resolverse), operacion del dia y resultados del mes, por
// empresa o consolidado. El consolidado no cuenta las ventas entre empresas.
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', linea: '#E3E1D8', rojo: '#C41230', rojoF: '#FBE9E9', rojoO: '#8E1117', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8', azul: '#1D4E89', azulF: '#E5EEF8' }
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const corto = (n) => (n || '').replace(/ SAS$/i, '')
const COLUMNAS = [
  ['alta', 'Prioridad alta', C.rojo, C.rojoF],
  ['hoy', 'Para hoy', '#F2B21B', C.ambarF],
  ['semana', 'Esta semana', '#8C877C', C.fondo],
]
const ESTADO_RUTA = { calle: ['En la calle', C.tinta, '#E9E4D6'], aprobar: ['Por aprobar', C.ambar, C.ambarF], liquidada: ['Liquidada', C.verde, C.verdeF], sin: ['Sin despachar', C.gris, C.fondo] }
const saludo = () => { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches' }

// Copia del Inicio de antes (19 oct 2026), por si el nuevo no convence. Se abre en /inicio-anterior.
export default function InicioAnterior() {
  const router = useRouter()
  const [usuario, setUsuario] = useState(null)
  const [empresas, setEmpresas] = useState([])
  const [sel, setSel] = useState(null) // id de empresa o 'consolidado'
  const [fecha, setFecha] = useState(obtenerFechaActual())
  const [pendientes, setPendientes] = useState(null)
  const [dia, setDia] = useState(null)
  const [mes, setMes] = useState(null)

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
  }, [])

  const ids = sel === 'consolidado' ? empresas.map(e => e.id) : sel ? [sel] : []
  const consolidado = sel === 'consolidado'

  useEffect(() => {
    if (!ids.length) return
    let vivo = true
    setPendientes(null); setMes(null)
    cargarPendientes(ids, { completo: true }).then(p => vivo && setPendientes(p)).catch(() => vivo && setPendientes([]))
    cargarMes(ids, obtenerFechaActual(), empresas, { consolidado }).then(m => vivo && setMes(m))
    return () => { vivo = false }
  }, [sel, empresas.length])

  useEffect(() => {
    if (!ids.length) return
    let vivo = true
    setDia(null)
    cargarDia(ids, fecha, empresas, { consolidado }).then(d => vivo && setDia(d))
    return () => { vivo = false }
  }, [sel, fecha, empresas.length])

  const verAlerta = async (it) => {
    setPendientes(p => p.filter(x => x.clave !== it.clave))
    await marcarAlertaVista(it.alertaId)
  }
  const actualizar = () => { invalidarPendientes(); const s = sel; setSel(null); setTimeout(() => setSel(s), 0) }

  if (!usuario) return null
  const altas = (pendientes || []).filter(p => p.prioridad === 'alta').length
  const totalPend = (pendientes || []).length
  const nombreFecha = new Date(fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
  const esHoy = fecha === obtenerFechaActual()
  const mesNombre = new Date(obtenerFechaActual() + 'T12:00:00').toLocaleDateString('es-CO', { month: 'long' })
  const tarjeta = 'bg-white rounded-[18px] p-3.5 min-w-0'
  const kpi = (et, va, sub, color) => (
    <div className={tarjeta + ' flex flex-col gap-0.5'}>
      <span className="text-[12.5px] font-bold" style={{ color: C.gris }}>{et}</span>
      <span className="font-extrabold text-[26px] tabular-nums leading-tight" style={{ ...titulo, color: color || C.tinta }}>{va}</span>
      {sub && <span className="text-[12.5px]" style={{ color: C.gris }}>{sub}</span>}
    </div>
  )

  return (
    <div style={{ background: C.fondo, minHeight: '100vh', color: C.tinta }}>
      <PageHeader title="Inicio" subtitle="Maissy Group" showBack={false}
        actions={<button onClick={() => router.push('/reportes')} className="px-3 min-h-[36px] rounded-lg text-sm font-bold" style={{ background: C.fondo }}>Reportes</button>} />

      <div className="p-4 max-w-6xl mx-auto flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-extrabold text-[28px] leading-tight" style={titulo}>{saludo()}, {usuario.nombre?.split(' ')[0]}</h1>
            <p style={{ color: C.gris }}>{new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}{pendientes ? ` · ${totalPend} pendiente${totalPend === 1 ? '' : 's'}${altas ? `, ${altas} de prioridad alta` : ''}` : ''}</p>
          </div>
          {empresas.length > 1 && (
            <div className="flex gap-1 bg-white rounded-full p-1" role="group" aria-label="Empresa">
              {[...empresas.map(e => [e.id, corto(e.nombre)]), ['consolidado', 'Consolidado']].map(([id, t]) => (
                <button key={id} onClick={() => setSel(id)} aria-pressed={sel === id} className="px-3 min-h-[36px] rounded-full text-[13px] font-bold"
                  style={sel === id ? { background: C.tinta, color: '#fff' } : { color: C.gris }}>{t}</button>
              ))}
            </div>
          )}
        </div>

        {/* ---------- Pendientes ---------- */}
        <section aria-label="Pendientes">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="font-extrabold text-[21px]" style={titulo}>Pendientes</h2>
            <button onClick={actualizar} className="text-[13px] font-bold px-3 min-h-[34px] rounded-lg bg-white">Actualizar</button>
          </div>
          {!pendientes ? <p className="text-sm py-6 text-center" style={{ color: C.gris }}>Revisando pendientes…</p> : (
            <div className="grid gap-3 lg:grid-cols-3">
              {COLUMNAS.map(([p, nombre, punto, fondo]) => {
                const lista = pendientes.filter(x => x.prioridad === p)
                return (
                  <div key={p} className="bg-white rounded-[18px] p-3.5 flex flex-col gap-2 min-w-0">
                    <div className="flex items-center gap-2 font-extrabold text-sm">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: punto }} />{nombre}
                      <span className="ml-auto text-[12.5px] font-bold" style={{ color: C.gris }}>{lista.length}</span>
                    </div>
                    {lista.length === 0 && <p className="text-sm py-2" style={{ color: C.gris }}>Nada pendiente.</p>}
                    {lista.map(it => (
                      <div key={it.clave} className="rounded-xl px-3 py-2.5 flex flex-col gap-0.5" style={{ background: fondo }}>
                        <b className="font-bold leading-snug">{it.titulo}</b>
                        {it.detalle && <span className="text-[12.5px]" style={{ color: C.gris }}>{it.detalle}</span>}
                        <div className="flex gap-2 mt-1">
                          <Link href={it.href} className="text-[12.5px] font-bold px-2.5 py-1.5 rounded-lg bg-white" style={{ color: p === 'alta' ? C.rojoO : C.tinta }}>Resolver</Link>
                          {it.alertaId && <button onClick={() => verAlerta(it)} className="text-[12.5px] font-bold px-2.5 py-1.5 rounded-lg" style={{ color: C.gris }}>Marcar como visto</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ---------- Operacion del dia ---------- */}
        <section aria-label="Operación del día">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
            <h2 className="font-extrabold text-[21px]" style={titulo}>Operación del día</h2>
            <label className="flex items-center gap-2 text-sm" style={{ color: C.gris }}>
              <span className="capitalize">{nombreFecha}</span>
              <input type="date" value={fecha} max={obtenerFechaActual()} onChange={e => e.target.value && setFecha(e.target.value)} aria-label="Fecha"
                className="border-2 rounded-xl px-2 min-h-[38px] bg-white" style={{ borderColor: C.linea, color: C.tinta }} />
            </label>
          </div>
          {!dia ? <p className="text-sm py-6 text-center" style={{ color: C.gris }}>Cargando…</p> : (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {kpi(esHoy ? 'Ventas del día (hasta ahora)' : 'Ventas del día', pesos(dia.total), `Rutas ${pesos(dia.ventasRutas)} · mostrador ${pesos(dia.ventasMostrador)}${dia.ventasDomicilios ? ` · domicilios ${pesos(dia.ventasDomicilios)}` : ''}`)}
                {kpi('Mismo día semana anterior', pesos(dia.totalAntes),
                  dia.abiertas ? 'Día completo · hoy aún hay rutas sin cerrar' : dia.totalAntes ? `Variación ${dia.total >= dia.totalAntes ? '+' : ''}${(((dia.total - dia.totalAntes) / dia.totalAntes) * 100).toFixed(1)}%` : 'Sin ventas ese día',
                  !dia.abiertas && dia.totalAntes ? (dia.total >= dia.totalAntes ? C.verde : C.rojo) : undefined)}
                {kpi('Movimiento de efectivo', pesos(Object.values(dia.efectivoPor).reduce((s, v) => s + v, 0)),
                  ids.length > 1 ? empresas.map(e => `${corto(e.nombre)} ${pesos(dia.efectivoPor[e.id] || 0)}`).join(' · ') : 'Entradas menos salidas de caja')}
                {kpi('Créditos otorgados', pesos(dia.creditosHoy), `${dia.creditosCant} crédito${dia.creditosCant === 1 ? '' : 's'}${mes ? ` · cartera total ${pesos(mes.cartera)}` : ''}`)}
              </div>

              {dia.horas.hay && (
                <div className={tarjeta}>
                  <div className="flex flex-wrap justify-between gap-2"><b>Ventas registradas por hora</b><span className="text-[12.5px]" style={{ color: C.gris }}>Tickets de ruta y mostrador, acumulado</span></div>
                  <Leyenda items={[{ nombre: esHoy ? 'Hoy' : 'Ese día', color: COLORES.rutas, linea: true }, { nombre: 'Mismo día semana anterior', color: COLORES.anterior, linea: true }]} />
                  <GraficaLineas etiqueta="Ventas registradas por hora" etiquetas={['6 a. m.', '7', '8', '9', '10', '11', '12 m.', '1 p. m.', '2', '3', '4', '5', '6 p. m.']}
                    series={[{ nombre: 'Semana anterior', datos: dia.horas.antes, color: COLORES.anterior }, { nombre: esHoy ? 'Hoy' : 'Ese día', datos: dia.horas.hoy, color: COLORES.rutas, punto: true }]} />
                </div>
              )}

              <div className="bg-white rounded-[18px] px-3.5 py-1.5 overflow-x-auto">
                <table className="w-full text-sm tabular-nums" style={{ minWidth: 620 }}>
                  <thead><tr className="text-left">
                    {['Ruta', 'Estado', 'Visitados', 'Venta', 'Diferencia'].map((h, i) => (
                      <th key={h} className={`py-2.5 px-2 text-[11.5px] font-bold uppercase tracking-wider border-b-[1.5px] ${i >= 3 ? 'text-right' : ''}`} style={{ color: C.gris, borderColor: C.tinta }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {dia.filasRutas.length === 0 && <tr><td colSpan={5} className="py-6 text-center" style={{ color: C.gris }}>{new Date(fecha + 'T12:00:00').getDay() === 0 ? 'Domingo: no salen rutas.' : 'No hay rutas activas.'}</td></tr>}
                    {dia.filasRutas.map((f, i) => {
                      const [et, co, fo] = ESTADO_RUTA[f.estado]
                      const pct = f.enRutero ? Math.min(100, (f.visitados / f.enRutero) * 100) : 0
                      return (
                        <tr key={i} className="border-b last:border-0" style={{ borderColor: C.linea }}>
                          <td className="py-2.5 px-2"><b>{f.ruta}</b>{f.vendedor && <span className="block text-xs" style={{ color: C.gris }}>{f.vendedor}</span>}</td>
                          <td className="py-2.5 px-2"><span className="text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ color: co, background: fo }}>{et}</span></td>
                          <td className="py-2.5 px-2">
                            {f.enRutero ? (
                              <>
                                <div className="h-2 rounded-full overflow-hidden" style={{ background: C.fondo, minWidth: 80 }}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: C.verde }} /></div>
                                <span className="text-xs" style={{ color: C.gris }}>{f.visitados} de {f.enRutero}</span>
                              </>
                            ) : <span style={{ color: C.gris }}>—</span>}
                          </td>
                          <td className="py-2.5 px-2 text-right">{f.venta ? pesos(f.venta) : '—'}</td>
                          <td className="py-2.5 px-2 text-right font-bold" style={{ color: f.diferencia < 0 ? C.rojo : f.diferencia > 0 ? C.verde : C.gris }}>
                            {f.diferencia == null ? '—' : `${f.diferencia > 0 ? '+' : f.diferencia < 0 ? '−' : ''}${pesos(Math.abs(f.diferencia))}`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* ---------- Resultados del mes ---------- */}
        <section aria-label="Resultados del mes">
          <h2 className="font-extrabold text-[21px] mb-2.5" style={titulo}>Resultados de {mesNombre}</h2>
          {!mes ? <p className="text-sm py-6 text-center" style={{ color: C.gris }}>Cargando…</p> : (
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.6fr_1fr_1fr_1fr]">
                <div className={tarjeta + ' flex flex-col gap-1'}>
                  <span className="text-[12.5px] font-bold" style={{ color: C.gris }}>{consolidado ? 'Ventas del grupo a clientes' : 'Ventas del mes'}{mes.meta ? ' vs. meta' : ''}</span>
                  <span className="font-extrabold text-[26px] tabular-nums" style={titulo}>{pesos(mes.ventas)}{mes.meta ? <span className="text-sm font-medium ml-2" style={{ fontFamily: 'var(--font-texto)', color: C.gris }}>de {pesos(mes.meta)}</span> : null}</span>
                  {mes.meta > 0 && (() => {
                    const cumpl = mes.ventas / mes.meta, corrido = mes.dias / mes.diasMes
                    return (
                      <>
                        <div className="h-3 rounded-full overflow-hidden my-1" style={{ background: C.fondo }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, cumpl * 100)}%`, background: '#F2B21B' }} /></div>
                        <span className="text-[12.5px]" style={{ color: C.gris }}>{Math.round(cumpl * 100)}% de cumplimiento con el {Math.round(corrido * 100)}% del mes transcurrido · <b style={{ color: cumpl >= corrido ? C.verde : C.rojo }}>{cumpl >= corrido ? 'por encima del ritmo esperado' : 'por debajo del ritmo esperado'}</b></span>
                      </>
                    )
                  })()}
                  {consolidado && mes.ventasInternas > 0 && <span className="text-[12.5px]" style={{ color: C.gris }}>Aparte, ventas entre empresas del grupo: {pesos(mes.ventasInternas)}</span>}
                </div>
                {kpi('Gastos operativos', pesos(mes.gastos), 'Gastos de ruta y administrativos')}
                {kpi('Cartera por cobrar', pesos(mes.cartera), <><b style={{ color: mes.vencida ? C.rojo : C.gris }}>{pesos(mes.vencida)} vencida</b> · {mes.carteraCant} créditos{mes.carteraInterna ? <><br />Aparte, deudas entre empresas: {pesos(mes.carteraInterna)}</> : null}</>)}
                {kpi('Por pagar a proveedores', pesos(mes.porPagar), mes.porPagarCant ? <><b style={{ color: mes.porPagarVencido ? C.rojo : C.gris }}>{pesos(mes.porPagarVencido)} vencido</b>{mes.porPagarProximo ? <> · próximo: {mes.porPagarProximo.nombre}, {new Date(mes.porPagarProximo.vence + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}</> : null}</> : 'Sin deudas con proveedores')}
              </div>

              <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
                <div className={tarjeta}>
                  <div className="flex flex-wrap justify-between gap-2"><b>Ventas acumuladas{mes.meta ? ' vs. ritmo de la meta' : ''}</b>{mes.meta > 0 && <span className="text-[12.5px]" style={{ color: C.gris }}>Meta {pesos(mes.meta)}</span>}</div>
                  <Leyenda items={[{ nombre: 'Ventas acumuladas', color: COLORES.rutas, linea: true }, ...(mes.ritmo ? [{ nombre: 'Ritmo para cumplir la meta', color: COLORES.anterior, linea: true }] : [])]} />
                  <GraficaLineas etiqueta="Ventas acumuladas del mes" etiquetas={Array.from({ length: mes.dias }, (_, i) => String(i + 1))}
                    series={[...(mes.ritmo ? [{ nombre: 'Ritmo de la meta', datos: mes.ritmo, color: COLORES.anterior, punteada: true }] : []), { nombre: 'Ventas acumuladas', datos: mes.acumulado, color: COLORES.rutas, punto: true }]} />
                </div>
                <div className={tarjeta}>
                  <div className="flex flex-wrap justify-between gap-2"><b>Cartera por antigüedad</b><span className="text-[12.5px]" style={{ color: C.gris }}>Días desde el crédito</span></div>
                  <GraficaBarras etiqueta="Cartera por antigüedad" etiquetas={['0–7 días', '8–15', '16–30', '+30']} series={[{ nombre: 'Cartera', datos: mes.antig, color: COLORES.antiguedad[2] }]}
                    colorPorBarra={i => COLORES.antiguedad[i]} rotular alto={232} />
                </div>
              </div>

              <div className={tarjeta}>
                <div className="flex flex-wrap justify-between gap-2"><b>Ventas diarias por canal</b><span className="text-[12.5px]" style={{ color: C.gris }}>{consolidado ? 'Sin ventas entre empresas' : corto(empresas.find(e => e.id === sel)?.nombre)}</span></div>
                <Leyenda items={[{ nombre: 'Rutas', color: COLORES.rutas }, { nombre: 'Mostrador y distribuidores', color: COLORES.mostrador }, { nombre: 'Domicilios express', color: COLORES.domicilios }]} />
                <GraficaBarras etiqueta="Ventas diarias por canal" etiquetas={Array.from({ length: mes.dias }, (_, i) => String(i + 1))} alto={240}
                  series={[{ nombre: 'Rutas', datos: mes.rutas, color: COLORES.rutas }, { nombre: 'Mostrador', datos: mes.mostrador, color: COLORES.mostrador }, { nombre: 'Domicilios', datos: mes.domicilios, color: COLORES.domicilios }]} />
              </div>

              {consolidado && empresas.length > 1 && (
                <div className="bg-white rounded-[18px] px-3.5 py-1.5 overflow-x-auto">
                  <table className="w-full text-sm tabular-nums" style={{ minWidth: 620 }}>
                    <thead><tr>
                      {['Comparativo por empresa', 'Ventas', 'Ventas entre empresas', 'Gastos', 'Ventas − gastos'].map((h, i) => (
                        <th key={h} className={`py-2.5 px-2 text-[11.5px] font-bold uppercase tracking-wider border-b-[1.5px] ${i ? 'text-right' : 'text-left'}`} style={{ color: C.gris, borderColor: C.tinta }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {empresas.map(e => {
                        const x = mes.porEmpresa[e.id] || { ventas: 0, interna: 0, gastos: 0, rutas: 0, mostrador: 0 }
                        return (
                          <tr key={e.id} className="border-b" style={{ borderColor: C.linea }}>
                            <td className="py-2.5 px-2"><b>{e.nombre}</b><span className="block text-xs" style={{ color: C.gris }}>Rutas {pesos(x.rutas)} · mostrador y distribuidores {pesos(x.mostrador)}</span></td>
                            <td className="py-2.5 px-2 text-right">{pesos(x.ventas)}</td>
                            <td className="py-2.5 px-2 text-right" style={{ color: C.gris }}>{x.interna ? `−${pesos(x.interna)}` : '—'}</td>
                            <td className="py-2.5 px-2 text-right">{pesos(x.gastos)}</td>
                            <td className="py-2.5 px-2 text-right">{pesos(x.ventas - x.gastos)}</td>
                          </tr>
                        )
                      })}
                      <tr>
                        <td className="py-2.5 px-2"><b>Consolidado</b><span className="block text-xs" style={{ color: C.gris }}>Sin las ventas entre empresas</span></td>
                        <td className="py-2.5 px-2 text-right font-bold">{pesos(mes.ventas)}</td>
                        <td />
                        <td className="py-2.5 px-2 text-right font-bold">{pesos(mes.gastos)}</td>
                        <td className="py-2.5 px-2 text-right font-bold">{pesos(mes.ventas - mes.gastos)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {mes.top.length > 0 && (
                <div className={tarjeta}>
                  <div className="flex flex-wrap justify-between gap-2 mb-2"><b>Productos más vendidos</b><span className="text-[12.5px]" style={{ color: C.gris }}>Unidades en {mesNombre}</span></div>
                  <GraficaHorizontal etiqueta="Productos más vendidos" filas={mes.top} />
                </div>
              )}
              <p className="text-xs px-1" style={{ color: C.gris }}>«Ventas − gastos» todavía no le resta el costo del producto, así que no es la utilidad.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
