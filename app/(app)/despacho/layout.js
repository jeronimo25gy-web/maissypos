import { titulos, texto } from '@/app/fuentes'

// Mismas letras del boceto de Mi ruta: Bricolage para cifras y titulos, Figtree para el resto.

export const metadata = { title: 'Despacho · MaissyPOS' }

export default function DespachoLayout({ children }) {
  return <div className={`${titulos.variable} ${texto.variable}`} style={{ fontFamily: 'var(--font-texto), system-ui, sans-serif' }}>{children}</div>
}
