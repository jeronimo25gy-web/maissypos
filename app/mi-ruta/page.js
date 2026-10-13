'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { cerrarSesionUsuario } from '@/lib/sesion'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { conObsequiosRestados } from '@/lib/ventas-helpers'
import { DIAS, detalleCliente } from '@/lib/rutero'

// Inicio del vendedor: su ruta como dashboard (venta contra meta, cartera,
// vehiculo, rutero del dia) y la puerta al kiosco para liquidar.
const fmt = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO')
const diaDeHoy = () => { const d = new Date(obtenerFechaActual() + 'T12:00:00').getDay(); return d === 0 ? 1 : d }
const iniciales = (n) => (n || '').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()

export default function MiRuta() {
  const router = useRouter()
  const [usuario, setUsuario] = useState(null)
  const [vendedor, setVendedor] = useState(null)
  const [datos, setDatos] = useState(null)
  const [dia, setDia] = useState(diaDeHoy())
  const [rutero, setRutero] = useState([])
  const [vista, setVista] = useState('inicio') // inicio | rutero | cuenta
  const [nuevo, setNuevo] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [clave, setClave] = useState({ nueva: '', repetir: '', msg: '' })

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (parsed.rol !== 'vendedor') { router.push('/despacho'); return }
    setUsuario(parsed)
    cargar(parsed)
  }, [])

  const cargar = async (u) => {
    const empresaId = getEmpresaId()
    const { data: vend } = await supabase.from('vendedores').select('id, nombre, ruta_id, telefono, rutas(id, nombre)')
      .eq('nombre', u.vendedor_nombre || u.nombre || '').eq('empresa_id', empresaId).maybeSingle()
    setVendedor(vend || null)
    if (!vend?.ruta_id) { setDatos({ sinRuta: true }); return }
    const hoy = obtenerFechaActual()
    const mes = hoy.slice(0, 7)
    const inicio = mes + '-01'
    const [{ data: vehs }, { data: cartera }, { data: desp }, { data: meta }, { data: pendientes }] = await Promise.all([
      supabase.from('vehiculos').select('placa, marca, modelo, kilometraje_actual').eq('ruta_id', vend.ruta_id).eq('empresa_id', empresaId),
      supabase.from('cartera_fiados').select('nombre_cliente, saldo, fecha_pago').eq('ruta_id', vend.ruta_id).eq('estado', 'pendiente').eq('empresa_id', empresaId).order('fecha_pago', { ascending: true, nullsFirst: false }),
      supabase.from('despachos_encab').select('id').eq('vendedor_id', vend.id).gte('fecha', inicio).lte('fecha', hoy).eq('empresa_id', empresaId),
      supabase.from('metas_ventas').select('meta').eq('ruta_id', vend.ruta_id).eq('mes', mes).eq('empresa_id', empresaId).maybeSingle(),
      supabase.from('despachos_encab').select('id, fecha, rutas(nombre)').eq('vendedor_id', vend.id).eq('estado', 'despachado').eq('empresa_id', empresaId),
    ])
    const ids = new Set((desp || []).map(d => d.id))
    let venta = 0
    if (ids.size > 0) {
      const { data: liq } = await supabase.from('liquidaciones').select('despacho_id, efectivo_esperado').in('despacho_id', [...ids]).eq('empresa_id', empresaId)
      const filas = await conObsequiosRestados(liq || [], { desde: inicio, hasta: hoy })
      venta = filas.filter(l => ids.has(l.despacho_id)).reduce((s, l) => s + (l.efectivo_esperado || 0), 0)
    }
    const cobrarHoy = (cartera || []).filter(f => f.fecha_pago && f.fecha_pago <= hoy)
    setDatos({
      vehiculo: (vehs || [])[0] || null,
      venta, meta: meta?.meta || 0,
      carteraTotal: (cartera || []).reduce((s, f) => s + (f.saldo || 0), 0),
      creditos: (cartera || []).length,
      cobrarHoy,
      porLiquidar: pendientes || [],
    })
    cargarRutero(vend.ruta_id, dia)
  }

  const cargarRutero = async (rutaId, d) => {
    const { data } = await supabase.from('rutero')
      .select('id, orden, cliente_id, clientes(nombre, telefono, direccion, apto, edificio, barrio, notas, estado)')
      .eq('ruta_id', rutaId).eq('dia_semana', d).eq('empresa_id', getEmpresaId()).order('orden')
    setRutero((data || []).filter(f => f.clientes?.estado !== false))
  }

  const cambiarDia = (d) => { setDia(d); if (vendedor?.ruta_id) cargarRutero(vendedor.ruta_id, d) }

  // Cliente nuevo desde la calle: queda de ultimo en el rutero del dia.
  const guardarNuevo = async () => {
    const n = nuevo
    const nombre = n.nombre.trim() || [n.edificio || n.direccion, n.apto].filter(Boolean).join(' · ')
    if (!nombre) { alert('Escribe el nombre, o la dirección o edificio y el apto'); return }
    setGuardando(true)
    const empresaId = getEmpresaId()
    const { data: c, error } = await supabase.from('clientes').insert({
      empresa_id: empresaId, nombre, ruta_id: vendedor.ruta_id, vendedor_id: vendedor.id, estado: true,
      edificio: n.edificio || null, direccion: n.direccion || null, apto: n.apto || null, barrio: n.barrio || null, telefono: n.telefono || null,
      tipo_inmueble: n.edificio ? 'edificio' : 'casa', notas: n.notas || null,
    }).select('id').single()
    if (!error) {
      const { error: e2 } = await supabase.from('rutero').insert({ empresa_id: empresaId, cliente_id: c.id, ruta_id: vendedor.ruta_id, dia_semana: dia, orden: rutero.length + 1 })
      if (e2) alert('Se creó el cliente pero no entró al rutero: ' + e2.message)
    } else alert('No se pudo crear: ' + error.message)
    setGuardando(false)
    setNuevo({ nombre: '', edificio: n.edificio, direccion: n.edificio ? n.direccion : '', apto: '', barrio: n.barrio, telefono: '', notas: '' })
    cargarRutero(vendedor.ruta_id, dia)
  }

  const cambiarClave = async () => {
    if (clave.nueva.length < 6) { setClave({ ...clave, msg: 'Mínimo 6 caracteres' }); return }
    if (clave.nueva !== clave.repetir) { setClave({ ...clave, msg: 'Las dos no coinciden' }); return }
    const { error } = await supabase.auth.updateUser({ password: clave.nueva })
    setClave({ nueva: '', repetir: '', msg: error ? 'No se pudo: ' + error.message : 'Listo, tu contraseña quedó cambiada' })
  }

  const salir = async () => { await cerrarSesionUsuario(usuario?.id); localStorage.removeItem('maissy_usuario'); router.push('/') }

  if (!usuario) return null
  const nombreDia = DIAS.find(d => d.n === dia)?.nombre || ''
  const campo = 'w-full border-2 border-gray-200 rounded-xl px-3 py-3 text-base text-gray-800 focus:border-brand focus:outline-none bg-white'

  return (
    <div className="min-h-screen bg-[#F3F1EA] text-gray-900 flex flex-col">
      <div className="bg-brand text-white px-5 pt-5 pb-14">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-amber-400 text-gray-900 flex items-center justify-center font-black text-lg shrink-0">{iniciales(usuario.nombre)}</div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-xl truncate">{usuario.nombre}</p>
            <p className="text-sm opacity-90 truncate">{vendedor?.rutas?.nombre || 'Sin ruta asignada'} · {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })}</p>
          </div>
          <button onClick={salir} className="text-sm font-bold bg-white/15 rounded-xl px-3 py-2 shrink-0">Salir</button>
        </div>
      </div>

      <div className="flex-1 w-full max-w-xl mx-auto px-4 -mt-10 pb-28 space-y-3">
        {!datos ? <div className="bg-white rounded-2xl p-6 text-center text-gray-400">Cargando...</div>
          : datos.sinRuta ? (
            <div className="bg-white rounded-2xl p-6 text-center">
              <p className="font-bold">Tu usuario no está ligado a una ruta.</p>
              <p className="text-sm text-gray-500 mt-1">Pídele al administrador que te asigne tu vendedor y tu ruta. Mientras tanto puedes liquidar desde el kiosco.</p>
            </div>
          ) : vista === 'inicio' ? (
            <>
              {datos.porLiquidar.length > 0 && (
                <a href="/kiosco" className="block bg-gray-900 text-white rounded-2xl p-4">
                  <p className="font-black text-lg">Tienes {datos.porLiquidar.length === 1 ? 'un despacho' : `${datos.porLiquidar.length} despachos`} por liquidar</p>
                  <p className="text-sm opacity-80">{datos.porLiquidar.map(d => `${d.rutas?.nombre} ${d.fecha}`).join(' · ')} · toca para liquidar</p>
                </a>
              )}
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Venta del mes</p>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-black text-3xl">{fmt(datos.venta)}</p>
                  {datos.meta > 0 && <p className="text-sm text-gray-500">de {fmt(datos.meta)}</p>}
                </div>
                {datos.meta > 0 ? (
                  <>
                    <div className="h-3 rounded-full bg-gray-100 mt-2 overflow-hidden"><div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min(100, datos.venta / datos.meta * 100)}%` }} /></div>
                    <p className="text-sm font-bold text-green-800 mt-2">{datos.venta >= datos.meta ? '¡Cumpliste la meta!' : `Te faltan ${fmt(datos.meta - datos.venta)}`}</p>
                  </>
                ) : <p className="text-sm text-gray-500 mt-1">Este mes no tiene meta asignada</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setVista('rutero')} className="bg-white rounded-2xl p-4 text-left shadow-sm">
                  <p className="text-xs font-bold text-gray-500">Rutero {nombreDia.toLowerCase()}</p>
                  <p className="font-black text-3xl">{rutero.length}</p>
                  <p className="text-xs text-gray-500">clientes · ver lista</p>
                </button>
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <p className="text-xs font-bold text-gray-500">Cobrar hoy</p>
                  <p className="font-black text-3xl text-brand">{fmt(datos.cobrarHoy.reduce((s, f) => s + (f.saldo || 0), 0))}</p>
                  <p className="text-xs text-gray-500">{datos.cobrarHoy.length} créditos · ruta debe {fmt(datos.carteraTotal)}</p>
                </div>
              </div>
              {datos.cobrarHoy.length > 0 && (
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <p className="text-xs font-bold text-gray-500 mb-2">Para cobrar hoy</p>
                  {datos.cobrarHoy.slice(0, 8).map((f, i) => (
                    <div key={i} className="flex justify-between text-sm py-1">
                      <span className="truncate">{f.nombre_cliente}{f.fecha_pago < obtenerFechaActual() ? ' · vencido' : ''}</span>
                      <span className="font-bold shrink-0">{fmt(f.saldo)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center shrink-0" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1C1B19" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"></path><circle cx="7" cy="17.5" r="1.8"></circle><circle cx="17" cy="17.5" r="1.8"></circle></svg>
                </div>
                <div className="min-w-0">
                  <p className="font-bold truncate">{datos.vehiculo ? `${datos.vehiculo.placa} · ${datos.vehiculo.modelo || datos.vehiculo.marca || ''}` : 'Sin vehículo asignado'}</p>
                  {datos.vehiculo && <p className="text-sm text-gray-500">{Number(datos.vehiculo.kilometraje_actual || 0).toLocaleString('es-CO')} km</p>}
                </div>
              </div>
            </>
          ) : vista === 'rutero' ? (
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex gap-1.5 overflow-x-auto pb-2">
                {DIAS.map(d => (
                  <button key={d.n} onClick={() => cambiarDia(d.n)} className={`shrink-0 px-3 py-2 rounded-lg text-sm font-bold ${d.n === dia ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}>{d.corto}</button>
                ))}
              </div>
              <p className="text-sm text-gray-500 mb-2">{nombreDia} · {rutero.length} clientes en orden de visita</p>
              {rutero.length === 0 && <p className="text-center text-gray-400 py-8">Este día no tiene clientes. Agrégalos abajo a medida que haces el recorrido.</p>}
              <div className="divide-y divide-gray-100">
                {rutero.map(f => (
                  <div key={f.id} className="flex gap-3 py-3">
                    <span className="w-7 text-right font-black text-gray-400 shrink-0">{f.orden}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold">{f.clientes?.nombre}</p>
                      <p className="text-sm text-gray-500">{detalleCliente(f.clientes || {})}</p>
                      {f.clientes?.notas && <p className="text-xs text-amber-700">{f.clientes.notas}</p>}
                    </div>
                    {f.clientes?.telefono && <a href={`tel:${f.clientes.telefono.replace(/\s/g, '')}`} className="self-center text-sm font-bold text-brand shrink-0 px-2 py-2">Llamar</a>}
                  </div>
                ))}
              </div>
              {!nuevo ? (
                <button onClick={() => setNuevo({ nombre: '', edificio: '', direccion: '', apto: '', barrio: '', telefono: '', notas: '' })} className="w-full mt-3 bg-amber-100 text-gray-900 font-bold py-3 rounded-xl">+ Agregar cliente al final</button>
              ) : (
                <div className="mt-3 space-y-2 bg-gray-50 rounded-xl p-3">
                  <p className="font-black">Cliente nuevo · queda de #{rutero.length + 1}</p>
                  <input value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Nombre (si lo sabes)" className={campo} />
                  <input value={nuevo.edificio} onChange={e => setNuevo({ ...nuevo, edificio: e.target.value })} placeholder="Edificio o negocio" className={campo} />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={nuevo.direccion} onChange={e => setNuevo({ ...nuevo, direccion: e.target.value })} placeholder="Dirección" className={campo} />
                    <input value={nuevo.apto} onChange={e => setNuevo({ ...nuevo, apto: e.target.value })} placeholder="Apto / piso" className={campo} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={nuevo.barrio} onChange={e => setNuevo({ ...nuevo, barrio: e.target.value })} placeholder="Barrio" className={campo} />
                    <input value={nuevo.telefono} onChange={e => setNuevo({ ...nuevo, telefono: e.target.value })} placeholder="Teléfono" inputMode="tel" className={campo} />
                  </div>
                  <input value={nuevo.notas} onChange={e => setNuevo({ ...nuevo, notas: e.target.value })} placeholder="Nota (timbrar al 401, etc.)" className={campo} />
                  <div className="flex gap-2">
                    <button onClick={() => setNuevo(null)} className="flex-1 bg-white border border-gray-200 font-bold py-3 rounded-xl">Cerrar</button>
                    <button onClick={guardarNuevo} disabled={guardando} className="flex-1 bg-brand text-white font-bold py-3 rounded-xl disabled:opacity-50">{guardando ? 'Guardando...' : 'Guardar y otro'}</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <p className="font-black text-lg">Mi cuenta</p>
              <p className="text-sm text-gray-500">Usuario: {usuario.usuario}</p>
              <p className="font-bold">Cambiar contraseña</p>
              <input type="password" value={clave.nueva} onChange={e => setClave({ ...clave, nueva: e.target.value, msg: '' })} placeholder="Nueva contraseña" className={campo} />
              <input type="password" value={clave.repetir} onChange={e => setClave({ ...clave, repetir: e.target.value, msg: '' })} placeholder="Repítela" className={campo} />
              {clave.msg && <p className="text-sm font-bold text-gray-700">{clave.msg}</p>}
              <button onClick={cambiarClave} className="w-full bg-gray-900 text-white font-bold py-3 rounded-xl">Guardar contraseña</button>
            </div>
          )}
      </div>

      <nav aria-label="Menú del vendedor" className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="max-w-xl mx-auto grid grid-cols-4">
          {[['inicio', 'Inicio'], ['rutero', 'Rutero']].map(([v, t]) => (
            <button key={v} onClick={() => setVista(v)} className={`py-4 text-sm font-bold ${vista === v ? 'text-brand' : 'text-gray-500'}`}>{t}</button>
          ))}
          <a href="/kiosco" className="py-4 text-sm font-bold text-gray-500 text-center">Liquidar</a>
          <button onClick={() => setVista('cuenta')} className={`py-4 text-sm font-bold ${vista === 'cuenta' ? 'text-brand' : 'text-gray-500'}`}>Mi cuenta</button>
        </div>
      </nav>
    </div>
  )
}
