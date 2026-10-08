'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { generarYCompartirPDF } from '@/lib/compartir'
import { puedeVerModulo } from '@/lib/permisos'
import { PageHeader } from '@/components/ui'
import InputDinero from '@/components/InputDinero'

const mesActual = () => obtenerFechaActual().slice(0, 7)
const fmt = (v) => `$${Math.round(v || 0).toLocaleString('es-CO')}`
const NOMBRE_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const nombrePeriodo = (mes) => { const [y, m] = mes.split('-').map(Number); return `${NOMBRE_MES[m - 1]} ${y}` }

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
  { id: 'novedades', nombre: 'Novedades del mes' },
  { id: 'prestamos', nombre: 'Préstamos' },
  { id: 'nomina', nombre: 'Nómina del mes' },
  { id: 'historial', nombre: 'Colillas' },
]

const inputCls = 'w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none'

// Descuentos que salen solos de la operacion: descuadres de caja en
// liquidacion, consumo propio, prestamos en ruta (gasto "Prestamo al vendedor"
// de la liquidacion/kiosco) y prestamos registrados en Gastos Admin.
const cargarDescuentosPorEmpleado = async (empleados, mes) => {
  const { inicio, fin } = rangoMes(mes)
  const empresaId = getEmpresaId()
  const empleadoIds = empleados.map(e => e.id)
  const vendedorIds = empleados.filter(e => e.vendedor_id).map(e => e.vendedor_id)
  const empleadoPorVendedor = {}
  empleados.forEach(e => { if (e.vendedor_id) empleadoPorVendedor[e.vendedor_id] = e.id })

  const vacio = Promise.resolve({ data: [] })
  const [{ data: liq }, { data: prestamosGastos }, { data: consumos }, { data: prestamosRuta }, { data: transfVencidas }] = await Promise.all([
    vendedorIds.length > 0
      ? supabase.from('liquidaciones_detalle').select('vendedor_id, diferencia, fecha').in('vendedor_id', vendedorIds).lt('diferencia', 0).gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', empresaId)
      : vacio,
    empleadoIds.length > 0
      ? supabase.from('gastos_admin').select('empleado_id, valor, fecha, categoria').in('empleado_id', empleadoIds).ilike('categoria', '%restamo%').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', empresaId)
      : vacio,
    empleadoIds.length > 0
      ? supabase.from('consumos_empleado').select('empleado_id, vendedor_id, venta_id, valor, fecha').or(`empleado_id.in.(${empleadoIds.join(',')})${vendedorIds.length ? `,vendedor_id.in.(${vendedorIds.join(',')})` : ''}`).gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', empresaId)
      : vacio,
    vendedorIds.length > 0
      ? supabase.from('liquidaciones_gastos').select('vendedor_id, valor, fecha, categoria').in('vendedor_id', vendedorIds).ilike('categoria', '%restamo%').gte('fecha', inicio).lte('fecha', fin).eq('empresa_id', empresaId)
      : vacio,
    // Transferencias que el vendedor reporto y no llegaron antes de la fecha
    // limite acordada: se le descuentan (sin importar el mes en que vencieron).
    vendedorIds.length > 0
      ? supabase.from('transferencias_ruta').select('id, vendedor_id, valor, fecha, fecha_limite, referencia').in('vendedor_id', vendedorIds).eq('estado', 'por_verificar').lt('fecha_limite', obtenerFechaActual()).eq('empresa_id', empresaId)
      : vacio,
  ])

  const porEmpleado = {}
  empleados.forEach(e => { porEmpleado[e.id] = { total: 0, detalle: [] } })
  const agregar = (empId, concepto, fecha, valor, extra = {}) => {
    if (!empId || !porEmpleado[empId] || !valor) return
    porEmpleado[empId].detalle.push({ concepto, fecha, valor, ...extra })
    porEmpleado[empId].total += valor
  }
  ;(liq || []).forEach(l => agregar(empleadoPorVendedor[l.vendedor_id], 'Descuadre de caja', l.fecha, Math.abs(l.diferencia)))
  ;(prestamosGastos || []).forEach(g => agregar(g.empleado_id, 'Préstamo (Gastos Admin)', g.fecha, g.valor || 0))
  // Productos: lo que compro en Ventas con descuento de nomina; consumo propio:
  // lo que se registro en la liquidacion de su ruta.
  ;(consumos || []).forEach(c => agregar(c.empleado_id || empleadoPorVendedor[c.vendedor_id], c.venta_id ? 'Productos' : 'Consumo propio', c.fecha, c.valor || 0))
  ;(prestamosRuta || []).forEach(g => agregar(empleadoPorVendedor[g.vendedor_id], 'Préstamo en ruta', g.fecha, g.valor || 0))
  ;(transfVencidas || []).forEach(t => agregar(empleadoPorVendedor[t.vendedor_id], `Transferencia no recibida${t.referencia ? ` ref ${t.referencia}` : ''}`, t.fecha, Number(t.valor) || 0, { transferenciaId: t.id }))
  Object.values(porEmpleado).forEach(p => p.detalle.sort((a, b) => a.fecha.localeCompare(b.fecha)))
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
    const utilidadNeta = ventas - (gastoPorRuta[r.id] || 0)
    const meta = metaPorRuta[r.id] || 0
    const pctMeta = meta > 0 ? (ventas / meta) * 100 : 0
    comisionPorRuta[r.id] = calcularComision(pctMeta, utilidadNeta, rangosData || []).comision
  })
  return comisionPorRuta
}

// Prestamos con su saldo y numero de cuotas pagadas.
const cargarPrestamos = async () => {
  const empresaId = getEmpresaId()
  const [{ data: prestamos }, { data: abonos }] = await Promise.all([
    supabase.from('nomina_prestamos').select('*').eq('empresa_id', empresaId).order('fecha', { ascending: false }),
    supabase.from('nomina_prestamos_abonos').select('*').eq('empresa_id', empresaId).order('fecha'),
  ])
  return (prestamos || []).map(p => {
    const suyos = (abonos || []).filter(a => a.prestamo_id === p.id)
    const pagado = suyos.reduce((s, a) => s + Number(a.valor), 0)
    return { ...p, abonos: suyos, pagado, saldo: Math.max(0, Number(p.monto) - pagado), cuotasPagadas: suyos.filter(a => a.origen === 'nomina').length }
  })
}

export default function Nomina() {
  const [usuario, setUsuario] = useState(null)
  const [vista, setVista] = useState('empleados')
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (!puedeVerModulo(parsed, 'nomina', ['admin'])) { router.push('/despacho'); return }
    setUsuario(parsed)
  }, [])

  if (!usuario) return null

  return (
    <div>
      <PageHeader title="Nómina" subtitle="Empleados, novedades, préstamos y pagos" />
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
        {vista === 'novedades' && <TabNovedades usuario={usuario} />}
        {vista === 'prestamos' && <TabPrestamos usuario={usuario} />}
        {vista === 'nomina' && <TabNominaDelMes usuario={usuario} />}
        {vista === 'historial' && <TabHistorial />}
      </div>
    </div>
  )
}

const empleadoVacio = () => ({ id: null, nombre: '', documento: '', cargo: '', salario_base: '', fecha_inicio: '', vendedor_id: '', es_mano_obra_directa: false })

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
      documento: form.documento || null,
      cargo: form.cargo || null,
      salario_base: parseFloat(form.salario_base) || 0,
      fecha_inicio: form.fecha_inicio || null,
      vendedor_id: form.vendedor_id || null,
      es_mano_obra_directa: !!form.es_mano_obra_directa,
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Nombre</label>
              <input type="text" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Cédula</label>
              <input type="text" value={form.documento} onChange={e => setForm({ ...form, documento: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Cargo</label>
              <input type="text" value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Salario base</label>
              <InputDinero value={form.salario_base} onChange={e => setForm({ ...form, salario_base: e.target.value })} className={`${inputCls} font-bold`} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Fecha de inicio</label>
              <input type="date" value={form.fecha_inicio} onChange={e => setForm({ ...form, fecha_inicio: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Vendedor ligado (opcional)</label>
              <select value={form.vendedor_id} onChange={e => setForm({ ...form, vendedor_id: e.target.value })} className={inputCls}>
                <option value="">Ninguno</option>
                {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between mb-3 bg-gray-50 rounded-xl px-3 py-2">
            <div>
              <p className="text-sm font-bold text-gray-700">Mano de obra directa</p>
              <p className="text-xs text-gray-400">Su salario cuenta como costo variable de producción, no gasto fijo</p>
            </div>
            <button
              onClick={() => setForm({ ...form, es_mano_obra_directa: !form.es_mano_obra_directa })}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors shrink-0 ${form.es_mano_obra_directa ? 'bg-brand/10 text-brand' : 'bg-gray-200 text-gray-600'}`}>
              {form.es_mano_obra_directa ? 'Sí' : 'No'}
            </button>
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
            <div key={e.id} className="p-4 flex justify-between items-center gap-3">
              <div className="min-w-0">
                <p className="font-bold text-gray-800">{e.nombre} {!e.activo && <span className="text-xs text-gray-400">(inactivo)</span>}</p>
                <p className="text-xs text-gray-500">
                  {e.cargo || 'Sin cargo'} · {fmt(e.salario_base)}{e.documento ? ` · CC ${e.documento}` : ''}{e.vendedores?.nombre ? ` · ${e.vendedores.nombre}` : ''}{e.es_mano_obra_directa ? ' · MOD' : ''}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => setForm({ id: e.id, nombre: e.nombre, documento: e.documento || '', cargo: e.cargo || '', salario_base: String(e.salario_base || 0), fecha_inicio: e.fecha_inicio || '', vendedor_id: e.vendedor_id || '', es_mano_obra_directa: !!e.es_mano_obra_directa })}
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

const novedadVacia = () => ({ empleadoId: '', tipo: 'bonificacion', concepto: '', valor: '', salarial: false })

// Novedades del mes: lo automatico (descuadres, consumos, prestamos en ruta)
// y lo que se agrega a mano (bonificaciones y descuentos).
function TabNovedades({ usuario }) {
  const [mes, setMes] = useState(mesActual())
  const [empleados, setEmpleados] = useState([])
  const [automaticos, setAutomaticos] = useState({})
  const [novedades, setNovedades] = useState([])
  const [pagados, setPagados] = useState({})
  const [cargando, setCargando] = useState(true)
  const [form, setForm] = useState(novedadVacia())
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { cargar() }, [mes])

  const cargar = async () => {
    setCargando(true)
    const empresaId = getEmpresaId()
    const [{ data: emp }, { data: nov }, { data: pag }] = await Promise.all([
      supabase.from('empleados').select('*').eq('activo', true).eq('empresa_id', empresaId).order('nombre'),
      supabase.from('nomina_novedades').select('*').eq('empresa_id', empresaId).eq('periodo', mes).order('created_at'),
      supabase.from('nomina_pagos').select('empleado_id').eq('empresa_id', empresaId).eq('periodo', mes),
    ])
    const lista = emp || []
    setEmpleados(lista)
    setNovedades(nov || [])
    setPagados(Object.fromEntries((pag || []).map(p => [p.empleado_id, true])))
    setAutomaticos(await cargarDescuentosPorEmpleado(lista, mes))
    setCargando(false)
  }

  const agregar = async () => {
    const valor = parseFloat(form.valor)
    if (!form.empleadoId || !form.concepto.trim() || !(valor > 0)) { alert('Elige empleado, escribe el concepto y el valor'); return }
    if (pagados[form.empleadoId]) { alert('La nómina de este empleado ya se pagó este mes; la novedad no entraría.'); return }
    setGuardando(true)
    const { error } = await supabase.from('nomina_novedades').insert({
      empresa_id: getEmpresaId(), empleado_id: form.empleadoId, periodo: mes, tipo: form.tipo,
      concepto: form.concepto.trim(), valor, salarial: form.tipo === 'bonificacion' && form.salarial, registrado_por: usuario.nombre,
    })
    setGuardando(false)
    if (error) { alert('Error: ' + error.message); return }
    setForm({ ...novedadVacia(), empleadoId: form.empleadoId, tipo: form.tipo })
    cargar()
  }

  const quitar = async (n) => {
    if (pagados[n.empleado_id]) { alert('La nómina de este empleado ya se pagó; no se puede quitar.'); return }
    if (!confirm(`¿Quitar "${n.concepto}" (${fmt(n.valor)})?`)) return
    const { error } = await supabase.from('nomina_novedades').delete().eq('id', n.id)
    if (error) { alert('Error: ' + error.message); return }
    cargar()
  }

  return (
    <div>
      <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
        <label className="text-xs font-bold text-gray-600 block mb-1">Mes</label>
        <input type="month" value={mes} onChange={e => setMes(e.target.value)} className={inputCls} />
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
        <p className="font-black text-gray-700 mb-3">Agregar bonificación o descuento</p>
        <div className="grid grid-cols-2 gap-2 mb-2">
          {[{ id: 'bonificacion', nombre: '+ Bonificación' }, { id: 'descuento', nombre: '− Descuento' }].map(t => (
            <button key={t.id} onClick={() => setForm({ ...form, tipo: t.id })}
              className={`py-2 rounded-xl text-sm font-bold ${form.tipo === t.id ? (t.id === 'bonificacion' ? 'bg-emerald-600 text-white' : 'bg-brand text-white') : 'bg-gray-100 text-gray-600'}`}>
              {t.nombre}
            </button>
          ))}
        </div>
        <select value={form.empleadoId} onChange={e => setForm({ ...form, empleadoId: e.target.value })} className={`${inputCls} mb-2`}>
          <option value="">Empleado</option>
          {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}{pagados[e.id] ? ' (ya pagado)' : ''}</option>)}
        </select>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <input type="text" placeholder={form.tipo === 'bonificacion' ? 'Concepto (ej. Bono por meta)' : 'Concepto (ej. Faltante de herramienta)'}
            value={form.concepto} onChange={e => setForm({ ...form, concepto: e.target.value })} className={`${inputCls} col-span-2`} />
          <InputDinero placeholder="Valor" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} className={`${inputCls} font-bold`} />
        </div>
        {form.tipo === 'bonificacion' && (
          // En Maissy las bonificaciones son no salariales: no suman a la base
          // de salud y pension (la columna `salarial` queda por si cambia).
          <p className="text-xs text-gray-400 mb-2">Bonificación no salarial: suma al neto, no a la base de salud y pensión.</p>
        )}
        <button onClick={agregar} disabled={guardando} className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-2.5 rounded-xl disabled:opacity-50">
          {guardando ? 'Guardando...' : 'Agregar'}
        </button>
      </div>

      {cargando ? (
        <p className="text-gray-400 text-center py-10">Cargando...</p>
      ) : (
        empleados.map(e => {
          const auto = automaticos[e.id] || { total: 0, detalle: [] }
          const suyas = novedades.filter(n => n.empleado_id === e.id)
          const bonos = suyas.filter(n => n.tipo === 'bonificacion').reduce((s, n) => s + Number(n.valor), 0)
          const desc = suyas.filter(n => n.tipo === 'descuento').reduce((s, n) => s + Number(n.valor), 0) + auto.total
          if (suyas.length === 0 && auto.detalle.length === 0) return null
          return (
            <div key={e.id} className="bg-white rounded-xl shadow-sm p-4 mb-3">
              <div className="flex justify-between items-baseline mb-2">
                <p className="font-black text-gray-900">{e.nombre}{pagados[e.id] && <span className="text-xs text-gray-400 font-bold"> · pagado</span>}</p>
                <p className="text-xs font-bold">
                  {bonos > 0 && <span className="text-emerald-600">+{fmt(bonos)} </span>}
                  {desc > 0 && <span className="text-brand">−{fmt(desc)}</span>}
                </p>
              </div>
              <div className="divide-y divide-gray-100 text-sm">
                {suyas.map(n => (
                  <div key={n.id} className="py-1.5 flex justify-between items-center gap-2">
                    <span className="text-gray-700 min-w-0">{n.concepto}{n.salarial ? <span className="text-xs text-gray-400"> · salarial</span> : ''}</span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className={`font-bold ${n.tipo === 'bonificacion' ? 'text-emerald-600' : 'text-brand'}`}>{n.tipo === 'bonificacion' ? '+' : '−'}{fmt(n.valor)}</span>
                      {!pagados[e.id] && <button onClick={() => quitar(n)} className="text-xs text-gray-400 font-bold">Quitar</button>}
                    </span>
                  </div>
                ))}
                {auto.detalle.map((d, i) => (
                  <div key={`a${i}`} className="py-1.5 flex justify-between items-center gap-2">
                    <span className="text-gray-600 min-w-0">{d.concepto} <span className="text-xs text-gray-400">· {d.fecha} · automático</span></span>
                    <span className="font-bold text-brand shrink-0">−{fmt(d.valor)}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })
      )}
      {!cargando && empleados.every(e => !novedades.some(n => n.empleado_id === e.id) && !(automaticos[e.id]?.detalle.length)) && (
        <p className="text-gray-400 text-center py-6 text-sm">Sin novedades este mes</p>
      )}
      <p className="text-xs text-gray-400 px-1 mt-2">Los automáticos salen de la operación: descuadres de caja en liquidación, productos comprados en Ventas con descuento de nómina, consumo propio en ruta y préstamos dados en ruta. Las cuotas de préstamos se ven en Préstamos y se descuentan en Nómina del mes.</p>
    </div>
  )
}

const prestamoVacio = () => ({ empleadoId: '', fecha: obtenerFechaActual(), monto: '', numCuotas: '1', concepto: '', cuentaId: '' })

function TabPrestamos({ usuario }) {
  const [empleados, setEmpleados] = useState([])
  const [cuentas, setCuentas] = useState([])
  const [prestamos, setPrestamos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [form, setForm] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [expandido, setExpandido] = useState(null)
  const [abono, setAbono] = useState(null)
  const [verPagados, setVerPagados] = useState(false)

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setCargando(true)
    const empresaId = getEmpresaId()
    const [{ data: emp }, { data: cue }, lista] = await Promise.all([
      supabase.from('empleados').select('id, nombre, activo').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('cuentas').select('id, nombre').eq('estado', true).eq('empresa_id', empresaId).order('nombre'),
      cargarPrestamos(),
    ])
    setEmpleados(emp || [])
    setCuentas(cue || [])
    setPrestamos(lista)
    setCargando(false)
  }

  const cuotaCalculada = (f) => {
    const monto = parseFloat(f.monto) || 0
    const n = parseInt(f.numCuotas) || 0
    return monto > 0 && n > 0 ? Math.ceil(monto / n / 100) * 100 : 0
  }

  const guardar = async () => {
    const monto = parseFloat(form.monto)
    const numCuotas = parseInt(form.numCuotas)
    if (!form.empleadoId || !(monto > 0) || !(numCuotas > 0)) { alert('Elige empleado, monto y número de cuotas'); return }
    const empleado = empleados.find(e => e.id === form.empleadoId)
    setGuardando(true)
    const empresaId = getEmpresaId()
    const { error } = await supabase.from('nomina_prestamos').insert({
      empresa_id: empresaId, empleado_id: form.empleadoId, fecha: form.fecha, monto, num_cuotas: numCuotas,
      valor_cuota: cuotaCalculada(form), concepto: form.concepto.trim() || null, cuenta_id: form.cuentaId || null, registrado_por: usuario.nombre,
    })
    if (error) { alert('Error: ' + error.message); setGuardando(false); return }
    if (form.cuentaId) {
      const { error: errTes } = await supabase.from('movimientos_tesoreria').insert({
        empresa_id: empresaId, cuenta_id: form.cuentaId, fecha: form.fecha, tipo: 'salida', monto,
        concepto: `Préstamo a ${empleado?.nombre || 'empleado'}${form.concepto.trim() ? ' - ' + form.concepto.trim() : ''}`, referencia_tipo: 'prestamo_empleado', referencia_id: null,
      })
      if (errTes) alert('El préstamo se guardó, pero no se pudo registrar la salida de caja: ' + errTes.message)
    }
    setGuardando(false)
    setForm(null)
    cargar()
  }

  // Abono por fuera de nomina (el empleado paga en efectivo, por ejemplo).
  const guardarAbono = async () => {
    const p = prestamos.find(x => x.id === abono.prestamoId)
    const valor = parseFloat(abono.valor)
    if (!(valor > 0) || valor > p.saldo + 0.5) { alert(`El abono debe ser mayor a 0 y no pasar el saldo (${fmt(p.saldo)})`); return }
    setGuardando(true)
    const empresaId = getEmpresaId()
    const fecha = obtenerFechaActual()
    const { error } = await supabase.from('nomina_prestamos_abonos').insert({
      empresa_id: empresaId, prestamo_id: p.id, periodo: fecha.slice(0, 7), fecha, valor, origen: 'manual', registrado_por: usuario.nombre,
    })
    if (error) { alert('Error: ' + error.message); setGuardando(false); return }
    if (valor >= p.saldo - 0.5) await supabase.from('nomina_prestamos').update({ estado: 'pagado' }).eq('id', p.id)
    if (abono.cuentaId) {
      await supabase.from('movimientos_tesoreria').insert({
        empresa_id: empresaId, cuenta_id: abono.cuentaId, fecha, tipo: 'entrada', monto: valor,
        concepto: `Abono préstamo - ${empleados.find(e => e.id === p.empleado_id)?.nombre || ''}`, referencia_tipo: 'prestamo_empleado', referencia_id: null,
      })
    }
    setGuardando(false)
    setAbono(null)
    cargar()
  }

  const visibles = prestamos.filter(p => verPagados || p.estado === 'activo')
  const totalPorCobrar = prestamos.filter(p => p.estado === 'activo').reduce((s, p) => s + p.saldo, 0)
  const nombreEmp = (id) => empleados.find(e => e.id === id)?.nombre || 'Empleado'

  return (
    <div>
      <div className="bg-white rounded-xl p-4 shadow-sm mb-4 flex justify-between items-center">
        <div>
          <p className="text-xs text-gray-500">Préstamos por cobrar</p>
          <p className="text-2xl font-black text-gray-800">{fmt(totalPorCobrar)}</p>
        </div>
        {!form && (
          <button onClick={() => setForm(prestamoVacio())} className="bg-brand hover:bg-brand-dark text-white text-sm font-bold px-4 py-2.5 rounded-xl">+ Nuevo préstamo</button>
        )}
      </div>

      {form && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <p className="font-black text-gray-700 mb-3">Nuevo préstamo</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Empleado</label>
              <select value={form.empleadoId} onChange={e => setForm({ ...form, empleadoId: e.target.value })} className={inputCls}>
                <option value="">Selecciona</option>
                {empleados.filter(e => e.activo).map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Fecha</label>
              <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Monto prestado</label>
              <InputDinero value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} className={`${inputCls} font-bold`} />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Número de cuotas (meses)</label>
              <input type="number" min="1" value={form.numCuotas} onChange={e => setForm({ ...form, numCuotas: e.target.value })} className={`${inputCls} font-bold`} />
            </div>
          </div>
          {cuotaCalculada(form) > 0 && (
            <p className="text-sm text-gray-600 mb-3">Cuota mensual: <span className="font-black text-gray-800">{fmt(cuotaCalculada(form))}</span></p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Concepto (opcional)</label>
              <input type="text" value={form.concepto} onChange={e => setForm({ ...form, concepto: e.target.value })} placeholder="Ej. Calamidad doméstica" className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">¿De qué cuenta salió la plata?</label>
              <select value={form.cuentaId} onChange={e => setForm({ ...form, cuentaId: e.target.value })} className={inputCls}>
                <option value="">No registrar en caja</option>
                {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setForm(null)} className="flex-1 bg-gray-100 text-gray-600 font-bold py-3 rounded-xl">Cancelar</button>
            <button onClick={guardar} disabled={guardando} className="flex-1 bg-brand hover:bg-brand-dark text-white font-black py-3 rounded-xl disabled:opacity-50">
              {guardando ? 'Guardando...' : 'Registrar préstamo'}
            </button>
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-xs text-gray-500 mb-2 px-1 cursor-pointer">
        <input type="checkbox" checked={verPagados} onChange={e => setVerPagados(e.target.checked)} className="accent-brand" />
        Ver también los préstamos ya pagados
      </label>

      {cargando ? (
        <p className="text-gray-400 text-center py-10">Cargando...</p>
      ) : visibles.length === 0 ? (
        <p className="text-gray-400 text-center py-10">Sin préstamos {verPagados ? '' : 'activos'}</p>
      ) : (
        <div className="space-y-3">
          {visibles.map(p => (
            <div key={p.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
              <button onClick={() => setExpandido(expandido === p.id ? null : p.id)} className="w-full p-4 flex justify-between items-center text-left gap-3">
                <div className="min-w-0">
                  <p className="font-black text-gray-900">{nombreEmp(p.empleado_id)}</p>
                  <p className="text-xs text-gray-500">
                    {fmt(p.monto)} el {p.fecha}{p.concepto ? ` · ${p.concepto}` : ''} · cuota {fmt(p.valor_cuota)} · {p.cuotasPagadas} de {p.num_cuotas} cuotas
                  </p>
                  <div className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (p.pagado / Number(p.monto)) * 100)}%` }} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-lg font-black ${p.estado === 'pagado' ? 'text-emerald-600' : 'text-brand'}`}>{p.estado === 'pagado' ? 'Pagado' : fmt(p.saldo)}</p>
                  {p.estado !== 'pagado' && <p className="text-[10px] text-gray-400">saldo</p>}
                </div>
              </button>
              {expandido === p.id && (
                <div className="border-t border-gray-100 p-4 bg-gray-50">
                  {p.abonos.length === 0 ? (
                    <p className="text-sm text-gray-400 mb-3">Todavía sin abonos. La primera cuota se descuenta en la Nómina del mes.</p>
                  ) : (
                    <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100 text-sm mb-3">
                      {p.abonos.map(a => (
                        <div key={a.id} className="px-3 py-1.5 flex justify-between">
                          <span className="text-gray-600">{a.fecha} · {a.origen === 'nomina' ? `Nómina ${a.periodo}` : 'Abono directo'}</span>
                          <span className="font-bold text-gray-800">{fmt(a.valor)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {p.estado === 'activo' && (
                    abono?.prestamoId === p.id ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <InputDinero placeholder="Valor del abono" value={abono.valor} onChange={e => setAbono({ ...abono, valor: e.target.value })} className={`${inputCls} font-bold`} />
                        <select value={abono.cuentaId} onChange={e => setAbono({ ...abono, cuentaId: e.target.value })} className={inputCls}>
                          <option value="">No registrar en caja</option>
                          {cuentas.map(c => <option key={c.id} value={c.id}>Entra a {c.nombre}</option>)}
                        </select>
                        <div className="flex gap-2">
                          <button onClick={() => setAbono(null)} className="flex-1 bg-gray-200 text-gray-600 text-sm font-bold rounded-xl">Cancelar</button>
                          <button onClick={guardarAbono} disabled={guardando} className="flex-1 bg-brand text-white text-sm font-bold rounded-xl disabled:opacity-50">Guardar</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setAbono({ prestamoId: p.id, valor: '', cuentaId: '' })} className="text-xs bg-white border border-gray-200 text-gray-700 font-bold px-3 py-2 rounded-lg">
                        Registrar abono directo
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TabNominaDelMes({ usuario }) {
  const [mes, setMes] = useState(mesActual())
  const [empleados, setEmpleados] = useState([])
  const [automaticos, setAutomaticos] = useState({})
  const [novedades, setNovedades] = useState([])
  const [prestamos, setPrestamos] = useState([])
  const [cuotasEditadas, setCuotasEditadas] = useState({})
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
    const empresaId = getEmpresaId()
    const [{ data: emp }, { data: vend }, { data: pagosData }, { data: empresa }, { data: nov }, listaPrestamos] = await Promise.all([
      supabase.from('empleados').select('*').eq('activo', true).eq('empresa_id', empresaId).order('nombre'),
      supabase.from('vendedores').select('id, ruta_id').eq('empresa_id', empresaId),
      supabase.from('nomina_pagos').select('*').eq('periodo', mes).eq('empresa_id', empresaId),
      supabase.from('empresas').select('salud_pct, pension_pct').eq('id', empresaId).maybeSingle(),
      supabase.from('nomina_novedades').select('*').eq('empresa_id', empresaId).eq('periodo', mes),
      cargarPrestamos(),
    ])
    const lista = emp || []
    setEmpleados(lista)
    setVendedores(vend || [])
    setSaludPct(empresa?.salud_pct ?? 4)
    setPensionPct(empresa?.pension_pct ?? 4)
    setNovedades(nov || [])
    setPrestamos(listaPrestamos)
    setCuotasEditadas({})
    const pm = {}
    ;(pagosData || []).forEach(p => { pm[p.empleado_id] = p })
    setPagos(pm)
    const [desc, comPorRuta] = await Promise.all([cargarDescuentosPorEmpleado(lista, mes), cargarComisionPorRuta(mes)])
    setAutomaticos(desc)
    setComisionPorRuta(comPorRuta)
    setCargando(false)
  }

  // Prestamos que descuentan cuota este mes: activos, prestados hasta el fin
  // del mes y sin cuota de nomina ya cobrada en este mes.
  const prestamosDelMes = (empleadoId) => {
    const { fin } = rangoMes(mes)
    return prestamos
      .filter(p => p.empleado_id === empleadoId && p.estado === 'activo' && p.saldo > 0 && p.fecha <= fin && !p.abonos.some(a => a.origen === 'nomina' && a.periodo === mes))
      .map(p => {
        const sugerida = Math.min(Number(p.valor_cuota), p.saldo)
        const editada = cuotasEditadas[p.id]
        const cuota = editada === undefined || editada === '' ? sugerida : Math.min(Math.max(0, parseFloat(editada) || 0), p.saldo)
        return { ...p, cuota, sugerida, numeroCuota: p.cuotasPagadas + 1 }
      })
  }

  const calcularFila = (e) => {
    const salario = Number(e.salario_base) || 0
    const suyas = novedades.filter(n => n.empleado_id === e.id)
    const bonos = suyas.filter(n => n.tipo === 'bonificacion')
    const bonosSalariales = bonos.filter(n => n.salarial).reduce((s, n) => s + Number(n.valor), 0)
    const baseAportes = salario + bonosSalariales
    const salud = baseAportes * (saludPct / 100)
    const pension = baseAportes * (pensionPct / 100)
    const vendedor = vendedores.find(v => v.id === e.vendedor_id)
    const comision = vendedor?.ruta_id ? (comisionPorRuta[vendedor.ruta_id] || 0) : 0
    const auto = automaticos[e.id] || { total: 0, detalle: [] }
    const prest = prestamosDelMes(e.id)

    const devengos = [{ concepto: 'Salario básico', valor: salario }]
    if (comision > 0) devengos.push({ concepto: 'Comisión', valor: comision })
    bonos.forEach(n => devengos.push({ concepto: `${n.concepto}${n.salarial ? ' (salarial)' : ''}`, valor: Number(n.valor) }))

    const deducciones = [
      { concepto: `Salud (${saludPct}%)`, valor: salud, aporte: true },
      { concepto: `Pensión (${pensionPct}%)`, valor: pension, aporte: true },
    ]
    auto.detalle.forEach(d => deducciones.push({ concepto: `${d.concepto} (${d.fecha})`, valor: d.valor, transferenciaId: d.transferenciaId }))
    prest.filter(p => p.cuota > 0).forEach(p => deducciones.push({
      concepto: `Cuota préstamo ${p.numeroCuota} de ${p.num_cuotas}${p.concepto ? ` · ${p.concepto}` : ''}`, valor: p.cuota, prestamoId: p.id,
    }))
    suyas.filter(n => n.tipo === 'descuento').forEach(n => deducciones.push({ concepto: n.concepto, valor: Number(n.valor) }))

    const totalDevengado = devengos.reduce((s, d) => s + d.valor, 0)
    const totalDeducciones = deducciones.reduce((s, d) => s + d.valor, 0)
    return {
      devengos, deducciones, prestamos: prest, comision, salud, pension,
      bonificaciones: bonos.reduce((s, n) => s + Number(n.valor), 0),
      otrosDescuentos: totalDeducciones - salud - pension,
      totalDevengado, totalDeducciones, neto: totalDevengado - totalDeducciones,
    }
  }

  const marcarPagado = async (e) => {
    const fila = calcularFila(e)
    if (!cuentaId) { alert('Selecciona la cuenta desde la que se paga la nómina'); return }
    if (fila.neto < 0) { alert(`El neto da negativo (${fmt(fila.neto)}). Baja la cuota del préstamo o revisa los descuentos.`); return }
    if (!confirm(`Pagar nómina de ${e.nombre} (${nombrePeriodo(mes)}) por ${fmt(fila.neto)}?`)) return
    setPagando(e.id)
    const empresaId = getEmpresaId()
    const fecha = obtenerFechaActual()
    const prestamosAplicados = fila.prestamos.filter(p => p.cuota > 0).map(p => ({
      prestamo_id: p.id, concepto: p.concepto || 'Préstamo', cuota: p.cuota, numero: p.numeroCuota, num_cuotas: p.num_cuotas, saldo_despues: Math.max(0, p.saldo - p.cuota),
    }))
    const { data: pago, error } = await supabase.from('nomina_pagos').insert({
      empresa_id: empresaId,
      empleado_id: e.id,
      periodo: mes,
      salario_base: Number(e.salario_base) || 0,
      deduccion_salud: fila.salud,
      deduccion_pension: fila.pension,
      total_descuentos: fila.otrosDescuentos,
      total_bonificaciones: fila.bonificaciones,
      comision: fila.comision,
      neto_a_pagar: fila.neto,
      detalle_descuentos: fila.deducciones.filter(d => !d.aporte).map(d => ({ tipo: d.concepto, fecha: fecha, valor: d.valor })),
      detalle: { devengos: fila.devengos, deducciones: fila.deducciones.map(({ concepto, valor }) => ({ concepto, valor })), prestamos: prestamosAplicados, total_devengado: fila.totalDevengado, total_deducciones: fila.totalDeducciones },
      cuenta_id: cuentaId,
    }).select().single()
    if (error) { alert('Error: ' + error.message); setPagando(null); return }

    const fallos = []
    for (const p of prestamosAplicados) {
      const { error: errAbono } = await supabase.from('nomina_prestamos_abonos').insert({
        empresa_id: empresaId, prestamo_id: p.prestamo_id, periodo: mes, fecha, valor: p.cuota, origen: 'nomina', nomina_pago_id: pago.id, registrado_por: usuario.nombre,
      })
      if (errAbono) fallos.push('abono de préstamo')
      else if (p.saldo_despues <= 0.5) await supabase.from('nomina_prestamos').update({ estado: 'pagado' }).eq('id', p.prestamo_id)
    }
    const idsTransf = fila.deducciones.filter(d => d.transferenciaId).map(d => d.transferenciaId)
    if (idsTransf.length > 0) {
      const { error: errTransf } = await supabase.from('transferencias_ruta')
        .update({ estado: 'descontada', nomina_pago_id: pago.id }).in('id', idsTransf).eq('estado', 'por_verificar')
      if (errTransf) fallos.push('marcar transferencias descontadas')
    }
    const { error: errTesoreria } = await supabase.from('movimientos_tesoreria').insert({
      empresa_id: empresaId, cuenta_id: cuentaId, fecha, tipo: 'salida',
      monto: fila.neto, concepto: `Nómina ${mes} - ${e.nombre}`, referencia_tipo: 'nomina', referencia_id: pago.id,
    })
    if (errTesoreria) fallos.push('movimiento de caja/bancos')
    if (fallos.length) alert('La nómina quedó pagada, pero falló: ' + fallos.join(', ') + '. Avísale al admin.')
    setPagando(null)
    cargar()
  }

  const totalNomina = empleados.filter(e => !pagos[e.id]).reduce((s, e) => s + calcularFila(e).neto, 0)

  return (
    <div>
      <div className="bg-white rounded-xl p-4 shadow-sm mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-bold text-gray-600 block mb-1">Mes</label>
          <input type="month" value={mes} onChange={e => setMes(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-600 block mb-1">Cuenta desde la que se paga</label>
          <select value={cuentaId} onChange={e => setCuentaId(e.target.value)} className={inputCls}>
            <option value="">Selecciona cuenta</option>
            {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
      </div>

      {!cargando && empleados.some(e => !pagos[e.id]) && (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4 flex justify-between items-center">
          <p className="text-sm text-gray-600">Pendiente por pagar en {nombrePeriodo(mes)}</p>
          <p className="text-xl font-black text-gray-800">{fmt(totalNomina)}</p>
        </div>
      )}

      {cargando ? (
        <p className="text-gray-400 text-center py-10">Cargando...</p>
      ) : empleados.length === 0 ? (
        <p className="text-gray-400 text-center py-10">Sin empleados activos</p>
      ) : (
        empleados.map(e => {
          const yaPagado = pagos[e.id]
          const fila = calcularFila(e)
          const neto = yaPagado ? Number(yaPagado.neto_a_pagar) : fila.neto
          return (
            <div key={e.id} className="bg-white rounded-xl shadow-sm p-4 mb-3">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-black text-gray-900">{e.nombre}</p>
                  <p className="text-xs text-gray-500">{e.cargo || 'Sin cargo'}</p>
                </div>
                <div className="text-right">
                  <p className={`text-xl font-black ${neto < 0 ? 'text-red-600' : 'text-brand'}`}>{fmt(neto)}</p>
                  <p className="text-[10px] text-gray-400">neto a pagar</p>
                </div>
              </div>
              {yaPagado ? (
                <p className="text-center text-xs font-bold text-gray-400 bg-gray-100 rounded-lg py-2">Ya pagada ({new Date(yaPagado.fecha_pago).toLocaleDateString('es-CO')}) · la colilla está en Colillas</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mb-3">
                    <div>
                      <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-1">Devengado</p>
                      {fila.devengos.map((d, i) => (
                        <div key={i} className="flex justify-between gap-2 py-0.5"><span className="text-gray-600 min-w-0">{d.concepto}</span><span className="font-bold shrink-0">{fmt(d.valor)}</span></div>
                      ))}
                      <div className="flex justify-between border-t border-gray-100 mt-1 pt-1"><span className="font-bold text-gray-700">Total</span><span className="font-black">{fmt(fila.totalDevengado)}</span></div>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-brand uppercase tracking-wide mb-1">Deducciones</p>
                      {fila.deducciones.map((d, i) => (
                        <div key={i} className="flex justify-between gap-2 py-0.5"><span className="text-gray-600 min-w-0">{d.concepto}</span><span className="font-bold text-brand shrink-0">−{fmt(d.valor)}</span></div>
                      ))}
                      <div className="flex justify-between border-t border-gray-100 mt-1 pt-1"><span className="font-bold text-gray-700">Total</span><span className="font-black text-brand">−{fmt(fila.totalDeducciones)}</span></div>
                    </div>
                  </div>
                  {fila.prestamos.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                      {fila.prestamos.map(p => (
                        <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-gray-700 min-w-0">Préstamo {p.concepto ? `"${p.concepto}" ` : ''}· saldo {fmt(p.saldo)} · cuota este mes:</span>
                          <InputDinero value={cuotasEditadas[p.id] ?? String(p.sugerida)}
                            onChange={ev => setCuotasEditadas({ ...cuotasEditadas, [p.id]: ev.target.value })}
                            className="w-28 text-right border border-amber-300 rounded-lg px-2 py-1 text-sm font-bold text-gray-800 bg-white" />
                        </div>
                      ))}
                      <p className="text-[11px] text-gray-500 mt-1">Pon 0 si este mes no se descuenta cuota.</p>
                    </div>
                  )}
                  {usuario?.rol === 'admin' && (
                    <button onClick={() => marcarPagado(e)} disabled={pagando === e.id}
                      className="w-full bg-brand hover:bg-brand-dark text-white font-black py-3 rounded-xl disabled:opacity-50">
                      {pagando === e.id ? 'Pagando...' : `Pagar ${fmt(fila.neto)}`}
                    </button>
                  )}
                </>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

// Arma devengados/deducciones de un pago: los nuevos traen `detalle`; los
// pagos anteriores a este cambio se reconstruyen con sus columnas.
const desglosePago = (p) => {
  if (p.detalle?.devengos) return p.detalle
  const devengos = [{ concepto: 'Salario básico', valor: Number(p.salario_base) || 0 }]
  if (Number(p.comision) > 0) devengos.push({ concepto: 'Comisión', valor: Number(p.comision) })
  const deducciones = [
    { concepto: 'Salud', valor: Number(p.deduccion_salud) || 0 },
    { concepto: 'Pensión', valor: Number(p.deduccion_pension) || 0 },
    ...(p.detalle_descuentos || []).map(d => ({ concepto: `${d.tipo}${d.fecha ? ` (${d.fecha})` : ''}`, valor: Number(d.valor) || 0 })),
  ]
  return {
    devengos, deducciones, prestamos: [],
    total_devengado: devengos.reduce((s, d) => s + d.valor, 0),
    total_deducciones: deducciones.reduce((s, d) => s + d.valor, 0),
  }
}

function TabHistorial() {
  const [mes, setMes] = useState('')
  const [pagos, setPagos] = useState([])
  const [empleadosMap, setEmpleadosMap] = useState({})
  const [empresa, setEmpresa] = useState(null)
  const [cuentasMap, setCuentasMap] = useState({})
  const [cargando, setCargando] = useState(true)
  const [imprimiendo, setImprimiendo] = useState(null)
  const [compartiendo, setCompartiendo] = useState(false)

  useEffect(() => { cargar() }, [mes])

  const cargar = async () => {
    setCargando(true)
    const empresaId = getEmpresaId()
    const [{ data: emp }, { data: empr }, { data: cue }] = await Promise.all([
      supabase.from('empleados').select('id, nombre, cargo, documento').eq('empresa_id', empresaId),
      supabase.from('empresas').select('nombre, nit, direccion, ciudad, telefono').eq('id', empresaId).maybeSingle(),
      supabase.from('cuentas').select('id, nombre').eq('empresa_id', empresaId),
    ])
    setEmpleadosMap(Object.fromEntries((emp || []).map(e => [e.id, e])))
    setEmpresa(empr)
    setCuentasMap(Object.fromEntries((cue || []).map(c => [c.id, c.nombre])))
    let query = supabase.from('nomina_pagos').select('*').eq('empresa_id', empresaId).order('fecha_pago', { ascending: false })
    if (mes) query = query.eq('periodo', mes)
    const { data } = await query
    setPagos(data || [])
    setCargando(false)
  }

  if (imprimiendo) {
    const emp = empleadosMap[imprimiendo.empleado_id] || {}
    const d = desglosePago(imprimiendo)
    const filas = Math.max(d.devengos.length, d.deducciones.length)
    const compartir = async () => {
      setCompartiendo(true)
      try { await generarYCompartirPDF('colilla-imprimible', `Colilla-${emp.nombre || ''}-${imprimiendo.periodo}`) }
      finally { setCompartiendo(false) }
    }
    const celda = { border: '1px solid #999', padding: '5px 8px', fontSize: '12px' }
    const num = { ...celda, textAlign: 'right', whiteSpace: 'nowrap' }
    return (
      <>
        <style>{`@media print { .no-print { display: none !important; } body { margin: 0; background: white; } }`}</style>
        <div className="no-print bg-gray-100 p-4 flex gap-3 items-center sticky top-0 z-10">
          <button onClick={() => setImprimiendo(null)} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-bold text-sm">← Volver</button>
          <button onClick={() => window.print()} className="bg-brand hover:bg-brand-dark text-white px-6 py-2 rounded-lg font-bold text-sm">Imprimir</button>
          <button onClick={compartir} disabled={compartiendo} className="bg-gray-800 hover:bg-gray-900 text-white px-6 py-2 rounded-lg font-bold text-sm disabled:opacity-50">
            {compartiendo ? 'Generando...' : '📤 Compartir'}
          </button>
        </div>
        <div id="colilla-imprimible" style={{ padding: '24px', maxWidth: '780px', margin: '0 auto', background: 'white', color: '#111', fontFamily: 'Arial, sans-serif' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #111', paddingBottom: '10px', marginBottom: '12px' }}>
            <div>
              <p style={{ fontWeight: 'bold', fontSize: '18px', margin: 0 }}>{empresa?.nombre || ''}</p>
              <p style={{ fontSize: '11px', color: '#444', margin: '2px 0 0' }}>
                {empresa?.nit ? `NIT ${empresa.nit}` : ''}{empresa?.direccion ? ` · ${empresa.direccion}` : ''}{empresa?.ciudad ? ` · ${empresa.ciudad}` : ''}{empresa?.telefono ? ` · Tel ${empresa.telefono}` : ''}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontWeight: 'bold', fontSize: '14px', margin: 0 }}>COMPROBANTE DE PAGO DE NÓMINA</p>
              <p style={{ fontSize: '11px', color: '#444', margin: '2px 0 0' }}>Periodo: {nombrePeriodo(imprimiendo.periodo)}</p>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
            <tbody>
              <tr>
                <td style={celda}><b>Empleado:</b> {emp.nombre || ''}</td>
                <td style={celda}><b>Cédula:</b> {emp.documento || '—'}</td>
              </tr>
              <tr>
                <td style={celda}><b>Cargo:</b> {emp.cargo || '—'}</td>
                <td style={celda}><b>Fecha de pago:</b> {new Date(imprimiendo.fecha_pago).toLocaleDateString('es-CO')}{imprimiendo.cuenta_id && cuentasMap[imprimiendo.cuenta_id] ? ` · ${cuentasMap[imprimiendo.cuenta_id]}` : ''}</td>
              </tr>
            </tbody>
          </table>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#eee' }}>
                <th style={{ ...celda, textAlign: 'left' }}>Devengados</th>
                <th style={{ ...celda, textAlign: 'right' }}>Valor</th>
                <th style={{ ...celda, textAlign: 'left' }}>Deducciones</th>
                <th style={{ ...celda, textAlign: 'right' }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: filas }).map((_, i) => (
                <tr key={i}>
                  <td style={celda}>{d.devengos[i]?.concepto || ''}</td>
                  <td style={num}>{d.devengos[i] ? fmt(d.devengos[i].valor) : ''}</td>
                  <td style={celda}>{d.deducciones[i]?.concepto || ''}</td>
                  <td style={num}>{d.deducciones[i] ? fmt(d.deducciones[i].valor) : ''}</td>
                </tr>
              ))}
              <tr style={{ background: '#f6f6f6' }}>
                <td style={{ ...celda, fontWeight: 'bold' }}>Total devengado</td>
                <td style={{ ...num, fontWeight: 'bold' }}>{fmt(d.total_devengado)}</td>
                <td style={{ ...celda, fontWeight: 'bold' }}>Total deducciones</td>
                <td style={{ ...num, fontWeight: 'bold' }}>{fmt(d.total_deducciones)}</td>
              </tr>
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
            <div style={{ border: '2px solid #111', padding: '8px 14px' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold' }}>NETO A PAGAR: </span>
              <span style={{ fontSize: '18px', fontWeight: 'bold' }}>{fmt(imprimiendo.neto_a_pagar)}</span>
            </div>
          </div>

          {d.prestamos?.length > 0 && (
            <div style={{ marginTop: '14px' }}>
              <p style={{ fontWeight: 'bold', fontSize: '12px', margin: '0 0 4px' }}>Estado de préstamos</p>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#eee' }}>
                    <th style={{ ...celda, textAlign: 'left' }}>Préstamo</th>
                    <th style={{ ...celda, textAlign: 'center' }}>Cuota</th>
                    <th style={{ ...celda, textAlign: 'right' }}>Descontado</th>
                    <th style={{ ...celda, textAlign: 'right' }}>Saldo pendiente</th>
                  </tr>
                </thead>
                <tbody>
                  {d.prestamos.map((p, i) => (
                    <tr key={i}>
                      <td style={celda}>{p.concepto}</td>
                      <td style={{ ...celda, textAlign: 'center' }}>{p.numero} de {p.num_cuotas}</td>
                      <td style={num}>{fmt(p.cuota)}</td>
                      <td style={num}>{fmt(p.saldo_despues)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'flex', gap: '40px', marginTop: '50px' }}>
            <div style={{ flex: 1, borderTop: '1px solid #111', paddingTop: '4px', fontSize: '11px', textAlign: 'center' }}>Firma del empleador</div>
            <div style={{ flex: 1, borderTop: '1px solid #111', paddingTop: '4px', fontSize: '11px', textAlign: 'center' }}>Recibí conforme · {emp.nombre || ''}{emp.documento ? ` · CC ${emp.documento}` : ''}</div>
          </div>
        </div>
      </>
    )
  }

  return (
    <div>
      <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
        <label className="text-xs font-bold text-gray-600 block mb-1">Mes (vacío = todos)</label>
        <input type="month" value={mes} onChange={e => setMes(e.target.value)} className={inputCls} />
      </div>
      {cargando ? (
        <p className="text-gray-400 text-center py-10">Cargando...</p>
      ) : pagos.length === 0 ? (
        <p className="text-gray-400 text-center py-10">Sin nóminas pagadas</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
          {pagos.map(p => (
            <div key={p.id} className="p-4 flex justify-between items-center gap-3">
              <div className="min-w-0">
                <p className="font-bold text-gray-800">{empleadosMap[p.empleado_id]?.nombre || 'Empleado'}</p>
                <p className="text-xs text-gray-500">{nombrePeriodo(p.periodo)} · Neto {fmt(p.neto_a_pagar)}</p>
              </div>
              <button onClick={() => setImprimiendo(p)} className="text-xs bg-gray-100 px-3 py-2 rounded-lg font-bold text-gray-600 shrink-0">Ver colilla</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
