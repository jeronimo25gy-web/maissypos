// Tarjeta de dashboard con soporte para icono, accion, estado de carga y footer (ej: "Ver todo").
// A diferencia de SectionCard, pensado para tiles del centro de operacion que pueden cargar async.
export default function DashboardWidget({ title, subtitle, icon: Icon, action, footer, loading, children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-4 ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {Icon && <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />}
            <div className="min-w-0">
              {title && <h2 className="font-bold text-gray-800 truncate">{title}</h2>}
              {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      {loading ? (
        <div className="animate-pulse flex flex-col gap-3">
          <div className="h-4 bg-gray-100 rounded w-3/4" />
          <div className="h-4 bg-gray-100 rounded w-1/2" />
          <div className="h-4 bg-gray-100 rounded w-5/6" />
        </div>
      ) : children}
      {footer && <div className="pt-3 border-t border-gray-100">{footer}</div>}
    </div>
  )
}
