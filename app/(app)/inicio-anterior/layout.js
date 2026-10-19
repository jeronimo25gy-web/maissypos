import { Bricolage_Grotesque, Figtree } from 'next/font/google'

// Mismas letras del boceto de Mi ruta: Bricolage para cifras y titulos, Figtree para el resto.
const titulos = Bricolage_Grotesque({ subsets: ['latin'], weight: ['600', '800'], variable: '--font-titulo' })
const texto = Figtree({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-texto' })

export const metadata = { title: 'Inicio anterior · MaissyPOS' }

export default function InicioLayout({ children }) {
  return <div className={`${titulos.variable} ${texto.variable}`} style={{ fontFamily: 'var(--font-texto), system-ui, sans-serif' }}>{children}</div>
}
