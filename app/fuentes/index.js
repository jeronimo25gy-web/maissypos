import localFont from 'next/font/local'

// Letras guardadas en el proyecto (antes se descargaban de Google en cada
// publicación y, si Google tardaba, la publicación fallaba). Son de uso libre
// (SIL Open Font License). Bricolage para títulos y cifras, Figtree para el
// resto; Geist es la letra base de la aplicación.
export const titulos = localFont({ src: './bricolage.woff2', weight: '600 800', variable: '--font-titulo', display: 'swap' })
export const texto = localFont({ src: './figtree.woff2', weight: '400 700', variable: '--font-texto', display: 'swap' })
export const geistSans = localFont({ src: './geist.woff2', weight: '100 900', variable: '--font-geist-sans', display: 'swap' })
export const geistMono = localFont({ src: './geist-mono.woff2', weight: '100 900', variable: '--font-geist-mono', display: 'swap' })
