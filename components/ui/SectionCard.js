export default function SectionCard({ title, action, children, className = '', noGap = false }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && <h2 className="font-bold text-gray-800">{title}</h2>}
          {action}
        </div>
      )}
      <div className={noGap ? '' : 'flex flex-col gap-5'}>{children}</div>
    </div>
  )
}
