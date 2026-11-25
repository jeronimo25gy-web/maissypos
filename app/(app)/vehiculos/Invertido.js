'use client'
import { useState } from 'react'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { nombreLindo } from '@/lib/maestros'
import { nuevoLibro, agregarTabla, guardarLibro } from '@/lib/excel'
import { C, $, Pill, Kpi, Tarjeta, H2, Nota, Boton, Segmento } from '../gastos/ui'
import { Placa, fechaLarga } from './comunes'

// Lo invertido en cada carro (combustible, arreglos, seguros y documentos,
// repuestos y otros) en un año, en el mes o desde que se tiene, y los talleres.
const CATS = [['combustible', 'Combustible'], ['mantenimiento', 'Mantenimiento y arreglos'], ['documentos', 'Seguros y documentos'], ['repuestos', 'Repuestos'], ['otros', 'Otros']]

export default function Invertido({ flota, empresa, verCarro }) {
  const hoy = obtenerFechaActual()
  const anios = [...new Set(flota.vehiculos.flatMap(v => Object.keys(v.inversion.anios)))].sort().reverse()
  const [periodo, setPeriodo] = useState(hoy.slice(0, 4))
  const mesTxt = new Date(hoy + 'T12:00:00').toLocaleDateString('es-CO', { month: 'long' })
  const opciones = [...new Set([hoy.slice(0, 4), ...anios])].map(a => [a, `Año ${a}`]).concat([['mes', mesTxt.charAt(0).toUpperCase() + mesTxt.slice(1)], ['total', 'Desde la compra']])
  const de = (v) => periodo === 'mes' ? v.inversion.mes : periodo === 'total' ? v.inversion.total : (v.inversion.anios[periodo] || { combustible: 0, mantenimiento: 0, documentos: 0, repuestos: 0, otros: 0, total: 0 })
  const enPeriodo = (f) => periodo === 'total' || String(f || '').startsWith(periodo === 'mes' ? hoy.slice(0, 7) : periodo)
  const filas = flota.vehiculos.map(v => ({ v, i: de(v), faltan: v.arreglos.filter(a => a.falta && enPeriodo(a.fecha)).length, arreglos: v.arreglos.filter(a => enPeriodo(a.fecha)).length }))
    .filter(x => x.v.estado !== 'inactivo' || x.i.total > 0).sort((a, b) => b.i.total - a.i.total)
  const tot = Object.fromEntries([...CATS.map(([k]) => k), 'total'].map(k => [k, filas.reduce((s, x) => s + x.i[k], 0)]))
  const max = Math.max(1, ...filas.map(x => x.i.total))
  const cols = CATS.filter(([k]) => k !== 'repuestos' || tot.repuestos > 0)
  const nombrePeriodo = opciones.find(o => o[0] === periodo)?.[1] || periodo
  const pct = (n) => tot.total ? `${Math.round(n / tot.total * 100)} %` : ''
  const faltanTot = filas.reduce((s, x) => s + x.faltan, 0)

  // Talleres: lo gastado en cada uno en el periodo (y lo que no tiene taller).
  const porTaller = {}
  flota.vehiculos.forEach(v => v.arreglos.filter(a => enPeriodo(a.fecha)).forEach(a => {
    const k = a.taller_id || a.tallerNombre || ''
    const t = (porTaller[k] = porTaller[k] || { nombre: a.tallerNombre || '', telefono: (flota.talleres || []).find(x => x.id === a.taller_id)?.telefono || '', n: 0, valor: 0, ultimo: '', placas: new Set() })
    t.n++; t.valor += a.valor; t.placas.add(v.placa); if (String(a.fecha) > t.ultimo) t.ultimo = String(a.fecha)
  }))
  const talleres = Object.values(porTaller).sort((a, b) => (!a.nombre) - (!b.nombre) || b.valor - a.valor)

  const exportar = async () => {
    const libro = await nuevoLibro()
    agregarTabla(libro, 'Por carro', {
      encabezado: { titulo: `Lo invertido en los carros · ${nombrePeriodo}`, subtitulo: empresa?.nombre || '' },
      columnas: [{ titulo: 'Placa', tipo: 'texto' }, { titulo: 'Carro', tipo: 'texto' }, { titulo: 'Ruta', tipo: 'texto' }, ...cols.map(([, n]) => ({ titulo: n, tipo: 'pesos' })), { titulo: 'Total', tipo: 'pesos' }, { titulo: 'Arreglos', tipo: 'entero' }, { titulo: 'Por completar', tipo: 'entero' }],
      filas: filas.map(x => [x.v.placa, [x.v.marca, x.v.modelo].filter(Boolean).join(' '), x.v.ruta ? nombreLindo(x.v.ruta.nombre) : 'Sin ruta', ...cols.map(([k]) => x.i[k]), x.i.total, x.arreglos, x.faltan]),
      total: ['Total', '', '', ...cols.map(([k]) => tot[k]), tot.total, filas.reduce((s, x) => s + x.arreglos, 0), faltanTot],
    })
    agregarTabla(libro, 'Talleres', {
      encabezado: { titulo: `Talleres · ${nombrePeriodo}`, subtitulo: empresa?.nombre || '' },
      columnas: [{ titulo: 'Taller', tipo: 'texto' }, { titulo: 'Teléfono', tipo: 'texto' }, { titulo: 'Arreglos', tipo: 'entero' }, { titulo: 'Valor', tipo: 'pesos' }, { titulo: 'Último', tipo: 'texto' }, { titulo: 'Carros', tipo: 'texto' }],
      filas: talleres.map(t => [t.nombre || 'Sin taller anotado', t.telefono, t.n, t.valor, fechaLarga(t.ultimo), [...t.placas].join(', ')]),
    })
    await guardarLibro(libro, `Lo invertido en los carros ${nombrePeriodo}.xlsx`)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <Segmento etiqueta="Periodo" opciones={opciones} valor={periodo} onCambio={setPeriodo} />
        <Boton onClick={exportar}>Exportar a Excel</Boton>
      </div>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <Kpi rotulo={`Invertido en los carros · ${nombrePeriodo}`} valor={$(tot.total)} nota={`${filas.length} ${filas.length === 1 ? 'vehículo' : 'vehículos'}`} />
        {cols.filter(([k]) => tot[k] > 0).map(([k, n]) => <Kpi key={k} rotulo={n} valor={$(tot[k])} nota={pct(tot[k])} />)}
      </div>
      {faltanTot > 0 && <div className="rounded-[16px] px-4 py-3 text-sm" style={{ background: C.ambarF, color: C.ambar }}><b>{faltanTot === 1 ? '1 arreglo sin taller o sin factura.' : `${faltanTot} arreglos sin taller o sin factura.`}</b> Se completan en la ficha de cada carro, pestaña Mantenimiento.</div>}

      <Tarjeta>
        <H2>Por carro</H2>
        <div className="hidden md:grid gap-3 text-[12.5px] font-bold pb-1" style={{ color: C.gris, gridTemplateColumns: `minmax(0,1.5fr) repeat(${cols.length + 1}, minmax(0,1fr)) minmax(0,1fr) 130px` }}>
          <span>Vehículo</span>{cols.map(([k, n]) => <span key={k} className="text-right">{n}</span>)}<span className="text-right">Total</span><span /><span className="text-right">Arreglos</span>
        </div>
        {filas.length === 0 && <Nota>Sin vehículos.</Nota>}
        {filas.map(({ v, i, faltan, arreglos }) => (
          <button data-fila key={v.id} type="button" onClick={() => verCarro(v.id)} className="w-full text-left grid gap-x-3 gap-y-1 items-center py-2.5 grid-cols-[minmax(0,1fr)_auto] md:[grid-template-columns:var(--cols)]" style={{ borderTop: `1px solid ${C.linea}`, '--cols': `minmax(0,1.5fr) repeat(${cols.length + 1}, minmax(0,1fr)) minmax(0,1fr) 130px` }}>
            <span className="min-w-0 flex items-center gap-2.5"><Placa>{v.placa}</Placa><span className="min-w-0"><span className="block text-[13px] truncate" style={{ color: C.gris }}>{[v.marca, v.modelo].filter(Boolean).join(' ')}{` · ${v.ruta ? nombreLindo(v.ruta.nombre) : 'Sin ruta'}`}</span></span></span>
            {cols.map(([k]) => <span key={k} className="hidden md:block text-right tabular-nums text-sm">{i[k] ? $(i[k]) : '—'}</span>)}
            <b className="text-right tabular-nums">{$(i.total)}</b>
            <span className="col-span-2 md:col-span-1 block h-2.5 rounded-r" style={{ background: C.suave }}><span className="block h-2.5 rounded-r" style={{ width: `${i.total / max * 100}%`, background: C.tinta }} /></span>
            <span className="md:hidden col-span-2 text-[13px]" style={{ color: C.gris }}>{cols.filter(([k]) => i[k]).map(([k, n]) => `${n} ${$(i[k])}`).join(' · ') || 'Sin gastos'}</span>
            <span className="col-span-2 md:col-span-1 flex md:justify-end">{faltan ? <Pill tono="ambar">{faltan === 1 ? '1 por completar' : `${faltan} por completar`}</Pill> : arreglos ? <Pill tono="verde">{arreglos === 1 ? '1 completo' : `${arreglos} completos`}</Pill> : <span className="text-[13px]" style={{ color: C.gris }}>Sin arreglos</span>}</span>
          </button>
        ))}
        {filas.length > 1 && (
          <div className="grid gap-x-3 items-center pt-2.5 font-extrabold grid-cols-[minmax(0,1fr)_auto] md:[grid-template-columns:var(--cols)]" style={{ borderTop: `1px solid ${C.linea}`, '--cols': `minmax(0,1.5fr) repeat(${cols.length + 1}, minmax(0,1fr)) minmax(0,1fr) 130px` }}>
            <span>Total</span>{cols.map(([k]) => <span key={k} className="hidden md:block text-right tabular-nums text-sm">{$(tot[k])}</span>)}<span className="text-right tabular-nums">{$(tot.total)}</span>
          </div>
        )}
      </Tarjeta>

      <Tarjeta>
        <H2>Talleres</H2>
        {talleres.length === 0 ? <Nota>Sin arreglos en este periodo.</Nota> : talleres.map((t, k) => (
          <div data-fila key={k} className="grid gap-3 items-center pt-2.5" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', borderTop: k ? `1px solid ${C.linea}` : 0 }}>
            <span className="min-w-0"><b>{t.nombre || 'Sin taller anotado'}</b><span className="block text-[13px]" style={{ color: C.gris }}>{[t.telefono, `${t.n} ${t.n === 1 ? 'arreglo' : 'arreglos'}`, t.ultimo && `último ${fechaLarga(t.ultimo)}`, [...t.placas].join(', ')].filter(Boolean).join(' · ')}</span></span>
            <b className="tabular-nums">{$(t.valor)}</b>
          </div>
        ))}
      </Tarjeta>
    </div>
  )
}
