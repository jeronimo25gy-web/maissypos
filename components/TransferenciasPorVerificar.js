'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import ConciliacionBanco from '@/components/ConciliacionBanco'
import BuscarCliente from '@/components/BuscarCliente'
import { paginado } from '../lib/paginar'

const fmt = (v) => `$${Math.round(v || 0).toLocaleString('es-CO')}`

// Cartera > Transferencias: lo que los vendedores reportaron como pagado por
// transferencia y aun no se ha visto en el banco. Un admin marca "Llego"
// (entra a Caja y Bancos). Si vence la fecha limite sin llegar sigue
// pendiente: el admin decide si se le carga al vendedor, y solo las cargadas
// se descuentan en la nomina.
export default function TransferenciasPorVerificar({ usuario, onCambio }) {
  const [pendientes, setPendientes] = useState([])
  const [resueltas, setResueltas] = useState([])
  const [cuentas, setCuentas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [marcando, setMarcando] = useState({}) // id -> true mientras se guarda
  const [ruta, setRuta] = useState('todas')
  const [abiertas, setAbiertas] = useState({}) // ruta -> abierta
  const [clientes, setClientes] = useState([])
  const [aCartera, setACartera] = useState(null) // { t, clienteId, nombre, fechaPago }
  const [conciliando, setConciliando] = useState(false)
  const [cargando1, setCargando1] = useState(null) // transferencia que se va a cargar al vendedor
  const hoy = obtenerFechaActual()
  const esAdmin = usuario?.rol === 'admin'

  useEffect(() => { cargar() }, [])

  const cargar = async ({ silencio } = {}) => {
    if (!silencio) setCargando(true)
    const empresaId = getEmpresaId()
    const hace30 = new Date(Date.now() - 30 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const [{ data: pend }, { data: res }, { data: cue }, { data: cls }] = await Promise.all([
      supabase.from('transferencias_ruta').select('*, vendedores(nombre), rutas(nombre, cuenta_id)')
        .eq('empresa_id', empresaId).in('estado', ['por_verificar', 'cargada']).order('fecha_limite'),
      supabase.from('transferencias_ruta').select('*, vendedores(nombre), rutas(nombre)')
        .eq('empresa_id', empresaId).in('estado', ['recibida', 'descontada', 'a_cartera']).gte('fecha', hace30).order('verificada_at', { ascending: false }),
      supabase.from('cuentas').select('id, nombre').eq('empresa_id', empresaId).eq('tipo', 'banco').eq('estado', true).order('nombre'),
      paginado(() => supabase.from('clientes').select('id, nombre, dias_credito, apto, edificio, barrio, telefono, nit, rutas(nombre)').eq('empresa_id', empresaId).eq('estado', true).order('nombre')),
    ])
    setClientes(cls || [])
    setPendientes(pend || [])
    setResueltas(res || [])
    setCuentas(cue || [])
    setCargando(false)
    onCambio?.((pend || []).length)
  }

  // La cuenta sale de una vez: la de la transferencia o la de su ruta; se cambia
  // en el selector si llegó a otra.
  const [cuentaDe, setCuentaDe] = useState({})
  const cuentaPara = (t) => cuentaDe[t.id] ?? (t.cuenta_id || t.rutas?.cuenta_id || '')
  const marcarLlego = async (t) => {
    const cuentaId = cuentaPara(t)
    if (!cuentas.some(c => c.id === cuentaId)) { alert('Elige a qué cuenta llegó'); return }
    const confirmando = { cuentaId }
    setMarcando(m => ({ ...m, [t.id]: true }))
    const empresaId = getEmpresaId()
    const { error } = await supabase.from('transferencias_ruta').update({
      estado: 'recibida', cuenta_id: confirmando.cuentaId, verificada_por: usuario.nombre, verificada_at: new Date().toISOString(),
    }).eq('id', t.id).eq('empresa_id', empresaId).in('estado', ['por_verificar', 'cargada'])
    if (error) { alert('Error: ' + error.message); setMarcando(m => ({ ...m, [t.id]: false })); return }
    const { error: errTes } = await supabase.from('movimientos_tesoreria').insert({
      empresa_id: empresaId, cuenta_id: confirmando.cuentaId, fecha: hoy, tipo: 'entrada', monto: Number(t.valor),
      concepto: t.vendedor_id
        ? `Transferencia verificada - ${t.vendedores?.nombre || ''} (${t.rutas?.nombre || ''}, ${t.fecha})${t.referencia ? ' ref ' + t.referencia : ''}`
        : `Transferencia verificada - ${t.referencia || 'venta'} (${t.fecha})`,
      referencia_tipo: 'transferencia_ruta', referencia_id: t.id,
    })
    if (errTes) alert('Quedó como recibida, pero no se pudo registrar la entrada en Caja y Bancos: ' + errTes.message)
    // Venta de mostrador o domicilio: queda con la cuenta a la que llegó.
    if (t.venta_encab_id) await supabase.from('ventas_encab').update({ cuenta_id: confirmando.cuentaId }).eq('id', t.venta_encab_id).eq('empresa_id', empresaId)
    // Sin recargar la lista: la fila queda en su lugar, marcada como llegada.
    const nombreCuenta = cuentas.find(c => c.id === cuentaId)?.nombre || ''
    setMarcando(m => ({ ...m, [t.id]: false }))
    setPendientes(prev => {
      const n = prev.map(x => x.id === t.id ? { ...x, llego: nombreCuenta } : x)
      onCambio?.(n.filter(x => !x.llego && !x.aCartera).length)
      return n
    })
  }

  // No llegó: pasa a Cartera como crédito pendiente del cliente. El nombre sale
  // de la referencia del ticket o del pago de crédito si se puede.
  const sinTildes = (x) => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  const abrirCartera = (t) => {
    const ref = t.referencia || ''
    const nombre = (ref.match(/^Ticket #\d+\s+(.+)$/) || ref.match(/^Pago crédito:\s*(.+)$/) || ref.match(/^Mostrador CV-\d+\s+(.+)$/) || ref.match(/^Domicilio #\d+\s+(.+)$/) || [])[1]?.split(' · ')[0]?.trim() || ''
    const cli = nombre && clientes.find(c => sinTildes(c.nombre) === sinTildes(nombre))
    const plazo = Number(cli?.dias_credito) || 7
    const f = new Date(hoy + 'T12:00:00'); f.setDate(f.getDate() + plazo)
    setACartera({ t, clienteId: cli?.id || '', nombre: cli ? cli.nombre : nombre, fechaPago: f.toLocaleDateString('en-CA') })
  }
  const pasarACartera = async () => {
    const { t, clienteId, fechaPago } = aCartera
    const cli = clientes.find(c => c.id === clienteId)
    const nombre = (cli?.nombre || aCartera.nombre || '').trim()
    if (!nombre) { alert('Escriba a nombre de quién queda el crédito'); return }
    setMarcando(m => ({ ...m, [t.id]: true }))
    const empresaId = getEmpresaId()
    const { data: cf, error } = await supabase.from('cartera_fiados').insert({
      empresa_id: empresaId, ruta_id: t.ruta_id || null, vendedor_id: t.vendedor_id || null, despacho_id: t.despacho_id || null,
      cliente_id: cli?.id || null, nombre_cliente: nombre, valor_original: Number(t.valor), saldo: Number(t.valor), venta_id: t.venta_encab_id || null,
      fecha_fiado: t.fecha || hoy, fecha_pago: fechaPago || null, estado: 'pendiente',
    }).select('id').single()
    if (error) { alert('No se pudo crear el crédito: ' + error.message); setMarcando(m => ({ ...m, [t.id]: false })); return }
    const { error: e2 } = await supabase.from('transferencias_ruta').update({
      estado: 'a_cartera', cartera_fiados_id: cf.id, verificada_por: usuario.nombre, verificada_at: new Date().toISOString(),
    }).eq('id', t.id).eq('empresa_id', empresaId).in('estado', ['por_verificar', 'cargada'])
    if (e2) alert('El crédito quedó en Cartera, pero la transferencia no se pudo marcar: ' + e2.message)
    setMarcando(m => ({ ...m, [t.id]: false }))
    setACartera(null)
    setPendientes(prev => {
      const n = prev.map(x => x.id === t.id ? { ...x, aCartera: nombre } : x)
      onCambio?.(n.filter(x => !x.llego && !x.aCartera).length)
      return n
    })
  }

  // Cargar al vendedor (o quitarle el cargo): solo pasa a la nomina lo cargado.
  const cambiarCargo = async (t, si) => {
    setGuardando(true)
    const { error } = await supabase.from('transferencias_ruta').update(si
      ? { estado: 'cargada', cargada_por: usuario.nombre, cargada_at: new Date().toISOString() }
      : { estado: 'por_verificar', cargada_por: null, cargada_at: null })
      .eq('id', t.id).eq('empresa_id', getEmpresaId()).eq('estado', si ? 'por_verificar' : 'cargada')
    setGuardando(false)
    if (error) { alert('Error: ' + error.message); return }
    setCargando1(null)
    cargar({ silencio: true })
  }

  const resuelta = (t) => t.llego || t.aCartera
  const abiertasLista = pendientes.filter(t => !resuelta(t))
  const porVerificar = abiertasLista.filter(t => t.estado === 'por_verificar')
  const cargadas = abiertasLista.filter(t => t.estado === 'cargada')
  const llegaronHoy = pendientes.filter(t => t.llego)
  const aCarteraHoy = pendientes.filter(t => t.aCartera)
  // Por ruta: cada ruta con lo que reportó, de la liquidación más antigua a la más reciente.
  // Las de Mostrador y Domicilios no son de una ruta: van en su propio grupo.
  const nombreRuta = (t) => t.rutas?.nombre || (t.origen === 'mostrador' ? 'Mostrador' : t.origen === 'domicilio' ? 'Domicilios' : 'Sin ruta')
  const grupos = Object.values(pendientes.reduce((m, t) => {
    const k = nombreRuta(t)
    ;(m[k] = m[k] || { ruta: k, items: [] }).items.push(t)
    return m
  }, {})).map(g => ({ ...g, items: g.items.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || Number(b.valor) - Number(a.valor)),
    pendientes: g.items.filter(t => !resuelta(t)), total: g.items.filter(t => !resuelta(t)).reduce((s, t) => s + Number(t.valor), 0) }))
    .sort((a, b) => b.pendientes.length - a.pendientes.length || a.ruta.localeCompare(b.ruta))
  const visibles = ruta === 'todas' ? grupos : grupos.filter(g => g.ruta === ruta)
  const estaAbierta = (g) => abiertas[g.ruta] ?? (ruta !== 'todas' || visibles.length === 1)
  const totalPendiente = porVerificar.reduce((s, t) => s + Number(t.valor), 0)
  const vencidas = porVerificar.filter(t => t.fecha_limite && t.fecha_limite < hoy)
  const fechaLinda = (f) => f ? new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : '—'

  if (cargando) return <p className="text-gray-400 text-center py-10">Cargando...</p>

  return (
    <div>
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex justify-between items-center">
        <div>
          <p className="text-xs text-gray-500">Transferencias por verificar</p>
          <p className="text-2xl font-black text-gray-800">{fmt(totalPendiente)}</p>
        </div>
        <div className="text-xs font-bold text-right flex flex-col gap-0.5">
          {vencidas.length > 0 && <span className="text-brand">{vencidas.length} vencida{vencidas.length > 1 ? 's' : ''} por decidir</span>}
          {cargadas.length > 0 && <span className="text-gray-600">{cargadas.length} cargada{cargadas.length > 1 ? 's' : ''} al vendedor · {fmt(cargadas.reduce((s, t) => s + Number(t.valor), 0))}</span>}
        </div>
      </div>

      {esAdmin && pendientes.length > 0 && !conciliando && (
        <button onClick={() => setConciliando(true)}
          className="w-full mb-4 bg-secondary hover:bg-black text-white font-bold py-3 rounded-xl text-sm">
          Conciliar con el banco (pantallazos de movimientos)
        </button>
      )}
      {conciliando && (
        <ConciliacionBanco pendientes={pendientes} cuentas={cuentas} usuario={usuario}
          onTerminar={(recargar) => { setConciliando(false); if (recargar !== false) cargar() }} />
      )}

      {pendientes.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center shadow-sm mb-4">
          <p className="text-gray-500">No hay transferencias pendientes de verificar</p>
        </div>
      ) : (
        <>
          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2" role="group" aria-label="Ruta">
            {[{ ruta: 'todas', pendientes: abiertasLista, total: totalPendiente + cargadas.reduce((s, t) => s + Number(t.valor), 0) }, ...grupos].map(g => (
              <button key={g.ruta} type="button" onClick={() => setRuta(g.ruta)} aria-pressed={ruta === g.ruta}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold border-2 ${ruta === g.ruta ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'}`}>
                {g.ruta === 'todas' ? 'Todas' : g.ruta} · {g.pendientes.length}
              </button>
            ))}
          </div>
          {llegaronHoy.length > 0 && (
            <p className="text-xs font-bold text-emerald-700 mb-2 px-1">Marcadas ahora: {llegaronHoy.length} · {fmt(llegaronHoy.reduce((s, t) => s + Number(t.valor), 0))}</p>
          )}
          {aCarteraHoy.length > 0 && (
            <p className="text-xs font-bold text-gray-600 mb-2 px-1">Pasadas a Cartera: {aCarteraHoy.length} · {fmt(aCarteraHoy.reduce((s, t) => s + Number(t.valor), 0))}</p>
          )}
          {visibles.map(g => {
            const abierta = estaAbierta(g)
            const porFecha = Object.entries(g.items.reduce((m, t) => { (m[t.fecha] = m[t.fecha] || []).push(t); return m }, {}))
            return (
              <section key={g.ruta} className="bg-white rounded-xl shadow-sm mb-3 overflow-hidden" aria-label={g.ruta}>
                <button type="button" onClick={() => setAbiertas(m => ({ ...m, [g.ruta]: !abierta }))} aria-expanded={abierta}
                  className="w-full flex justify-between items-center gap-3 p-4 text-left">
                  <span className="min-w-0">
                    <span className="block font-black text-gray-900">{g.ruta}</span>
                    <span className="block text-xs text-gray-500">{[...new Set(g.items.map(t => t.vendedores?.nombre).filter(Boolean))].join(', ')}</span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block font-black text-gray-900">{fmt(g.total)}</span>
                    <span className="block text-xs font-bold text-amber-600">{g.pendientes.length ? `${g.pendientes.length} por verificar` : 'Todas verificadas'}</span>
                  </span>
                </button>
                {abierta && porFecha.map(([fecha, items]) => (
                  <div key={fecha} className="border-t border-gray-100">
                    <p className="px-4 pt-3 text-xs font-bold text-gray-500">{items[0]?.despacho_id ? 'Liquidación' : 'Ventas del'} {fechaLinda(fecha)} · {items.filter(t => !resuelta(t)).length} por verificar</p>
                    <div className="divide-y divide-gray-100">
                      {items.map(t => {
                        if (t.aCartera) return (
                          <div key={t.id} className="px-4 py-2.5 flex justify-between items-center gap-3 bg-gray-50">
                            <p className="text-sm font-bold text-gray-700 min-w-0">No llegó · crédito de {t.aCartera} en Cartera</p>
                            <p className="font-black text-gray-700 shrink-0">{fmt(t.valor)}</p>
                          </div>
                        )
                        if (t.llego) return (
                          <div key={t.id} className="px-4 py-2.5 flex justify-between items-center gap-3 bg-emerald-50">
                            <p className="text-sm font-bold text-emerald-800 min-w-0">Llegó a {t.llego}{t.referencia ? <span className="font-normal text-emerald-700"> · ref {t.referencia}</span> : null}</p>
                            <p className="font-black text-emerald-800 shrink-0">{fmt(t.valor)}</p>
                          </div>
                        )
                        const cargada = t.estado === 'cargada'
                        const vencida = !cargada && t.fecha_limite && t.fecha_limite < hoy
                        const preguntando = cargando1 === t.id || aCartera?.t.id === t.id
                        return (
                          <div key={t.id} className={`px-4 py-3 ${vencida ? 'bg-brand/5' : ''}`}>
                            <div className="flex justify-between items-start gap-3">
                              <div className="min-w-0">
                                <p className="font-bold text-gray-800">{t.vendedores?.nombre || t.referencia || 'Venta'}</p>
                                <p className="text-xs text-gray-500">{[t.referencia && `ref ${t.referencia}`, t.banco].filter(Boolean).join(' · ') || 'Sin referencia'}</p>
                                {t.destino && <p className="text-xs text-gray-400">→ {t.destino}{t.cuenta_maissy === false ? ' · no coincidía con cuentas Maissy' : ''}</p>}
                                <p className={`text-xs font-bold ${cargada ? 'text-gray-600' : vencida ? 'text-brand' : 'text-amber-600'}`}>
                                  {cargada ? `Cargada al vendedor${t.cargada_por ? ` por ${t.cargada_por}` : ''} · se descuenta en la próxima nómina`
                                    : vencida ? `Venció el ${fechaLinda(t.fecha_limite)} · sigue pendiente` : `Fecha límite: ${fechaLinda(t.fecha_limite)}`}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="font-black text-gray-800">{fmt(t.valor)}</p>
                                {esAdmin && !preguntando && (
                                  <div className="mt-1 flex flex-wrap justify-end gap-1.5">
                                    {vencida && t.vendedor_id && <button onClick={() => setCargando1(t.id)} className="bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold px-3 py-1.5 rounded-lg">Cargar al vendedor</button>}
                                    {cargada && <button onClick={() => cambiarCargo(t, false)} disabled={guardando} className="bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50">Quitar cargo</button>}
                                  </div>
                                )}
                              </div>
                            </div>
                            {esAdmin && !preguntando && (
                              <div className="mt-2 flex gap-2 items-center">
                                <select value={cuentaPara(t)} onChange={e => setCuentaDe(m => ({ ...m, [t.id]: e.target.value }))} aria-label={`Cuenta a la que llegó la transferencia de ${t.vendedores?.nombre || 'el vendedor'}`}
                                  className="flex-1 min-w-0 border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
                                  <option value="">¿A qué cuenta llegó?</option>
                                  {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                </select>
                                <button onClick={() => marcarLlego(t)} disabled={!!marcando[t.id]} className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50">{marcando[t.id] ? '...' : 'Llegó'}</button>
                                <button onClick={() => abrirCartera(t)} disabled={!!marcando[t.id]} className="shrink-0 bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-bold px-3 py-2 rounded-lg disabled:opacity-50">No llegó</button>
                              </div>
                            )}
                            {aCartera?.t.id === t.id && (
                              <div className="mt-3 rounded-lg bg-gray-50 p-3 flex flex-col gap-2">
                                <p className="text-sm text-gray-700">Pasa a Cartera como crédito pendiente por {fmt(t.valor)}.</p>
                                <BuscarCliente clientes={clientes} value={aCartera.clienteId} onChange={id => setACartera(a => ({ ...a, clienteId: id || '' }))}
                                  libre={aCartera.nombre} onLibre={t => setACartera(a => ({ ...a, nombre: t, clienteId: '' }))} placeholder="Buscar cliente o escribir el nombre"
                                  className="border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
                                {!aCartera.clienteId && aCartera.nombre?.trim() && <p className="text-xs text-gray-500">Cliente sin registrar: queda en Cartera con este nombre.</p>}
                                <label className="flex items-center gap-2 text-sm text-gray-700">Fecha de pago
                                  <input type="date" value={aCartera.fechaPago} onChange={e => setACartera(a => ({ ...a, fechaPago: e.target.value }))}
                                    className="flex-1 border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
                                </label>
                                <div className="flex gap-2">
                                  <button onClick={() => setACartera(null)} className="flex-1 bg-white border border-gray-200 text-gray-600 text-sm font-bold px-4 py-2 rounded-lg">Cancelar</button>
                                  <button onClick={pasarACartera} disabled={!!marcando[t.id]} className="flex-1 bg-gray-900 text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50">{marcando[t.id] ? '...' : 'Pasar a Cartera'}</button>
                                </div>
                              </div>
                            )}
                            {cargando1 === t.id && (
                              <div className="mt-3 rounded-lg bg-gray-50 p-3 flex flex-col md:flex-row md:items-center gap-2">
                                <p className="flex-1 text-sm text-gray-700">¿Cargarle {fmt(t.valor)} a {t.vendedores?.nombre || 'el vendedor'}? Se le descuenta en la próxima nómina. Si después llega, se marca Llegó y se le quita.</p>
                                <div className="flex gap-2">
                                  <button onClick={() => setCargando1(null)} className="flex-1 bg-white border border-gray-200 text-gray-600 text-sm font-bold px-4 py-2 rounded-lg">Cancelar</button>
                                  <button onClick={() => cambiarCargo(t, true)} disabled={guardando} className="flex-1 bg-brand text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50">{guardando ? '...' : 'Cargar'}</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </section>
            )
          })}
        </>
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
                  <p className={`text-xs font-bold ${t.estado === 'recibida' ? 'text-emerald-600' : t.estado === 'a_cartera' ? 'text-gray-600' : 'text-brand'}`}>
                    {t.estado === 'recibida' ? `Llegó · confirmó ${t.verificada_por || ''}` : t.estado === 'a_cartera' ? `No llegó · pasó a Cartera · ${t.verificada_por || ''}` : 'No llegó · descontada en nómina'}
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
