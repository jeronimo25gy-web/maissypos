'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { registrarSesion } from '@/lib/sesion'
import { setEmpresaId } from '@/lib/empresa'
import { normalizarUsuario } from '@/lib/permisos'
import { cargarEmpresasUsuario } from '@/lib/empresas-ui'
import { cargarPendientes } from '@/lib/pendientes'

// Acceso a MaissyPOS: usuario y contraseña, y despues escoger empresa si
// maneja varias. Se usa en /entrar y en el panel flotante de la pagina
// comercial (enPanel), sin cambiar de pantalla.
export default function Acceso({ enPanel = false }) {
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
  const [verClave, setVerClave] = useState(false)
  const [recordar, setRecordar] = useState(true)
  const [error, setError] = useState('')
  const router = useRouter()

  const irSegunRol = (u) => {
    if (u.rol === 'plataforma') {
      router.push('/plataforma')
    } else if (u.rol === 'vendedor') {
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

  // Recordar usuario: queda escrito la proxima vez en este equipo.
  useEffect(() => {
    try { const r = localStorage.getItem('maissy_recordar_usuario'); if (r) setUsuario(r); else if (r === '') setRecordar(false) } catch { /* sin recordar */ }
  }, [])

  const handleLogin = async () => {
    if (!usuario || !clave) { setError('Escribe tu usuario y tu contraseña.'); return }
    setError('')
    setEntrando(true)
    try { localStorage.setItem('maissy_recordar_usuario', recordar ? usuario.trim() : '') } catch { /* sin recordar */ }

    const { data: email } = await supabase.rpc('usuario_a_email', { p_usuario: usuario.toLowerCase() })
    if (!email) {
      setError('Usuario o contraseña incorrectos.')
      setEntrando(false)
      return
    }

    const { data: authData, error: errorAuth } = await supabase.auth.signInWithPassword({ email, password: clave })
    if (errorAuth || !authData?.user) {
      setError('Usuario o contraseña incorrectos.')
      setEntrando(false)
      return
    }

    const { data: perfil, error: errorPerfil } = await supabase
      .from('usuarios')
      .select('id, usuario, nombre, rol, modulos, empresas, cliente_id, vendedor_nombre, puede_aprobar_inventario')
      .eq('auth_user_id', authData.user.id)
      .single()

    if (errorPerfil || !perfil) {
      setError('No se pudo cargar tu perfil. Avísale a un administrador.')
      setEntrando(false)
      return
    }

    // Gerencia entra como administrador con acceso total; los demás, con los permisos de su rol.
    const { data: permisos } = await supabase.from('roles_permisos').select('rol, modulos')
    const u = normalizarUsuario(perfil, Object.fromEntries((permisos || []).map(p => [p.rol, p.modulos])))
    localStorage.setItem('maissy_usuario', JSON.stringify(u))
    await registrarSesion(u.id)

    // El dueño de MaissyPOS no trabaja en ninguna empresa: va a su consola.
    if (u.rol === 'plataforma') { irSegunRol(u); return }

    const { data: empresasData } = await supabase.from('empresas').select('*').eq('activo', true).order('nombre')
    const accesibles = (empresasData || []).filter(e => !u.empresas || u.empresas.includes(e.id))

    if (accesibles.length === 0) {
      setError('Tu usuario no tiene ninguna empresa asignada. Avísale a un administrador.')
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
      <div className="w-full max-w-[400px] flex flex-col gap-3" style={{ color: '#1C1B19' }}>
        <div className="contents">
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

  const campo = 'w-full min-h-[50px] rounded-[14px] bg-white px-3.5 text-[16px] font-medium outline-none'
  const borde = (foco) => ({ boxShadow: `inset 0 0 0 ${foco ? 2 : 1.5}px ${foco ? '#1C1B19' : '#E3E1D8'}`, color: '#1C1B19' })
  return (
        <form className="w-full max-w-[380px] flex flex-col gap-4" onSubmit={e => { e.preventDefault(); handleLogin() }}>
          {!enPanel && <Image src="/maissypos-logo.png" width={200} height={74} alt="MaissyPOS" style={{ width: '200px', height: 'auto' }} priority />}
          <h2 className="m-0 font-extrabold text-[28px]" style={{ fontFamily: 'var(--font-titulo), Georgia, serif' }}>Hola de nuevo</h2>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="usuario" className="text-[13px] font-bold" style={{ color: '#5A5750' }}>Usuario</label>
            <input id="usuario" type="text" autoComplete="username" autoCapitalize="none" value={usuario} onChange={e => setUsuario(e.target.value)} placeholder="Tu usuario"
              className={campo} style={borde(false)} onFocus={e => Object.assign(e.target.style, borde(true))} onBlur={e => Object.assign(e.target.style, borde(false))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="clave" className="text-[13px] font-bold" style={{ color: '#5A5750' }}>Contraseña</label>
            <div className="flex items-center rounded-[14px] bg-white pr-1.5" style={borde(false)}>
              <input id="clave" type={verClave ? 'text' : 'password'} autoComplete="current-password" value={clave} onChange={e => setClave(e.target.value)} placeholder="Tu contraseña"
                className="flex-1 min-w-0 min-h-[50px] bg-transparent px-3.5 text-[16px] font-medium outline-none" style={{ color: '#1C1B19' }} />
              <button type="button" onClick={() => setVerClave(!verClave)} className="min-h-[44px] px-2.5 text-[13px] font-bold" style={{ color: '#5A5750' }} aria-pressed={verClave}>{verClave ? 'Ocultar' : 'Ver'}</button>
            </div>
          </div>
          {error && <p className="m-0 text-[13.5px] font-semibold pl-2.5" style={{ color: '#C41230', borderLeft: '3px solid #C41230' }} role="alert">{error}</p>}
          <div className="flex flex-wrap justify-between items-center gap-2 text-[14px]" style={{ color: '#5A5750' }}>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={recordar} onChange={e => setRecordar(e.target.checked)} className="w-[18px] h-[18px]" style={{ accentColor: '#1C1B19' }} />Recordar usuario</label>
            <button type="button" onClick={() => { setRecuperando(!recuperando); setMensajeRecuperar('') }} className="font-bold underline underline-offset-[3px]" style={{ color: '#1C1B19' }}>¿Olvidaste tu contraseña?</button>
          </div>
          {recuperando && (
            <div className="rounded-2xl bg-white p-4 flex flex-col gap-3">
              <p className="m-0 text-[14px]" style={{ color: '#5A5750' }}>Escribe tu usuario arriba y toca Recuperar.</p>
              {mensajeRecuperar && <p className="m-0 text-[14px] font-semibold">{mensajeRecuperar}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setRecuperando(false)} className="flex-1 min-h-[44px] rounded-xl font-bold text-[14px]" style={{ background: '#EFEDE6' }}>Cancelar</button>
                <button type="button" onClick={recuperarClave} disabled={enviandoRecuperar} className="flex-1 min-h-[44px] rounded-xl font-bold text-[14px] disabled:opacity-50" style={{ background: '#EFEDE6' }}>{enviandoRecuperar ? 'Enviando…' : 'Recuperar'}</button>
              </div>
            </div>
          )}
          <button type="submit" disabled={entrando} className="min-h-[52px] rounded-2xl text-white font-extrabold text-[16px] disabled:opacity-60" style={{ background: '#C41230' }}>
            {entrando ? 'Entrando…' : 'Entrar'}
          </button>
          <p className="m-0 text-center text-[13px]" style={{ color: '#5A5750' }}>Sistema de gestión para tu negocio</p>
        </form>
  )
}
