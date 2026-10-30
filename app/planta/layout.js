import { titulos, texto } from '@/app/fuentes'
import EstadoCuenta from '@/components/EstadoCuenta'


export const metadata = { title: 'Control de producción · MaissyPOS' }

export default function PlantaLayout({ children }) {
  return <div className={`${titulos.variable} ${texto.variable}`} style={{ fontFamily: 'var(--font-texto), system-ui, sans-serif' }}><EstadoCuenta />{children}</div>
}
