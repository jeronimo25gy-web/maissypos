'use client'
import { useAtras } from '@/lib/atras'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { puedeVerModulo } from '@/lib/permisos'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { PageHeader } from '@/components/ui'
import { ordenarPorDespacho } from '@/lib/orden-productos'
import CampoFecha from '@/components/CampoFecha'
import { paginado } from '@/lib/paginar'

export default function Historial() {
  const [usuario, setUsuario] = useState(null)
  const [desde, setDesde] = useState(obtenerFechaActual())
  const [hasta, setHasta] = useState(obtenerFechaActual())
  const [ventasSku, setVentasSku] = useState([]) // lo vendido en el rango, por producto
  const [vendedorFiltro, setVendedorFiltro] = useState('')
  const [rutaFiltro, setRutaFiltro] = useState('')
  const [vendedores, setVendedores] = useState([])
  const [rutas, setRutas] = useState([])
  const [despachos, setDespachos] = useState([])
  const [despachSel, setDespachSel] = useState(null)
  const [detalle, setDetalle] = useState([])
  const [liqDetalle, setLiqDetalle] = useState(null)
  const [fiados, setFiados] = useState([])
  const [gastos, setGastos] = useState([])
  const [transEnviadas, setTransEnviadas] = useState([])
  const [transRecibidas, setTransRecibidas] = useState([])
  const [obsequios, setObsequios] = useState([])
  const [consumos, setConsumos] = useState([])
  const [descuentos, setDescuentos] = useState([])
  const [transfRuta, setTransfRuta] = useState([])
  const [base, setBase] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [resumenes, setResumenes] = useState({}) // despacho -> { efectivo, diferencia }
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/entrar'); return }
    const parsed = JSON.parse(u)
    if (!puedeVerModulo(parsed, 'historial', ['admin', 'auxiliar'])) { router.push('/despacho'); return }
    setUsuario(parsed)
    cargarFiltros()
    cargarHistorial(obtenerFechaActual(), obtenerFechaActual(), '', '')
  }, [])

  const cargarFiltros = async () => {
    const { data: vends } = await supabase.from('vendedores').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    const { data: ruts } = await supabase.from('rutas').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    if (vends) setVendedores(vends)
    if (ruts) setRutas(ruts)
  }

  // Rango de fechas (un día, una semana, el mes…): se ven todas las
  // liquidaciones del rango agrupadas por día, con el total vendido.
  const cargarHistorial = async (d1, d2, vId, rId) => {
    setCargando(true)
    if (d2 < d1) [d1, d2] = [d2, d1]
    let query = supabase
      .from('despachos_encab')
      .select('*, rutas(nombre), vendedores(nombre)')
      .gte('fecha', d1).lte('fecha', d2)
      .eq('estado', 'liquidado')
      .eq('empresa_id', getEmpresaId())
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    if (vId) query = query.eq('vendedor_id', vId)
    if (rId) query = query.eq('ruta_id', rId)
    const { data } = await query
    if (data) setDespachos(data)
    const ids = (data || []).map(d => d.id)
    const [{ data: res }, { data: liq }, { data: prods }] = ids.length ? await Promise.all([
      supabase.from('liquidaciones_detalle').select('despacho_id, efectivo, diferencia').in('despacho_id', ids).eq('empresa_id', getEmpresaId()),
      paginado(() => supabase.from('liquidaciones').select('despacho_id, sku, vendido_neto, efectivo_esperado').in('despacho_id', ids).eq('empresa_id', getEmpresaId())),
      supabase.from('productos').select('sku, nombre, orden_despacho').eq('empresa_id', getEmpresaId()),
    ]) : [{ data: [] }, { data: [] }, { data: [] }]
    const vendidoPor = {}, porSku = {}
    ;(liq || []).forEach(l => {
      vendidoPor[l.despacho_id] = (vendidoPor[l.despacho_id] || 0) + Number(l.efectivo_esperado || 0)
      const x = (porSku[l.sku] = porSku[l.sku] || { sku: l.sku, und: 0, valor: 0 })
      x.und += Number(l.vendido_neto || 0); x.valor += Number(l.efectivo_esperado || 0)
    })
    const nombres = Object.fromEntries((prods || []).map(p => [p.sku, p.nombre]))
    setVentasSku(Object.values(porSku).filter(x => x.und || x.valor).map(x => ({ ...x, nombre: nombres[x.sku] || x.sku })).sort((a, b) => b.valor - a.valor))
    setResumenes(Object.fromEntries(ids.map(id => [id, { ...((res || []).find(r => r.despacho_id === id) || {}), vendido: vendidoPor[id] || 0, tieneLiq: (res || []).some(r => r.despacho_id === id) }])))
    setCargando(false)
  }

  const verDetalle = async (d) => {
    setDespachSel(d)
    const [liqRes, prodsRes, liqDetRes, fiadosRes, gastosRes, transEnvRes, transRecRes, obsRes, consRes, descRes, transfRutaRes, baseRes] = await Promise.all([
      supabase.from('liquidaciones').select('*').eq('despacho_id', d.id),
      supabase.from('productos').select('sku, nombre, precio_venta, orden_despacho').eq('empresa_id', getEmpresaId()).order('nombre'),
      supabase.from('liquidaciones_detalle').select('*').eq('despacho_id', d.id).single(),
      supabase.from('liquidaciones_fiados').select('*').eq('despacho_id', d.id),
      supabase.from('liquidaciones_gastos').select('*').eq('despacho_id', d.id),
      supabase.from('transferencias_mercancia').select('*').eq('vendedor_origen_id', d.vendedor_id).eq('fecha', d.fecha).eq('empresa_id', getEmpresaId()),
      supabase.from('transferencias_mercancia').select('*').eq('vendedor_destino_id', d.vendedor_id).eq('fecha', d.fecha).eq('empresa_id', getEmpresaId()),
      supabase.from('obsequios').select('*').eq('despacho_id', d.id),
      supabase.from('consumos_empleado').select('*').eq('despacho_id', d.id).is('venta_id', null),
      supabase.from('liquidaciones_descuentos').select('*').eq('despacho_id', d.id),
      supabase.from('transferencias_ruta').select('*').eq('despacho_id', d.id),
      supabase.from('configuracion').select('valor').eq('parametro', 'base_despacho_' + d.id).eq('empresa_id', getEmpresaId()).maybeSingle(),
    ])
    let pm = {}
    if (liqRes.data && prodsRes.data) {
      prodsRes.data.forEach(p => { pm[p.sku] = p })
      // Precio especial por ruta (Maestros > Rutas), igual que en Liquidacion.
      if (d.ruta_id) {
        const { data: preciosRuta } = await supabase.from('rutas_precios').select('sku, precio_especial').eq('ruta_id', d.ruta_id).eq('empresa_id', getEmpresaId())
        ;(preciosRuta || []).forEach(pr => { if (pm[pr.sku]) pm[pr.sku] = { ...pm[pr.sku], precio_venta: pr.precio_especial } })
      }
      setDetalle(ordenarPorDespacho(liqRes.data.map(l => ({ ...l, producto: pm[l.sku] || {} }))))
    }
    setLiqDetalle(liqDetRes.data || null)
    setFiados(fiadosRes.data || [])
    setGastos(gastosRes.data || [])
    setObsequios((obsRes.data || []).map(o => ({ ...o, producto: pm[o.sku]?.nombre || o.sku })))
    setConsumos((consRes.data || []).map(c => ({ ...c, producto: pm[c.sku]?.nombre || c.sku })))
    setDescuentos((descRes.data || []).map(x => ({ ...x, producto: pm[x.sku]?.nombre || x.sku || '' })))
    setTransfRuta(transfRutaRes.data || [])
    setBase(parseFloat(baseRes.data?.valor || 0))
    const vm = {}
    vendedores.forEach(v => { vm[v.id] = v.nombre })
    setTransEnviadas((transEnvRes.data || []).map(t => ({ ...t, producto: pm[t.sku]?.nombre || t.sku, vendedor: vm[t.vendedor_destino_id] || 'Vendedor' })))
    setTransRecibidas((transRecRes.data || []).map(t => ({ ...t, producto: pm[t.sku]?.nombre || t.sku, vendedor: vm[t.vendedor_origen_id] || 'Vendedor' })))
  }

  // Valor guardado al liquidar (efectivo_esperado), no el precio de hoy: si
  // el precio cambio despues, el historial debe seguir cuadrando con lo que
  // se le cobro al vendedor ese dia.
  const valorLinea = (l) => l.efectivo_esperado ?? (l.vendido_neto * (l.producto?.precio_venta || 0))
  const totalVendido = () => detalle.reduce((sum, l) => sum + valorLinea(l), 0)
  const totalDespachado = () => detalle.reduce((sum, l) => sum + l.despachado, 0)
  const totalDevuelto = () => detalle.reduce((sum, l) => sum + (l.devuelto || 0), 0)
  const totalCambio = () => detalle.reduce((sum, l) => sum + (l.cambio || 0), 0)
  const fiadosNuevos = () => fiados.filter(f => f.tipo === 'fiado')
  const pagosFiados = () => fiados.filter(f => f.tipo === 'pago_fiado')
  const totalObsequios = () => obsequios.reduce((s, o) => s + (o.valor_unitario || 0) * (o.cantidad || 0), 0)
  const totalConsumos = () => consumos.reduce((s, c) => s + (c.valor || (c.valor_unitario || 0) * (c.cantidad || 0)), 0)
  const totalDescuentos = () => descuentos.reduce((s, x) => s + (x.valor || 0), 0)
  // Las que no llegaron y pasaron a cartera se trataron como por verificar al liquidar.
  const transfPorVerificar = () => transfRuta.filter(t => t.estado === 'por_verificar' || t.estado === 'a_cartera')
  const totalPorVerificar = () => transfPorVerificar().reduce((s, t) => s + (t.valor || 0), 0)
  const obsequiosPorSku = () => obsequios.reduce((m, o) => ({ ...m, [o.sku]: (m[o.sku] || 0) + (o.cantidad || 0) }), {})
  // Misma formula que Liquidacion (totalAEntregar / totalEntregado).
  const totalAEntregar = () => totalVendido() + base - (liqDetalle?.total_fiados || 0) + (liqDetalle?.total_pagos_fiados || 0)
    - totalDescuentos() - totalObsequios() - totalConsumos() - totalPorVerificar()
  const totalCruce = () => Number(liqDetalle?.cruce_proveedor || 0)
  // Las transferencias se guardan una por una (transferencias_ruta); el total
  // en liquidaciones_detalle solo existe en las liquidaciones de antes.
  const transfVerificadas = () => transfRuta.length
    ? transfRuta.filter(t => t.estado !== 'por_verificar' && t.estado !== 'a_cartera').reduce((s, t) => s + Number(t.valor || 0), 0)
    : Number(liqDetalle?.transferencias_bancarias || 0)
  const totalEntregado = () => (liqDetalle?.efectivo || 0) + transfVerificadas() + (liqDetalle?.total_gastos || 0) + totalCruce()
  const fmt = (n) => Math.round(n || 0).toLocaleString('es-CO')

  // Estilo del manual, igual que Liquidación.
  const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: 'var(--hoja)', linea: '#E3E1D8', suave: '#EFEDE6', rojo: 'var(--rojo)', rojoF: 'var(--rojo-suave)', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8' }
  const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
  const $ = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
  const conSigno = (n) => (n >= 0 ? '+' : '−') + $(Math.abs(n))
  const tarjeta = 'bg-white rounded-[18px] p-3.5 min-w-0'
  const campo = 'w-full rounded-xl px-3 min-h-[42px] text-[14.5px] bg-white border outline-none focus:border-[#1C1B19]'
  const pill = (texto, color, fondo) => <span className="inline-flex items-center text-[12px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap" style={{ color, background: fondo }}>{texto}</span>
  const pillDif = (dif) => Math.abs(dif) < 1 ? pill('Cuadra', C.verde, C.verdeF) : pill(conSigno(dif), dif < 0 ? C.rojo : C.ambar, dif < 0 ? C.rojoF : C.ambarF)
  const cifra = (etiqueta, valor, color) => (
    <div className={tarjeta + ' flex flex-col gap-0.5'}>
      <span className="text-[12.5px] font-bold" style={{ color: C.gris }}>{etiqueta}</span>
      <span className="font-extrabold text-[24px] tabular-nums leading-tight" style={{ ...titulo, color: color || C.tinta }}>{valor}</span>
    </div>
  )
  // Atrás vuelve a la lista de liquidaciones.
  const atrasDetalle = useAtras(!!despachSel, () => { setDespachSel(null); setDetalle([]); setLiqDetalle(null); setFiados([]); setGastos([]); setTransEnviadas([]); setTransRecibidas([]); setObsequios([]); setConsumos([]); setDescuentos([]); setTransfRuta([]); setBase(0) })
  const nombreLindo = (n) => (n || '').toLowerCase().replace(/(^|\s)\S/g, x => x.toUpperCase())
  const fechaLarga = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
  const seccion = (t, filas, total, colorTotal) => filas.length > 0 && (
    <section className={tarjeta + ' flex flex-col gap-1'}>
      <div className="flex justify-between items-baseline gap-2 pb-1">
        <h3 className="font-extrabold text-[17px]" style={titulo}>{t}</h3>
        {total != null && <b className="tabular-nums" style={{ color: colorTotal || C.tinta }}>{$(total)}</b>}
      </div>
      {filas.map((f, i) => (
        <div key={i} className="flex justify-between gap-3 py-1.5 text-[14px]" style={{ borderTop: `1px solid ${C.linea}` }}>
          <span className="min-w-0 leading-tight">{f[0]}{f[1] && <span className="block text-[12.5px]" style={{ color: C.gris }}>{f[1]}</span>}</span>
          <b className="tabular-nums shrink-0" style={{ color: f[3] || C.tinta }}>{f[2]}</b>
        </div>
      ))}
    </section>
  )

  if (despachSel) {
    const dif = Number(liqDetalle?.diferencia || 0)
    const filaCuadre = ([t, v, signo, color]) => {
      const n = Number(v) || 0
      return (
        <div key={t} className="flex justify-between gap-3 text-[14px]" style={{ opacity: n ? 1 : 0.55 }}>
          <span style={{ color: C.gris }}>{t}</span>
          <b className="tabular-nums" style={{ color: n ? color : C.gris }}>{n ? (signo || '') + $(n) : '$0'}</b>
        </div>
      )
    }
    const estadoTransf = (t) => t.estado === 'por_verificar' ? `Por verificar${t.fecha_limite ? ` · límite ${t.fecha_limite}` : ''}` : t.estado === 'cargada' ? 'Cargada al vendedor' : t.estado === 'descontada' ? 'Descontada en nómina' : t.estado === 'recibida' ? 'Llegó después' : t.estado === 'a_cartera' ? 'Pasó a cartera' : 'Verificada'
    return (
      <div style={{ background: C.fondo, minHeight: '100vh', color: C.tinta }}>
        <PageHeader buscar="Historial" title="Historial de liquidaciones"
          onBack={atrasDetalle} />
        <div className="p-4 max-w-6xl mx-auto flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-extrabold text-[24px] leading-tight" style={titulo}>{nombreLindo(despachSel.rutas?.nombre)}</h1>
              <p style={{ color: C.gris }}>{despachSel.vendedores?.nombre} · {fechaLarga(despachSel.fecha)}</p>
            </div>
            {liqDetalle && pillDif(dif)}
          </div>

          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {cifra('Salió', totalDespachado())}
            {cifra('Volvió', totalDevuelto())}
            {cifra('Cambios', totalCambio(), totalCambio() ? C.rojo : null)}
            {cifra('Vendido', $(totalVendido()))}
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_340px] items-start">
            <div className="flex flex-col gap-3 min-w-0">
              <section className={tarjeta}>
                <h3 className="font-extrabold text-[17px] pb-2" style={titulo}>Productos</h3>
                {/* Con espacio, tabla; en celular, fichas. */}
                <table className="hidden md:table w-full text-[14px] tabular-nums">
                  <thead>
                    <tr className="text-[12px] uppercase tracking-wider" style={{ color: C.gris }}>
                      <th className="text-left font-bold pb-1.5">Producto</th><th className="text-right font-bold pb-1.5">Salió</th><th className="text-right font-bold pb-1.5">Volvió</th><th className="text-right font-bold pb-1.5">Cambio</th><th className="text-right font-bold pb-1.5">Vendido</th><th className="text-right font-bold pb-1.5">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.map((l, i) => (
                      <tr data-fila key={i} style={{ borderTop: `1px solid ${C.linea}` }}>
                        <td className="py-2 pr-2"><b>{l.producto?.nombre || l.sku}</b>{obsequiosPorSku()[l.sku] > 0 && <span className="block text-[12px]" style={{ color: C.gris }}>Incluye {obsequiosPorSku()[l.sku]} de obsequio</span>}</td>
                        <td className="text-right">{l.despachado}</td>
                        <td className="text-right">{l.devuelto || 0}</td>
                        <td className="text-right" style={{ color: l.cambio ? C.rojo : undefined }}>{l.cambio || 0}</td>
                        <td className="text-right font-bold">{l.vendido_neto}</td>
                        <td className="text-right font-bold">{$(valorLinea(l))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="md:hidden flex flex-col">
                  {detalle.map((l, i) => (
                    <div data-fila key={i} className="flex justify-between gap-3 py-2 text-[14px]" style={{ borderTop: `1px solid ${C.linea}` }}>
                      <span className="min-w-0 leading-tight"><b>{l.producto?.nombre || l.sku}</b>
                        <span className="block text-[12.5px] tabular-nums" style={{ color: C.gris }}>Salió {l.despachado} · volvió {l.devuelto || 0}{l.cambio ? ` · cambio ${l.cambio}` : ''} · vendió {l.vendido_neto}</span></span>
                      <b className="tabular-nums shrink-0">{$(valorLinea(l))}</b>
                    </div>
                  ))}
                </div>
              </section>

              <div className="grid gap-3 md:grid-cols-2 items-start">
                {seccion('Transferencias', transfRuta.map(t => [t.banco || 'Transferencia', [estadoTransf(t), t.referencia].filter(Boolean).join(' · '), $(t.valor), t.estado === 'por_verificar' ? C.rojo : null]), transfRuta.reduce((s, t) => s + Number(t.valor || 0), 0))}
                {seccion('Créditos del día', fiadosNuevos().map(f => [f.nombre_cliente, null, $(f.valor)]), fiadosNuevos().reduce((s, f) => s + Number(f.valor || 0), 0))}
                {seccion('Abonos a créditos', pagosFiados().map(f => [f.nombre_cliente, null, $(f.valor)]), pagosFiados().reduce((s, f) => s + Number(f.valor || 0), 0))}
                {seccion('Gastos de ruta', gastos.map(g => [g.categoria || g.concepto || 'Gasto', g.categoria && g.concepto ? g.concepto : null, $(g.valor)]), gastos.reduce((s, g) => s + Number(g.valor || 0), 0))}
                {seccion('Descuentos', descuentos.map(x => [x.concepto || 'Descuento', x.producto || null, $(x.valor), C.rojo]), totalDescuentos(), C.rojo)}
                {seccion('Obsequios', obsequios.map(o => [`${o.producto} · ${o.cantidad} und`, `Autorizó: ${o.autorizado_por || '—'}`, $((o.valor_unitario || 0) * (o.cantidad || 0)), C.rojo]), totalObsequios(), C.rojo)}
                {seccion('Consumo propio', consumos.map(c => [`${c.producto} · ${c.cantidad} und`, null, $(c.valor || (c.valor_unitario || 0) * (c.cantidad || 0)), C.rojo]), totalConsumos(), C.rojo)}
                {seccion('Mercancía entre rutas', [
                  ...transEnviadas.map(t => [`${t.producto} · ${t.cantidad} und`, `Pasó a ${t.vendedor}`, t.valor_total ? $(t.valor_total) : '']),
                  ...transRecibidas.map(t => [`${t.producto} · ${t.cantidad} und`, `Recibió de ${t.vendedor}`, t.valor_total ? $(t.valor_total) : '']),
                ])}
              </div>
            </div>

            {liqDetalle && (
              <aside className={tarjeta + ' flex flex-col gap-1.5 lg:sticky lg:top-4'}>
                <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: C.gris }}>Cuadre</span>
                {[
                  ['Vendido', totalVendido()],
                  ['Abonos a créditos', liqDetalle.total_pagos_fiados, '+'],
                  ['Base', base, '+'],
                  ['Créditos', liqDetalle.total_fiados, '−', C.rojo],
                  ['Transf. por verificar', totalPorVerificar(), '−', C.rojo],
                  ['Obsequios', totalObsequios(), '−', C.rojo],
                  ['Consumo propio', totalConsumos(), '−', C.rojo],
                  ['Descuentos', totalDescuentos(), '−', C.rojo],
                ].map(filaCuadre)}
                <div className="flex justify-between gap-3 text-[14.5px] pt-1.5 mt-0.5" style={{ borderTop: `1px solid ${C.linea}` }}><b>Debía entregar</b><b className="tabular-nums">{$(totalAEntregar())}</b></div>
                {[
                  ['Efectivo', liqDetalle.efectivo],
                  ['Transf. verificadas', transfVerificadas()],
                  ['Gastos', liqDetalle.total_gastos],
                  ...(totalCruce() > 0 ? [['Cruce con proveedor', totalCruce()]] : []),
                ].map(filaCuadre)}
                <div className="flex justify-between gap-3 text-[14.5px] pt-1.5 mt-0.5" style={{ borderTop: `1px solid ${C.linea}` }}><b>Entregó</b><b className="tabular-nums">{$(totalEntregado())}</b></div>
                <div className="rounded-2xl px-3 py-2.5 mt-1 flex justify-between items-center gap-2" style={{ background: Math.abs(dif) < 1 ? C.verdeF : dif < 0 ? C.rojoF : C.ambarF }}>
                  <span className="font-bold" style={{ color: Math.abs(dif) < 1 ? C.verde : dif < 0 ? C.rojo : C.ambar }}>Diferencia</span>
                  <span className="font-extrabold text-[22px] tabular-nums" style={{ ...titulo, color: Math.abs(dif) < 1 ? C.verde : dif < 0 ? C.rojo : C.ambar }}>{Math.abs(dif) < 1 ? 'Cuadra' : conSigno(dif)}</span>
                </div>
              </aside>
            )}
          </div>
        </div>
      </div>
    )
  }

  const vendidoRango = despachos.reduce((s, d) => s + Number(resumenes[d.id]?.vendido || 0), 0)
  const efectivoRango = despachos.reduce((s, d) => s + Number(resumenes[d.id]?.efectivo || 0), 0)
  const unDia = desde === hasta
  const porDia = despachos.reduce((m, d) => { (m[d.fecha] = m[d.fecha] || []).push(d); return m }, {})
  const fechaCortaDia = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })
  // Atajos de rango: la semana va de lunes a domingo.
  const hoyF = obtenerFechaActual()
  const sumar = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }
  const lunes = (f) => { const d = new Date(f + 'T12:00:00'); return sumar(f, -((d.getDay() + 6) % 7)) }
  const RANGOS = [
    ['Hoy', hoyF, hoyF],
    ['Ayer', sumar(hoyF, -1), sumar(hoyF, -1)],
    ['Esta semana', lunes(hoyF), hoyF],
    ['Semana pasada', sumar(lunes(hoyF), -7), sumar(lunes(hoyF), -1)],
    ['Este mes', hoyF.slice(0, 8) + '01', hoyF],
  ]
  const ponerRango = (d1, d2) => { if (d2 < d1) [d1, d2] = [d2, d1]; setDesde(d1); setHasta(d2); cargarHistorial(d1, d2, vendedorFiltro, rutaFiltro) }
  const tarjetaDespacho = (d) => {
    const r = resumenes[d.id]
    const dif = Number(r?.diferencia || 0)
    return (
      <button data-fila key={d.id} onClick={() => verDetalle(d)} className={tarjeta + ' text-left flex flex-col gap-2 hover:ring-2 hover:ring-[#1C1B19]/10'}>
        <div className="flex justify-between items-start gap-2">
          <span className="min-w-0"><b className="block text-[16px] leading-tight" style={titulo}>{nombreLindo(d.rutas?.nombre)}</b><span className="text-[13px]" style={{ color: C.gris }}>{d.vendedores?.nombre}</span></span>
          {r?.tieneLiq && pillDif(dif)}
        </div>
        <div className="flex justify-between gap-2 text-[13.5px] tabular-nums" style={{ color: C.gris }}>
          <span>Vendió <b style={{ color: C.tinta }}>{$(r?.vendido)}</b></span>
          {r?.tieneLiq && <span>Efectivo <b style={{ color: C.tinta }}>{$(r.efectivo)}</b></span>}
        </div>
      </button>
    )
  }
  const difDia = despachos.reduce((s, d) => s + Number(resumenes[d.id]?.diferencia || 0), 0)
  return (
    <div style={{ background: C.fondo, minHeight: '100vh', color: C.tinta }}>
      <PageHeader buscar="Historial" title="Historial de liquidaciones" />
      <div className="p-4 max-w-6xl mx-auto flex flex-col gap-3">
        <div className={tarjeta + ' grid gap-3 sm:grid-cols-4'}>
          <div className="sm:col-span-4 flex gap-1.5 flex-wrap" role="group" aria-label="Rango de fechas">
            {RANGOS.map(([n, d1, d2]) => {
              const activo = desde === d1 && hasta === d2
              return <button key={n} type="button" aria-pressed={activo} onClick={() => ponerRango(d1, d2)} className="rounded-full min-h-[36px] px-3.5 text-[13.5px] font-bold"
                style={activo ? { background: C.tinta, color: '#fff' } : { background: C.suave, color: C.tinta }}>{n}</button>
            })}
          </div>
          <label className="flex flex-col gap-1 text-[13px] font-bold" style={{ color: C.gris }}>Desde
            <CampoFecha value={desde} max={hoyF} onChange={e => e.target.value && ponerRango(e.target.value, hasta)} className={campo} style={{ borderColor: C.linea, color: C.tinta }} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-bold" style={{ color: C.gris }}>Hasta
            <CampoFecha value={hasta} max={hoyF} onChange={e => e.target.value && ponerRango(desde, e.target.value)} className={campo} style={{ borderColor: C.linea, color: C.tinta }} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-bold" style={{ color: C.gris }}>Vendedor
            <select value={vendedorFiltro} onChange={e => { setVendedorFiltro(e.target.value); cargarHistorial(desde, hasta, e.target.value, rutaFiltro) }} className={campo} style={{ borderColor: C.linea, color: C.tinta }}>
              <option value="">Todos</option>
              {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-bold" style={{ color: C.gris }}>Ruta
            <select value={rutaFiltro} onChange={e => { setRutaFiltro(e.target.value); cargarHistorial(desde, hasta, vendedorFiltro, e.target.value) }} className={campo} style={{ borderColor: C.linea, color: C.tinta }}>
              <option value="">Todas</option>
              {rutas.map(r => <option key={r.id} value={r.id}>{nombreLindo(r.nombre)}</option>)}
            </select>
          </label>
        </div>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {cifra('Vendido', $(vendidoRango))}
          {cifra('Liquidaciones', despachos.length)}
          {cifra('Efectivo entregado', $(efectivoRango))}
          {cifra(unDia ? 'Diferencias del día' : 'Diferencias', Math.abs(difDia) < 1 ? '$0' : conSigno(difDia), difDia < -0.5 ? C.rojo : null)}
        </div>

        {cargando ? (
          <p className="text-center py-8" style={{ color: C.gris }}>Cargando…</p>
        ) : despachos.length === 0 ? (
          <div className={tarjeta + ' text-center py-8'}><b>{unDia ? 'No hay liquidaciones en esta fecha' : 'No hay liquidaciones en este rango'}</b></div>
        ) : (
          <>
            {Object.entries(porDia).map(([f, ds]) => (
              <section key={f} className="flex flex-col gap-2" aria-label={fechaLarga(f)}>
                {!unDia && (
                  <div className="flex justify-between items-baseline gap-2 pt-2">
                    <h3 className="font-extrabold text-[17px] first-letter:uppercase" style={titulo}>{fechaLarga(f)}</h3>
                    <span className="text-[13.5px] tabular-nums" style={{ color: C.gris }}>{ds.length} {ds.length === 1 ? 'liquidación' : 'liquidaciones'} · <b style={{ color: C.tinta }}>{$(ds.reduce((s, d) => s + Number(resumenes[d.id]?.vendido || 0), 0))}</b></span>
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{ds.map(tarjetaDespacho)}</div>
              </section>
            ))}
            {!unDia && ventasSku.length > 0 && (
              <section className={tarjeta + ' flex flex-col gap-1 mt-2'}>
                <div className="flex justify-between items-baseline gap-2 pb-1">
                  <h3 className="font-extrabold text-[17px]" style={titulo}>Ventas por producto</h3>
                  <span className="text-[13px]" style={{ color: C.gris }}>{fechaCortaDia(desde)} a {fechaCortaDia(hasta)}</span>
                </div>
                {ventasSku.map(x => (
                  <div data-fila key={x.sku} className="flex justify-between gap-3 py-1.5 text-[14px] tabular-nums" style={{ borderTop: `1px solid ${C.linea}` }}>
                    <span className="min-w-0 leading-tight"><b>{x.nombre}</b><span className="block text-[12.5px]" style={{ color: C.gris }}>{x.und.toLocaleString('es-CO')} und</span></span>
                    <b className="shrink-0">{$(x.valor)}</b>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
