import { titulos, texto } from '@/app/fuentes'
import EstadoCuenta from '@/components/EstadoCuenta'

// Letras del boceto de Mi ruta: Bricolage para cifras y titulos, Figtree para el resto.

export const metadata = { title: 'Mi ruta · MaissyPOS' }

export default function MiRutaLayout({ children }) {
  return <div className={`${titulos.variable} ${texto.variable}`} style={{ fontFamily: 'var(--font-texto), system-ui, sans-serif' }}><EstadoCuenta />{children}</div>
}
