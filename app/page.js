
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { registrarSesion } from '../lib/sesion'
import { setEmpresaId } from '../lib/empresa'
import { normalizarUsuario } from '../lib/permisos'
import { cargarEmpresasUsuario } from '../lib/empresas-ui'
import { cargarPendientes } from '../lib/pendientes'

export default function Home() {
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [usuarioLogueado, setUsuarioLogueado] = useState(null)
  const [empresas, setEmpresas] = useState([])
  const [pendEmpresa, setPendEmpresa] = useState({})
  const [ultima, setUltima] = useState(null)
  const [recuperando, setRecuperando] = useState(false)
  const [mensajeRecuperar, setMensajeRecuperar] = useState('')
  const [enviandoRecuperar, setEnviandoRecuperar] = useState(false)
  const router = useRouter()

  const irSegunRol = (u) => {
    if (u.rol === 'vendedor') {
      router.push('/mi-ruta')
    } else if (u.rol === 'planta') {
      router.push('/planta')
    } else if (u.rol === 'admin') {
      router.push('/ejecutivo')
    } else {
      router.push('/despacho')
    }
  }

  // Olvide mi contrasena: si el usuario tiene correo real se le manda un
  // enlace; si tiene el correo interno de MaissyPOS, se le avisa a un
  // administrador. El enlace se pide con flujo implicito (la sesion viaja en
  // el propio enlace) para que sirva desde cualquier celular o computador, no
  // solo desde el navegador donde se pidio como pasa con PKCE.
  const recuperarClave = async () => {
    const u = usuario.trim().toLowerCase()
    if (!u) { setMensajeRecuperar('Escribe tu usuario'); return }
    setEnviandoRecuperar(true)
    setMensajeRecuperar('')
    const { data: email } = await supabase.rpc('usuario_a_email', { p_usuario: u })
    if (email && !email.endsWith('@maissypos.internal')) {
      const clienteImplicito = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
      const { error } = await clienteImplicito.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/restablecer` })
      const [nombre, dominio] = email.split('@')
      setMensajeRecuperar(error
        ? 'No se pudo enviar el correo: ' + error.message
        : `Te enviamos un correo a ${nombre.slice(0, 2)}***@${dominio}. Ábrelo y pon tu nueva contraseña.`)
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

    const { data: perfil, error: errorPerfil } = await supabase
      .from('usuarios')
      .select('id, usuario, nombre, rol, modulos, empresas, vendedor_nombre, puede_aprobar_inventario')
      .eq('auth_user_id', authData.user.id)
      .single()

    if (errorPerfil || !perfil) {
      alert('No se pudo cargar tu perfil. Contacta a un administrador.')
      setEntrando(false)
      return
    }

    // Gerencia entra como administrador con acceso total; los demás, con los permisos de su rol.
    const { data: permisos } = await supabase.from('roles_permisos').select('rol, modulos')
    const u = normalizarUsuario(perfil, Object.fromEntries((permisos || []).map(p => [p.rol, p.modulos])))
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
      // Logos sin el blanco sobrante, y la ultima empresa usada en este equipo.
      setUltima(localStorage.getItem('maissy_empresa'))
      setEmpresas(await cargarEmpresasUsuario(u))
      setUsuarioLogueado(u)
      setEntrando(false)
      if (u.gerencia || ['admin', 'auxiliar'].includes(u.rol)) accesibles.forEach(e => cargarPendientes([e.id]).then(items => setPendEmpresa(p => ({ ...p, [e.id]: items.length }))).catch(() => {}))
    }
  }

  const seleccionarEmpresa = (empresaId) => {
    setEmpresaId(empresaId)
    irSegunRol(usuarioLogueado)
  }

  // Enter entra a la ultima empresa usada.
  useEffect(() => {
    if (!usuarioLogueado) return
    const tecla = (e) => { if (e.key === 'Enter' && ultima && empresas.some(x => x.id === ultima)) seleccionarEmpresa(ultima) }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [usuarioLogueado, ultima, empresas]) // eslint-disable-line react-hooks/exhaustive-deps

  if (usuarioLogueado) {
    const nombre = (usuarioLogueado.nombre || '').split(' ')[0]
    const hayUltima = empresas.some(e => e.id === ultima)
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: '#F3F1EA', color: '#1C1B19' }}>
        <div className="w-full max-w-[400px] flex flex-col gap-3">
          <Image src="/maissypos-logo.png" width={170} height={63} alt="MaissyPOS" className="self-center" style={{ width: '170px', height: 'auto' }} priority />
          <h1 className="text-center font-extrabold text-[21px] leading-tight mb-1" style={{ fontFamily: 'var(--font-titulo), Georgia, serif', textWrap: 'balance' }}>Hola, {nombre}. ¿En qué empresa trabajas?</h1>
          <div className="flex flex-col gap-2">
            {empresas.map(e => {
              const n = pendEmpresa[e.id]
              const esUltima = e.id === ultima
              return (
                <button key={e.id} type="button" onClick={() => seleccionarEmpresa(e.id)}
                  className="grid items-center gap-3 rounded-2xl bg-white py-2.5 pl-2.5 pr-3.5 text-left"
                  style={{ gridTemplateColumns: '72px minmax(0,1fr) auto', boxShadow: esUltima ? 'inset 0 0 0 2px #1C1B19' : undefined }}>
                  <span className="h-11 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {e.logo ? <img src={e.logo} alt="" className="max-h-11 max-w-[72px] w-auto" /> : <b style={{ color: '#C41230' }}>{e.corto}</b>}
                  </span>
                  <span className="min-w-0">
                    <b className="block text-[15.5px] truncate">{e.nombre}</b>
                    {n != null && <span className="block text-[12.5px]" style={n > 0 ? { color: '#C41230', fontWeight: 700 } : { color: '#5A5750', fontWeight: 600 }}>{n > 0 ? `${n} pendientes` : 'Al día'}</span>}
                  </span>
                  {esUltima && <span className="text-[10.5px] font-extrabold uppercase tracking-[.08em]" style={{ color: '#5A5750' }}>Última</span>}
                </button>
              )
            })}
          </div>
          {hayUltima && <span className="text-center text-[12px]" style={{ color: '#5A5750' }}>Enter entra a la última que usaste</span>}
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
              <p className="text-sm text-gray-600">Ingrese su usuario y seleccione Recuperar.</p>
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

