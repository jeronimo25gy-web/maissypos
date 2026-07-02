'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const modulos = [
  { id: 'conteo', nombre: 'Conteo 7am', icon: '📦', roles: ['admin', 'auxiliar'], ruta: '/conteo' },
  { id: 'despacho', nombre: 'Despacho', icon: '🚚', roles: ['admin', 'auxiliar'], ruta: '/despacho' },
  { id: 'liquidacion', nombre: 'Liquidación', icon: '💰', roles: ['admin', 'auxiliar'], ruta: '/liquidacion' },
  { id: 'devoluciones', nombre: 'Devoluciones', icon: '↩️', roles: ['admin', 'auxiliar', 'vendedor'], ruta: '/devoluciones' },
  { id: 'cambios', nombre: 'Cambios', icon: '🔄', roles: ['admin', 'auxiliar', 'vendedor'], ruta: '/cambios' },
  { id: 'compras', nombre: 'Compras', icon: '🛒', roles: ['admin', 'auxiliar'], ruta: '/compras' },
  { id: 'imprimir', nombre: 'Imprimir Despacho', icon: '🖨️', roles: ['admin', 'auxiliar'], ruta: '/imprimir' },
  { id: 'productos', nombre: 'Productos', icon: '🏷️', roles: ['admin'], ruta: '/productos' },
  { id: 'inventario', nombre: 'Inventario', icon: '📈', roles: ['admin', 'auxiliar'], ruta: '/inventario' },
  { id: 'cartera', nombre: 'Cartera', icon: '📒', roles: ['admin', 'auxiliar'], ruta: '/cartera' },
  { id: 'reportes', nombre: 'Reportes', icon: '📊', roles: ['admin'], ruta: '/reportes' },
  { id: 'historial', nombre: 'Historial de Liquidaciones', icon: '📋', roles: ['admin', 'auxiliar'], ruta: '/historial' },
  { id: 'configuracion', nombre: 'Configuración', icon: '⚙️', roles: ['admin'], ruta: '/configuracion' },
]

export default function Dashboard() {
  const [usuario, setUsuario] = useState(null)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    setUsuario(JSON.parse(u))
  }, [])

  if (!usuario) return null

  const modulosVisibles = modulos.filter(m => m.roles.includes(usuario.rol))

  return (
    <div className="p-6">
      <h1 className="text-xl font-black text-gray-900 mb-1">Hola, {usuario.nombre}</h1>
      <p className="text-gray-500 text-sm mb-6">
        {new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {modulosVisibles.map(m => (
          <button
            key={m.id}
            onClick={() => router.push(m.ruta)}
            className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md border border-transparent hover:border-brand transition-all flex flex-col items-center gap-3 group"
          >
            <div className="bg-secondary text-white rounded-xl w-14 h-14 flex items-center justify-center text-2xl group-hover:bg-brand transition-colors">
              {m.icon}
            </div>
            <span className="font-semibold text-gray-700 text-sm text-center">{m.nombre}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
