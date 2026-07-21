// Contenedor para graficos (recharts u otro). El componente no importa recharts:
// el caller pasa el chart como children, ChartCard solo da el marco visual consistente.
export default function ChartCard({ title, subtitle, action, height = 240, children }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      {(title || action) && (
        <div className="flex items-start justify-between gap-2 mb-4">
          <div>
            {title && <h2 className="font-bold text-gray-800">{title}</h2>}
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div style={{ height }}>{children}</div>
    </div>
  )
}
