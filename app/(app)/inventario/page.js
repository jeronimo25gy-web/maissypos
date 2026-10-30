'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { puedeVerModulo } from '@/lib/permisos'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { PageHeader } from '@/components/ui'
import Exportar from '@/components/Exportar'
import { grupoDespacho } from '@/lib/orden-productos'
import { cargarInventarioDistri, cargarInventarioPlanta } from '@/lib/inventario-datos'
import BodegaInterna from './BodegaInterna'
import { C, titulo, Pill, Kpi } from './ui'
import CampoFecha from '@/components/CampoFecha'

// Inventario: existencias, cobertura en días, unidades en ruta, pedido para un
// día con alertas por ruta, baja rotación y bolsas de reparto (Distri); producto
// terminado y materias primas (Arepas); y la bodega interna del grupo.
// La pantalla de antes quedó en /inventario-anterior.
const fmt$ = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO')
const num = (n, d = 1) => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: d })
const sumarDias = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }
const nombreDia = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long' })
const fechaCorta = (f) => f ? new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : '—'
const INICIO_REAL = '2026-11-02'
const Segmento = ({ opciones, valor, onCambio, etiqueta }) => (
  <div className="flex gap-1 rounded-full p-1 flex-wrap" style={{ background: C.fondo }} role="group" aria-label={etiqueta}>
    {opciones.map(([v, n]) => <button key={v} type="button" aria-pressed={valor === v} onClick={() => onCambio(v)} className="rounded-full min-h-[36px] px-3.5 text-[13.5px] font-bold"
      style={valor === v ? { background: '#fff', boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { color: C.gris }}>{n}</button>)}
  </div>
)

export default function Inventario() {
  const router = useRouter()
  const hoy = obtenerFechaActual()
  const [usuario, setUsuario] = useState(null)
  const [empresas, setEmpresas] = useState([])
  const [produce, setProduce] = useState(null)
  const [tab, setTab] = useState('principal')
  const [porAprobar, setPorAprobar] = useState(0)

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')
    if (!u) { router.push('/'); return }
    if (!puedeVerModulo(u, 'inventario', ['admin'])) { router.push('/despacho'); return }
    setUsuario(u)
    supabase.from('empresas').select('id, nombre, modelos').eq('activo', true).order('nombre').then(({ data }) => {
      const acc = (data || []).filter(e => !u.empresas || u.empresas.includes(e.id))
      setEmpresas(acc)
      setProduce((acc.find(e => e.id === getEmpresaId())?.modelos || []).includes('produccion'))
    })
    supabase.from('divergencias_inventario').select('id', { count: 'exact', head: true }).eq('empresa_id', getEmpresaId()).eq('estado', 'pendiente').then(({ count }) => setPorAprobar(count || 0))
  }, [router])

  if (!usuario || produce === null) return null
  const empresa = empresas.find(e => e.id === getEmpresaId())
  const diasInicio = Math.round((new Date(INICIO_REAL + 'T12:00:00') - new Date(hoy + 'T12:00:00')) / 864e5)

  return (
    <div style={{ background: C.fondo, color: C.tinta }} className="min-h-screen">
      <PageHeader title="Inventario" subtitle={empresa?.nombre}
        actions={<span className="flex gap-2 flex-wrap">
          <Link href="/ajustes-inventario" className="rounded-xl min-h-[40px] px-3.5 text-sm font-bold flex items-center" style={{ background: C.suave }}>Ajustes por aprobar{porAprobar ? ` · ${porAprobar}` : ''}</Link>
          <Link href="/conteo" className="rounded-xl min-h-[40px] px-3.5 text-sm font-bold flex items-center text-white" style={{ background: C.rojo }}>Hacer conteo</Link>
        </span>} />
      <div className="p-4 max-w-6xl mx-auto flex flex-col gap-4">
        {diasInicio > 0 && (
          <div className="rounded-[18px] px-4 py-3 flex gap-3 items-center flex-wrap" style={{ background: C.ambarF, color: C.ambar }}>
            <span className="flex-1 min-w-[240px] text-sm"><b style={{ color: C.tinta }}>Conteo inicial antes del 2 de noviembre.</b> El conteo completo se establece como saldo inicial real y reemplaza los datos de prueba. {diasInicio === 1 ? 'Falta 1 día' : `Faltan ${diasInicio} días`}.</span>
            <Link href="/conteo" className="rounded-xl min-h-[40px] px-3.5 text-sm font-bold flex items-center bg-white" style={{ color: C.tinta }}>Ir a Conteo</Link>
          </div>
        )}
        <div className="flex gap-1 bg-white rounded-full p-1 w-max max-w-full overflow-x-auto" role="tablist">
          {[['principal', produce ? 'Planta' : 'Productos'], ['interna', 'Bodega interna']].map(([id, n]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="rounded-full min-h-[40px] px-4 text-sm font-bold whitespace-nowrap"
              style={tab === id ? { background: C.tinta, color: '#fff' } : { color: C.gris }}>{n}</button>
          ))}
        </div>
        {tab === 'principal' && (produce ? <Planta empresaId={getEmpresaId()} hoy={hoy} empresa={empresa} /> : <Distri empresaId={getEmpresaId()} hoy={hoy} empresa={empresa} />)}
        {tab === 'interna' && <BodegaInterna empresas={empresas} usuario={usuario} />}
      </div>
    </div>
  )
}

function Distri({ empresaId, hoy, empresa }) {
  const [diaPedido, setDiaPedido] = useState(sumarDias(hoy, 1))
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState(null)
  const [pedido, setPedido] = useState({})
  const [copiado, setCopiado] = useState(false)

  const cargar = useCallback(async () => {
    setD(null)
    try { const r = await cargarInventarioDistri(empresaId, hoy, diaPedido); setD(r); setPedido(Object.fromEntries(r.productos.map(p => [p.sku, p.sugerido ? String(p.sugerido) : '']))); setError('') } catch (e) { setError(e.message) }
  }, [empresaId, hoy, diaPedido])
  useEffect(() => { cargar() }, [cargar])

  if (error) return <div className="rounded-2xl px-4 py-3 text-sm font-bold" style={{ background: C.rojoF, color: C.rojo }}>No se pudo cargar: {error}</div>
  if (!d) return <p className="text-center py-16" style={{ color: C.gris }}>Cargando…</p>

  const FILTROS = [['todos', `Todos · ${d.productos.length}`], ['bajo', `Bajo el mínimo · ${d.bajoMinimo.length}`], ['neg', `Negativos · ${d.negativos.length}`], ['sin', `Sin ventas · ${d.sinVentas.length}`]]
  const lista = (filtro === 'bajo' ? d.bajoMinimo : filtro === 'neg' ? d.negativos : filtro === 'sin' ? d.sinVentas : d.productos).filter(p => !q || p.nombre.toLowerCase().includes(q.toLowerCase()))
  const grupos = []
  lista.forEach(p => { const g = grupoDespacho(p); const x = grupos.find(([n]) => n === g); if (x) x[1].push(p); else grupos.push([g, [p]]) })
  const color = (p) => p.bodega != null && p.bodega < 0 ? C.rojo : p.cobertura == null ? C.gris : p.cobertura < 2 ? C.rojo : p.cobertura <= 4 ? C.amarillo : C.verde
  const textoCobertura = (p) => p.bodega != null && p.bodega < 0 ? 'Diferencia' : p.bodega == null ? 'Sin conteo' : p.cobertura == null ? 'Sin ventas' : `${num(p.cobertura)} días`
  const conAlerta = d.productos.filter(p => p.alertas.length || Number(pedido[p.sku]) > 0)
  const porProveedor = []
  conAlerta.forEach(p => { const x = porProveedor.find(([n]) => n === p.proveedor); if (x) x[1].push(p); else porProveedor.push([p.proveedor, [p]]) })
  const textoPedido = () => [`Pedido ${empresa?.nombre || ''} · ${nombreDia(diaPedido)} ${fechaCorta(diaPedido)}`, ...porProveedor.flatMap(([prov, ps]) => {
    const l = ps.filter(p => Number(pedido[p.sku]) > 0)
    return l.length ? ['', prov, ...l.map(p => `- ${p.nombre}: ${pedido[p.sku]}`)] : []
  })].join('\n')
  const copiar = async () => { try { await navigator.clipboard.writeText(textoPedido()); setCopiado(true); setTimeout(() => setCopiado(false), 2500) } catch { alert(textoPedido()) } }
  const armar = () => ({
    titulo: 'Inventario', empresa: empresa?.nombre, periodo: `Corte al ${fechaCorta(hoy)}`,
    secciones: [
      { titulo: 'Resumen', kpis: [{ rotulo: 'Valor del inventario', valor: fmt$(d.valor), valorNumero: d.valor }, { rotulo: 'Bajo el mínimo', valor: String(d.bajoMinimo.length), valorNumero: d.bajoMinimo.length }, { rotulo: 'Diferencias', valor: String(d.negativos.length), valorNumero: d.negativos.length }, { rotulo: 'Cobertura promedio', valor: d.cobertura != null ? `${num(d.cobertura)} días` : 'Sin dato', valorNumero: d.cobertura }] },
      { titulo: 'Existencias', tabla: { columnas: [{ titulo: 'Producto' }, { titulo: 'En bodega', tipo: 'num' }, { titulo: 'En ruta', tipo: 'num' }, { titulo: 'Venta diaria', tipo: 'num' }, { titulo: 'Cobertura (días)', tipo: 'num' }, { titulo: 'Mínimo', tipo: 'num' }, { titulo: 'Valor', tipo: 'pesos' }],
        filas: d.productos.map(p => [p.nombre, p.bodega, p.enRuta, Math.round(p.diaria * 10) / 10, p.cobertura != null ? Math.round(p.cobertura * 10) / 10 : null, Number(p.stock_minimo || 0), p.valor]), total: ['Total', null, null, null, null, null, d.valor] } },
      { titulo: `Pedido para el ${nombreDia(diaPedido)}`, tabla: { columnas: [{ titulo: 'Proveedor' }, { titulo: 'Producto' }, { titulo: 'Cantidad', tipo: 'num' }], filas: porProveedor.flatMap(([prov, ps]) => ps.filter(p => Number(pedido[p.sku]) > 0).map(p => [prov, p.nombre, Number(pedido[p.sku])])) } },
    ],
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end"><Exportar armar={armar} /></div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Kpi rotulo="Valor del inventario" valor={fmt$(d.valor)} nota="Al costo de la última compra" />
        <Kpi rotulo="Bajo el mínimo" valor={`${d.bajoMinimo.length} ${d.bajoMinimo.length === 1 ? 'producto' : 'productos'}`} rojo={d.bajoMinimo.length > 0} nota={d.bajoMinimo.slice(0, 3).map(p => p.nombre).join(', ') || 'Ninguno'} />
        <Kpi rotulo="Diferencias" valor={`${d.negativos.length} en negativo`} rojo={d.negativos.length > 0} nota="Despachos mayores a las existencias" />
        <Kpi rotulo="Cobertura promedio" valor={d.cobertura != null ? `${num(d.cobertura)} días` : 'Sin dato'} nota="Existencias ÷ venta diaria" />
      </div>

      <div className="bg-white rounded-[18px] p-4 flex flex-col gap-3 min-w-0">
        <div className="flex gap-2.5 flex-wrap items-center justify-between">
          <Segmento opciones={FILTROS} valor={filtro} onCambio={setFiltro} etiqueta="Filtro" />
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar producto" aria-label="Buscar producto" className="h-11 rounded-xl border-2 px-3 text-[15px] bg-white min-w-0 flex-1 max-w-[280px]" style={{ borderColor: C.linea }} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead><tr className="text-xs uppercase tracking-wide" style={{ color: C.gris }}>
              <th className="py-2 pr-2 text-left">Producto</th><th className="py-2 pr-2 text-right">En bodega</th><th className="py-2 pr-2 text-right">En ruta</th><th className="py-2 pr-2 text-right">Venta diaria</th><th className="py-2 pr-2 text-right">Cobertura</th><th className="py-2 pr-2 text-right">Mínimo</th><th className="py-2 pr-2 text-left">Alerta</th><th className="py-2 text-right">Contado</th>
            </tr></thead>
            <tbody>
              {grupos.map(([g, ps]) => [
                <tr key={'g' + g}><td colSpan={8} className="py-1.5 px-2 text-[12px] font-extrabold uppercase tracking-wider" style={{ background: C.fondo, color: C.gris }}>{g}</td></tr>,
                ...ps.flatMap(p => {
                  const c = color(p), abre = abierto === p.sku
                  return [
                    <tr key={p.sku} className="border-t cursor-pointer align-top" style={{ borderColor: C.linea }} onClick={() => setAbierto(abre ? null : p.sku)} aria-expanded={abre}>
                      <td className="py-2.5 pr-2"><b>{p.nombre}</b>{p.bodega != null && p.bodega >= 0 && p.bodega < Number(p.stock_minimo || 0) && <> <Pill tono="ambar">Bajo el mínimo</Pill></>}</td>
                      <td className="py-2.5 pr-2 text-right tabular-nums font-extrabold" style={{ color: p.bodega < 0 ? C.rojo : C.tinta }}>{p.bodega == null ? '—' : num(p.bodega)}</td>
                      <td className="py-2.5 pr-2 text-right tabular-nums">{p.enRuta ? num(p.enRuta) : '—'}</td>
                      <td className="py-2.5 pr-2 text-right tabular-nums">{p.diaria ? num(p.diaria) : '—'}</td>
                      <td className="py-2.5 pr-2 text-right"><span className="inline-flex items-center gap-2 justify-end"><span className="font-bold" style={{ color: c === C.amarillo ? C.ambar : c }}>{textoCobertura(p)}</span>
                        <i className="block h-2 w-14 rounded relative overflow-hidden" style={{ background: C.suave }}><b className="absolute inset-y-0 left-0 rounded" style={{ width: `${p.cobertura == null || p.bodega < 0 ? 0 : Math.min(100, p.cobertura / 7 * 100)}%`, background: c }} /></i></span></td>
                      <td className="py-2.5 pr-2 text-right tabular-nums">{Number(p.stock_minimo || 0)}</td>
                      <td className="py-2.5 pr-2">{p.alertas.map((a, i) => <span key={i} className="block"><Pill tono={a.tipo === 'agotado' ? 'ambar' : 'gris'}>{a.tipo === 'agotado' ? `Agotado en ${a.ruta}` : `Devolución alta en ${a.ruta}`}</Pill></span>)}</td>
                      <td className="py-2.5 text-right">{p.contado ? fechaCorta(p.contado) : 'Sin conteo'}</td>
                    </tr>,
                    abre && p.detalle && (
                      <tr key={p.sku + 'd'}><td colSpan={8} className="p-3" style={{ background: C.fondo }}>
                        <div className="grid gap-x-6 gap-y-1 text-sm max-w-md" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                          <span>Último conteo ({fechaCorta(p.detalle.fechaConteo)})</span><b className="tabular-nums text-right">{num(p.detalle.cantidadConteo)}</b>
                          <span>+ Compras</span><b className="tabular-nums text-right">{num(p.detalle.comprado)}</b>
                          <span>+ Devoluciones de rutas</span><b className="tabular-nums text-right">{num(p.detalle.devuelto)}</b>
                          <span>− Salidas</span><b className="tabular-nums text-right">{num(-p.detalle.salida)}</b>
                          <span>− Despachos</span><b className="tabular-nums text-right">{num(-p.detalle.despachado)}</b>
                          <span className="border-t-[1.5px] pt-1 font-extrabold" style={{ borderColor: C.tinta }}>En bodega</span><b className="tabular-nums text-right border-t-[1.5px] pt-1" style={{ borderColor: C.tinta }}>{num(p.bodega)}</b>
                        </div>
                        <p className="text-[13px] pt-2" style={{ color: C.gris }}>{p.bodega < 0 ? 'Saldo negativo: los despachos superan las existencias. Suele deberse a una compra sin registrar o a un error de conteo; se corrige en el siguiente conteo.' : 'Las diferencias con la bodega física se corrigen en el siguiente conteo.'}</p>
                      </td></tr>
                    ),
                  ].filter(Boolean)
                }),
              ])}
            </tbody>
          </table>
        </div>
        <p className="text-[13px]" style={{ color: C.gris }}>En ruta: unidades despachadas pendientes de liquidación. Cobertura: verde más de 4 días · ámbar de 2 a 4 · rojo menos de 2 o negativo. Seleccione un producto para ver el cálculo.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-start">
        <div className="bg-white rounded-[18px] p-4 flex flex-col gap-3 min-w-0">
          <div className="flex justify-between gap-2 flex-wrap items-center">
            <h2 className="text-[20px] font-extrabold" style={titulo}>Pedido para el {nombreDia(diaPedido)}</h2>
            <span className="flex gap-2 flex-wrap items-center">
              <CampoFecha value={diaPedido} onChange={e => e.target.value && setDiaPedido(e.target.value)} aria-label="Día del pedido" className="h-10 rounded-xl border-2 px-2 text-sm bg-white" style={{ borderColor: C.linea }} />
              <button type="button" onClick={copiar} className="rounded-xl min-h-[40px] px-3.5 text-sm font-bold" style={{ background: C.suave }}>{copiado ? 'Copiado' : 'Copiar para WhatsApp'}</button>
            </span>
          </div>
          <p className="text-[13px]" style={{ color: C.gris }}>Cantidad inicial: carga del {nombreDia(diaPedido)} anterior ({fechaCorta(d.semanaPasada)}) más el mínimo, menos las existencias. La cantidad final la define el responsable de compras; las alertas son de referencia.</p>
          {porProveedor.length === 0 ? <p className="text-sm py-4" style={{ color: C.gris }}>Sin productos para pedir ni alertas para ese día.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead><tr className="text-xs uppercase tracking-wide" style={{ color: C.gris }}><th className="py-2 pr-2 text-left">Producto</th><th className="py-2 pr-2 text-right">Existencias</th><th className="py-2 pr-2 text-right">Carga anterior</th><th className="py-2 pr-2 text-left">Alerta</th><th className="py-2 text-right">Pedir</th></tr></thead>
                <tbody>
                  {porProveedor.map(([prov, ps]) => [
                    <tr key={'p' + prov}><td colSpan={5} className="py-1.5 px-2 text-[12px] font-extrabold uppercase tracking-wider" style={{ background: C.fondo, color: C.gris }}>{prov}</td></tr>,
                    ...ps.map(p => (
                      <tr key={p.sku} className="border-t align-top" style={{ borderColor: C.linea }}>
                        <td className="py-2 pr-2"><b>{p.nombre}</b></td>
                        <td className="py-2 pr-2 text-right tabular-nums">{p.bodega == null ? '—' : num(p.bodega)}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{p.cargaAnterior ? num(p.cargaAnterior) : '—'}</td>
                        <td className="py-2 pr-2">{p.alertas.map((a, i) => <span key={i} className="block text-[13px] leading-snug py-0.5"><Pill tono={a.tipo === 'agotado' ? 'ambar' : 'gris'}>{a.tipo === 'agotado' ? `Agotado en ${a.ruta}` : `Devolución alta en ${a.ruta}`}</Pill><br /><span style={{ color: C.gris }}>{a.tipo === 'agotado' ? `Vendió toda la carga ${a.veces} de ${a.de} veces · considerar aumentar` : `Devolvió en promedio el ${a.pct}% ${a.veces} de ${a.de} veces · considerar reducir`}</span></span>)}</td>
                        <td className="py-2 text-right"><input inputMode="numeric" value={pedido[p.sku] ?? ''} onChange={e => setPedido({ ...pedido, [p.sku]: e.target.value.replace(/\D/g, '') })} aria-label={`Pedir ${p.nombre}`}
                          className="w-16 h-10 rounded-xl border-2 text-center font-extrabold tabular-nums bg-white" style={{ borderColor: C.linea, ...titulo }} /></td>
                      </tr>
                    )),
                  ])}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4 min-w-0">
          <div className="bg-white rounded-[18px] p-4 flex flex-col gap-2">
            <h2 className="text-[20px] font-extrabold" style={titulo}>Bolsas de reparto</h2>
            <p className="text-[13px]" style={{ color: C.gris }}>Se registran en el despacho de cada ruta; no se cobran a la ruta y se incluyen en el costo de distribución.</p>
            {d.bolsas.map(b => {
              const semanas = b.consumoSemanal > 0 && b.bodega != null ? b.bodega / b.consumoSemanal : null
              return (
                <div key={b.sku} className="flex justify-between gap-3 py-2 border-t first:border-t-0 items-center" style={{ borderColor: C.linea }}>
                  <span className="min-w-0"><b className="text-sm">{b.nombre}</b><br /><span className="text-[13px]" style={{ color: C.gris }}>{b.consumoSemanal ? `Consumo semanal: ${num(b.consumoSemanal, 0)}` : 'Sin consumo registrado'}{b.costo ? ` · ${fmt$(b.costo)} c/u` : ' · sin costo registrado'}</span></span>
                  <span className="text-right shrink-0"><b className="tabular-nums">{b.bodega == null ? 'Sin conteo' : num(b.bodega, 0)}</b><br />{semanas != null && <Pill tono={semanas < 1 ? 'rojo' : semanas < 2 ? 'ambar' : 'verde'}>{semanas < 1 ? 'Reponer' : `${num(semanas)} semanas`}</Pill>}</span>
                </div>
              )
            })}
          </div>
          <div className="bg-white rounded-[18px] p-4 flex flex-col gap-2">
            <h2 className="text-[20px] font-extrabold" style={titulo}>Baja rotación</h2>
            <p className="text-[13px]" style={{ color: C.gris }}>Productos con existencias y sin ventas en los últimos 14 días. Verificar vencimientos y priorizar su venta.</p>
            {d.sinVentas.length === 0 ? <p className="text-sm py-2" style={{ color: C.verde }}>Sin productos de baja rotación.</p> : d.sinVentas.slice(0, 10).map(p => (
              <div key={p.sku} className="flex justify-between gap-3 py-2 border-t first:border-t-0 items-center" style={{ borderColor: C.linea }}>
                <span className="min-w-0"><b className="text-sm">{p.nombre}</b><br /><span className="text-[13px]" style={{ color: C.gris }}>{num(p.bodega, 0)} en bodega · {fmt$(p.valor)}</span></span><Pill tono="rojo">Revisar</Pill>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Planta({ empresaId, hoy, empresa }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { cargarInventarioPlanta(empresaId, hoy).then(setD).catch(e => setError(e.message)) }, [empresaId, hoy])
  if (error) return <div className="rounded-2xl px-4 py-3 text-sm font-bold" style={{ background: C.rojoF, color: C.rojo }}>No se pudo cargar: {error}</div>
  if (!d) return <p className="text-center py-16" style={{ color: C.gris }}>Cargando…</p>
  const corto = (n) => (n || '').replace(/^Arepa (de Maíz )?/i, '')
  const paquetes = d.terminados.reduce((s, p) => s + Math.max(0, p.bodega || 0), 0)
  const criticos = d.insumos.filter(i => i.cobertura != null && i.cobertura < 2)
  const armar = () => ({
    titulo: 'Inventario de planta', empresa: empresa?.nombre, periodo: `Corte al ${fechaCorta(hoy)}`,
    secciones: [
      { titulo: 'Producto terminado', tabla: { columnas: [{ titulo: 'Referencia' }, { titulo: 'En bodega', tipo: 'num' }, { titulo: 'Producido hoy', tipo: 'num' }, { titulo: 'Despachado hoy', tipo: 'num' }], filas: d.terminados.map(p => [corto(p.nombre), p.bodega, p.hecho, p.despachado]) } },
      { titulo: 'Materias primas', tabla: { columnas: [{ titulo: 'Insumo' }, { titulo: 'Existencias', tipo: 'num' }, { titulo: 'Consumo diario', tipo: 'num' }, { titulo: 'Cobertura (días)', tipo: 'num' }], filas: d.insumos.map(i => [i.nombre, i.bodega, Math.round(i.diaria * 100) / 100, i.cobertura != null ? Math.round(i.cobertura * 10) / 10 : null]) } },
    ],
  })
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end"><Exportar armar={armar} /></div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Kpi rotulo="Paquetes en bodega" valor={num(paquetes, 0)} nota="Ingresados desde planta" />
        {d.insumos.slice(0, 2).map(i => <Kpi key={i.sku} rotulo={i.nombre} valor={i.bodega == null ? 'Sin conteo' : num(i.bodega)} rojo={i.cobertura != null && i.cobertura < 2} nota={i.cobertura != null ? `Cobertura de ${num(i.cobertura)} días` : 'Sin consumo registrado'} />)}
        <Kpi rotulo="Insumos por reponer" valor={criticos.length} rojo={criticos.length > 0} nota={criticos.map(i => i.nombre).join(', ') || 'Ninguno'} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <div className="bg-white rounded-[18px] p-4 flex flex-col gap-2 min-w-0">
          <h2 className="text-[20px] font-extrabold" style={titulo}>Producto terminado</h2>
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[420px]">
            <thead><tr className="text-xs uppercase tracking-wide" style={{ color: C.gris }}><th className="py-2 pr-2 text-left">Referencia</th><th className="py-2 pr-2 text-right">En bodega</th><th className="py-2 pr-2 text-right">Producido hoy</th><th className="py-2 text-right">Despachado hoy</th></tr></thead>
            <tbody>{d.terminados.map(p => <tr key={p.sku} className="border-t" style={{ borderColor: C.linea }}><td className="py-2 pr-2"><b>{corto(p.nombre)}</b></td><td className="py-2 pr-2 text-right tabular-nums font-extrabold" style={{ color: p.bodega < 0 ? C.rojo : C.tinta }}>{p.bodega == null ? '—' : num(p.bodega, 0)}</td><td className="py-2 pr-2 text-right tabular-nums">{p.hecho ? num(p.hecho, 0) : '—'}</td><td className="py-2 text-right tabular-nums">{p.despachado ? num(p.despachado, 0) : '—'}</td></tr>)}</tbody>
          </table></div>
          <p className="text-[13px]" style={{ color: C.gris }}>Ingresa con el traslado de planta a bodega; sale con el despacho y la venta de mostrador.</p>
        </div>
        <div className="bg-white rounded-[18px] p-4 flex flex-col gap-2 min-w-0">
          <h2 className="text-[20px] font-extrabold" style={titulo}>Materias primas</h2>
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[420px]">
            <thead><tr className="text-xs uppercase tracking-wide" style={{ color: C.gris }}><th className="py-2 pr-2 text-left">Insumo</th><th className="py-2 pr-2 text-right">Existencias</th><th className="py-2 pr-2 text-right">Consumo diario</th><th className="py-2 text-right">Cobertura</th></tr></thead>
            <tbody>{d.insumos.map(i => <tr key={i.sku} className="border-t" style={{ borderColor: C.linea }}><td className="py-2 pr-2"><b>{i.nombre}</b></td><td className="py-2 pr-2 text-right tabular-nums">{i.bodega == null ? '—' : num(i.bodega)}</td><td className="py-2 pr-2 text-right tabular-nums">{i.diaria ? num(i.diaria, 2) : '—'}</td>
              <td className="py-2 text-right">{i.cobertura == null ? <span style={{ color: C.gris }}>Sin consumo</span> : <Pill tono={i.cobertura < 2 ? 'rojo' : i.cobertura <= 4 ? 'ambar' : 'verde'}>{i.cobertura < 1 ? 'menos de 1 día' : `${num(i.cobertura)} días`}</Pill>}</td></tr>)}</tbody>
          </table></div>
          <p className="text-[13px]" style={{ color: C.gris }}>El consumo diario es el promedio de salidas de los últimos 14 días. Los insumos se crean como materia prima en Maestros y se cargan con sus compras.</p>
        </div>
      </div>
    </div>
  )
}
