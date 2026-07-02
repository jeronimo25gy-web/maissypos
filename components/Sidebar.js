'use client'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cerrarSesionUsuario } from '@/lib/sesion'

const MODULOS = [
  { id: 'conteo', nombre: 'Conteo 7am', icon: '📦', roles: ['admin', 'auxiliar'], ruta: '/conteo' },
  { id: 'despacho', nombre: 'Despacho', icon: '🚚', roles: ['admin', 'auxiliar'], ruta: '/despacho' },
  { id: 'liquidacion', nombre: 'Liquidación', icon: '💰', roles: ['admin', 'auxiliar'], ruta: '/liquidacion' },
  { id: 'devoluciones', nombre: 'Devoluciones', icon: '↩️', roles: ['admin', 'auxiliar', 'vendedor'], ruta: '/devoluciones' },
  { id: 'cambios', nombre: 'Cambios', icon: '🔄', roles: ['admin', 'auxiliar', 'vendedor'], ruta: '/cambios' },
  { id: 'compras', nombre: 'Compras', icon: '🛒', roles: ['admin', 'auxiliar'], ruta: '/compras' },
  { id: 'inventario', nombre: 'Inventario', icon: '📈', roles: ['admin', 'auxiliar'], ruta: '/inventario' },
  { id: 'cartera', nombre: 'Cartera', icon: '📒', roles: ['admin', 'auxiliar'], ruta: '/cartera' },
  { id: 'imprimir', nombre: 'Imprimir Despacho', icon: '🖨️', roles: ['admin', 'auxiliar'], ruta: '/imprimir' },
  { id: 'productos', nombre: 'Productos', icon: '🏷️', roles: ['admin'], ruta: '/productos' },
  { id: 'reportes', nombre: 'Reportes', icon: '📊', roles: ['admin'], ruta: '/reportes' },
  { id: 'historial', nombre: 'Historial de Liquidaciones', icon: '📋', roles: ['admin', 'auxiliar'], ruta: '/historial' },
  { id: 'configuracion', nombre: 'Configuración', icon: '⚙️', roles: ['admin'], ruta: '/configuracion' },
]

export default function Sidebar({ usuario }) {
  const pathname = usePathname()
  const router = useRouter()

  const modulosVisibles = MODULOS.filter(m => usuario && m.roles.includes(usuario.rol))

  const cerrarSesion = async () => {
    await cerrarSesionUsuario(usuario?.id)
    localStorage.removeItem('maissy_usuario')
    router.push('/')
  }

  return (
    <div className="bg-sidebar text-white w-64 min-h-screen flex flex-col shrink-0 print:hidden">
      <div className="flex items-center gap-2 px-5 py-5 cursor-pointer" onClick={() => router.push('/dashboard')}>
        <Image src="/Maissy_M_Registrada.png" width={32} height={32} alt="Maissy" />
        <span className="text-lg font-black">MaissyPOS</span>
      </div>

      <nav className="flex-1 px-3 py-2 overflow-y-auto">
        {modulosVisibles.map(m => {
          const activo = pathname === m.ruta
          return (
            <Link key={m.id} href={m.ruta}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-1 transition-colors ${activo ? 'bg-brand text-white' : 'text-gray-300 hover:bg-white/10'}`}>
              <span>{m.icon}</span>
              <span>{m.nombre}</span>
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-white/10 px-5 py-4">
        <p className="font-bold text-sm truncate">{usuario?.nombre}</p>
        <p className="text-xs text-gray-400 capitalize mb-3">{usuario?.rol}</p>
        <button onClick={cerrarSesion} className="w-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold py-2 rounded-lg">
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
