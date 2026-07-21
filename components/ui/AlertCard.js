const TONE_CLASSES = {
  amber: { bg: 'bg-amber-100', text: 'text-amber-600' },
  red: { bg: 'bg-red-100', text: 'text-red-600' },
  green: { bg: 'bg-green-100', text: 'text-green-600' },
  brand: { bg: 'bg-brand/10', text: 'text-brand' },
  gray: { bg: 'bg-gray-100', text: 'text-gray-500' },
}

// El icono se recibe como prop -- usar variante Heroicons Solid para alertas
// (estado importante), Outline para el resto del proyecto.
export default function AlertCard({ icon: Icon, title, description, tone = 'amber' }) {
  const t = TONE_CLASSES[tone] || TONE_CLASSES.amber
  return (
    <div className="flex items-start gap-3">
      {Icon && (
        <span className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${t.bg}`}>
          <Icon className={`w-4 h-4 ${t.text}`} />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800">{title}</p>
        {description && <p className="text-xs text-gray-500">{description}</p>}
      </div>
    </div>
  )
}
