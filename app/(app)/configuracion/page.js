'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { puedeVerModulo, nombreRol } from '@/lib/permisos'
import { useDestino } from '@/lib/destino'
import { PageHeader } from '@/components/ui'
import { C, Tarjeta, H2, Nota, Boton, campo, campoEstilo, Campo, Pill } from '../gastos/ui'
import Usuarios from './Usuarios'
import Empresa from './Empresa'
import Parametros from './Parametros'

// Configuración: empresa, usuarios y permisos, parámetros de operación,
// facturación electrónica y mi cuenta. Gerencia administra todo; los demás
// solo ven Mi cuenta. La pantalla de antes quedó en /configuracion-anterior.
const SECCIONES = [['empresa', 'Empresa'], ['usuarios', 'Usuarios y permisos'], ['parametros', 'Parámetros de operación'], ['facturacion', 'Facturación electrónica'], ['cuenta', 'Mi cuenta']]
const SUPERADMINS = ['jero', 'kathe']

export default function Configuracion() {
  const router = useRouter()
  const [usuario, setUsuario] = useState(null)
  const [empresa, setEmpresa] = useState(null)
  const [sec, setSec] = useState('empresa')
  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('maissy_usuario') || 'null')
    if (!u) { router.push('/entrar'); return }
    if (!puedeVerModulo(u, 'configuracion', ['admin'])) { router.push('/despacho'); return }
    setUsuario(u)
    if (!(u.gerencia || SUPERADMINS.includes(u.usuario))) setSec('cuenta')
    supabase.from('empresas').select('id, nombre').eq('id', getEmpresaId()).maybeSingle().then(({ data }) => setEmpresa(data))
  }, [router])
  useDestino('vista', (v) => { if (v === 'cuenta' || (SECCIONES.some(s => s[0] === v) && (usuario.gerencia || SUPERADMINS.includes(usuario.usuario)))) setSec(v) }, !!usuario)
  if (!usuario) return null
  const gerencia = !!usuario.gerencia || SUPERADMINS.includes(usuario.usuario)
  const secciones = gerencia ? SECCIONES : SECCIONES.filter(([k]) => k === 'cuenta')

  return (
    <div style={{ background: C.fondo, color: C.tinta }} className="min-h-screen">
      <PageHeader title="Configuración" subtitle={empresa?.nombre} />
      <div className="p-4 max-w-6xl mx-auto flex flex-col gap-4">
        <div className="flex flex-col md:flex-row gap-4 items-start">
          <nav className="bg-white rounded-[18px] p-2 flex md:flex-col gap-1 w-full md:w-[230px] md:shrink-0 overflow-x-auto" aria-label="Secciones">
            {secciones.map(([k, n]) => (
              <button key={k} type="button" aria-pressed={sec === k} onClick={() => setSec(k)} className="text-left rounded-xl min-h-[42px] px-3 text-sm font-bold whitespace-nowrap"
                style={sec === k ? { background: C.tinta, color: '#fff' } : { color: C.gris }}>{n}</button>
            ))}
          </nav>
          <div className="flex-1 min-w-0 w-full">
            {sec === 'empresa' && gerencia && <Empresa />}
            {sec === 'usuarios' && gerencia && <Usuarios adminActual={usuario} />}
            {sec === 'parametros' && gerencia && <Parametros />}
            {sec === 'facturacion' && gerencia && <Facturacion />}
            {sec === 'cuenta' && <MiCuenta usuario={usuario} />}
          </div>
        </div>
      </div>
    </div>
  )
}

function Facturacion() {
  const [probando, setProbando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')
  const probar = async () => {
    setProbando(true); setError(''); setResultado(null)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/siigo', { headers: { Authorization: `Bearer ${session?.access_token}` } })
    const json = await res.json().catch(() => ({}))
    setProbando(false)
    if (!res.ok) { setError(json.error || 'Error desconocido'); return }
    setResultado(json)
  }
  return (
    <Tarjeta>
      <div className="flex justify-between gap-2 items-center flex-wrap"><H2>Facturación electrónica · Siigo</H2><Pill tono={resultado ? 'verde' : error ? 'rojo' : 'ambar'}>{resultado ? 'Conectado' : error ? 'Sin conexión' : 'Sin probar'}</Pill></div>
      <Nota>Primero se prueba la conexión para ver el tipo de comprobante, el vendedor y las formas de pago que existen en la cuenta de Siigo; esos datos se necesitan antes de enviar la primera factura. Las ventas de mostrador con NIT del cliente se envían a Siigo; las de ruta a consumidor final siguen con ticket.</Nota>
      <div><Boton tono="rojo" onClick={probar} disabled={probando}>{probando ? 'Probando…' : 'Probar conexión'}</Boton></div>
      {error && <p className="text-sm" style={{ color: C.rojo }}><b>{error}</b>{error.includes('SIIGO_') && <span className="block" style={{ color: C.gris }}>Falta configurar SIIGO_USERNAME y SIIGO_ACCESS_KEY en Vercel.</span>}</p>}
      {resultado && <pre className="text-xs rounded-[14px] p-3 overflow-x-auto whitespace-pre-wrap" style={{ background: C.fondo }}>{JSON.stringify(resultado, null, 2)}</pre>}
    </Tarjeta>
  )
}

function MiCuenta({ usuario }) {
  const [clave, setClave] = useState('')
  const [repetir, setRepetir] = useState('')
  const [guardando, setGuardando] = useState(false)
  const cambiar = async () => {
    if (clave.length < 4) { alert('La contraseña debe tener al menos 4 caracteres.'); return }
    if (clave !== repetir) { alert('Las dos contraseñas no coinciden.'); return }
    setGuardando(true)
    const { error } = await supabase.auth.updateUser({ password: clave })
    setGuardando(false)
    if (error) { alert('No se pudo cambiar: ' + error.message); return }
    setClave(''); setRepetir(''); alert('Su contraseña fue actualizada.')
  }
  const cerrarOtros = async () => {
    if (!confirm('¿Cerrar su sesión en los demás equipos? Este queda abierto.')) return
    const { error } = await supabase.auth.signOut({ scope: 'others' })
    if (error) { alert('No se pudo: ' + error.message); return }
    alert('Listo. Los demás equipos le pedirán entrar de nuevo.')
  }
  const filas = [['Nombre', usuario.nombre], ['Usuario', usuario.usuario], ['Rol', `${nombreRol(usuario)}${usuario.vendedor_nombre ? ` · ${usuario.vendedor_nombre}` : ''}`]]
  return (
    <Tarjeta>
      <H2>Mi cuenta</H2>
      <div>{filas.map(([r, v]) => <div key={r} className="flex justify-between gap-3 py-2 text-sm" style={{ borderBottom: `1px solid ${C.linea}` }}><span style={{ color: C.gris }}>{r}</span><b className="text-right">{v}</b></div>)}</div>
      <div className="grid gap-2.5 items-end" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <Campo etiqueta="Nueva contraseña"><input type="password" value={clave} onChange={e => setClave(e.target.value)} className={campo} style={campoEstilo} /></Campo>
        <Campo etiqueta="Repita la contraseña"><input type="password" value={repetir} onChange={e => setRepetir(e.target.value)} className={campo} style={campoEstilo} /></Campo>
        <Boton tono="rojo" onClick={cambiar} disabled={guardando || !clave}>{guardando ? 'Guardando…' : 'Cambiar contraseña'}</Boton>
      </div>
      <div><Boton onClick={cerrarOtros}>Cerrar sesión en los demás equipos</Boton></div>
    </Tarjeta>
  )
}
