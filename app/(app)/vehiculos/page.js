'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const TIPOS_VEHICULO = ['Camion', 'Camioneta', 'Moto']
const TIPOS_DOCUMENTO = ['SOAT', 'Tecnomecanica', 'Tarjeta de propiedad', 'Seguro todo riesgo', 'Impuesto vehicular']

const ESTADOS = {
  activo: { nombre: 'Activo', clase: 'bg-green-100 text-green-700' },
  en_taller: { nombre: 'En taller', clase: 'bg-amber-100 text-amber-700' },
  fuera_de_servicio: { nombre: 'Fuera de servicio', clase: 'bg-brand/10 text-brand' },
}

const diasHasta = (fecha) => {
  if (!fecha) return null
  const hoy = new Date(obtenerFechaActual())
  const f = new Date(fecha)
  return Math.round((f - hoy) / (24 * 60 * 60 * 1000))
}

const estadoDocumento = (fechaVencimiento) => {
  const dias = diasHasta(fechaVencimiento)
  if (dias === null) return { nombre: 'Sin fecha', clase: 'bg-gray-100 text-gray-500' }
  if (dias < 0) return { nombre: 'Vencido', clase: 'bg-brand/10 text-brand' }
  if (dias <= 30) return { nombre: 'Por vencer', clase: 'bg-amber-100 text-amber-700' }
  return { nombre: 'Vigente', clase: 'bg-green-100 text-green-700' }
}

const ultimoPorTipo = (mantenimientos) => {
  const porTipo = {}
  ;[...mantenimientos].sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach(m => { porTipo[m.tipo] = m })
  return Object.values(porTipo)
}

const proximoMasCercano = (mantenimientos, kilometrajeActual) => {
  const conProximo = ultimoPorTipo(mantenimientos).filter(m => m.km_proximo != null)
  if (conProximo.length === 0) return null
  return conProximo.reduce((min, m) => {
    const restante = m.km_proximo - kilometrajeActual
    return (!min || restante < min.restante) ? { ...m, restante } : min
  }, null)
}

export default function Vehiculos() {
  const [usuario, setUsuario] = useState(null)
  const [vehiculos, setVehiculos] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [mantenimientosPorVehiculo, setMantenimientosPorVehiculo] = useState({})
  const [vehiculoSelId, setVehiculoSelId] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('Todos')
  const [form, setForm] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (parsed.rol !== 'admin') { router.push('/dashboard'); return }
    setUsuario(parsed)
    cargar()
  }, [])

  const cargar = async () => {
    setCargando(true)
    const [{ data: v }, { data: vend }, { data: mants }] = await Promise.all([
      supabase.from('vehiculos').select('*, vendedores(nombre)').eq('empresa_id', getEmpresaId()).order('placa'),
      supabase.from('vendedores').select('id, nombre').eq('estado', true).eq('empresa_id', getEmpresaId()).order('nombre'),
      supabase.from('vehiculos_mantenimientos').select('vehiculo_id, tipo, km_proximo, fecha').eq('empresa_id', getEmpresaId()),
    ])
    if (v) setVehiculos(v)
    if (vend) setVendedores(vend)
    const porVehiculo = {}
    ;(mants || []).forEach(m => {
      if (!porVehiculo[m.vehiculo_id]) porVehiculo[m.vehiculo_id] = []
      porVehiculo[m.vehiculo_id].push(m)
    })
    setMantenimientosPorVehiculo(porVehiculo)
    setCargando(false)
  }

  const guardarVehiculo = async () => {
    if (!form.placa) { alert('Ingresa la placa'); return }
    setGuardando(true)
    const payload = {
      placa: form.placa.toUpperCase(),
      marca: form.marca || null,
      modelo: form.modelo || null,
      anio: form.anio ? parseInt(form.anio) : null,
      color: form.color || null,
      tipo: form.tipo || null,
      conductor_id: form.conductor_id || null,
      kilometraje_actual: parseFloat(form.kilometraje_actual || 0),
      estado: form.estado || 'activo',
    }
    const { error } = form.id
      ? await supabase.from('vehiculos').update(payload).eq('id', form.id)
      : await supabase.from('vehiculos').insert({ ...payload, empresa_id: getEmpresaId() })
    setGuardando(false)
    if (error) { alert('Error: ' + error.message); return }
    setForm(null)
    cargar()
  }

  if (!usuario) return null

  const vehiculoSel = vehiculos.find(v => v.id === vehiculoSelId)
  if (vehiculoSel) {
    return (
      <DetalleVehiculo
        vehiculo={vehiculoSel}
        onVolver={() => { setVehiculoSelId(null); cargar() }}
        onEditar={() => setForm({ ...vehiculoSel, anio: vehiculoSel.anio || '', conductor_id: vehiculoSel.conductor_id || '', kilometraje_actual: String(vehiculoSel.kilometraje_actual ?? 0) })}
        vendedores={vendedores}
        form={form}
        setForm={setForm}
        guardando={guardando}
        onGuardarVehiculo={guardarVehiculo}
      />
    )
  }

  const busquedaLower = busqueda.toLowerCase()
  const vehiculosFiltrados = vehiculos.filter(v => {
    const matchBusqueda = !busqueda || v.placa.toLowerCase().includes(busquedaLower) || (v.marca || '').toLowerCase().includes(busquedaLower) || (v.vendedores?.nombre || '').toLowerCase().includes(busquedaLower)
    const matchEstado = filtroEstado === 'Todos' || v.estado === filtroEstado
    return matchBusqueda && matchEstado
  })

  return (
    <div>
      <div className="bg-white shadow-sm px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-gray-700" aria-label="Volver al dashboard">←</button>
          <h1 className="text-xl font-black text-gray-900">Vehículos</h1>
        </div>
        <p className="text-xs text-gray-500">Administra y controla la información de tu flota</p>
      </div>

      <div className="p-4 max-w-3xl mx-auto">
        <div className="flex gap-2 mb-4">
          <input type="text" placeholder="Buscar por placa, marca o conductor..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
            className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
          <button onClick={() => setForm({ placa: '', marca: '', modelo: '', anio: '', color: '', tipo: '', conductor_id: '', kilometraje_actual: '0', estado: 'activo' })}
            className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap">
            + Nuevo vehículo
          </button>
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {['Todos', ...Object.keys(ESTADOS)].map(e => (
            <button key={e} onClick={() => setFiltroEstado(e)}
              className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${filtroEstado === e ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              {e === 'Todos' ? 'Todos' : ESTADOS[e].nombre}
            </button>
          ))}
        </div>

        {form && !vehiculoSel && (
          <FormVehiculo form={form} setForm={setForm} vendedores={vendedores} guardando={guardando} onGuardar={guardarVehiculo} onCancelar={() => setForm(null)} />
        )}

        {cargando ? (
          <p className="text-gray-400 text-center py-10">Cargando...</p>
        ) : vehiculosFiltrados.length === 0 ? (
          <p className="text-gray-400 text-center py-10">No hay vehículos que coincidan</p>
        ) : (
          <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
            {vehiculosFiltrados.map(v => {
              const prox = proximoMasCercano(mantenimientosPorVehiculo[v.id] || [], v.kilometraje_actual)
              return (
                <button key={v.id} onClick={() => setVehiculoSelId(v.id)} className="w-full p-4 flex justify-between items-center text-left hover:bg-gray-50">
                  <div>
                    <p className="font-bold text-gray-800 text-sm">{v.placa}</p>
                    <p className="text-xs text-gray-500">{[v.marca, v.modelo, v.anio, v.color].filter(Boolean).join(' · ') || 'Sin datos'}</p>
                    <p className="text-xs text-gray-400">{v.vendedores?.nombre || 'Vacante'} · {(v.kilometraje_actual || 0).toLocaleString('es-CO')} km</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg block mb-1 ${ESTADOS[v.estado]?.clase || 'bg-gray-100 text-gray-600'}`}>
                      {ESTADOS[v.estado]?.nombre || v.estado}
                    </span>
                    <p className="text-xs text-gray-400">{prox ? `${prox.tipo} · ${Math.round(prox.restante)} km` : '—'}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function FormVehiculo({ form, setForm, vendedores, guardando, onGuardar, onCancelar }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
      <p className="font-bold text-gray-700 mb-3">{form.id ? 'Editar vehículo' : 'Nuevo vehículo'}</p>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label className="text-xs font-bold text-gray-600 block mb-1">Placa</label>
          <input type="text" value={form.placa} onChange={e => setForm({ ...form, placa: e.target.value })}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-600 block mb-1">Tipo</label>
          <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
            <option value="">Selecciona</option>
            {TIPOS_VEHICULO.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-gray-600 block mb-1">Marca</label>
          <input type="text" value={form.marca} onChange={e => setForm({ ...form, marca: e.target.value })}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-600 block mb-1">Modelo</label>
          <input type="text" value={form.modelo} onChange={e => setForm({ ...form, modelo: e.target.value })}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-600 block mb-1">Año</label>
          <input type="number" value={form.anio} onChange={e => setForm({ ...form, anio: e.target.value })}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-600 block mb-1">Color</label>
          <input type="text" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-600 block mb-1">Conductor</label>
          <select value={form.conductor_id} onChange={e => setForm({ ...form, conductor_id: e.target.value })}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
            <option value="">Vacante</option>
            {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-gray-600 block mb-1">Kilometraje actual</label>
          <input type="number" value={form.kilometraje_actual} onChange={e => setForm({ ...form, kilometraje_actual: e.target.value })}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-bold text-gray-600 block mb-1">Estado</label>
          <select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
            {Object.entries(ESTADOS).map(([id, e]) => <option key={id} value={id}>{e.nombre}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2 mt-2">
        <button onClick={onCancelar} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-lg">Cancelar</button>
        <button onClick={onGuardar} disabled={guardando} className="flex-1 bg-brand hover:bg-brand-dark text-white font-bold py-2 rounded-lg disabled:opacity-50">
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

function DetalleVehiculo({ vehiculo, onVolver, onEditar, vendedores, form, setForm, guardando, onGuardarVehiculo }) {
  const [documentos, setDocumentos] = useState([])
  const [mantenimientos, setMantenimientos] = useState([])
  const [fotos, setFotos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [vista, setVista] = useState('documentos')
  const [formDoc, setFormDoc] = useState(null)
  const [formMant, setFormMant] = useState(null)
  const [guardandoDoc, setGuardandoDoc] = useState(false)
  const [guardandoMant, setGuardandoMant] = useState(false)
  const [subiendo, setSubiendo] = useState(false)

  useEffect(() => { cargar() }, [vehiculo.id])

  const cargar = async () => {
    setCargando(true)
    const [{ data: docs }, { data: mants }, { data: fts }] = await Promise.all([
      supabase.from('vehiculos_documentos').select('*').eq('vehiculo_id', vehiculo.id).eq('empresa_id', getEmpresaId()).order('fecha_vencimiento'),
      supabase.from('vehiculos_mantenimientos').select('*').eq('vehiculo_id', vehiculo.id).eq('empresa_id', getEmpresaId()).order('fecha', { ascending: false }),
      supabase.from('vehiculos_fotos').select('*').eq('vehiculo_id', vehiculo.id).eq('empresa_id', getEmpresaId()).order('created_at'),
    ])
    setDocumentos(docs || [])
    setMantenimientos(mants || [])
    setFotos(fts || [])
    setCargando(false)
  }

  const guardarDocumento = async () => {
    if (!formDoc.tipo) { alert('Selecciona el tipo de documento'); return }
    setGuardandoDoc(true)
    let archivo_url = formDoc.archivo_url || null
    if (formDoc.archivo) {
      const ext = formDoc.archivo.name.split('.').pop()
      const path = `${vehiculo.id}/documentos/${Date.now()}.${ext}`
      const { error: errUp } = await supabase.storage.from('vehiculos').upload(path, formDoc.archivo)
      if (errUp) { alert('Error al subir el archivo: ' + errUp.message); setGuardandoDoc(false); return }
      const { data: pub } = supabase.storage.from('vehiculos').getPublicUrl(path)
      archivo_url = pub.publicUrl
    }
    const payload = {
      tipo: formDoc.tipo,
      numero: formDoc.numero || null,
      fecha_expedicion: formDoc.fecha_expedicion || null,
      fecha_vencimiento: formDoc.fecha_vencimiento || null,
      archivo_url,
    }
    const { error } = formDoc.id
      ? await supabase.from('vehiculos_documentos').update(payload).eq('id', formDoc.id)
      : await supabase.from('vehiculos_documentos').insert({ ...payload, vehiculo_id: vehiculo.id, empresa_id: getEmpresaId() })
    setGuardandoDoc(false)
    if (error) { alert('Error: ' + error.message); return }
    setFormDoc(null)
    cargar()
  }

  const guardarMantenimiento = async () => {
    if (!formMant.tipo || !formMant.fecha) { alert('Ingresa el tipo y la fecha'); return }
    setGuardandoMant(true)
    const payload = {
      tipo: formMant.tipo,
      taller: formMant.taller || null,
      km_realizado: formMant.km_realizado ? parseFloat(formMant.km_realizado) : null,
      km_proximo: formMant.km_proximo ? parseFloat(formMant.km_proximo) : null,
      costo: parseFloat(formMant.costo || 0),
      fecha: formMant.fecha,
      notas: formMant.notas || null,
    }
    const { error } = await supabase.from('vehiculos_mantenimientos').insert({ ...payload, vehiculo_id: vehiculo.id, empresa_id: getEmpresaId() })
    setGuardandoMant(false)
    if (error) { alert('Error: ' + error.message); return }
    setFormMant(null)
    cargar()
  }

  const subirFotos = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setSubiendo(true)
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `${vehiculo.id}/fotos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: errUp } = await supabase.storage.from('vehiculos').upload(path, file)
      if (errUp) continue
      const { data: pub } = supabase.storage.from('vehiculos').getPublicUrl(path)
      await supabase.from('vehiculos_fotos').insert({ vehiculo_id: vehiculo.id, empresa_id: getEmpresaId(), url: pub.publicUrl })
    }
    setSubiendo(false)
    e.target.value = ''
    cargar()
  }

  if (form) {
    return (
      <div className="p-4 max-w-3xl mx-auto">
        <FormVehiculo form={form} setForm={setForm} vendedores={vendedores} guardando={guardando}
          onGuardar={onGuardarVehiculo} onCancelar={() => setForm(null)} />
      </div>
    )
  }

  if (cargando) return <p className="text-gray-400 text-center py-16">Cargando...</p>

  const alertasDocs = documentos
    .map(d => ({ ...d, dias: diasHasta(d.fecha_vencimiento) }))
    .filter(d => d.dias !== null && d.dias <= 30)
    .sort((a, b) => a.dias - b.dias)

  const alertasMant = ultimoPorTipo(mantenimientos)
    .filter(m => m.km_proximo != null)
    .map(m => ({ ...m, restante: m.km_proximo - (vehiculo.kilometraje_actual || 0) }))
    .filter(m => m.restante <= 500)
    .sort((a, b) => a.restante - b.restante)

  const proximosMant = ultimoPorTipo(mantenimientos).filter(m => m.km_proximo != null)

  const anioActual = new Date().getFullYear()
  const costosPorTipo = {}
  mantenimientos.filter(m => m.fecha?.startsWith(String(anioActual))).forEach(m => {
    costosPorTipo[m.tipo] = (costosPorTipo[m.tipo] || 0) + (m.costo || 0)
  })
  const totalCostosAnio = Object.values(costosPorTipo).reduce((s, v) => s + v, 0)

  const kmChartData = [...mantenimientos]
    .filter(m => m.km_realizado != null)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map(m => ({ fecha: m.fecha.slice(5), km: m.km_realizado }))

  return (
    <div>
      <div className="bg-white shadow-sm px-6 py-4 sticky top-0 z-10 flex justify-between items-center">
        <div>
          <button onClick={onVolver} className="text-xs text-gray-400 hover:text-gray-700 font-bold mb-1">← Vehículos</button>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-gray-900">{vehiculo.placa}</h1>
            <span className={`text-xs font-bold px-2 py-1 rounded-lg ${ESTADOS[vehiculo.estado]?.clase || 'bg-gray-100 text-gray-600'}`}>
              {ESTADOS[vehiculo.estado]?.nombre || vehiculo.estado}
            </span>
          </div>
          <p className="text-xs text-gray-500">{[vehiculo.marca, vehiculo.modelo, vehiculo.anio].filter(Boolean).join(' · ') || 'Sin datos'}</p>
        </div>
        <button onClick={onEditar} className="text-xs bg-gray-100 text-gray-600 px-3 py-2 rounded-lg font-bold">Editar</button>
      </div>

      <div className="p-4 max-w-3xl mx-auto">
        {fotos.length > 0 && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            {fotos.map(f => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={f.id} src={f.url} alt={vehiculo.placa} className="w-24 h-24 rounded-xl object-cover border border-gray-200 flex-shrink-0" />
            ))}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <p className="font-black text-gray-700 mb-3">Información general</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-gray-400 text-xs">Placa</p><p className="text-gray-800 font-bold">{vehiculo.placa}</p></div>
            <div><p className="text-gray-400 text-xs">Tipo</p><p className="text-gray-800 font-bold">{vehiculo.tipo || '—'}</p></div>
            <div><p className="text-gray-400 text-xs">Marca</p><p className="text-gray-800 font-bold">{vehiculo.marca || '—'}</p></div>
            <div><p className="text-gray-400 text-xs">Modelo</p><p className="text-gray-800 font-bold">{vehiculo.modelo || '—'}</p></div>
            <div><p className="text-gray-400 text-xs">Año</p><p className="text-gray-800 font-bold">{vehiculo.anio || '—'}</p></div>
            <div><p className="text-gray-400 text-xs">Color</p><p className="text-gray-800 font-bold">{vehiculo.color || '—'}</p></div>
            <div><p className="text-gray-400 text-xs">Conductor</p><p className="text-gray-800 font-bold">{vehiculo.vendedores?.nombre || 'Vacante'}</p></div>
            <div><p className="text-gray-400 text-xs">Kilometraje</p><p className="text-gray-800 font-bold">{(vehiculo.kilometraje_actual || 0).toLocaleString('es-CO')} km</p></div>
          </div>
        </div>

        {(alertasDocs.length > 0 || alertasMant.length > 0) && (
          <div className="bg-brand/5 border border-brand/30 rounded-xl p-4 mb-4">
            <p className="font-black text-brand mb-2">⚠ Alertas importantes</p>
            {alertasDocs.map(d => (
              <p key={d.id} className="text-sm text-gray-700 mb-1">
                {d.tipo} {d.dias < 0 ? `vencido hace ${Math.abs(d.dias)} dias` : `vence en ${d.dias} dias`}
              </p>
            ))}
            {alertasMant.map(m => (
              <p key={m.id} className="text-sm text-gray-700 mb-1">
                {m.tipo} {m.restante <= 0 ? 'ya se cumplio el kilometraje' : `en ${Math.round(m.restante)} km`}
              </p>
            ))}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <p className="font-black text-gray-700 mb-3">Estado documental</p>
          {documentos.length === 0 ? (
            <p className="text-gray-400 text-sm">Sin documentos registrados</p>
          ) : documentos.map(d => {
            const est = estadoDocumento(d.fecha_vencimiento)
            return (
              <div key={d.id} className="flex justify-between items-center mb-2">
                <div>
                  <p className="text-sm font-bold text-gray-700">{d.tipo}</p>
                  <p className="text-xs text-gray-400">{d.fecha_vencimiento ? `Vence ${d.fecha_vencimiento}` : 'Sin fecha'}</p>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${est.clase}`}>{est.nombre}</span>
              </div>
            )
          })}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <p className="font-black text-gray-700 mb-3">Próximos mantenimientos</p>
          {proximosMant.length === 0 ? (
            <p className="text-gray-400 text-sm">Sin mantenimientos con kilometraje proximo registrado</p>
          ) : proximosMant.map(m => (
            <div key={m.id} className="flex justify-between items-center mb-2">
              <div>
                <p className="text-sm font-bold text-gray-700">{m.tipo}</p>
                {m.km_realizado != null && <p className="text-xs text-gray-400">Cada {(m.km_proximo - m.km_realizado).toLocaleString('es-CO')} km</p>}
              </div>
              <p className="text-sm font-bold text-gray-600">En {Math.round(m.km_proximo - (vehiculo.kilometraje_actual || 0)).toLocaleString('es-CO')} km</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <p className="font-black text-gray-700 mb-3">Resumen de costos ({anioActual})</p>
          {Object.keys(costosPorTipo).length === 0 ? (
            <p className="text-gray-400 text-sm">Sin mantenimientos este año</p>
          ) : (
            <>
              {Object.entries(costosPorTipo).map(([tipo, valor]) => (
                <div key={tipo} className="flex justify-between text-sm mb-1">
                  <p className="text-gray-600">{tipo}</p>
                  <p className="font-bold text-gray-800">${valor.toLocaleString('es-CO')}</p>
                </div>
              ))}
              <div className="border-t border-gray-100 mt-2 pt-2 flex justify-between">
                <p className="font-black text-gray-700">Total</p>
                <p className="font-black text-brand">${totalCostosAnio.toLocaleString('es-CO')}</p>
              </div>
            </>
          )}
        </div>

        {kmChartData.length > 1 && (
          <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
            <p className="font-black text-gray-700 mb-3">Kilometraje</p>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={kmChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="fecha" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={v => `${v.toLocaleString('es-CO')} km`} />
                <Line type="monotone" dataKey="km" stroke="#C41230" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {[['documentos', 'Documentos'], ['mantenimientos', 'Mantenimientos'], ['costos', 'Costos'], ['galeria', 'Galeria']].map(([id, nombre]) => (
            <button key={id} onClick={() => setVista(id)}
              className={`px-3 py-2 rounded-xl text-sm font-bold whitespace-nowrap ${vista === id ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              {nombre}
            </button>
          ))}
        </div>

        {vista === 'documentos' && (
          <>
            <div className="flex justify-between items-center mb-3">
              <p className="text-xs text-gray-500">{documentos.length} documentos</p>
              <button onClick={() => setFormDoc({ tipo: '', numero: '', fecha_expedicion: '', fecha_vencimiento: '', archivo: null })}
                className="text-xs bg-brand hover:bg-brand-dark text-white px-3 py-2 rounded-lg font-bold">+ Agregar documento</button>
            </div>
            {formDoc && (
              <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
                <select value={formDoc.tipo} onChange={e => setFormDoc({ ...formDoc, tipo: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none mb-2">
                  <option value="">Selecciona tipo</option>
                  {TIPOS_DOCUMENTO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input type="text" placeholder="Numero (opcional)" value={formDoc.numero} onChange={e => setFormDoc({ ...formDoc, numero: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none mb-2" />
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1">Expedicion</label>
                    <input type="date" value={formDoc.fecha_expedicion} onChange={e => setFormDoc({ ...formDoc, fecha_expedicion: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1">Vencimiento</label>
                    <input type="date" value={formDoc.fecha_vencimiento} onChange={e => setFormDoc({ ...formDoc, fecha_vencimiento: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
                  </div>
                </div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Archivo (opcional)</label>
                <input type="file" accept="image/*,.pdf" onChange={e => setFormDoc({ ...formDoc, archivo: e.target.files?.[0] || null })}
                  className="w-full text-sm text-gray-600 mb-3" />
                <div className="flex gap-2">
                  <button onClick={() => setFormDoc(null)} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-lg">Cancelar</button>
                  <button onClick={guardarDocumento} disabled={guardandoDoc} className="flex-1 bg-brand hover:bg-brand-dark text-white font-bold py-2 rounded-lg disabled:opacity-50">
                    {guardandoDoc ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            )}
            <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
              {documentos.length === 0 ? (
                <p className="text-gray-400 text-center py-8 text-sm">Sin documentos registrados</p>
              ) : documentos.map(d => {
                const est = estadoDocumento(d.fecha_vencimiento)
                return (
                  <div key={d.id} className="p-4 flex justify-between items-center">
                    <div>
                      <p className="font-bold text-gray-800 text-sm">{d.tipo}</p>
                      <p className="text-xs text-gray-500">
                        {d.numero ? `No. ${d.numero} · ` : ''}{d.fecha_expedicion ? `Exp. ${d.fecha_expedicion} ` : ''}{d.fecha_vencimiento ? `· Vence ${d.fecha_vencimiento}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg ${est.clase}`}>{est.nombre}</span>
                      {d.archivo_url && <a href={d.archivo_url} target="_blank" rel="noreferrer" className="text-xs text-brand font-bold">Ver</a>}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {vista === 'mantenimientos' && (
          <>
            <div className="flex justify-between items-center mb-3">
              <p className="text-xs text-gray-500">{mantenimientos.length} mantenimientos</p>
              <button onClick={() => setFormMant({ tipo: '', taller: '', km_realizado: '', km_proximo: '', costo: '', fecha: obtenerFechaActual(), notas: '' })}
                className="text-xs bg-brand hover:bg-brand-dark text-white px-3 py-2 rounded-lg font-bold">+ Nuevo mantenimiento</button>
            </div>
            {formMant && (
              <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
                <input type="text" placeholder="Tipo (ej: Cambio de aceite y filtro)" value={formMant.tipo} onChange={e => setFormMant({ ...formMant, tipo: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none mb-2" />
                <input type="text" placeholder="Taller" value={formMant.taller} onChange={e => setFormMant({ ...formMant, taller: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none mb-2" />
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1">Km realizado</label>
                    <input type="number" value={formMant.km_realizado} onChange={e => setFormMant({ ...formMant, km_realizado: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1">Proximo km</label>
                    <input type="number" value={formMant.km_proximo} onChange={e => setFormMant({ ...formMant, km_proximo: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1">Costo</label>
                    <input type="number" value={formMant.costo} onChange={e => setFormMant({ ...formMant, costo: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1">Fecha</label>
                    <input type="date" value={formMant.fecha} onChange={e => setFormMant({ ...formMant, fecha: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
                  </div>
                </div>
                <textarea placeholder="Notas (opcional)" value={formMant.notas} onChange={e => setFormMant({ ...formMant, notas: e.target.value })}
                  className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none mb-3" rows={2} />
                <div className="flex gap-2">
                  <button onClick={() => setFormMant(null)} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-lg">Cancelar</button>
                  <button onClick={guardarMantenimiento} disabled={guardandoMant} className="flex-1 bg-brand hover:bg-brand-dark text-white font-bold py-2 rounded-lg disabled:opacity-50">
                    {guardandoMant ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            )}
            <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
              {mantenimientos.length === 0 ? (
                <p className="text-gray-400 text-center py-8 text-sm">Sin mantenimientos registrados</p>
              ) : mantenimientos.map(m => (
                <div key={m.id} className="p-4">
                  <div className="flex justify-between items-start mb-1">
                    <p className="font-bold text-gray-800 text-sm">{m.tipo}</p>
                    <p className="font-bold text-gray-700 text-sm">${(m.costo || 0).toLocaleString('es-CO')}</p>
                  </div>
                  <p className="text-xs text-gray-500">{m.taller || 'Sin taller'} · {m.fecha}{m.km_realizado != null ? ` · Km ${m.km_realizado.toLocaleString('es-CO')}` : ''}</p>
                  {m.notas && <p className="text-xs text-gray-400 mt-1">{m.notas}</p>}
                </div>
              ))}
            </div>
          </>
        )}

        {vista === 'costos' && (
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="font-black text-gray-700 mb-3">Costos por tipo (histórico)</p>
            {mantenimientos.length === 0 ? (
              <p className="text-gray-400 text-sm">Sin mantenimientos registrados</p>
            ) : (
              Object.entries(
                mantenimientos.reduce((acc, m) => {
                  acc[m.tipo] = (acc[m.tipo] || 0) + (m.costo || 0)
                  return acc
                }, {})
              ).sort((a, b) => b[1] - a[1]).map(([tipo, valor]) => (
                <div key={tipo} className="flex justify-between text-sm mb-2">
                  <p className="text-gray-600">{tipo}</p>
                  <p className="font-bold text-gray-800">${valor.toLocaleString('es-CO')}</p>
                </div>
              ))
            )}
          </div>
        )}

        {vista === 'galeria' && (
          <>
            <div className="flex justify-between items-center mb-3">
              <p className="text-xs text-gray-500">{fotos.length} fotos</p>
              <label className="text-xs bg-brand hover:bg-brand-dark text-white px-3 py-2 rounded-lg font-bold cursor-pointer">
                {subiendo ? 'Subiendo...' : '+ Agregar fotos'}
                <input type="file" accept="image/*" multiple onChange={subirFotos} disabled={subiendo} className="hidden" />
              </label>
            </div>
            {fotos.length === 0 ? (
              <p className="text-gray-400 text-center py-8 text-sm">Sin fotos todavia</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {fotos.map(f => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={f.id} src={f.url} alt={vehiculo.placa} className="w-full aspect-square rounded-xl object-cover border border-gray-200" />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
