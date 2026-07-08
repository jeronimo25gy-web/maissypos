'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { leerModoOscuro } from '@/lib/modoOscuro'

export default function AppLayout({ children }) {
  const [usuario, setUsuario] = useState(null)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    setUsuario(JSON.parse(u))
    document.documentElement.classList.toggle('dark', leerModoOscuro())
  }, [])

  if (!usuario) return null

  return (
    <div className="flex min-h-screen">
      <Sidebar usuario={usuario} />
      <main className="flex-1 min-w-0 bg-app-bg">{children}</main>
    </div>
  )
}
