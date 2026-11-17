'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { paginado } from '@/lib/paginar'
import CampoFecha from '@/components/CampoFecha'
import Exportar from '@/components/Exportar'

// Estado de cuenta con un proveedor: compras, pagos (de caja, cruces con
// liquidaciones de ruta, pagos que hizo la otra empresa del grupo) y
// descuentos por cambios, día por día, con el saldo que va quedando. El saldo
// final es el que dice Por pagar; lo que no se explica con movimientos
// (saldo con que arrancó, rebajas hechas por fuera de Compras) sale como su
// propio renglón al principio. Gerencia anula desde aquí un pago mal hecho.
const C = { tinta: '#1C1B19', gris: '#5A5750', linea: '#E3E1D8', suave: '#EFEDE6', fondo: 'var(--hoja)', rojo: 'var(--rojo)', verde: '#2E5E3A' }
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const $ = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n || 0)).toLocaleString('es-CO')
const dia = (f) => f ? new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '') : ''
const largo = (f) => f ? new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
const masDias = (f, n) => new Date(new Date(f + 'T12:00:00').getTime() + n * 864e5).toLocaleDateString('en-CA')
const lotes = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))

const PERIODOS = [['mes', 'Este mes'], ['anterior', 'Mes pasado'], ['todo', 'Desde el inicio'], ['rango', 'Otras fechas']]

export default function EstadoCuentaProveedor({ proveedor, usuario, nombreSku = {}, onCerrar, onCambio }) {
  const hoy = obtenerFechaActual()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [periodo, setPeriodo] = useState('mes')
  const [rango, setRango] = useState({ desde: hoy.slice(0, 8) + '01', hasta: hoy })
  const [abierta, setAbierta] = useState(null) // compra con sus productos a la vista
  const [items, setItems] = useState({}) // compra_id -> renglones
  const [anulando, setAnulando] = useState(null) // { mov, motivo }
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    const emp = getEmpresaId()
    try {
      const [cmp, abs, dsc, fac, cts, emps] = await Promise.all([
        paginado(() => supabase.from('compras_encab').select('id, fecha, total, estado, estado_pago, cuenta_pago_id, created_at').eq('proveedor_id', proveedor.id).in('estado', ['confirmada', 'pagada']).eq('empresa_id', emp)),
        paginado(() => supabase.from('abonos_proveedores').select('id, fecha, valor, nota, despacho_id, cuenta_id, pagado_por_empresa_id, registrado_por, created_at, cuentas(nombre)').eq('proveedor_id', proveedor.id).eq('empresa_id', emp)),
        paginado(() => supabase.from('novedades').select('id, fecha, sku, cantidad, valor, motivo, created_at').eq('proveedor_id', proveedor.id).eq('tipo', 'descuenta_proveedor').eq('empresa_id', emp)),
        supabase.from('facturas_proveedores').select('total_pendiente').eq('proveedor_id', proveedor.id).eq('estado', 'pendiente').eq('empresa_id', emp),
        supabase.from('cuentas').select('id, nombre').eq('empresa_id', emp),
        supabase.from('empresas').select('id, nombre, logo_url'),
      ])
      for (const r of [cmp, abs, dsc, fac]) if (r.error) throw new Error(r.error.message)
      const despIds = [...new Set((abs.data || []).map(a => a.despacho_id).filter(Boolean))]
      const desp = despIds.length ? (await supabase.from('despachos_encab').select('id, fecha, rutas(nombre), vendedores(nombre)').in('id', despIds)).data || [] : []
      setDatos({
        compras: cmp.data || [], abonos: abs.data || [], descuentos: dsc.data || [],
        saldo: (fac.data || []).reduce((s, f) => s + Number(f.total_pendiente || 0), 0),
        cuentas: Object.fromEntries((cts.data || []).map(c => [c.id, c.nombre])),
        empresas: Object.fromEntries((emps.data || []).map(e => [e.id, e])),
        despachos: Object.fromEntries(desp.map(d => [d.id, d])),
      })
    } catch (e) { setError(e.message) }
  }, [proveedor.id])

  useEffect(() => { Promise.resolve().then(cargar) }, [cargar])
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape' && !anulando) onCerrar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onCerrar, anulando])

  // Todos los movimientos, del más viejo al más nuevo.
  const movs = useMemo(() => {
    if (!datos) return []
    const lista = []
    for (const c of datos.compras) {
      lista.push({ key: 'c' + c.id, fecha: c.fecha, orden: c.created_at || '', tipo: 'compra', concepto: 'Compra', cargo: Number(c.total || 0), compraId: c.id })
      if (c.estado_pago === 'pagado_momento') lista.push({ key: 'cp' + c.id, fecha: c.fecha, orden: (c.created_at || '') + '~', tipo: 'pago', concepto: 'Pago de contado', detalle: datos.cuentas[c.cuenta_pago_id] || '', abono: Number(c.total || 0) })
    }
    for (const a of datos.abonos) {
      const d = a.despacho_id ? datos.despachos[a.despacho_id] : null
      const otra = a.pagado_por_empresa_id ? datos.empresas[a.pagado_por_empresa_id]?.nombre || 'la otra empresa' : null
      const notaAuto = /^Cruce con la liquidación de /.test(a.nota || '')
      lista.push({
        key: 'a' + a.id, fecha: a.fecha, orden: a.created_at || '', abono: Number(a.valor || 0), abonoId: a.id,
        tipo: a.despacho_id ? 'cruce' : otra ? 'otra' : 'pago',
        concepto: a.despacho_id ? 'Cruce con liquidación' : otra ? `Pago hecho por ${otra}` : 'Pago',
        detalle: a.despacho_id ? [d?.rutas?.nombre, d?.vendedores?.nombre, d?.fecha && d.fecha !== a.fecha ? `liquidación del ${dia(d.fecha)}` : null].filter(Boolean).join(' · ') || 'Liquidación de ruta'
          : otra ? 'No sale de las cuentas de esta empresa' : (a.cuentas?.nombre || datos.cuentas[a.cuenta_id] || 'Sin cuenta'),
        nota: notaAuto ? '' : (a.nota || ''), por: a.registrado_por || '', cuenta: a.cuentas?.nombre || datos.cuentas[a.cuenta_id] || '', otra,
      })
    }
    for (const n of datos.descuentos) {
      lista.push({ key: 'n' + n.id, fecha: n.fecha, orden: n.created_at || '', tipo: 'descuento', concepto: 'Descuento por cambios', detalle: `${nombreSku[n.sku] || n.sku} x${Number(n.cantidad || 0)}`, nota: n.motivo || '', abono: Number(n.valor || 0) })
    }
    lista.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.orden || '').localeCompare(b.orden || ''))
    // Lo que el saldo de hoy no explica con movimientos va al principio.
    const neto = lista.reduce((s, m) => s + (m.cargo || 0) - (m.abono || 0), 0)
    const base = datos.saldo - neto
    if (Math.abs(base) >= 1) {
      lista.unshift(base > 0
        ? { key: 'base', fecha: '', tipo: 'base', concepto: 'Saldo inicial', detalle: 'Lo que se debía al empezar a registrar en MaissyPOS', cargo: base }
        : { key: 'base', fecha: '', tipo: 'base', concepto: 'Rebajas sin detalle', detalle: 'Bajaron el saldo por fuera de Compras: devoluciones o cruces entre empresas', abono: -base })
    }
    let saldo = 0
    return lista.map(m => { saldo += (m.cargo || 0) - (m.abono || 0); return { ...m, saldo } })
  }, [datos, nombreSku])

  const primera = movs.find(m => m.fecha)?.fecha || hoy
  const { desde, hasta } = periodo === 'mes' ? { desde: hoy.slice(0, 8) + '01', hasta: hoy }
    : periodo === 'anterior' ? (() => { const fin = masDias(hoy.slice(0, 8) + '01', -1); return { desde: fin.slice(0, 8) + '01', hasta: fin } })()
      : periodo === 'todo' ? { desde: primera, hasta: hoy }
        : rango
  const antes = movs.filter(m => !m.fecha || m.fecha < desde)
  const saldoAnterior = antes.length ? antes[antes.length - 1].saldo : 0
  const enRango = movs.filter(m => m.fecha && m.fecha >= desde && m.fecha <= hasta)
  const compras = enRango.reduce((s, m) => s + (m.cargo || 0), 0)
  const pagos = enRango.reduce((s, m) => s + (m.abono || 0), 0)
  const saldoFinal = saldoAnterior + compras - pagos
  const dias = useMemo(() => {
    const g = []
    for (const m of enRango) { const u = g[g.length - 1]; if (u && u.fecha === m.fecha) u.movs.push(m); else g.push({ fecha: m.fecha, movs: [m] }) }
    return g.reverse() // lo más reciente arriba
  }, [enRango])

  // Productos de las compras del periodo, para verlas al tocarlas.
  useEffect(() => {
    const ids = enRango.filter(m => m.compraId && !items[m.compraId]).map(m => m.compraId)
    if (!ids.length) return
    let vivo = true
    Promise.all(lotes(ids, 150).map(l => supabase.from('compras').select('compra_id, sku, cantidad, total').in('compra_id', l).eq('empresa_id', getEmpresaId())))
      .then(rs => {
        if (!vivo) return
        const nuevo = Object.fromEntries(ids.map(id => [id, []]))
        rs.forEach(r => (r.data || []).forEach(it => { if (Number(it.cantidad) > 0) nuevo[it.compra_id]?.push(it) }))
        setItems(prev => ({ ...prev, ...nuevo }))
      })
    return () => { vivo = false }
  }, [enRango, items])

  const textoProductos = (id) => {
    const l = items[id]
    if (!l) return ''
    if (!l.length) return 'Sin productos'
    return `${l.length} producto${l.length === 1 ? '' : 's'}`
  }

  const anular = async () => {
    if (!anulando?.motivo.trim()) { alert('Escriba por qué se anula.'); return }
    setOcupado(true)
    const { error: e } = await supabase.rpc('anular_abono_proveedor', { p_abono_id: anulando.mov.abonoId, p_motivo: anulando.motivo.trim(), p_usuario: usuario?.nombre || null })
    setOcupado(false)
    if (e) { alert('No se pudo anular: ' + e.message); return }
    setAnulando(null)
    await cargar()
    onCambio?.()
  }

  const nombreRango = `${largo(desde)} al ${largo(hasta)}`
  const armar = () => {
    const emp = datos?.empresas[getEmpresaId()]
    return {
      titulo: 'Estado de cuenta', empresa: emp?.nombre, logo: emp?.logo_url,
      periodo: `${proveedor.nombre} · ${nombreRango}`,
      secciones: [
        { kpis: [
          { rotulo: 'Saldo anterior', valor: $(saldoAnterior), valorNumero: saldoAnterior, nota: `Al ${largo(masDias(desde, -1))}` },
          { rotulo: 'Compras', valor: $(compras), valorNumero: compras },
          { rotulo: 'Pagos y descuentos', valor: $(pagos), valorNumero: pagos },
          { rotulo: hasta === hoy ? 'Saldo hoy' : 'Saldo al corte', valor: $(saldoFinal), valorNumero: saldoFinal, nota: `Al ${largo(hasta)}` },
        ] },
        { titulo: 'Movimientos', tabla: {
          columnas: [{ titulo: 'Fecha' }, { titulo: 'Movimiento' }, { titulo: 'Detalle' }, { titulo: 'Compras', tipo: 'pesos' }, { titulo: 'Pagos', tipo: 'pesos' }, { titulo: 'Saldo', tipo: 'pesos' }],
          filas: [
            [dia(masDias(desde, -1)), 'Saldo anterior', '', null, null, saldoAnterior],
            ...enRango.map(m => [dia(m.fecha), m.concepto, [m.compraId ? (items[m.compraId] || []).map(it => `${nombreSku[it.sku] || it.sku} x${Number(it.cantidad)}`).join(', ') : m.detalle, m.nota].filter(Boolean).join(' · '), m.cargo || null, m.abono || null, m.saldo]),
          ],
          total: ['Total', '', '', compras, pagos, saldoFinal],
        } },
      ],
    }
  }

  const fila = 'grid gap-x-4 items-baseline md:grid-cols-[minmax(0,1fr)_120px_120px_130px] grid-cols-[minmax(0,1fr)_auto]'

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: C.fondo, color: C.tinta }} role="dialog" aria-modal="true" aria-label={`Estado de cuenta de ${proveedor.nombre}`}>
      <div className="max-w-[1080px] mx-auto px-4 md:px-8 py-6 md:py-8 flex flex-col gap-5">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <span className="text-[12.5px] font-bold uppercase tracking-[0.08em]" style={{ color: C.gris }}>Estado de cuenta</span>
            <h2 className="font-extrabold text-[28px] md:text-[34px] leading-tight" style={titulo}>{proveedor.nombre}</h2>
          </div>
          <div className="flex gap-2 items-center">
            {datos && <Exportar armar={armar} etiqueta="Descargar" />}
            <button type="button" onClick={onCerrar} className="px-4 min-h-[40px] rounded-xl text-sm font-bold bg-white" style={{ boxShadow: `inset 0 0 0 1.5px ${C.linea}` }}>Cerrar</button>
          </div>
        </header>

        <div className="flex flex-wrap gap-2 items-center" role="radiogroup" aria-label="Periodo">
          {PERIODOS.map(([v, t]) => (
            <button key={v} type="button" role="radio" aria-checked={periodo === v} onClick={() => setPeriodo(v)}
              className="px-4 min-h-[38px] rounded-full text-[13.5px] font-bold"
              style={periodo === v ? { background: '#fff', boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: C.suave, color: C.gris }}>{t}</button>
          ))}
          {periodo === 'rango' && (
            <div className="flex gap-2 items-center flex-wrap">
              <CampoFecha value={rango.desde} max={rango.hasta} onChange={e => e.target.value && setRango({ ...rango, desde: e.target.value })} className="bg-white rounded-xl px-3 min-h-[38px] text-[13.5px] font-bold w-[170px]" style={{ boxShadow: `inset 0 0 0 1.5px ${C.linea}` }} aria-label="Desde" />
              <span className="text-[13px]" style={{ color: C.gris }}>al</span>
              <CampoFecha value={rango.hasta} min={rango.desde} max={hoy} onChange={e => e.target.value && setRango({ ...rango, hasta: e.target.value })} className="bg-white rounded-xl px-3 min-h-[38px] text-[13.5px] font-bold w-[170px]" style={{ boxShadow: `inset 0 0 0 1.5px ${C.linea}` }} aria-label="Hasta" />
            </div>
          )}
        </div>

        {error ? <p className="text-sm py-10 text-center" style={{ color: C.rojo }}>No se pudo cargar: {error}</p>
          : !datos ? <p className="text-sm py-10 text-center" style={{ color: C.gris }}>Cargando…</p> : (
            <>
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                {[
                  ['Saldo anterior', saldoAnterior, `Al ${dia(masDias(desde, -1))}`],
                  ['Compras', compras, `${enRango.filter(m => m.tipo === 'compra').length} en el periodo`],
                  ['Pagos y descuentos', pagos, `${enRango.filter(m => m.abono).length} en el periodo`],
                  [hasta === hoy ? 'Saldo hoy' : 'Saldo al corte', saldoFinal, hasta === hoy ? 'Lo que se le debe' : `Al ${dia(hasta)}`, true],
                ].map(([et, v, sub, fuerte]) => (
                  <div key={et} className="rounded-2xl bg-white p-4 flex flex-col gap-0.5" style={{ boxShadow: fuerte ? `inset 0 0 0 2px ${C.tinta}` : `inset 0 0 0 1px ${C.linea}` }}>
                    <span className="text-[12.5px] font-bold" style={{ color: C.gris }}>{et}</span>
                    <span className="font-extrabold text-[24px] tabular-nums leading-tight" style={titulo}>{$(v)}</span>
                    <span className="text-[12.5px]" style={{ color: C.gris }}>{sub}</span>
                  </div>
                ))}
              </div>

              <section className="rounded-2xl bg-white" style={{ boxShadow: `inset 0 0 0 1px ${C.linea}` }}>
                <div className={fila + ' px-4 md:px-5 py-2.5 text-[12px] font-bold uppercase tracking-[0.06em] hidden md:grid'} style={{ color: C.gris, borderBottom: `1px solid ${C.linea}` }}>
                  <span>Movimiento</span><span className="text-right">Compras</span><span className="text-right">Pagos</span><span className="text-right">Saldo</span>
                </div>

                {dias.length === 0 && <p className="text-sm px-5 py-8 text-center" style={{ color: C.gris }}>Sin movimientos en estas fechas</p>}

                {dias.map(d => (
                  <div key={d.fecha} style={{ borderBottom: `1px solid ${C.linea}` }}>
                    <div className="px-4 md:px-5 pt-3 pb-1 flex justify-between items-baseline gap-3">
                      <span className="text-[13px] font-extrabold capitalize">{dia(d.fecha)}</span>
                      <span className="text-[12.5px] tabular-nums md:hidden" style={{ color: C.gris }}>Saldo {$(d.movs[d.movs.length - 1].saldo)}</span>
                    </div>
                    {d.movs.map(m => {
                      const abierto = abierta === m.compraId && m.compraId
                      const puedeAnular = usuario?.gerencia && m.abonoId && m.tipo !== 'cruce'
                      return (
                        <div key={m.key} className="px-4 md:px-5 py-2">
                          <div className={fila}>
                            <div className="min-w-0 text-[14px] leading-snug">
                              <b className="font-bold">{m.concepto}</b>
                              {m.compraId ? (
                                <button type="button" onClick={() => setAbierta(abierto ? null : m.compraId)} aria-expanded={!!abierto} className="ml-2 text-[13px] font-bold underline underline-offset-2" style={{ color: C.gris }}>
                                  {abierto ? 'Ocultar productos' : textoProductos(m.compraId) || 'Ver productos'}
                                </button>
                              ) : m.detalle ? <span className="text-[13px]" style={{ color: C.gris }}> · {m.detalle}</span> : null}
                              {(m.nota || m.por) && <span className="block text-[12.5px]" style={{ color: C.gris }}>{[m.nota, m.por ? `Registró ${m.por}` : ''].filter(Boolean).join(' · ')}</span>}
                              {puedeAnular && anulando?.mov.key !== m.key && (
                                <button type="button" onClick={() => setAnulando({ mov: m, motivo: '' })} className="block text-[12.5px] font-bold underline underline-offset-2 mt-0.5" style={{ color: C.rojo }}>Anular este pago</button>
                              )}
                            </div>
                            <span className="text-right tabular-nums text-[14px] font-bold hidden md:block">{m.cargo ? $(m.cargo) : ''}</span>
                            <span className="text-right tabular-nums text-[14px] font-bold hidden md:block" style={{ color: C.verde }}>{m.abono ? '−' + $(m.abono) : ''}</span>
                            <span className="text-right tabular-nums text-[14px] hidden md:block" style={{ color: C.gris }}>{$(m.saldo)}</span>
                            <span className="text-right tabular-nums text-[14px] font-bold md:hidden" style={{ color: m.abono ? C.verde : C.tinta }}>{m.abono ? '−' + $(m.abono) : '+' + $(m.cargo)}</span>
                          </div>
                          {abierto && (
                            <div className="mt-1.5 ml-0 md:ml-3 pl-3 flex flex-col gap-0.5" style={{ borderLeft: `2px solid ${C.linea}` }}>
                              {(items[m.compraId] || []).map(it => (
                                <div key={it.sku} className="flex justify-between gap-3 text-[13px] md:max-w-[520px]" style={{ color: C.gris }}>
                                  <span className="min-w-0">{nombreSku[it.sku] || it.sku} x{Number(it.cantidad)}</span><span className="tabular-nums shrink-0">{$(it.total)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {anulando?.mov.key === m.key && (
                            <div className="mt-2 rounded-xl p-3 flex flex-col gap-2 md:max-w-[560px]" style={{ boxShadow: `inset 0 0 0 1.5px ${C.rojo}` }}>
                              <p className="text-[13.5px] font-bold" style={{ color: C.rojo }}>
                                Anular {$(m.abono)}: {m.otra ? `se quita el cobro en ${m.otra} y baja lo que se le debe;` : m.cuenta ? `la plata vuelve a ${m.cuenta};` : ''} lo que se le debe a {proveedor.nombre} sube {$(m.abono)}.
                              </p>
                              <input value={anulando.motivo} onChange={e => setAnulando({ ...anulando, motivo: e.target.value })} placeholder="Motivo de la anulación" autoFocus
                                className="w-full min-h-[42px] rounded-xl px-3 text-[14px] bg-white outline-none" style={{ boxShadow: `inset 0 0 0 1.5px ${C.linea}` }} />
                              <div className="flex gap-2">
                                <button type="button" onClick={() => setAnulando(null)} className="flex-1 min-h-[42px] rounded-xl text-sm font-bold" style={{ background: C.suave }}>Cancelar</button>
                                <button type="button" onClick={anular} disabled={ocupado} className="flex-1 min-h-[42px] rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: C.rojo }}>{ocupado ? 'Anulando…' : 'Anular pago'}</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}

                <div className={fila + ' px-4 md:px-5 py-3'}>
                  <span className="text-[14px] font-bold">Saldo anterior <span className="font-normal text-[13px]" style={{ color: C.gris }}>· al {dia(masDias(desde, -1))}</span></span>
                  <span className="hidden md:block" /><span className="hidden md:block" />
                  <span className="text-right tabular-nums text-[14px] font-bold">{$(saldoAnterior)}</span>
                </div>
              </section>
            </>
          )}
      </div>
    </div>
  )
}
