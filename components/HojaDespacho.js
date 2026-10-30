'use client'
import { supabase } from '@/lib/supabase'
import { grupoDespacho } from '@/lib/orden-productos'

// Hoja de despacho. Frente: lo que lleva en el orden de cargue, con espacio
// para lo que vuelve y el cambio. Reverso en dos mitades: transferencias a un
// lado; al otro los fiados que pagan ese dia, creditos nuevos, gastos,
// obsequios y mercancia entre vendedores. Solo titulos, sin cuadros ni rayas,
// y sin rellenos (rinde la tinta).
export const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', suave: '#EFEDE6', linea: '#B8B4AA' }
export const TITULO = 'var(--font-titulo), Georgia, serif'
export const n = (v) => Math.round(Number(v) || 0).toLocaleString('es-CO')
// Por ahora todo en media carta (el formato pequeño de Arepas esta en revision).
const MAX_CUARTO = 0
const TAM = { media: { w: 528, h: 816, pad: 26 }, cuarto: { w: 408, h: 528, pad: 22 } }
const fechaLarga = (f) => { const t = new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '').replace(',', ''); return t.charAt(0).toUpperCase() + t.slice(1) }
const fechaCorta = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }).replace('.', '')
export const nombreRuta = (r) => (r || '').replace(/^RUTA\s+/i, '').replace(/\b(\w)(\w*)/g, (_, a, b) => a + b.toLowerCase())

export async function cargarHoja(d, empresaId) {
  const [{ data: det }, { data: prods }, { data: config }, { data: fiados }, { data: lts }, { data: vehs }] = await Promise.all([
    supabase.from('despachos_detalle').select('sku, total').eq('despacho_id', d.id),
    supabase.from('productos').select('sku, nombre, categoria, tipo, orden_despacho').eq('empresa_id', empresaId).order('orden_despacho', { ascending: true, nullsFirst: false }).order('nombre'),
    supabase.from('configuracion').select('valor').eq('parametro', 'base_despacho_' + d.id).eq('empresa_id', empresaId).maybeSingle(),
    // Solo los fiados que se pagan ese dia; los vencidos y los demas se ven en Mi ruta.
    supabase.from('cartera_fiados').select('nombre_cliente, saldo').eq('estado', 'pendiente').eq('empresa_id', empresaId).eq('fecha_pago', d.fecha)
      .or(`ruta_id.eq.${d.ruta_id},vendedor_id.eq.${d.vendedor_id}`).order('nombre_cliente'),
    supabase.from('lotes_salida').select('sku, fecha_lote, cantidad').eq('despacho_id', d.id).eq('empresa_id', empresaId),
    d.ruta_id ? supabase.from('vehiculos').select('placa').eq('ruta_id', d.ruta_id).eq('empresa_id', empresaId).limit(1) : Promise.resolve({ data: [] }),
  ])
  const cant = {}
  ;(det || []).forEach(i => { cant[i.sku] = (cant[i.sku] || 0) + Number(i.total || 0) })
  const lotes = {}
  ;(lts || []).forEach(l => { const m = (lotes[l.sku] = lotes[l.sku] || {}); m[l.fecha_lote] = (m[l.fecha_lote] || 0) + Number(l.cantidad || 0) })
  const productos = (prods || []).filter(p => cant[p.sku] > 0).map(p => ({
    ...p, cantidad: cant[p.sku],
    lote: lotes[p.sku] ? Object.entries(lotes[p.sku]).sort(([a], [b]) => a.localeCompare(b)).map(([f, q]) => `${f === d.fecha ? 'hoy' : 'del ' + fechaCorta(f)} ${n(q)}`).join(' · ') : '',
  }))
  const grupos = productos.reduce((acc, p) => { const g = grupoDespacho(p); const x = acc.find(y => y.nombre === g); if (x) x.items.push(p); else acc.push({ nombre: g, items: [p] }); return acc }, [])
  return {
    d, productos, grupos, total: productos.reduce((s, p) => s + p.cantidad, 0),
    base: config ? Number(config.valor) : 0, placa: vehs?.[0]?.placa || '', fiados: fiados || [],
    tam: productos.length <= MAX_CUARTO ? 'cuarto' : 'media',
  }
}

// ---------- Frente ----------
export function Frente({ h, empresa, logo }) {
  const t = TAM[h.tam], cuarto = h.tam === 'cuarto'
  const conGrupos = h.grupos.length > 1
  const renglones = h.productos.length + (conGrupos ? h.grupos.length * 0.8 : 0) + 1
  const espacio = cuarto ? 300 : 470
  const fila = cuarto ? Math.max(20, Math.min(48, espacio / renglones)) : Math.max(13, Math.min(26, espacio / renglones))
  const letra = cuarto ? Math.max(11, Math.min(15, fila * 0.34 + 1)) : Math.max(10, Math.min(13, fila * 0.72))
  const th = { fontSize: '8.5px', fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: C.gris, padding: '0 3px 4px', borderBottom: `1.5px solid ${C.tinta}`, textAlign: 'center' }
  const td = { borderBottom: `.8px solid ${C.linea}`, padding: '0 4px', height: fila, fontSize: letra }
  const num = { ...td, textAlign: 'center', fontWeight: 800, fontSize: letra + 1 }
  const esc = { ...td, borderLeft: `.8px solid ${C.linea}`, width: '15%' }
  const hora = h.d.hora_cargue ? new Date(h.d.hora_cargue).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) : '—'
  return (
    <div style={{ width: t.w, height: t.h, padding: t.pad, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', fontFamily: 'var(--font-texto), Arial, sans-serif', color: C.tinta, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, paddingBottom: 8, borderBottom: `1.5px solid ${C.tinta}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo ? <img src={logo} alt={empresa?.nombre || ''} style={{ height: cuarto ? 40 : 46, width: 'auto' }} /> : <b style={{ fontFamily: TITULO, fontSize: 20, color: '#C41230' }}>Maissy</b>}
        <div style={{ textAlign: 'right', lineHeight: 1.15 }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#C41230' }}>Despacho de ruta</div>
          <div style={{ fontFamily: TITULO, fontWeight: 800, fontSize: cuarto ? 16 : 17 }}>{nombreRuta(h.d.rutas?.nombre)}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 14px', fontSize: 11, padding: '7px 0 8px' }}>
        <div><span style={{ color: C.gris }}>Vendedor</span> {h.d.vendedores?.nombre || '—'}</div>
        <div><span style={{ color: C.gris }}>Fecha</span> {fechaLarga(h.d.fecha)}</div>
        <div><span style={{ color: C.gris }}>Cargue</span> {hora}</div>
        <div><span style={{ color: C.gris }}>Vehículo</span> {h.placa || '—'}</div>
        <div><span style={{ color: C.gris }}>Base</span> ${n(h.base)}</div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums', color: C.tinta }}>
        <thead><tr><th style={{ ...th, textAlign: 'left' }}>Producto</th><th style={th}>Lleva</th><th style={th}>Vuelve</th><th style={th}>Cambio</th></tr></thead>
        <tbody>
          {h.grupos.map(g => [
            conGrupos && <tr key={'g' + g.nombre}><td colSpan={4} style={{ padding: '3px 4px 0', fontSize: 8, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: C.gris }}>{g.nombre}</td></tr>,
            ...g.items.map(p => (
              <tr key={p.sku}>
                <td style={td}>{p.nombre}{p.lote && <span style={{ display: 'block', fontSize: 9, color: C.gris, lineHeight: 1.1 }}>{p.lote}</span>}</td>
                <td style={num}>{n(p.cantidad)}</td><td style={esc} /><td style={esc} />
              </tr>
            )),
          ])}
          <tr>
            <td style={{ ...td, borderTop: `1.5px solid ${C.tinta}`, borderBottom: 0, fontWeight: 800 }}>Total</td>
            <td style={{ ...num, borderTop: `1.5px solid ${C.tinta}`, borderBottom: 0 }}>{n(h.total)}</td>
            <td style={{ ...esc, borderTop: `1.5px solid ${C.tinta}`, borderBottom: 0 }} /><td style={{ ...esc, borderTop: `1.5px solid ${C.tinta}`, borderBottom: 0 }} />
          </tr>
        </tbody>
      </table>
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10 }}>
        <div style={{ fontSize: 9, color: C.gris }}>Cambio: cantidad y letra (D dañado · V vencido · S mal sellado). Ejemplo: 2D.{h.productos.some(p => p.lote.includes('del')) ? ' Cargar primero lo más viejo.' : ''}</div>
        {!cuarto && <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, fontSize: 11 }}>Efectivo entregado $<span style={{ flex: 1, borderBottom: `.8px solid ${C.tinta}`, height: 16 }} /></div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 9.5, color: C.gris }}>
          <div style={{ borderTop: `.8px solid ${C.tinta}`, paddingTop: 2 }}>Despachó</div>
          <div style={{ borderTop: `.8px solid ${C.tinta}`, paddingTop: 2 }}>Vendedor recibe</div>
        </div>
      </div>
    </div>
  )
}

// ---------- Reverso ----------
export function Reverso({ h }) {
  const t = TAM[h.tam], cuarto = h.tam === 'cuarto'
  // Muchos fiados: a dos columnas y letra mas pequeña; si aun no caben, el resto queda en Mi ruta.
  const tope = cuarto ? 6 : 16
  const visibles = h.fiados.slice(0, tope)
  const dosColumnas = visibles.length > (cuarto ? 3 : 8)
  const h4 = { margin: '2px 0 2px', fontSize: cuarto ? 8 : 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }
  const sub = { display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: cuarto ? 7 : 7.5, color: C.gris, textTransform: 'uppercase', letterSpacing: '.06em' }
  const sec = (titulo, crece, a, b, primero) => (
    <div style={{ flex: crece, display: 'flex', flexDirection: 'column', minHeight: 0, borderTop: primero ? 0 : `1px solid ${C.tinta}`, paddingTop: primero ? 0 : 4, marginTop: primero ? 0 : 6 }}>
      <div style={h4}>{titulo}</div><div style={sub}><span>{a}</span><span>{b}</span></div>
    </div>
  )
  return (
    <div style={{ width: t.w, height: t.h, padding: cuarto ? 18 : 22, display: 'flex', flexDirection: 'column', gap: 8, boxSizing: 'border-box', fontFamily: 'var(--font-texto), Arial, sans-serif', color: C.tinta, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10, color: C.gris, borderBottom: `1.5px solid ${C.tinta}`, paddingBottom: 5 }}>
        <b style={{ color: C.tinta, fontSize: 11 }}>{nombreRuta(h.d.rutas?.nombre)} · {h.d.vendedores?.nombre || ''}</b><span>{fechaLarga(h.d.fecha)}</span>
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, paddingRight: 12, borderRight: `1px solid ${C.tinta}` }}>
          {sec('Transferencias', 1, 'Cliente o referencia · banco', 'Valor', true)}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, fontSize: 10, fontWeight: 700, paddingTop: 6, borderTop: `1px solid ${C.tinta}` }}>Total transferencias $<i style={{ flex: 1, borderBottom: `1px solid ${C.tinta}`, height: 14 }} /></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, paddingLeft: 12 }}>
          {visibles.length > 0 && (
            <div>
              <div style={h4}>Fiados que pagan hoy</div>
              <div style={{ display: 'grid', gridTemplateColumns: dosColumnas ? '1fr 1fr' : '1fr', columnGap: 10 }}>
                {visibles.map((f, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: dosColumnas || cuarto ? 8.5 : 9.5, borderBottom: `.8px solid ${C.linea}`, padding: '3px 0 1px', fontVariantNumeric: 'tabular-nums', minWidth: 0 }}>
                    <b style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nombre_cliente}</b><span style={{ color: C.gris }}>${n(f.saldo)}</span>
                  </div>
                ))}
              </div>
              {h.fiados.length > tope && <div style={{ fontSize: 8, color: C.gris, paddingTop: 2 }}>+{h.fiados.length - tope} más en Mi ruta</div>}
            </div>
          )}
          {sec('Créditos nuevos', 3.2, 'Cliente', 'Valor', visibles.length === 0)}
          {sec('Gastos', 1.3, 'En qué', 'Valor')}
          {sec('Obsequios y consumo', 1.2, 'Producto · a quién', 'Cant.')}
          {sec('Mercancía entre vendedores', 1, 'Pasó o recibió · producto · vendedor', 'Cant.')}
        </div>
      </div>
    </div>
  )
}

