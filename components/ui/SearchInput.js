import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'

export default function SearchInput({ value, onChange, placeholder = 'Buscar...', className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border-2 border-gray-200 rounded-xl pl-10 pr-4 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none transition-colors duration-150"
      />
    </div>
  )
}
