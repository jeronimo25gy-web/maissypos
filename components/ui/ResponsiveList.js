'use client'
import { useState, useEffect } from 'react'
import DataTable from './DataTable'

export function useIsDesktop(breakpoint = 768) {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= breakpoint)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [breakpoint])
  return isDesktop
}

// Regla de diseno: menos de 20 registros -> cards; 20 o mas -> tabla.
// En movil siempre cards, sin importar la cantidad.
export default function ResponsiveList({ items, renderCard, columns, keyField = 'id', onRowClick, emptyState, cardsThreshold = 20 }) {
  const isDesktop = useIsDesktop()
  const useTable = isDesktop && items.length >= cardsThreshold

  if (items.length === 0) return emptyState || null

  if (useTable) {
    return <DataTable items={items} columns={columns} keyField={keyField} onRowClick={onRowClick} />
  }

  return (
    <div className="flex flex-col gap-5">
      {items.map(item => renderCard(item))}
    </div>
  )
}
