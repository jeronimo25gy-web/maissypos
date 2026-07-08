'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { leerModoOscuro, aplicarModoOscuro } from '@/lib/modoOscuro'

const TABS = [
  { id: 'usuarios', nombre: 'Usuarios' },
  { id: 'empresa', nombre: 'Empresa' },
  { id: 'categorias', nombre: 'Categorías de gastos' },
  { id: 'apariencia', nombre: 'Modo oscuro' },
]

export default function Configuracion() {
  const [usuario, setUsuario] = useState(null)
  const [vista, setVista] = useState('usuarios')
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (parsed.rol !== 'admin') { router.push('/dashboard'); return }
    setUsuario(parsed)
  }, [])

  if (!usuario) return null

  return (
    <div>
      <div className="bg-white shadow-sm px-6 py-4 sticky top-0 z-10">
        <h1 className="text-xl font-black text-gray-900">Configuración</h1>
        <p className="text-xs text-gray-500">Usuarios, empresa, categorías y apariencia</p>
      </div>

      <div className="p-4 max-w-3xl mx-auto">
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setVista(t.id)}
              className={`px-3 py-2 rounded-xl text-sm font-bold whitespace-nowrap ${vista === t.id ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              {t.nombre}
            </button>
          ))}
        </div>

        {vista === 'usuarios' && <TabUsuarios />}
        {vista === 'empresa' && <TabEmpresa />}
        {vista === 'categorias' && <TabCategorias />}
        {vista === 'apariencia' && <TabApariencia />}
      </div>
    </div>
  )
}

function TabUsuarios() {
  const [usuarios, setUsuarios] = useState([])
  const [sesiones, setSesiones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [editando, setEditando] = useState(null)
  const [nuevaClave, setNuevaClave] = useState('')
  const [guardandoClave, setGuardandoClave] = useState(false)

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setCargando(true)
    const [{ data: usuariosData }, { data: sesionesData }] = await Promise.all([
      supabase.from('usuarios').select('id, usuario, nombre, rol, vendedor_nombre, activo, created_at').order('usuario'),
      supabase.from('sesiones_activas').select('*, usuarios(usuario, nombre)').order('ultimo_acceso', { ascending: false }),
    ])
    if (usuariosData) setUsuarios(usuariosData)
    if (sesionesData) setSesiones(sesionesData)
    setCargando(false)
  }

  const toggleActivo = async (u) => {
    await supabase.from('usuarios').update({ activo: !u.activo }).eq('id', u.id)
    cargar()
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

  if (cargando) return <p className="text-gray-400 text-center py-10">Cargando...</p>

  return (
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
  )
}

function TabEmpresa() {
  const [cargando, setCargando] = useState(true)
  const [empresa, setEmpresa] = useState(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setCargando(true)
    const { data } = await supabase.from('empresas').select('*').limit(1).maybeSingle()
    if (data) setEmpresa(data)
    setCargando(false)
  }

  const guardar = async () => {
    setGuardando(true)
    const { error } = await supabase.from('empresas').update({
      nombre: empresa.nombre,
      nit: empresa.nit || null,
      ciudad: empresa.ciudad || null,
      telefono: empresa.telefono || null,
      direccion: empresa.direccion || null,
    }).eq('id', empresa.id)
    setGuardando(false)
    if (error) { alert('Error: ' + error.message); return }
    alert('Datos de la empresa actualizados')
  }

  if (cargando) return <p className="text-gray-400 text-center py-10">Cargando...</p>
  if (!empresa) return <p className="text-gray-400 text-center py-10">No hay empresa configurada</p>

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <p className="font-black text-gray-700 mb-3">Datos de la empresa</p>
      <div className="mb-3">
        <label className="text-xs font-bold text-gray-600 block mb-1">Nombre</label>
        <input type="text" value={empresa.nombre || ''} onChange={e => setEmpresa({ ...empresa, nombre: e.target.value })}
          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
      </div>
      <div className="flex gap-2 mb-3">
        <div className="flex-1">
          <label className="text-xs font-bold text-gray-600 block mb-1">NIT</label>
          <input type="text" value={empresa.nit || ''} onChange={e => setEmpresa({ ...empresa, nit: e.target.value })}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
        </div>
        <div className="flex-1">
          <label className="text-xs font-bold text-gray-600 block mb-1">Ciudad</label>
          <input type="text" value={empresa.ciudad || ''} onChange={e => setEmpresa({ ...empresa, ciudad: e.target.value })}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
        </div>
      </div>
      <div className="mb-3">
        <label className="text-xs font-bold text-gray-600 block mb-1">Telefono</label>
        <input type="text" value={empresa.telefono || ''} onChange={e => setEmpresa({ ...empresa, telefono: e.target.value })}
          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
      </div>
      <div className="mb-4">
        <label className="text-xs font-bold text-gray-600 block mb-1">Direccion</label>
        <input type="text" value={empresa.direccion || ''} onChange={e => setEmpresa({ ...empresa, direccion: e.target.value })}
          className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
      </div>
      <button onClick={guardar} disabled={guardando}
        className="w-full bg-brand hover:bg-brand-dark text-white font-black py-3 rounded-xl disabled:opacity-50">
        {guardando ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </div>
  )
}

function TabCategorias() {
  const [cargando, setCargando] = useState(true)
  const [categorias, setCategorias] = useState([])
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoTipo, setNuevoTipo] = useState('admin')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setCargando(true)
    const { data } = await supabase.from('categorias_gasto').select('*').order('nombre')
    if (data) setCategorias(data)
    setCargando(false)
  }

  const agregar = async () => {
    if (!nuevoNombre) { alert('Ingresa el nombre de la categoria'); return }
    setGuardando(true)
    const { error } = await supabase.from('categorias_gasto').insert({ nombre: nuevoNombre, tipo: nuevoTipo, estado: true })
    setGuardando(false)
    if (error) { alert('Error: ' + error.message); return }
    setNuevoNombre('')
    cargar()
  }

  const toggleEstado = async (c) => {
    await supabase.from('categorias_gasto').update({ estado: !c.estado }).eq('id', c.id)
    cargar()
  }

  if (cargando) return <p className="text-gray-400 text-center py-10">Cargando...</p>

  const deRuta = categorias.filter(c => c.tipo === 'ruta')
  const deAdmin = categorias.filter(c => c.tipo === 'admin')

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
        <p className="font-black text-gray-700 mb-3">Nueva categoria</p>
        <div className="flex gap-2">
          <input type="text" placeholder="Nombre" value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)}
            className="flex-1 border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none" />
          <select value={nuevoTipo} onChange={e => setNuevoTipo(e.target.value)}
            className="border-2 border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none">
            <option value="admin">Administrativa</option>
            <option value="ruta">De ruta</option>
          </select>
          <button onClick={agregar} disabled={guardando}
            className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50">
            {guardando ? '...' : '+ Agregar'}
          </button>
        </div>
      </div>

      <h2 className="font-black text-gray-700 mb-3">Categorias administrativas</h2>
      <div className="bg-white rounded-xl shadow-sm mb-6 divide-y divide-gray-100">
        {deAdmin.length === 0 ? (
          <p className="text-gray-400 text-sm p-4">Sin categorias administrativas</p>
        ) : deAdmin.map(c => (
          <div key={c.id} className="p-4 flex justify-between items-center">
            <p className="font-bold text-gray-800 text-sm">{c.nombre}</p>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-1 rounded-lg ${c.estado ? 'bg-gray-200 text-gray-800' : 'bg-brand/10 text-brand'}`}>
                {c.estado ? 'Activa' : 'Inactiva'}
              </span>
              <button onClick={() => toggleEstado(c)} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg font-bold">
                {c.estado ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="font-black text-gray-700 mb-3">Categorias de ruta (kiosco)</h2>
      <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
        {deRuta.length === 0 ? (
          <p className="text-gray-400 text-sm p-4">Sin categorias de ruta</p>
        ) : deRuta.map(c => (
          <div key={c.id} className="p-4 flex justify-between items-center">
            <p className="font-bold text-gray-800 text-sm">{c.nombre}</p>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-1 rounded-lg ${c.estado ? 'bg-gray-200 text-gray-800' : 'bg-brand/10 text-brand'}`}>
                {c.estado ? 'Activa' : 'Inactiva'}
              </span>
              <button onClick={() => toggleEstado(c)} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg font-bold">
                {c.estado ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function TabApariencia() {
  const [activo, setActivo] = useState(false)

  useEffect(() => { setActivo(leerModoOscuro()) }, [])

  const toggle = () => {
    const nuevo = !activo
    aplicarModoOscuro(nuevo)
    setActivo(nuevo)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <div className="flex justify-between items-center">
        <div>
          <p className="font-black text-gray-700">Modo oscuro</p>
          <p className="text-xs text-gray-500">Cambia el tema de todos los modulos administrativos</p>
        </div>
        <button onClick={toggle}
          className={`w-14 h-8 rounded-full flex items-center px-1 transition-colors ${activo ? 'bg-brand justify-end' : 'bg-gray-200 justify-start'}`}>
          <span className="w-6 h-6 bg-white rounded-full shadow-sm" />
        </button>
      </div>
    </div>
  )
}
