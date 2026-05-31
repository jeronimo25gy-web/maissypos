'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const router = useRouter()

  const usuarios = {
    'jero': { clave: 'maissy2024', rol: 'admin', nombre: 'Jero' },
    'auxiliar': { clave: 'aux2024', rol: 'auxiliar', nombre: 'Auxiliar' },
    'vendedor': { clave: 'vend2024', rol: 'vendedor', nombre: 'Vendedor' },
  }

  const handleLogin = () => {
    const u = usuarios[usuario.toLowerCase()]
    if (u && u.clave === clave) {
      localStorage.setItem('maissy_usuario', JSON.stringify({ usuario, ...u }))
      router.push('/dashboard')
    } else {
      alert('Usuario o clave incorrectos')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-orange-500">Maissy</h1>
          <p className="text-gray-500 text-sm mt-1">Sistema de Gestion Operativa</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-gray-600">Usuario</label>
            <input
              type="text"
              value={usuario}
              onChange={e => setUsuario(e.target.value)}
              className="w-full mt-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none text-gray-800"
              placeholder="jero / auxiliar / vendedor"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-600">Contrasena</label>
            <input
              type="password"
              value={clave}
              onChange={e => setClave(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="w-full mt-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none text-gray-800"
              placeholder="..."
            />
          </div>
          <button
            onClick={handleLogin}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-colors text-lg mt-2"
          >
            Entrar
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-6">Maissy Group - Medellin, Colombia</p>
      </div>
    </div>
  )
}
