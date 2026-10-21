'use client'
// Piezas de Gastos y Nómina (manual de marca).
export const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', linea: '#E3E1D8', suave: '#EFEDE6', rojo: '#C41230', rojoF: '#FBE9E9', amarillo: '#F2B21B', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8' }
export const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
export const $ = (n) => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString('es-CO')
export const fechaCorta = (f) => f ? new Date(f.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : '—'
export const pct = (n, d = 1) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('es-CO', { maximumFractionDigits: d }) + '%'

export const Pill = ({ tono = 'gris', children }) => {
  const t = { gris: [C.suave, C.gris], ambar: [C.ambarF, C.ambar], verde: [C.verdeF, C.verde], rojo: [C.rojoF, C.rojo] }[tono]
  return <span className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: t[0], color: t[1] }}>{children}</span>
}

export function Kpi({ rotulo, valor, nota, rojo }) {
  return (
    <div className="bg-white rounded-[18px] p-3.5 flex flex-col gap-1 min-w-0">
      <span className="text-[13px] font-bold" style={{ color: C.gris }}>{rotulo}</span>
      <span className="cifra-caja"><span className="cifra font-extrabold tabular-nums" style={{ ...titulo, color: rojo ? C.rojo : C.tinta, '--cifra-max': '26px' }}>{valor}</span></span>
      {nota && <span className="text-[13px]" style={{ color: C.gris }}>{nota}</span>}
    </div>
  )
}

export const Kpis = ({ children }) => <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>{children}</div>
export const Tarjeta = ({ children, className = '' }) => <div className={'bg-white rounded-[18px] p-4 flex flex-col gap-3 min-w-0 ' + className}>{children}</div>
export const H2 = ({ children }) => <h2 className="text-[19px] font-extrabold" style={titulo}>{children}</h2>
export const Nota = ({ children }) => <p className="text-[13px]" style={{ color: C.gris }}>{children}</p>

export function Boton({ tono = 'suave', children, className = '', ...props }) {
  const s = tono === 'rojo' ? { background: C.rojo, color: '#fff' } : tono === 'tinta' ? { background: C.tinta, color: '#fff' } : tono === 'blanco' ? { background: '#fff', color: C.tinta, boxShadow: `inset 0 0 0 1.5px ${C.linea}` } : { background: C.suave, color: C.tinta }
  return <button type="button" {...props} className={'rounded-xl min-h-[42px] px-4 text-sm font-bold whitespace-nowrap disabled:opacity-50 ' + className} style={s}>{children}</button>
}

export const campo = 'w-full min-w-0 h-11 rounded-xl px-3 text-[15px] font-semibold bg-white outline-none focus:ring-2'
export const campoEstilo = { border: `2px solid ${C.linea}`, color: C.tinta }
export function Campo({ etiqueta, children }) {
  return <label className="flex flex-col gap-1 min-w-0"><span className="text-[13px] font-bold" style={{ color: C.gris }}>{etiqueta}</span>{children}</label>
}

export function Segmento({ opciones, valor, onCambio, etiqueta }) {
  return (
    <div className="flex gap-1 rounded-full p-1 flex-wrap w-max max-w-full" style={{ background: C.fondo }} role="group" aria-label={etiqueta}>
      {opciones.map(([v, n]) => <button key={v} type="button" aria-pressed={valor === v} onClick={() => onCambio(v)} className="rounded-full min-h-[36px] px-3.5 text-[13.5px] font-bold"
        style={valor === v ? { background: '#fff', color: C.tinta, boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { color: C.gris }}>{n}</button>)}
    </div>
  )
}

export function Pestanas({ opciones, valor, onCambio }) {
  return (
    <div className="flex gap-1 bg-white rounded-full p-1 w-max max-w-full overflow-x-auto" role="tablist">
      {opciones.map(([id, n]) => (
        <button key={id} type="button" role="tab" aria-selected={valor === id} onClick={() => onCambio(id)} className="rounded-full min-h-[40px] px-4 text-sm font-bold whitespace-nowrap"
          style={valor === id ? { background: C.tinta, color: '#fff' } : { color: C.gris }}>{n}</button>
      ))}
    </div>
  )
}

export const Aviso = ({ children }) => <div className="rounded-[16px] px-4 py-3 text-sm" style={{ background: C.ambarF, color: C.ambar }}>{children}</div>

// Tabla con encabezado del manual; desplaza horizontalmente en pantallas pequeñas.
export function Tabla({ columnas, children, min = 560 }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums" style={{ minWidth: min, borderCollapse: 'collapse' }}>
        <thead><tr>{columnas.map((c, i) => <th key={i} className="text-[11.5px] font-extrabold uppercase tracking-wider px-2 py-2 whitespace-nowrap" style={{ color: C.gris, borderBottom: `1.5px solid ${C.tinta}`, textAlign: i === 0 || c.izq ? 'left' : 'right' }}>{c.t ?? c}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
export const td = (izq) => ({ padding: '10px 8px', borderBottom: `1px solid ${C.linea}`, textAlign: izq ? 'left' : 'right', verticalAlign: 'top' })
