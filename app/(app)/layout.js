'use client'
import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { SidebarProvider } from '@/contexts/SidebarContext'
import { registrarPantalla } from '@/lib/navegacion'
import { sesionVigente } from '@/lib/sesion'

export default function AppLayout({ children }) {
  const [usuario, setUsuario] = useState(null)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => { registrarPantalla(pathname) }, [pathname])

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    sesionVigente().then(ok => { if (!ok) router.replace('/') })
    setUsuario(JSON.parse(u))
    // Modo oscuro apagado: las pantallas nuevas son solo claras. Vuelve cuando el
    // manual de marca tenga su tema oscuro y las pantallas lean sus colores de ahi.
    document.documentElement.classList.remove('dark')
  }, [])

  if (!usuario) return null

  return (
    <SidebarProvider>
      <div className="flex min-h-screen">
        <Sidebar usuario={usuario} />
        <main className="flex-1 min-w-0 bg-app-bg">{children}</main>
      </div>
    </SidebarProvider>
  )
}
