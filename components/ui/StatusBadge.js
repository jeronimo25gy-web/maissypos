const COLOR_CLASSES = {
  green: { bg: 'bg-green-50 text-green-700', dot: 'bg-green-500' },
  amber: { bg: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  red: { bg: 'bg-red-50 text-red-600', dot: 'bg-red-500' },
  gray: { bg: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  brand: { bg: 'bg-brand/10 text-brand', dot: 'bg-brand' },
}

// Mapeo de estados conocidos del proyecto -> color + etiqueta por defecto.
// Se puede agregar cualquier estado nuevo aqui sin tocar los modulos que lo usan.
const STATUS_MAP = {
  activo: { color: 'green', label: 'Activo' },
  pendiente: { color: 'amber', label: 'Pendiente' },
  vencido: { color: 'red', label: 'Vencido' },
  vigente: { color: 'green', label: 'Vigente' },
  por_vencer: { color: 'amber', label: 'Por vencer' },
  en_taller: { color: 'amber', label: 'En taller' },
  fuera_de_servicio: { color: 'red', label: 'Fuera de servicio' },
  pagado: { color: 'green', label: 'Pagado' },
  inactivo: { color: 'gray', label: 'Inactivo' },
}

export default function StatusBadge({ status, label, color }) {
  const known = STATUS_MAP[status]
  const c = color || known?.color || 'gray'
  const text = label || known?.label || status
  const classes = COLOR_CLASSES[c] || COLOR_CLASSES.gray

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors duration-150 ${classes.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${classes.dot}`} />
      {text}
    </span>
  )
}
