'use client'
import Link from 'next/link'

const TONE_BG = {
  default: 'bg-gray-100 text-gray-600',
  brand: 'bg-brand/10 text-brand',
  green: 'bg-green-50 text-green-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
}

// Accesos directos del centro de operacion. Cada accion es { label, icon, href } o { label, icon, onClick }.
export default function QuickActions({ actions }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {actions.map(a => {
        const Icon = a.icon
        const content = (
          <>
            <span className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${TONE_BG[a.tone] || TONE_BG.default}`}>
              {Icon && <Icon className="w-5 h-5" />}
            </span>
            <span className="text-sm font-semibold text-gray-800">{a.label}</span>
          </>
        )
        const className = 'flex flex-col items-start bg-white rounded-2xl shadow-sm p-4 transition-shadow duration-150 hover:shadow-md text-left'
        return a.href ? (
          <Link key={a.label} href={a.href} className={className}>{content}</Link>
        ) : (
          <button key={a.label} onClick={a.onClick} className={className}>{content}</button>
        )
      })}
    </div>
  )
}
