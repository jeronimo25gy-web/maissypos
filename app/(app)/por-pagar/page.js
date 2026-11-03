'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { puedeVerModulo } from '@/lib/permisos'
import { PageHeader } from '@/components/ui'
import { cargarCuentasPorPagar, TIPOS_POR_PAGAR } from '@/lib/cuentas-por-pagar'

// Por pagar: el espejo de Cartera. Una tarjeta por cada a quien se le debe
// (proveedor, crédito, nómina, gasto fijo u otra empresa del grupo), con su
// estado y el botón para pagar en su módulo; al pagar allá sale de aquí.
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: 'var(--hoja)', linea: '#E3E1D8', suave: '#EFEDE6', rojo: 'var(--rojo)', rojoF: 'var(--rojo-suave)', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8' }
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const COLOR_TIPO = { proveedores: '#1C1B19', nomina: '#F2B21B', obligaciones: '#8A5A00', gastos: '#8C877C', empresas: '#2E5E3A' }
const BOTON = { proveedores: 'Pagar en Compras', obligaciones: 'Pagar cuota', nomina: 'Liquidar en Nómina', gastos: 'Registrar en Gastos' }
const pesos = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO')
const sumar = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }
const fechaCorta = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }).replace('.', '')
const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5)
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`
const input = 'w-full min-h-[44px] rounded-xl px-3 text-[15px] bg-white border-[1.5px] outline-none'

const estadoDe = (dias) => dias < 0 ? { texto: `Vencido hace ${plural(-dias, 'día', 'días')}`, color: C.rojo, fondo: C.rojoF }
  : dias === 0 ? { texto: 'Vence hoy', color: C.rojo, fondo: C.rojoF }
  : dias <= 7 ? { texto: `Vence en ${plural(dias, 'día', 'días')}`, color: C.ambar, fondo: C.ambarF }
  : { texto: `Vence el ${fechaCorta(sumar(obtenerFechaActual(), dias))}`, color: C.gris, fondo: C.suave }

export default function PorPagar() {
  const router = useRouter()
  const hoy = obtenerFechaActual()
  const [usuario, setUsuario] = useState(null)
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const [periodo, setPeriodo] = useState('mes')
  const [tipo, setTipo] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState(null)

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')
    if (!u) { router.push('/entrar'); return }
    if (!puedeVerModulo(u, 'por-pagar', ['admin'])) { router.push('/despacho'); return }
    setUsuario(u)
    cargarCuentasPorPagar(getEmpresaId(), hoy).then(setLista).catch(e => setError(e.message))
  }, [router, hoy])

  if (!usuario) return null
  const finMes = `${hoy.slice(0, 7)}-31`, semana = sumar(hoy, 7)
  const delPeriodo = (lista || []).filter(x => periodo === 'año' || x.fecha <= finMes)
  const suma = (l) => l.reduce((s, x) => s + x.valor, 0)
  const vencido = delPeriodo.filter(x => x.fecha < hoy)
  const estaSemana = delPeriodo.filter(x => x.fecha >= hoy && x.fecha <= semana)
  const proximo = delPeriodo.find(x => x.fecha >= hoy)

  // Una tarjeta por acreedor, con su peor fecha.
  const porAcreedor = {}
  delPeriodo.forEach(x => {
    const k = `${x.tipo}|${x.acreedor}`
    const g = (porAcreedor[k] = porAcreedor[k] || { key: k, tipo: x.tipo, nombre: x.acreedor, items: [], total: 0 })
    g.items.push(x); g.total += x.valor
  })
  const q = busqueda.trim().toLowerCase()
  let grupos = Object.values(porAcreedor).map(g => ({ ...g, peor: Math.min(...g.items.map(x => diasEntre(hoy, x.fecha))), estimado: g.items.some(x => x.estimado) }))
    .filter(g => (!tipo || g.tipo === tipo) && (!q || g.nombre.toLowerCase().includes(q)))
  if (estadoFiltro === 'vencidos') grupos = grupos.filter(g => g.peor < 0)
  if (estadoFiltro === 'semana') grupos = grupos.filter(g => g.peor >= 0 && g.peor <= 7)
  grupos.sort((a, b) => a.peor - b.peor || b.total - a.total)

  const porTipo = Object.keys(TIPOS_POR_PAGAR).map(k => ({ k, v: suma(delPeriodo.filter(x => x.tipo === k)) })).filter(t => t.v > 0)
  const total = suma(delPeriodo) || 1

  const chip = (activo, onClick, contenido, key) => (
    <button key={key} type="button" onClick={onClick} aria-pressed={activo} className="shrink-0 px-3 min-h-[36px] rounded-full text-[13px] font-bold whitespace-nowrap"
      style={activo ? { background: '#fff', color: C.tinta, boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: '#fff', color: C.gris }}>{contenido}</button>
  )
  const kpi = (et, va, sub, color) => (
    <div className="bg-white rounded-[18px] p-3.5 flex flex-col gap-0.5 min-w-0">
      <span className="text-[12.5px] font-bold" style={{ color: C.gris }}>{et}</span>
      <span className="font-extrabold text-[24px] tabular-nums leading-tight" style={{ ...titulo, color: color || C.tinta }}>{va}</span>
      {sub && <span className="text-[12.5px] truncate" style={{ color: C.gris }}>{sub}</span>}
    </div>
  )

  const tarjeta = (g) => {
    const abiertoEste = abierto === g.key || g.items.length === 1
    const est = estadoDe(g.peor)
    const href = g.items.find(x => x.href)?.href
    return (
      <article key={g.key} className="bg-white rounded-[18px] p-3.5 flex flex-col gap-2 min-w-0">
        <button type="button" onClick={() => setAbierto(abierto === g.key ? null : g.key)} className="flex items-start gap-3 text-left w-full">
          <i className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: COLOR_TIPO[g.tipo] }} aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <h3 className="font-extrabold text-[17px] leading-tight" style={titulo}>{g.nombre}</h3>
            <p className="text-[12.5px] truncate" style={{ color: C.gris }}>{[TIPOS_POR_PAGAR[g.tipo], g.items.length > 1 ? plural(g.items.length, 'pago', 'pagos') : null, g.estimado ? 'valor estimado' : null].filter(Boolean).join(' · ')}</p>
            <span className="inline-block mt-1.5 text-[12px] font-bold px-2 py-0.5 rounded-full" style={{ background: est.fondo, color: est.color }}>{est.texto}</span>
          </div>
          <div className="text-right shrink-0">
            <span className="block font-extrabold text-[20px] tabular-nums" style={{ ...titulo, color: g.peor < 0 ? C.rojo : C.tinta }}>{pesos(g.total)}</span>
            {g.items.length > 1 && <span className="text-[12px] font-bold" style={{ color: C.gris }}>{abiertoEste ? 'Ocultar' : 'Ver pagos'}</span>}
          </div>
        </button>
        {g.tipo === 'empresas'
          ? <p className="text-[12.5px] rounded-xl px-3 py-2" style={{ background: C.fondo, color: C.gris }}>Se paga como abono en la Cartera de {g.nombre}.</p>
          : href && <div className="flex flex-wrap gap-2"><Link href={href} className="px-3 min-h-[38px] rounded-lg text-[13px] font-bold text-white inline-flex items-center" style={{ background: 'var(--primario)' }}>{BOTON[g.tipo]}</Link></div>}
        {abiertoEste && g.items.length > 1 && (
          <div>{g.items.map((x, i) => {
            const d = diasEntre(hoy, x.fecha)
            return (
              <div key={i} className="py-2 flex items-start gap-3 text-[13px]" style={{ borderTop: `1px solid ${C.linea}` }}>
                <span className="flex-1 min-w-0 leading-snug"><b>{x.titulo}</b>
                  <span className="block" style={{ color: d < 0 ? C.rojo : d <= 7 ? C.ambar : C.gris }}>{d < 0 ? `venció el ${fechaCorta(x.fecha)}` : d === 0 ? 'vence hoy' : `vence el ${fechaCorta(x.fecha)}`}{x.detalle ? ` · ${x.detalle}` : ''}</span></span>
                <b className="shrink-0 tabular-nums" style={{ color: d < 0 ? C.rojo : C.tinta }}>{pesos(x.valor)}</b>
              </div>
            )
          })}</div>
        )}
        {g.items.length === 1 && g.items[0].detalle && <p className="text-[12.5px]" style={{ color: C.gris }}>{g.items[0].titulo !== g.nombre ? `${g.items[0].titulo} · ` : ''}{g.items[0].detalle}</p>}
      </article>
    )
  }

  return (
    <div style={{ background: C.fondo, minHeight: '100vh', color: C.tinta }}>
      <PageHeader title="Por pagar" />
      <div className="p-4 max-w-5xl mx-auto flex flex-col gap-4">
        <div className="flex gap-1 bg-white rounded-full p-1 self-start max-w-full overflow-x-auto" role="tablist">
          {[['mes', 'Este mes'], ['año', 'Hasta diciembre']].map(([v, t]) => (
            <button key={v} type="button" role="tab" aria-selected={periodo === v} onClick={() => setPeriodo(v)} className="px-4 min-h-[38px] rounded-full text-[13.5px] font-bold whitespace-nowrap"
              style={periodo === v ? { background: C.tinta, color: '#fff' } : { color: C.gris }}>{t}</button>
          ))}
        </div>
        {error && <div className="rounded-2xl px-4 py-3 text-sm font-bold" style={{ background: C.rojoF, color: C.rojo }}>No se pudo cargar: {error}</div>}
        {!lista && !error && <p className="text-sm py-10 text-center" style={{ color: C.gris }}>Cargando…</p>}
        {lista && (
          <>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              {kpi(periodo === 'mes' ? 'Por pagar este mes' : 'Por pagar hasta diciembre', pesos(suma(delPeriodo)), plural(Object.keys(porAcreedor).length, 'acreedor', 'acreedores'))}
              {kpi('Vencido', pesos(suma(vencido)), vencido.length ? plural(new Set(vencido.map(x => x.acreedor)).size, 'acreedor', 'acreedores') : 'Nada vencido', vencido.length ? C.rojo : null)}
              {kpi('Vence esta semana', pesos(suma(estaSemana)), plural(estaSemana.length, 'pago', 'pagos'))}
              {kpi('Próximo pago', proximo ? pesos(proximo.valor) : '—', proximo ? `${proximo.acreedor} · ${fechaCorta(proximo.fecha)}` : 'Sin pagos próximos')}
            </div>

            {porTipo.length > 0 && (
              <div className="bg-white rounded-[18px] p-3.5 flex flex-col gap-2">
                <b>A quién se le debe</b>
                <div className="flex h-3.5 rounded-full overflow-hidden gap-[2px]" role="img" aria-label={porTipo.map(t => `${TIPOS_POR_PAGAR[t.k]} ${pesos(t.v)}`).join(', ')}>
                  {porTipo.map(t => <div key={t.k} style={{ width: `${t.v / total * 100}%`, background: COLOR_TIPO[t.k] }} />)}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-[12.5px]">
                  {porTipo.map(t => (
                    <span key={t.k} className="flex items-center gap-1.5" style={{ color: C.gris }}>
                      <i className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: COLOR_TIPO[t.k] }} />{TIPOS_POR_PAGAR[t.k]}
                      <b className="ml-auto tabular-nums" style={{ color: C.tinta }}>{pesos(t.v)}</b>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              <input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar proveedor, crédito o gasto…" className={input} style={{ borderColor: C.linea, color: C.tinta }} />
              {porTipo.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                  {chip(!tipo, () => setTipo(''), 'Todo', 'todo')}
                  {porTipo.map(t => chip(tipo === t.k, () => setTipo(tipo === t.k ? '' : t.k), <>{TIPOS_POR_PAGAR[t.k]} <span className="opacity-70 tabular-nums">{pesos(t.v)}</span></>, t.k))}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {chip(!estadoFiltro, () => setEstadoFiltro(''), 'Todos', 'e0')}
                {chip(estadoFiltro === 'vencidos', () => setEstadoFiltro(estadoFiltro === 'vencidos' ? '' : 'vencidos'), 'Vencidos', 'e1')}
                {chip(estadoFiltro === 'semana', () => setEstadoFiltro(estadoFiltro === 'semana' ? '' : 'semana'), 'Vencen esta semana', 'e2')}
              </div>
            </div>

            {grupos.length === 0
              ? <p className="text-sm py-10 text-center" style={{ color: C.gris }}>{delPeriodo.length ? 'Nada coincide con los filtros.' : 'No hay nada por pagar.'}</p>
              : <div className="grid gap-3 md:grid-cols-2 items-start">{grupos.map(tarjeta)}</div>}
          </>
        )}
      </div>
    </div>
  )
}
