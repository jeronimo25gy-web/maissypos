// Linea de tiempo generica (ej: historial de mantenimientos, movimientos).
// renderItem(item) define el contenido de cada punto.
export default function Timeline({ items, renderItem, keyField = 'id', dotTone = 'brand' }) {
  const dotClasses = {
    brand: 'bg-brand',
    green: 'bg-green-500',
    amber: 'bg-amber-500',
    gray: 'bg-gray-300',
  }

  return (
    <div className="flex flex-col">
      {items.map((item, i) => (
        <div key={item[keyField] ?? i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${dotClasses[dotTone] || dotClasses.brand}`} />
            {i < items.length - 1 && <span className="w-px flex-1 bg-gray-200" />}
          </div>
          <div className={`min-w-0 flex-1 ${i < items.length - 1 ? 'pb-5' : ''}`}>{renderItem(item)}</div>
        </div>
      ))}
    </div>
  )
}
