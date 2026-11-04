'use client'
import { DIAS_SEMANA, FRECUENCIAS } from '@/lib/pago-proveedor'

// Cómo se le paga a un proveedor: a un plazo en días o en un día fijo.
// valor = { frecuencia, dias, dia }; lo usan Compras y Maestros.
export const valorPago = (prov) => ({ frecuencia: prov?.pago_frecuencia || 'plazo', dias: prov?.dias_credito ? String(prov.dias_credito) : '', dia: prov?.pago_dia ? String(prov.pago_dia) : '' })
export const datosPago = (v) => ({
  pago_frecuencia: v.frecuencia,
  pago_dia: v.frecuencia === 'semanal' || v.frecuencia === 'mensual' ? parseInt(v.dia) || null : null,
  dias_credito: v.frecuencia === 'plazo' && parseInt(v.dias) > 0 ? parseInt(v.dias) : null,
})
export const faltaPago = (v) => (v.frecuencia === 'semanal' && !v.dia) ? 'Escoja el día de la semana en que se le paga.'
  : (v.frecuencia === 'mensual' && !(parseInt(v.dia) >= 1 && parseInt(v.dia) <= 31)) ? 'Escriba el día del mes en que se le paga (1 a 31).' : null

export default function CampoPagoProveedor({ valor, onChange, className, style, plazoGeneral = 30 }) {
  const v = valor
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      <select value={v.frecuencia} onChange={e => onChange({ ...v, frecuencia: e.target.value })} aria-label="Cómo se le paga" className={className} style={{ ...style, flex: '1 1 150px', width: 'auto' }}>
        {FRECUENCIAS.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
      </select>
      {v.frecuencia === 'plazo' && (
        <input inputMode="numeric" value={v.dias} onChange={e => onChange({ ...v, dias: e.target.value.replace(/\D/g, '') })} placeholder={`${plazoGeneral} días`} aria-label="Días de plazo" className={className} style={{ ...style, flex: '0 1 110px', width: 'auto' }} />
      )}
      {v.frecuencia === 'semanal' && (
        <select value={v.dia} onChange={e => onChange({ ...v, dia: e.target.value })} aria-label="Día de pago" className={className} style={{ ...style, flex: '0 1 140px', width: 'auto' }}>
          <option value="">Día</option>
          {DIAS_SEMANA.map((d, i) => <option key={d} value={i + 1}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
        </select>
      )}
      {v.frecuencia === 'mensual' && (
        <input inputMode="numeric" value={v.dia} onChange={e => onChange({ ...v, dia: e.target.value.replace(/\D/g, '').slice(0, 2) })} placeholder="Día del mes" aria-label="Día del mes" className={className} style={{ ...style, flex: '0 1 120px', width: 'auto' }} />
      )}
      {v.frecuencia === 'quincenal' && <span className="text-[13px]" style={{ color: 'inherit', opacity: 0.75 }}>Días 15 y último del mes</span>}
    </div>
  )
}
