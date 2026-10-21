'use client'
// Piezas de la pantalla de Inventario (manual de marca).
export const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', linea: '#E3E1D8', suave: '#EFEDE6', rojo: '#C41230', rojoF: '#FBE9E9', amarillo: '#F2B21B', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8' }
export const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
export const Pill = ({ tono = 'gris', children }) => {
  const t = { gris: [C.suave, C.gris], ambar: [C.ambarF, C.ambar], verde: [C.verdeF, C.verde], rojo: [C.rojoF, C.rojo] }[tono]
  return <span className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: t[0], color: t[1] }}>{children}</span>
}
export function Kpi({ rotulo, valor, nota, rojo }) {
  return (
    <div className="bg-white rounded-[18px] p-3.5 flex flex-col gap-1 min-w-0">
      <span className="text-[13px] font-bold" style={{ color: C.gris }}>{rotulo}</span>
      <span className="cifra-caja"><span className="cifra font-extrabold tabular-nums" style={{ ...titulo, color: rojo ? C.rojo : C.tinta, '--cifra-max': '26px' }}>{valor}</span></span>
      {nota && <span className="text-[13px]" style={{ color: C.gris }}>{nota}</span>}
    </div>
  )
}

