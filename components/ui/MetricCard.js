const TONE_TEXT = {
  default: 'text-gray-900',
  brand: 'text-brand',
  green: 'text-green-600',
  red: 'text-red-600',
  amber: 'text-amber-600',
  blue: 'text-blue-600',
  purple: 'text-purple-600',
}

const TONE_ICON_BG = {
  default: 'bg-gray-100 text-gray-500',
  brand: 'bg-brand/10 text-brand',
  green: 'bg-green-50 text-green-600',
  red: 'bg-red-50 text-red-600',
  amber: 'bg-amber-50 text-amber-600',
  blue: 'bg-blue-50 text-blue-600',
  purple: 'bg-purple-50 text-purple-600',
}

// trendDirection ('up'|'down') pinta trend como badge con flecha de color; si se omite, trend es texto gris plano (compatible con usos previos).
export default function MetricCard({ label, value, trend, trendDirection, icon: Icon, tone = 'default', children }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        {Icon && (
          <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${TONE_ICON_BG[tone] || TONE_ICON_BG.default}`}>
            <Icon className="w-5 h-5" />
          </span>
        )}
      </div>
      <p className={`text-2xl font-black ${TONE_TEXT[tone] || TONE_TEXT.default}`}>{value}</p>
      {trend && (
        trendDirection ? (
          <p className={`inline-flex items-center gap-1 text-xs font-semibold mt-1.5 ${trendDirection === 'up' ? 'text-green-600' : 'text-red-600'}`}>
            <span>{trendDirection === 'up' ? '▲' : '▼'}</span>{trend}
          </p>
        ) : (
          <p className="text-xs text-gray-400 mt-1">{trend}</p>
        )
      )}
      {children}
    </div>
  )
}
