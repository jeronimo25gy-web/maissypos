'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import Exportar from '@/components/Exportar'

// Cartera > Pagados: una fila pareja por cliente con lo que pagó en el mes,
// los días que tardó y si pagó a tiempo. Se carga por mes (sin tope) y el
// medio de pago sale de los abonos registrados.
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', linea: '#E3E1D8', suave: '#EFEDE6', rojo: '#C41230', rojoF: '#FBE9E9', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8' }
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const pesos = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
const fechaCorta = (f) => f ? new Date(f.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }).replace('.', '') : '—'
const diasEntre = (a, b) => Math.round((new Date(b.slice(0, 10) + 'T12:00:00') - new Date(a.slice(0, 10) + 'T12:00:00')) / 864e5)
// fecha_pagado es timestamptz: el día es el de Colombia, no el de UTC.
const diaDe = (ts) => ts ? new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) : null
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`
const MEDIOS = ['Efectivo', 'Transferencia', 'Sin registro']
const COLUMNAS = 'minmax(170px,1.6fr) minmax(150px,1.3fr) 70px 112px 92px 70px 136px 20px'

const nombreMes = (m) => { const t = new Date(m + '-15T12:00:00').toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }); return t[0].toUpperCase() + t.slice(1) }
const sumarMes = (m, n) => { const d = new Date(m + '-15T12:00:00'); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 7) }

// Rango de fechas del filtro: un mes o los últimos 3.
const rangoDe = (periodo, hoy) => {
  if (periodo === '3m') { const fin = hoy.slice(0, 7); return { desde: sumarMes(fin, -2), hasta: sumarMes(fin, 1), nombre: 'Últimos 3 meses' } }
  return { desde: periodo, hasta: sumarMes(periodo, 1), nombre: nombreMes(periodo) }
}

const medioDe = (abonos) => {
  if (!abonos?.length) return 'Sin registro'
  const m = new Set(abonos.map(a => a.cuentas?.tipo === 'efectivo' ? 'Efectivo' : 'Transferencia'))
  return m.size > 1 ? 'Mixto' : [...m][0]
}

// Puntualidad de un credito: pago contra la fecha en que vencía.
const puntualidad = (f) => {
  const pagado = f.pagado || ''
  if (f.fecha_fiado && pagado && f.fecha_fiado > pagado) return { texto: 'Revisar fecha', color: C.ambar, fondo: C.ambarF, tarde: null }
  if (!f.fecha_pago) return { texto: 'Sin fecha de pago', color: C.gris, fondo: C.suave, tarde: null }
  const t = diasEntre(f.fecha_pago, pagado)
  if (t <= 0) return { texto: 'A tiempo', color: C.verde, fondo: C.verdeF, tarde: 0 }
  return { texto: t === 1 ? '1 día tarde' : `${t} días tarde`, color: t <= 3 ? C.ambar : C.rojo, fondo: t <= 3 ? C.ambarF : C.rojoF, tarde: t }
}
const diasParaPagar = (f) => f.fecha_fiado && f.pagado && f.fecha_fiado <= f.pagado ? diasEntre(f.fecha_fiado, f.pagado) : null
const origenDe = (f) => f.ruta_id ? { key: f.ruta_id, nombre: f.rutas?.nombre || 'Ruta' } : f.venta_id ? { key: '__caja', nombre: 'Mostrador' } : { key: '__sin', nombre: 'Sin ruta' }
const nombreLindo = (t) => (t || '').toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase())

export default function Pagados({ hoy, empresa }) {
  const [periodo, setPeriodo] = useState(hoy.slice(0, 7))
  const [creditos, setCreditos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [ruta, setRuta] = useState('')
  const [medio, setMedio] = useState('')
  const [orden, setOrden] = useState('ultimo')
  const [abierto, setAbierto] = useState(null)

  const rango = rangoDe(periodo, hoy)
  useEffect(() => {
    let vivo = true
    const cargar = async () => {
      setCargando(true)
      const { data, error: e } = await supabase.from('cartera_fiados')
        .select('*, vendedores(nombre), rutas(nombre), clientes(nombre, apto, edificio, barrio), abonos_cartera(fecha, valor, nota, cuentas(nombre, tipo))')
        .eq('estado', 'pagado').eq('empresa_id', getEmpresaId())
        .gte('fecha_pagado', rango.desde + '-01T00:00:00-05:00').lt('fecha_pagado', rango.hasta + '-01T00:00:00-05:00')
        .order('fecha_pagado', { ascending: false })
      if (!vivo) return
      setError(e ? 'No se pudieron cargar los pagos: ' + e.message : '')
      setCreditos((data || []).map(f => { const x = { ...f, pagado: diaDe(f.fecha_pagado) }; return { ...x, medio: medioDe(f.abonos_cartera), punt: puntualidad(x), dias: diasParaPagar(x) } }))
      setCargando(false)
    }
    cargar()
    return () => { vivo = false }
  }, [periodo])

  const meses = Array.from({ length: 12 }, (_, i) => sumarMes(hoy.slice(0, 7), -i))
  const q = busqueda.trim().toLowerCase()
  const rutas = Object.values(creditos.reduce((m, f) => {
    const o = origenDe(f); const x = (m[o.key] = m[o.key] || { ...o, total: 0 }); x.total += Number(f.valor_original) || 0; return m
  }, {})).sort((a, b) => b.total - a.total)

  const filtrados = creditos.filter(f => (!ruta || origenDe(f).key === ruta) && (!medio || f.medio === medio)
    && (!q || [f.nombre_cliente, f.clientes?.nombre, f.clientes?.apto, f.clientes?.edificio, f.clientes?.barrio].some(t => (t || '').toLowerCase().includes(q))))

  // Una fila por cliente (ligado o por el nombre escrito).
  const grupos = Object.values(filtrados.reduce((m, f) => {
    const key = f.cliente_id ? 'c:' + f.cliente_id : (f.nombre_cliente || 'Sin nombre').trim()
    const g = (m[key] = m[key] || { key, nombre: f.clientes?.nombre || f.nombre_cliente || 'Sin nombre', cliente: f.clientes, items: [] })
    g.items.push(f); return m
  }, {})).map(g => {
    const items = g.items.sort((a, b) => (b.pagado || '').localeCompare(a.pagado || ''))
    const ds = items.map(f => f.dias).filter(d => d != null)
    const conTarde = items.filter(f => f.punt.tarde != null)
    // La puntualidad del cliente es la de su pago mas atrasado.
    const peor = conTarde.sort((a, b) => b.punt.tarde - a.punt.tarde)[0] || items.find(f => f.punt.texto === 'Revisar fecha') || items[0]
    return { ...g, items, total: items.reduce((s, f) => s + (Number(f.valor_original) || 0), 0), ultimo: items[0]?.pagado, prom: ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : null, punt: peor.punt }
  })
  grupos.sort(orden === 'valor' ? (a, b) => b.total - a.total
    : orden === 'tarde' ? (a, b) => (b.punt.tarde ?? -1) - (a.punt.tarde ?? -1)
    : orden === 'nombre' ? (a, b) => a.nombre.localeCompare(b.nombre)
    : (a, b) => (b.ultimo || '').localeCompare(a.ultimo || ''))

  // Indicadores del periodo (sin los filtros de ruta, medio y búsqueda).
  const total = creditos.reduce((s, f) => s + (Number(f.valor_original) || 0), 0)
  const clientesN = new Set(creditos.map(f => f.cliente_id || f.nombre_cliente)).size
  const ds = creditos.map(f => f.dias).filter(d => d != null)
  const prom = ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : null
  const conFecha = creditos.filter(f => f.punt.tarde != null)
  const aTiempo = conFecha.filter(f => f.punt.tarde === 0).length
  const sinFecha = creditos.filter(f => !f.fecha_pago).length
  const porMedio = Object.fromEntries([...MEDIOS, 'Mixto'].map(m => [m, creditos.filter(f => f.medio === m).reduce((s, f) => s + (Number(f.valor_original) || 0), 0)]))
  const COLOR_MEDIO = { Efectivo: C.verde, Transferencia: C.tinta, Mixto: C.ambar, 'Sin registro': C.linea }

  const reporte = () => ({
    titulo: 'Cartera pagada', empresa: empresa?.nombre, logo: empresa?.logo_url, periodo: rango.nombre,
    secciones: [
      { kpis: [{ rotulo: 'Cobrado', valor: pesos(total), valorNumero: total }, { rotulo: 'Créditos', valor: creditos.length, valorNumero: creditos.length }, { rotulo: 'Días promedio para pagar', valor: prom ?? '—', valorNumero: prom ?? 0 }, { rotulo: 'Pagaron a tiempo', valor: `${aTiempo} de ${conFecha.length}`, valorNumero: aTiempo }] },
      { titulo: 'Clientes', tabla: { columnas: [{ titulo: 'Cliente' }, { titulo: 'Ruta o punto' }, { titulo: 'Créditos', tipo: 'num' }, { titulo: 'Pagado', tipo: 'pesos' }, { titulo: 'Último pago' }, { titulo: 'Puntualidad' }],
        filas: grupos.map(g => [g.nombre, origenDe(g.items[0]).nombre, g.items.length, g.total, fechaCorta(g.ultimo), g.punt.texto]), total: ['Total', '', filtrados.length, grupos.reduce((s, g) => s + g.total, 0), '', ''] } },
      { titulo: 'Créditos', tabla: { columnas: [{ titulo: 'Cliente' }, { titulo: 'Crédito' }, { titulo: 'Vencía' }, { titulo: 'Pagado' }, { titulo: 'Días', tipo: 'num' }, { titulo: 'Medio' }, { titulo: 'Valor', tipo: 'pesos' }],
        filas: grupos.flatMap(g => g.items.map(f => [g.nombre, fechaCorta(f.fecha_fiado), fechaCorta(f.fecha_pago), fechaCorta(f.pagado), f.dias ?? '', f.medio, Number(f.valor_original) || 0])) } },
    ],
  })

  const chip = (activo, onClick, contenido, key) => (
    <button key={key} onClick={onClick} aria-pressed={activo} className="shrink-0 px-3 min-h-[36px] rounded-full text-[13px] font-bold whitespace-nowrap bg-white"
      style={activo ? { color: C.tinta, boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { color: C.gris }}>{contenido}</button>
  )
  const kpi = (et, va, sub, extra) => (
    <div className="bg-white rounded-[18px] p-3.5 flex flex-col gap-0.5 min-w-0">
      <span className="text-[12.5px] font-bold" style={{ color: C.gris }}>{et}</span>
      {va != null && <span className="font-extrabold text-[24px] tabular-nums leading-tight" style={titulo}>{va}</span>}
      {extra}
      {sub && <span className="text-[12.5px]" style={{ color: C.gris }}>{sub}</span>}
    </div>
  )
  const sel = 'bg-white rounded-xl px-3 min-h-[42px] text-[14px] font-bold outline-none border-2'
  const enc = 'text-[11.5px] font-extrabold uppercase tracking-[.05em]'

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {kpi(`Cobrado en ${rango.nombre.toLowerCase()}`, pesos(total), `${plural(creditos.length, 'crédito', 'créditos')} · ${plural(clientesN, 'cliente', 'clientes')}`)}
        {kpi('Días promedio para pagar', prom == null ? '—' : plural(prom, 'día', 'días'), 'Desde el crédito hasta el pago')}
        {kpi('Pagaron a tiempo', conFecha.length ? `${aTiempo} de ${conFecha.length}` : '—', sinFecha ? `${plural(sinFecha, 'crédito', 'créditos')} sin fecha de pago` : 'Contra la fecha en que vencía')}
        {kpi('Por medio de pago', null, total ? [...MEDIOS, 'Mixto'].filter(m => porMedio[m]).map(m => `${m} ${pesos(porMedio[m])}`).join(' · ') : 'Sin pagos en el periodo',
          total > 0 && (
            <div className="flex h-2 rounded-full overflow-hidden gap-[2px] mt-2 mb-1" role="img" aria-label={[...MEDIOS, 'Mixto'].map(m => `${m} ${pesos(porMedio[m])}`).join(', ')}>
              {[...MEDIOS, 'Mixto'].filter(m => porMedio[m]).map(m => <i key={m} style={{ width: `${(porMedio[m] / total) * 100}%`, background: COLOR_MEDIO[m] }} />)}
            </div>
          ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <select value={periodo} onChange={e => { setPeriodo(e.target.value); setRuta(''); setAbierto(null) }} aria-label="Periodo" className={sel} style={{ borderColor: C.linea, color: C.tinta }}>
          {meses.map(m => <option key={m} value={m}>{nombreMes(m)}</option>)}
          <option value="3m">Últimos 3 meses</option>
        </select>
        <input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar cliente, apto, edificio o barrio"
          className="flex-1 basis-60 min-w-0 rounded-xl px-3 min-h-[42px] text-[15px] bg-white border-2 outline-none focus:border-[#1C1B19]" style={{ borderColor: C.linea, color: C.tinta }} />
        <select value={medio} onChange={e => setMedio(e.target.value)} aria-label="Medio de pago" className={sel} style={{ borderColor: C.linea, color: C.tinta }}>
          <option value="">Todos los medios</option>
          {[...MEDIOS, 'Mixto'].map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <Exportar armar={reporte} />
      </div>
      {rutas.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {chip(!ruta, () => setRuta(''), 'Todas las rutas', 'todas')}
          {rutas.map(r => chip(ruta === r.key, () => setRuta(ruta === r.key ? '' : r.key), <>{nombreLindo(r.nombre)} <span className="opacity-70 tabular-nums">{pesos(r.total)}</span></>, r.key))}
        </div>
      )}

      <div className="bg-white rounded-[18px] px-3.5 pt-1.5 pb-1 overflow-x-auto">
        <div className="min-w-[880px]">
          <div className={'grid gap-2.5 items-center py-2.5 ' + enc} style={{ gridTemplateColumns: COLUMNAS, color: C.gris, borderBottom: `1.5px solid ${C.tinta}` }}>
            <span>Cliente</span><span>Ruta · vendedor</span><span className="text-right">Créditos</span><span className="text-right">Pagado</span><span className="text-right">Último pago</span><span className="text-right">Días</span><span>Puntualidad</span><span />
          </div>

          {cargando ? <p className="text-sm py-10 text-center" style={{ color: C.gris }}>Cargando…</p>
            : error ? <p className="text-sm py-10 text-center font-bold" style={{ color: C.rojo }}>{error}</p>
            : grupos.length === 0 ? <p className="text-sm py-10 text-center" style={{ color: C.gris }}>{creditos.length ? 'Ningún cliente coincide con los filtros.' : `No hay créditos pagados en ${rango.nombre.toLowerCase()}.`}</p>
            : grupos.map(g => {
              const abre = abierto === g.key
              const lugar = [g.cliente?.edificio, g.cliente?.apto, g.cliente?.barrio].filter(Boolean).join(' · ')
              const o = g.items[0]
              return (
                <div key={g.key}>
                  <button onClick={() => setAbierto(abre ? null : g.key)} aria-expanded={abre} className="grid gap-2.5 items-center w-full text-left min-h-[56px] hover:bg-[#F3F1EA]"
                    style={{ gridTemplateColumns: COLUMNAS, borderBottom: `1px solid ${C.linea}` }}>
                    <span className="min-w-0"><b className="block truncate text-[15px] leading-tight">{g.nombre}</b><span className="block truncate text-[12.5px]" style={{ color: C.gris }}>{lugar || ' '}</span></span>
                    <span className="min-w-0 text-[13.5px]"><b className="block truncate font-bold">{nombreLindo(origenDe(o).nombre)}</b><span className="block truncate text-[12.5px]" style={{ color: C.gris }}>{o.vendedores?.nombre || ' '}</span></span>
                    <span className="text-right tabular-nums">{g.items.length}</span>
                    <b className="text-right tabular-nums">{pesos(g.total)}</b>
                    <span className="text-right tabular-nums">{fechaCorta(g.ultimo)}</span>
                    <span className="text-right tabular-nums">{g.prom ?? '—'}</span>
                    <span><span className="text-[12px] font-extrabold px-2.5 py-[3px] rounded-full whitespace-nowrap" style={{ background: g.punt.fondo, color: g.punt.color }}>{g.punt.texto}</span></span>
                    <span aria-hidden="true" className="font-extrabold transition-transform" style={{ color: C.gris, transform: abre ? 'rotate(90deg)' : 'none' }}>›</span>
                  </button>
                  {abre && (
                    <div className="rounded-xl my-1.5 mb-2.5 px-3 py-1" style={{ background: C.fondo }}>
                      <div className={'grid gap-2.5 items-center min-h-[34px] ' + enc} style={{ gridTemplateColumns: '1.2fr 1fr 1fr 60px 1.2fr 110px', color: C.gris }}>
                        <span>Crédito</span><span>Vencía</span><span>Pagado</span><span className="text-right">Días</span><span>Medio de pago</span><span className="text-right">Valor</span>
                      </div>
                      {g.items.map(f => (
                        <div key={f.id} className="py-2 text-[13.5px]" style={{ borderTop: `1px solid ${C.linea}` }}>
                          <div className="grid gap-2.5 items-center" style={{ gridTemplateColumns: '1.2fr 1fr 1fr 60px 1.2fr 110px' }}>
                            <span><b>{fechaCorta(f.fecha_fiado)}</b>{f.es_saldo_inicial && <span style={{ color: C.gris }}> · saldo anterior</span>}</span>
                            <span>{fechaCorta(f.fecha_pago)}</span>
                            <span>{fechaCorta(f.pagado)} <span className="text-[12px] font-bold" style={{ color: f.punt.color }}>{f.punt.tarde ? `· ${f.punt.texto}` : f.punt.texto === 'Revisar fecha' ? '· revisar fecha' : ''}</span></span>
                            <span className="text-right tabular-nums">{f.dias ?? '—'}</span>
                            <span>{f.medio}</span>
                            <b className="text-right tabular-nums">{pesos(f.valor_original)}</b>
                          </div>
                          {f.abonos_cartera?.length > 1 && (
                            <div className="mt-1 flex flex-col gap-0.5 text-[12.5px]" style={{ color: C.gris }}>
                              {[...f.abonos_cartera].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')).map((a, i) => (
                                <span key={i}>Abono del {fechaCorta(a.fecha)} · {a.cuentas?.tipo === 'efectivo' ? 'Efectivo' : a.cuentas?.nombre || 'Transferencia'}{a.nota ? ` · ${a.nota}` : ''} · <b style={{ color: C.tinta }}>{pesos(a.valor)}</b></span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

          {!cargando && grupos.length > 0 && (
            <div className="grid gap-2.5 items-center py-2.5 font-extrabold" style={{ gridTemplateColumns: COLUMNAS, borderTop: `1.5px solid ${C.tinta}`, marginTop: -1 }}>
              <span>Total</span><span /><span className="text-right tabular-nums">{filtrados.length}</span><span className="text-right tabular-nums">{pesos(grupos.reduce((s, g) => s + g.total, 0))}</span><span /><span /><span /><span />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap justify-between items-center gap-2 text-[13px]" style={{ color: C.gris }}>
        <span>{plural(grupos.length, 'cliente', 'clientes')} · {rango.nombre}</span>
        <label className="flex items-center gap-1.5">Ordenar
          <select value={orden} onChange={e => setOrden(e.target.value)} className="bg-white rounded-full px-3 min-h-[36px] text-[13px] font-bold outline-none" style={{ color: C.tinta }}>
            <option value="ultimo">Último pago primero</option>
            <option value="valor">Mayor valor primero</option>
            <option value="tarde">Más tarde primero</option>
            <option value="nombre">Por nombre</option>
          </select>
        </label>
      </div>
    </div>
  )
}
