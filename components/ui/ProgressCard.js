const TONE_BAR = {
  default: 'bg-gray-700',
  brand: 'bg-brand',
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
}

// Progreso hacia una meta (ej: meta de ventas del dia). current/target definen el %, valueLabel es el texto grande.
export default function ProgressCard({ label, current, target, valueLabel, tone = 'brand' }) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="text-xs font-bold text-gray-700">{pct}%</p>
      </div>
      <p className="text-lg font-black text-gray-900 mb-3">{valueLabel}</p>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-150 ${TONE_BAR[tone] || TONE_BAR.brand}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
