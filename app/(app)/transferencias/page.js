'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useDestino } from '@/lib/destino'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { puedeVerModulo } from '@/lib/permisos'
import { crearAlertaAdmin } from '@/lib/alertas-admin'
import { PageHeader } from '@/components/ui'
import CampoFecha from '@/components/CampoFecha'

// Mercancía que un vendedor le pasa a otro en la calle. Quien la recibe la
// anota al cerrar su ruta y quien la entregó la confirma (o al revés); el admin
// puede confirmar o rechazar en su nombre, y anotar una que nadie anotó. La
// pestaña "A quién le falta" usa las confirmadas como pista de que el despacho
// de esa ruta se queda corto.
const C = {
  tinta: '#1C1B19', gris: '#5A5750', fondo: 'var(--hoja)', linea: '#E3E1D8', suave: '#EFEDE6', neutro: '#E9E4D6',
  rojo: 'var(--rojo)', rojoF: 'var(--rojo-suave)', amarillo: 'var(--acento)', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8',
}
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const tarjeta = 'bg-white rounded-[18px] p-4'
const $ = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO')
const iniciales = (n) => (n || '').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()
const primerNombre = (n) => (n || '').split(' ')[0]
const sumarDias = (f, d) => { const x = new Date(f + 'T12:00:00'); x.setDate(x.getDate() + d); return x.toLocaleDateString('en-CA') }
const diaLargo = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
const diaCorto = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' })
const PILL = { gris: [C.suave, C.gris], ambar: [C.ambarF, C.ambar], verde: [C.verdeF, C.verde], rojo: [C.rojoF, C.rojo] }
const Pill = ({ tono = 'gris', children }) => <span className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: PILL[tono][0], color: PILL[tono][1] }}>{children}</span>
const ESTADO = { pendiente_confirmacion: ['Por confirmar', 'ambar'], aplicada: ['Confirmada', 'verde'], rechazada: ['Rechazada', 'rojo'] }

export default function Transferencias() {
  const router = useRouter()
  const hoy = obtenerFechaActual()
  const [usuario, setUsuario] = useState(null)
  const [tab, setTab] = useState('pend')
  useDestino('vista', (v) => { if (['pend', 'hist', 'falta'].includes(v)) setTab(v) })
  const [vendedores, setVendedores] = useState([])
  const [productos, setProductos] = useState([])
  const [preciosRuta, setPreciosRuta] = useState({})
  const [pendientes, setPendientes] = useState([])
  const [mes, setMes] = useState([])
  const [despachosMes, setDespachosMes] = useState([])
  const [rango, setRango] = useState('mes')
  const [vendFiltro, setVendFiltro] = useState('')
  const [abierta, setAbierta] = useState(null)
  const [anotando, setAnotando] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [cargado, setCargado] = useState(false)

  const cargar = useCallback(async () => {
    const empresaId = getEmpresaId()
    const desde = hoy.slice(0, 7) + '-01'
    const [{ data: vends }, { data: prods }, { data: rp }, { data: pend }, { data: delMes }, { data: desps }] = await Promise.all([
      supabase.from('vendedores').select('id, nombre, ruta_id, estado, rutas(nombre)').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('productos').select('sku, nombre, precio_venta').eq('empresa_id', empresaId).eq('estado', true).neq('tipo', 'materia_prima').order('nombre'),
      supabase.from('rutas_precios').select('ruta_id, sku, precio_especial').eq('empresa_id', empresaId),
      supabase.from('transferencias_mercancia').select('*').eq('empresa_id', empresaId).eq('estado', 'pendiente_confirmacion').order('fecha', { ascending: true }),
      supabase.from('transferencias_mercancia').select('*').eq('empresa_id', empresaId).gte('fecha', desde).order('created_at', { ascending: false }),
      supabase.from('despachos_encab').select('vendedor_id, fecha').eq('empresa_id', empresaId).gte('fecha', desde),
    ])
    setVendedores(vends || [])
    setProductos(prods || [])
    const pr = {}
    ;(rp || []).forEach(x => { (pr[x.ruta_id] = pr[x.ruta_id] || {})[x.sku] = Number(x.precio_especial) })
    setPreciosRuta(pr)
    setPendientes(pend || [])
    setMes(delMes || [])
    setDespachosMes(desps || [])
    setCargado(true)
  }, [hoy])

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')
    if (!u) { router.push('/entrar'); return }
    if (!puedeVerModulo(u, 'transferencias', ['admin', 'auxiliar'])) { router.push('/despacho'); return }
    setUsuario(u)
    cargar()
  }, [router, cargar])

  if (!usuario) return null

  const vend = (id) => vendedores.find(v => v.id === id)
  const nombreV = (id) => vend(id)?.nombre || 'Sin vendedor'
  const rutaV = (id) => vend(id)?.rutas?.nombre
  const prod = (sku) => productos.find(p => p.sku === sku)?.nombre || sku
  const dias = (f) => Math.round((new Date(hoy + 'T12:00:00') - new Date(f + 'T12:00:00')) / 86400000)

  // Confirmar o rechazar en nombre del vendedor que falta.
  const resolver = async (t, ok) => {
    setOcupado(true)
    const empresaId = getEmpresaId()
    const { error } = await supabase.from('transferencias_mercancia').update({ estado: ok ? 'aplicada' : 'rechazada', confirmado_por: usuario.nombre, confirmado_at: new Date().toISOString() }).eq('id', t.id).eq('empresa_id', empresaId)
    if (error) { alert('No se pudo guardar: ' + error.message); setOcupado(false); return }
    if (!ok) await crearAlertaAdmin({ empresaId, tipo: 'transferencia_rechazada', referenciaTipo: 'transferencia_mercancia', referenciaId: t.id,
      mensaje: `${usuario.nombre} rechazó la transferencia de ${t.cantidad} ${prod(t.sku)} de ${nombreV(t.vendedor_origen_id)} a ${nombreV(t.vendedor_destino_id)}` })
    setOcupado(false)
    cargar()
  }
  const cambiarEstado = async (t, estado) => {
    setOcupado(true)
    const { error } = await supabase.from('transferencias_mercancia').update({ estado, confirmado_por: usuario.nombre, confirmado_at: new Date().toISOString() }).eq('id', t.id).eq('empresa_id', getEmpresaId())
    setOcupado(false)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    setAbierta(null)
    cargar()
  }
  const precioPara = (destinoId, sku) => {
    const rid = vend(destinoId)?.ruta_id
    const especial = rid ? preciosRuta[rid]?.[sku] : undefined
    return especial !== undefined ? especial : Number(productos.find(p => p.sku === sku)?.precio_venta || 0)
  }
  const guardarNueva = async () => {
    const a = anotando
    const cantidad = Number(String(a.cantidad).replace(',', '.'))
    if (!a.origen || !a.destino || !a.sku || !(cantidad > 0)) { setAnotando({ ...a, error: 'Escoge quién la pasó, quién la recibió, el producto y cuántas.' }); return }
    if (a.origen === a.destino) { setAnotando({ ...a, error: 'Quien la pasó y quien la recibió no pueden ser el mismo.' }); return }
    setOcupado(true)
    const precio = precioPara(a.destino, a.sku)
    const { error } = await supabase.from('transferencias_mercancia').insert({
      empresa_id: getEmpresaId(), fecha: a.fecha, created_at: new Date().toISOString(), vendedor_origen_id: a.origen, vendedor_destino_id: a.destino,
      sku: a.sku, cantidad, valor_unitario: precio, valor_total: cantidad * precio, estado: 'aplicada', aplicada: false, origen_registro: 'admin',
      confirmado_por: usuario.nombre, confirmado_at: new Date().toISOString(),
    })
    setOcupado(false)
    if (error) { setAnotando({ ...a, error: 'No se pudo guardar: ' + error.message }); return }
    setAnotando(null)
    cargar()
  }

  // Resumen del mes.
  const valorPend = pendientes.reduce((s, t) => s + Number(t.valor_total || 0), 0)
  const masVieja = pendientes.length ? Math.max(...pendientes.map(t => dias(t.fecha))) : 0
  const confirmadasMes = mes.filter(t => t.estado === 'aplicada')
  const rechazadasMes = mes.filter(t => t.estado === 'rechazada')

  // A quién le falta: por vendedor que recibe y producto, cuántos días tuvo que pedir.
  const diasConDespacho = {}
  despachosMes.forEach(d => { (diasConDespacho[d.vendedor_id] = diasConDespacho[d.vendedor_id] || new Set()).add(d.fecha) })
  const faltas = {}
  confirmadasMes.forEach(t => {
    const k = t.vendedor_destino_id + '|' + t.sku
    const f = (faltas[k] = faltas[k] || { destino: t.vendedor_destino_id, sku: t.sku, dias: new Set(), unidades: 0 })
    f.dias.add(t.fecha); f.unidades += Number(t.cantidad)
  })
  const listaFaltas = Object.values(faltas).map(f => ({ ...f, nDias: f.dias.size, de: diasConDespacho[f.destino]?.size || f.dias.size, promedio: f.unidades / f.dias.size }))
    .sort((a, b) => b.nDias - a.nDias || b.unidades - a.unidades)
  const top = listaFaltas[0]
  const maxDias = Math.max(1, ...listaFaltas.map(f => f.nDias))

  // Historial filtrado.
  const desdeRango = rango === 'hoy' ? hoy : rango === 'semana' ? sumarDias(hoy, -6) : hoy.slice(0, 7) + '-01'
  const hist = mes.filter(t => t.fecha >= desdeRango && (!vendFiltro || t.vendedor_origen_id === vendFiltro || t.vendedor_destino_id === vendFiltro))
  const porDia = {}
  hist.forEach(t => { (porDia[t.fecha] = porDia[t.fecha] || []).push(t) })
  const vendConMov = vendedores.filter(v => mes.some(t => t.vendedor_origen_id === v.id || t.vendedor_destino_id === v.id))

  const Persona = ({ id }) => <span className="inline-flex items-center gap-1.5 font-extrabold"><span className="w-7 h-7 rounded-full inline-flex items-center justify-center text-[11px] font-black" style={{ background: C.amarillo, color: C.tinta, ...titulo }}>{iniciales(nombreV(id))}</span>{nombreV(id)}</span>

  return (
    <div style={{ background: C.fondo, color: C.tinta }} className="min-h-screen">
      <PageHeader buscar="Transferencias" title="Transferencias"
        actions={<button onClick={() => setAnotando({ fecha: hoy, origen: '', destino: '', sku: '', cantidad: '' })} className="px-4 min-h-[42px] rounded-xl text-sm font-bold" style={{ background: C.suave }}>Anotar una transferencia</button>} />
      <div className="p-4 max-w-5xl mx-auto flex flex-col gap-4">
        {!cargado ? <p className="text-center py-16" style={{ color: C.gris }}>Cargando…</p> : (
          <>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
              <Kpi rotulo="Por confirmar" valor={pendientes.length} color={pendientes.length ? C.rojo : C.tinta} nota={pendientes.length ? `${$(valorPend)} · la más vieja de ${masVieja === 0 ? 'hoy' : masVieja === 1 ? 'ayer' : `hace ${masVieja} días`}` : 'Nada pendiente'} />
              <Kpi rotulo="Pasado este mes" valor={$(confirmadasMes.reduce((s, t) => s + Number(t.valor_total || 0), 0))} nota={`${confirmadasMes.length} ${confirmadasMes.length === 1 ? 'transferencia confirmada' : 'transferencias confirmadas'}`} />
              <Kpi rotulo="Rechazadas este mes" valor={rechazadasMes.length} nota={rechazadasMes.length ? 'Le llegó aviso al admin' : 'Ninguna'} />
              <Kpi rotulo="La que más recibe" valor={top ? (rutaV(top.destino) || nombreV(top.destino)) : '—'} chico nota={top ? `${prod(top.sku)} · ${top.nDias} de ${top.de} días` : 'Sin transferencias este mes'} />
            </div>

            <div className="flex gap-1 bg-white rounded-full p-1 w-max max-w-full overflow-x-auto" role="tablist">
              {[['pend', `Por confirmar${pendientes.length ? ' · ' + pendientes.length : ''}`], ['hist', 'Historial'], ['falta', 'A quién le falta']].map(([id, n]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="rounded-full min-h-[40px] px-4 text-sm font-bold whitespace-nowrap"
                  style={tab === id ? { background: C.tinta, color: '#fff' } : { color: C.gris }}>{n}</button>
              ))}
            </div>

            {tab === 'pend' && (
              <div className="flex flex-col gap-3">
                {pendientes.length === 0 && <div className={tarjeta}><b>Nada por confirmar.</b><p className="text-sm" style={{ color: C.gris }}>Cuando un vendedor anote mercancía que le pasó otro, aparece aquí hasta que el otro la confirme.</p></div>}
                {pendientes.map(t => {
                  const anotoReceptor = t.origen_registro === 'receptor'
                  const falta = anotoReceptor ? t.vendedor_origen_id : t.vendedor_destino_id
                  const d = dias(t.fecha)
                  return (
                    <div data-fila key={t.id} className={tarjeta + ' grid gap-3 items-center md:grid-cols-[minmax(0,1fr)_auto]'}>
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap text-[15px]">
                          {anotoReceptor
                            ? <><Persona id={t.vendedor_destino_id} /><span className="font-bold" style={{ color: C.gris }}>dice que</span><Persona id={t.vendedor_origen_id} /><span className="font-bold" style={{ color: C.gris }}>le pasó</span></>
                            : <><Persona id={t.vendedor_origen_id} /><span className="font-bold" style={{ color: C.gris }}>dice que le pasó a</span><Persona id={t.vendedor_destino_id} /></>}
                        </div>
                        <span><b>{Number(t.cantidad).toLocaleString('es-CO')} {prod(t.sku)}</b> · <span className="tabular-nums">{$(t.valor_total)}</span> <span className="text-[13px]" style={{ color: C.gris }}>· {diaCorto(t.fecha)}{rutaV(t.vendedor_origen_id) && rutaV(t.vendedor_destino_id) ? ` · ${rutaV(t.vendedor_origen_id)} → ${rutaV(t.vendedor_destino_id)}` : ''}</span></span>
                        <span className="text-[13px]" style={{ color: C.gris }}>Falta que <b>{primerNombre(nombreV(falta))}</b> confirme que la {anotoReceptor ? 'entregó' : 'recibió'}. Puede hacerlo al cerrar su ruta o tú en su nombre.</span>
                      </div>
                      <div className="flex gap-2 flex-wrap md:justify-end items-center">
                        {d >= 1 && <Pill tono={d >= 2 ? 'rojo' : 'ambar'}>{d === 1 ? 'Hace 1 día' : `Hace ${d} días`}</Pill>}
                        <button type="button" disabled={ocupado} onClick={() => resolver(t, false)} className="rounded-xl min-h-[42px] px-4 text-sm font-bold disabled:opacity-40" style={{ background: C.suave }}>Rechazar</button>
                        <button type="button" disabled={ocupado} onClick={() => resolver(t, true)} className="rounded-xl min-h-[42px] px-4 text-sm font-bold disabled:opacity-40" style={{ background: C.verdeF, color: C.verde }}>{anotoReceptor ? 'Sí, la entregó' : 'Sí, la recibió'}</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {tab === 'hist' && (
              <div className={tarjeta + ' flex flex-col gap-2'}>
                <div className="flex gap-3 justify-between flex-wrap">
                  <div className="flex gap-2 flex-wrap">{[['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes']].map(([id, n]) => <Chip key={id} sel={rango === id} onClick={() => setRango(id)}>{n}</Chip>)}</div>
                  <div className="flex gap-2 flex-wrap"><Chip sel={!vendFiltro} onClick={() => setVendFiltro('')}>Todos</Chip>{vendConMov.map(v => <Chip key={v.id} sel={vendFiltro === v.id} onClick={() => setVendFiltro(v.id)}>{primerNombre(v.nombre)}</Chip>)}</div>
                </div>
                {hist.length === 0 && <p className="text-sm py-4" style={{ color: C.gris }}>Sin transferencias en este rango.</p>}
                {Object.entries(porDia).sort((a, b) => b[0].localeCompare(a[0])).map(([f, ts]) => (
                  <div key={f}>
                    <div className="text-xs font-extrabold uppercase tracking-wider pt-3 pb-1" style={{ color: C.gris }}>{diaLargo(f)} · {$(ts.filter(t => t.estado !== 'rechazada').reduce((s, t) => s + Number(t.valor_total || 0), 0))}</div>
                    {ts.map(t => (
                      <div data-fila key={t.id} className="border-t" style={{ borderColor: C.linea }}>
                        <button type="button" onClick={() => setAbierta(abierta === t.id ? null : t.id)} aria-expanded={abierta === t.id}
                          className="w-full text-left grid gap-x-3 gap-y-1 py-2.5 items-center text-sm grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto_auto]">
                          <span><b>{primerNombre(nombreV(t.vendedor_origen_id))} → {primerNombre(nombreV(t.vendedor_destino_id))}</b>{rutaV(t.vendedor_origen_id) && <><br /><span className="text-[13px]" style={{ color: C.gris }}>{rutaV(t.vendedor_origen_id)} → {rutaV(t.vendedor_destino_id) || '—'}</span></>}</span>
                          <span className="order-3 md:order-none col-span-2 md:col-span-1">{Number(t.cantidad).toLocaleString('es-CO')} {prod(t.sku)}</span>
                          <span className="tabular-nums font-bold text-right">{$(t.valor_total)}</span>
                          <span className="text-right"><Pill tono={ESTADO[t.estado]?.[1]}>{ESTADO[t.estado]?.[0] || t.estado}</Pill></span>
                        </button>
                        {abierta === t.id && (
                          <div className="pb-3 flex flex-col gap-2 text-[13px]">
                            <span style={{ color: C.gris }}>Anotada por {t.origen_registro === 'receptor' ? 'quien la recibió' : t.origen_registro === 'emisor' ? 'quien la entregó' : 'el admin'}{t.confirmado_por ? ` · ${t.estado === 'rechazada' ? 'rechazada' : 'confirmada'} por ${t.confirmado_por}` : ''}{t.aplicada ? ' · ya contada en la liquidación' : ''}.</span>
                            <div className="flex gap-2 flex-wrap items-center">
                              <span className="font-bold">Cambiar a:</span>
                              {Object.entries(ESTADO).filter(([k]) => k !== t.estado).map(([k, [n]]) => (
                                <button key={k} type="button" disabled={ocupado} onClick={() => cambiarEstado(t, k)} className="rounded-xl min-h-[36px] px-3 font-bold disabled:opacity-40" style={{ background: C.suave }}>{n}</button>
                              ))}
                            </div>
                            <span style={{ color: C.ambar }}>Cambiar el estado cambia la cuenta de los dos vendedores en su liquidación.</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {tab === 'falta' && (
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-start">
                <div className={tarjeta + ' flex flex-col gap-1'}>
                  <div className="flex items-baseline justify-between gap-2 flex-wrap pb-1"><h3 className="text-[17px] font-extrabold" style={titulo}>Productos más recibidos este mes</h3><span className="text-[13px]" style={{ color: C.gris }}>Días en que tuvieron que pedir</span></div>
                  {listaFaltas.length === 0 ? <p className="text-sm py-2" style={{ color: C.gris }}>Sin transferencias confirmadas este mes.</p> : listaFaltas.slice(0, 8).map(f => (
                    <div data-fila key={f.destino + f.sku} className="grid gap-3 items-center py-2.5 border-t first:border-t-0 text-sm" style={{ borderColor: C.linea, gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr) 80px' }}>
                      <span><b>{rutaV(f.destino) || nombreV(f.destino)}</b><br /><span className="text-[13px]" style={{ color: C.gris }}>{prod(f.sku)} · {f.nDias} de {f.de} días · {f.unidades.toLocaleString('es-CO')} und</span></span>
                      <span className="h-2.5 rounded-r" style={{ width: `${f.nDias / maxDias * 100}%`, background: C.neutro }} />
                      <span className="text-right font-extrabold tabular-nums">{f.nDias} {f.nDias === 1 ? 'día' : 'días'}</span>
                    </div>
                  ))}
                </div>
                <div className={tarjeta + ' flex flex-col gap-2'}>
                  <h3 className="text-[17px] font-extrabold" style={titulo}>Lo que dice</h3>
                  {top && top.nDias >= 3 ? (
                    <div className="rounded-xl px-3 py-2.5 text-[13.5px]" style={{ background: C.ambarF, color: C.ambar }}>
                      <b>{rutaV(top.destino) || nombreV(top.destino)}</b> recibe en promedio <b>{Math.round(top.promedio)} {prod(top.sku)}</b> los días que le falta ({top.nDias} de {top.de}). Súbele unas {Math.round(top.promedio)} a su carga estándar en Despacho y deja de depender de que otro vendedor tenga de sobra.
                    </div>
                  ) : <p className="text-sm" style={{ color: C.gris }}>Todavía no hay una ruta que pida seguido. Con 3 días o más en el mes sale aquí la sugerencia.</p>}
                  <button type="button" onClick={() => router.push('/despacho')} className="rounded-xl min-h-[42px] text-sm font-bold" style={{ background: C.suave }}>Ir a Despacho</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {anotando && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setAnotando(null)}>
          <div className="bg-white w-full md:max-w-lg rounded-t-[22px] md:rounded-[22px] p-5 flex flex-col gap-3 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()} role="dialog" aria-label="Anotar una transferencia">
            <h3 className="text-xl font-extrabold" style={titulo}>Anotar una transferencia</h3>
            <Campo etiqueta="Fecha"><CampoFecha value={anotando.fecha} onChange={e => setAnotando({ ...anotando, fecha: e.target.value })} className={claseCampo} style={{ borderColor: C.linea }} /></Campo>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="La pasó"><Selector v={anotando.origen} on={v => setAnotando({ ...anotando, origen: v })} vendedores={vendedores} /></Campo>
              <Campo etiqueta="La recibió"><Selector v={anotando.destino} on={v => setAnotando({ ...anotando, destino: v })} vendedores={vendedores} /></Campo>
            </div>
            <Campo etiqueta="Producto">
              <select value={anotando.sku} onChange={e => setAnotando({ ...anotando, sku: e.target.value })} className={claseCampo} style={{ borderColor: C.linea }}>
                <option value="">Escoge</option>{productos.map(p => <option key={p.sku} value={p.sku}>{p.nombre}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Cuántas"><input inputMode="decimal" value={anotando.cantidad} onChange={e => setAnotando({ ...anotando, cantidad: e.target.value })} className={claseCampo} style={{ borderColor: C.linea }} placeholder="0" /></Campo>
            {anotando.sku && anotando.destino && Number(anotando.cantidad) > 0 && <p className="text-sm">Vale <b>{$(precioPara(anotando.destino, anotando.sku) * Number(String(anotando.cantidad).replace(',', '.')))}</b> <span style={{ color: C.gris }}>al precio de la ruta de quien la recibió</span></p>}
            {anotando.error && <p className="text-sm font-bold" style={{ color: C.rojo }}>{anotando.error}</p>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setAnotando(null)} className="rounded-xl min-h-[46px] px-4 font-bold" style={{ background: C.suave }}>Cancelar</button>
              <button type="button" disabled={ocupado} onClick={guardarNueva} className="rounded-xl min-h-[46px] px-5 font-bold text-white disabled:opacity-50" style={{ background: 'var(--primario)' }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const claseCampo = 'w-full h-12 rounded-xl border-2 px-3 bg-white text-[15px] font-semibold'
const Campo = ({ etiqueta, children }) => <label className="flex flex-col gap-1.5 text-sm font-bold">{etiqueta}{children}</label>
const Selector = ({ v, on, vendedores }) => (
  <select value={v} onChange={e => on(e.target.value)} className={claseCampo} style={{ borderColor: C.linea }}>
    <option value="">Escoge</option>{vendedores.filter(x => x.estado !== false).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
  </select>
)
const Chip = ({ sel, onClick, children }) => (
  <button type="button" onClick={onClick} className="rounded-full min-h-[38px] px-3.5 text-[13.5px] font-bold"
    style={sel ? { background: '#fff', boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: C.suave }}>{children}</button>
)
function Kpi({ rotulo, valor, nota, color, chico }) {
  return (
    <div className="bg-white rounded-[18px] p-4 flex flex-col gap-0.5 min-w-0">
      <span className="text-[13px] font-bold" style={{ color: C.gris }}>{rotulo}</span>
      <span className="cifra-caja"><span className="cifra font-extrabold tabular-nums" style={{ ...titulo, color: color || C.tinta, '--cifra-max': chico ? '20px' : '28px' }}>{valor}</span></span>
      <span className="text-[13px] truncate" style={{ color: C.gris }}>{nota}</span>
    </div>
  )
}
