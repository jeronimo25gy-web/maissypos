// Tarjeta generica para el listado en modo card (celular, o escritorio con <20 registros).
export default function MobileCard({ children, onClick, className = '' }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`bg-white rounded-2xl shadow-sm p-5 w-full text-left transition-shadow duration-150 ${onClick ? 'hover:shadow-md' : ''} ${className}`}
    >
      {children}
    </Tag>
  )
}
