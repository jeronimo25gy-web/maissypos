'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Configuracion() {
  const [usuario, setUsuario] = useState(null)
  const [usuarios, setUsuarios] = useState([])
  const [sesiones, setSesiones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [editando, setEditando] = useState(null)
  const [nuevaClave, setNuevaClave] = useState('')
  const [guardandoClave, setGuardandoClave] = useState(false)
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
    const { data: usuariosData } = await supabase
      .from('usuarios')
      .select('id, usuario, nombre, rol, vendedor_nombre, activo, created_at')
      .order('usuario')
    const { data: sesionesData } = await supabase
      .from('sesiones_activas')
      .select('*, usuarios(usuario, nombre)')
      .order('ultimo_acceso', { ascending: false })
    if (usuariosData) setUsuarios(usuariosData)
    if (sesionesData) setSesiones(sesionesData)
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

  if (!usuario) return null

  return (
    <div>
      <div className="bg-white shadow-sm px-6 py-4 sticky top-0 z-10">
        <h1 className="text-xl font-black text-gray-900">Configuración</h1>
        <p className="text-xs text-gray-500">Usuarios y sesiones</p>
      </div>

      <div className="p-4 max-w-3xl mx-auto">
        {cargando ? (
          <p className="text-gray-400 text-center py-10">Cargando...</p>
        ) : (
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
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand" />
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
        )}
      </div>
    </div>
  )
}
