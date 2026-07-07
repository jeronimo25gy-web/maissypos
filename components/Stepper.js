'use client'
import { CheckIcon } from '@heroicons/react/24/solid'

const FASES = ['Borrador', 'Confirmado', 'Despachado', 'Liquidado']

const faseIndexDeEstado = (estado) => {
  if (estado === 'borrador') return 0
  if (estado === 'liquidado') return 3
  return 2
}

export default function Stepper({ estado, compact = false }) {
  const actual = faseIndexDeEstado(estado)

  return (
    <div className="flex items-center">
      {FASES.map((label, i) => {
        const completada = i < actual
        const esActual = i === actual
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`rounded-full flex items-center justify-center font-bold shrink-0 ${compact ? 'w-5 h-5 text-[10px]' : 'w-8 h-8 text-sm'} ${
                completada ? 'bg-green-600 text-white' : esActual ? 'bg-brand text-white' : 'bg-gray-200 text-gray-400'
              }`}>
                {completada ? <CheckIcon className={compact ? 'w-3 h-3' : 'w-5 h-5'} /> : i + 1}
              </div>
              {!compact && (
                <span className={`text-[10px] mt-1 font-semibold whitespace-nowrap ${
                  esActual ? 'text-brand' : completada ? 'text-green-600' : 'text-gray-400'
                }`}>{label}</span>
              )}
            </div>
            {i < FASES.length - 1 && (
              <div className={`${compact ? 'w-4' : 'w-8'} h-0.5 mx-1 shrink-0 ${i < actual ? 'bg-green-600' : 'bg-gray-200'} ${!compact ? 'mb-4' : ''}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
