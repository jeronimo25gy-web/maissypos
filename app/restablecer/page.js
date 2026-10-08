'use client'
import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'

// Llegada desde el enlace de "Olvide mi contrasena": el enlace trae la sesion
// de recuperacion en el #hash (flujo implicito, sirve en cualquier
// dispositivo); se instala con setSession y aqui se pone la clave nueva. El
// cliente principal es PKCE y no lee ese hash por su cuenta. Los enlaces
// viejos con ?code= solo los canjea el navegador donde se pidieron.
export default function Restablecer() {
  const [estado, setEstado] = useState('verificando')
  const [clave, setClave] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let listo = false
    const hash = new URLSearchParams(window.location.hash.slice(1))
    if (hash.get('error_description')) {
      Promise.resolve().then(() => setEstado('invalido'))
      return
    }
    if (hash.get('access_token') && hash.get('refresh_token')) {
      supabase.auth.setSession({ access_token: hash.get('access_token'), refresh_token: hash.get('refresh_token') })
        .then(({ error: err }) => {
          window.history.replaceState(null, '', window.location.pathname)
          setEstado(err ? 'invalido' : 'formulario')
        })
      return
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento, session) => {
      if ((evento === 'PASSWORD_RECOVERY' || evento === 'SIGNED_IN') && session) { listo = true; setEstado('formulario') }
    })
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { listo = true; setEstado('formulario') }
    })
    const t = setTimeout(() => { if (!listo) setEstado('invalido') }, 6000)
    return () => { subscription.unsubscribe(); clearTimeout(t) }
  }, [])

  const guardar = async () => {
    setError('')
    if (clave.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    if (clave !== confirmacion) { setError('Las dos contraseñas no coinciden'); return }
    setGuardando(true)
    const { error: err } = await supabase.auth.updateUser({ password: clave })
    setGuardando(false)
    if (err) { setError('No se pudo cambiar: ' + err.message); return }
    await supabase.auth.signOut()
    setEstado('listo')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sidebar to-brand flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="flex items-center justify-center mb-6">
          <Image src="/maissypos-logo.png" width={220} height={82} alt="MaissyPOS" style={{ width: '220px', height: 'auto' }} priority />
        </div>
        {estado === 'verificando' && <p className="text-center text-gray-500">Verificando el enlace...</p>}
        {estado === 'invalido' && (
          <div className="text-center space-y-4">
            <p className="text-gray-700 font-bold">El enlace venció o ya se usó.</p>
            <p className="text-sm text-gray-500">Pide uno nuevo desde &quot;¿Olvidaste tu contraseña?&quot; y ábrelo apenas te llegue. Cada enlace sirve una sola vez.</p>
            <Link href="/" className="block w-full bg-brand text-white font-bold py-3 rounded-xl">Volver al inicio</Link>
          </div>
        )}
        {estado === 'formulario' && (
          <div className="space-y-4">
            <p className="font-black text-gray-800 text-center">Pon tu nueva contraseña</p>
            <input type="password" value={clave} onChange={e => setClave(e.target.value)} placeholder="Nueva contraseña"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-brand focus:outline-none text-gray-800" />
            <input type="password" value={confirmacion} onChange={e => setConfirmacion(e.target.value)} placeholder="Repítela"
              onKeyDown={e => e.key === 'Enter' && guardar()}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-brand focus:outline-none text-gray-800" />
            {error && <p className="text-sm text-brand">{error}</p>}
            <button onClick={guardar} disabled={guardando}
              className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-3 rounded-xl disabled:opacity-50">
              {guardando ? 'Guardando...' : 'Guardar contraseña'}
            </button>
          </div>
        )}
        {estado === 'listo' && (
          <div className="text-center space-y-4">
            <p className="text-gray-800 font-bold">Listo, tu contraseña quedó cambiada.</p>
            <Link href="/" className="block w-full bg-brand text-white font-bold py-3 rounded-xl">Entrar</Link>
          </div>
        )}
      </div>
    </div>
  )
}
