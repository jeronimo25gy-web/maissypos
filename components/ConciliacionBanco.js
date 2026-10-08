'use client'
import { useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { reducirImagen } from '@/components/ComprobantesTransferencia'
import { cruzarConMovimientos } from '@/lib/conciliacion'

const fmt = (v) => `$${Math.round(v || 0).toLocaleString('es-CO')}`
export default function ConciliacionBanco({ pendientes, cuentas, usuario, onTerminar }) {
  const inputRef = useRef(null)
  const [cuentaId, setCuentaId] = useState('')
  const [leyendo, setLeyendo] = useState(0)
  const [mensajes, setMensajes] = useState([])
  const [resultado, setResultado] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const hoy = obtenerFechaActual()

  // Solo las que pudieron llegar a esta cuenta: las que se identificaron con
  // ella o, si no se sabe, las de rutas que cobran en ella.
  const pendientesCuenta = pendientes.filter(t => !cuentaId || (t.cuenta_id ? t.cuenta_id === cuentaId : (t.rutas?.cuenta_id ? t.rutas.cuenta_id === cuentaId : true)))

  const leerPantallazos = async (files) => {
    const lista = Array.from(files || [])
    if (!cuentaId) { alert('Primero elige la cuenta del banco'); return }
    if (lista.length === 0) return
    setMensajes([])
    setResultado(null)
    setLeyendo(lista.length)
    const { data: { session } } = await supabase.auth.getSession()
    const todas = []
    const leerUno = async (file) => {
      try {
        const imagen = await reducirImagen(file)
        const res = await fetch('/api/leer-movimientos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ imagen, media_type: 'image/jpeg', empresa_id: getEmpresaId() }),
        })
        const json = await res.json()
        if (!res.ok) { setMensajes(m => [...m, `${file.name}: ${json.error}`]); return }
        if (!json.es_movimientos) { setMensajes(m => [...m, `${file.name}: no parece una lista de movimientos del banco`]); return }
        todas.push(...json.movimientos)
      } catch (e) {
        setMensajes(m => [...m, `${file.name}: ${e.message}`])
      } finally {
        setLeyendo(n => n - 1)
      }
    }
    for (let i = 0; i < lista.length; i += 3) await Promise.all(lista.slice(i, i + 3).map(leerUno))
    if (inputRef.current) inputRef.current.value = ''

    // Los pantallazos se solapan al hacer scroll: quitar movimientos repetidos.
    const vistos = new Set()
    const entradas = todas.filter(m => m.tipo === 'entrada' && m.valor > 0).filter(m => {
      const k = `${m.fecha}|${m.valor}|${(m.descripcion || '').toLowerCase()}|${m.referencia || ''}`
      if (vistos.has(k)) return false
      vistos.add(k)
      return true
    })
    setResultado({ entradas: entradas.length, ...cruzarConMovimientos(pendientesCuenta, entradas, hoy) })
  }

  const confirmar = async () => {
    const elegidas = resultado.propuestas.filter(p => p.marcada)
    if (elegidas.length === 0) return
    setGuardando(true)
    const empresaId = getEmpresaId()
    const fallos = []
    for (const p of elegidas) {
      const t = p.transferencia
      const { error } = await supabase.from('transferencias_ruta').update({
        estado: 'recibida', cuenta_id: cuentaId, verificada_por: `${usuario.nombre} (conciliación)`, verificada_at: new Date().toISOString(),
      }).eq('id', t.id).eq('empresa_id', empresaId).eq('estado', 'por_verificar')
      if (error) { fallos.push(`${t.vendedores?.nombre || ''} ${fmt(t.valor)}`); continue }
      const { error: errTes } = await supabase.from('movimientos_tesoreria').insert({
        empresa_id: empresaId, cuenta_id: cuentaId, fecha: p.movimiento.fecha || hoy, tipo: 'entrada', monto: Number(t.valor),
        concepto: `Transferencia verificada - ${t.vendedores?.nombre || ''} (${t.rutas?.nombre || ''}, ${t.fecha})${t.referencia ? ' ref ' + t.referencia : ''}`,
        referencia_tipo: 'transferencia_ruta', referencia_id: t.id,
      })
      if (errTes) fallos.push(`caja de ${fmt(t.valor)}`)
    }
    setGuardando(false)
    if (fallos.length) alert('Algunas no se pudieron marcar: ' + fallos.join(', '))
    onTerminar()
  }

  const marcadas = resultado ? resultado.propuestas.filter(p => p.marcada) : []

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-4 border-2 border-secondary/20">
      <div className="flex justify-between items-center mb-2">
        <p className="font-black text-gray-800">Conciliar con el banco</p>
        <button onClick={() => onTerminar(false)} className="text-xs text-gray-500 font-bold">Cerrar</button>
      </div>
      <p className="text-xs text-gray-500 mb-3">Sube pantallazos de los movimientos de la cuenta (la lista de la app del banco). Se cruzan con las transferencias por verificar y te propone cuáles ya llegaron. Las fotos no se guardan.</p>

      <div className="flex flex-col md:flex-row gap-2 mb-2">
        <select value={cuentaId} onChange={e => { setCuentaId(e.target.value); setResultado(null) }}
          className="flex-1 min-w-0 border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
          <option value="">¿Qué cuenta vas a conciliar?</option>
          {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <button onClick={() => (cuentaId ? inputRef.current?.click() : alert('Primero elige la cuenta del banco'))} disabled={leyendo > 0}
          className="bg-secondary text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50">
          {leyendo > 0 ? `Leyendo ${leyendo}...` : '📷 Subir pantallazos'}
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => leerPantallazos(e.target.files)} />
      </div>
      {cuentaId && <p className="text-xs text-gray-400 mb-2">{pendientesCuenta.length} transferencia{pendientesCuenta.length !== 1 ? 's' : ''} por verificar que pueden haber llegado a esta cuenta.</p>}

      {mensajes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 mb-2">
          {mensajes.map((m, i) => <p key={i} className="text-xs text-amber-800">{m}</p>)}
        </div>
      )}

      {resultado && (
        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-2">Se leyeron {resultado.entradas} entradas de plata en el banco.</p>

          <p className="text-sm font-black text-emerald-700 mb-1">Cuadran con el banco ({resultado.propuestas.length})</p>
          {resultado.propuestas.length === 0 ? (
            <p className="text-xs text-gray-400 mb-3">Ninguna transferencia pendiente coincide con estos movimientos.</p>
          ) : (
            <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg mb-3">
              {resultado.propuestas.map((p, i) => (
                <label key={p.transferencia.id} className="flex items-start gap-2 p-2 cursor-pointer">
                  <input type="checkbox" checked={p.marcada} className="mt-1 accent-brand"
                    onChange={e => setResultado(r => ({ ...r, propuestas: r.propuestas.map((x, j) => j === i ? { ...x, marcada: e.target.checked } : x) }))} />
                  <span className="min-w-0 text-sm">
                    <span className="font-bold text-gray-800">{fmt(p.transferencia.valor)}</span>
                    <span className="text-gray-600"> · {p.transferencia.vendedores?.nombre || ''} · liq. {p.transferencia.fecha}{p.transferencia.referencia ? ` · ref ${p.transferencia.referencia}` : ''}</span>
                    <span className="block text-xs text-gray-500">Banco: {p.movimiento.fecha || 's/f'} · {p.movimiento.descripcion || p.movimiento.referencia || 'entrada'}</span>
                    <span className={`block text-[11px] font-bold ${p.fuerza === 'referencia' ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {p.fuerza === 'referencia' ? '✓ Coincide referencia y valor' : p.fuerza === 'valor_varios' ? '⚠ Coincide solo el valor (hay varias entradas de ese valor, revisa)' : '⚠ Coincide valor y fecha (sin referencia)'}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}

          {resultado.restantes.length > 0 && (
            <>
              <p className="text-sm font-black text-brand mb-1">No aparecen en estos pantallazos ({resultado.restantes.length})</p>
              <div className="text-xs text-gray-600 mb-3 space-y-0.5">
                {resultado.restantes.map(t => (
                  <p key={t.id}>{fmt(t.valor)} · {t.vendedores?.nombre || ''} · liq. {t.fecha}{t.referencia ? ` · ref ${t.referencia}` : ''} · límite {t.fecha_limite || '—'}</p>
                ))}
              </div>
            </>
          )}

          {marcadas.length > 0 && (
            <button onClick={confirmar} disabled={guardando}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl disabled:opacity-50">
              {guardando ? 'Marcando...' : `Marcar ${marcadas.length} como llegadas (${fmt(marcadas.reduce((s, p) => s + Number(p.transferencia.valor), 0))})`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
