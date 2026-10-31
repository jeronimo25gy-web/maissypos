'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { puedeVerModulo } from '@/lib/permisos'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { cargarParametros, quincenaActual } from '@/lib/nomina'
import { PageHeader } from '@/components/ui'
import { C, Pestanas } from '../gastos/ui'
import Liquidacion from './Liquidacion'
import Novedades from './Novedades'
import Prestamos from './Prestamos'
import Empleados from './Empleados'
import CostoLaboral from './CostoLaboral'
import Comprobantes from './Comprobantes'
import { useDestino } from '@/lib/destino'

// Nómina de la empresa activa, por quincenas: liquidación y pago, novedades,
// préstamos, empleados, costo laboral real y comprobantes de pago.
// La pantalla de antes quedó en /nomina-anterior.
const TABS = [['liquidacion', 'Liquidación'], ['novedades', 'Novedades'], ['prestamos', 'Préstamos'], ['empleados', 'Empleados'], ['costo', 'Costo laboral'], ['comprobantes', 'Comprobantes']]

export default function Nomina() {
  const router = useRouter()
  const [usuario, setUsuario] = useState(null)
  const [empresa, setEmpresa] = useState(null)
  const [tab, setTab] = useState('liquidacion')
  useDestino('vista', (v) => { if (TABS.some(t => t[0] === v)) setTab(v) })
  const [base, setBase] = useState(null)
  const [periodo, setPeriodo] = useState(() => quincenaActual(obtenerFechaActual()))

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')
    if (!u) { router.push('/entrar'); return }
    if (!puedeVerModulo(u, 'nomina', ['admin'])) { router.push('/despacho'); return }
    setUsuario(u)
    supabase.from('empresas').select('id, nombre').eq('id', getEmpresaId()).maybeSingle().then(({ data }) => setEmpresa(data))
  }, [router])

  const cargar = useCallback(async () => {
    const id = getEmpresaId()
    const hace30 = new Date(Date.now() - 30 * 864e5).toLocaleDateString('en-CA')
    const [{ data: empleados }, { data: vend }, { data: cuentas }, p, { data: desps }] = await Promise.all([
      supabase.from('empleados').select('*').eq('empresa_id', id).order('nombre'),
      supabase.from('vendedores').select('id, nombre, ruta_id, estado, rutas(nombre, tipo)').eq('empresa_id', id).order('nombre'),
      supabase.from('cuentas').select('id, nombre').eq('empresa_id', id).eq('estado', true).order('tipo').order('nombre'),
      cargarParametros(id),
      supabase.from('despachos_encab').select('vendedor_id').eq('empresa_id', id).gte('fecha', hace30),
    ])
    const lista = empleados || []
    const vendedores = (vend || []).map(v => ({ ...v, ruta: v.rutas?.nombre ? v.rutas.nombre.replace(/^RUTA\s+/i, '').replace(/\b(\w)(\w*)/g, (_, a, b) => a + b.toLowerCase()) : null }))
    // Vendedores que salieron a ruta en los últimos 30 días y no tienen empleado ligado.
    const ligados = new Set(lista.filter(e => e.activo && e.vendedor_id).map(e => e.vendedor_id))
    const trabajaron = new Set((desps || []).map(d => d.vendedor_id))
    const sinRegistrar = vendedores.filter(v => v.estado && trabajaron.has(v.id) && !ligados.has(v.id))
    setBase({ empleados: lista, vendedores: vendedores.filter(v => v.estado), cuentas: cuentas || [], p, sinRegistrar })
  }, [])
  useEffect(() => { if (usuario) cargar() }, [usuario, cargar])

  if (!usuario) return null
  const props = { base, usuario, periodo, setPeriodo, recargar: cargar, irA: setTab }
  return (
    <div style={{ background: C.fondo, color: C.tinta }} className="min-h-screen">
      <PageHeader buscar="Nómina" title="Nómina" subtitle={empresa?.nombre} />
      <div className="p-4 max-w-6xl mx-auto flex flex-col gap-4">
        <Pestanas opciones={TABS} valor={tab} onCambio={setTab} />
        {!base ? <p className="text-sm" style={{ color: C.gris }}>Cargando…</p> : (<>
          {tab === 'liquidacion' && <Liquidacion {...props} />}
          {tab === 'novedades' && <Novedades {...props} />}
          {tab === 'prestamos' && <Prestamos {...props} />}
          {tab === 'empleados' && <Empleados {...props} />}
          {tab === 'costo' && <CostoLaboral {...props} />}
          {tab === 'comprobantes' && <Comprobantes {...props} />}
        </>)}
      </div>
    </div>
  )
}
