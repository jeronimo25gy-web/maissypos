'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// El kiosco se reemplazo por "Cerrar mi ruta" dentro de Mi ruta (2026-10-18).
// Quien entre por un enlace viejo va a su sitio: el vendedor a Mi ruta, los
// demas a Liquidacion.
export default function Kiosco() {
  const router = useRouter()
  useEffect(() => {
    let rol = null
    try { rol = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')?.rol } catch {}
    router.replace(rol === 'vendedor' ? '/mi-ruta' : rol ? '/liquidacion' : '/')
  }, [])
  return null
}
