// Tabla generica para escritorio. columns: [{ key, header, render(item) }]
export default function DataTable({ items, columns, keyField = 'id', onRowClick }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left">
              {columns.map(col => (
                <th key={col.key} className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map(item => (
              <tr
                key={item[keyField]}
                onClick={onRowClick ? () => onRowClick(item) : undefined}
                className={`transition-colors duration-150 ${onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''}`}
              >
                {columns.map(col => (
                  <td key={col.key} className="px-4 py-3">
                    {col.render ? col.render(item) : item[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
