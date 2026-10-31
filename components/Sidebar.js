'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId, setEmpresaId } from '@/lib/empresa'
import { cargarPendientes, resumenPorModulo } from '@/lib/pendientes'
import { useSidebar } from '@/contexts/SidebarContext'
import { puedeVerModulo } from '@/lib/permisos'
import {
  ClipboardDocumentCheckIcon,
  HomeModernIcon,
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
  PresentationChartLineIcon,
  ArrowsUpDownIcon,
  WrenchScrewdriverIcon,
  UserGroupIcon,
  TagIcon,
  BeakerIcon,
  CubeIcon,
  PresentationChartBarIcon,
  ScaleIcon,
  MapIcon,
  ClipboardDocumentListIcon,
  XMarkIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
} from '@heroicons/react/24/outline'

// Catalogo de modelos de negocio que puede tener una empresa. Un modulo sin
// `modelos` es "core" y se ve siempre; un modulo con `modelos` solo se ve si
// la empresa activa tiene al menos uno de esos modelos activos.
export const MODELOS_NEGOCIO = [
  { id: 'distribucion', nombre: 'Distribución' },
  { id: 'produccion', nombre: 'Producción' },
  { id: 'mostrador', nombre: 'Punto de venta' },
]

// Cada modulo tiene un `grupo` -- se usa solo para agruparlos visualmente
// en el menu en el orden del dia, no afecta permisos ni logica.
export const GRUPOS_MODULOS = [
  { id: 'produccion', nombre: 'Producción' },
  { id: 'despacho', nombre: 'Despacho' },
  { id: 'ventas', nombre: 'Ventas' },
  { id: 'inventario', nombre: 'Inventario' },
  { id: 'finanzas', nombre: 'Finanzas' },
  { id: 'analisis', nombre: 'Análisis' },
  { id: 'ajustes', nombre: 'Ajustes' },
]

// `oculto`: no sale en el menu (se abre desde otro modulo) pero sigue en los
// accesos personalizados de Configuracion.
export const MODULOS = [
  { id: 'produccion', nombre: 'Producción', icon: CubeIcon, roles: ['admin', 'auxiliar'], ruta: '/produccion', modelos: ['produccion'], grupo: 'produccion' },
  { id: 'formulas', nombre: 'Fórmulas', icon: BeakerIcon, roles: ['admin'], ruta: '/formulas', modelos: ['produccion'], grupo: 'produccion' },
  { id: 'despacho', nombre: 'Despacho', icon: TruckIcon, roles: ['admin', 'auxiliar'], ruta: '/despacho', modelos: ['distribucion'], grupo: 'despacho' },
  { id: 'liquidacion', nombre: 'Liquidación', icon: CurrencyDollarIcon, roles: ['admin', 'auxiliar'], ruta: '/liquidacion', modelos: ['distribucion'], grupo: 'despacho' },
  { id: 'transferencias', nombre: 'Transferencias', icon: ArrowsUpDownIcon, roles: ['admin', 'auxiliar'], ruta: '/transferencias', modelos: ['distribucion'], grupo: 'despacho' },
  { id: 'cambios', nombre: 'Cambios', icon: ArrowsRightLeftIcon, roles: ['admin', 'auxiliar', 'vendedor'], ruta: '/cambios', modelos: ['distribucion'], grupo: 'despacho' },
  { id: 'devoluciones', nombre: 'Devoluciones', icon: ArrowUturnLeftIcon, roles: ['admin', 'auxiliar'], ruta: '/devoluciones', modelos: ['distribucion', 'produccion'], grupo: 'despacho' },
  { id: 'imprimir', nombre: 'Imprimir Despacho', icon: PrinterIcon, roles: ['admin', 'auxiliar'], ruta: '/imprimir', modelos: ['distribucion'], grupo: 'despacho', oculto: true },
  { id: 'historial', nombre: 'Historial de Liquidaciones', icon: ClockIcon, roles: ['admin', 'auxiliar'], ruta: '/historial', modelos: ['distribucion'], grupo: 'despacho', oculto: true },
  { id: 'ventas', nombre: 'Mostrador', icon: TagIcon, roles: ['admin', 'auxiliar'], ruta: '/ventas', modelos: ['distribucion', 'mostrador'], grupo: 'ventas' },
  { id: 'domicilios', nombre: 'Domicilios', icon: HomeModernIcon, roles: ['admin', 'auxiliar'], ruta: '/domicilios', modelos: ['distribucion', 'mostrador'], grupo: 'ventas' },
  { id: 'rutas', nombre: 'Rutas', icon: MapIcon, roles: ['admin', 'auxiliar'], ruta: '/rutas', modelos: ['distribucion'], grupo: 'ventas' },
  { id: 'inventario', nombre: 'Inventario', icon: ArchiveBoxIcon, roles: ['admin'], ruta: '/inventario', modelos: ['distribucion', 'mostrador'], grupo: 'inventario' },
  { id: 'conteo', nombre: 'Conteo', icon: ClipboardDocumentCheckIcon, roles: ['admin', 'auxiliar'], ruta: '/conteo', modelos: ['distribucion', 'mostrador'], grupo: 'inventario' },
  { id: 'ajustes-inventario', nombre: 'Ajustes de inventario', icon: ScaleIcon, requierePermiso: 'puede_aprobar_inventario', ruta: '/ajustes-inventario', modelos: ['distribucion', 'mostrador'], grupo: 'inventario' },
  { id: 'compras', nombre: 'Compras', icon: ShoppingCartIcon, roles: ['admin', 'auxiliar'], ruta: '/compras', modelos: ['distribucion', 'mostrador'], grupo: 'inventario' },
  { id: 'cartera', nombre: 'Cartera', icon: BookOpenIcon, roles: ['admin', 'auxiliar'], ruta: '/cartera', grupo: 'finanzas' },
  { id: 'financiero', nombre: 'Finanzas', icon: BanknotesIcon, roles: ['admin'], ruta: '/financiero', grupo: 'finanzas' },
  { id: 'gastos', nombre: 'Gastos', icon: ReceiptPercentIcon, roles: ['admin', 'auxiliar'], ruta: '/gastos', grupo: 'finanzas' },
  { id: 'nomina', nombre: 'Nómina', icon: UserGroupIcon, roles: ['admin'], ruta: '/nomina', grupo: 'finanzas' },
  { id: 'reportes', nombre: 'Reportes', icon: ChartBarIcon, roles: ['admin'], ruta: '/reportes', grupo: 'analisis' },
  { id: 'costeo', nombre: 'Costos', icon: PresentationChartBarIcon, roles: ['admin'], ruta: '/costeo', grupo: 'analisis' },
  { id: 'maestros', nombre: 'Maestros', icon: Square3Stack3DIcon, roles: ['admin'], ruta: '/maestros', grupo: 'ajustes' },
  { id: 'vehiculos', nombre: 'Vehículos y activos', icon: WrenchScrewdriverIcon, roles: ['admin'], ruta: '/vehiculos', modelos: ['distribucion', 'produccion'], grupo: 'ajustes' },
  { id: 'configuracion', nombre: 'Configuración', icon: Cog6ToothIcon, roles: ['admin'], ruta: '/configuracion', grupo: 'ajustes' },
]

const CLAVE_FIJO = 'maissy_menu_fijo'

const Insignia = ({ pend }) => {
  const n = pend?.cantidad || 0
  if (!n) return null
  return <span className="insignia" style={pend.alta ? { background: 'var(--alerta-marco)', color: 'var(--alerta-marco-texto)' } : { background: 'var(--acento)', color: '#1C1B19' }}>{n > 9 ? '9+' : n}</span>
}

// Menu lateral: en computador es una franja con los iconos de todos los modulos
// que se abre encima de la pantalla al pasar el mouse (o queda abierta con la
// flecha); en el celular es el cajon que abre el boton del encabezado.
export default function Sidebar({ usuario }) {
  const pathname = usePathname()
  const { abierto, setAbierto } = useSidebar()
  const [empresaActiva, setEmpresaActiva] = useState(null)
  const [fijo, setFijo] = useState(false)
  // Insignias del menu: cuantos pendientes tiene cada modulo (rojo si hay algo urgente).
  const [pendientesModulo, setPendientesModulo] = useState({})
  const [tareas, setTareas] = useState(null) // { cantidad, alta } para el item Tareas

  const modulosVisibles = MODULOS.filter(m => {
    if (!usuario || m.oculto) return false
    if (m.soloUsuario) return usuario.usuario === m.soloUsuario
    if (m.requierePermiso) return !!usuario[m.requierePermiso]
    const rolOk = usuario.gerencia ? true : usuario.modulos ? usuario.modulos.includes(m.id) : usuario.modulosRol ? usuario.modulosRol.includes(m.id) : m.roles.includes(usuario.rol)
    if (!rolOk) return false
    if (!m.modelos) return true
    const modelosEmpresa = empresaActiva?.modelos || []
    return m.modelos.some(mod => modelosEmpresa.includes(mod))
  })

  useEffect(() => {
    cargarEmpresas()
    try { setFijo(localStorage.getItem(CLAVE_FIJO) === '1') } catch { /* sin recordar */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (usuario && ['admin', 'auxiliar'].includes(usuario.rol) && getEmpresaId()) {
      cargarPendientes([getEmpresaId()]).then(items => { setPendientesModulo(resumenPorModulo(items)); setTareas({ cantidad: items.length, alta: items.some(i => i.prioridad === 'alta') }) }).catch(() => {})
    }
  }, [pathname, usuario])

  const cargarEmpresas = async () => {
    const { data } = await supabase.from('empresas').select('*').eq('activo', true).order('nombre')
    const accesibles = (data || []).filter(e => !usuario?.empresas || usuario.empresas.includes(e.id))
    const empresaId = getEmpresaId()
    const activa = accesibles.find(e => e.id === empresaId) || accesibles[0] || null
    // Sin empresa guardada, las pantallas preguntan por una empresa vacia: se deja la primera.
    if (activa && activa.id !== empresaId) setEmpresaId(activa.id)
    setEmpresaActiva(activa)
  }

  const cambiarFijo = () => {
    const nuevo = !fijo
    setFijo(nuevo)
    try { localStorage.setItem(CLAVE_FIJO, nuevo ? '1' : '0') } catch { /* sin recordar */ }
  }

  const Item = ({ href, Icon, nombre, pend }) => (
    <Link href={href} onClick={() => setAbierto(false)} title={nombre} data-activo={pathname === href ? '1' : undefined} className="menu-item">
      <Icon className="w-[22px] h-[22px] shrink-0" strokeWidth={1.7} />
      <span className="solo-abierto truncate flex-1">{nombre}</span>
      <Insignia pend={pend} />
    </Link>
  )

  return (
    <>
      {abierto && <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setAbierto(false)} />}

      {/* Lugar que ocupa el menu en computador: la franja o el menu abierto fijo. */}
      <div className={`hidden md:block shrink-0 print:hidden transition-[width] duration-200 ${fijo ? 'w-[280px]' : 'w-[84px]'}`} />

      <nav aria-label="Menú" className={`menu-lateral ${fijo ? '' : 'contraido'} print:hidden md:translate-x-0 ${abierto ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="menu-marca">
          <span className="boton-m solo-contraido" aria-hidden="true">
            <Image src="/Maissy_M_Registrada.png" width={76} height={76} alt="" className="sin-dorado" priority />
            <Image src="/maissy-dorado-m.png" width={32} height={32} alt="" className="solo-dorado" />
          </span>
          <span className="solo-abierto flex-1 min-w-0">
            <span className="flex justify-center">
              <Image src="/maissypos-logo-oscuro.png" width={150} height={54} alt="MaissyPOS" className="solo-manual" style={{ width: '150px', height: 'auto' }} />
              <span className="solo-rojo rounded-xl bg-white px-3 py-1.5"><Image src="/maissypos-logo.png" width={134} height={48} alt="MaissyPOS" style={{ width: '134px', height: 'auto' }} /></span>
              <Image src="/maissy-dorado.png" width={150} height={66} alt="Maissy" className="solo-dorado" style={{ width: '150px', height: 'auto' }} />
            </span>
          </span>
          <button type="button" onClick={() => setAbierto(false)} className="md:hidden menu-flecha" aria-label="Cerrar menú"><XMarkIcon className="w-5 h-5" /></button>
          <button type="button" onClick={cambiarFijo} className="solo-abierto menu-flecha hidden md:flex" title={fijo ? 'Volver a solo iconos' : 'Dejar el menú abierto'} aria-label={fijo ? 'Volver a solo iconos' : 'Dejar el menú abierto'}>
            {fijo ? <ChevronDoubleLeftIcon className="w-[18px] h-[18px]" /> : <ChevronDoubleRightIcon className="w-[18px] h-[18px]" />}
          </button>
        </div>

        <div className="menu-nav">
          {puedeVerModulo(usuario, 'ejecutivo', ['admin']) && <Item href="/ejecutivo" Icon={PresentationChartLineIcon} nombre="Inicio" />}
          {['admin', 'auxiliar'].includes(usuario?.rol) && <Item href="/tareas" Icon={ClipboardDocumentListIcon} nombre="Tareas" pend={tareas} />}
          {GRUPOS_MODULOS.map(g => {
            const modulosGrupo = modulosVisibles.filter(m => m.grupo === g.id)
            if (modulosGrupo.length === 0) return null
            return (
              <div key={g.id}>
                <p className="menu-grupo solo-abierto">{g.nombre}</p>
                <div className="menu-raya solo-contraido" />
                {modulosGrupo.map(m => <Item key={m.id} href={m.ruta} Icon={m.icon} nombre={m.nombre} pend={pendientesModulo[m.id]} />)}
              </div>
            )
          })}
        </div>
      </nav>
    </>
  )
}
