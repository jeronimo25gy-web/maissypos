'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { puedeVerModulo } from '@/lib/permisos'
import { useDestino } from '@/lib/destino'
import { PageHeader } from '@/components/ui'
import Exportar from '@/components/Exportar'
import Obligaciones from './Obligaciones'
import { cargarEmpresa, cargarResultado, cargarCaja, cargarFlujo, cargarMetas, moverPlata, guardarMeta, mesAnterior } from '@/lib/finanzas'
import CampoFecha from '@/components/CampoFecha'

// Finanzas: cuatro preguntas. ¿Cuánto ganamos? (resultado del mes con el
// costo de lo vendido), ¿dónde está la plata? (caja y bancos), ¿cómo va a estar
// la caja? (flujo y lo que viene) y ¿van a cumplir? (metas y comisiones).
// Lo de antes quedó en /finanzas-anterior.
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: 'var(--hoja)', linea: '#E3E1D8', suave: '#EFEDE6', neutro: '#E9E4D6', rojo: 'var(--rojo)', rojoF: 'var(--rojo-suave)', amarillo: 'var(--acento)', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8' }
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const tarjeta = 'bg-white rounded-[18px] p-4 min-w-0'
const $ = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n || 0)).toLocaleString('es-CO')
const nombreMes = (m) => new Date(m + '-15T12:00:00').toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
const diaCorto = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })
const PILL = { gris: [C.suave, C.gris], ambar: [C.ambarF, C.ambar], verde: [C.verdeF, C.verde], rojo: [C.rojoF, C.rojo] }
const Pill = ({ tono = 'gris', children }) => <span className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: PILL[tono][0], color: PILL[tono][1] }}>{children}</span>
const leer = (t) => { let x = String(t || '').trim(); if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.'); else x = x.replace(/\.(?=\d{3}(\D|$))/g, ''); return Number(x) }

const TABS = [['res', 'Resultado del mes'], ['caja', 'Caja y bancos'], ['flujo', 'Flujo'], ['obligaciones', 'Obligaciones'], ['metas', 'Metas y comisiones']]

export default function Finanzas() {
  const router = useRouter()
  const hoy = obtenerFechaActual()
  const [usuario, setUsuario] = useState(null)
  const [empresa, setEmpresa] = useState(null)
  const [tab, setTab] = useState('res')
  useDestino('vista', (v) => { if (TABS.some(t => t[0] === v)) setTab(v) })
  const [mes, setMes] = useState(hoy.slice(0, 7))
  const [res, setRes] = useState(null)
  const [resAnt, setResAnt] = useState(null)
  const [caja, setCaja] = useState(null)
  const [flujo, setFlujo] = useState(null)
  const [metas, setMetas] = useState(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    try {
      const emp = await cargarEmpresa()
      setEmpresa(emp)
      setRes(null); setResAnt(null); setMetas(null); setFlujo(null)
      const [r, ra, c, m] = await Promise.all([cargarResultado(mes, emp), cargarResultado(mesAnterior(mes), emp), cargarCaja(mes), cargarMetas(mes)])
      setRes(r); setResAnt(ra); setCaja(c); setMetas(m)
      setFlujo(await cargarFlujo(mes, c))
      setError('')
    } catch (e) { setError(e.message) }
  }, [mes])

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')
    if (!u) { router.push('/entrar'); return }
    if (!puedeVerModulo(u, 'financiero', ['admin'])) { router.push('/despacho'); return }
    setUsuario(u)
  }, [router])
  useEffect(() => { if (usuario) cargar() }, [usuario, cargar])

  if (!usuario) return null
  const pctRes = res && res.ventas ? res.resultado / res.ventas * 100 : null
  const pctAnt = resAnt && resAnt.ventas ? resAnt.resultado / resAnt.ventas * 100 : null

  const armarReporte = () => {
    if (!res || !caja) return null
    const secciones = [
      { titulo: 'Resultado del mes', kpis: [
        { rotulo: 'Ventas', valor: $(res.ventas), valorNumero: res.ventas, nota: `Rutas ${$(res.rutas)} · mostrador ${$(res.mostrador)}` },
        { rotulo: 'Resultado', valor: $(res.resultado), valorNumero: res.resultado, nota: pctRes != null ? `${pctRes < 0 ? '−' : ''}${Math.abs(pctRes).toLocaleString('es-CO', { maximumFractionDigits: 1 })}% de las ventas` : '' },
        { rotulo: 'Mes anterior', valor: resAnt ? $(resAnt.resultado) : '—', valorNumero: resAnt?.resultado, nota: pctAnt != null ? `${pctAnt < 0 ? '−' : ''}${Math.abs(pctAnt).toLocaleString('es-CO', { maximumFractionDigits: 1 })}% de las ventas` : '' },
      ], cascada: cascadaDe(res), nota: `${res.costo.nota}${res.costo.incompleto ? ' (incompleto: faltan costos de algunos productos)' : ''}. Las ventas entre empresas del grupo cuentan como ventas de cada empresa.` },
      { titulo: 'Gastos del mes', tabla: { columnas: [{ titulo: 'Tipo' }, { titulo: 'Categoría' }, { titulo: 'Valor', tipo: 'pesos' }],
        filas: [...res.gastosRuta.map(([k, v]) => ['Ruta', k, v]), ...res.planta.map(([k, v]) => ['Planta', k, v]), ...res.admin.map(([k, v]) => ['Administrativo', k, v]), ...(res.nominaPagada ? [['Nómina', 'Pagos del mes', res.nominaPagada]] : []), ...(res.prestaciones ? [['Nómina', 'Aportes y prestaciones', res.prestaciones]] : [])] } },
      { titulo: 'Caja y bancos', kpis: [{ rotulo: 'Total', valor: $(caja.total), valorNumero: caja.total }, { rotulo: 'Efectivo', valor: $(caja.efectivo), valorNumero: caja.efectivo }, { rotulo: 'Bancos', valor: $(caja.bancos), valorNumero: caja.bancos }],
        tabla: { columnas: [{ titulo: 'Cuenta' }, { titulo: 'Tipo' }, { titulo: 'Saldo', tipo: 'pesos' }], filas: caja.cuentas.map(c => [c.nombre, c.tipo === 'efectivo' ? 'Efectivo' : 'Banco', c.saldo]), total: ['Total', '', caja.total] } },
      ...(flujo?.viene?.length ? [{ titulo: 'Próximos 30 días', tabla: { columnas: [{ titulo: 'Fecha' }, { titulo: 'Concepto' }, { titulo: 'Valor', tipo: 'pesos' }, { titulo: 'Caja después', tipo: 'pesos' }],
        filas: flujo.viene.map(v => [diaCorto(v.fecha), `${v.titulo}${v.estimado ? ' (estimado)' : ''}`, v.valor, v.saldo]) } }] : []),
      ...(metas?.filas?.some(f => f.meta) ? [{ titulo: 'Metas por ruta', tabla: { columnas: [{ titulo: 'Ruta' }, { titulo: 'Vendedor' }, { titulo: 'Meta', tipo: 'pesos' }, { titulo: 'Vendido', tipo: 'pesos' }, { titulo: 'Cumplido', tipo: 'pct' }],
        filas: metas.filas.filter(f => f.meta).map(f => [f.ruta.nombre, f.vendedor || '', f.meta, f.vendido, f.pct]) } }] : []),
    ]
    return { titulo: 'Finanzas del mes', empresa: empresa?.nombre, logo: empresa?.logo_url, periodo: nombreMes(mes).replace(/^./, c => c.toUpperCase()), secciones }
  }

  return (
    <div style={{ background: C.fondo, color: C.tinta }} className="min-h-screen">
      <PageHeader title="Finanzas" subtitle={empresa ? `${empresa.nombre} · ${nombreMes(mes)}` : ''}
        actions={<Exportar armar={armarReporte} />} />
      <div className="p-4 max-w-6xl mx-auto flex flex-col gap-4">
        {error && <div className="rounded-2xl px-4 py-3 text-sm font-bold" style={{ background: C.rojoF, color: C.rojo }}>No se pudo cargar: {error}</div>}

        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
          <Kpi rotulo="Caja y bancos hoy" valor={caja ? $(caja.total) : '…'} nota={caja ? `Efectivo ${$(caja.efectivo)} · bancos ${$(caja.bancos)}` : ''} />
          <Kpi rotulo="Resultado del mes" valor={res ? $(res.resultado) : '…'} color={res && res.resultado < 0 ? C.rojo : null} nota={res ? `${pctRes != null ? pctRes.toFixed(1).replace('.', ',') + '% de las ventas' : 'Sin ventas'}${pctAnt != null ? ` · el mes pasado ${pctAnt.toFixed(1).replace('.', ',')}%` : ''}` : ''} />
          <Kpi rotulo="Próximos 30 días" valor={flujo ? $(flujo.viene.reduce((s, v) => s + v.valor, 0)) : '…'} nota={flujo ? (flujo.primeroNegativo ? <b style={{ color: C.rojo }}>La caja no alcanza el {diaCorto(flujo.primeroNegativo.fecha)}</b> : 'La caja alcanza') : ''} />
          <Kpi rotulo="Transferencias por verificar" valor={caja ? caja.porVerificar.n : '…'} color={caja?.porVerificar.n ? C.ambar : null} nota={caja ? (caja.porVerificar.n ? `${$(caja.porVerificar.valor)} de las rutas` : 'Ninguna') : ''} />
        </div>

        <div className="flex gap-3 items-center flex-wrap justify-between">
          <div className="flex gap-1 bg-white rounded-full p-1 w-max max-w-full overflow-x-auto" role="tablist">
            {TABS.map(([id, n]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="rounded-full min-h-[40px] px-4 text-sm font-bold whitespace-nowrap"
                style={tab === id ? { background: C.tinta, color: '#fff' } : { color: C.gris }}>{n}</button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm font-bold">Mes
            <input type="month" value={mes} max={hoy.slice(0, 7)} onChange={e => e.target.value && setMes(e.target.value)} className="h-10 rounded-xl border-2 px-2 bg-white" style={{ borderColor: C.linea }} />
          </label>
        </div>

        {tab === 'res' && <Resultado res={res} resAnt={resAnt} mes={mes} />}
        {tab === 'caja' && <Caja caja={caja} usuario={usuario} recargar={cargar} />}
        {tab === 'flujo' && <Flujo flujo={flujo} caja={caja} mes={mes} />}
        {tab === 'obligaciones' && <Obligaciones caja={caja} usuario={usuario} recargar={cargar} />}
        {tab === 'metas' && <Metas metas={metas} mes={mes} recargar={cargar} />}
      </div>
    </div>
  )
}

const cascadaDe = (r) => [
  { rotulo: 'Ventas', valor: r.ventas, tipo: 'base' },
  { rotulo: 'Costo de lo vendido', valor: -r.costo.valor, tipo: 'resta' },
  { rotulo: 'Margen sobre la mercancía', valor: r.ventas - r.costo.valor, tipo: 'sub' },
  ...(r.gastosRuta.length ? [{ rotulo: 'Gastos de ruta', valor: -r.gastosRuta.reduce((s, [, v]) => s + v, 0), tipo: 'resta' }] : []),
  ...(r.nomina ? [{ rotulo: 'Nómina', valor: -r.nomina, tipo: 'resta' }] : []),
  ...(r.planta.length ? [{ rotulo: 'Servicios y gastos de planta', valor: -r.planta.reduce((s, [, v]) => s + v, 0), tipo: 'resta' }] : []),
  ...(r.admin.length ? [{ rotulo: 'Gastos administrativos', valor: -r.admin.reduce((s, [, v]) => s + v, 0), tipo: 'resta' }] : []),
  ...(r.financieros ? [{ rotulo: 'Intereses de obligaciones', valor: -r.financieros, tipo: 'resta' }] : []),
  { rotulo: 'Resultado', valor: r.resultado, tipo: 'total' },
]

function Kpi({ rotulo, valor, nota, color }) {
  return (
    <div className="bg-white rounded-[18px] p-4 flex flex-col gap-0.5 min-w-0">
      <span className="text-[13px] font-bold" style={{ color: C.gris }}>{rotulo}</span>
      <span className="cifra-caja"><span className="cifra font-extrabold tabular-nums" style={{ ...titulo, color: color || C.tinta, '--cifra-max': '26px' }}>{valor}</span></span>
      <span className="text-[13px]" style={{ color: C.gris }}>{nota}</span>
    </div>
  )
}

function Resultado({ res, resAnt }) {
  if (!res) return <p className="text-center py-16" style={{ color: C.gris }}>Cargando…</p>
  const pasos = cascadaDe(res)
  const ant = resAnt ? Object.fromEntries(cascadaDe(resAnt).map(p => [p.rotulo, p.valor])) : {}
  const max = Math.max(...pasos.map(p => Math.abs(p.valor)), 1)
  let corre = 0
  const gasolina = (l) => l.find(([k]) => /gasolina/i.test(k))?.[1] || 0
  const gas = gasolina(res.gastosRuta), gasAnt = resAnt ? gasolina(resAnt.gastosRuta) : 0
  const avisos = []
  if (gas && gasAnt && res.ventas && resAnt?.ventas && (gas / res.ventas) > (gasAnt / resAnt.ventas) * 1.1) avisos.push(['ambar', `La gasolina pesa más que el mes pasado: ${(gas / res.ventas * 100).toFixed(1).replace('.', ',')}% de las ventas contra ${(gasAnt / resAnt.ventas * 100).toFixed(1).replace('.', ',')}%.`])
  if (res.costo.incompleto) avisos.push(['ambar', 'El costo de lo vendido está incompleto: hay productos sin costo de compra o sin datos en Costos. El resultado real es un poco menor.'])
  if (!res.nominaPagos) avisos.push(['ambar', 'Este mes no hay pagos de nómina registrados; el resultado no la incluye.'])

  return (
    <div className="flex flex-col gap-3">
      <div className={tarjeta + ' flex flex-col gap-2.5'}>
        <div className="flex justify-between items-baseline gap-2 flex-wrap"><h3 className="text-[17px] font-extrabold" style={titulo}>Estado de resultados</h3><span className="text-[13px]" style={{ color: C.gris }}>Gris: mes anterior</span></div>
        {pasos.map((p, i) => {
          let izq, ancho, color
          if (p.tipo === 'resta') { corre += p.valor; izq = Math.max(0, corre); ancho = Math.abs(p.valor); color = C.rojo }
          else { corre = p.valor; izq = Math.min(0, p.valor); ancho = Math.abs(p.valor); color = p.tipo === 'total' ? (p.valor >= 0 ? C.verde : C.rojo) : C.neutro }
          return (
            <div key={i} className={`grid items-center gap-2.5 text-sm grid-cols-[120px_minmax(0,1fr)_100px] md:grid-cols-[200px_minmax(0,1fr)_120px_100px] ${p.tipo === 'total' ? 'border-t-[1.5px] pt-2 mt-0.5' : ''}`} style={{ borderColor: C.tinta }}>
              <span className={p.tipo !== 'resta' ? 'font-bold' : ''}>{p.rotulo}</span>
              <span className="relative h-5"><i className="absolute top-0 bottom-0 rounded" style={{ left: `${izq / max * 100}%`, width: `${Math.max(0.4, ancho / max * 100)}%`, background: color }} /></span>
              <span className="text-right font-extrabold tabular-nums" style={{ color: p.valor < 0 ? C.rojo : C.tinta }}>{$(p.valor)}</span>
              <span className="hidden md:block text-right text-[12.5px] tabular-nums" style={{ color: C.gris }}>{ant[p.rotulo] != null ? $(ant[p.rotulo]) : '—'}</span>
            </div>
          )
        })}
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start">
        <div className={tarjeta + ' flex flex-col'}>
          <h3 className="text-[17px] font-extrabold pb-1" style={titulo}>Gastos del mes por categoría</h3>
          {[...res.gastosRuta.map(([k, v]) => ['Ruta', k, v]), ...res.planta.map(([k, v]) => ['Planta', k, v]), ...res.admin.map(([k, v]) => ['Admin.', k, v]), ...(res.nominaPagada ? [['Nómina', 'Pagos del mes', res.nominaPagada]] : []), ...(res.prestaciones ? [['Nómina', 'Aportes y prestaciones', res.prestaciones]] : [])]
            .map(([t, k, v], i) => (
              <div key={i} className="grid gap-2.5 items-center py-2 border-t first:border-t-0 text-sm" style={{ borderColor: C.linea, gridTemplateColumns: '64px minmax(0,1fr) auto' }}>
                <span className="text-[12.5px]" style={{ color: C.gris }}>{t}</span><span>{k}</span><b className="tabular-nums">{$(v)}</b>
              </div>
            ))}
          {!res.gastosRuta.length && !res.planta.length && !res.admin.length && !res.nomina && <p className="text-sm py-2" style={{ color: C.gris }}>Sin gastos registrados este mes.</p>}
        </div>
        <div className={tarjeta + ' flex flex-col gap-2'}>
          <h3 className="text-[17px] font-extrabold" style={titulo}>Resumen</h3>
          {avisos.map(([t, x], i) => <div key={i} className="rounded-xl px-3 py-2.5 text-[13.5px]" style={{ background: PILL[t][0], color: t === 'gris' ? C.tinta : PILL[t][1] }}>{x}</div>)}
          <Link href="/costeo" className="text-sm font-bold underline underline-offset-4">Ver la utilidad por ruta y por producto en Costos</Link>
        </div>
      </div>
    </div>
  )
}

function Caja({ caja, usuario, recargar }) {
  const [filtro, setFiltro] = useState('todas')
  const [mover, setMover] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  if (!caja) return <p className="text-center py-16" style={{ color: C.gris }}>Cargando…</p>
  const nombre = (id) => caja.cuentas.find(c => c.id === id)?.nombre || 'Sin cuenta'
  const movs = caja.movimientosMes.filter(m => filtro === 'todas' || (filtro === 'efectivo' ? caja.cuentas.find(c => c.id === m.cuenta_id)?.tipo === 'efectivo' : caja.cuentas.find(c => c.id === m.cuenta_id)?.tipo !== 'efectivo')).slice(0, 60)
  const guardar = async () => {
    const monto = leer(mover.monto)
    if (!mover.origen || !mover.destino || mover.origen === mover.destino || !(monto > 0)) { setMover({ ...mover, error: '' }); return }
    setOcupado(true)
    try { await moverPlata({ origen: mover.origen, destino: mover.destino, monto, fecha: mover.fecha, usuario: usuario.nombre, nombreOrigen: nombre(mover.origen), nombreDestino: nombre(mover.destino) }); setMover(null); await recargar() }
    catch (e) { setMover({ ...mover, error: 'No se pudo guardar: ' + e.message }) }
    setOcupado(false)
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {caja.cuentas.map(c => (
          <div key={c.id} className={tarjeta + ' flex flex-col gap-1'}>
            <span className="text-xs font-extrabold uppercase tracking-wider truncate" style={{ color: C.gris }}>{c.nombre}{c.banco ? ` · ${c.banco}` : ''}</span>
            <span className="cifra-caja"><span className="cifra font-extrabold tabular-nums" style={{ ...titulo, color: c.saldo < 0 ? C.rojo : C.tinta, '--cifra-max': '26px' }}>{$(c.saldo)}</span></span>
            <span className="text-[13px] truncate" style={{ color: C.gris }}>{c.ultimo ? `Último: ${c.ultimo.concepto || (c.ultimo.tipo === 'entrada' ? 'entrada' : 'salida')} · ${diaCorto(c.ultimo.fecha)}` : 'Sin movimientos'}</span>
          </div>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start">
        <div className={tarjeta + ' flex flex-col gap-2'}>
          <div className="flex justify-between items-center gap-2 flex-wrap"><h3 className="text-[17px] font-extrabold" style={titulo}>Movimientos del mes</h3>
            <div className="flex gap-2">{[['todas', 'Todas'], ['efectivo', 'Efectivo'], ['bancos', 'Bancos']].map(([id, n]) => <Chip key={id} sel={filtro === id} onClick={() => setFiltro(id)}>{n}</Chip>)}</div></div>
          {movs.length === 0 ? <p className="text-sm py-2" style={{ color: C.gris }}>Sin movimientos.</p> : movs.map(m => (
            <div key={m.id} className="grid gap-2.5 items-center py-2 border-t first:border-t-0 text-sm" style={{ borderColor: C.linea, gridTemplateColumns: '70px minmax(0,1fr) auto' }}>
              <span className="text-[12.5px]" style={{ color: C.gris }}>{new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}</span>
              <span className="min-w-0"><b className="block truncate">{m.concepto || (m.tipo === 'entrada' ? 'Entrada' : 'Salida')}</b><span className="text-[12.5px]" style={{ color: C.gris }}>{nombre(m.cuenta_id)}{m.referencia_tipo === 'traslado' ? ' · traslado' : ''}</span></span>
              <b className="tabular-nums" style={{ color: m.referencia_tipo === 'traslado' ? C.tinta : m.tipo === 'entrada' ? C.verde : C.rojo }}>{m.tipo === 'entrada' ? '+' : '−'}{$(m.monto)}</b>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <div className={tarjeta + ' flex flex-col gap-2.5'}>
            <h3 className="text-[17px] font-extrabold" style={titulo}>Traslado entre cuentas</h3>
            {!mover ? <button type="button" onClick={() => setMover({ origen: caja.cuentas.find(c => c.tipo === 'efectivo')?.id || '', destino: '', monto: '', fecha: obtenerFechaActual() })} className="rounded-xl min-h-[42px] font-bold" style={{ background: C.suave }}>Registrar traslado</button> : (
              <div className="flex flex-col gap-2.5">
                <div className="grid gap-2 grid-cols-2">
                  <Sel etiqueta="Sale de" v={mover.origen} on={v => setMover({ ...mover, origen: v })} cuentas={caja.cuentas} />
                  <Sel etiqueta="Entra a" v={mover.destino} on={v => setMover({ ...mover, destino: v })} cuentas={caja.cuentas} />
                </div>
                <div className="grid gap-2 grid-cols-2">
                  <label className="flex flex-col gap-1 text-sm font-bold">Cuánto<input inputMode="numeric" value={mover.monto} onChange={e => setMover({ ...mover, monto: e.target.value })} placeholder="0" className="h-11 rounded-xl border-2 px-3 bg-white" style={{ borderColor: C.linea }} /></label>
                  <label className="flex flex-col gap-1 text-sm font-bold">Fecha<CampoFecha value={mover.fecha} onChange={e => setMover({ ...mover, fecha: e.target.value })} className="h-11 rounded-xl border-2 px-3 bg-white" style={{ borderColor: C.linea }} /></label>
                </div>
                {mover.error && <p className="text-sm font-bold" style={{ color: C.rojo }}>{mover.error}</p>}
                <div className="flex gap-2 justify-end"><button type="button" onClick={() => setMover(null)} className="rounded-xl min-h-[42px] px-4 font-bold" style={{ background: C.suave }}>Cancelar</button>
                  <button type="button" disabled={ocupado} onClick={guardar} className="rounded-xl min-h-[42px] px-4 font-bold text-white disabled:opacity-50" style={{ background: 'var(--primario)' }}>Mover</button></div>
              </div>
            )}
          </div>
          {caja.porVerificar.n > 0 && (
            <Link href="/cartera" className="rounded-2xl px-4 py-3 text-[13.5px]" style={{ background: C.ambarF, color: C.ambar }}>
              <b>{caja.porVerificar.n} {caja.porVerificar.n === 1 ? 'transferencia de ruta por verificar' : 'transferencias de rutas por verificar'}</b> · {$(caja.porVerificar.valor)}. Si no llegan a la fecha límite, se decide en Cartera si se le cargan al vendedor.
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function Flujo({ flujo, caja, mes }) {
  if (!flujo || !caja) return <p className="text-center py-16" style={{ color: C.gris }}>Cargando…</p>
  const top = Math.max(1, ...flujo.semanas.flatMap(s => [s.entra, s.sale]))
  const mesTxt = new Date(mes + '-15T12:00:00').toLocaleDateString('es-CO', { month: 'short' }).replace('.', '')
  return (
    <div className="flex flex-col gap-3">
      <div className={tarjeta + ' flex flex-col gap-2.5'}>
        <div className="flex justify-between items-baseline gap-2 flex-wrap"><h3 className="text-[17px] font-extrabold" style={titulo}>Ingresos y egresos por semana</h3><span className="text-[13px]" style={{ color: C.gris }}>Verde entra · rojo sale</span></div>
        <div className="grid gap-2 grid-cols-2 md:grid-cols-5">
          {flujo.semanas.map(s => (
            <div key={s.desde} className="rounded-2xl p-2.5 flex flex-col gap-1.5" style={{ background: C.fondo }}>
              <span className="text-[13px] font-bold">{s.desde} al {s.hasta} {mesTxt}</span>
              <div className="flex items-end gap-1.5 h-24" role="img" aria-label={`Entra ${$(s.entra)}, sale ${$(s.sale)}`}>
                <i className="flex-1 rounded-t-md" style={{ height: `${Math.max(2, s.entra / top * 100)}%`, background: C.verde }} />
                <i className="flex-1 rounded-t-md" style={{ height: `${Math.max(2, s.sale / top * 100)}%`, background: C.rojo }} />
              </div>
              <span className="text-[12px] tabular-nums"><b style={{ color: C.verde }}>+{$(s.entra)}</b><br /><b style={{ color: C.rojo }}>−{$(s.sale)}</b></span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start">
        <div className={tarjeta + ' flex flex-col'}>
          <div className="flex justify-between items-baseline gap-2 pb-1"><h3 className="text-[17px] font-extrabold" style={titulo}>Próximos 30 días</h3><span className="text-[13px]" style={{ color: C.gris }}>Con fecha real</span></div>
          {flujo.viene.length === 0 ? <p className="text-sm py-2" style={{ color: C.gris }}>Nada con fecha en los próximos 30 días.</p> : flujo.viene.map((v, i) => (
            <div key={i} className="grid gap-2.5 items-center py-2 border-t first:border-t-0 text-sm" style={{ borderColor: C.linea, gridTemplateColumns: '84px minmax(0,1fr) auto' }}>
              <span className="text-[12.5px]" style={{ color: v.vencido ? C.rojo : C.gris }}>{diaCorto(v.fecha)}</span>
              <span className="min-w-0"><b className="block truncate">{v.titulo}</b><span className="text-[12.5px]" style={{ color: C.gris }}>{v.detalle}</span></span>
              <span className="text-right tabular-nums"><b style={{ color: v.valor < 0 ? C.rojo : C.verde }}>{v.valor < 0 ? '' : '+'}{$(v.valor)}</b><span className="block text-[11.5px]" style={{ color: v.saldo < 0 ? C.rojo : C.gris }}>caja {$(v.saldo)}</span></span>
            </div>
          ))}
        </div>
        <div className={tarjeta + ' flex flex-col gap-2'}>
          <h3 className="text-[17px] font-extrabold" style={titulo}>Cómo queda la caja</h3>
          <span className="cifra-caja"><span className="cifra font-extrabold tabular-nums" style={{ ...titulo, color: flujo.saldoFinal < 0 ? C.rojo : C.tinta, '--cifra-max': '28px' }}>{$(flujo.saldoFinal)}</span></span>
          {flujo.primeroNegativo
            ? <Pill tono="rojo">Faltan {$(-flujo.primeroNegativo.saldo)} el {diaCorto(flujo.primeroNegativo.fecha)}</Pill>
            : <Pill tono="verde">Alcanza en los próximos 30 días</Pill>}
        </div>
      </div>
    </div>
  )
}

function Metas({ metas, mes, recargar }) {
  const [editando, setEditando] = useState(null) // { rutaId, valor, metaId }
  const [ocupado, setOcupado] = useState(false)
  const [nuevoTramo, setNuevoTramo] = useState(null)
  if (!metas) return <p className="text-center py-16" style={{ color: C.gris }}>Cargando…</p>
  const guardar = async () => {
    const v = leer(editando.valor)
    if (!(v > 0)) return
    setOcupado(true)
    try { await guardarMeta(mes, editando.rutaId, v, editando.metaId); setEditando(null); await recargar() } catch (e) { alert('No se pudo guardar: ' + e.message) }
    setOcupado(false)
  }
  const guardarTramo = async () => {
    const t = nuevoTramo
    const min = Number(t.min), max = t.max === '' ? null : Number(t.max), pct = Number(String(t.pct).replace(',', '.'))
    if (!(min >= 0) || !(pct >= 0) || (max != null && !(max > min))) { setNuevoTramo({ ...t, error: 'Revisa los números del tramo.' }); return }
    setOcupado(true)
    const { error } = await supabase.from('config_comisiones').insert({ empresa_id: getEmpresaId(), meta_pct_min: min, meta_pct_max: max, comision_pct: pct })
    setOcupado(false)
    if (error) { setNuevoTramo({ ...t, error: error.message }); return }
    setNuevoTramo(null); recargar()
  }
  const quitarTramo = async (id) => { await supabase.from('config_comisiones').delete().eq('id', id).eq('empresa_id', getEmpresaId()); recargar() }
  const ESTADO = { al_dia: ['Al día', 'verde'], atras: ['Un poco atrás', 'ambar'], muy_atras: ['Atrás', 'rojo'] }

  return (
    <div className="flex flex-col gap-3">
      <div className={tarjeta + ' flex flex-col'}>
        <div className="flex justify-between items-baseline gap-2 flex-wrap pb-1"><h3 className="text-[17px] font-extrabold" style={titulo}>Metas por ruta</h3><span className="text-[13px]" style={{ color: C.gris }}>{metas.transcurridos} de {metas.dias} días</span></div>
        {metas.filas.map(f => (
          <div key={f.ruta.id} className="grid gap-3 items-center py-3 border-t first:border-t-0 text-sm grid-cols-2 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_130px_150px]" style={{ borderColor: C.linea }}>
            <span><b>{f.ruta.nombre}</b><br /><span className="text-[12.5px]" style={{ color: C.gris }}>{f.vendedor || 'Sin vendedor'}</span></span>
            {editando?.rutaId === f.ruta.id ? (
              <span className="flex gap-2 col-span-2 md:col-span-3">
                <input autoFocus inputMode="numeric" value={editando.valor} onChange={e => setEditando({ ...editando, valor: e.target.value })} placeholder="Meta del mes" className="flex-1 min-w-0 h-10 rounded-xl border-2 px-3 bg-white" style={{ borderColor: C.linea }} />
                <button type="button" onClick={() => setEditando(null)} className="rounded-xl px-3 font-bold" style={{ background: C.suave }}>Cancelar</button>
                <button type="button" disabled={ocupado} onClick={guardar} className="rounded-xl px-3 font-bold text-white" style={{ background: 'var(--primario)' }}>Guardar</button>
              </span>
            ) : f.meta ? (
              <>
                <span className="relative h-3 rounded-full" style={{ background: C.suave }} role="img" aria-label={`${Math.round(f.pct)}% de la meta; debería ir en ${Math.round(f.ritmo)}%`}>
                  <i className="absolute left-0 top-0 bottom-0 rounded-full" style={{ width: `${Math.min(100, f.pct)}%`, background: C.amarillo }} />
                  <b className="absolute -top-1 -bottom-1 w-0.5" style={{ left: `${Math.min(100, f.ritmo)}%`, background: C.tinta }} />
                </span>
                <span className="tabular-nums"><b>{$(f.vendido)}</b><br /><button type="button" onClick={() => setEditando({ rutaId: f.ruta.id, valor: String(f.meta), metaId: f.metaId })} className="text-[12.5px] underline" style={{ color: C.gris }}>de {$(f.meta)}</button></span>
                <span><Pill tono={ESTADO[f.estado][1]}>{ESTADO[f.estado][0]} · {Math.round(f.pct)}%</Pill><br /><span className="text-[12.5px]" style={{ color: C.gris }}>{f.comision != null ? `Comisión: ${String(f.comision).replace('.', ',')}%` : metas.tramos.length ? 'Sin comisión aún' : 'Comisión sin configurar'}</span></span>
              </>
            ) : (
              <>
                <span className="text-[13px]" style={{ color: C.gris }}>Sin meta</span>
                <span className="tabular-nums"><b>{$(f.vendido)}</b></span>
                <span><button type="button" onClick={() => setEditando({ rutaId: f.ruta.id, valor: '', metaId: null })} className="rounded-xl min-h-[36px] px-3 font-bold" style={{ background: C.suave }}>Poner meta</button></span>
              </>
            )}
          </div>
        ))}
      </div>
      <div className={tarjeta + ' flex flex-col gap-2'}>
        <div className="flex justify-between items-baseline gap-2 flex-wrap"><h3 className="text-[17px] font-extrabold" style={titulo}>Cómo se gana la comisión</h3><span className="text-[13px]" style={{ color: C.gris }}>{metas.tramos.length ? `${metas.tramos.length} ${metas.tramos.length === 1 ? 'tramo' : 'tramos'}` : 'Sin configurar todavía'}</span></div>
        {metas.tramos.map(t => (
          <div key={t.id} className="flex items-center gap-3 py-2 border-t text-sm" style={{ borderColor: C.linea }}>
            <span className="flex-1">De <b>{t.meta_pct_min}%</b> {t.meta_pct_max != null ? <>a <b>{t.meta_pct_max}%</b></> : 'en adelante'} de la meta</span>
            <b>{String(t.comision_pct).replace('.', ',')}%</b>
            <button type="button" onClick={() => quitarTramo(t.id)} className="text-xs font-bold underline" style={{ color: C.gris }}>Quitar</button>
          </div>
        ))}
        {!nuevoTramo ? <button type="button" onClick={() => setNuevoTramo({ min: '', max: '', pct: '' })} className="rounded-xl min-h-[40px] px-4 font-bold w-max" style={{ background: C.suave }}>Agregar tramo</button> : (
          <div className="flex flex-col gap-2">
            <div className="grid gap-2 grid-cols-3">
              <label className="flex flex-col gap-1 text-[13px] font-bold">Desde %<input inputMode="numeric" value={nuevoTramo.min} onChange={e => setNuevoTramo({ ...nuevoTramo, min: e.target.value })} className="h-10 rounded-xl border-2 px-3 bg-white" style={{ borderColor: C.linea }} /></label>
              <label className="flex flex-col gap-1 text-[13px] font-bold">Hasta % (vacío = en adelante)<input inputMode="numeric" value={nuevoTramo.max} onChange={e => setNuevoTramo({ ...nuevoTramo, max: e.target.value })} className="h-10 rounded-xl border-2 px-3 bg-white" style={{ borderColor: C.linea }} /></label>
              <label className="flex flex-col gap-1 text-[13px] font-bold">Comisión %<input inputMode="decimal" value={nuevoTramo.pct} onChange={e => setNuevoTramo({ ...nuevoTramo, pct: e.target.value })} className="h-10 rounded-xl border-2 px-3 bg-white" style={{ borderColor: C.linea }} /></label>
            </div>
            {nuevoTramo.error && <p className="text-sm font-bold" style={{ color: C.rojo }}>{nuevoTramo.error}</p>}
            <div className="flex gap-2 justify-end"><button type="button" onClick={() => setNuevoTramo(null)} className="rounded-xl min-h-[40px] px-4 font-bold" style={{ background: C.suave }}>Cancelar</button>
              <button type="button" disabled={ocupado} onClick={guardarTramo} className="rounded-xl min-h-[40px] px-4 font-bold text-white" style={{ background: 'var(--primario)' }}>Guardar tramo</button></div>
          </div>
        )}
      </div>
    </div>
  )
}

const Chip = ({ sel, onClick, children }) => (
  <button type="button" onClick={onClick} className="rounded-full min-h-[36px] px-3 text-[13px] font-bold" style={sel ? { background: '#fff', boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: C.suave }}>{children}</button>
)
const Sel = ({ etiqueta, v, on, cuentas }) => (
  <label className="flex flex-col gap-1 text-sm font-bold">{etiqueta}
    <select value={v} onChange={e => on(e.target.value)} className="h-11 rounded-xl border-2 px-2 bg-white font-semibold" style={{ borderColor: C.linea }}>
      <option value="">Escoge</option>{cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
    </select>
  </label>
)
