
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
  const [recuperando, setRecuperando] = useState(false)
  const [mensajeRecuperar, setMensajeRecuperar] = useState('')
  const [enviandoRecuperar, setEnviandoRecuperar] = useState(false)
  const router = useRouter()

  const irSegunRol = (u) => {
    if (u.rol === 'vendedor') {
      router.push('/kiosco')
    } else if (u.rol === 'admin') {
      router.push('/ejecutivo')
    } else {
      router.push('/despacho')
    }
  }

  // Olvide mi contrasena: si el usuario tiene correo real se le manda un
  // enlace (se pide desde este navegador, donde debe abrirse); si tiene el
  // correo interno de MaissyPOS, se le avisa a un administrador.
  const recuperarClave = async () => {
    const u = usuario.trim().toLowerCase()
    if (!u) { setMensajeRecuperar('Escribe tu usuario'); return }
    setEnviandoRecuperar(true)
    setMensajeRecuperar('')
    const { data: email } = await supabase.rpc('usuario_a_email', { p_usuario: u })
    if (email && !email.endsWith('@maissypos.internal')) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/restablecer` })
      const [nombre, dominio] = email.split('@')
      setMensajeRecuperar(error
        ? 'No se pudo enviar el correo: ' + error.message
        : `Te enviamos un correo a ${nombre.slice(0, 2)}***@${dominio}. Ábrelo en este mismo celular o computador.`)
    } else {
      await fetch('/api/olvide-clave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: u }) }).catch(() => {})
      setMensajeRecuperar('Listo. Le avisamos a un administrador para que te asigne una contraseña nueva.')
    }
    setEnviandoRecuperar(false)
  }

  const handleLogin = async () => {
    if (!usuario || !clave) return
    setEntrando(true)

    const { data: email } = await supabase.rpc('usuario_a_email', { p_usuario: usuario.toLowerCase() })
    if (!email) {
      alert('Usuario o clave incorrectos')
      setEntrando(false)
      return
    }

    const { data: authData, error: errorAuth } = await supabase.auth.signInWithPassword({ email, password: clave })
    if (errorAuth || !authData?.user) {
      alert('Usuario o clave incorrectos')
      setEntrando(false)
      return
    }

    const { data: u, error: errorPerfil } = await supabase
      .from('usuarios')
      .select('id, usuario, nombre, rol, modulos, empresas, vendedor_nombre, puede_aprobar_inventario')
      .eq('auth_user_id', authData.user.id)
      .single()

    if (errorPerfil || !u) {
      alert('No se pudo cargar tu perfil. Contacta a un administrador.')
      setEntrando(false)
      return
    }

    localStorage.setItem('maissy_usuario', JSON.stringify(u))
    await registrarSesion(u.id)

    const { data: empresasData } = await supabase.from('empresas').select('*').eq('activo', true).order('nombre')
    const accesibles = (empresasData || []).filter(e => !u.empresas || u.empresas.includes(e.id))

    if (accesibles.length === 0) {
      alert('Tu usuario no tiene ninguna empresa activa asignada. Contacta a un administrador.')
      setEntrando(false)
      return
    }
    if (accesibles.length === 1) {
      setEmpresaId(accesibles[0].id)
      irSegunRol(u)
    } else {
      setUsuarioLogueado(u)
      setEmpresas(accesibles)
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
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.logo_url} alt={e.nombre} width={40} height={40} className="rounded-lg object-contain" />
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
          <div className="flex items-center justify-center">
            <Image src="/maissypos-logo.png" width={260} height={97} alt="MaissyPOS"
              style={{ background: 'transparent', width: '260px', height: 'auto' }} priority />
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
          {!recuperando ? (
            <button type="button" onClick={() => { setRecuperando(true); setMensajeRecuperar('') }} className="w-full text-sm text-gray-500 hover:text-brand font-semibold">
              ¿Olvidaste tu contraseña?
            </button>
          ) : (
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <p className="text-sm text-gray-600">Escribe tu usuario arriba y toca Recuperar.</p>
              {mensajeRecuperar && <p className="text-sm font-semibold text-gray-800">{mensajeRecuperar}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setRecuperando(false)} className="flex-1 bg-gray-200 text-gray-600 font-bold py-2 rounded-lg text-sm">Cancelar</button>
                <button type="button" onClick={recuperarClave} disabled={enviandoRecuperar}
                  className="flex-1 bg-gray-800 text-white font-bold py-2 rounded-lg text-sm disabled:opacity-50">
                  {enviandoRecuperar ? 'Enviando...' : 'Recuperar'}
                </button>
              </div>
            </div>
          )}
        </div>
        <p className="text-center text-xs text-gray-400 mt-6">Maissy Group - Medellin, Colombia</p>
      </div>
    </div>
  )
}

