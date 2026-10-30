'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { puedeVerModulo } from '@/lib/permisos'
import { PageHeader } from '@/components/ui'
import SelectorEmpresa from '@/components/SelectorEmpresa'
import { C, Pestanas, Boton } from '../gastos/ui'
import Productos from './Productos'
import Proveedores from './Proveedores'
import Clientes from './Clientes'
import VendedoresRutas from './VendedoresRutas'
import Cuentas from './Cuentas'

// Maestros de la empresa activa: productos (con categorías y promociones),
// proveedores, clientes, vendedores y rutas, y cuentas.
// La pantalla de antes quedó en /maestros-anterior.
const TABS = [['productos', 'Productos'], ['proveedores', 'Proveedores'], ['clientes', 'Clientes'], ['vendedores', 'Vendedores y rutas'], ['cuentas', 'Cuentas']]
const NUEVO = { productos: '+ Producto', proveedores: '+ Proveedor', clientes: '+ Cliente', vendedores: '+ Vendedor', cuentas: '+ Cuenta' }
const DE_ANTES = { categorias: 'productos', promociones: 'productos', rutas: 'vendedores' }

export default function Maestros() {
  const router = useRouter()
  const [usuario, setUsuario] = useState(null)
  const [empresa, setEmpresa] = useState(null)
  const [tab, setTab] = useState(() => { const v = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('vista'); return DE_ANTES[v] || (TABS.some(t => t[0] === v) ? v : 'productos') })
  const nuevoRef = useRef(null)

  useEffect(() => {
    const ir = (e) => { const v = new URL(e.detail, window.location.origin).searchParams.get('vista'); if (TABS.some(t => t[0] === v)) setTab(v) }
    // Al llegar desde el buscador la direccion nueva ya esta puesta cuando corre esto.
    ir({ detail: window.location.href })
    window.addEventListener('maissy:navegar', ir)
    return () => window.removeEventListener('maissy:navegar', ir)
  }, [])

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')
    if (!u) { router.push('/'); return }
    if (!puedeVerModulo(u, 'maestros', ['admin'])) { router.push('/despacho'); return }
    setUsuario(u)
    supabase.from('empresas').select('id, nombre, modelos, logo_url').eq('id', getEmpresaId()).maybeSingle().then(({ data }) => setEmpresa(data))
  }, [router])

  if (!usuario) return null
  const props = { usuario, empresa, nuevoRef }
  return (
    <div style={{ background: C.fondo, color: C.tinta }} className="min-h-screen">
      <PageHeader title="Maestros" subtitle={empresa?.nombre} actions={<Boton tono="rojo" onClick={() => nuevoRef.current?.()}>{NUEVO[tab]}</Boton>} />
      <div className="p-4 max-w-6xl mx-auto flex flex-col gap-4">
        <SelectorEmpresa usuario={usuario} />
        <Pestanas opciones={TABS} valor={tab} onCambio={(v) => { nuevoRef.current = null; setTab(v) }} />
        {tab === 'productos' && <Productos {...props} />}
        {tab === 'proveedores' && <Proveedores {...props} />}
        {tab === 'clientes' && <Clientes {...props} />}
        {tab === 'vendedores' && <VendedoresRutas {...props} />}
        {tab === 'cuentas' && <Cuentas {...props} />}
      </div>
    </div>
  )
}
