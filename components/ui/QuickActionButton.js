const VARIANT_CLASSES = {
  primary: 'bg-brand hover:bg-brand-dark text-white',
  secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-700',
  outline: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200',
}

export default function QuickActionButton({ children, icon: Icon, onClick, variant = 'primary', disabled, className = '', ...props }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 ${VARIANT_CLASSES[variant] || VARIANT_CLASSES.primary} ${className}`}
      {...props}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {children}
    </button>
  )
}
