'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { cerrarSesionUsuario } from '../../lib/sesion'

const modulos = [
  { id: 'conteo', nombre: 'Conteo 7am', icon: '📦', color: 'bg-blue-500', roles: ['admin', 'auxiliar'], ruta: '/conteo' },
  { id: 'despacho', nombre: 'Despacho', icon: '🚚', color: 'bg-orange-500', roles: ['admin', 'auxiliar'], ruta: '/despacho' },
  { id: 'liquidacion', nombre: 'Liquidación', icon: '💰', color: 'bg-green-500', roles: ['admin', 'auxiliar'], ruta: '/liquidacion' },
  { id: 'devoluciones', nombre: 'Devoluciones', icon: '↩️', color: 'bg-yellow-500', roles: ['admin', 'auxiliar', 'vendedor'], ruta: '/devoluciones' },
  { id: 'cambios', nombre: 'Cambios', icon: '🔄', color: 'bg-red-500', roles: ['admin', 'auxiliar', 'vendedor'], ruta: '/cambios' },
  { id: 'compras', nombre: 'Compras', icon: '🛒', color: 'bg-purple-500', roles: ['admin', 'auxiliar'], ruta: '/compras' },
  { id: 'imprimir', nombre: 'Imprimir Despacho', icon: '🖨️', color: 'bg-gray-500', roles: ['admin', 'auxiliar'], ruta: '/imprimir' },
  { id: 'productos', nombre: 'Productos', icon: '🏷️', color: 'bg-pink-500', roles: ['admin'], ruta: '/productos' },
  { id: 'inventario', nombre: 'Inventario', icon: '📈', color: 'bg-teal-500', roles: ['admin', 'auxiliar'], ruta: '/inventario' },
  { id: 'cartera', nombre: 'Cartera de Fiados', icon: '📒', color: 'bg-yellow-600', roles: ['admin', 'auxiliar'], ruta: '/cartera' },
  { id: 'reportes', nombre: 'Reportes', icon: '📊', color: 'bg-indigo-500', roles: ['admin'], ruta: '/reportes' },
  { id: 'historial', nombre: 'Historial de Liquidaciones', icon: '📋', color: 'bg-indigo-500', roles: ['admin', 'auxiliar'], ruta: '/historial' },
  { id: 'configuracion', nombre: 'Configuración', icon: '⚙️', color: 'bg-gray-700', roles: ['admin'], ruta: '/configuracion' },
]

export default function Dashboard() {
  const [usuario, setUsuario] = useState(null)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    setUsuario(JSON.parse(u))
  }, [])

  const cerrarSesion = async () => {
    await cerrarSesionUsuario(usuario?.id)
    localStorage.removeItem('maissy_usuario')
    router.push('/')
  }

  if (!usuario) return null

  const modulosVisibles = modulos.filter(m => m.roles.includes(usuario.rol))

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2">
            <Image src="/Maissy_M_Registrada.png" width={32} height={32} alt="Maissy" />
            <h1 className="text-2xl font-black text-[#C41230]">MaissyPOS</h1>
          </div>
          <p className="text-xs text-gray-500">Maissy Group · Medellín</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="font-semibold text-gray-800">{usuario.nombre}</p>
            <p className="text-xs text-gray-400 capitalize">{usuario.rol}</p>
          </div>
          <button
            onClick={cerrarSesion}
            className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Salir
          </button>
        </div>
      </div>

      {/* Fecha */}
      <div className="px-6 py-4">
        <p className="text-gray-500 text-sm">
          {new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Módulos */}
      <div className="px-6 pb-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {modulosVisibles.map(m => (
          <button
            key={m.id}
            onClick={() => router.push(m.ruta)}
            className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col items-center gap-3 group"
          >
            <div className={`${m.color} text-white rounded-xl w-14 h-14 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform`}>
              {m.icon}
            </div>
            <span className="font-semibold text-gray-700 text-sm text-center">{m.nombre}</span>
          </button>
        ))}
      </div>
    </div>
  )
}