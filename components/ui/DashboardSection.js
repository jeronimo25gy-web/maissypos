// Agrupa varios widgets bajo un encabezado de seccion (ej: "Operacion de hoy", "Finanzas").
// No es una tarjeta -- el contenido (KPIGrid, ChartCard, DashboardWidget, etc.) se compone libremente adentro.
export default function DashboardSection({ title, subtitle, action, children }) {
  return (
    <section className="flex flex-col gap-4">
      {(title || action) && (
        <div className="flex items-center justify-between gap-4">
          <div>
            {title && <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">{title}</h2>}
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
