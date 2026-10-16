'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { linkMapa } from '@/lib/ubicacion'

// Donde va la ruta hoy, segun lo que el vendedor va marcando en Mi ruta:
// avance contra el rutero, ritmo contra el mismo dia de la semana pasada,
// ultima ubicacion del celular y cada visita/venta con su hora y su punto.
const fmt = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO')
const hora = (iso) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })
const hace = (iso) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return min < 1 ? 'ahora' : min < 60 ? `hace ${min} min` : `hace ${Math.floor(min / 60)} h ${min % 60} min`
}
const RESULTADO = { compro: 'Compró', no_compro: 'No compró', no_estaba: 'No estaba', reprogramada: 'Reprogramado' }

export default function HoyEnLaCalle({ rutaId, totalHoy }) {
  const [datos, setDatos] = useState(null)
  const [abierto, setAbierto] = useState(true)

  const cargar = async () => {
    const empresaId = getEmpresaId()
    const hoy = obtenerFechaActual()
    const semanaPasada = new Date(new Date(hoy + 'T12:00:00').getTime() - 7 * 864e5).toLocaleDateString('en-CA')
    const [{ data: vis }, { data: vts }, { data: ubic }, { data: antes }] = await Promise.all([
      supabase.from('visitas_ruta').select('id, created_at, resultado, lat, lng, clientes(nombre, apto, edificio, barrio)')
        .eq('ruta_id', rutaId).eq('fecha', hoy).eq('empresa_id', empresaId).order('created_at', { ascending: false }),
      supabase.from('ventas_ruta').select('id, numero, created_at, nombre_cliente, cliente_id, total, forma_pago, lat, lng')
        .eq('ruta_id', rutaId).eq('fecha', hoy).eq('estado', 'activa').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
      supabase.from('ubicaciones_ruta').select('lat, lng, precision_m, created_at')
        .eq('ruta_id', rutaId).eq('fecha', hoy).eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(1),
      supabase.from('visitas_ruta').select('created_at').eq('ruta_id', rutaId).eq('fecha', semanaPasada).eq('empresa_id', empresaId),
    ])
    // Ritmo: cuantos llevaba la semana pasada a esta misma hora.
    const ahora = new Date()
    const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes()
    const llevabaAntes = (antes || []).filter(v => { const d = new Date(v.created_at); return d.getHours() * 60 + d.getMinutes() <= minutosAhora }).length
    // Linea de tiempo: visitas (con su venta si compro) y ventas en la calle.
    const eventos = [
      ...(vis || []).map(v => ({ id: 'v' + v.id, t: v.created_at, quien: v.clientes?.nombre || 'Cliente', detalle: [v.clientes?.edificio, v.clientes?.apto, v.clientes?.barrio].filter(Boolean).filter(x => !(v.clientes?.nombre || '').includes(x)).join(' · '), resultado: v.resultado, lat: v.lat, lng: v.lng })),
      ...(vts || []).filter(v => !v.cliente_id).map(v => ({ id: 's' + v.id, t: v.created_at, quien: v.nombre_cliente, detalle: 'Venta en la calle', resultado: 'compro', total: Number(v.total || 0), lat: v.lat, lng: v.lng })),
    ].sort((a, b) => b.t.localeCompare(a.t))
    const porForma = (f) => (vts || []).filter(v => v.forma_pago === f).reduce((s, v) => s + Number(v.total || 0), 0)
    setDatos({
      visitas: vis || [], eventos, ultima: (ubic || [])[0] || null, llevabaAntes, tieneHistorial: (antes || []).length > 0,
      ventas: (vts || []).length, efectivo: porForma('efectivo'), transferencia: porForma('transferencia'), credito: porForma('credito'),
    })
  }

  useEffect(() => { if (rutaId) cargar() }, [rutaId])

  if (!datos) return null
  const visitados = datos.visitas.length
  const compraron = datos.visitas.filter(v => v.resultado === 'compro').length
  const ultimaMarca = datos.eventos[0]

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => setAbierto(!abierto)} className="text-left" aria-expanded={abierto}>
          <p className="font-black text-gray-900">Hoy en la calle {abierto ? '▾' : '▸'}</p>
          <p className="text-sm text-gray-500">
            {visitados} de {totalHoy} visitados · {compraron} compraron · {datos.ventas} tickets {fmt(datos.efectivo + datos.transferencia + datos.credito)}
          </p>
        </button>
        <div className="flex items-center gap-2">
          {datos.ultima
            ? <a href={linkMapa(datos.ultima.lat, datos.ultima.lng)} target="_blank" rel="noreferrer" className="text-sm font-bold bg-gray-900 text-white px-3 py-2 rounded-lg">📍 Ubicación {hace(datos.ultima.created_at)}</a>
            : <span className="text-xs text-gray-400">Sin ubicación hoy</span>}
          <button onClick={cargar} className="text-sm font-bold bg-gray-100 text-gray-700 px-3 py-2 rounded-lg">Actualizar</button>
        </div>
      </div>
      {abierto && (
        <>
          <div className="h-2 rounded-full bg-gray-100 mt-3 overflow-hidden"><div className="h-full bg-emerald-700" style={{ width: `${totalHoy ? Math.min(100, visitados / totalHoy * 100) : 0}%` }} /></div>
          <p className="text-xs text-gray-500 mt-1.5">
            {ultimaMarca ? `Última marca ${hora(ultimaMarca.t)} (${hace(ultimaMarca.t)}): ${ultimaMarca.quien}` : 'Todavía no ha marcado ningún cliente hoy'}
            {datos.tieneHistorial ? ` · la semana pasada a esta hora llevaba ${datos.llevabaAntes}${visitados < datos.llevabaAntes ? ' (va más lento)' : ''}` : ''}
          </p>
          {datos.eventos.length > 0 && (
            <div className="mt-3 max-h-80 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-xl">
              {datos.eventos.map(e => (
                <div key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="w-16 shrink-0 text-gray-500 tabular-nums">{hora(e.t)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="font-bold text-gray-900">{e.quien}</span>
                    {e.detalle && <span className="text-xs text-gray-500"> · {e.detalle}</span>}
                  </span>
                  <span className={`shrink-0 text-xs font-bold px-2 py-1 rounded-full ${e.resultado === 'compro' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                    {RESULTADO[e.resultado]}{e.total ? ' ' + fmt(e.total) : ''}
                  </span>
                  {e.lat != null ? <a href={linkMapa(e.lat, e.lng)} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-bold text-brand underline">mapa</a> : <span className="shrink-0 w-8" />}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
