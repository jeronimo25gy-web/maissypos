'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ClipboardDocumentCheckIcon,
  TruckIcon,
  CurrencyDollarIcon,
  ArrowUturnLeftIcon,
  ArrowsRightLeftIcon,
  ShoppingCartIcon,
  ArchiveBoxIcon,
  BookOpenIcon,
  PrinterIcon,
  Square3Stack3DIcon,
  ArrowsUpDownIcon,
  ChartBarIcon,
  ClockIcon,
  Cog6ToothIcon,
  BanknotesIcon,
  ReceiptPercentIcon,
} from '@heroicons/react/24/outline'

const modulos = [
  { id: 'conteo', nombre: 'Conteo Diario', icon: ClipboardDocumentCheckIcon, roles: ['admin', 'auxiliar'], ruta: '/conteo' },
  { id: 'despacho', nombre: 'Despacho', icon: TruckIcon, roles: ['admin', 'auxiliar'], ruta: '/despacho' },
  { id: 'liquidacion', nombre: 'Liquidación', icon: CurrencyDollarIcon, roles: ['admin', 'auxiliar'], ruta: '/liquidacion' },
  { id: 'devoluciones', nombre: 'Devoluciones', icon: ArrowUturnLeftIcon, roles: ['admin', 'auxiliar', 'vendedor'], ruta: '/devoluciones' },
  { id: 'cambios', nombre: 'Cambios', icon: ArrowsRightLeftIcon, roles: ['admin', 'auxiliar', 'vendedor'], ruta: '/cambios' },
  { id: 'compras', nombre: 'Compras', icon: ShoppingCartIcon, roles: ['admin', 'auxiliar'], ruta: '/compras' },
  { id: 'gastos', nombre: 'Gastos Admin', icon: ReceiptPercentIcon, roles: ['admin', 'auxiliar'], ruta: '/gastos' },
  { id: 'imprimir', nombre: 'Imprimir Despacho', icon: PrinterIcon, roles: ['admin', 'auxiliar'], ruta: '/imprimir' },
  { id: 'transferencias', nombre: 'Transferencias', icon: ArrowsUpDownIcon, roles: ['admin', 'auxiliar'], ruta: '/transferencias' },
  { id: 'maestros', nombre: 'Maestros', icon: Square3Stack3DIcon, roles: ['admin'], ruta: '/maestros' },
  { id: 'inventario', nombre: 'Inventario', icon: ArchiveBoxIcon, roles: ['admin', 'auxiliar'], ruta: '/inventario' },
  { id: 'cartera', nombre: 'Cartera', icon: BookOpenIcon, roles: ['admin', 'auxiliar'], ruta: '/cartera' },
  { id: 'reportes', nombre: 'Reportes', icon: ChartBarIcon, roles: ['admin'], ruta: '/reportes' },
  { id: 'financiero', nombre: 'Financiero', icon: BanknotesIcon, roles: ['admin'], ruta: '/financiero' },
  { id: 'historial', nombre: 'Historial de Liquidaciones', icon: ClockIcon, roles: ['admin', 'auxiliar'], ruta: '/historial' },
  { id: 'configuracion', nombre: 'Configuración', icon: Cog6ToothIcon, roles: ['admin'], ruta: '/configuracion' },
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

  const modulosVisibles = modulos.filter(m => usuario.modulos ? usuario.modulos.includes(m.id) : m.roles.includes(usuario.rol))

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
            className="bg-sidebar rounded-2xl p-6 shadow-sm hover:shadow-md border-2 border-transparent hover:border-brand transition-all flex flex-col items-center gap-3"
          >
            <m.icon className="w-8 h-8 text-white" strokeWidth={1.75} />
            <span className="font-semibold text-white text-sm text-center">{m.nombre}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
