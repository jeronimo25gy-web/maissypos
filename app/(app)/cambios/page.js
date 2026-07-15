'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'

const TIPOS = [
  { id: 'mano_a_mano', nombre: 'Mano a mano', desc: 'Solo registro informativo — no afecta inventario ni proveedor' },
  { id: 'descuenta_proveedor', nombre: 'Descuenta al proveedor', desc: 'Baja de inventario + nota credito contra el saldo pendiente del proveedor' },
  { id: 'perdida_negocio', nombre: 'Perdida del negocio', desc: 'Baja de inventario + se registra como perdida por calidad en Gastos Admin' },
]

const QUIEN_REGISTRA_OPCIONES = [
  { id: 'vendedor', label: 'Vendedor' },
  { id: 'bodega', label: 'Bodega' },
  { id: 'admin', label: 'Admin' },
]

const itemVacio = () => ({ sku: '', cantidad: '', motivo: '', valor: '', valorEditado: false, proveedorId: '', proveedorManual: false })

export default function Cambios() {
  const [usuario, setUsuario] = useState(null)
  const [vendedores, setVendedores] = useState([])
  const [vendedorPropio, setVendedorPropio] = useState(null)
  const [vendedorId, setVendedorId] = useState('')
  const [proveedores, setProveedores] = useState([])
  const [productos, setProductos] = useState([])
  const [tipo, setTipo] = useState('mano_a_mano')
  const [momento, setMomento] = useState('en_ruta')
  const [quienRegistra, setQuienRegistra] = useState('admin')
  const [items, setItems] = useState([itemVacio()])
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [vista, setVista] = useState('nuevo')
  const [historialItems, setHistorialItems] = useState([])
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroProveedor, setFiltroProveedor] = useState('todos')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')
  const [resumenProveedores, setResumenProveedores] = useState([])
  const [resumenPerdidas, setResumenPerdidas] = useState(0)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (!['admin', 'auxiliar', 'vendedor'].includes(parsed.rol)) { router.push('/dashboard'); return }
    setUsuario(parsed)
    cargarProductos()
    cargarProveedores()
    if (parsed.rol === 'vendedor') {
      setQuienRegistra('vendedor')
      resolverVendedorPropio(parsed.vendedor_nombre)
    } else {
      cargarVendedores()
      setQuienRegistra(parsed.rol === 'auxiliar' ? 'bodega' : 'admin')
    }
  }, [])

  const cargarVendedores = async () => {
    const { data } = await supabase.from('vendedores').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    if (data) setVendedores(data)
  }

  const resolverVendedorPropio = async (nombre) => {
    const { data } = await supabase.from('vendedores').select('*').eq('nombre', nombre).eq('empresa_id', getEmpresaId()).single()
    if (data) { setVendedorPropio(data); setVendedorId(data.id) }
  }

  const cargarProductos = async () => {
    const { data } = await supabase.from('productos').select('sku, nombre, precio_venta, costo_compra, proveedor_id').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    if (data) setProductos(data)
  }

  const cargarProveedores = async () => {
    const { data } = await supabase.from('proveedores').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre')
    if (data) setProveedores(data)
  }

  const getProducto = (sku) => productos.find(p => p.sku === sku)

  const cambiarTipo = (t) => {
    setTipo(t)
    setItems([itemVacio()])
  }

  const agregarItem = () => setItems([...items, itemVacio()])
  const quitarItem = (i) => setItems(items.filter((_, idx) => idx !== i))
  const actualizarItem = (i, campo, valor) => {
    const n = [...items]
    n[i][campo] = valor
    if (campo === 'sku') {
      const p = getProducto(valor)
      n[i].proveedorId = p?.proveedor_id || ''
      n[i].proveedorManual = false
    }
    if (campo === 'sku' || campo === 'cantidad') {
      const p = getProducto(n[i].sku)
      const costo = p?.costo_compra || p?.precio_venta || 0
      if (n[i].sku && n[i].cantidad && !n[i].valorEditado) {
        n[i].valor = String(parseFloat(n[i].cantidad || 0) * costo)
      }
    }
    if (campo === 'valor') n[i].valorEditado = true
    if (campo === 'proveedorId') n[i].proveedorManual = true
    setItems(n)
  }

  const guardarCambios = async () => {
    if (momento === 'en_ruta' && !vendedorId) { alert('Selecciona el vendedor'); return }
    const validos = items.filter(it => it.sku && parseFloat(it.cantidad) > 0)
    if (validos.length === 0) { alert('Ingresa al menos un producto con cantidad'); return }
    if (tipo === 'descuenta_proveedor' && validos.some(it => !it.proveedorId)) {
      alert('Selecciona el proveedor afectado en cada producto')
      return
    }
    setGuardando(true)
    const empresaId = getEmpresaId()
    const fecha = obtenerFechaActual()

    const registros = validos.map(it => ({
      empresa_id: empresaId,
      fecha,
      vendedor_id: momento === 'en_ruta' ? vendedorId : (vendedorId || null),
      sku: it.sku,
      cantidad: parseFloat(it.cantidad),
      tipo,
      momento,
      quien_registra: quienRegistra,
      proveedor_id: tipo === 'descuenta_proveedor' ? it.proveedorId : null,
      motivo: it.motivo || null,
      valor: (tipo === 'descuenta_proveedor' || tipo === 'perdida_negocio') && it.valor ? parseFloat(it.valor) : null
    }))
    const { error } = await supabase.from('novedades').insert(registros)
    if (error) { alert('Error: ' + error.message); setGuardando(false); return }

    const fallos = []

    if (tipo !== 'mano_a_mano') {
      const movimientos = validos.map(it => ({
        empresa_id: empresaId,
        sku: it.sku,
        cantidad: parseFloat(it.cantidad),
        fecha,
        tipo_movimiento: 'salida',
        referencia: tipo === 'descuenta_proveedor' ? 'Cambio - descuento a proveedor' : 'Cambio - perdida del negocio'
      }))
      const { error: errMov } = await supabase.from('inventario_mov').insert(movimientos)
      if (errMov) fallos.push('actualizar el inventario disponible')
    }

    if (tipo === 'perdida_negocio') {
      const gastos = validos.map(it => {
        const p = getProducto(it.sku)
        return {
          empresa_id: empresaId,
          fecha,
          categoria: 'Pérdida por calidad',
          descripcion: `${p?.nombre || it.sku} (${it.sku}) x${it.cantidad}${it.motivo ? ' - ' + it.motivo : ''}`,
          valor: parseFloat(it.valor) || 0,
          registrado_por: usuario.nombre
        }
      })
      const { error: errGasto } = await supabase.from('gastos_admin').insert(gastos)
      if (errGasto) fallos.push('registrar la perdida en Gastos Admin')
    }

    if (tipo === 'descuenta_proveedor') {
      const porProveedor = {}
      validos.forEach(it => {
        porProveedor[it.proveedorId] = (porProveedor[it.proveedorId] || 0) + parseFloat(it.valor || 0)
      })
      for (const [proveedorId, creditoTotal] of Object.entries(porProveedor)) {
        const { data: factura } = await supabase.from('facturas_proveedores').select('id, total_pendiente')
          .eq('proveedor_id', proveedorId).eq('empresa_id', empresaId).eq('estado', 'pendiente').maybeSingle()
        const saldoActual = factura?.total_pendiente || 0
        const nuevoSaldo = Math.max(0, saldoActual - creditoTotal)
        if (creditoTotal > saldoActual) {
          const prov = proveedores.find(p => p.id === proveedorId)
          alert(`${prov?.nombre || 'El proveedor'} no tenia suficiente saldo pendiente. Se descontaron $${saldoActual.toLocaleString('es-CO')} de $${creditoTotal.toLocaleString('es-CO')}; el resto no se pudo aplicar.`)
        }
        if (factura) {
          const { error: errFactura } = await supabase.from('facturas_proveedores')
            .update({ total_pendiente: nuevoSaldo, updated_at: new Date().toISOString() })
            .eq('id', factura.id)
          if (errFactura) fallos.push('actualizar el saldo del proveedor')
        }
      }
    }

    if (fallos.length > 0) {
      alert('El cambio se registro, pero algo fallo en: ' + fallos.join(', ') + '. Avisale al admin para que lo revise.')
    }
    setGuardado(true)
    setGuardando(false)
  }

  const cargarHistorial = async (desde, hasta) => {
    setCargandoHistorial(true)
    const { data } = await supabase.from('novedades').select('*, vendedores(nombre), proveedores(nombre)')
      .eq('empresa_id', getEmpresaId()).gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false })
    setHistorialItems(data || [])
    setCargandoHistorial(false)
  }

  const cargarResumenMes = async () => {
    const hoy = obtenerFechaActual()
    const inicioMes = hoy.slice(0, 7) + '-01'
    const { data } = await supabase.from('novedades').select('proveedor_id, valor, tipo, proveedores(nombre)')
      .eq('empresa_id', getEmpresaId()).gte('fecha', inicioMes).lte('fecha', hoy)
    const porProveedor = {}
    let perdidas = 0
    ;(data || []).forEach(n => {
      if (n.tipo === 'descuenta_proveedor') {
        const key = n.proveedor_id || 'sin-proveedor'
        if (!porProveedor[key]) porProveedor[key] = { nombre: n.proveedores?.nombre || 'Sin proveedor', total: 0 }
        porProveedor[key].total += (n.valor || 0)
      } else if (n.tipo === 'perdida_negocio') {
        perdidas += (n.valor || 0)
      }
    })
    setResumenProveedores(Object.values(porProveedor).sort((a, b) => b.total - a.total))
    setResumenPerdidas(perdidas)
  }

  const irAHistorial = () => {
    setVista('historial')
    const hoy = obtenerFechaActual()
    const inicioMes = hoy.slice(0, 7) + '-01'
    setFiltroDesde(inicioMes)
    setFiltroHasta(hoy)
    setFiltroTipo('todos')
    setFiltroProveedor('todos')
    cargarHistorial(inicioMes, hoy)
    cargarResumenMes()
  }

  const historialFiltrado = historialItems.filter(n => {
    const matchTipo = filtroTipo === 'todos' || n.tipo === filtroTipo
    const matchProv = filtroProveedor === 'todos' || n.proveedor_id === filtroProveedor
    return matchTipo && matchProv
  })

  if (!usuario) return null

  if (guardado) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-md w-full">
        <h2 className="text-2xl font-black text-gray-800">Registrado</h2>
        <p className="text-gray-500 mt-2">{TIPOS.find(t => t.id === tipo)?.nombre} guardado correctamente.</p>
        <div className="flex gap-3 mt-6">
          <button onClick={() => { cambiarTipo(tipo); setGuardado(false) }}
            className="flex-1 bg-brand hover:bg-brand-dark text-white px-4 py-3 rounded-xl font-bold">
            Nuevo registro
          </button>
          <button onClick={() => router.push('/dashboard')} className="flex-1 bg-gray-100 text-gray-600 px-4 py-3 rounded-xl font-bold">
            Inicio
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <div className="bg-white shadow-sm px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-gray-700" aria-label="Volver al dashboard">←</button>
          <h1 className="text-xl font-black text-gray-900">Cambios</h1>
        </div>
        <p className="text-xs text-gray-500">Cambios por proveedor, perdidas de calidad y registros informativos</p>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        <div className="flex gap-2 mb-4">
          <button onClick={() => setVista('nuevo')}
            className={`flex-1 py-2 rounded-xl text-sm font-bold ${vista === 'nuevo' ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            Registrar cambio
          </button>
          <button onClick={irAHistorial}
            className={`flex-1 py-2 rounded-xl text-sm font-bold ${vista === 'historial' ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            Historial
          </button>
        </div>

        {vista === 'historial' ? (
          <div>
            <div className="grid grid-cols-1 gap-3 mb-4">
              <div className="bg-white rounded-xl shadow-sm p-4">
                <p className="text-xs text-gray-500 mb-2">Descontado a proveedores este mes</p>
                {resumenProveedores.length === 0 ? (
                  <p className="text-sm text-gray-400">Sin descuentos este mes</p>
                ) : (
                  resumenProveedores.map(r => (
                    <div key={r.nombre} className="flex justify-between py-1">
                      <p className="text-sm text-gray-700">{r.nombre}</p>
                      <p className="text-sm font-bold text-gray-900">${r.total.toLocaleString('es-CO')}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4 flex justify-between items-center">
                <p className="text-sm font-bold text-gray-700">Perdidas propias este mes</p>
                <p className="text-xl font-black text-brand">${resumenPerdidas.toLocaleString('es-CO')}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <div className="flex gap-2 mb-2">
                <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
                  className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
                  <option value="todos">Todos los tipos</option>
                  {TIPOS.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
                <select value={filtroProveedor} onChange={e => setFiltroProveedor(e.target.value)}
                  className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
                  <option value="todos">Todos los proveedores</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)}
                  className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
                <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)}
                  className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
                <button onClick={() => cargarHistorial(filtroDesde, filtroHasta)}
                  className="bg-brand hover:bg-brand-dark text-white px-4 rounded-xl text-sm font-bold">
                  Buscar
                </button>
              </div>
            </div>

            {cargandoHistorial ? (
              <p className="text-gray-400 text-center py-10">Cargando...</p>
            ) : historialFiltrado.length === 0 ? (
              <p className="text-gray-400 text-center py-10">Sin cambios registrados en ese rango</p>
            ) : (
              <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
                {historialFiltrado.map(n => (
                  <div key={n.id} className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-gray-800 text-sm">{getProducto(n.sku)?.nombre || n.sku}</p>
                        <p className="text-xs text-gray-400">
                          {n.fecha} · {TIPOS.find(t => t.id === n.tipo)?.nombre || n.tipo} · {n.momento === 'en_bodega' ? 'En bodega' : 'En ruta'}
                        </p>
                        {n.proveedores?.nombre && <p className="text-xs text-gray-400">Proveedor: {n.proveedores.nombre}</p>}
                        {n.vendedores?.nombre && <p className="text-xs text-gray-400">Vendedor: {n.vendedores.nombre}</p>}
                        {n.motivo && <p className="text-xs text-gray-500 mt-1">{n.motivo}</p>}
                      </div>
                      <div className="text-right">
                        <p className="font-black text-gray-700 text-sm">{n.cantidad} und</p>
                        {n.valor ? <p className="text-xs text-brand font-bold">${n.valor.toLocaleString('es-CO')}</p> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 mb-4">
              {TIPOS.map(t => (
                <button key={t.id} onClick={() => cambiarTipo(t.id)}
                  className={`text-left p-3 rounded-xl border-2 transition-colors ${tipo === t.id ? 'border-brand bg-brand/5' : 'border-gray-200 bg-white'}`}>
                  <p className={`font-bold text-sm ${tipo === t.id ? 'text-brand' : 'text-gray-800'}`}>{t.nombre}</p>
                  <p className="text-xs text-gray-500">{t.desc}</p>
                </button>
              ))}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <label className="text-xs font-bold text-gray-600 block mb-2">Quien registra</label>
              {usuario.rol === 'vendedor' ? (
                <p className="font-bold text-gray-800">Vendedor</p>
              ) : (
                <div className="flex gap-2">
                  {QUIEN_REGISTRA_OPCIONES.map(o => (
                    <button key={o.id} onClick={() => setQuienRegistra(o.id)}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold ${quienRegistra === o.id ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <label className="text-xs font-bold text-gray-600 block mb-2">Momento</label>
              <div className="flex gap-2">
                <button onClick={() => setMomento('en_bodega')}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold ${momento === 'en_bodega' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}>
                  En bodega
                </button>
                <button onClick={() => setMomento('en_ruta')}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold ${momento === 'en_ruta' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}>
                  En ruta
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {momento === 'en_bodega' ? 'Ocurre antes del despacho, sin pasar por un vendedor' : 'Reportado por un vendedor durante su ruta'}
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <label className="text-xs font-bold text-gray-600 block mb-1">Vendedor{momento === 'en_bodega' ? ' (opcional)' : ''}</label>
              {usuario.rol === 'vendedor' ? (
                <p className="font-bold text-gray-800">{vendedorPropio?.nombre || 'Cargando...'}</p>
              ) : (
                <select value={vendedorId} onChange={e => setVendedorId(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
                  <option value="">{momento === 'en_bodega' ? 'Sin vendedor asociado' : 'Selecciona vendedor'}</option>
                  {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                </select>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <div className="flex justify-between items-center mb-3">
                <p className="font-black text-gray-700">Productos</p>
                <button onClick={agregarItem} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg font-bold">+ Agregar</button>
              </div>
              {items.map((it, i) => (
                <div key={i} className="mb-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0 last:mb-0">
                  <div className="flex gap-2 mb-2">
                    <select value={it.sku} onChange={e => actualizarItem(i, 'sku', e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand">
                      <option value="">Selecciona producto</option>
                      {productos.map(p => <option key={p.sku} value={p.sku}>{p.nombre}</option>)}
                    </select>
                    <input type="number" min="0" placeholder="Cant" value={it.cantidad}
                      onChange={e => actualizarItem(i, 'cantidad', e.target.value)}
                      className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 focus:outline-none focus:border-brand" />
                    {items.length > 1 && (
                      <button onClick={() => quitarItem(i)} className="text-brand text-sm px-2">✕</button>
                    )}
                  </div>
                  <input type="text" placeholder="Motivo" value={it.motivo}
                    onChange={e => actualizarItem(i, 'motivo', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 mb-2 focus:outline-none focus:border-brand" />

                  {tipo === 'descuenta_proveedor' && (
                    <div className="mb-2">
                      <label className="text-xs text-gray-500 block mb-1">Proveedor afectado</label>
                      {(!it.proveedorManual && it.proveedorId) ? (
                        <div className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
                          <p className="text-sm font-bold text-gray-800">{proveedores.find(p => p.id === it.proveedorId)?.nombre || 'Proveedor asignado'}</p>
                          <button onClick={() => actualizarItem(i, 'proveedorManual', true)} className="text-xs text-brand font-bold">Cambiar</button>
                        </div>
                      ) : (
                        <select value={it.proveedorId} onChange={e => actualizarItem(i, 'proveedorId', e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand">
                          <option value="">Selecciona proveedor</option>
                          {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                        </select>
                      )}
                    </div>
                  )}

                  {(tipo === 'descuenta_proveedor' || tipo === 'perdida_negocio') && (
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Valor {tipo === 'descuenta_proveedor' ? 'de la nota credito' : 'de la perdida'}</label>
                      <input type="number" min="0" placeholder="0" value={it.valor}
                        onChange={e => actualizarItem(i, 'valor', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 focus:outline-none focus:border-brand" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button onClick={guardarCambios} disabled={guardando}
              className="w-full bg-brand hover:bg-brand-dark text-white font-black py-4 rounded-xl text-lg disabled:opacity-50">
              {guardando ? 'Guardando...' : 'Registrar'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
