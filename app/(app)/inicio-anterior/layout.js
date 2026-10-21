import { titulos, texto } from '@/app/fuentes'

// Mismas letras del boceto de Mi ruta: Bricolage para cifras y titulos, Figtree para el resto.

export const metadata = { title: 'Inicio anterior · MaissyPOS' }

export default function InicioLayout({ children }) {
  return <div className={`${titulos.variable} ${texto.variable}`} style={{ fontFamily: 'var(--font-texto), system-ui, sans-serif' }}>{children}</div>
}
