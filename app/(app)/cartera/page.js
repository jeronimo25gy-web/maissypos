'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { puedeVerModulo } from '@/lib/permisos'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { PageHeader } from '@/components/ui'
import TransferenciasPorVerificar from '@/components/TransferenciasPorVerificar'
import InputDinero from '@/components/InputDinero'

const diasVencido = (fecha_pago) => {
  if (!fecha_pago) return 0
  const hoy = new Date(obtenerFechaActual())
  const pago = new Date(fecha_pago)
  return Math.floor((hoy - pago) / (24 * 60 * 60 * 1000))
}

// Agrupa por cliente (no por vendedor) -- si un cliente tiene varias
// facturas fiadas, se ven juntas con su total, pero cada factura sigue
// pudiendose pagar por separado (no obliga a pagar todo junto).
const agruparPorCliente = (lista) => {
  const grupos = {}
  lista.forEach(f => {
    const key = (f.nombre_cliente || 'Sin nombre').trim() || 'Sin nombre'
    if (!grupos[key]) grupos[key] = { nombre: f.nombre_cliente || 'Sin nombre', items: [] }
    grupos[key].items.push(f)
  })
  return Object.entries(grupos)
    .map(([key, g]) => ({
      key,
      nombre: g.nombre,
      items: g.items,
      total: g.items.reduce((s, f) => s + (f.saldo || 0), 0),
      maxVencido: Math.max(0, ...g.items.map(f => diasVencido(f.fecha_pago))),
    }))
    .sort((a, b) => b.maxVencido - a.maxVencido || b.total - a.total)
}

// De donde salio cada credito: la ruta que lo dio (y la cobra), o la caja /
// mostrador (ventas del modulo Ventas, sin ruta).
const CAJA = '__caja'
const SIN_RUTA = '__sin_ruta'
const origenDe = (f) => {
  if (f.ruta_id) return { key: f.ruta_id, nombre: f.rutas?.nombre || 'Ruta' }
  if (f.venta_id) return { key: CAJA, nombre: 'Caja / mostrador' }
  return { key: SIN_RUTA, nombre: 'Sin ruta' }
}
const etiquetaOrigen = (f) => {
  if (f.venta_id && !f.ruta_id) return 'Caja / mostrador'
  const partes = [f.rutas?.nombre, f.vendedores?.nombre].filter(Boolean)
  return partes.length > 0 ? partes.join(' · ') : 'Sin ruta'
}
const resumenPorOrigen = (lista) => {
  const m = {}
  lista.forEach(f => {
    const o = origenDe(f)
    if (!m[o.key]) m[o.key] = { ...o, total: 0, count: 0 }
    m[o.key].total += f.saldo || 0
    m[o.key].count += 1
  })
  const orden = (o) => (o.key === CAJA ? 1 : o.key === SIN_RUTA ? 2 : 0)
  return Object.values(m).sort((a, b) => orden(a) - orden(b) || a.nombre.localeCompare(b.nombre))
}

export default function Cartera() {
  const [usuario, setUsuario] = useState(null)
  const [vista, setVista] = useState('pendientes')
  const [fiados, setFiados] = useState([])
  const [historial, setHistorial] = useState([])
  const [cargando, setCargando] = useState(true)
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  const [marcandoId, setMarcandoId] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [origenFiltro, setOrigenFiltro] = useState('')
  const [deudaForm, setDeudaForm] = useState(null)
  const [guardandoDeuda, setGuardandoDeuda] = useState(false)
  const [clientes, setClientes] = useState([])
  const [rutas, setRutas] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [cuentas, setCuentas] = useState([])
  // Abono en curso: { key: id del credito o del grupo, items, total }
  const [abonando, setAbonando] = useState(null)
  const [valorAbono, setValorAbono] = useState('')
  const [cuentaAbono, setCuentaAbono] = useState('')
  const [notaAbono, setNotaAbono] = useState('')
  const [verAbonos, setVerAbonos] = useState(null)
  const [abonosPorFiado, setAbonosPorFiado] = useState({})
  const [transfPendientes, setTransfPendientes] = useState(0)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (!puedeVerModulo(parsed, 'cartera', ['admin', 'auxiliar'])) { router.push('/despacho'); return }
    setUsuario(parsed)
    cargarFiados()
    supabase.from('transferencias_ruta').select('id', { count: 'exact', head: true })
      .eq('empresa_id', getEmpresaId()).eq('estado', 'por_verificar').then(({ count }) => setTransfPendientes(count || 0))
  }, [])

  const abrirDeudaAnterior = async () => {
    const empresaId = getEmpresaId()
    const [{ data: c }, { data: r }, { data: v }] = await Promise.all([
      supabase.from('clientes').select('id, nombre, ruta_id, vendedor_id').eq('estado', true).eq('empresa_id', empresaId).order('nombre'),
      supabase.from('rutas').select('id, nombre').eq('estado', true).eq('empresa_id', empresaId).order('nombre'),
      supabase.from('vendedores').select('id, nombre').eq('estado', true).eq('empresa_id', empresaId).order('nombre'),
    ])
    setClientes(c || [])
    setRutas(r || [])
    setVendedores(v || [])
    setDeudaForm({ cliente_id: '', nombre_cliente: '', valor: '', fecha_fiado: obtenerFechaActual(), fecha_pago: '', ruta_id: '', vendedor_id: '' })
  }

  const elegirClienteDeuda = (id) => {
    const c = clientes.find(x => x.id === id)
    setDeudaForm({
      ...deudaForm,
      cliente_id: id,
      nombre_cliente: c?.nombre || deudaForm.nombre_cliente,
      ruta_id: c?.ruta_id || deudaForm.ruta_id,
      vendedor_id: c?.vendedor_id || deudaForm.vendedor_id,
    })
  }

  // Deuda que ya existia antes de usar el sistema (migracion desde Excel):
  // va directo a cartera, sin venta, sin ingreso y sin mover inventario.
  const guardarDeudaAnterior = async (seguirCargando) => {
    const valor = parseFloat(deudaForm.valor || 0)
    if (!deudaForm.nombre_cliente.trim() || valor <= 0 || !deudaForm.fecha_fiado) {
      alert('Cliente, valor y fecha del crédito son obligatorios'); return
    }
    setGuardandoDeuda(true)
    const { error } = await supabase.from('cartera_fiados').insert({
      empresa_id: getEmpresaId(),
      cliente_id: deudaForm.cliente_id || null,
      nombre_cliente: deudaForm.nombre_cliente.trim(),
      valor_original: valor,
      saldo: valor,
      fecha_fiado: deudaForm.fecha_fiado,
      fecha_pago: deudaForm.fecha_pago || null,
      ruta_id: deudaForm.ruta_id || null,
      vendedor_id: deudaForm.vendedor_id || null,
      estado: 'pendiente',
      es_saldo_inicial: true,
    })
    setGuardandoDeuda(false)
    if (error) { alert('Error: ' + error.message); return }
    await cargarFiados()
    if (seguirCargando) {
      setDeudaForm({ ...deudaForm, cliente_id: '', nombre_cliente: '', valor: '', fecha_pago: '' })
    } else {
      setDeudaForm(null)
    }
  }

  const cargarFiados = async () => {
    setCargando(true)
    const { data } = await supabase
      .from('cartera_fiados')
      .select('*, vendedores(nombre), rutas(nombre)')
      .eq('estado', 'pendiente')
      .eq('empresa_id', getEmpresaId())
      .order('fecha_pago')
    if (data) setFiados(data)
    setCargando(false)
  }

  const cargarHistorial = async () => {
    setCargandoHistorial(true)
    const { data } = await supabase
      .from('cartera_fiados')
      .select('*, vendedores(nombre), rutas(nombre)')
      .eq('estado', 'pagado')
      .eq('empresa_id', getEmpresaId())
      .order('fecha_pagado', { ascending: false })
    if (data) setHistorial(data)
    setCargandoHistorial(false)
  }

  const irAHistorial = () => {
    setVista('historial')
    cargarHistorial()
  }

  const abrirAbono = async (key, items, total) => {
    setAbonando({ key, items, total })
    setValorAbono(items.length > 1 ? String(total) : '')
    setNotaAbono('')
    if (cuentas.length === 0) {
      const { data } = await supabase.from('cuentas').select('id, nombre, tipo').eq('empresa_id', getEmpresaId()).order('nombre')
      setCuentas(data || [])
      const efectivo = (data || []).find(c => c.tipo === 'efectivo')
      if (efectivo && !cuentaAbono) setCuentaAbono(efectivo.id)
    }
  }

  // Abono a un credito (parcial o todo el saldo). Con varias facturas del
  // mismo cliente ("Pagar todo") se salda cada una completa. La funcion de la
  // base guarda el abono en el historial, baja el saldo y entra la plata a la
  // cuenta, todo junto.
  const registrarAbono = async () => {
    const { key, items, total } = abonando
    const valor = parseFloat(valorAbono) || 0
    if (valor <= 0) { alert('Escribe cuanto abona'); return }
    if (valor > total) { alert(`El abono no puede ser mayor que lo que debe ($${total.toLocaleString('es-CO')})`); return }
    if (!cuentaAbono) { alert('Selecciona a que cuenta entra la plata'); return }
    if (items.length > 1 && valor !== total) { alert('Para varias facturas juntas se paga el total. Para abonar una parte, hazlo factura por factura.'); return }
    setMarcandoId(key)
    const errores = []
    for (const f of items) {
      const { error } = await supabase.rpc('abonar_cartera', {
        p_cartera_id: f.id,
        p_valor: items.length > 1 ? f.saldo : valor,
        p_cuenta_id: cuentaAbono,
        p_fecha: obtenerFechaActual(),
        p_nota: notaAbono,
        p_usuario: usuario?.nombre || null,
      })
      if (error) errores.push(error.message)
    }
    setMarcandoId(null)
    if (errores.length > 0) alert('Error: ' + errores.join('\n'))
    setAbonando(null)
    setAbonosPorFiado({})
    await cargarFiados()
  }

  // Historial de un credito: abonos registrados en Cartera + lo que cobraron
  // los vendedores en ruta (liquidacion/kiosco).
  const toggleAbonos = async (f) => {
    if (verAbonos === f.id) { setVerAbonos(null); return }
    setVerAbonos(f.id)
    if (abonosPorFiado[f.id]) return
    const [{ data: directos }, { data: enRuta }] = await Promise.all([
      supabase.from('abonos_cartera').select('fecha, valor, nota, registrado_por, created_at, cuentas(nombre)').eq('cartera_fiado_id', f.id).eq('empresa_id', getEmpresaId()),
      supabase.from('liquidaciones_fiados').select('fecha, valor, created_at, vendedores(nombre)').eq('cartera_fiados_id', f.id).eq('tipo', 'pago_fiado').eq('empresa_id', getEmpresaId()),
    ])
    const lista = [
      ...(directos || []).map(a => ({ fecha: a.fecha, valor: a.valor, creado: a.created_at, detalle: [a.cuentas?.nombre, a.nota, a.registrado_por].filter(Boolean).join(' · ') })),
      ...(enRuta || []).map(a => ({ fecha: a.fecha, valor: a.valor, creado: a.created_at, detalle: `Cobrado en ruta${a.vendedores?.nombre ? ' · ' + a.vendedores.nombre : ''}` })),
    ].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.creado || '').localeCompare(a.creado || ''))
    setAbonosPorFiado(prev => ({ ...prev, [f.id]: lista }))
  }

  const panelAbono = (key) => abonando?.key === key && (
    <div className="p-4 bg-gray-50 border-t border-gray-100">
      <div className="flex gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <label className="text-xs font-bold text-gray-600 block mb-1">{abonando.items.length > 1 ? `Pago total de ${abonando.items.length} facturas` : 'Valor del abono'}</label>
          <InputDinero value={valorAbono} onChange={e => setValorAbono(e.target.value)} placeholder="0" disabled={abonando.items.length > 1}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 focus:border-brand focus:outline-none bg-white" />
        </div>
        {abonando.items.length === 1 && (
          <button type="button" onClick={() => setValorAbono(String(abonando.total))}
            className="self-end shrink-0 bg-white border border-gray-200 text-gray-700 text-xs font-bold px-3 py-2.5 rounded-lg">Todo</button>
        )}
      </div>
      <label className="text-xs font-bold text-gray-600 block mb-1">A que cuenta entra</label>
      <select value={cuentaAbono} onChange={e => setCuentaAbono(e.target.value)}
        className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none mb-2 bg-white">
        <option value="">Selecciona cuenta</option>
        {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
      <input type="text" value={notaAbono} onChange={e => setNotaAbono(e.target.value)} placeholder="Nota (opcional)"
        className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none mb-2" />
      {parseFloat(valorAbono) > 0 && parseFloat(valorAbono) <= abonando.total && (
        <p className="text-xs text-gray-500 mb-2">
          {parseFloat(valorAbono) >= abonando.total ? 'Queda pagado.' : `Queda debiendo $${(abonando.total - parseFloat(valorAbono)).toLocaleString('es-CO')}.`}
        </p>
      )}
      <div className="flex gap-2">
        <button onClick={() => setAbonando(null)} className="flex-1 bg-white border border-gray-200 text-gray-600 font-bold py-2 rounded-lg text-sm">Cancelar</button>
        <button onClick={registrarAbono} disabled={marcandoId === key}
          className="flex-1 bg-brand hover:bg-brand-dark text-white font-bold py-2 rounded-lg text-sm disabled:opacity-50">
          {marcandoId === key ? 'Guardando...' : 'Registrar abono'}
        </button>
      </div>
    </div>
  )

  const listaAbonos = (f) => verAbonos === f.id && (
    <div className="px-4 pb-3 pt-1">
      {!abonosPorFiado[f.id] ? (
        <p className="text-xs text-gray-400">Cargando...</p>
      ) : abonosPorFiado[f.id].length === 0 ? (
        <p className="text-xs text-gray-400">Todavía no tiene abonos.</p>
      ) : (
        <div className="bg-gray-50 rounded-lg divide-y divide-gray-100">
          {abonosPorFiado[f.id].map((a, i) => (
            <div key={i} className="flex justify-between items-center px-3 py-1.5 text-xs gap-3">
              <span className="text-gray-600 min-w-0">{a.fecha}{a.detalle ? ` · ${a.detalle}` : ''}</span>
              <span className="font-bold text-gray-900 shrink-0">${(a.valor || 0).toLocaleString('es-CO')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  if (!usuario) return null

  const busquedaLower = busqueda.toLowerCase()
  const pasaFiltro = (f) => (f.nombre_cliente || '').toLowerCase().includes(busquedaLower) && (!origenFiltro || origenDe(f).key === origenFiltro)
  const fiadosFiltrados = fiados.filter(pasaFiltro)
  const historialFiltrado = historial.filter(pasaFiltro)
  const origenes = resumenPorOrigen(fiados)
  const grupos = agruparPorCliente(fiadosFiltrados)
  const gruposHistorial = agruparPorCliente(historialFiltrado)

  const totalPendiente = fiados.reduce((sum, f) => sum + (f.saldo || 0), 0)
  const totalVencidos = fiados.filter(f => diasVencido(f.fecha_pago) > 0).length

  return (
    <div>
      <PageHeader title="Cartera" subtitle={`$${totalPendiente.toLocaleString('es-CO')} pendiente · ${totalVencidos} vencido${totalVencidos !== 1 ? 's' : ''}`} />

      <div className="p-4 max-w-3xl mx-auto">
        <div className="flex gap-2 mb-4">
          <button onClick={() => setVista('pendientes')}
            className={`flex-1 py-2 rounded-xl text-sm font-bold ${vista === 'pendientes' ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            Pendientes
          </button>
          <button onClick={() => setVista('transferencias')}
            className={`flex-1 py-2 rounded-xl text-sm font-bold ${vista === 'transferencias' ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            Transferencias
            {transfPendientes > 0 && <span className="ml-1 bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 align-middle">{transfPendientes}</span>}
          </button>
          <button onClick={irAHistorial}
            className={`flex-1 py-2 rounded-xl text-sm font-bold ${vista === 'historial' ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            Historial
          </button>
        </div>

        {vista === 'transferencias' && <TransferenciasPorVerificar usuario={usuario} onCambio={setTransfPendientes} />}

        {vista !== 'transferencias' && usuario.rol === 'admin' && !deudaForm && (
          <button onClick={abrirDeudaAnterior}
            className="w-full mb-4 bg-white border-2 border-dashed border-gray-300 hover:border-brand text-gray-600 hover:text-brand font-bold py-3 rounded-xl text-sm">
            + Cargar deuda anterior (migracion)
          </button>
        )}

        {deudaForm && (
          <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
            <p className="font-black text-gray-700 mb-1">Deuda anterior</p>
            <p className="text-xs text-gray-500 mb-3">Para deudas que ya existian antes de usar el sistema. No crea una venta ni mueve inventario ni caja.</p>
            <div className="mb-2">
              <label className="text-xs font-bold text-gray-600 block mb-1">Cliente registrado (opcional)</label>
              <select value={deudaForm.cliente_id} onChange={e => elegirClienteDeuda(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none bg-white">
                <option value="">No esta registrado</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div className="mb-2">
              <label className="text-xs font-bold text-gray-600 block mb-1">Nombre del cliente</label>
              <input type="text" value={deudaForm.nombre_cliente} onChange={e => setDeudaForm({ ...deudaForm, nombre_cliente: e.target.value })}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Valor que debe</label>
                <InputDinero value={deudaForm.valor} onChange={e => setDeudaForm({ ...deudaForm, valor: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 focus:border-brand focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Fecha del crédito</label>
                <input type="date" value={deudaForm.fecha_fiado} onChange={e => setDeudaForm({ ...deudaForm, fecha_fiado: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Fecha de pago acordada</label>
                <input type="date" value={deudaForm.fecha_pago} onChange={e => setDeudaForm({ ...deudaForm, fecha_pago: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Ruta (opcional)</label>
                <select value={deudaForm.ruta_id} onChange={e => setDeudaForm({ ...deudaForm, ruta_id: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none bg-white">
                  <option value="">Sin ruta</option>
                  {rutas.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Vendedor que cobra (opcional)</label>
                <select value={deudaForm.vendedor_id} onChange={e => setDeudaForm({ ...deudaForm, vendedor_id: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none bg-white">
                  <option value="">Sin vendedor</option>
                  {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-3">Si le pones vendedor, le aparece en su liquidacion/kiosco para registrar los abonos.</p>
            <div className="flex flex-col md:flex-row gap-2">
              <button onClick={() => setDeudaForm(null)} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-lg text-sm">Cerrar</button>
              <button onClick={() => guardarDeudaAnterior(true)} disabled={guardandoDeuda}
                className="flex-1 bg-gray-800 hover:bg-black text-white font-bold py-2 rounded-lg text-sm disabled:opacity-50">
                {guardandoDeuda ? 'Guardando...' : 'Guardar y cargar otra'}
              </button>
              <button onClick={() => guardarDeudaAnterior(false)} disabled={guardandoDeuda}
                className="flex-1 bg-brand hover:bg-brand-dark text-white font-bold py-2 rounded-lg text-sm disabled:opacity-50">
                Guardar
              </button>
            </div>
          </div>
        )}

        {vista !== 'transferencias' && <input type="text" placeholder="Buscar por nombre de cliente..." value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 mb-4 text-gray-800 focus:border-brand focus:outline-none" />}

        {vista !== 'transferencias' && origenes.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-black uppercase tracking-wide text-gray-500 mb-2">Lo que se debe por ruta</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <button onClick={() => setOrigenFiltro('')}
                className={`text-left rounded-xl px-3 py-2 border ${!origenFiltro ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-700'}`}>
                <p className="text-xs font-bold opacity-80">Todas</p>
                <p className="font-black">${totalPendiente.toLocaleString('es-CO')}</p>
                <p className="text-[11px] opacity-70">{fiados.length} crédito{fiados.length !== 1 ? 's' : ''}</p>
              </button>
              {origenes.map(o => (
                <button key={o.key} onClick={() => setOrigenFiltro(origenFiltro === o.key ? '' : o.key)}
                  className={`text-left rounded-xl px-3 py-2 border min-w-0 ${origenFiltro === o.key ? 'bg-brand border-brand text-white' : 'bg-white border-gray-200 text-gray-700'}`}>
                  <p className="text-xs font-bold opacity-80 truncate">{o.nombre}</p>
                  <p className="font-black">${o.total.toLocaleString('es-CO')}</p>
                  <p className="text-[11px] opacity-70">{o.count} crédito{o.count !== 1 ? 's' : ''}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {vista === 'transferencias' ? null : vista === 'pendientes' ? (
          cargando ? (
            <p className="text-gray-400 text-center py-10">Cargando...</p>
          ) : grupos.length === 0 ? (
            <p className="text-gray-400 text-center py-10">{fiados.length === 0 ? 'No hay créditos pendientes' : 'Sin resultados para la busqueda'}</p>
          ) : (
            grupos.map(grupo => (
              <div key={grupo.key} className="mb-6">
                <div className="flex items-center justify-between mb-2 gap-3">
                  <h2 className="font-black text-gray-700">
                    {grupo.nombre}
                    {grupo.items.length > 1 && <span className="text-xs font-bold text-gray-400 ml-2">{grupo.items.length} facturas</span>}
                    {grupo.maxVencido > 0 && <span className="text-xs font-bold text-brand ml-2">vencido</span>}
                  </h2>
                  <div className="flex items-center gap-2 shrink-0">
                    <p className="font-black text-gray-900">${grupo.total.toLocaleString('es-CO')}</p>
                    {grupo.items.length > 1 && (
                      <button onClick={() => abrirAbono(grupo.key, grupo.items, grupo.total)} disabled={marcandoId === grupo.key}
                        className="bg-gray-800 hover:bg-black text-white text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50">
                        Pagar todo
                      </button>
                    )}
                  </div>
                </div>
                {panelAbono(grupo.key)}
                <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
                  {grupo.items.map(f => {
                    const vencido = diasVencido(f.fecha_pago)
                    const abonado = (f.valor_original || 0) - (f.saldo || 0)
                    return (
                      <div key={f.id}>
                      <div className={`p-4 flex items-center justify-between ${vencido > 0 ? 'bg-brand/5' : ''}`}>
                        <div className="flex-1">
                          <p className="text-xs text-gray-500">
                            {etiquetaOrigen(f)}
                          </p>
                          <p className="text-xs text-gray-500">Crédito: {f.fecha_fiado} {f.fecha_pago ? `· Pago acordado: ${f.fecha_pago}` : ''}{f.es_saldo_inicial ? ' · Saldo anterior' : ''}</p>
                          {vencido > 0 && (
                            <p className="text-xs font-bold text-brand">{vencido} dia{vencido !== 1 ? 's' : ''} vencido</p>
                          )}
                          <button onClick={() => toggleAbonos(f)} className="text-xs font-bold text-secondary underline mt-0.5">
                            {abonado > 0 ? `Abonado $${abonado.toLocaleString('es-CO')} · ver abonos` : 'Ver abonos'}
                          </button>
                        </div>
                        <div className="flex gap-4 items-center">
                          <div className="text-center">
                            <p className="text-xs text-gray-400">Original</p>
                            <p className="font-bold text-gray-600">${(f.valor_original || 0).toLocaleString('es-CO')}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-400">Saldo</p>
                            <p className={`font-black ${vencido > 0 ? 'text-brand' : 'text-gray-800'}`}>${(f.saldo || 0).toLocaleString('es-CO')}</p>
                          </div>
                          <button onClick={() => abrirAbono(f.id, [f], f.saldo || 0)} disabled={marcandoId === f.id}
                            className="bg-brand hover:bg-brand-dark text-white text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-50">
                            Abonar
                          </button>
                        </div>
                      </div>
                      {panelAbono(f.id)}
                      {listaAbonos(f)}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )
        ) : (
          cargandoHistorial ? (
            <p className="text-gray-400 text-center py-10">Cargando...</p>
          ) : gruposHistorial.length === 0 ? (
            <p className="text-gray-400 text-center py-10">{historial.length === 0 ? 'No hay créditos pagados todavía' : 'Sin resultados para la busqueda'}</p>
          ) : (
            gruposHistorial.map(grupo => (
              <div key={grupo.key} className="mb-6">
                <div className="flex items-center justify-between mb-2 gap-3">
                  <h2 className="font-black text-gray-700">
                    {grupo.nombre}
                    {grupo.items.length > 1 && <span className="text-xs font-bold text-gray-400 ml-2">{grupo.items.length} facturas</span>}
                  </h2>
                </div>
                <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
                  {grupo.items.map(f => (
                    <div key={f.id}>
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-xs text-gray-500">
                          {etiquetaOrigen(f)}
                        </p>
                        <p className="text-xs text-gray-500">Crédito: {f.fecha_fiado}</p>
                        <p className="text-xs font-bold text-gray-900">
                          Pagado: {f.fecha_pagado ? new Date(f.fecha_pagado).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : '—'}
                        </p>
                        <button onClick={() => toggleAbonos(f)} className="text-xs font-bold text-secondary underline mt-0.5">Ver abonos</button>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-400">Original</p>
                        <p className="font-bold text-gray-600">${(f.valor_original || 0).toLocaleString('es-CO')}</p>
                      </div>
                    </div>
                    {listaAbonos(f)}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )
        )}
      </div>
    </div>
  )
}
