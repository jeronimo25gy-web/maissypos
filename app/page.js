
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '../lib/supabase'
import { registrarSesion } from '../lib/sesion'
import { setEmpresaId } from '../lib/empresa'

export default function Home() {
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [usuarioLogueado, setUsuarioLogueado] = useState(null)
  const [empresas, setEmpresas] = useState([])
  const router = useRouter()

  const irSegunRol = (u) => {
    if (u.rol === 'vendedor') {
      router.push('/kiosco')
    } else if (u.rol === 'admin') {
      router.push('/ejecutivo')
    } else {
      router.push('/dashboard')
    }
  }

  const handleLogin = async () => {
    if (!usuario || !clave) return
    setEntrando(true)
    const { data, error } = await supabase.rpc('login_usuario', {
      p_usuario: usuario.toLowerCase(),
      p_password: clave
    })
    const u = data && data[0]
    if (!error && u) {
      const { data: extra } = await supabase.from('usuarios').select('modulos, empresas').eq('id', u.id).single()
      if (extra) { u.modulos = extra.modulos; u.empresas = extra.empresas }
      localStorage.setItem('maissy_usuario', JSON.stringify(u))
      await registrarSesion(u.id)

      const { data: empresasData } = await supabase.from('empresas').select('*').eq('activo', true).order('nombre')
      const accesibles = (empresasData || []).filter(e => !u.empresas || u.empresas.includes(e.id))

      if (accesibles.length <= 1) {
        if (accesibles.length === 1) setEmpresaId(accesibles[0].id)
        irSegunRol(u)
      } else {
        setUsuarioLogueado(u)
        setEmpresas(accesibles)
        setEntrando(false)
      }
    } else {
      alert('Usuario o clave incorrectos')
      setEntrando(false)
    }
  }

  const seleccionarEmpresa = (empresaId) => {
    setEmpresaId(empresaId)
    irSegunRol(usuarioLogueado)
  }

  if (usuarioLogueado) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sidebar to-brand flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-black text-gray-900">Selecciona una empresa</h1>
            <p className="text-gray-500 text-sm mt-1">Hola, {usuarioLogueado.nombre}</p>
          </div>
          <div className="space-y-3">
            {empresas.map(e => (
              <button key={e.id} onClick={() => seleccionarEmpresa(e.id)}
                className="w-full flex items-center gap-3 border-2 border-gray-200 hover:border-brand rounded-xl p-4 text-left transition-colors">
                {e.logo_url ? (
                  <Image src={e.logo_url} width={40} height={40} alt={e.nombre} className="rounded-lg object-contain" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-sidebar flex items-center justify-center text-white font-black">
                    {e.nombre.charAt(0)}
                  </div>
                )}
                <span className="font-bold text-gray-800">{e.nombre}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sidebar to-brand flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2">
            <Image src="/Maissy_M_Registrada.png" width={32} height={32} alt="Maissy" />
            <h1 className="text-4xl font-black text-brand">MaissyPOS</h1>
          </div>
          <p className="text-gray-500 text-sm mt-1">Sistema de Gestion Operativa</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-gray-600">Usuario</label>
            <input type="text" value={usuario} onChange={e => setUsuario(e.target.value)}
              className="w-full mt-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-brand focus:outline-none text-gray-800"
              placeholder="Tu usuario" />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-600">Contrasena</label>
            <input type="password" value={clave} onChange={e => setClave(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="w-full mt-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-brand focus:outline-none text-gray-800"
              placeholder="..." />
          </div>
          <button onClick={handleLogin} disabled={entrando}
            className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-3 rounded-xl transition-colors text-lg mt-2 disabled:opacity-50">
            {entrando ? 'Entrando...' : 'Entrar'}
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-6">Maissy Group - Medellin, Colombia</p>
      </div>
    </div>
  )
}

