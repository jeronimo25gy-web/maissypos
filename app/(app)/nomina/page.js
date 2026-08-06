'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { generarYCompartirPDF } from '@/lib/compartir'
import { PageHeader } from '@/components/ui'

const mesActual = () => obtenerFechaActual().slice(0, 7)

const rangoMes = (mes) => {
  const [y, m] = mes.split('-').map(Number)
  const inicio = `${mes}-01`
  const ultimoDia = new Date(y, m, 0).getDate()
  const fin = `${mes}-${String(ultimoDia).padStart(2, '0')}`
  return { inicio, fin }
}

function calcularComision(pctMeta, utilidadNeta, rangos) {
  const rango = (rangos || []).find(r => pctMeta >= r.meta_pct_min && (r.meta_pct_max == null || pctMeta <= r.meta_pct_max))
  if (!rango) return { comision: 0, rango: null }
  return { comision: utilidadNeta * (rango.comision_pct / 100), rango }
}

const TABS = [
  { id: 'empleados', nombre: 'Empleados' },
  { id: 'descuentos', nombre: 'Descuentos' },
  { id: 'nomina', nombre: 'Nomina del mes' },
  { id: 'historial', nombre: 'Historial' },
]

const cargarDescuentosPorEmpleado = async (empleados, mes) => {
  const { inicio, fin } = rangoMes(mes)
  const empresaId = getEmpresaId()
  const empleadoIds = empleados.map(e => e.id)
  const vendedorIds = empleados.filter(e => e.vendedor_id).map(e => e.vendedor_id)
  const empleadoPorVendedor = {}
  empleados.forEach(e => { if (e.vendedor_id) empleadoPorVendedor[e.vendedor_id] = e.id })

  const [{ data: liq }, { data: prestamos }, { data: consumos }] = await Promise.all([
    vendedorIds.length > 0
      ? supabase.from('liquidaciones_detalle').select('vendedor_id, diferencia, fecha').in('vendedor_id', vendedorIds).lt('diferencia', 0).gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', empresaId)
      : Promise.resolve({ data: [] }),
    empleadoIds.length > 0
      ? supabase.from('gastos_admin').select('empleado_id, valor, fecha, categoria').in('empleado_id', empleadoIds).ilike('categoria', '%restamo%').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', empresaId)
      : Promise.resolve({ data: [] }),
    empleadoIds.length > 0
      ? supabase.from('consumos_empleado').select('empleado_id, valor, fecha').in('empleado_id', empleadoIds).gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', empresaId)
      : Promise.resolve({ data: [] }),
  ])

  const porEmpleado = {}
  empleados.forEach(e => { porEmpleado[e.id] = { descuadres: 0, prestamos: 0, consumos: 0, total: 0, detalle: [] } })

  ;(liq || []).forEach(l => {
    const empId = empleadoPorVendedor[l.vendedor_id]
    if (!empId || !porEmpleado[empId]) return
    const val = Math.abs(l.diferencia)
    porEmpleado[empId].descuadres += val
    porEmpleado[empId].detalle.push({ tipo: 'Descuadre de caja', fecha: l.fecha, valor: val })
  })
  ;(prestamos || []).forEach(g => {
    if (!g.empleado_id || !porEmpleado[g.empleado_id]) return
    porEmpleado[g.empleado_id].prestamos += g.valor || 0
    porEmpleado[g.empleado_id].detalle.push({ tipo: 'Prestamo', fecha: g.fecha, valor: g.valor || 0 })
  })
  ;(consumos || []).forEach(c => {
    if (!c.empleado_id || !porEmpleado[c.empleado_id]) return
    porEmpleado[c.empleado_id].consumos += c.valor || 0
    porEmpleado[c.empleado_id].detalle.push({ tipo: 'Consumo propio', fecha: c.fecha, valor: c.valor || 0 })
  })
  Object.values(porEmpleado).forEach(p => {
    p.total = p.descuadres + p.prestamos + p.consumos
    p.detalle.sort((a, b) => a.fecha.localeCompare(b.fecha))
  })
  return porEmpleado
}

const cargarComisionPorRuta = async (mes) => {
  const { inicio, fin } = rangoMes(mes)
  const empresaId = getEmpresaId()
  const [{ data: rangosData }, { data: rutas }, { data: metas }, { data: despachos }, { data: liq }, { data: gastos }] = await Promise.all([
    supabase.from('config_comisiones').select('*').eq('empresa_id', empresaId).order('meta_pct_min'),
    supabase.from('rutas').select('id').eq('estado', true).eq('empresa_id', empresaId),
    supabase.from('metas_ventas').select('*').eq('mes', mes).not('ruta_id', 'is', null).eq('empresa_id', empresaId),
    supabase.from('despachos_encab').select('id, ruta_id').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', empresaId),
    supabase.from('liquidaciones').select('despacho_id, efectivo_esperado').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', empresaId),
    supabase.from('liquidaciones_gastos').select('despacho_id, valor').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', empresaId),
  ])
  const despachoRutaMap = {}
  ;(despachos || []).forEach(d => { despachoRutaMap[d.id] = d.ruta_id })
  const ventaPorRuta = {}
  ;(liq || []).forEach(l => { const r = despachoRutaMap[l.despacho_id]; if (!r) return; ventaPorRuta[r] = (ventaPorRuta[r] || 0) + (l.efectivo_esperado || 0) })
  const gastoPorRuta = {}
  ;(gastos || []).forEach(g => { const r = despachoRutaMap[g.despacho_id]; if (!r) return; gastoPorRuta[r] = (gastoPorRuta[r] || 0) + (g.valor || 0) })
  const metaPorRuta = {}
  ;(metas || []).forEach(m => { metaPorRuta[m.ruta_id] = m.meta })
  const comisionPorRuta = {}
  ;(rutas || []).forEach(r => {
    const ventas = ventaPorRuta[r.id] || 0
    const gastosRuta = gastoPorRuta[r.id] || 0
    const utilidadNeta = ventas - gastosRuta
    const meta = metaPorRuta[r.id] || 0
    const pctMeta = meta > 0 ? (ventas / meta) * 100 : 0
    const { comision } = calcularComision(pctMeta, utilidadNeta, rangosData || [])
    comisionPorRuta[r.id] = comision
  })
  return comisionPorRuta
}

export default function Nomina() {
  const [usuario, setUsuario] = useState(null)
  const [vista, setVista] = useState('empleados')
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (parsed.rol !== 'admin') { router.push('/despacho'); return }
    setUsuario(parsed)
  }, [])

  if (!usuario) return null

  return (
    <div>
      <PageHeader title="Nomina" subtitle="Empleados, descuentos y pagos de nomina" />
      <div className="p-4 max-w-3xl mx-auto">
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setVista(t.id)}
              className={`px-3 py-2 rounded-xl text-sm font-bold whitespace-nowrap ${vista === t.id ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              {t.nombre}
            </button>
          ))}
        </div>
        {vista === 'empleados' && <TabEmpleados />}
        {vista === 'descuentos' && <TabDescuentos />}
        {vista === 'nomina' && <TabNominaDelMes usuario={usuario} />}
        {vista === 'historial' && <TabHistorial />}
      </div>
    </div>
  )
}

const empleadoVacio = () => ({ id: null, nombre: '', cargo: '', salario_base: '', fecha_inicio: '', vendedor_id: '' })

function TabEmpleados() {
  const [empleados, setEmpleados] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [cargando, setCargando] = useState(true)
  const [form, setForm] = useState(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setCargando(true)
    const [{ data: emp }, { data: vend }] = await Promise.all([
      supabase.from('empleados').select('*, vendedores(nombre)').eq('empresa_id', getEmpresaId()).order('nombre'),
      supabase.from('vendedores').select('id, nombre').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre'),
    ])
    setEmpleados(emp || [])
    setVendedores(vend || [])
    setCargando(false)
  }

  const guardar = async () => {
    if (!form.nombre) { alert('Ingresa el nombre'); return }
    setGuardando(true)
    const payload = {
      nombre: form.nombre,
      cargo: form.cargo || null,
      salario_base: parseFloat(form.salario_base) || 0,
      fecha_inicio: form.fecha_inicio || null,
      vendedor_id: form.vendedor_id || null,
    }
    const { error } = form.id
      ? await supabase.from('empleados').update(payload).eq('id', form.id)
      : await supabase.from('empleados').insert({ ...payload, empresa_id: getEmpresaId() })
    setGuardando(false)
    if (error) { alert('Error: ' + error.message); return }
    setForm(null)
    cargar()
  }

  const toggleActivo = async (e) => {
    if (e.activo && !confirm(`Desactivar a "${e.nombre}"? No se borra su historial.`)) return
    await supabase.from('empleados').update({ activo: !e.activo }).eq('id', e.id)
    cargar()
  }

  return (
    <div>
      {form ? (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <p className="font-black text-gray-700 mb-3">{form.id ? 'Editar empleado' : 'Nuevo empleado'}</p>
          <div className="mb-3">
            <label className="text-xs font-bold text-gray-600 block mb-1">Nombre</label>
            <input type="text" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })}
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Cargo</label>
              <input type="text" value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Salario base</label>
              <input type="number" min="0" value={form.salario_base} onChange={e => setForm({ ...form, salario_base: e.target.value })}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-gray-800 focus:border-brand focus:outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Fecha de inicio</label>
              <input type="date" value={form.fecha_inicio} onChange={e => setForm({ ...form, fecha_inicio: e.target.value })}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Vendedor ligado (opcional)</label>
              <select value={form.vendedor_id} onChange={e => setForm({ ...form, vendedor_id: e.target.value })}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
                <option value="">Ninguno</option>
                {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setForm(null)} className="flex-1 bg-gray-100 text-gray-600 font-bold py-3 rounded-xl">Cancelar</button>
            <button onClick={guardar} disabled={guardando} className="flex-1 bg-brand hover:bg-brand-dark text-white font-black py-3 rounded-xl disabled:opacity-50">
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setForm(empleadoVacio())} className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-3 rounded-xl mb-4">
          + Nuevo empleado
        </button>
      )}

      {cargando ? (
        <p className="text-gray-400 text-center py-10">Cargando...</p>
      ) : empleados.length === 0 ? (
        <p className="text-gray-400 text-center py-10">Sin empleados registrados</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
          {empleados.map(e => (
            <div key={e.id} className="p-4 flex justify-between items-center">
              <div>
                <p className="font-bold text-gray-800">{e.nombre} {!e.activo && <span className="text-xs text-gray-400">(inactivo)</span>}</p>
                <p className="text-xs text-gray-500">{e.cargo || 'Sin cargo'} · ${(e.salario_base || 0).toLocaleString('es-CO')}{e.vendedores?.nombre ? ` · ${e.vendedores.nombre}` : ''}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setForm({ id: e.id, nombre: e.nombre, cargo: e.cargo || '', salario_base: String(e.salario_base || 0), fecha_inicio: e.fecha_inicio || '', vendedor_id: e.vendedor_id || '' })}
                  className="text-xs bg-gray-100 px-3 py-2 rounded-lg font-bold text-gray-600">Editar</button>
                <button onClick={() => toggleActivo(e)} className={`text-xs px-3 py-2 rounded-lg font-bold ${e.activo ? 'bg-brand/10 text-brand' : 'bg-gray-100 text-gray-600'}`}>
                  {e.activo ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TabDescuentos() {
  const [mes, setMes] = useState(mesActual())
  const [empleados, setEmpleados] = useState([])
  const [descuentos, setDescuentos] = useState({})
  const [cargando, setCargando] = useState(true)
  const [expandido, setExpandido] = useState(null)

  useEffect(() => { cargar() }, [mes])

  const cargar = async () => {
    setCargando(true)
    const { data: emp } = await supabase.from('empleados').select('*').eq('activo', true).eq('empresa_id', getEmpresaId()).order('nombre')
    const lista = emp || []
    setEmpleados(lista)
    const desc = await cargarDescuentosPorEmpleado(lista, mes)
    setDescuentos(desc)
    setCargando(false)
  }

  return (
    <div>
      <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
        <label className="text-xs font-bold text-gray-600 block mb-1">Mes</label>
        <input type="month" value={mes} onChange={e => setMes(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
      </div>

      {cargando ? (
        <p className="text-gray-400 text-center py-10">Cargando...</p>
      ) : empleados.length === 0 ? (
        <p className="text-gray-400 text-center py-10">Sin empleados activos</p>
      ) : (
        empleados.map(e => {
          const d = descuentos[e.id] || { descuadres: 0, prestamos: 0, consumos: 0, total: 0, detalle: [] }
          return (
            <div key={e.id} className="bg-white rounded-xl shadow-sm mb-3 overflow-hidden">
              <button onClick={() => setExpandido(expandido === e.id ? null : e.id)} className="w-full p-4 flex justify-between items-center text-left">
                <div>
                  <p className="font-black text-gray-900">{e.nombre}</p>
                  <p className="text-xs text-gray-500">Descuadres ${d.descuadres.toLocaleString('es-CO')} · Prestamos ${d.prestamos.toLocaleString('es-CO')} · Consumos ${d.consumos.toLocaleString('es-CO')}</p>
                </div>
                <p className="text-xl font-black text-brand">${d.total.toLocaleString('es-CO')}</p>
              </button>
              {expandido === e.id && (
                <div className="border-t border-gray-100 p-4 bg-gray-50">
                  {d.detalle.length === 0 ? (
                    <p className="text-gray-400 text-sm">Sin descuentos este mes</p>
                  ) : (
                    <div className="bg-white rounded-lg overflow-hidden border border-gray-200">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-100 text-xs text-gray-500 font-bold uppercase">
                            <th className="text-left px-3 py-1.5">Tipo</th>
                            <th className="text-left px-3 py-1.5">Fecha</th>
                            <th className="text-right px-3 py-1.5">Valor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {d.detalle.map((item, i) => (
                            <tr key={i}>
                              <td className="px-3 py-1.5 text-gray-700">{item.tipo}</td>
                              <td className="px-3 py-1.5 text-gray-500">{item.fecha}</td>
                              <td className="px-3 py-1.5 text-right font-bold text-gray-800">${item.valor.toLocaleString('es-CO')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

function TabNominaDelMes({ usuario }) {
  const [mes, setMes] = useState(mesActual())
  const [empleados, setEmpleados] = useState([])
  const [descuentos, setDescuentos] = useState({})
  const [comisionPorRuta, setComisionPorRuta] = useState({})
  const [vendedores, setVendedores] = useState([])
  const [pagos, setPagos] = useState({})
  const [saludPct, setSaludPct] = useState(4)
  const [pensionPct, setPensionPct] = useState(4)
  const [cargando, setCargando] = useState(true)
  const [pagando, setPagando] = useState(null)
  const [cuentaId, setCuentaId] = useState('')
  const [cuentas, setCuentas] = useState([])

  useEffect(() => { cargar() }, [mes])
  useEffect(() => { cargarCuentas() }, [])

  const cargarCuentas = async () => {
    const { data } = await supabase.from('cuentas').select('*').eq('estado', true).eq('empresa_id', getEmpresaId()).order('tipo').order('nombre')
    setCuentas(data || [])
  }

  const cargar = async () => {
    setCargando(true)
    const [{ data: emp }, { data: vend }, { data: pagosData }, { data: empresa }] = await Promise.all([
      supabase.from('empleados').select('*').eq('activo', true).eq('empresa_id', getEmpresaId()).order('nombre'),
      supabase.from('vendedores').select('id, ruta_id').eq('empresa_id', getEmpresaId()),
      supabase.from('nomina_pagos').select('*').eq('periodo', mes).eq('empresa_id', getEmpresaId()),
      supabase.from('empresas').select('salud_pct, pension_pct').eq('id', getEmpresaId()).maybeSingle(),
    ])
    const lista = emp || []
    setEmpleados(lista)
    setVendedores(vend || [])
    setSaludPct(empresa?.salud_pct ?? 4)
    setPensionPct(empresa?.pension_pct ?? 4)
    const pm = {}
    ;(pagosData || []).forEach(p => { pm[p.empleado_id] = p })
    setPagos(pm)
    const [desc, comPorRuta] = await Promise.all([
      cargarDescuentosPorEmpleado(lista, mes),
      cargarComisionPorRuta(mes),
    ])
    setDescuentos(desc)
    setComisionPorRuta(comPorRuta)
    setCargando(false)
  }

  const calcularFila = (e) => {
    const salario = e.salario_base || 0
    const salud = salario * (saludPct / 100)
    const pension = salario * (pensionPct / 100)
    const d = descuentos[e.id] || { descuadres: 0, prestamos: 0, consumos: 0, total: 0, detalle: [] }
    const vendedor = vendedores.find(v => v.id === e.vendedor_id)
    const comision = vendedor?.ruta_id ? (comisionPorRuta[vendedor.ruta_id] || 0) : 0
    const neto = salario - salud - pension - d.total + comision
    return { salud, pension, descuentos: d, comision, neto }
  }

  const marcarPagado = async (e) => {
    const fila = calcularFila(e)
    if (!cuentaId) { alert('Selecciona la cuenta desde la que se paga la nomina'); return }
    if (!confirm(`Marcar nomina de ${e.nombre} (${mes}) como pagada por $${fila.neto.toLocaleString('es-CO')}?`)) return
    setPagando(e.id)
    const empresaId = getEmpresaId()
    const { error } = await supabase.from('nomina_pagos').insert({
      empresa_id: empresaId,
      empleado_id: e.id,
      periodo: mes,
      salario_base: e.salario_base || 0,
      deduccion_salud: fila.salud,
      deduccion_pension: fila.pension,
      total_descuentos: fila.descuentos.total,
      comision: fila.comision,
      neto_a_pagar: fila.neto,
      detalle_descuentos: fila.descuentos.detalle,
    })
    if (error) { alert('Error: ' + error.message); setPagando(null); return }
    const { error: errTesoreria } = await supabase.from('movimientos_tesoreria').insert({
      empresa_id: empresaId, cuenta_id: cuentaId, fecha: obtenerFechaActual(), tipo: 'salida',
      monto: fila.neto, concepto: `Nomina ${mes} - ${e.nombre}`,
      referencia_tipo: 'nomina', referencia_id: null
    })
    if (errTesoreria) alert('La nomina se marco como pagada, pero no se pudo registrar el movimiento de caja/bancos: ' + errTesoreria.message)
    setPagando(null)
    cargar()
  }

  return (
    <div>
      <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
        <label className="text-xs font-bold text-gray-600 block mb-1">Mes</label>
        <input type="month" value={mes} onChange={e => setMes(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
        <label className="text-xs font-bold text-gray-600 block mb-1">Cuenta desde la que se paga la nomina</label>
        <select value={cuentaId} onChange={e => setCuentaId(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
          <option value="">Selecciona cuenta</option>
          {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>

      {cargando ? (
        <p className="text-gray-400 text-center py-10">Cargando...</p>
      ) : empleados.length === 0 ? (
        <p className="text-gray-400 text-center py-10">Sin empleados activos</p>
      ) : (
        empleados.map(e => {
          const fila = calcularFila(e)
          const yaPagado = pagos[e.id]
          return (
            <div key={e.id} className="bg-white rounded-xl shadow-sm p-4 mb-3">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-black text-gray-900">{e.nombre}</p>
                  <p className="text-xs text-gray-500">{e.cargo || 'Sin cargo'}</p>
                </div>
                <p className="text-xl font-black text-brand">${fila.neto.toLocaleString('es-CO')}</p>
              </div>
              <div className="text-sm text-gray-600 space-y-1 mb-3">
                <div className="flex justify-between"><span>Salario base</span><span className="font-bold">${(e.salario_base || 0).toLocaleString('es-CO')}</span></div>
                <div className="flex justify-between"><span>Salud ({saludPct}%)</span><span className="text-brand">-${fila.salud.toLocaleString('es-CO')}</span></div>
                <div className="flex justify-between"><span>Pension ({pensionPct}%)</span><span className="text-brand">-${fila.pension.toLocaleString('es-CO')}</span></div>
                {fila.descuentos.total > 0 && <div className="flex justify-between"><span>Descuentos</span><span className="text-brand">-${fila.descuentos.total.toLocaleString('es-CO')}</span></div>}
                {fila.comision > 0 && <div className="flex justify-between"><span>Comision</span><span>+${fila.comision.toLocaleString('es-CO')}</span></div>}
              </div>
              {usuario?.rol === 'admin' && (
                yaPagado ? (
                  <p className="text-center text-xs font-bold text-gray-400 bg-gray-100 rounded-lg py-2">Ya pagada este mes ({new Date(yaPagado.fecha_pago).toLocaleDateString('es-CO')})</p>
                ) : (
                  <button onClick={() => marcarPagado(e)} disabled={pagando === e.id}
                    className="w-full bg-brand hover:bg-brand-dark text-white font-black py-3 rounded-xl disabled:opacity-50">
                    {pagando === e.id ? 'Marcando...' : 'Marcar pagado'}
                  </button>
                )
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

function TabHistorial() {
  const [mes, setMes] = useState('')
  const [pagos, setPagos] = useState([])
  const [empleadosMap, setEmpleadosMap] = useState({})
  const [cargando, setCargando] = useState(true)
  const [imprimiendo, setImprimiendo] = useState(null)
  const [compartiendo, setCompartiendo] = useState(false)

  useEffect(() => { cargar() }, [mes])

  const cargar = async () => {
    setCargando(true)
    const { data: emp } = await supabase.from('empleados').select('id, nombre, cargo').eq('empresa_id', getEmpresaId())
    const em = {}
    ;(emp || []).forEach(e => { em[e.id] = e })
    setEmpleadosMap(em)
    let query = supabase.from('nomina_pagos').select('*').eq('empresa_id', getEmpresaId()).order('fecha_pago', { ascending: false })
    if (mes) query = query.eq('periodo', mes)
    const { data } = await query
    setPagos(data || [])
    setCargando(false)
  }

  const imprimir = () => window.print()

  if (imprimiendo) {
    const emp = empleadosMap[imprimiendo.empleado_id] || {}
    const compartir = async () => {
      setCompartiendo(true)
      try { await generarYCompartirPDF('colilla-imprimible', `Colilla-${emp.nombre || ''}-${imprimiendo.periodo}`) }
      finally { setCompartiendo(false) }
    }
    return (
      <>
        <style>{`
          @media print { .no-print { display: none !important; } body { margin: 0; background: white; } }
          body { font-family: Arial, sans-serif; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #000; padding: 5px 8px; }
          th { background: #f0f0f0; font-weight: bold; text-align: center; }
          td { text-align: center; } td:first-child { text-align: left; }
        `}</style>
        <div className="no-print bg-gray-100 p-4 flex gap-3 items-center sticky top-0 z-10">
          <button onClick={() => setImprimiendo(null)} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-bold text-sm">← Volver</button>
          <button onClick={imprimir} className="bg-brand hover:bg-brand-dark text-white px-6 py-2 rounded-lg font-bold text-sm">Imprimir</button>
          <button onClick={compartir} disabled={compartiendo} className="bg-gray-800 hover:bg-gray-900 text-white px-6 py-2 rounded-lg font-bold text-sm disabled:opacity-50">
            {compartiendo ? 'Generando...' : '📤 Compartir'}
          </button>
        </div>
        <div id="colilla-imprimible" style={{ padding: '20px', maxWidth: '750px', margin: '0 auto', background: 'white' }}>
          <h2 style={{ fontWeight: 'bold', fontSize: '20px', marginBottom: '4px' }}>Colilla de pago — {emp.nombre}</h2>
          <p style={{ color: '#555', marginBottom: '16px' }}>{emp.cargo || ''} · Periodo {imprimiendo.periodo}</p>
          <table>
            <thead><tr><th>Concepto</th><th>Valor</th></tr></thead>
            <tbody>
              <tr><td>Salario base</td><td>${imprimiendo.salario_base.toLocaleString('es-CO')}</td></tr>
              {(imprimiendo.detalle_descuentos || []).map((d, i) => (
                <tr key={i}><td>{d.tipo} ({d.fecha})</td><td>-${d.valor.toLocaleString('es-CO')}</td></tr>
              ))}
              <tr><td>Deduccion salud ({imprimiendo.salario_base ? ((imprimiendo.deduccion_salud / imprimiendo.salario_base) * 100).toFixed(1) : 0}%)</td><td>-${imprimiendo.deduccion_salud.toLocaleString('es-CO')}</td></tr>
              <tr><td>Deduccion pension ({imprimiendo.salario_base ? ((imprimiendo.deduccion_pension / imprimiendo.salario_base) * 100).toFixed(1) : 0}%)</td><td>-${imprimiendo.deduccion_pension.toLocaleString('es-CO')}</td></tr>
              <tr><td>Comision</td><td>+${imprimiendo.comision.toLocaleString('es-CO')}</td></tr>
            </tbody>
          </table>
          <p style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '18px', marginTop: '12px' }}>Neto a pagar: ${imprimiendo.neto_a_pagar.toLocaleString('es-CO')}</p>
        </div>
      </>
    )
  }

  return (
    <div>
      <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
        <label className="text-xs font-bold text-gray-600 block mb-1">Mes (vacio = todos)</label>
        <input type="month" value={mes} onChange={e => setMes(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
      </div>
      {cargando ? (
        <p className="text-gray-400 text-center py-10">Cargando...</p>
      ) : pagos.length === 0 ? (
        <p className="text-gray-400 text-center py-10">Sin nominas pagadas</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
          {pagos.map(p => (
            <div key={p.id} className="p-4 flex justify-between items-center">
              <div>
                <p className="font-bold text-gray-800">{empleadosMap[p.empleado_id]?.nombre || 'Empleado'}</p>
                <p className="text-xs text-gray-500">{p.periodo} · Neto ${p.neto_a_pagar.toLocaleString('es-CO')}</p>
              </div>
              <button onClick={() => setImprimiendo(p)} className="text-xs bg-gray-100 px-3 py-2 rounded-lg font-bold text-gray-600">Ver / Imprimir</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
