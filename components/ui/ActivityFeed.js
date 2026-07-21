const TONE_CLASSES = {
  brand: { bg: 'bg-brand/10', text: 'text-brand' },
  green: { bg: 'bg-green-100', text: 'text-green-600' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-600' },
  red: { bg: 'bg-red-100', text: 'text-red-600' },
  gray: { bg: 'bg-gray-100', text: 'text-gray-500' },
}

// Feed de actividad reciente (pedidos, despachos, cambios, etc). item: { id, icon, title, description, timestamp, tone }
export default function ActivityFeed({ items, keyField = 'id', emptyState }) {
  if (items.length === 0) return emptyState || null
  return (
    <div className="flex flex-col gap-4">
      {items.map(item => {
        const t = TONE_CLASSES[item.tone] || TONE_CLASSES.gray
        const Icon = item.icon
        return (
          <div key={item[keyField]} className="flex items-start gap-3">
            {Icon && (
              <span className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${t.bg}`}>
                <Icon className={`w-4 h-4 ${t.text}`} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-800 truncate">{item.title}</p>
              {item.description && <p className="text-xs text-gray-500">{item.description}</p>}
            </div>
            {item.timestamp && <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">{item.timestamp}</span>}
          </div>
        )
      })}
    </div>
  )
}
