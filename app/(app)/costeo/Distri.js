'use client'
import { useState } from 'react'
import { C, titulo } from './Paneles'

// Costos de una distribuidora (Distri Maissy): margen por producto, lo que deja
// cada ruta, lo que se queda en la calle y los datos que faltan. Ver lib/costos-distri.js.
const tarjeta = 'bg-white rounded-[18px] p-4'
const $ = (n) => '$' + Math.round(n).toLocaleString('es-CO')
const pct = (n) => `${n.toLocaleString('es-CO', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`
const color = (m) => m < 15 ? C.rojo : m < 25 ? C.ambar : C.verde
const PILL = { gris: [C.suave, C.gris], ambar: [C.ambarF, C.ambar], verde: [C.verdeF, C.verde], rojo: [C.rojoF, C.rojo] }
const Pill = ({ tono = 'gris', children }) => <span className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: PILL[tono][0], color: PILL[tono][1] }}>{children}</span>
const PARTES = [['mercancia', 'Mercancía', '#C41230'], ['repartir', 'Repartir', '#E9A23B'], ['otros', 'Cambios y obsequios', '#8C877C'], ['deja', 'Deja', '#2E5E3A']]

export default function CostosDistri({ d }) {
  const [tab, setTab] = useState('prod')
  const tot = d.filasRuta.reduce((s, r) => ({ ventas: s.ventas + r.ventas, mercancia: s.mercancia + r.mercancia, repartir: s.repartir + r.repartir, otros: s.otros + r.obsequios + r.perdidas, deja: s.deja + r.deja }), { ventas: 0, mercancia: 0, repartir: 0, otros: 0, deja: 0 })
  const bajos = d.filasProducto.filter(f => f.unidades > 0 && f.margenPct != null && f.margenPct < 20)
  const faltan = []
  if (d.rutasSinVendedor.length) faltan.push({ t: 'Nómina de cada vendedor ligada a su ruta', x: `Sin nómina: ${d.rutasSinVendedor.join(', ')}. En Nómina, a cada empleado vendedor se le escoge su vendedor.`, tono: 'rojo', e: 'Sin dato' })
  if (d.rutasSinGastos.length) faltan.push({ t: 'Gastos de ruta', x: `Sin gasolina ni viáticos anotados en la liquidación: ${d.rutasSinGastos.join(', ')}.`, tono: 'ambar', e: 'Revisar' })
  if (!d.fijos) faltan.push({ t: 'Arriendo de bodega, luz e internet', x: 'Gastos fijos del mes en Gastos. Entran al punto de equilibrio, no a la ruta.', tono: 'rojo', e: 'Sin dato' })
  if (d.sinCosto.length) faltan.push({ t: `Productos vendidos sin costo de compra`, x: d.sinCosto.map(f => f.nombre).slice(0, 6).join(', ') + '. Sin costo no hay margen.', tono: 'rojo', e: `${d.sinCosto.length}` })
  if (d.sinCompraReciente) faltan.push({ t: 'Costos de compra viejos', x: `${d.sinCompraReciente} productos vendidos este mes sin compra en 60 días usan el costo de Maestros.`, tono: 'gris', e: 'Revisar' })

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        <Kpi rotulo="Margen sobre la compra" valor={tot.ventas ? pct((tot.ventas - tot.mercancia) / tot.ventas * 100) : 'Sin dato'} nota="Ventas menos lo que costó la mercancía" />
        <Kpi rotulo="Lo que cuesta repartir" valor={tot.ventas ? `$${(tot.repartir / tot.ventas * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 })} de cada $100` : 'Sin dato'} nota="Gasolina, viáticos y nómina de vendedores" />
        <Kpi rotulo="Lo que dejan las rutas" valor={tot.ventas ? $(tot.deja) : 'Sin dato'} nota="Antes de gastos fijos" />
        <Kpi rotulo="Productos con margen bajo" valor={bajos.length} tono={bajos.length ? C.ambar : C.tinta} nota={bajos.length ? `${bajos.slice(0, 3).map(f => f.nombre).join(', ')}${bajos.length > 3 ? '…' : ''}, por debajo de 20%` : 'Ninguno por debajo de 20%'} />
      </div>

      <div className="flex gap-1 bg-white rounded-full p-1 w-max max-w-full overflow-x-auto" role="tablist">
        {[['prod', 'Por producto'], ['ruta', 'Por ruta'], ['calle', 'En la calle'], ['faltan', `Datos que faltan${faltan.length ? ' · ' + faltan.length : ''}`]].map(([id, n]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="rounded-full min-h-[40px] px-4 text-sm font-bold whitespace-nowrap"
            style={tab === id ? { background: C.tinta, color: '#fff' } : { color: C.gris }}>{n}</button>
        ))}
      </div>

      {tab === 'prod' && (
        <div className={tarjeta + ' flex flex-col gap-2'}>
          <div className="flex items-baseline justify-between gap-2 flex-wrap"><h3 className="text-[17px] font-extrabold" style={titulo}>Margen por producto</h3><span className="text-[13px]" style={{ color: C.gris }}>Ordenado por lo que deja en el mes · verde 25% o más, ámbar 15 a 25%, rojo menos de 15%</span></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead><tr className="text-xs uppercase tracking-wide" style={{ color: C.gris }}>
                <th className="py-2 px-2 text-left">Producto</th><th className="py-2 px-2 text-right">Compra</th><th className="py-2 px-2 text-right">Lista</th><th className="py-2 px-2 text-right">Margen</th><th className="py-2 px-2 text-right">Pactado</th><th className="py-2 px-2 text-right">Unidades</th><th className="py-2 px-2 text-right">Deja en el mes</th>
              </tr></thead>
              <tbody>
                {d.filasProducto.map(f => (
                  <tr key={f.sku} className="border-t" style={{ borderColor: C.linea }}>
                    <td className="py-2.5 px-2"><b>{f.nombre}</b></td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{f.costo ? $(f.costo.valor) : <Pill tono="rojo">Sin costo</Pill>}{f.costo?.fuente === 'maestros' && <span className="block text-xs" style={{ color: C.gris }}>de Maestros</span>}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{f.lista ? $(f.lista) : <Pill tono="ambar">$0</Pill>}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{f.margenPct != null ? <><b style={{ color: color(f.margenPct) }}>{pct(f.margenPct)}</b><span className="block text-xs" style={{ color: C.gris }}>{$(f.lista - f.costo.valor)} c/u</span></> : '—'}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{f.pactado && f.costo ? <>{$(f.pactado.precio)}<span className="block text-xs font-bold" style={{ color: color((f.pactado.precio - f.costo.valor) / f.pactado.precio * 100) }}>{pct((f.pactado.precio - f.costo.valor) / f.pactado.precio * 100)}</span></> : <span style={{ color: C.gris }}>—</span>}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{f.unidades ? f.unidades.toLocaleString('es-CO') : '—'}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums font-bold">{f.deja != null ? $(f.deja) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[13px]" style={{ color: C.gris }}>Compra = la última compra de los últimos 60 días, o el costo de Maestros si no hay. Pactado = el precio pactado más común con clientes. Lo que deja usa el precio de cada ruta. Desde el 2 de noviembre la Tela suelta se cobra a $2.500 y en paquete de 6 a $14.000: los $166 de cada suelta entran a Distri.</p>
        </div>
      )}

      {tab === 'ruta' && (
        <div className={tarjeta + ' flex flex-col gap-2'}>
          <div className="flex items-baseline justify-between gap-2 flex-wrap"><h3 className="text-[17px] font-extrabold" style={titulo}>Lo que deja cada ruta</h3><span className="text-[13px]" style={{ color: C.gris }}>Este mes</span></div>
          {d.filasRuta.length === 0 ? <p className="text-sm py-4" style={{ color: C.gris }}>Todavía no hay liquidaciones este mes.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead><tr className="text-xs uppercase tracking-wide" style={{ color: C.gris }}>
                  <th className="py-2 px-2 text-left">Ruta</th><th className="py-2 px-2 text-right">Ventas</th><th className="py-2 px-2 text-right">Mercancía</th><th className="py-2 px-2 text-right">Margen</th><th className="py-2 px-2 text-right">Repartir</th><th className="py-2 px-2 text-right">Cambios y obsequios</th><th className="py-2 px-2 text-right">Deja</th><th className="py-2 px-2" />
                </tr></thead>
                <tbody>
                  {d.filasRuta.map(r => {
                    const dejaPct = r.ventas ? r.deja / r.ventas * 100 : 0
                    const partes = { mercancia: r.mercancia, repartir: r.repartir, otros: r.obsequios + r.perdidas, deja: Math.max(0, r.deja) }
                    return (
                      <tr key={r.id} className="border-t" style={{ borderColor: C.linea }}>
                        <td className="py-2.5 px-2"><b>{r.nombre}</b>{r.tipo === 'punto_venta' && <span className="block text-xs" style={{ color: C.gris }}>Punto de venta</span>}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums">{$(r.ventas)}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums">{$(r.mercancia)}{r.sinCosto > 0 && <span className="block text-xs" style={{ color: C.rojo }}>{$(r.sinCosto)} sin costo</span>}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums">{r.ventas ? pct((r.ventas - r.mercancia) / r.ventas * 100) : '—'}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums">{r.tipo === 'mostrador' ? <span style={{ color: C.gris }}>—</span> : <>{$(r.repartir)}<span className="block text-xs" style={{ color: C.gris }}>{r.vendedor == null ? 'sin nómina' : 'con nómina'}{r.gastosAnotados || r.tipo !== 'ruta' ? '' : ' · sin gastos'}</span></>}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums">{$(r.obsequios + r.perdidas)}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums"><b>{$(r.deja)}</b><span className="block text-xs font-bold" style={{ color: color(dejaPct) }}>{r.ventas ? pct(dejaPct) : ''}</span></td>
                        <td className="py-2.5 px-2"><div className="flex h-2.5 rounded-full overflow-hidden gap-0.5 min-w-[120px]" role="img" aria-label={`De cada $100: ${PARTES.map(([k, n]) => `${n} ${r.ventas ? Math.round(partes[k] / r.ventas * 100) : 0}`).join(', ')}`} style={{ background: C.suave }}>
                          {PARTES.map(([k, , col]) => <i key={k} style={{ flex: partes[k] || 0.0001, background: col }} />)}
                        </div></td>
                      </tr>
                    )
                  })}
                  <tr className="border-t font-extrabold" style={{ borderColor: C.linea }}>
                    <td className="py-2.5 px-2">Todas</td><td className="py-2.5 px-2 text-right tabular-nums">{$(tot.ventas)}</td><td className="py-2.5 px-2 text-right tabular-nums">{$(tot.mercancia)}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{tot.ventas ? pct((tot.ventas - tot.mercancia) / tot.ventas * 100) : '—'}</td><td className="py-2.5 px-2 text-right tabular-nums">{$(tot.repartir)}</td><td className="py-2.5 px-2 text-right tabular-nums">{$(tot.otros)}</td><td className="py-2.5 px-2 text-right tabular-nums">{$(tot.deja)}</td><td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <div className="flex gap-3.5 flex-wrap text-[13px]" style={{ color: C.gris }}>{PARTES.map(([k, n, col]) => <span key={k} className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-[3px] inline-block" style={{ background: col }} />{n}</span>)}</div>
          <p className="text-[13px]" style={{ color: C.gris }}>Repartir = gasolina, viáticos y pagos anotados en la liquidación (sin los préstamos al vendedor) más la nómina del vendedor en los días del mes. Cambios = los que pasaron a pérdida del negocio. El préstamo al vendedor no cuenta como gasto: se le descuenta después.</p>
        </div>
      )}

      {tab === 'calle' && (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start">
          <div className={tarjeta + ' flex flex-col gap-2'}>
            <h3 className="text-[17px] font-extrabold" style={titulo}>Créditos por ruta</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead><tr className="text-xs uppercase tracking-wide" style={{ color: C.gris }}><th className="py-2 px-2 text-left">Ruta</th><th className="py-2 px-2 text-right">Por cobrar</th><th className="py-2 px-2 text-right">Vencido</th><th className="py-2 px-2 text-right">% de lo vendido</th></tr></thead>
                <tbody>
                  {d.filasRuta.filter(r => r.porCobrar > 0).sort((a, b) => b.vencido - a.vencido).map(r => (
                    <tr key={r.id} className="border-t" style={{ borderColor: C.linea }}>
                      <td className="py-2.5 px-2"><b>{r.nombre}</b></td>
                      <td className="py-2.5 px-2 text-right tabular-nums">{$(r.porCobrar)}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums font-bold" style={{ color: r.vencido ? C.rojo : C.tinta }}>{$(r.vencido)}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums">{r.ventas ? `${Math.round(r.porCobrar / r.ventas * 100)}%` : '—'}</td>
                    </tr>
                  ))}
                  {!d.filasRuta.some(r => r.porCobrar > 0) && <tr><td colSpan={4} className="py-3 px-2" style={{ color: C.gris }}>No hay créditos por cobrar.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className={tarjeta}>
            <h3 className="text-[17px] font-extrabold pb-1" style={titulo}>Por qué importa</h3>
            <p className="text-[13px]" style={{ color: C.gris }}>Una ruta puede vender mucho y dejar poco si buena parte queda fiada. Aquí se ve qué parte de lo vendido sigue afuera y cuánto ya pasó el plazo. Sale de Cartera; no hay que anotar nada nuevo.</p>
          </div>
        </div>
      )}

      {tab === 'faltan' && (
        <div className={tarjeta + ' flex flex-col gap-1 max-w-3xl'}>
          <h3 className="text-[17px] font-extrabold" style={titulo}>Datos que faltan</h3>
          <p className="text-[13px] pb-1" style={{ color: C.gris }}>Mientras falten, lo que dejan las rutas sale por encima de lo real.</p>
          {faltan.length === 0 ? <p className="text-sm py-2" style={{ color: C.verde }}>Está todo.</p> : faltan.map((f, i) => (
            <div key={i} className="flex gap-3 items-center py-2.5 border-t first:border-t-0 text-sm" style={{ borderColor: C.linea }}>
              <span className="flex-1 min-w-0"><b>{f.t}</b><br /><span className="text-[13px]" style={{ color: C.gris }}>{f.x}</span></span>
              <Pill tono={f.tono}>{f.e}</Pill>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Kpi({ rotulo, valor, nota, tono }) {
  return (
    <div className="bg-white rounded-[18px] p-4 flex flex-col gap-0.5 min-w-0">
      <span className="text-[13px] font-bold" style={{ color: C.gris }}>{rotulo}</span>
      <span className="cifra-caja"><span className="cifra font-extrabold tabular-nums" style={{ ...titulo, color: tono || C.tinta, '--cifra-max': '26px' }}>{valor}</span></span>
      <span className="text-[13px]" style={{ color: C.gris }}>{nota}</span>
    </div>
  )
}

// Reporte para Exportar (PDF presentable o Excel): margen por producto y lo que deja cada ruta.
export function reporteDistri(d, empresa) {
  const tot = d.filasRuta.reduce((s, r) => ({ ventas: s.ventas + r.ventas, mercancia: s.mercancia + r.mercancia, repartir: s.repartir + r.repartir, otros: s.otros + r.obsequios + r.perdidas, deja: s.deja + r.deja }), { ventas: 0, mercancia: 0, repartir: 0, otros: 0, deja: 0 })
  const margen = tot.ventas ? (tot.ventas - tot.mercancia) / tot.ventas * 100 : null
  const periodo = new Date(d.mes + '-15T12:00:00').toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase())
  return {
    titulo: 'Costos y márgenes', empresa: empresa?.nombre, logo: empresa?.logo_url, periodo,
    secciones: [
      { titulo: 'El mes', kpis: [
        { rotulo: 'Margen sobre la compra', valor: margen != null ? pct(margen) : 'Sin dato', valorNumero: margen, nota: 'Ventas menos lo que costó la mercancía' },
        { rotulo: 'Lo que cuesta repartir', valor: tot.ventas ? `$${(tot.repartir / tot.ventas * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 })} de cada $100` : 'Sin dato', valorNumero: tot.repartir, nota: 'Gasolina, viáticos y nómina de vendedores' },
        { rotulo: 'Lo que dejan las rutas', valor: (tot.deja < 0 ? '−' : '') + $(Math.abs(tot.deja)), valorNumero: tot.deja, nota: 'Antes de gastos fijos' },
        { rotulo: 'Gastos fijos del mes', valor: $(d.fijos || 0), valorNumero: d.fijos || 0, nota: 'Arriendo, luz, internet' },
      ] },
      { titulo: 'Lo que deja cada ruta', nota: 'Repartir = gasolina, viáticos y pagos de la liquidación más la nómina del vendedor en los días del mes. Cambios = los que pasaron a pérdida del negocio.', tabla: {
        columnas: [{ titulo: 'Ruta' }, { titulo: 'Ventas', tipo: 'pesos' }, { titulo: 'Mercancía', tipo: 'pesos' }, { titulo: 'Margen', tipo: 'pct' }, { titulo: 'Repartir', tipo: 'pesos' }, { titulo: 'Cambios y obsequios', tipo: 'pesos' }, { titulo: 'Deja', tipo: 'pesos' }],
        filas: d.filasRuta.map(r => [r.nombre, r.ventas, r.mercancia, r.ventas ? (r.ventas - r.mercancia) / r.ventas * 100 : null, r.tipo === 'mostrador' ? null : r.repartir, r.obsequios + r.perdidas, r.deja]),
        total: ['Todas', tot.ventas, tot.mercancia, margen, tot.repartir, tot.otros, tot.deja],
      } },
      { titulo: 'Margen por producto', nota: 'Compra = la última compra de los últimos 60 días, o el costo de Maestros si no hay. Pactado = el precio pactado más común con clientes.', tabla: {
        columnas: [{ titulo: 'Producto' }, { titulo: 'Compra', tipo: 'pesos' }, { titulo: 'Lista', tipo: 'pesos' }, { titulo: 'Margen', tipo: 'pct' }, { titulo: 'Pactado', tipo: 'pesos' }, { titulo: 'Unidades', tipo: 'num' }, { titulo: 'Deja en el mes', tipo: 'pesos' }],
        filas: d.filasProducto.filter(f => f.unidades > 0 || f.lista).map(f => [f.nombre, f.costo?.valor ?? null, f.lista || null, f.margenPct, f.pactado?.precio ?? null, f.unidades || null, f.deja]),
      } },
    ],
  }
}
