'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { cerrarSesionUsuario } from '@/lib/sesion'
import { supabase } from '@/lib/supabase'
import { getEmpresaId, setEmpresaId } from '@/lib/empresa'
import { cargarPendientes, resumenPorModulo } from '@/lib/pendientes'
import { useSidebar } from '@/contexts/SidebarContext'
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
  XMarkIcon,
  ArrowRightOnRectangleIcon,
  PresentationChartLineIcon,
  ChevronUpDownIcon,
  ArrowsUpDownIcon,
  WrenchScrewdriverIcon,
  UserGroupIcon,
  TagIcon,
  BeakerIcon,
  CubeIcon,
  PresentationChartBarIcon,
  ScaleIcon,
  MapIcon,
  MagnifyingGlassIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
} from '@heroicons/react/24/outline'

// Catalogo de modelos de negocio que puede tener una empresa. Un modulo sin
// `modelos` es "core" y se ve siempre; un modulo con `modelos` solo se ve si
// la empresa activa tiene al menos uno de esos modelos activos.
export const MODELOS_NEGOCIO = [
  { id: 'distribucion', nombre: 'Distribución' },
  { id: 'produccion', nombre: 'Producción' },
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
  { id: 'devoluciones', nombre: 'Devoluciones', icon: ArrowUturnLeftIcon, roles: ['admin', 'auxiliar'], ruta: '/devoluciones', grupo: 'despacho' },
  { id: 'imprimir', nombre: 'Imprimir Despacho', icon: PrinterIcon, roles: ['admin', 'auxiliar'], ruta: '/imprimir', modelos: ['distribucion'], grupo: 'despacho', oculto: true },
  { id: 'historial', nombre: 'Historial de Liquidaciones', icon: ClockIcon, roles: ['admin', 'auxiliar'], ruta: '/historial', modelos: ['distribucion'], grupo: 'despacho', oculto: true },
  { id: 'ventas', nombre: 'Mostrador', icon: TagIcon, roles: ['admin', 'auxiliar'], ruta: '/ventas', modelos: ['distribucion'], grupo: 'ventas' },
  { id: 'domicilios', nombre: 'Domicilios', icon: HomeModernIcon, roles: ['admin', 'auxiliar'], ruta: '/domicilios', modelos: ['distribucion'], grupo: 'ventas' },
  { id: 'rutas', nombre: 'Rutas', icon: MapIcon, roles: ['admin', 'auxiliar'], ruta: '/rutas', modelos: ['distribucion'], grupo: 'ventas' },
  { id: 'inventario', nombre: 'Inventario', icon: ArchiveBoxIcon, roles: ['admin'], ruta: '/inventario', modelos: ['distribucion'], grupo: 'inventario' },
  { id: 'conteo', nombre: 'Conteo', icon: ClipboardDocumentCheckIcon, roles: ['admin', 'auxiliar'], ruta: '/conteo', modelos: ['distribucion'], grupo: 'inventario' },
  { id: 'ajustes-inventario', nombre: 'Ajustes de inventario', icon: ScaleIcon, requierePermiso: 'puede_aprobar_inventario', ruta: '/ajustes-inventario', modelos: ['distribucion'], grupo: 'inventario' },
  { id: 'compras', nombre: 'Compras', icon: ShoppingCartIcon, roles: ['admin', 'auxiliar'], ruta: '/compras', modelos: ['distribucion'], grupo: 'inventario' },
  { id: 'cartera', nombre: 'Cartera', icon: BookOpenIcon, roles: ['admin', 'auxiliar'], ruta: '/cartera', grupo: 'finanzas' },
  { id: 'financiero', nombre: 'Financiero', icon: BanknotesIcon, roles: ['admin'], ruta: '/financiero', grupo: 'finanzas' },
  { id: 'gastos', nombre: 'Gastos', icon: ReceiptPercentIcon, roles: ['admin', 'auxiliar'], ruta: '/gastos', grupo: 'finanzas' },
  { id: 'nomina', nombre: 'Nómina', icon: UserGroupIcon, roles: ['admin'], ruta: '/nomina', grupo: 'finanzas' },
  { id: 'reportes', nombre: 'Reportes', icon: ChartBarIcon, roles: ['admin'], ruta: '/reportes', grupo: 'analisis' },
  { id: 'costeo', nombre: 'Costos', icon: PresentationChartBarIcon, roles: ['admin'], ruta: '/costeo', modelos: ['produccion'], grupo: 'analisis' },
  { id: 'maestros', nombre: 'Maestros', icon: Square3Stack3DIcon, roles: ['admin'], ruta: '/maestros', grupo: 'ajustes' },
  { id: 'vehiculos', nombre: 'Vehículos', icon: WrenchScrewdriverIcon, roles: ['admin'], ruta: '/vehiculos', modelos: ['distribucion'], grupo: 'ajustes' },
  { id: 'configuracion', nombre: 'Configuración', icon: Cog6ToothIcon, roles: ['admin'], ruta: '/configuracion', grupo: 'ajustes' },
]

const CLAVE_FIJO = 'maissy_menu_fijo'
const iniciales = (n) => (n || '').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()
const sinTildes = (t) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// Menu lateral: en computador es una franja de iconos que se abre encima de
// la pantalla al pasar el mouse (o queda abierto con la flecha de arriba); en
// el celular es el cajon que abre el boton de menu.
export default function Sidebar({ usuario }) {
  const pathname = usePathname()
  const router = useRouter()
  const { abierto, setAbierto } = useSidebar()
  const [empresaActiva, setEmpresaActiva] = useState(null)
  const [empresas, setEmpresas] = useState([])
  const [switcherAbierto, setSwitcherAbierto] = useState(false)
  const [fijo, setFijo] = useState(false)
  const [buscar, setBuscar] = useState('')
  // Insignias del menu: cuantos pendientes tiene cada modulo (rojo si hay algo urgente).
  const [pendientesModulo, setPendientesModulo] = useState({})

  const modulosVisibles = MODULOS.filter(m => {
    if (!usuario || m.oculto) return false
    if (m.soloUsuario) return usuario.usuario === m.soloUsuario
    if (m.requierePermiso) return !!usuario[m.requierePermiso]
    const rolOk = usuario.modulos ? usuario.modulos.includes(m.id) : m.roles.includes(usuario.rol)
    if (!rolOk) return false
    if (!m.modelos) return true
    const modelosEmpresa = empresaActiva?.modelos || []
    return m.modelos.some(mod => modelosEmpresa.includes(mod))
  })

  useEffect(() => {
    cargarEmpresas()
    try { setFijo(localStorage.getItem(CLAVE_FIJO) === '1') } catch {}
  }, [])

  useEffect(() => {
    if (usuario && ['admin', 'auxiliar'].includes(usuario.rol) && getEmpresaId()) {
      cargarPendientes([getEmpresaId()]).then(items => setPendientesModulo(resumenPorModulo(items))).catch(() => {})
    }
  }, [pathname, usuario])

  const cargarEmpresas = async () => {    const { data } = await supabase.from('empresas').select('*').eq('activo', true).order('nombre')
    const accesibles = (data || []).filter(e => !usuario?.empresas || usuario.empresas.includes(e.id))
    setEmpresas(accesibles)
    const empresaId = getEmpresaId()
    const activa = accesibles.find(e => e.id === empresaId) || accesibles[0] || null
    // Sin empresa guardada, las pantallas preguntan por una empresa vacia: se deja la primera.
    if (activa && activa.id !== empresaId) setEmpresaId(activa.id)
    setEmpresaActiva(activa)
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

  const cambiarFijo = () => {
    const nuevo = !fijo
    setFijo(nuevo)
    try { localStorage.setItem(CLAVE_FIJO, nuevo ? '1' : '0') } catch {}
  }

  const q = sinTildes(buscar.trim())
  const coincide = (nombre) => !q || sinTildes(nombre).includes(q)
  const irA = () => { setAbierto(false); setBuscar('') }

  const Item = ({ href, Icon, nombre, pend }) => {
    const activo = pathname === href
    const n = pend?.cantidad || 0
    return (
      <Link href={href} onClick={irA} title={nombre}
        className={`menu-item relative flex items-center gap-3 min-h-[38px] px-2.5 rounded-[10px] text-sm mb-0.5 transition-colors ${activo ? 'font-bold' : 'font-medium hover:bg-[#262421] hover:text-white'}`}
        style={activo ? { background: '#F3F1EA', color: '#1C1B19' } : { color: '#D9D5CC' }}>
        <Icon className="w-5 h-5 shrink-0" strokeWidth={1.6} />
        <span className="solo-abierto truncate flex-1">{nombre}</span>
        {n > 0 && (
          <span className="menu-insignia text-[11px] font-extrabold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center shrink-0"
            style={pend?.alta ? { background: '#C41230', color: '#fff' } : { background: '#F2B21B', color: '#1C1B19' }}>
            {n > 9 ? '9+' : n}
          </span>
        )}
      </Link>
    )
  }

  return (
    <>
      {abierto && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setAbierto(false)} />
      )}

      {/* Lugar que ocupa el menu en computador: la franja de iconos o el menu abierto fijo. */}
      <div className={`hidden md:block shrink-0 print:hidden transition-[width] duration-200 ${fijo ? 'w-64' : 'w-[72px]'}`} />

      <div className={`menu-lateral ${fijo ? '' : 'riel'} w-64 fixed inset-y-0 left-0 z-50 flex flex-col print:hidden transform transition-[transform,width,box-shadow] duration-200 md:translate-x-0 ${abierto ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: '#1A1A1A', color: '#D9D5CC' }}>
        <div className="menu-marca flex items-center justify-between px-3.5 pt-4 pb-1 min-h-[52px]">
          <Image src="/maissypos-logo-oscuro.png" width={104} height={38} alt="MaissyPOS" className="solo-abierto"
            style={{ background: 'transparent', width: '104px', height: 'auto' }} />
          <Image src="/Maissy_M_Registrada.png" width={32} height={32} alt="MaissyPOS" className="solo-riel"
            style={{ width: '32px', height: 'auto' }} />
          <button onClick={() => setAbierto(false)} className="md:hidden text-[#8C877C] hover:text-white w-8 h-8 flex items-center justify-center" aria-label="Cerrar menú">
            <XMarkIcon className="w-5 h-5" />
          </button>
          <button onClick={cambiarFijo} className="solo-abierto hidden md:flex w-8 h-8 rounded-lg items-center justify-center text-[#8C877C] hover:text-white hover:bg-[#262421]"
            title={fijo ? 'Volver a solo iconos' : 'Dejar el menú abierto'} aria-label={fijo ? 'Volver a solo iconos' : 'Dejar el menú abierto'}>
            {fijo ? <ChevronDoubleLeftIcon className="w-[18px] h-[18px]" /> : <ChevronDoubleRightIcon className="w-[18px] h-[18px]" />}
          </button>
        </div>

        {empresaActiva && (
          <div className="relative px-2.5 pt-2">
            <button onClick={() => empresas.length > 1 && setSwitcherAbierto(!switcherAbierto)}
              className="menu-empresa w-full flex items-center gap-2.5 p-2 rounded-xl text-left" style={{ background: '#262421' }}
              title={empresaActiva.nombre}>
              {empresaActiva.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={empresaActiva.logo_url} alt="" className="w-9 h-9 rounded-[10px] object-contain shrink-0" style={{ background: '#F3F1EA' }} />
              ) : (
                <span className="w-9 h-9 rounded-[10px] flex items-center justify-center text-sm font-black shrink-0" style={{ background: '#F3F1EA', color: '#C41230' }}>{iniciales(empresaActiva.nombre)}</span>
              )}
              <span className="solo-abierto flex-1 min-w-0">
                <b className="block text-sm text-white truncate">{empresaActiva.nombre}</b>
                {empresas.length > 1 && <span className="block text-[11.5px]" style={{ color: '#8C877C' }}>Cambiar de empresa</span>}
              </span>
              {empresas.length > 1 && <ChevronUpDownIcon className="solo-abierto w-[18px] h-[18px] shrink-0" style={{ color: '#8C877C' }} />}
            </button>

            {switcherAbierto && empresas.length > 1 && (
              <div className="solo-abierto absolute left-2.5 right-2.5 mt-1 rounded-xl shadow-lg overflow-hidden z-10" style={{ background: '#262421' }}>
                {empresas.map(e => (
                  <button key={e.id} onClick={() => cambiarEmpresa(e.id)}
                    className="w-full text-left px-3 py-2.5 text-[13px] font-semibold hover:bg-white/10"
                    style={e.id === empresaActiva.id ? { background: '#F3F1EA', color: '#1C1B19' } : { color: '#D9D5CC' }}>
                    {e.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <label className="solo-abierto mx-2.5 mt-2 flex items-center gap-2 rounded-[10px] px-2.5 min-h-[36px]" style={{ background: '#262421', color: '#8C877C' }}>
          <MagnifyingGlassIcon className="w-4 h-4 shrink-0" />
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar módulo"
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13.5px] text-white placeholder:text-[#8C877C]" />
        </label>

        <nav className="menu-nav flex-1 overflow-y-auto px-2.5 pt-2 pb-3">
          {usuario?.rol === 'admin' && coincide('Inicio') && (
            <Item href="/ejecutivo" Icon={PresentationChartLineIcon} nombre="Inicio" />
          )}
          {GRUPOS_MODULOS.map(g => {
            const modulosGrupo = modulosVisibles.filter(m => m.grupo === g.id && coincide(m.nombre))
            if (modulosGrupo.length === 0) return null
            return (
              <div key={g.id}>
                <p className="solo-abierto px-2.5 pt-3.5 pb-1.5 text-[10.5px] font-extrabold uppercase tracking-[.09em]" style={{ color: '#8C877C' }}>{g.nombre}</p>
                <div className="solo-riel mx-auto my-2.5 w-6 h-px" style={{ background: '#3A3833' }} />
                {modulosGrupo.map(m => <Item key={m.id} href={m.ruta} Icon={m.icon} nombre={m.nombre} pend={pendientesModulo[m.id]} />)}
              </div>
            )
          })}
          {q && !modulosVisibles.some(m => coincide(m.nombre)) && !coincide('Inicio') && (
            <p className="px-2.5 pt-3 text-[13px]" style={{ color: '#8C877C' }}>Ningún módulo se llama así.</p>
          )}
        </nav>

        <div className="menu-pie flex items-center gap-2.5 px-3 py-3 border-t" style={{ borderColor: '#2E2C29' }}>
          <span className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-[13px] font-black shrink-0" style={{ background: '#F2B21B', color: '#1C1B19' }}>{iniciales(usuario?.nombre)}</span>
          <span className="solo-abierto flex-1 min-w-0">
            <b className="block text-[13.5px] text-white truncate">{usuario?.nombre}</b>
            <span className="block text-[11.5px] capitalize" style={{ color: '#8C877C' }}>{usuario?.rol}</span>
          </span>
          <button onClick={cerrarSesion} title="Cerrar sesión" aria-label="Cerrar sesión"
            className="solo-abierto w-[34px] h-[34px] rounded-lg flex items-center justify-center hover:bg-[#262421] hover:text-white shrink-0" style={{ color: '#8C877C' }}>
            <ArrowRightOnRectangleIcon className="w-[18px] h-[18px]" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </>
  )
}
