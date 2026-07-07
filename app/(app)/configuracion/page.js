'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const TABS = [
  { id: 'usuarios', nombre: 'Usuarios' },
  { id: 'rutas', nombre: 'Rutas' },
  { id: 'proveedores', nombre: 'Proveedores' },
]

export default function Configuracion() {
  const [usuario, setUsuario] = useState(null)
  const [vista, setVista] = useState('usuarios')

  const [usuarios, setUsuarios] = useState([])
  const [sesiones, setSesiones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [editando, setEditando] = useState(null)
  const [nuevaClave, setNuevaClave] = useState('')
  const [guardandoClave, setGuardandoClave] = useState(false)

  const [rutas, setRutas] = useState([])
  const [rutaForm, setRutaForm] = useState(null)
  const [guardandoRuta, setGuardandoRuta] = useState(false)

  const [proveedores, setProveedores] = useState([])
  const [proveedorForm, setProveedorForm] = useState(null)
  const [guardandoProveedor, setGuardandoProveedor] = useState(false)

  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (parsed.rol !== 'admin') { router.push('/dashboard'); return }
    setUsuario(parsed)
    cargarDatos()
  }, [])

  const cargarDatos = async () => {
    setCargando(true)
    const [{ data: usuariosData }, { data: sesionesData }, { data: rutasData }, { data: proveedoresData }] = await Promise.all([
      supabase.from('usuarios').select('id, usuario, nombre, rol, vendedor_nombre, activo, created_at').order('usuario'),
      supabase.from('sesiones_activas').select('*, usuarios(usuario, nombre)').order('ultimo_acceso', { ascending: false }),
      supabase.from('rutas').select('*').order('nombre'),
      supabase.from('proveedores').select('*').order('nombre'),
    ])
    if (usuariosData) setUsuarios(usuariosData)
    if (sesionesData) setSesiones(sesionesData)
    if (rutasData) setRutas(rutasData)
    if (proveedoresData) setProveedores(proveedoresData)
    setCargando(false)
  }

  const toggleActivo = async (u) => {
    await supabase.from('usuarios').update({ activo: !u.activo }).eq('id', u.id)
    cargarDatos()
  }

  const guardarClave = async (id) => {
    if (!nuevaClave || nuevaClave.length < 4) { alert('La contrasena debe tener al menos 4 caracteres'); return }
    setGuardandoClave(true)
    const { error } = await supabase.rpc('admin_cambiar_password', { p_usuario_id: id, p_password_nueva: nuevaClave })
    setGuardandoClave(false)
    if (error) { alert('Error: ' + error.message); return }
    setEditando(null)
    setNuevaClave('')
    alert('Contrasena actualizada')
  }

  const guardarRuta = async () => {
    if (!rutaForm.nombre) { alert('Ingresa el nombre de la ruta'); return }
    setGuardandoRuta(true)
    const payload = {
      nombre: rutaForm.nombre,
      zona: rutaForm.zona || null,
      hora_cargue: rutaForm.hora_cargue || null,
      dias_operacion: rutaForm.dias_operacion || null,
    }
    const { error } = rutaForm.id
      ? await supabase.from('rutas').update(payload).eq('id', rutaForm.id)
      : await supabase.from('rutas').insert({ ...payload, estado: true })
    setGuardandoRuta(false)
    if (error) { alert('Error: ' + error.message); return }
    setRutaForm(null)
    cargarDatos()
  }

  const toggleRutaEstado = async (r) => {
    await supabase.from('rutas').update({ estado: !r.estado }).eq('id', r.id)
    cargarDatos()
  }

  const guardarProveedor = async () => {
    if (!proveedorForm.nombre) { alert('Ingresa el nombre del proveedor'); return }
    setGuardandoProveedor(true)
    const payload = {
      nombre: proveedorForm.nombre,
      contacto: proveedorForm.contacto || null,
      telefono: proveedorForm.telefono || null,
      productos: proveedorForm.productos || null,
      frecuencia: proveedorForm.frecuencia || null,
    }
    const { error } = proveedorForm.id
      ? await supabase.from('proveedores').update(payload).eq('id', proveedorForm.id)
      : await supabase.from('proveedores').insert({ ...payload, estado: true })
    setGuardandoProveedor(false)
    if (error) { alert('Error: ' + error.message); return }
    setProveedorForm(null)
    cargarDatos()
  }

  const toggleProveedorEstado = async (p) => {
    await supabase.from('proveedores').update({ estado: !p.estado }).eq('id', p.id)
    cargarDatos()
  }

  if (!usuario) return null

  return (
    <div>
      <div className="bg-white shadow-sm px-6 py-4 sticky top-0 z-10">
        <h1 className="text-xl font-black text-gray-900">Configuración</h1>
        <p className="text-xs text-gray-500">Usuarios, rutas y proveedores</p>
      </div>

      <div className="p-4 max-w-3xl mx-auto">
        <div className="flex gap-2 mb-4">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setVista(t.id)}
              className={`flex-1 py-2 rounded-xl text-sm font-bold ${vista === t.id ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              {t.nombre}
            </button>
          ))}
        </div>

        {cargando ? (
          <p className="text-gray-400 text-center py-10">Cargando...</p>
        ) : vista === 'usuarios' ? (
          <>
            <h2 className="font-black text-gray-700 mb-3">Usuarios</h2>
            <div className="bg-white rounded-xl shadow-sm mb-6 divide-y divide-gray-100">
              {usuarios.map(u => (
                <div key={u.id} className="p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-bold text-gray-800">{u.nombre} <span className="text-gray-400 font-normal">@{u.usuario}</span></p>
                      <p className="text-xs text-gray-500 capitalize">{u.rol}{u.vendedor_nombre ? ` · ${u.vendedor_nombre}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg ${u.activo ? 'bg-gray-200 text-gray-800' : 'bg-brand/10 text-brand'}`}>
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </span>
                      <button onClick={() => toggleActivo(u)} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg font-bold">
                        {u.activo ? 'Desactivar' : 'Activar'}
                      </button>
                      <button onClick={() => { setEditando(editando === u.id ? null : u.id); setNuevaClave('') }} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg font-bold">
                        Contraseña
                      </button>
                    </div>
                  </div>
                  {editando === u.id && (
                    <div className="flex gap-2 mt-3">
                      <input type="password" placeholder="Nueva contraseña" value={nuevaClave} onChange={e => setNuevaClave(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand" />
                      <button onClick={() => guardarClave(u.id)} disabled={guardandoClave}
                        className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50">
                        Guardar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <h2 className="font-black text-gray-700 mb-3">Sesiones activas</h2>
            <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
              {sesiones.length === 0 ? (
                <p className="text-gray-400 text-sm p-4">Sin sesiones registradas</p>
              ) : sesiones.map(s => (
                <div key={s.id} className="p-4 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-gray-800">{s.usuarios?.nombre || s.usuario_id}</p>
                    <p className="text-xs text-gray-500">{s.ip} · {s.dispositivo}</p>
                    <p className="text-xs text-gray-400">{new Date(s.ultimo_acceso).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-lg ${s.activo ? 'bg-gray-200 text-gray-800' : 'bg-gray-100 text-gray-500'}`}>
                    {s.activo ? 'Conectado' : 'Desconectado'}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : vista === 'rutas' ? (
          <>
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-black text-gray-700">Rutas</h2>
              <button onClick={() => setRutaForm({ nombre: '', zona: '', hora_cargue: '', dias_operacion: '' })}
                className="text-xs bg-brand hover:bg-brand-dark text-white px-3 py-2 rounded-lg font-bold">
                + Nueva ruta
              </button>
            </div>

            {rutaForm && (
              <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
                <p className="font-bold text-gray-700 mb-3">{rutaForm.id ? 'Editar ruta' : 'Nueva ruta'}</p>
                <div className="mb-2">
                  <label className="text-xs font-bold text-gray-600 block mb-1">Nombre</label>
                  <input type="text" value={rutaForm.nombre} onChange={e => setRutaForm({ ...rutaForm, nombre: e.target.value })}
                    className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
                </div>
                <div className="mb-2">
                  <label className="text-xs font-bold text-gray-600 block mb-1">Zona</label>
                  <input type="text" value={rutaForm.zona || ''} onChange={e => setRutaForm({ ...rutaForm, zona: e.target.value })}
                    className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
                </div>
                <div className="flex gap-2 mb-3">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-gray-600 block mb-1">Hora de cargue</label>
                    <input type="time" value={(rutaForm.hora_cargue || '').slice(0, 5)} onChange={e => setRutaForm({ ...rutaForm, hora_cargue: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-bold text-gray-600 block mb-1">Dias de operacion</label>
                    <input type="text" placeholder="Ej: Lun-Sab" value={rutaForm.dias_operacion || ''} onChange={e => setRutaForm({ ...rutaForm, dias_operacion: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setRutaForm(null)} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-lg">Cancelar</button>
                  <button onClick={guardarRuta} disabled={guardandoRuta}
                    className="flex-1 bg-brand hover:bg-brand-dark text-white font-bold py-2 rounded-lg disabled:opacity-50">
                    {guardandoRuta ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
              {rutas.map(r => (
                <div key={r.id} className="p-4 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-gray-800 text-sm">{r.nombre}</p>
                    <p className="text-xs text-gray-500">{[r.zona, r.hora_cargue?.slice(0, 5), r.dias_operacion].filter(Boolean).join(' · ') || 'Sin detalles'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${r.estado ? 'bg-gray-200 text-gray-800' : 'bg-brand/10 text-brand'}`}>
                      {r.estado ? 'Activa' : 'Inactiva'}
                    </span>
                    <button onClick={() => setRutaForm({ ...r })} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg font-bold">Editar</button>
                    <button onClick={() => toggleRutaEstado(r)} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg font-bold">
                      {r.estado ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-black text-gray-700">Proveedores</h2>
              <button onClick={() => setProveedorForm({ nombre: '', contacto: '', telefono: '', productos: '', frecuencia: '' })}
                className="text-xs bg-brand hover:bg-brand-dark text-white px-3 py-2 rounded-lg font-bold">
                + Nuevo proveedor
              </button>
            </div>

            {proveedorForm && (
              <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
                <p className="font-bold text-gray-700 mb-3">{proveedorForm.id ? 'Editar proveedor' : 'Nuevo proveedor'}</p>
                <div className="mb-2">
                  <label className="text-xs font-bold text-gray-600 block mb-1">Nombre</label>
                  <input type="text" value={proveedorForm.nombre} onChange={e => setProveedorForm({ ...proveedorForm, nombre: e.target.value })}
                    className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
                </div>
                <div className="flex gap-2 mb-2">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-gray-600 block mb-1">Contacto</label>
                    <input type="text" value={proveedorForm.contacto || ''} onChange={e => setProveedorForm({ ...proveedorForm, contacto: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-bold text-gray-600 block mb-1">Telefono</label>
                    <input type="text" value={proveedorForm.telefono || ''} onChange={e => setProveedorForm({ ...proveedorForm, telefono: e.target.value })}
                      className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
                  </div>
                </div>
                <div className="mb-2">
                  <label className="text-xs font-bold text-gray-600 block mb-1">Productos que provee</label>
                  <input type="text" value={proveedorForm.productos || ''} onChange={e => setProveedorForm({ ...proveedorForm, productos: e.target.value })}
                    className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
                </div>
                <div className="mb-3">
                  <label className="text-xs font-bold text-gray-600 block mb-1">Frecuencia de entrega</label>
                  <input type="text" placeholder="Ej: Diaria, Semanal" value={proveedorForm.frecuencia || ''} onChange={e => setProveedorForm({ ...proveedorForm, frecuencia: e.target.value })}
                    className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setProveedorForm(null)} className="flex-1 bg-gray-100 text-gray-600 font-bold py-2 rounded-lg">Cancelar</button>
                  <button onClick={guardarProveedor} disabled={guardandoProveedor}
                    className="flex-1 bg-brand hover:bg-brand-dark text-white font-bold py-2 rounded-lg disabled:opacity-50">
                    {guardandoProveedor ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
              {proveedores.map(p => (
                <div key={p.id} className="p-4 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-gray-800 text-sm">{p.nombre}</p>
                    <p className="text-xs text-gray-500">{[p.contacto, p.telefono, p.frecuencia].filter(Boolean).join(' · ') || 'Sin detalles'}</p>
                    {p.productos && <p className="text-xs text-gray-400">{p.productos}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${p.estado ? 'bg-gray-200 text-gray-800' : 'bg-brand/10 text-brand'}`}>
                      {p.estado ? 'Activo' : 'Inactivo'}
                    </span>
                    <button onClick={() => setProveedorForm({ ...p })} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg font-bold">Editar</button>
                    <button onClick={() => toggleProveedorEstado(p)} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg font-bold">
                      {p.estado ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
