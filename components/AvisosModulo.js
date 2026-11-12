'use client'
// Avisos sueltos (alertas_admin) del módulo abierto: los mismos que cuentan en
// la insignia del menú y en la campanita, ahora visibles dentro del módulo con
// su botón de "Visto". Antes solo salían en la campanita y el módulo abría
// vacío aunque el menú dijera 9 (descuadres de liquidaciones ya corregidas).

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { ALERTAS, ALERTAS_CUBIERTAS, marcarAlertaVista } from '@/lib/pendientes'

const TINTA = '#1C1B19', GRIS = '#5A5750'

export const avisarPendientes = () => window.dispatchEvent(new Event('maissy:pendientes'))

export default function AvisosModulo() {
  const pathname = usePathname()
  const ruta = '/' + (pathname || '').split('/').filter(Boolean)[0]
  // Las ventas anuladas ya tienen su propia lista en Rutas (Tickets anulados).
  const tipos = Object.entries(ALERTAS).filter(([t, m]) => m.href === ruta && !ALERTAS_CUBIERTAS.includes(t) && t !== 'venta_anulada').map(([t]) => t)
  const clave = tipos.join(',')
  const [avisos, setAvisos] = useState([])
  const [verTodos, setVerTodos] = useState(false)

  const cargar = useCallback(async () => {
    const empresaId = getEmpresaId()
    let u = null
    try { u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null') } catch { u = null }
    const puede = clave && empresaId && u && ['admin', 'auxiliar'].includes(u.rol)
    const { data } = puede
      ? await supabase.from('alertas_admin').select('id, tipo, mensaje, created_at')
        .eq('empresa_id', empresaId).eq('leida', false).in('tipo', clave.split(',')).order('created_at', { ascending: false }).limit(50)
      : { data: [] }
    setAvisos(data || [])
  }, [clave])
  useEffect(() => { cargar() }, [cargar, pathname])

  if (!avisos.length) return null
  const visto = async (ids) => {
    await Promise.all(ids.map(id => marcarAlertaVista(id)))
    setAvisos(prev => prev.filter(a => !ids.includes(a.id)))
    avisarPendientes()
  }
  const lista = verTodos ? avisos : avisos.slice(0, 3)
  const hora = (f) => new Date(f).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

  return (
    <section className="rounded-2xl px-4 py-3 flex flex-col gap-2" style={{ background: '#FFF4CC', color: TINTA }} aria-label="Avisos del módulo">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <b className="text-[14.5px]">{avisos.length === 1 ? '1 aviso' : `${avisos.length} avisos`}</b>
        {avisos.length > 1 && (
          <button type="button" onClick={() => visto(avisos.map(a => a.id))} className="text-[13px] font-bold rounded-lg px-3 min-h-[32px] bg-white" style={{ color: TINTA }}>Marcar todos como vistos</button>
        )}
      </div>
      {lista.map(a => (
        <div key={a.id} className="flex items-start justify-between gap-3 py-1" style={{ borderTop: '1px solid rgba(28,27,25,.08)' }}>
          <span className="min-w-0 text-[13.5px] leading-snug">{a.mensaje}<span className="block text-[12px]" style={{ color: GRIS }}>{hora(a.created_at)}</span></span>
          <button type="button" onClick={() => visto([a.id])} className="shrink-0 text-[12.5px] font-bold rounded-lg px-3 min-h-[30px] bg-white" style={{ color: TINTA }}>Visto</button>
        </div>
      ))}
      {avisos.length > 3 && (
        <button type="button" onClick={() => setVerTodos(!verTodos)} className="self-start text-[13px] font-bold" style={{ color: GRIS }}>{verTodos ? 'Ver menos' : `Ver los ${avisos.length}`}</button>
      )}
    </section>
  )
}
