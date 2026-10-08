'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import ConciliacionBanco from '@/components/ConciliacionBanco'

const fmt = (v) => `$${Math.round(v || 0).toLocaleString('es-CO')}`

// Cartera > Transferencias: lo que los vendedores reportaron como pagado por
// transferencia y aun no se ha visto en el banco. Un admin marca "Llego"
// (entra a Caja y Bancos); si vence la fecha limite sin llegar, Nomina se lo
// descuenta al vendedor.
export default function TransferenciasPorVerificar({ usuario, onCambio }) {
  const [pendientes, setPendientes] = useState([])
  const [resueltas, setResueltas] = useState([])
  const [cuentas, setCuentas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [confirmando, setConfirmando] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [conciliando, setConciliando] = useState(false)
  const hoy = obtenerFechaActual()
  const esAdmin = usuario?.rol === 'admin'

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setCargando(true)
    const empresaId = getEmpresaId()
    const hace30 = new Date(Date.now() - 30 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const [{ data: pend }, { data: res }, { data: cue }] = await Promise.all([
      supabase.from('transferencias_ruta').select('*, vendedores(nombre), rutas(nombre, cuenta_id)')
        .eq('empresa_id', empresaId).eq('estado', 'por_verificar').order('fecha_limite'),
      supabase.from('transferencias_ruta').select('*, vendedores(nombre), rutas(nombre)')
        .eq('empresa_id', empresaId).in('estado', ['recibida', 'descontada']).gte('fecha', hace30).order('verificada_at', { ascending: false }),
      supabase.from('cuentas').select('id, nombre').eq('empresa_id', empresaId).eq('tipo', 'banco').eq('estado', true).order('nombre'),
    ])
    setPendientes(pend || [])
    setResueltas(res || [])
    setCuentas(cue || [])
    setCargando(false)
    onCambio?.((pend || []).length)
  }

  const marcarLlego = async () => {
    const t = confirmando.transferencia
    if (!confirmando.cuentaId) { alert('Elige a qué cuenta llegó'); return }
    setGuardando(true)
    const empresaId = getEmpresaId()
    const { error } = await supabase.from('transferencias_ruta').update({
      estado: 'recibida', cuenta_id: confirmando.cuentaId, verificada_por: usuario.nombre, verificada_at: new Date().toISOString(),
    }).eq('id', t.id).eq('empresa_id', empresaId).eq('estado', 'por_verificar')
    if (error) { alert('Error: ' + error.message); setGuardando(false); return }
    const { error: errTes } = await supabase.from('movimientos_tesoreria').insert({
      empresa_id: empresaId, cuenta_id: confirmando.cuentaId, fecha: hoy, tipo: 'entrada', monto: Number(t.valor),
      concepto: `Transferencia verificada - ${t.vendedores?.nombre || ''} (${t.rutas?.nombre || ''}, ${t.fecha})${t.referencia ? ' ref ' + t.referencia : ''}`,
      referencia_tipo: 'transferencia_ruta', referencia_id: t.id,
    })
    if (errTes) alert('Quedó como recibida, pero no se pudo registrar la entrada en Caja y Bancos: ' + errTes.message)
    setGuardando(false)
    setConfirmando(null)
    cargar()
  }

  const totalPendiente = pendientes.reduce((s, t) => s + Number(t.valor), 0)
  const vencidas = pendientes.filter(t => t.fecha_limite && t.fecha_limite < hoy)

  if (cargando) return <p className="text-gray-400 text-center py-10">Cargando...</p>

  return (
    <div>
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex justify-between items-center">
        <div>
          <p className="text-xs text-gray-500">Transferencias por verificar</p>
          <p className="text-2xl font-black text-gray-800">{fmt(totalPendiente)}</p>
        </div>
        {vencidas.length > 0 && (
          <p className="text-xs font-bold text-brand text-right">{vencidas.length} vencida{vencidas.length > 1 ? 's' : ''}<br />se descuentan en nómina</p>
        )}
      </div>

      {esAdmin && pendientes.length > 0 && !conciliando && (
        <button onClick={() => setConciliando(true)}
          className="w-full mb-4 bg-secondary hover:bg-black text-white font-bold py-3 rounded-xl text-sm">
          🏦 Conciliar con el banco (pantallazos de movimientos)
        </button>
      )}
      {conciliando && (
        <ConciliacionBanco pendientes={pendientes} cuentas={cuentas} usuario={usuario}
          onTerminar={(recargar) => { setConciliando(false); if (recargar !== false) cargar() }} />
      )}

      {pendientes.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center shadow-sm mb-4">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-gray-500">No hay transferencias pendientes de verificar</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100 mb-4">
          {pendientes.map(t => {
            const vencida = t.fecha_limite && t.fecha_limite < hoy
            const abierto = confirmando?.transferencia.id === t.id
            return (
              <div key={t.id} className={`p-4 ${vencida ? 'bg-brand/5' : ''}`}>
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-800">{t.vendedores?.nombre || 'Vendedor'} <span className="text-xs text-gray-400 font-normal">· {t.rutas?.nombre || ''}</span></p>
                    <p className="text-xs text-gray-500">
                      Liquidación {t.fecha}{t.referencia ? ` · ref ${t.referencia}` : ''}{t.banco ? ` · ${t.banco}` : ''}
                    </p>
                    {t.destino && <p className="text-xs text-gray-400">→ {t.destino}{t.cuenta_maissy === false ? ' ⚠ no coincidía con cuentas Maissy' : ''}</p>}
                    <p className={`text-xs font-bold ${vencida ? 'text-brand' : 'text-amber-600'}`}>
                      {vencida ? `Venció el ${t.fecha_limite} — se le descuenta en nómina` : `Fecha límite: ${t.fecha_limite || '—'}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-black text-gray-800">{fmt(t.valor)}</p>
                    {esAdmin && !abierto && (
                      <button onClick={() => setConfirmando({ transferencia: t, cuentaId: t.cuenta_id || t.rutas?.cuenta_id || '' })}
                        className="mt-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg">Llegó</button>
                    )}
                  </div>
                </div>
                {abierto && (
                  <div className="mt-3 flex flex-col md:flex-row gap-2">
                    <select value={confirmando.cuentaId} onChange={e => setConfirmando({ ...confirmando, cuentaId: e.target.value })}
                      className="flex-1 min-w-0 border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
                      <option value="">¿A qué cuenta llegó?</option>
                      {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <button onClick={() => setConfirmando(null)} className="flex-1 bg-gray-100 text-gray-600 text-sm font-bold px-4 py-2 rounded-lg">Cancelar</button>
                      <button onClick={marcarLlego} disabled={guardando} className="flex-1 bg-emerald-600 text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50">
                        {guardando ? '...' : 'Confirmar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {!esAdmin && pendientes.length > 0 && <p className="text-xs text-gray-400 mb-4 px-1">Solo un administrador puede confirmar que una transferencia llegó.</p>}

      {resueltas.length > 0 && (
        <>
          <p className="text-xs font-bold text-gray-500 mb-2 px-1">Resueltas (últimos 30 días)</p>
          <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
            {resueltas.map(t => (
              <div key={t.id} className="p-3 flex justify-between items-center gap-3 text-sm">
                <div className="min-w-0">
                  <p className="text-gray-700">{t.vendedores?.nombre || ''} · {t.fecha}{t.referencia ? ` · ref ${t.referencia}` : ''}</p>
                  <p className={`text-xs font-bold ${t.estado === 'recibida' ? 'text-emerald-600' : 'text-brand'}`}>
                    {t.estado === 'recibida' ? `Llegó · confirmó ${t.verificada_por || ''}` : 'No llegó · descontada en nómina'}
                  </p>
                </div>
                <p className="font-bold text-gray-700 shrink-0">{fmt(t.valor)}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
