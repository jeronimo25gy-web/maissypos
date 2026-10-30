'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { MODULOS } from '@/components/Sidebar'
import { TIPOS_TAREA, ROLES_TAREA, cargarRepartoTareas } from '@/lib/tareas-rol'
import { C, Pill, Kpi, Kpis, Tarjeta, H2, Nota, Boton, campo, campoEstilo, Campo, Segmento, Tabla, td } from '../gastos/ui'

// Usuarios y permisos: usuarios con rol, empresas, acceso personalizado,
// último acceso y sesiones (cierre a distancia), y la tabla de permisos por
// rol. Solo Gerencia administra esta sección.
export const ROLES = ['gerencia', 'admin', 'auxiliar', 'vendedor', 'planta']
export const NOMBRE_ROL = { gerencia: 'Gerencia', admin: 'Administrador', auxiliar: 'Auxiliar', vendedor: 'Vendedor', planta: 'Planta', plataforma: 'Plataforma' }
// El usuario es el correo de acceso ({usuario}@maissypos.internal): sin espacios, tildes ni ñ.
const USUARIO_VALIDO = /^[a-z0-9._-]+$/
const MENSAJE_USUARIO_INVALIDO = 'El usuario solo puede tener letras sin tilde, números, punto, guion o guion bajo (sin espacios ni ñ). Ejemplo: juanperez'
const SUPERADMINS = ['jero', 'kathe']
const compartenEmpresa = (deAdmin, delOtro) => !deAdmin ? true : !delOtro ? false : delOtro.some(id => deAdmin.includes(id))
const haceCuanto = (f) => {
  if (!f) return null
  const min = Math.round((Date.now() - new Date(f)) / 60000)
  if (min < 60) return { t: min <= 1 ? 'Ahora' : `Hace ${min} min`, tono: 'verde' }
  const d = new Date(f), hoy = new Date()
  if (d.toDateString() === hoy.toDateString()) return { t: `Hoy ${d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}`, tono: 'verde' }
  const dias = Math.floor((hoy - d) / 864e5)
  return { t: dias <= 1 ? 'Ayer' : `Hace ${dias} días`, tono: dias >= 7 ? 'ambar' : 'gris' }
}
async function api(accion, cuerpo) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/admin-usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ accion, ...cuerpo }) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Error')
  return json
}

export default function Usuarios({ adminActual }) {
  const [d, setD] = useState(null)
  const [editando, setEditando] = useState(null) // { u, panel: 'datos'|'clave'|'accesos'|'empresas' }
  const [nuevo, setNuevo] = useState(null)
  const [verInactivos, setVerInactivos] = useState(false)

  const cargar = useCallback(async () => {
    const [{ data: us }, { data: ses }, { data: emps }] = await Promise.all([
      supabase.from('usuarios').select('id, usuario, nombre, rol, vendedor_nombre, activo, modulos, empresas, created_at, puede_aprobar_inventario').order('nombre'),
      supabase.from('sesiones_activas').select('*').order('ultimo_acceso', { ascending: false }),
      supabase.from('empresas').select('id, nombre').eq('activo', true).order('nombre'),
    ])
    setD({
      usuarios: (us || []).filter(u => compartenEmpresa(adminActual?.empresas, u.empresas)),
      sesiones: ses || [],
      empresas: (emps || []).filter(e => !adminActual?.empresas || adminActual.empresas.includes(e.id)),
    })
  }, [adminActual])
  useEffect(() => { cargar() }, [cargar])
  if (!d) return <Nota>Cargando usuarios…</Nota>

  const ultimo = (u) => d.sesiones.find(s => s.usuario_id === u.id)
  const abiertas = (u) => d.sesiones.filter(s => s.usuario_id === u.id && s.activo).length
  const activos = d.usuarios.filter(u => u.activo)
  const quietos = activos.filter(u => { const s = ultimo(u); return !s || Date.now() - new Date(s.ultimo_acceso) > 7 * 864e5 })
  const lista = d.usuarios.filter(u => verInactivos || u.activo)
  const nombreEmpresas = (u) => u.empresas ? (d.empresas.filter(e => u.empresas.includes(e.id)).map(e => e.nombre.replace(/ SAS$/i, '')).join(', ') || 'Sin empresa') : 'Todas'
  const conteo = Object.fromEntries(ROLES.map(r => [r, activos.filter(u => u.rol === r).length]))

  const alternarActivo = async (u) => {
    if (u.activo && !confirm(`¿Desactivar a ${u.nombre}? No podrá entrar; lo que registró se conserva.`)) return
    const { error } = await supabase.from('usuarios').update({ activo: !u.activo }).eq('id', u.id)
    if (error) { alert('Error: ' + error.message); return }
    cargar()
  }
  const alternarInventario = async (u) => {
    if (!u.puede_aprobar_inventario && !confirm(`¿Darle a ${u.nombre} permiso para aprobar o rechazar ajustes de inventario?`)) return
    const { error } = await supabase.from('usuarios').update({ puede_aprobar_inventario: !u.puede_aprobar_inventario }).eq('id', u.id)
    if (error) { alert('Error: ' + error.message); return }
    cargar()
  }
  const eliminar = async (u) => {
    if (!confirm(`¿Eliminar definitivamente a ${u.nombre} (${u.usuario})?\n\nSe borra el usuario y su acceso; no se puede deshacer. Lo que ya registró se conserva con su nombre.\n\nSi solo no debe entrar más, use Desactivar.`)) return
    try { await api('eliminar_usuario', { usuario_id: u.id }); cargar() } catch (e) { alert('No se pudo eliminar: ' + e.message) }
  }
  const cerrarSesiones = async (u) => {
    if (!confirm(`¿Cerrar las sesiones de ${u.nombre} en todos sus equipos? Tendrá que volver a entrar (en máximo una hora se le pide).`)) return
    const { error } = await supabase.rpc('cerrar_sesiones_usuario', { p_usuario_id: u.id })
    if (error) { alert('No se pudo cerrar: ' + error.message); return }
    cargar()
  }

  return (
    <div className="flex flex-col gap-4">
      <Kpis>
        <Kpi rotulo="Usuarios activos" valor={activos.length} nota={ROLES.filter(r => conteo[r]).map(r => `${conteo[r]} ${NOMBRE_ROL[r].toLowerCase()}`).join(' · ')} />
        <Kpi rotulo="Sesiones abiertas" valor={d.sesiones.filter(s => s.activo).length} nota="Se pueden cerrar a distancia" />
        <Kpi rotulo="Sin entrar hace 7 días" valor={quietos.length} rojo={quietos.length > 0} nota={quietos.slice(0, 3).map(u => u.nombre).join(', ') || 'Todos activos'} />
      </Kpis>
      {nuevo && <NuevoUsuario form={nuevo} setForm={setNuevo} empresas={d.empresas} recargar={cargar} />}
      <Tarjeta>
        <div className="flex justify-between gap-2 items-center flex-wrap">
          <H2>Usuarios</H2>
          <span className="flex gap-3 items-center flex-wrap">
            <label className="flex gap-2 items-center text-sm cursor-pointer"><input type="checkbox" checked={verInactivos} onChange={e => setVerInactivos(e.target.checked)} className="w-[18px] h-[18px]" style={{ accentColor: C.tinta }} />Incluir inactivos</label>
            {!nuevo && <Boton tono="rojo" onClick={() => setNuevo({ nombre: '', usuario: '', clave: '', rol: 'vendedor', empresaId: d.empresas[0]?.id || '' })}>+ Usuario</Boton>}
          </span>
        </div>
        <Tabla columnas={['Usuario', { t: 'Rol', izq: true }, { t: 'Empresas', izq: true }, 'Último acceso', '']} min={700}>
          {lista.map(u => {
            const s = ultimo(u), h = haceCuanto(s?.ultimo_acceso)
            const abierto = editando?.u.id === u.id
            return [
              <tr key={u.id} style={{ opacity: u.activo ? 1 : 0.55, background: abierto ? C.fondo : undefined }}>
                <td style={td(true)}><b>{u.nombre}</b><span className="block text-[12.5px]" style={{ color: C.gris }}>{u.usuario}{!u.activo ? ' · inactivo' : ''}</span></td>
                <td style={td(true)}>{NOMBRE_ROL[u.rol]}{u.vendedor_nombre ? <span className="block text-[12.5px]" style={{ color: C.gris }}>{u.vendedor_nombre}</span> : null}{u.modulos && <span className="block text-[12.5px]" style={{ color: C.ambar }}>Acceso personalizado</span>}{u.puede_aprobar_inventario && u.rol !== 'gerencia' && <span className="block text-[12.5px]" style={{ color: C.gris }}>Aprueba ajustes de inventario</span>}</td>
                <td style={td(true)}>{nombreEmpresas(u)}</td>
                <td style={td()}>{h ? <Pill tono={h.tono}>{h.t}</Pill> : <Pill tono="ambar">Nunca</Pill>}{abiertas(u) > 1 && <span className="block text-[12px] mt-1" style={{ color: C.gris }}>{abiertas(u)} equipos</span>}</td>
                <td style={td()}><button type="button" onClick={() => setEditando(abierto ? null : { u, panel: 'datos' })} className="text-[13px] font-bold">{abierto ? 'Cerrar' : 'Editar'}</button></td>
              </tr>,
              abierto && (
                <tr key={u.id + 'e'}><td colSpan={5} style={{ padding: 12, background: C.fondo, borderBottom: `1px solid ${C.linea}` }}>
                  <EditarUsuario u={u} panel={editando.panel} setPanel={(p) => setEditando({ u, panel: p })} empresas={d.empresas} adminActual={adminActual} recargar={cargar}
                    acciones={{ alternarActivo, alternarInventario, eliminar, cerrarSesiones }} />
                </td></tr>
              ),
            ]
          })}
        </Tabla>
      </Tarjeta>
      <PermisosPorRol usuario={adminActual} />
      <TareasPorRol usuario={adminActual} />
    </div>
  )
}

function NuevoUsuario({ form, setForm, empresas, recargar }) {
  const [guardando, setGuardando] = useState(false)
  const crear = async () => {
    const usuario = form.usuario.trim().toLowerCase()
    if (!usuario || !form.nombre.trim() || !form.clave) { alert('Nombre, usuario y contraseña son obligatorios.'); return }
    if (form.clave.length < 4) { alert('La contraseña debe tener al menos 4 caracteres.'); return }
    if (!USUARIO_VALIDO.test(usuario)) { alert(MENSAJE_USUARIO_INVALIDO); return }
    if (!form.empresaId && form.rol !== 'gerencia') { alert('Seleccione la empresa.'); return }
    setGuardando(true)
    const { data, error } = await supabase.from('usuarios').insert({ usuario, nombre: form.nombre.trim(), rol: form.rol, empresas: form.rol === 'gerencia' ? null : [form.empresaId], activo: true, password_hash: '' }).select('id').single()
    if (error) { setGuardando(false); alert('No se pudo crear: ' + error.message); return }
    try { await api('crear_usuario', { usuario_id: data.id, nueva_clave: form.clave }) } catch (e) { alert('El usuario se creó, pero falló su acceso: ' + e.message) }
    setGuardando(false); setForm(null); recargar()
  }
  return (
    <Tarjeta>
      <div className="flex justify-between gap-2 items-center"><H2>Nuevo usuario</H2><Boton onClick={() => setForm(null)}>Cancelar</Boton></div>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Campo etiqueta="Nombre"><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className={campo} style={campoEstilo} /></Campo>
        <Campo etiqueta="Usuario para entrar"><input value={form.usuario} onChange={e => setForm({ ...form, usuario: e.target.value.toLowerCase() })} placeholder="juanperez" className={campo} style={campoEstilo} /></Campo>
        <Campo etiqueta="Contraseña"><input type="password" value={form.clave} onChange={e => setForm({ ...form, clave: e.target.value })} className={campo} style={campoEstilo} /></Campo>
        <Campo etiqueta="Rol"><select value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value })} className={campo} style={campoEstilo}>{ROLES.map(r => <option key={r} value={r}>{NOMBRE_ROL[r]}</option>)}</select></Campo>
        {form.rol !== 'gerencia' && <Campo etiqueta="Empresa"><select value={form.empresaId} onChange={e => setForm({ ...form, empresaId: e.target.value })} className={campo} style={campoEstilo}><option value="">Seleccione</option>{empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></Campo>}
      </div>
      {form.rol === 'gerencia' && <Nota>Gerencia ve todas las empresas y todos los módulos, y administra usuarios y permisos.</Nota>}
      <div className="flex justify-end"><Boton tono="rojo" onClick={crear} disabled={guardando}>{guardando ? 'Creando…' : 'Crear usuario'}</Boton></div>
    </Tarjeta>
  )
}

function EditarUsuario({ u, panel, setPanel, empresas, adminActual, recargar, acciones }) {
  const [datos, setDatos] = useState({ usuario: u.usuario, nombre: u.nombre, rol: u.rol })
  const [clave, setClave] = useState('')
  const [accesos, setAccesos] = useState(u.modulos || MODULOS.filter(m => u.rol === 'gerencia' || (m.roles || []).includes(u.rol)).map(m => m.id))
  const visiblesIds = empresas.map(e => e.id)
  const [emps, setEmps] = useState(u.empresas ? u.empresas.filter(id => visiblesIds.includes(id)) : visiblesIds)
  const ocultas = u.empresas ? u.empresas.filter(id => !visiblesIds.includes(id)) : []
  const [guardando, setGuardando] = useState(false)
  const correr = async (fn) => { setGuardando(true); try { await fn(); recargar() } catch (e) { alert('No se pudo guardar: ' + e.message) } setGuardando(false) }

  const guardarDatos = () => correr(async () => {
    const usuario = datos.usuario.trim().toLowerCase()
    if (!usuario || !datos.nombre.trim()) throw new Error('usuario y nombre son obligatorios')
    if (!USUARIO_VALIDO.test(usuario)) throw new Error(MENSAJE_USUARIO_INVALIDO)
    const { error } = await supabase.from('usuarios').update({ usuario, nombre: datos.nombre.trim(), rol: datos.rol }).eq('id', u.id)
    if (error) throw new Error(error.message)
    // El correo de acceso sale del usuario; si cambia, se corrige también allá.
    if (usuario !== u.usuario) await api('reparar_email_login', { usuario_id: u.id })
  })
  const guardarClave = () => correr(async () => {
    if (clave.length < 4) throw new Error('la contraseña debe tener al menos 4 caracteres')
    await api('reset_password', { usuario_id: u.id, nueva_clave: clave })
    setClave(''); alert('Contraseña actualizada.')
  })
  const guardarAccesos = (personal) => correr(async () => {
    const { error } = await supabase.from('usuarios').update({ modulos: personal ? accesos : null }).eq('id', u.id)
    if (error) throw new Error(error.message)
  })
  const guardarEmpresas = (todas) => correr(async () => {
    if (!todas && !emps.length && !ocultas.length) throw new Error('seleccione al menos una empresa')
    const valor = todas ? (adminActual?.empresas || null) : [...emps, ...ocultas]
    const { error } = await supabase.from('usuarios').update({ empresas: valor }).eq('id', u.id)
    if (error) throw new Error(error.message)
  })
  const chip = (activo, onClick, texto) => <button type="button" aria-pressed={activo} onClick={onClick} className="rounded-full min-h-[34px] px-3 text-[13px] font-bold" style={activo ? { background: '#fff', color: C.tinta, boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: '#fff', color: C.gris }}>{texto}</button>

  return (
    <div className="flex flex-col gap-3">
      <Segmento etiqueta="Qué editar" opciones={[['datos', 'Datos y rol'], ['clave', 'Contraseña'], ['accesos', 'Acceso por módulo'], ['empresas', 'Empresas']]} valor={panel} onCambio={setPanel} />
      {panel === 'datos' && (
        <div className="grid gap-2.5 items-end" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          <Campo etiqueta="Nombre"><input value={datos.nombre} onChange={e => setDatos({ ...datos, nombre: e.target.value })} className={campo} style={campoEstilo} /></Campo>
          <Campo etiqueta="Usuario para entrar"><input value={datos.usuario} onChange={e => setDatos({ ...datos, usuario: e.target.value.toLowerCase() })} className={campo} style={campoEstilo} /></Campo>
          <Campo etiqueta="Rol"><select value={datos.rol} onChange={e => setDatos({ ...datos, rol: e.target.value })} className={campo} style={campoEstilo}>{ROLES.map(r => <option key={r} value={r}>{NOMBRE_ROL[r]}</option>)}</select></Campo>
          <Boton tono="tinta" onClick={guardarDatos} disabled={guardando}>Guardar</Boton>
        </div>
      )}
      {panel === 'clave' && (
        <div className="flex gap-2 flex-wrap items-end">
          <Campo etiqueta="Nueva contraseña"><input type="password" value={clave} onChange={e => setClave(e.target.value)} className={campo} style={{ ...campoEstilo, width: 240 }} /></Campo>
          <Boton tono="tinta" onClick={guardarClave} disabled={guardando}>Cambiar contraseña</Boton>
        </div>
      )}
      {panel === 'accesos' && (
        <div className="flex flex-col gap-2">
          <Nota>{u.modulos ? 'Este usuario tiene acceso personalizado: ve solo lo marcado.' : `Hoy usa los permisos de su rol (${NOMBRE_ROL[u.rol]}). Marque los módulos y guarde para darle un acceso personalizado.`}</Nota>
          <div className="flex gap-1.5 flex-wrap">{MODULOS.filter(m => !m.oculto).map(m => <span key={m.id}>{chip(accesos.includes(m.id), () => setAccesos(a => a.includes(m.id) ? a.filter(x => x !== m.id) : [...a, m.id]), m.nombre)}</span>)}</div>
          <div className="flex gap-2 flex-wrap justify-end">{u.modulos && <Boton tono="blanco" onClick={() => guardarAccesos(false)} disabled={guardando}>Volver a los permisos del rol</Boton>}<Boton tono="tinta" onClick={() => guardarAccesos(true)} disabled={guardando}>Guardar acceso personalizado</Boton></div>
        </div>
      )}
      {panel === 'empresas' && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1.5 flex-wrap">{empresas.map(e => <span key={e.id}>{chip(emps.includes(e.id), () => setEmps(a => a.includes(e.id) ? a.filter(x => x !== e.id) : [...a, e.id]), e.nombre)}</span>)}</div>
          <div className="flex gap-2 flex-wrap justify-end"><Boton tono="blanco" onClick={() => guardarEmpresas(true)} disabled={guardando}>Todas las empresas</Boton><Boton tono="tinta" onClick={() => guardarEmpresas(false)} disabled={guardando}>Guardar empresas</Boton></div>
        </div>
      )}
      <div className="flex gap-3 flex-wrap pt-1" style={{ borderTop: `1px solid ${C.linea}` }}>
        <button type="button" onClick={() => acciones.alternarActivo(u)} className="text-[13px] font-bold pt-2">{u.activo ? 'Desactivar' : 'Activar'}</button>
        {u.rol !== 'gerencia' && <button type="button" onClick={() => acciones.alternarInventario(u)} className="text-[13px] font-bold pt-2">{u.puede_aprobar_inventario ? 'Quitar permiso de ajustes de inventario' : 'Dar permiso de ajustes de inventario'}</button>}
        <button type="button" onClick={() => acciones.cerrarSesiones(u)} className="text-[13px] font-bold pt-2">Cerrar sesiones abiertas</button>
        {!SUPERADMINS.includes(u.usuario) && u.id !== adminActual?.id && <button type="button" onClick={() => acciones.eliminar(u)} className="text-[13px] font-bold pt-2" style={{ color: C.rojo }}>Eliminar</button>}
      </div>
    </div>
  )
}

// Qué ve cada rol. Gerencia ve todo siempre; un usuario con acceso
// personalizado usa el suyo.
const ROLES_CONFIGURABLES = ['admin', 'auxiliar', 'vendedor', 'planta']
const MODULOS_PERMISO = [{ id: 'ejecutivo', nombre: 'Inicio', roles: ['admin'] }, ...MODULOS.filter(m => !m.oculto && !m.soloUsuario && !m.requierePermiso)]
function PermisosPorRol({ usuario }) {
  const [permisos, setPermisos] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [cambios, setCambios] = useState(false)
  useEffect(() => {
    supabase.from('roles_permisos').select('rol, modulos').then(({ data }) => {
      const guardados = Object.fromEntries((data || []).map(p => [p.rol, p.modulos]))
      setPermisos(Object.fromEntries(ROLES_CONFIGURABLES.map(r => [r, guardados[r] || MODULOS_PERMISO.filter(m => m.roles.includes(r)).map(m => m.id)])))
    })
  }, [])
  if (!permisos) return null
  const alternar = (rol, id) => { setPermisos(p => ({ ...p, [rol]: p[rol].includes(id) ? p[rol].filter(x => x !== id) : [...p[rol], id] })); setCambios(true) }
  const guardar = async () => {
    setGuardando(true)
    const { error } = await supabase.from('roles_permisos').upsert(ROLES_CONFIGURABLES.map(r => ({ cliente_id: usuario.cliente_id, rol: r, modulos: permisos[r], actualizado_por: usuario.nombre, updated_at: new Date().toISOString() })))
    setGuardando(false)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    setCambios(false)
  }
  return (
    <Tarjeta>
      <div className="flex justify-between gap-2 items-center flex-wrap">
        <H2>Permisos por rol</H2>
        <span className="flex gap-2 items-center">{cambios && <span className="text-[13px]" style={{ color: C.gris }}>Cambios sin guardar</span>}<Boton tono="rojo" onClick={guardar} disabled={guardando || !cambios}>{guardando ? 'Guardando…' : 'Guardar permisos'}</Boton></span>
      </div>
      <Tabla columnas={['Módulo', 'Gerencia', ...ROLES_CONFIGURABLES.map(r => NOMBRE_ROL[r])]} min={620}>
        {MODULOS_PERMISO.map(m => (
          <tr key={m.id}>
            <td style={td(true)}><b>{m.nombre}</b></td>
            <td style={{ ...td(), color: C.gris, fontSize: 12.5 }}>Siempre</td>
            {ROLES_CONFIGURABLES.map(r => {
              const si = permisos[r].includes(m.id)
              return <td key={r} style={td()}><button type="button" aria-pressed={si} aria-label={`${m.nombre} para ${NOMBRE_ROL[r]}`} onClick={() => alternar(r, m.id)} className="min-w-[52px] min-h-[32px] rounded-full text-[12.5px] font-bold" style={si ? { background: '#fff', color: C.tinta, boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: C.suave, color: C.gris }}>{si ? 'Ve' : 'No'}</button></td>
            })}
          </tr>
        ))}
      </Tabla>
      <Nota>Los cambios aplican cuando cada usuario recarga la pantalla. Un usuario con acceso personalizado usa el suyo en vez del de su rol.</Nota>
    </Tarjeta>
  )
}

// Qué tareas le llegan a cada rol en el Inicio y en Tareas.
function TareasPorRol({ usuario }) {
  const [reparto, setReparto] = useState(null)
  const [cambios, setCambios] = useState(false)
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { cargarRepartoTareas().then(setReparto) }, [])
  if (!reparto) return null
  const alternar = (tipo, rol) => { setReparto(r => ({ ...r, [tipo]: r[tipo].includes(rol) ? r[tipo].filter(x => x !== rol) : [...r[tipo], rol] })); setCambios(true) }
  const guardar = async () => {
    setGuardando(true)
    const { error } = await supabase.from('tareas_roles').upsert(TIPOS_TAREA.map(t => ({ tipo: t.id, roles: reparto[t.id], actualizado_por: usuario.nombre, updated_at: new Date().toISOString() })))
    setGuardando(false)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    setCambios(false)
  }
  return (
    <Tarjeta>
      <div className="flex justify-between gap-2 items-center flex-wrap">
        <H2>Tareas por rol</H2>
        <span className="flex gap-2 items-center">{cambios && <span className="text-[13px]" style={{ color: C.gris }}>Cambios sin guardar</span>}<Boton tono="rojo" onClick={guardar} disabled={guardando || !cambios}>{guardando ? 'Guardando…' : 'Guardar reparto'}</Boton></span>
      </div>
      <Tabla columnas={['Tarea', ...ROLES_TAREA.map(r => r[1])]} min={520}>
        {TIPOS_TAREA.map(t => (
          <tr key={t.id}>
            <td style={td(true)}><b>{t.nombre}</b></td>
            {ROLES_TAREA.map(([r, n]) => {
              const si = reparto[t.id].includes(r)
              return <td key={r} style={td()}><button type="button" aria-pressed={si} aria-label={`${t.nombre} para ${n}`} onClick={() => alternar(t.id, r)} className="min-w-[60px] min-h-[32px] rounded-full text-[12.5px] font-bold" style={si ? { background: '#fff', color: C.tinta, boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { background: C.suave, color: C.gris }}>{si ? 'La ve' : 'No'}</button></td>
            })}
          </tr>
        ))}
      </Tabla>
      <Nota>Cada rol ve en el Inicio y en Tareas solo lo que le corresponde; en Tareas puede escoger "Todas" para ver las de los demás.</Nota>
    </Tarjeta>
  )
}
