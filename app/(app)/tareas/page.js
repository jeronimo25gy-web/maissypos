'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { cargarPendientes, marcarAlertaVista, invalidarPendientes } from '@/lib/pendientes'
import { PageHeader } from '@/components/ui'

// Tareas: todo lo que hay por hacer, por urgencia. Salen de estados reales y se
// apagan solas cuando se resuelven en su módulo; los avisos se quitan con "Visto".
// El Inicio muestra las dos primeras de cada grupo y la campanita trae aquí.
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', linea: '#E3E1D8', suave: '#EFEDE6', rojo: '#C41230', rojoF: '#FBE9E9', amarillo: '#F2B21B', ambar: '#8A5A00', ambarF: '#FFF4CC' }
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const GRUPOS = [['alta', 'Urgente', C.rojo], ['hoy', 'Hoy', C.amarillo], ['semana', 'Esta semana', '#8C877C']]
const MODULO = { liquidacion: 'Liquidación', cartera: 'Cartera', compras: 'Compras', vehiculos: 'Vehículos', domicilios: 'Domicilios', cambios: 'Cambios', despacho: 'Despacho', rutas: 'Rutas', conteo: 'Conteo', 'ajustes-inventario': 'Ajustes', inventario: 'Inventario', transferencias: 'Transferencias', configuracion: 'Configuración', produccion: 'Producción', ejecutivo: 'Inicio' }
const corto = (n) => (n || '').replace(/ SAS$/i, '').replace(/ Maissy$/i, '')

export default function Tareas() {
  const router = useRouter()
  const [usuario, setUsuario] = useState(null)
  const [empresas, setEmpresas] = useState([])
  const [empresa, setEmpresa] = useState('todas')
  const [prioridad, setPrioridad] = useState('todas')
  const [items, setItems] = useState(null)

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')
    if (!u) { router.push('/'); return }
    if (!['admin', 'auxiliar'].includes(u.rol)) { router.push('/'); return }
    setUsuario(u)
    supabase.from('empresas').select('id, nombre').eq('activo', true).order('nombre').then(({ data }) => setEmpresas((data || []).filter(e => !u.empresas || u.empresas.includes(e.id))))
  }, [router])

  const cargar = useCallback(async () => {
    if (!empresas.length) return
    setItems(await cargarPendientes(empresas.map(e => e.id), { completo: true }).catch(() => []))
  }, [empresas])
  useEffect(() => { cargar() }, [cargar])

  if (!usuario) return null
  const visibles = (items || []).filter(it => (empresa === 'todas' || it.empresa_id === empresa) && (prioridad === 'todas' || it.prioridad === prioridad))
  const cuenta = (p) => (items || []).filter(it => (empresa === 'todas' || it.empresa_id === empresa) && (p === 'todas' || it.prioridad === p)).length
  const visto = async (it) => { setItems(l => l.filter(x => x.clave !== it.clave)); await marcarAlertaVista(it.alertaId); invalidarPendientes() }

  return (
    <div style={{ background: C.fondo, minHeight: '100vh', color: C.tinta }}>
      <PageHeader title="Tareas" subtitle="Lo que hay por hacer, por urgencia"
        actions={<button onClick={() => { invalidarPendientes(); setItems(null); cargar() }} className="px-3 min-h-[40px] rounded-xl text-sm font-bold" style={{ background: C.suave }}>Actualizar</button>} />
      <div className="p-4 max-w-4xl mx-auto flex flex-col gap-4">
        <div className="flex flex-wrap gap-3 justify-between">
          <div className="flex gap-2 flex-wrap">
            {[['todas', 'Todas'], ...GRUPOS.map(([p, n]) => [p, n])].map(([p, n]) => (
              <Chip key={p} sel={prioridad === p} onClick={() => setPrioridad(p)}>{n} · {items ? cuenta(p) : '…'}</Chip>
            ))}
          </div>
          {empresas.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              <Chip sel={empresa === 'todas'} onClick={() => setEmpresa('todas')}>Las dos empresas</Chip>
              {empresas.map(e => <Chip key={e.id} sel={empresa === e.id} onClick={() => setEmpresa(e.id)}>{corto(e.nombre)}</Chip>)}
            </div>
          )}
        </div>

        {!items ? <p className="text-center py-16" style={{ color: C.gris }}>Cargando…</p> : visibles.length === 0 ? (
          <div className="bg-white rounded-[18px] p-5"><b>Todo al día.</b><p className="text-sm" style={{ color: C.gris }}>No hay tareas con este filtro.</p></div>
        ) : GRUPOS.filter(([p]) => visibles.some(it => it.prioridad === p)).map(([p, nombre, color]) => (
          <section key={p} className="flex flex-col gap-2" aria-label={nombre}>
            <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: C.gris }}>{nombre}</span>
            {visibles.filter(it => it.prioridad === p).map(it => (
              <div key={it.clave} className="bg-white rounded-2xl px-4 py-3 grid gap-3 items-center" style={{ gridTemplateColumns: '10px minmax(0,1fr) auto' }}>
                <i className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                <span className="min-w-0 text-sm"><b>{it.titulo}</b>{it.detalle && <span className="block text-[13px]" style={{ color: C.gris }}>{it.detalle}</span>}</span>
                <span className="flex gap-2 flex-wrap justify-end">
                  {it.alertaId && <button type="button" onClick={() => visto(it)} className="rounded-xl min-h-[38px] px-3 text-[13.5px] font-bold" style={{ background: C.suave }}>Visto</button>}
                  <Link href={it.href} className="rounded-xl min-h-[38px] px-3 text-[13.5px] font-bold flex items-center" style={{ background: C.suave }}>{MODULO[it.modulo] || 'Abrir'}</Link>
                </span>
              </div>
            ))}
          </section>
        ))}
        <p className="text-[13px]" style={{ color: C.gris }}>Las tareas se apagan solas cuando se resuelven en su módulo. Los avisos, como una transferencia rechazada, se quitan con “Visto”.</p>
      </div>
    </div>
  )
}

const Chip = ({ sel, onClick, children }) => (
  <button type="button" onClick={onClick} className="rounded-full min-h-[38px] px-3.5 text-[13.5px] font-bold"
    style={sel ? { background: '#fff', boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: C.suave }}>{children}</button>
)
