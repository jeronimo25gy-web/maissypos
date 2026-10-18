'use client'
import { useEffect, useRef, useState } from 'react'

// Graficas en SVG hechas a mano (sin libreria), con la linea de Mi ruta:
// lineas con cruceta, barras (apiladas o no) y barras horizontales, todas con
// tooltip al pasar el mouse o tocar. Colores validados para daltonismo.
export const COLORES = {
  rutas: '#C41230', mostrador: '#2A78D6', domicilios: '#B07C00', anterior: '#8C877C',
  rejilla: '#ECE9E1', texto: '#5A5750', tinta: '#1C1B19',
  antiguedad: ['#E9C27A', '#D29A2E', '#A87400', '#6E4C00'],
}
export const pesos = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
export const pesosCorto = (n) => {
  const v = Math.abs(n)
  const s = v >= 1e6 ? (v / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' M' : v >= 1e3 ? Math.round(v / 1e3) + ' mil' : String(Math.round(v))
  return (n < 0 ? '−$' : '$') + s
}

// Escala con 3 a 5 rayas, numeros redondos y pegada al maximo.
const escala = (max) => {
  if (!(max > 0)) return { tope: 1, paso: 1 }
  const p = Math.pow(10, Math.floor(Math.log10(max / 5)))
  const paso = [1, 2, 2.5, 5, 10, 20, 25, 50].map(x => x * p).find(x => Math.ceil(max / x) <= 5)
  return { tope: Math.ceil(max / paso) * paso, paso }
}

function useAncho() {
  const ref = useRef(null)
  const [ancho, setAncho] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setAncho(Math.round(e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, ancho]
}

function Tip({ tip }) {
  if (!tip) return null
  return (
    <div style={{ position: 'absolute', left: tip.left, top: tip.top, pointerEvents: 'none', background: COLORES.tinta, color: '#fff', borderRadius: 10, padding: '8px 10px', fontSize: 12.5, lineHeight: 1.45, whiteSpace: 'nowrap', zIndex: 3, fontVariantNumeric: 'tabular-nums', boxShadow: '0 8px 20px rgba(28,27,25,.25)' }}>
      <b>{tip.titulo}</b>
      {tip.filas.map((f, i) => (
        <div key={i}>{f.color && <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, marginRight: 6, background: f.color }} />}{f.texto}</div>
      ))}
    </div>
  )
}

const ubicarTip = (ancho, x, y, contenido) => {
  const izq = x + 14 > ancho - 190 ? x - 200 : x + 14
  return { left: Math.max(4, izq), top: Math.max(0, y - 10), ...contenido }
}

export function Leyenda({ items }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: COLORES.texto, margin: '2px 0 6px' }}>
      {items.map(it => (
        <span key={it.nombre}><i style={{ display: 'inline-block', width: 12, height: it.linea ? 3 : 12, borderRadius: it.linea ? 2 : 3, marginRight: 6, verticalAlign: it.linea ? 3 : -1, background: it.color }} />{it.nombre}</span>
      ))}
    </div>
  )
}

const ejeY = (W, H, m, tope, paso, formato) => {
  const out = []
  for (let v = 0; v <= tope + paso / 1000; v += paso) {
    const y = H - m.b - (H - m.t - m.b) * (v / tope)
    out.push(<g key={v}><line x1={m.l} x2={W - m.r} y1={y} y2={y} stroke={COLORES.rejilla} strokeWidth={1} /><text x={m.l - 8} y={y + 4} textAnchor="end">{formato(v)}</text></g>)
  }
  return out
}

// series: [{ nombre, color, datos: [n|null], punteada?, punto? }]
export function GraficaLineas({ etiquetas, series, alto = 220, formatoY = pesosCorto, formatoValor = pesos, etiqueta }) {
  const [ref, W] = useAncho()
  const [tip, setTip] = useState(null)
  const [guia, setGuia] = useState(null)
  const H = alto, m = { l: 58, r: 14, t: 10, b: 24 }
  const valores = series.flatMap(s => s.datos.filter(v => v != null))
  const { tope, paso } = escala(Math.max(0, ...valores))
  const n = etiquetas.length
  const x = i => m.l + (W - m.l - m.r) * (n > 1 ? i / (n - 1) : 0.5)
  const y = v => H - m.b - (H - m.t - m.b) * (v / tope)
  const salto = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - m.l) / 44))))
  const mover = (ev) => {
    const r = ref.current.getBoundingClientRect()
    const i = Math.max(0, Math.min(n - 1, Math.round((ev.clientX - r.left - m.l) / ((W - m.l - m.r) / Math.max(1, n - 1)))))
    setGuia(i)
    setTip(ubicarTip(W, x(i), 20, { titulo: etiquetas[i], filas: series.filter(s => s.datos[i] != null).map(s => ({ color: s.color, texto: `${s.nombre}: ${formatoValor(s.datos[i])}` })) }))
  }
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', height: H }} role="img" aria-label={etiqueta}>
      {W > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block', overflow: 'visible', fontSize: 11.5, fill: COLORES.texto, fontVariantNumeric: 'tabular-nums' }}>
          {ejeY(W, H, m, tope, paso, formatoY)}
          {etiquetas.map((e, i) => (i % salto === 0 || i === n - 1) && (
            <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{e}</text>
          ))}
          {series.map(s => {
            const pts = s.datos.map((v, i) => v == null ? null : [x(i), y(v)]).filter(Boolean)
            if (!pts.length) return null
            const u = pts[pts.length - 1]
            return (
              <g key={s.nombre}>
                <path d={'M' + pts.map(p => p.join(',')).join('L')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.punteada ? '5 5' : undefined} />
                {s.punto && <circle cx={u[0]} cy={u[1]} r={4.5} fill={s.color} stroke="#fff" strokeWidth={2} />}
              </g>
            )
          })}
          {guia != null && <line x1={x(guia)} x2={x(guia)} y1={m.t} y2={H - m.b} stroke={COLORES.tinta} strokeWidth={1} opacity={0.25} />}
          <rect x={m.l} y={0} width={Math.max(0, W - m.l - m.r)} height={H} fill="transparent" onPointerMove={mover} onPointerLeave={() => { setTip(null); setGuia(null) }} />
        </svg>
      )}
      <Tip tip={tip} />
    </div>
  )
}

// Barras verticales; con varias series se apilan (2px de separacion).
export function GraficaBarras({ etiquetas, series, alto = 220, formatoY = pesosCorto, formatoValor = pesos, colorPorBarra, rotular, etiqueta }) {
  const [ref, W] = useAncho()
  const [tip, setTip] = useState(null)
  const H = alto, m = { l: 58, r: 8, t: rotular ? 22 : 10, b: 24 }
  const totales = etiquetas.map((_, i) => series.reduce((s, se) => s + (se.datos[i] || 0), 0))
  const { tope, paso } = escala(Math.max(0, ...totales))
  const y = v => H - m.b - (H - m.t - m.b) * (v / tope)
  const banda = (W - m.l - m.r) / Math.max(1, etiquetas.length), ancho = Math.min(42, banda * 0.66)
  const salto = Math.max(1, Math.ceil(etiquetas.length / Math.max(2, Math.floor((W - m.l) / 34))))
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', height: H }} role="img" aria-label={etiqueta}>
      {W > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block', overflow: 'visible', fontSize: 11.5, fill: COLORES.texto, fontVariantNumeric: 'tabular-nums' }}>
          {ejeY(W, H, m, tope, paso, formatoY)}
          {etiquetas.map((e, i) => {
            const cx = m.l + banda * i + banda / 2
            let base = 0
            const visibles = series.map(s => ({ s, v: s.datos[i] || 0 })).filter(o => o.v > 0)
            return (
              <g key={i}>
                {i % salto === 0 && <text x={cx} y={H - 6} textAnchor="middle">{e}</text>}
                {visibles.map((o, k) => {
                  const y0 = y(base), y1 = y(base + o.v), alt = Math.max(0, y0 - y1 - (k > 0 ? 2 : 0))
                  const rad = k === visibles.length - 1 ? Math.min(4, alt, ancho / 2) : 0
                  const x0 = cx - ancho / 2, bot = y1 + alt
                  base += o.v
                  return <path key={k} d={`M${x0},${bot} L${x0},${y1 + rad} Q${x0},${y1} ${x0 + rad},${y1} L${x0 + ancho - rad},${y1} Q${x0 + ancho},${y1} ${x0 + ancho},${y1 + rad} L${x0 + ancho},${bot} Z`} fill={colorPorBarra ? colorPorBarra(i) : o.s.color} />
                })}
                {rotular && totales[i] > 0 && <text x={cx} y={y(totales[i]) - 6} textAnchor="middle" style={{ fill: COLORES.tinta, fontWeight: 700 }}>{pesosCorto(totales[i])}</text>}
                <rect x={m.l + banda * i} y={m.t} width={banda} height={Math.max(0, H - m.t - m.b)} fill="transparent"
                  onPointerEnter={() => setTip(ubicarTip(W, cx, y(totales[i]), {
                    titulo: e,
                    filas: totales[i] ? [...(series.length > 1 ? series.filter(s => s.datos[i]).map(s => ({ color: s.color, texto: `${s.nombre}: ${formatoValor(s.datos[i])}` })) : []), { texto: (series.length > 1 ? 'Total: ' : '') + formatoValor(totales[i]) }] : [{ texto: 'Sin ventas' }],
                  }))}
                  onPointerLeave={() => setTip(null)} />
              </g>
            )
          })}
        </svg>
      )}
      <Tip tip={tip} />
    </div>
  )
}

// filas: [[nombre, valor]]
export function GraficaHorizontal({ filas, alto, color = COLORES.rutas, formato = (v) => Number(v).toLocaleString('es-CO'), etiqueta }) {
  const [ref, W] = useAncho()
  const H = alto || Math.max(60, filas.length * 30)
  const izq = Math.min(170, W * 0.4), der = 64
  const max = Math.max(1, ...filas.map(f => f[1])), fila = H / Math.max(1, filas.length), grueso = Math.min(16, fila * 0.55)
  return (
    <div ref={ref} style={{ width: '100%', height: H }} role="img" aria-label={etiqueta}>
      {W > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block', overflow: 'visible', fontVariantNumeric: 'tabular-nums' }}>
          {filas.map(([n, v], i) => {
            const cy = fila * i + fila / 2, w = Math.max(4, (W - izq - der) * v / max)
            const corto = n.length > 22 ? n.slice(0, 21) + '…' : n
            return (
              <g key={i}>
                <text x={0} y={cy + 4} style={{ fill: COLORES.tinta, fontSize: 13 }}><title>{n}</title>{corto}</text>
                <rect x={izq} y={cy - grueso / 2} width={w} height={grueso} rx={4} fill={color} />
                <text x={izq + w + 8} y={cy + 4} style={{ fill: COLORES.tinta, fontSize: 12.5, fontWeight: 700 }}>{formato(v)}</text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
