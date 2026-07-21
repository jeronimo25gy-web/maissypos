const COLS = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-2 lg:grid-cols-5',
  6: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6',
}

// Grilla responsive para agrupar MetricCard / StatMiniCard / ProgressCard.
export default function KPIGrid({ children, columns = 4 }) {
  return <div className={`grid ${COLS[columns] || COLS[4]} gap-5`}>{children}</div>
}
