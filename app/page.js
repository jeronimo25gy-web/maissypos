
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '../lib/supabase'
import { registrarSesion } from '../lib/sesion'

export default function Home() {
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [entrando, setEntrando] = useState(false)
  const router = useRouter()

  const handleLogin = async () => {
    if (!usuario || !clave) return
    setEntrando(true)
    const { data, error } = await supabase.rpc('login_usuario', {
      p_usuario: usuario.toLowerCase(),
      p_password: clave
    })
    const u = data && data[0]
    if (!error && u) {
      localStorage.setItem('maissy_usuario', JSON.stringify(u))
      await registrarSesion(u.id)
      if (u.rol === 'vendedor') {
        router.push('/kiosco')
      } else if (u.rol === 'admin') {
        router.push('/ejecutivo')
      } else {
        router.push('/dashboard')
      }
    } else {
      alert('Usuario o clave incorrectos')
      setEntrando(false)
    }
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

