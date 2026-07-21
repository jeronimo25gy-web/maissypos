import { TruckIcon } from '@heroicons/react/24/outline'
import StatusBadge from './StatusBadge'
import MobileCard from './MobileCard'

export default function VehicleCard({ vehiculo, conductor, ruta, proximoMantenimiento, onClick }) {
  return (
    <MobileCard onClick={onClick}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
          <TruckIcon className="w-5 h-5 text-gray-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-gray-900 truncate">{vehiculo.placa}</p>
          <p className="text-xs text-gray-500 truncate">{[vehiculo.marca, vehiculo.modelo].filter(Boolean).join(' ')}</p>
        </div>
        <StatusBadge status={vehiculo.estado} />
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{conductor || 'Vacante'}{ruta ? ` · ${ruta}` : ''}</span>
        <span>{(vehiculo.kilometraje_actual || 0).toLocaleString('es-CO')} km</span>
      </div>
      {proximoMantenimiento && (
        <p className="text-xs text-amber-600 font-semibold mt-2">{proximoMantenimiento}</p>
      )}
    </MobileCard>
  )
}
