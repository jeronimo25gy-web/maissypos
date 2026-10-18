'use client'
import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { SidebarProvider } from '@/contexts/SidebarContext'
import { leerModoOscuro } from '@/lib/modoOscuro'
import { registrarPantalla } from '@/lib/navegacion'

export default function AppLayout({ children }) {
  const [usuario, setUsuario] = useState(null)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => { registrarPantalla(pathname) }, [pathname])

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    setUsuario(JSON.parse(u))
    document.documentElement.classList.toggle('dark', leerModoOscuro())
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
