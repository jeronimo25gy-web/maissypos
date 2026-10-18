'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { puedeVerModulo } from '@/lib/permisos'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { detectorInterno } from '@/lib/inicio-datos'
import { invalidarPendientes } from '@/lib/pendientes'
import { PageHeader } from '@/components/ui'
import { COLORES } from '@/components/Graficas'
import TransferenciasPorVerificar from '@/components/TransferenciasPorVerificar'
import InputDinero from '@/components/InputDinero'

// Cartera con la linea de Mi ruta: resumen (por cobrar, vencido, esta
// semana, antiguedad), filtros por ruta y estado, una tarjeta por cliente con
// sus creditos, abonos, estado de cuenta y recordatorio por WhatsApp. Lo que
// debe la otra empresa del grupo va aparte: es real, pero no se cobra en ruta.
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', linea: '#E3E1D8', rojo: '#C41230', rojoF: '#FBE9E9', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8' }
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const pesos = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
const fechaCorta = (f) => f ? new Date(f.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : '—'
const soloDigitos = (t) => (t || '').replace(/\D/g, '')
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`
const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5)
const input = 'w-full rounded-xl px-3 min-h-[44px] text-[15px] bg-white border outline-none focus:border-[#1C1B19]'
const RANGOS = ['0–7 días', '8–15 días', '16–30 días', 'Más de 30']

// Estado del cliente segun su credito mas atrasado.
const estadoDe = (items, hoy) => {
  const dias = items.map(f => f.fecha_pago ? diasEntre(hoy, f.fecha_pago) : 999)
  const peor = Math.min(...dias)
  if (peor < 0) return { orden: 0, texto: `Vencido hace ${plural(-peor, 'día', 'días')}`, color: C.rojo, fondo: C.rojoF, peor }
  if (peor === 0) return { orden: 1, texto: 'Vence hoy', color: C.ambar, fondo: C.ambarF, peor }
  if (peor <= 7) return { orden: 2, texto: `Vence en ${plural(peor, 'día', 'días')}`, color: C.ambar, fondo: C.ambarF, peor }
  if (items.some(f => !f.fecha_pago)) return { orden: 3, texto: 'Sin fecha de pago', color: C.gris, fondo: C.fondo, peor }
  return { orden: 3, texto: 'Al día', color: C.verde, fondo: C.verdeF, peor }
}

const agruparPorCliente = (lista, hoy) => {
  const grupos = {}
  lista.forEach(f => {
    // Ligado a un cliente: se agrupa por el cliente aunque el nombre del credito
    // se haya escrito distinto; si no, por el nombre escrito.
    const key = f.cliente_id ? 'c:' + f.cliente_id : (f.nombre_cliente || 'Sin nombre').trim() || 'Sin nombre'
    if (!grupos[key]) grupos[key] = { nombre: f.clientes?.nombre || f.nombre_cliente || 'Sin nombre', cliente: f.clientes, items: [] }
    grupos[key].items.push(f)
  })
  return Object.entries(grupos).map(([key, g]) => {
    const items = g.items.sort((a, b) => (a.fecha_pago || '9').localeCompare(b.fecha_pago || '9'))
    return { key, ...g, items, total: items.reduce((s, f) => s + (f.saldo || 0), 0), estado: estadoDe(items, hoy), sinCliente: items.some(f => !f.cliente_id) }
  })
}

const origenDe = (f) => {
  if (f.ruta_id) return { key: f.ruta_id, nombre: f.rutas?.nombre || 'Ruta' }
  if (f.venta_id) return { key: '__caja', nombre: 'Mostrador' }
  return { key: '__sin_ruta', nombre: 'Sin ruta' }
}
const etiquetaOrigen = (f) => {
  if (f.venta_id && !f.ruta_id) return 'Mostrador'
  return [f.rutas?.nombre, f.vendedores?.nombre].filter(Boolean).join(' · ') || 'Sin ruta'
}

export default function Cartera() {
  const router = useRouter()
  const [usuario, setUsuario] = useState(null)
  const [empresa, setEmpresa] = useState(null)
  const [interna, setInterna] = useState(() => () => null)
  const [vista, setVista] = useState('pendientes')
  const [fiados, setFiados] = useState([])
  const [historial, setHistorial] = useState([])
  const [cargando, setCargando] = useState(true)
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  const [marcandoId, setMarcandoId] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [origenFiltro, setOrigenFiltro] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('')
  const [orden, setOrden] = useState('vencido')
  const [abierto, setAbierto] = useState(null)
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
  // Ligar creditos (los viejos solo tienen el nombre escrito) a su cliente.
  const [ligando, setLigando] = useState(null)
  const [buscaCliente, setBuscaCliente] = useState('')
  const [todosClientes, setTodosClientes] = useState([])
  const hoy = obtenerFechaActual()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (!puedeVerModulo(parsed, 'cartera', ['admin', 'auxiliar'])) { router.push('/despacho'); return }
    setUsuario(parsed)
    cargarFiados()
    supabase.from('empresas').select('id, nombre').then(({ data }) => {
      setEmpresa((data || []).find(e => e.id === getEmpresaId()) || null)
      const det = detectorInterno(data || [])
      setInterna(() => det)
    })
    supabase.from('transferencias_ruta').select('id', { count: 'exact', head: true })
      .eq('empresa_id', getEmpresaId()).eq('estado', 'por_verificar').then(({ count }) => setTransfPendientes(count || 0))
  }, [])

  const cargarFiados = async () => {
    setCargando(true)
    const { data } = await supabase
      .from('cartera_fiados')
      .select('*, vendedores(nombre), rutas(nombre), clientes(nombre, apto, edificio, barrio, telefono)')
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
      .select('*, vendedores(nombre), rutas(nombre), clientes(nombre, apto, edificio, barrio, telefono)')
      .eq('estado', 'pagado')
      .eq('empresa_id', getEmpresaId())
      .order('fecha_pagado', { ascending: false })
      .limit(300)
    if (data) setHistorial(data)
    setCargandoHistorial(false)
  }

  const irA = (v) => { setVista(v); if (v === 'historial' && historial.length === 0) cargarHistorial() }

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
    invalidarPendientes()
    await cargarFiados()
    if (seguirCargando) setDeudaForm({ ...deudaForm, cliente_id: '', nombre_cliente: '', valor: '', fecha_pago: '' })
    else setDeudaForm(null)
  }

  const abrirAbono = async (key, items, total) => {
    setLigando(null)
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
    if (valor <= 0) { alert('Escribe cuánto abona'); return }
    if (valor > total) { alert(`El abono no puede ser mayor que lo que debe (${pesos(total)})`); return }
    if (!cuentaAbono) { alert('Selecciona a qué cuenta entra la plata'); return }
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
    invalidarPendientes()
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

  const abrirLigar = async (grupo) => {
    setAbonando(null)
    setLigando({ key: grupo.key, items: grupo.items })
    setBuscaCliente(grupo.nombre.split(' ')[0] || '')
    if (todosClientes.length === 0) {
      const { data } = await supabase.from('clientes').select('id, nombre, apto, edificio, direccion, barrio, ruta_id, rutas(nombre)')
        .eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
      setTodosClientes(data || [])
    }
  }

  const ligarA = async (clienteId) => {
    const ids = ligando.items.filter(f => !f.cliente_id).map(f => f.id)
    const { error } = await supabase.from('cartera_fiados').update({ cliente_id: clienteId }).in('id', ids).eq('empresa_id', getEmpresaId())
    if (error) { alert('No se pudo ligar: ' + error.message); return }
    setLigando(null)
    cargarFiados()
  }

  // El cliente no existe todavia (rutas sin rutero cargado): se crea con el
  // nombre del credito en su ruta; el dia de visita se le pone en Rutas.
  const crearYLigar = async () => {
    const f = ligando.items[0]
    const nombre = buscaCliente.trim() || f.nombre_cliente
    const { data: c, error } = await supabase.from('clientes').insert({
      empresa_id: getEmpresaId(), nombre, ruta_id: f.ruta_id || null, vendedor_id: f.vendedor_id || null, estado: true,
    }).select('id').single()
    if (error) { alert('No se pudo crear el cliente: ' + error.message); return }
    setTodosClientes([])
    await ligarA(c.id)
  }

  // Estado de cuenta para mandar por WhatsApp (o copiar si no hay telefono).
  const textoEstadoCuenta = (g) => {
    const nombreEmp = (empresa?.nombre || 'Maissy').replace(/ SAS$/i, '')
    const lineas = g.items.map(f => {
      const dias = f.fecha_pago ? diasEntre(hoy, f.fecha_pago) : null
      const cuando = dias == null ? '' : dias < 0 ? ` · venció el ${fechaCorta(f.fecha_pago)}` : dias === 0 ? ' · vence hoy' : ` · vence el ${fechaCorta(f.fecha_pago)}`
      return `• Crédito del ${fechaCorta(f.fecha_fiado)}: ${pesos(f.saldo)}${(f.valor_original || 0) > (f.saldo || 0) ? ` (de ${pesos(f.valor_original)})` : ''}${cuando}`
    })
    return [`Hola ${g.nombre}, le saludamos de ${nombreEmp}.`, '', 'Este es su estado de cuenta a hoy:', ...lineas, '', `*Total pendiente: ${pesos(g.total)}*`, '', 'Si ya realizó el pago, por favor ignore este mensaje. ¡Gracias por preferir Maissy!'].join('\n')
  }
  const enviarEstado = async (g) => {
    const texto = textoEstadoCuenta(g)
    const tel = soloDigitos(g.cliente?.telefono).slice(-10)
    if (tel.length === 10) { window.open(`https://wa.me/57${tel}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener'); return }
    try { await navigator.clipboard.writeText(texto); alert('El cliente no tiene teléfono. Copié el estado de cuenta para que lo pegues donde quieras.') }
    catch { window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener') }
  }

  if (!usuario) return null

  // ---- calculos ----
  const q = busqueda.trim().toLowerCase()
  const esInterna = (f) => !!interna({ cliente_nombre: f.clientes?.nombre || f.nombre_cliente, empresa_id: f.empresa_id })
  const deClientes = fiados.filter(f => !esInterna(f))
  const deGrupo = fiados.filter(esInterna)
  const total = deClientes.reduce((s, f) => s + (f.saldo || 0), 0)
  const vencidos = deClientes.filter(f => f.fecha_pago && f.fecha_pago < hoy)
  const semana = deClientes.filter(f => f.fecha_pago && f.fecha_pago >= hoy && diasEntre(hoy, f.fecha_pago) <= 7)
  const sinCliente = deClientes.filter(f => !f.cliente_id)
  const antig = [0, 0, 0, 0]
  deClientes.forEach(f => { const e = diasEntre(f.fecha_fiado || hoy, hoy); antig[e <= 7 ? 0 : e <= 15 ? 1 : e <= 30 ? 2 : 3] += f.saldo || 0 })
  const origenes = Object.values(deClientes.reduce((m, f) => {
    const o = origenDe(f); const x = (m[o.key] = m[o.key] || { ...o, total: 0, n: 0 })
    x.total += f.saldo || 0; x.n++; return m
  }, {})).sort((a, b) => b.total - a.total)

  const pasa = (f) => (!q || [f.nombre_cliente, f.clientes?.nombre, f.clientes?.apto, f.clientes?.edificio, f.clientes?.barrio].some(t => (t || '').toLowerCase().includes(q)))
    && (!origenFiltro || origenDe(f).key === origenFiltro)
  const base = vista === 'historial' ? historial : deClientes
  let grupos = agruparPorCliente(base.filter(pasa), hoy)
  if (vista === 'pendientes') {
    if (estadoFiltro === 'vencidos') grupos = grupos.filter(g => g.estado.peor < 0)
    if (estadoFiltro === 'semana') grupos = grupos.filter(g => g.estado.peor >= 0 && g.estado.peor <= 7)
    if (estadoFiltro === 'sinCliente') grupos = grupos.filter(g => g.sinCliente)
    grupos.sort(orden === 'deuda' ? (a, b) => b.total - a.total : orden === 'nombre' ? (a, b) => a.nombre.localeCompare(b.nombre) : (a, b) => a.estado.peor - b.estado.peor || b.total - a.total)
  } else grupos.sort((a, b) => (b.items[0]?.fecha_pagado || '').localeCompare(a.items[0]?.fecha_pagado || ''))
  const gruposGrupo = agruparPorCliente(deGrupo, hoy)

  // ---- piezas ----
  const chip = (activo, onClick, contenido, key) => (
    <button key={key} onClick={onClick} aria-pressed={activo} className="shrink-0 px-3 min-h-[36px] rounded-full text-[13px] font-bold whitespace-nowrap"
      style={activo ? { background: C.tinta, color: '#fff' } : { background: '#fff', color: C.gris }}>{contenido}</button>
  )
  const kpi = (et, va, sub, color) => (
    <div className="bg-white rounded-[18px] p-3.5 flex flex-col gap-0.5 min-w-0">
      <span className="text-[12.5px] font-bold" style={{ color: C.gris }}>{et}</span>
      <span className="font-extrabold text-[24px] tabular-nums leading-tight" style={{ ...titulo, color: color || C.tinta }}>{va}</span>
      {sub && <span className="text-[12.5px]" style={{ color: C.gris }}>{sub}</span>}
    </div>
  )

  const panelAbono = (key) => abonando?.key === key && (
    <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: C.fondo }}>
      <div className="flex gap-2 items-end">
        <label className="flex-1 min-w-0 text-[12.5px] font-bold" style={{ color: C.gris }}>
          {abonando.items.length > 1 ? `Pago total de ${plural(abonando.items.length, 'crédito', 'créditos')}` : 'Valor del abono'}
          <InputDinero value={valorAbono} onChange={e => setValorAbono(e.target.value)} placeholder="0" disabled={abonando.items.length > 1}
            className={input + ' font-bold mt-1'} style={{ borderColor: C.linea, color: C.tinta }} />
        </label>
        {abonando.items.length === 1 && (
          <button type="button" onClick={() => setValorAbono(String(abonando.total))} className="shrink-0 bg-white px-4 min-h-[44px] rounded-xl text-sm font-bold">Todo</button>
        )}
      </div>
      <label className="text-[12.5px] font-bold" style={{ color: C.gris }}>A qué cuenta entra
        <select value={cuentaAbono} onChange={e => setCuentaAbono(e.target.value)} className={input + ' mt-1'} style={{ borderColor: C.linea, color: C.tinta }}>
          <option value="">Selecciona cuenta</option>
          {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </label>
      <input type="text" value={notaAbono} onChange={e => setNotaAbono(e.target.value)} placeholder="Nota (opcional)" className={input} style={{ borderColor: C.linea, color: C.tinta }} />
      {parseFloat(valorAbono) > 0 && parseFloat(valorAbono) <= abonando.total && (
        <p className="text-[13px]" style={{ color: C.gris }}>{parseFloat(valorAbono) >= abonando.total ? 'Queda pagado.' : `Queda debiendo ${pesos(abonando.total - parseFloat(valorAbono))}.`}</p>
      )}
      <div className="flex gap-2">
        <button onClick={() => setAbonando(null)} className="flex-1 bg-white min-h-[44px] rounded-xl text-sm font-bold">Cancelar</button>
        <button onClick={registrarAbono} disabled={marcandoId === key} className="flex-1 min-h-[44px] rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: C.rojo }}>
          {marcandoId === key ? 'Guardando…' : 'Registrar abono'}
        </button>
      </div>
    </div>
  )

  const panelLigar = (grupo) => {
    if (ligando?.key !== grupo.key) return null
    const qq = buscaCliente.trim().toLowerCase()
    const rutaCredito = grupo.items[0]?.ruta_id
    const opciones = todosClientes
      .filter(c => !qq || [c.nombre, c.apto, c.edificio, c.direccion, c.barrio].some(t => (t || '').toLowerCase().includes(qq)))
      .sort((a, b) => (b.ruta_id === rutaCredito) - (a.ruta_id === rutaCredito))
      .slice(0, 12)
    return (
      <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: C.ambarF }}>
        <p className="text-sm font-extrabold">¿Quién es «{grupo.nombre}»?</p>
        <p className="text-[12.5px]" style={{ color: C.gris }}>Busca por nombre, apto, edificio o barrio. Primero salen los de su misma ruta.</p>
        <input autoFocus value={buscaCliente} onChange={e => setBuscaCliente(e.target.value)} placeholder="Buscar cliente…" className={input} style={{ borderColor: C.linea }} />
        <div className="bg-white rounded-xl divide-y" style={{ borderColor: C.linea }}>
          {opciones.length === 0 && <p className="text-[13px] p-3" style={{ color: C.gris }}>Ningún cliente coincide.</p>}
          {opciones.map(c => (
            <button key={c.id} onClick={() => ligarA(c.id)} className="w-full text-left px-3 py-2 flex justify-between gap-3 hover:bg-[#F3F1EA]">
              <span className="min-w-0">
                <span className="text-sm font-bold">{c.nombre}</span>
                <span className="block text-xs truncate" style={{ color: C.gris }}>{[c.edificio, c.apto, c.direccion, c.barrio].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="text-xs shrink-0" style={{ color: c.ruta_id === rutaCredito ? C.tinta : C.gris, fontWeight: c.ruta_id === rutaCredito ? 700 : 400 }}>{c.rutas?.nombre || 'Sin ruta'}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setLigando(null)} className="flex-1 bg-white min-h-[44px] rounded-xl text-sm font-bold">Cancelar</button>
          <button onClick={crearYLigar} className="flex-[2] min-h-[44px] rounded-xl text-sm font-bold text-white px-3" style={{ background: C.tinta }}>Crear «{buscaCliente.trim() || grupo.nombre}» y ligar</button>
        </div>
      </div>
    )
  }

  const listaAbonos = (f) => verAbonos === f.id && (
    <div className="mt-2 rounded-xl px-3 py-1" style={{ background: C.fondo }}>
      {!abonosPorFiado[f.id] ? <p className="text-xs py-1.5" style={{ color: C.gris }}>Cargando…</p>
        : abonosPorFiado[f.id].length === 0 ? <p className="text-xs py-1.5" style={{ color: C.gris }}>Todavía no tiene abonos.</p>
          : abonosPorFiado[f.id].map((a, i) => (
            <div key={i} className="flex justify-between gap-3 py-1.5 text-xs">
              <span className="min-w-0" style={{ color: C.gris }}>{fechaCorta(a.fecha)}{a.detalle ? ` · ${a.detalle}` : ''}</span>
              <b className="shrink-0 tabular-nums">{pesos(a.valor)}</b>
            </div>
          ))}
    </div>
  )

  const filaCredito = (f, pagado) => {
    const dias = f.fecha_pago ? diasEntre(hoy, f.fecha_pago) : null
    const abonado = (f.valor_original || 0) - (f.saldo || 0)
    return (
      <div key={f.id} className="py-2.5 flex flex-col gap-1.5" style={{ borderTop: `1px solid ${C.linea}` }}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0 text-[13px] leading-snug">
            <span className="font-bold">Crédito del {fechaCorta(f.fecha_fiado)}</span>
            {pagado
              ? <span style={{ color: C.verde }}> · pagado {f.fecha_pagado ? fechaCorta(f.fecha_pagado) : ''}</span>
              : dias != null && <span style={{ color: dias < 0 ? C.rojo : dias <= 7 ? C.ambar : C.gris, fontWeight: dias <= 0 ? 700 : 400 }}> · {dias < 0 ? `venció el ${fechaCorta(f.fecha_pago)}` : dias === 0 ? 'vence hoy' : `vence el ${fechaCorta(f.fecha_pago)}`}</span>}
            <span className="block" style={{ color: C.gris }}>
              {etiquetaOrigen(f)}{f.es_saldo_inicial ? ' · saldo anterior' : ''}
              {' · '}<button onClick={() => toggleAbonos(f)} className="underline font-bold" style={{ color: C.tinta }}>{abonado > 0 && !pagado ? `abonado ${pesos(abonado)}` : 'ver abonos'}</button>
            </span>
          </div>
          <div className="text-right shrink-0 tabular-nums">
            <b className="block" style={{ color: !pagado && dias != null && dias < 0 ? C.rojo : C.tinta }}>{pesos(pagado ? f.valor_original : f.saldo)}</b>
            {!pagado && abonado > 0 && <span className="text-xs" style={{ color: C.gris }}>de {pesos(f.valor_original)}</span>}
          </div>
          {!pagado && (
            <button onClick={() => abrirAbono(f.id, [f], f.saldo || 0)} disabled={marcandoId === f.id} className="shrink-0 px-3 min-h-[36px] rounded-lg text-[13px] font-bold disabled:opacity-50" style={{ background: C.fondo }}>Abonar</button>
          )}
        </div>
        {panelAbono(f.id)}
        {listaAbonos(f)}
      </div>
    )
  }

  const tarjetaCliente = (g, pagado) => {
    const abiertoEste = abierto === g.key || g.items.length === 1 || !!q
    const lugar = [g.cliente?.edificio, g.cliente?.apto, g.cliente?.barrio].filter(Boolean).join(' · ')
    return (
      <article key={g.key} className="bg-white rounded-[18px] p-3.5 flex flex-col gap-2 min-w-0">
        <button onClick={() => setAbierto(abierto === g.key ? null : g.key)} className="flex items-start gap-3 text-left w-full">
          <div className="flex-1 min-w-0">
            <h3 className="font-extrabold text-[17px] leading-tight" style={titulo}>{g.nombre}</h3>
            <p className="text-[12.5px] truncate" style={{ color: C.gris }}>
              {[lugar, etiquetaOrigen(g.items[0]), g.items.length > 1 ? plural(g.items.length, 'crédito', 'créditos') : null].filter(Boolean).join(' · ')}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {!pagado && <span className="text-[12px] font-bold px-2 py-0.5 rounded-full" style={{ background: g.estado.fondo, color: g.estado.color }}>{g.estado.texto}</span>}
              {g.sinCliente && <span className="text-[12px] font-bold px-2 py-0.5 rounded-full" style={{ background: C.ambarF, color: C.ambar }}>Sin cliente ligado</span>}
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="block font-extrabold text-[20px] tabular-nums" style={{ ...titulo, color: !pagado && g.estado.peor < 0 ? C.rojo : C.tinta }}>
              {pesos(pagado ? g.items.reduce((s, f) => s + (f.valor_original || 0), 0) : g.total)}
            </span>
            {g.items.length > 1 && <span className="text-[12px] font-bold" style={{ color: C.gris }}>{abiertoEste ? 'Ocultar' : 'Ver créditos'}</span>}
          </div>
        </button>

        {!pagado && (
          <div className="flex flex-wrap gap-2">
            {g.items.length > 1 && <button onClick={() => abrirAbono(g.key, g.items, g.total)} disabled={marcandoId === g.key} className="px-3 min-h-[38px] rounded-lg text-[13px] font-bold text-white disabled:opacity-50" style={{ background: C.rojo }}>Pagar todo</button>}
            {g.items.length === 1 && <button onClick={() => abrirAbono(g.items[0].id, g.items, g.total)} disabled={marcandoId === g.items[0].id} className="px-3 min-h-[38px] rounded-lg text-[13px] font-bold text-white disabled:opacity-50" style={{ background: C.rojo }}>Abonar</button>}
            <button onClick={() => enviarEstado(g)} className="px-3 min-h-[38px] rounded-lg text-[13px] font-bold" style={{ background: C.fondo }}>
              {soloDigitos(g.cliente?.telefono).length >= 10 ? 'Estado de cuenta por WhatsApp' : 'Copiar estado de cuenta'}
            </button>
            {g.sinCliente && <button onClick={() => abrirLigar(g)} className="px-3 min-h-[38px] rounded-lg text-[13px] font-bold" style={{ background: C.ambarF, color: C.ambar }}>Ligar a cliente</button>}
          </div>
        )}
        {panelLigar(g)}
        {g.items.length > 1 && panelAbono(g.key)}
        {abiertoEste && <div>{g.items.map(f => g.items.length === 1 && !pagado ? (
          <div key={f.id} className="flex flex-col gap-2">
            <p className="text-[12.5px]" style={{ color: C.gris }}>
              Crédito del {fechaCorta(f.fecha_fiado)}{f.fecha_pago ? ` · ${f.fecha_pago < hoy ? 'venció' : 'vence'} el ${fechaCorta(f.fecha_pago)}` : ''}{(f.valor_original || 0) > (f.saldo || 0) ? ` · abonado ${pesos(f.valor_original - f.saldo)} de ${pesos(f.valor_original)}` : ''}{f.es_saldo_inicial ? ' · saldo anterior' : ''}
              {' · '}<button onClick={() => toggleAbonos(f)} className="underline font-bold" style={{ color: C.tinta }}>{verAbonos === f.id ? 'ocultar abonos' : 'ver abonos'}</button>
            </p>
            {panelAbono(f.id)}{listaAbonos(f)}
          </div>
        ) : filaCredito(f, pagado))}</div>}
      </article>
    )
  }

  const totalAntig = antig.reduce((s, v) => s + v, 0) || 1

  return (
    <div style={{ background: C.fondo, minHeight: '100vh', color: C.tinta }}>
      <PageHeader title="Cartera" subtitle={empresa?.nombre}
        actions={usuario.rol === 'admin' && !deudaForm ? <button onClick={abrirDeudaAnterior} className="px-3 min-h-[36px] rounded-lg text-sm font-bold" style={{ background: C.fondo }}>Cargar deuda anterior</button> : null} />

      <div className="p-4 max-w-5xl mx-auto flex flex-col gap-4">
        <div className="flex gap-1 bg-white rounded-full p-1 self-start max-w-full overflow-x-auto" role="tablist">
          {[['pendientes', 'Por cobrar'], ['transferencias', 'Transferencias'], ['historial', 'Pagados']].map(([v, t]) => (
            <button key={v} role="tab" aria-selected={vista === v} onClick={() => irA(v)} className="px-4 min-h-[38px] rounded-full text-[13.5px] font-bold whitespace-nowrap"
              style={vista === v ? { background: C.tinta, color: '#fff' } : { color: C.gris }}>
              {t}{v === 'transferencias' && transfPendientes > 0 && <span className="ml-1.5 text-[11px] font-extrabold rounded-full px-1.5 py-0.5" style={{ background: '#F2B21B', color: C.tinta }}>{transfPendientes}</span>}
            </button>
          ))}
        </div>

        {deudaForm && (
          <section className="bg-white rounded-[18px] p-4 flex flex-col gap-2.5">
            <div>
              <h2 className="font-extrabold text-[19px]" style={titulo}>Deuda anterior</h2>
              <p className="text-[13px]" style={{ color: C.gris }}>Para deudas que ya existían antes de usar el sistema. No crea una venta ni mueve inventario ni caja.</p>
            </div>
            <label className="text-[12.5px] font-bold" style={{ color: C.gris }}>Cliente registrado (opcional)
              <select value={deudaForm.cliente_id} onChange={e => elegirClienteDeuda(e.target.value)} className={input + ' mt-1'} style={{ borderColor: C.linea, color: C.tinta }}>
                <option value="">No está registrado</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
            <label className="text-[12.5px] font-bold" style={{ color: C.gris }}>Nombre del cliente
              <input type="text" value={deudaForm.nombre_cliente} onChange={e => setDeudaForm({ ...deudaForm, nombre_cliente: e.target.value })} className={input + ' mt-1'} style={{ borderColor: C.linea, color: C.tinta }} />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="text-[12.5px] font-bold" style={{ color: C.gris }}>Valor que debe
                <InputDinero value={deudaForm.valor} onChange={e => setDeudaForm({ ...deudaForm, valor: e.target.value })} className={input + ' font-bold mt-1'} style={{ borderColor: C.linea, color: C.tinta }} />
              </label>
              <label className="text-[12.5px] font-bold" style={{ color: C.gris }}>Fecha del crédito
                <input type="date" value={deudaForm.fecha_fiado} onChange={e => setDeudaForm({ ...deudaForm, fecha_fiado: e.target.value })} className={input + ' mt-1'} style={{ borderColor: C.linea, color: C.tinta }} />
              </label>
              <label className="text-[12.5px] font-bold" style={{ color: C.gris }}>Fecha de pago acordada
                <input type="date" value={deudaForm.fecha_pago} onChange={e => setDeudaForm({ ...deudaForm, fecha_pago: e.target.value })} className={input + ' mt-1'} style={{ borderColor: C.linea, color: C.tinta }} />
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="text-[12.5px] font-bold" style={{ color: C.gris }}>Ruta (opcional)
                <select value={deudaForm.ruta_id} onChange={e => setDeudaForm({ ...deudaForm, ruta_id: e.target.value })} className={input + ' mt-1'} style={{ borderColor: C.linea, color: C.tinta }}>
                  <option value="">Sin ruta</option>
                  {rutas.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
              </label>
              <label className="text-[12.5px] font-bold" style={{ color: C.gris }}>Vendedor que cobra (opcional)
                <select value={deudaForm.vendedor_id} onChange={e => setDeudaForm({ ...deudaForm, vendedor_id: e.target.value })} className={input + ' mt-1'} style={{ borderColor: C.linea, color: C.tinta }}>
                  <option value="">Sin vendedor</option>
                  {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                </select>
              </label>
            </div>
            <p className="text-[12.5px]" style={{ color: C.gris }}>Si no pones fecha de pago, se calcula con el plazo del cliente. Si le pones vendedor, le aparece en su liquidación para registrar los abonos.</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button onClick={() => setDeudaForm(null)} className="flex-1 min-h-[44px] rounded-xl text-sm font-bold" style={{ background: C.fondo }}>Cerrar</button>
              <button onClick={() => guardarDeudaAnterior(true)} disabled={guardandoDeuda} className="flex-1 min-h-[44px] rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: C.tinta }}>{guardandoDeuda ? 'Guardando…' : 'Guardar y cargar otra'}</button>
              <button onClick={() => guardarDeudaAnterior(false)} disabled={guardandoDeuda} className="flex-1 min-h-[44px] rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: C.rojo }}>Guardar</button>
            </div>
          </section>
        )}

        {vista === 'transferencias' && <div className="bg-white rounded-[18px] p-3"><TransferenciasPorVerificar usuario={usuario} onCambio={setTransfPendientes} /></div>}

        {vista === 'pendientes' && !cargando && (
          <>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              {kpi('Por cobrar a clientes', pesos(total), `${plural(deClientes.length, 'crédito', 'créditos')}`)}
              {kpi('Vencido', pesos(vencidos.reduce((s, f) => s + (f.saldo || 0), 0)), plural(new Set(vencidos.map(f => f.cliente_id || f.nombre_cliente)).size, 'cliente', 'clientes'), vencidos.length ? C.rojo : null)}
              {kpi('Vence esta semana', pesos(semana.reduce((s, f) => s + (f.saldo || 0), 0)), plural(semana.length, 'crédito', 'créditos'))}
              {deGrupo.length > 0
                ? kpi('Entre empresas del grupo', pesos(deGrupo.reduce((s, f) => s + (f.saldo || 0), 0)), gruposGrupo.map(g => g.nombre).join(', ') + ' · aparte')
                : kpi('Sin cliente ligado', String(sinCliente.length), sinCliente.length ? 'Ligarlos para cobrar por cliente' : 'Todo ligado')}
            </div>

            {total > 0 && (
              <div className="bg-white rounded-[18px] p-3.5 flex flex-col gap-2">
                <div className="flex flex-wrap justify-between gap-2"><b>Antigüedad de la cartera</b><span className="text-[12.5px]" style={{ color: C.gris }}>Días desde el crédito</span></div>
                <div className="flex h-3.5 rounded-full overflow-hidden gap-[2px]" role="img" aria-label={'Antigüedad: ' + RANGOS.map((r, i) => `${r} ${pesos(antig[i])}`).join(', ')}>
                  {antig.map((v, i) => v > 0 && <div key={i} style={{ width: `${(v / totalAntig) * 100}%`, background: COLORES.antiguedad[i] }} />)}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12.5px]">
                  {RANGOS.map((r, i) => (
                    <span key={r} className="flex items-center gap-1.5" style={{ color: C.gris }}>
                      <i className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: COLORES.antiguedad[i] }} />{r}
                      <b className="ml-auto tabular-nums" style={{ color: C.tinta }}>{pesos(antig[i])}</b>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {vista !== 'transferencias' && (
          <div className="flex flex-col gap-2.5">
            <input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar cliente, apto, edificio o barrio…"
              className={input} style={{ borderColor: C.linea, color: C.tinta }} />
            {vista === 'pendientes' && origenes.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                {chip(!origenFiltro, () => setOrigenFiltro(''), 'Todas las rutas', 'todas')}
                {origenes.map(o => chip(origenFiltro === o.key, () => setOrigenFiltro(origenFiltro === o.key ? '' : o.key), <>{o.nombre} <span className="opacity-70 tabular-nums">{pesos(o.total)}</span></>, o.key))}
              </div>
            )}
            {vista === 'pendientes' && (
              <div className="flex flex-wrap gap-1.5 items-center">
                {chip(!estadoFiltro, () => setEstadoFiltro(''), 'Todos', 'e0')}
                {chip(estadoFiltro === 'vencidos', () => setEstadoFiltro(estadoFiltro === 'vencidos' ? '' : 'vencidos'), 'Vencidos', 'e1')}
                {chip(estadoFiltro === 'semana', () => setEstadoFiltro(estadoFiltro === 'semana' ? '' : 'semana'), 'Vencen esta semana', 'e2')}
                {sinCliente.length > 0 && chip(estadoFiltro === 'sinCliente', () => setEstadoFiltro(estadoFiltro === 'sinCliente' ? '' : 'sinCliente'), `Sin cliente (${sinCliente.length})`, 'e3')}
                <select value={orden} onChange={e => setOrden(e.target.value)} aria-label="Ordenar" className="ml-auto bg-white rounded-full px-3 min-h-[36px] text-[13px] font-bold outline-none" style={{ color: C.gris }}>
                  <option value="vencido">Más atrasado primero</option>
                  <option value="deuda">Mayor deuda primero</option>
                  <option value="nombre">Por nombre</option>
                </select>
              </div>
            )}
          </div>
        )}

        {vista !== 'transferencias' && ((vista === 'pendientes' ? cargando : cargandoHistorial) ? (
          <p className="text-sm py-10 text-center" style={{ color: C.gris }}>Cargando…</p>
        ) : grupos.length === 0 ? (
          <p className="text-sm py-10 text-center" style={{ color: C.gris }}>
            {vista === 'historial' ? (historial.length ? 'Sin resultados.' : 'Todavía no hay créditos pagados.') : deClientes.length ? 'Ningún cliente coincide con los filtros.' : 'No hay créditos pendientes.'}
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 items-start">
            {grupos.map(g => tarjetaCliente(g, vista === 'historial'))}
          </div>
        ))}

        {vista === 'pendientes' && !cargando && gruposGrupo.length > 0 && !q && !origenFiltro && !estadoFiltro && (
          <section className="flex flex-col gap-2.5">
            <div>
              <h2 className="font-extrabold text-[19px]" style={titulo}>Entre empresas del grupo</h2>
              <p className="text-[13px]" style={{ color: C.gris }}>Es deuda real de esta empresa, pero no se cobra en ruta y no suma en la cartera del grupo.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 items-start">{gruposGrupo.map(g => tarjetaCliente(g, false))}</div>
          </section>
        )}
      </div>
    </div>
  )
}
