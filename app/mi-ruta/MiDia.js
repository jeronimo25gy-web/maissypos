'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { leerEnCurso } from '@/lib/borrador-ruta'

// Recaudos del día: el respaldo de la hoja de liquidacion, en vivo. El vendedor
// ve en cualquier momento del dia que transferencias lleva, a quien le fio, que
// abonos cobro y que gastos anoto, y cuanto efectivo deberia tener en la mano.
// Solo lee: lo vendido con ticket (ventas_ruta) y lo anotado en el borrador
// "en curso" (abonos, transferencias de abonos, fiados del PdV, gastos). No
// reemplaza el cierre: la devolucion y lo vendido sin ticket se ven en Cerrar.
const TINTA = '#1C1B19', GRIS = '#5A5750', LINEA = '#E3E1D8', ROJO = '#C41230', VERDE = '#1E7B4A'
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const fmt = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
const num = (v) => parseFloat(v) || 0
const hora = (iso) => iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) : ''
const fechaCorta = (f) => f ? new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }) : ''
const TARJETA = 'bg-white rounded-2xl p-3.5 flex flex-col gap-1'

const Fila = ({ izq, sub, der, color }) => (
  <div className="flex items-center gap-2 py-2 text-sm" style={{ borderTop: `1px solid ${LINEA}` }}>
    <div className="flex-1 min-w-0">
      <div className="truncate">{izq}</div>
      {sub && <div className="text-[12px] truncate" style={{ color: GRIS }}>{sub}</div>}
    </div>
    <b className="tabular-nums shrink-0" style={color ? { color } : undefined}>{der}</b>
  </div>
)

const Bloque = ({ nombre, total, vacio, children, signo = '' }) => (
  <section className={TARJETA}>
    <div className="flex items-baseline justify-between gap-2 pb-1">
      <h3 className="font-extrabold text-[16px]" style={titulo}>{nombre}</h3>
      <b className="tabular-nums text-[15px]">{signo}{fmt(total)}</b>
    </div>
    {children}
    {vacio && <p className="text-[13px] py-1" style={{ color: GRIS }}>{vacio}</p>}
  </section>
)

export default function MiDia({ despachoId, onVolver }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')

  const cargar = async () => {
    setError('')
    if (!despachoId) { setD({ sinDespacho: true }); return }
    const empresaId = getEmpresaId()
    const [{ data: desp }, { data: conf }, { data: ventas, error: e1 }, borr] = await Promise.all([
      supabase.from('despachos_encab').select('fecha, rutas(nombre)').eq('id', despachoId).eq('empresa_id', empresaId).maybeSingle(),
      supabase.from('configuracion').select('valor').eq('parametro', 'base_despacho_' + despachoId).eq('empresa_id', empresaId).maybeSingle(),
      supabase.from('ventas_ruta').select('id, numero, created_at, nombre_cliente, total, forma_pago, fecha_pago')
        .eq('despacho_id', despachoId).eq('estado', 'activa').eq('empresa_id', empresaId).order('created_at'),
      leerEnCurso(despachoId),
    ])
    if (e1) { setError(e1.message); return }
    const b = borr?.datos || {}
    const vs = ventas || []
    // Los abonos guardan el id del credito; el nombre sale de cartera.
    const pagos = (b.pagosFiados || []).filter(p => num(p.valor) > 0)
    const idsCartera = [...new Set(pagos.map(p => p.cartera_fiados_id).filter(Boolean))]
    const { data: cart } = idsCartera.length
      ? await supabase.from('cartera_fiados').select('id, nombre_cliente').in('id', idsCartera).eq('empresa_id', empresaId)
      : { data: [] }
    const nombreCredito = Object.fromEntries((cart || []).map(c => [c.id, c.nombre_cliente]))

    // Transferencias: las de los tickets y las anotadas aparte (abonos, PdV).
    const transTickets = vs.filter(v => v.forma_pago === 'transferencia').map(v => {
      const c = (b.comprobantes || []).find(x => x.key === 'venta-' + v.id)
      return { key: v.id, quien: v.nombre_cliente || 'Venta en la calle', sub: `Ticket #${v.numero} · ${hora(v.created_at)}`, valor: num(v.total), estado: c?.estado || 'por_verificar' }
    })
    const transOtras = (b.comprobantes || []).filter(c => !String(c.key || '').startsWith('venta-') && num(c.valor) > 0)
      .map(c => ({ key: c.key, quien: c.referencia || 'Transferencia anotada', sub: c.banco || '', valor: num(c.valor), estado: c.estado || 'por_verificar' }))
    const creditosTickets = vs.filter(v => v.forma_pago === 'credito')
      .map(v => ({ key: v.id, quien: v.nombre_cliente, sub: `Ticket #${v.numero} · paga ${fechaCorta(v.fecha_pago) || 'sin fecha'}`, valor: num(v.total) }))
    const creditosOtros = (b.fiados || []).filter(f => !f.ticket && num(f.valor) > 0)
      .map((f, i) => ({ key: 'f' + i, quien: f.nombre || 'Sin nombre', sub: f.fecha_pago ? `paga ${fechaCorta(f.fecha_pago)}` : '', valor: num(f.valor) }))
    const abonos = pagos.map((p, i) => ({
      key: 'a' + i, quien: nombreCredito[p.cartera_fiados_id] || p.nombre_manual || 'Abono',
      sub: `${p.forma === 'transferencia' ? 'Transferencia' : 'Efectivo'}${p.hora ? ' · ' + hora(p.hora) : ''}`, valor: num(p.valor), forma: p.forma || 'efectivo',
    }))
    const gastos = (b.gastos || []).filter(g => num(g.valor) > 0).map((g, i) => ({ key: 'g' + i, quien: g.categoria || 'Gasto', sub: g.concepto || '', valor: num(g.valor) }))

    setD({
      fecha: desp?.fecha, ruta: desp?.rutas?.nombre, base: conf ? num(conf.valor) : 0, cerrado: borr && borr.estado !== 'en_curso',
      efectivo: vs.filter(v => v.forma_pago === 'efectivo').reduce((s, v) => s + num(v.total), 0),
      nEfectivo: vs.filter(v => v.forma_pago === 'efectivo').length,
      transferencias: [...transTickets, ...transOtras], creditos: [...creditosTickets, ...creditosOtros], abonos, gastos,
    })
  }

  useEffect(() => { cargar() }, [despachoId])

  if (error) return <div className="p-4 flex flex-col gap-3"><p className="text-sm" style={{ color: ROJO }}>No se pudo cargar: {error}</p><button onClick={cargar} className="min-h-[46px] rounded-xl bg-white font-bold">Reintentar</button></div>
  if (!d) return <p className="p-4 text-sm" style={{ color: GRIS }}>Cargando…</p>

  const suma = (l) => l.reduce((s, x) => s + x.valor, 0)
  const totalTrans = suma(d.transferencias || [])
  const totalCred = suma(d.creditos || [])
  const totalAbonos = suma(d.abonos || [])
  const abonosEfectivo = suma((d.abonos || []).filter(a => a.forma !== 'transferencia'))
  const totalGastos = suma(d.gastos || [])
  const enMano = (d.base || 0) + (d.efectivo || 0) + abonosEfectivo - totalGastos

  return (
    <div className="flex flex-col gap-3 pb-6">
      <div className="flex items-center gap-2">
        <button onClick={onVolver} aria-label="Volver" className="w-10 h-10 rounded-xl bg-white font-bold text-lg">‹</button>
        <div className="flex-1 min-w-0">
          <h2 className="font-extrabold text-[20px] leading-tight" style={titulo}>Recaudos del día</h2>
          {d.ruta && <p className="text-[13px]" style={{ color: GRIS }}>{d.ruta} · {fechaCorta(d.fecha)}</p>}
        </div>
        {!d.sinDespacho && <button onClick={cargar} className="px-3 min-h-[40px] rounded-xl bg-white text-[13px] font-bold">Actualizar</button>}
      </div>

      {d.sinDespacho ? (
        <div className={TARJETA}><p className="text-sm" style={{ color: GRIS }}>No tienes un despacho abierto hoy.</p></div>
      ) : <>
        <section className="rounded-2xl p-4 flex flex-col gap-1 text-white" style={{ background: TINTA }}>
          <span className="text-[13px] font-bold opacity-80">Efectivo que deberías tener en la mano</span>
          <b className="tabular-nums text-[32px] leading-tight" style={titulo}>{fmt(enMano)}</b>
          <div className="text-[13px] opacity-80 flex flex-col gap-0.5 pt-1">
            <div className="flex justify-between"><span>Base</span><span className="tabular-nums">{fmt(d.base)}</span></div>
            <div className="flex justify-between"><span>Ventas en efectivo ({d.nEfectivo})</span><span className="tabular-nums">+{fmt(d.efectivo)}</span></div>
            {abonosEfectivo > 0 && <div className="flex justify-between"><span>Abonos en efectivo</span><span className="tabular-nums">+{fmt(abonosEfectivo)}</span></div>}
            {totalGastos > 0 && <div className="flex justify-between"><span>Gastos</span><span className="tabular-nums">−{fmt(totalGastos)}</span></div>}
          </div>
          <p className="text-[12px] opacity-70 pt-1">Solo cuenta lo que tiene ticket. Lo vendido sin ticket no está aquí.</p>
          {d.cerrado && <p className="text-[12px] font-bold pt-1" style={{ color: '#F5C200' }}>Ya enviaste el cierre de este despacho.</p>}
        </section>

        <Bloque nombre={`Transferencias · ${d.transferencias.length}`} total={totalTrans} vacio={d.transferencias.length ? '' : 'Ninguna todavía.'}>
          {d.transferencias.map(t => (
            <Fila key={t.key} izq={t.quien} sub={[t.sub, t.estado === 'verificada' ? 'verificada' : 'por verificar'].filter(Boolean).join(' · ')}
              der={fmt(t.valor)} color={t.estado === 'verificada' ? VERDE : undefined} />
          ))}
        </Bloque>

        <Bloque nombre={`Créditos · ${d.creditos.length}`} total={totalCred} vacio={d.creditos.length ? '' : 'No has fiado hoy.'}>
          {d.creditos.map(c => <Fila key={c.key} izq={c.quien} sub={c.sub} der={fmt(c.valor)} />)}
        </Bloque>

        <Bloque nombre={`Abonos cobrados · ${d.abonos.length}`} total={totalAbonos} vacio={d.abonos.length ? '' : 'No has cobrado abonos hoy.'}>
          {d.abonos.map(a => <Fila key={a.key} izq={a.quien} sub={a.sub} der={fmt(a.valor)} />)}
        </Bloque>

        {d.gastos.length > 0 && (
          <Bloque nombre={`Gastos · ${d.gastos.length}`} total={totalGastos} signo="−">
            {d.gastos.map(g => <Fila key={g.key} izq={g.quien} sub={g.sub} der={fmt(g.valor)} color={ROJO} />)}
          </Bloque>
        )}
      </>}
    </div>
  )
}
