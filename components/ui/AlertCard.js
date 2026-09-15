import { useRouter } from 'next/navigation'

const TONE_CLASSES = {
  amber: { bg: 'bg-amber-100', text: 'text-amber-600' },
  red: { bg: 'bg-red-100', text: 'text-red-600' },
  green: { bg: 'bg-green-100', text: 'text-green-600' },
  brand: { bg: 'bg-brand/10', text: 'text-brand' },
  gray: { bg: 'bg-gray-100', text: 'text-gray-500' },
}

// El icono se recibe como prop -- usar variante Heroicons Solid para alertas
// (estado importante), Outline para el resto del proyecto.
// href es opcional: si se pasa, la tarjeta se vuelve clickeable y navega ahi.
export default function AlertCard({ icon: Icon, title, description, tone = 'amber', href, onDismiss }) {
  const t = TONE_CLASSES[tone] || TONE_CLASSES.amber
  const router = useRouter()
  const contenido = (
    <>
      {Icon && (
        <span className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${t.bg}`}>
          <Icon className={`w-4 h-4 ${t.text}`} />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800">{title}</p>
        {description && <p className="text-xs text-gray-500">{description}</p>}
      </div>
    </>
  )
  const boton = onDismiss && (
    <button onClick={(e) => { e.stopPropagation(); onDismiss() }} title="Marcar como leida"
      className="text-gray-300 hover:text-gray-500 flex-shrink-0 px-1 -mr-1 text-lg leading-none">×</button>
  )
  if (href) {
    return (
      <div className="w-full flex items-start gap-2 -mx-2 px-2 py-1 rounded-lg transition-colors hover:bg-gray-50">
        <button onClick={() => router.push(href)} className="flex-1 flex items-start gap-3 text-left min-w-0">
          {contenido}
        </button>
        {boton}
      </div>
    )
  }
  return <div className="flex items-start gap-2"><div className="flex-1 flex items-start gap-3 min-w-0">{contenido}</div>{boton}</div>
}
