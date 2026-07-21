'use client'
import { useRouter } from 'next/navigation'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'

export default function PageHeader({ title, subtitle, actions, filters, backHref = '/dashboard', onBack, showBack = true }) {
  const router = useRouter()
  const volver = onBack || (() => router.push(backHref))

  return (
    <div className="bg-white shadow-sm px-6 py-4 sticky top-0 z-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {showBack && (
            <button onClick={volver} aria-label="Volver"
              className="text-gray-400 hover:text-gray-700 transition-colors duration-150 flex-shrink-0">
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-black text-gray-900 truncate">{title}</h1>
            {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:flex-shrink-0">{actions}</div>}
      </div>
      {filters && <div className="mt-4">{filters}</div>}
    </div>
  )
}
