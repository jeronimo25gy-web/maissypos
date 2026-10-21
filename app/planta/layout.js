import { titulos, texto } from '@/app/fuentes'


export const metadata = { title: 'Control de producción · MaissyPOS' }

export default function PlantaLayout({ children }) {
  return <div className={`${titulos.variable} ${texto.variable}`} style={{ fontFamily: 'var(--font-texto), system-ui, sans-serif' }}>{children}</div>
}
