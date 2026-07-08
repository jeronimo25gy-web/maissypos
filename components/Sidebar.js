'use client'
import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cerrarSesionUsuario } from '@/lib/sesion'
import { supabase } from '@/lib/supabase'
import { getEmpresaId, setEmpresaId } from '@/lib/empresa'
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
  ChartBarIcon,
  ClockIcon,
  Cog6ToothIcon,
  BanknotesIcon,
  ReceiptPercentIcon,
  Bars3Icon,
  XMarkIcon,
  ArrowRightOnRectangleIcon,
  PresentationChartLineIcon,
  BuildingOffice2Icon,
  ChevronUpDownIcon,
} from '@heroicons/react/24/outline'

export const MODULOS = [
  { id: 'conteo', nombre: 'Conteo Diario', icon: ClipboardDocumentCheckIcon, roles: ['admin', 'auxiliar'], ruta: '/conteo' },
  { id: 'despacho', nombre: 'Despacho', icon: TruckIcon, roles: ['admin', 'auxiliar'], ruta: '/despacho' },
  { id: 'liquidacion', nombre: 'Liquidación', icon: CurrencyDollarIcon, roles: ['admin', 'auxiliar'], ruta: '/liquidacion' },
  { id: 'devoluciones', nombre: 'Devoluciones', icon: ArrowUturnLeftIcon, roles: ['admin', 'auxiliar', 'vendedor'], ruta: '/devoluciones' },
  { id: 'cambios', nombre: 'Cambios', icon: ArrowsRightLeftIcon, roles: ['admin', 'auxiliar', 'vendedor'], ruta: '/cambios' },
  { id: 'compras', nombre: 'Compras', icon: ShoppingCartIcon, roles: ['admin', 'auxiliar'], ruta: '/compras' },
  { id: 'gastos', nombre: 'Gastos Admin', icon: ReceiptPercentIcon, roles: ['admin', 'auxiliar'], ruta: '/gastos' },
  { id: 'inventario', nombre: 'Inventario', icon: ArchiveBoxIcon, roles: ['admin', 'auxiliar'], ruta: '/inventario' },
  { id: 'cartera', nombre: 'Cartera', icon: BookOpenIcon, roles: ['admin', 'auxiliar'], ruta: '/cartera' },
  { id: 'imprimir', nombre: 'Imprimir Despacho', icon: PrinterIcon, roles: ['admin', 'auxiliar'], ruta: '/imprimir' },
  { id: 'maestros', nombre: 'Maestros', icon: Square3Stack3DIcon, roles: ['admin'], ruta: '/maestros' },
  { id: 'grupo', nombre: 'Vista Grupo', icon: BuildingOffice2Icon, roles: ['admin'], ruta: '/grupo' },
  { id: 'reportes', nombre: 'Reportes', icon: ChartBarIcon, roles: ['admin'], ruta: '/reportes' },
  { id: 'financiero', nombre: 'Financiero', icon: BanknotesIcon, roles: ['admin'], ruta: '/financiero' },
  { id: 'historial', nombre: 'Historial de Liquidaciones', icon: ClockIcon, roles: ['admin', 'auxiliar'], ruta: '/historial' },
  { id: 'configuracion', nombre: 'Configuración', icon: Cog6ToothIcon, roles: ['admin'], ruta: '/configuracion' },
]

export default function Sidebar({ usuario }) {
  const pathname = usePathname()
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [empresaActiva, setEmpresaActiva] = useState(null)
  const [empresas, setEmpresas] = useState([])
  const [switcherAbierto, setSwitcherAbierto] = useState(false)

  const modulosVisibles = MODULOS.filter(m => {
    if (!usuario) return false
    if (usuario.modulos) return usuario.modulos.includes(m.id)
    return m.roles.includes(usuario.rol)
  })

  useEffect(() => {
    cargarEmpresas()
  }, [])

  const cargarEmpresas = async () => {
    const { data } = await supabase.from('empresas').select('*').eq('activo', true).order('nombre')
    const accesibles = (data || []).filter(e => !usuario?.empresas || usuario.empresas.includes(e.id))
    setEmpresas(accesibles)
    const empresaId = getEmpresaId()
    setEmpresaActiva(accesibles.find(e => e.id === empresaId) || accesibles[0] || null)
  }

  const cambiarEmpresa = (id) => {
    setEmpresaId(id)
    setSwitcherAbierto(false)
    window.location.reload()
  }

  const cerrarSesion = async () => {
    await cerrarSesionUsuario(usuario?.id)
    localStorage.removeItem('maissy_usuario')
    router.push('/')
  }

  const irADashboard = () => {
    setAbierto(false)
    router.push('/dashboard')
  }

  return (
    <>
      <button onClick={() => setAbierto(true)}
        className={`md:hidden fixed top-4 left-4 z-40 text-gray-800 print:hidden ${abierto ? 'hidden' : ''}`}>
        <Bars3Icon className="w-7 h-7" strokeWidth={2} />
      </button>

      {abierto && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setAbierto(false)} />
      )}

      <div className={`bg-sidebar text-white w-64 min-h-screen flex flex-col shrink-0 print:hidden fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 md:translate-x-0 md:static ${abierto ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 h-16 border-b border-white/10">
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={irADashboard}>
            <Image src="/Maissy_M_Registrada.png" width={32} height={32} alt="Maissy" />
            <span className="text-base font-bold tracking-tight">MaissyPOS</span>
          </div>
          <button onClick={() => setAbierto(false)} className="md:hidden text-gray-400 hover:text-white">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {empresaActiva && (
          <div className="relative px-3 pt-3">
            <button onClick={() => setSwitcherAbierto(!switcherAbierto)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md bg-white/5 hover:bg-white/10 transition-colors">
              {empresaActiva.logo_url ? (
                <Image src={empresaActiva.logo_url} width={24} height={24} alt={empresaActiva.nombre} className="rounded object-contain shrink-0" />
              ) : (
                <div className="w-6 h-6 rounded bg-brand flex items-center justify-center text-white text-xs font-black shrink-0">
                  {empresaActiva.nombre.charAt(0)}
                </div>
              )}
              <span className="flex-1 text-left text-xs font-semibold truncate">{empresaActiva.nombre}</span>
              {empresas.length > 1 && <ChevronUpDownIcon className="w-4 h-4 text-gray-400 shrink-0" />}
            </button>

            {switcherAbierto && empresas.length > 1 && (
              <div className="absolute left-3 right-3 mt-1 bg-secondary rounded-md shadow-lg overflow-hidden z-10">
                {empresas.map(e => (
                  <button key={e.id} onClick={() => cambiarEmpresa(e.id)}
                    className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors ${e.id === empresaActiva.id ? 'bg-brand text-white' : 'text-gray-300 hover:bg-white/10'}`}>
                    {e.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <nav className="flex-1 px-2.5 py-3 overflow-y-auto">
          {usuario?.rol === 'admin' && (
            <Link href="/ejecutivo" onClick={() => setAbierto(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium mb-0.5 transition-colors ${pathname === '/ejecutivo' ? 'bg-brand text-white' : 'text-gray-300 hover:bg-white/10 hover:text-white'}`}>
              <PresentationChartLineIcon className="w-5 h-5 shrink-0" strokeWidth={1.75} />
              <span className="truncate">Resumen Ejecutivo</span>
            </Link>
          )}
          {modulosVisibles.map(m => {
            const activo = pathname === m.ruta
            return (
              <Link key={m.id} href={m.ruta} onClick={() => setAbierto(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium mb-0.5 transition-colors ${activo ? 'bg-brand text-white' : 'text-gray-300 hover:bg-white/10 hover:text-white'}`}>
                <m.icon className="w-5 h-5 shrink-0" strokeWidth={1.75} />
                <span className="truncate">{m.nombre}</span>
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-white/10 px-5 py-4">
          <p className="text-sm font-semibold truncate">{usuario?.nombre}</p>
          <p className="text-xs text-gray-400 capitalize mb-3">{usuario?.rol}</p>
          <button onClick={cerrarSesion}
            className="w-full flex items-center justify-center gap-2 border border-white/15 hover:bg-white/10 text-white text-xs font-semibold py-2 rounded-md transition-colors">
            <ArrowRightOnRectangleIcon className="w-4 h-4" strokeWidth={1.75} />
            Cerrar sesión
          </button>
        </div>
      </div>
    </>
  )
}
