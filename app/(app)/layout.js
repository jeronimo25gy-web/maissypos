'use client'
import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import Buscador from '@/components/Buscador'
import TarjetaEmpresas from '@/components/TarjetaEmpresas'
import { SidebarProvider } from '@/contexts/SidebarContext'
import { registrarPantalla } from '@/lib/navegacion'
import { sesionVigente } from '@/lib/sesion'
import { supabase } from '@/lib/supabase'
import { normalizarUsuario } from '@/lib/permisos'

export default function AppLayout({ children }) {
  const [usuario, setUsuario] = useState(null)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => { registrarPantalla(pathname) }, [pathname])

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    // El usuario de planta solo ve Control de producción.
    if (JSON.parse(u).rol === 'planta') { router.replace('/planta'); return }
    sesionVigente().then(ok => { if (!ok) router.replace('/') })
    setUsuario(JSON.parse(u))
    // Rol y permisos al día (si Gerencia los cambió, aplican sin volver a entrar).
    const guardado = JSON.parse(u)
    Promise.all([
      supabase.from('usuarios').select('id, usuario, nombre, rol, modulos, empresas, vendedor_nombre, puede_aprobar_inventario').eq('id', guardado.id).maybeSingle(),
      supabase.from('roles_permisos').select('rol, modulos'),
    ]).then(([{ data: perfil }, { data: permisos }]) => {
      if (!perfil) return
      const nuevo = normalizarUsuario(perfil, Object.fromEntries((permisos || []).map(p => [p.rol, p.modulos])))
      if (JSON.stringify(nuevo) === JSON.stringify(guardado)) return
      localStorage.setItem('maissy_usuario', JSON.stringify(nuevo))
      setUsuario(nuevo)
    })
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
        <Buscador usuario={usuario} />
        <TarjetaEmpresas usuario={usuario} />
      </div>
    </SidebarProvider>
  )
}
