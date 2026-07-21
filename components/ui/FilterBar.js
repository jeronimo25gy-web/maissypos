export default function FilterBar({ options, value, onChange, className = '' }) {
  return (
    <div className={`flex gap-2 overflow-x-auto pb-1 ${className}`}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors duration-150 ${
            value === opt.value
              ? 'bg-brand text-white'
              : 'bg-white text-gray-600 border border-gray-200 hover:border-brand/40'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
