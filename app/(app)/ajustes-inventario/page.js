'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { invalidarPendientes } from '@/lib/pendientes'
import { PageHeader } from '@/components/ui'

// Ajustes de inventario: las diferencias de los conteos esperan aprobacion.
// Se aprueban de a una (o con la cantidad corregida y una nota) o todas las de
// un mismo conteo de una vez. Cada una dice cuanto vale y de donde sale lo que
// esperaba el sistema.
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', linea: '#E3E1D8', suave: '#EFEDE6', rojo: '#C41230', rojoF: '#FBE9E9', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8' }
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const $ = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
const fechaCorta = (f) => f ? new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }) : ''
const tarjeta = 'bg-white rounded-[18px] p-3.5 min-w-0'
const campo = 'w-full rounded-xl px-3 min-h-[42px] text-[14.5px] bg-white border outline-none focus:border-[#1C1B19]'
const pill = (texto, color, fondo) => <span className="inline-flex items-center text-[12px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap" style={{ color, background: fondo }}>{texto}</span>

export default function AjustesInventario() {
  const [usuario, setUsuario] = useState(null)
  const [vista, setVista] = useState('pendientes')
  const [divergencias, setDivergencias] = useState([])
  const [productos, setProductos] = useState({})
  const [cargando, setCargando] = useState(true)
  const [netoMes, setNetoMes] = useState(0)
  const [abierto, setAbierto] = useState(null) // { id, modo: 'corregir' | 'rechazar' }
  const [cantidadCorregida, setCantidadCorregida] = useState('')
  const [nota, setNota] = useState('')
  const [procesando, setProcesando] = useState(null)
  const [auditPor, setAuditPor] = useState({})
  const [verHistorial, setVerHistorial] = useState(null)
  const [rechazoGrupo, setRechazoGrupo] = useState(null) // clave del grupo
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/'); return }
    const parsed = JSON.parse(u)
    if (!parsed.puede_aprobar_inventario) { router.push('/despacho'); return }
    setUsuario(parsed)
    supabase.from('productos').select('sku, nombre, costo_compra, precio_venta').eq('empresa_id', getEmpresaId())
      .then(({ data }) => setProductos(Object.fromEntries((data || []).map(p => [p.sku, p]))))
  }, [])
  useEffect(() => { if (usuario) cargar() }, [vista, usuario])

  const costo = (sku, d) => Number(d?.desglose?.costo || productos[sku]?.costo_compra || productos[sku]?.precio_venta || 0)
  const nombre = (sku) => productos[sku]?.nombre || sku

  const cargar = async () => {
    setCargando(true)
    const empresaId = getEmpresaId()
    let q = supabase.from('divergencias_inventario').select('*').eq('empresa_id', empresaId)
    q = vista === 'pendientes' ? q.eq('estado', 'pendiente') : q.in('estado', ['aprobado', 'rechazado'])
    const hoy = obtenerFechaActual()
    const [{ data }, { data: mes }] = await Promise.all([
      q.order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(300),
      supabase.from('divergencias_inventario').select('sku, cantidad_sistema, cantidad_fisica, cantidad_corregida, desglose').eq('estado', 'aprobado').gte('fecha', hoy.slice(0, 7) + '-01').eq('empresa_id', empresaId),
    ])
    setDivergencias(data || [])
    setNetoMes((mes || []).reduce((s, d) => s + ((d.cantidad_corregida ?? d.cantidad_fisica) - d.cantidad_sistema) * Number(d.desglose?.costo || 0), 0))
    setCargando(false)
    setAbierto(null)
  }

  const resolverAlertaConteo = async (empresaId, fecha) => {
    const { data: quedan } = await supabase.from('divergencias_inventario').select('id').eq('empresa_id', empresaId).eq('fecha', fecha).eq('estado', 'pendiente')
    if ((quedan || []).length > 0) return
    await supabase.from('alertas_admin').update({ leida: true }).eq('empresa_id', empresaId).eq('tipo', 'descuadre_conteo').eq('leida', false).ilike('mensaje', `%${fecha}%`)
  }

  const aprobar = async (d, cantidadReal, motivo) => {
    const { error: e } = await supabase.rpc('aprobar_divergencia_inventario', {
      p_divergencia_id: d.id, p_cantidad_real: cantidadReal, p_motivo_ajuste: motivo || null, p_usuario_nombre: usuario.nombre,
    })
    return e
  }
  const rechazar = async (d, motivo) => {
    const { error: e } = await supabase.rpc('rechazar_divergencia_inventario', { p_divergencia_id: d.id, p_motivo_rechazo: motivo || null, p_usuario_nombre: usuario.nombre })
    return e
  }

  const aprobarUna = async (d) => {
    setProcesando(d.id); setError('')
    const e = await aprobar(d, d.cantidad_fisica, null)
    if (e) setError('No se pudo aprobar: ' + e.message)
    else await resolverAlertaConteo(getEmpresaId(), d.fecha)
    setProcesando(null); invalidarPendientes(); cargar()
  }
  const confirmarCorreccion = async (d) => {
    const real = parseFloat(cantidadCorregida)
    if (isNaN(real) || real < 0) { setError('Escribe la cantidad real.'); return }
    if (real !== d.cantidad_fisica && !nota.trim()) { setError('Cambiaste la cantidad: escribe en la nota por qué, para que quede en el historial.'); return }
    setProcesando(d.id); setError('')
    const e = await aprobar(d, real, nota)
    if (e) setError('No se pudo aprobar: ' + e.message)
    else await resolverAlertaConteo(getEmpresaId(), d.fecha)
    setProcesando(null); invalidarPendientes(); cargar()
  }
  const confirmarRechazo = async (d) => {
    setProcesando(d.id); setError('')
    const e = await rechazar(d, nota)
    if (e) setError('No se pudo rechazar: ' + e.message)
    else await resolverAlertaConteo(getEmpresaId(), d.fecha)
    setProcesando(null); invalidarPendientes(); cargar()
  }
  const grupoEntero = async (lista, accion, motivo) => {
    setProcesando('grupo'); setError('')
    const fallos = []
    for (const d of lista) {
      const e = accion === 'aprobar' ? await aprobar(d, d.cantidad_fisica, null) : await rechazar(d, motivo)
      if (e) fallos.push(`${nombre(d.sku)}: ${e.message}`)
    }
    await resolverAlertaConteo(getEmpresaId(), lista[0].fecha)
    if (fallos.length) setError('Algunas no se pudieron guardar: ' + fallos.join('; '))
    setProcesando(null); setRechazoGrupo(null); setNota(''); invalidarPendientes(); cargar()
  }

  const abrirHistorial = async (d) => {
    if (verHistorial === d.id) { setVerHistorial(null); return }
    setVerHistorial(d.id)
    if (!auditPor[d.id]) {
      const { data } = await supabase.from('audit_ajustes_inventario').select('*').eq('divergencia_id', d.id).order('created_at', { ascending: true })
      setAuditPor(prev => ({ ...prev, [d.id]: data || [] }))
    }
  }

  if (!usuario) return null

  const pendientes = vista === 'pendientes' ? divergencias : []
  const faltante = pendientes.filter(d => d.diferencia < 0)
  const sobrante = pendientes.filter(d => d.diferencia > 0)
  const valorDe = (lista) => lista.reduce((s, d) => s + Math.abs(d.diferencia) * costo(d.sku, d), 0)
  const grupos = Object.values(divergencias.reduce((m, d) => {
    const k = d.fecha + '|' + (d.registrado_por || '')
    ;(m[k] = m[k] || { clave: k, fecha: d.fecha, quien: d.registrado_por, items: [] }).items.push(d)
    return m
  }, {}))

  const cadena = (d) => {
    const g = d.desglose
    if (!g || g.conteo_anterior == null) return null
    const partes = [`conteo del ${fechaCorta(g.fecha_conteo)} (${g.conteo_anterior})`]
    if (g.entradas) partes.push(`+ entradas (${g.entradas})`)
    if (g.devuelto) partes.push(`+ devuelto de rutas (${g.devuelto})`)
    if (g.despachado) partes.push(`− despachos (${g.despachado})`)
    if (g.salidas) partes.push(`− otras salidas (${g.salidas})`)
    return `Esperaba ${d.cantidad_sistema} = ${partes.join(' ')}. ${d.diferencia < 0 ? 'Revisa si hubo una venta, un despacho o un cambio sin registrar.' : 'Revisa si quedó una compra o una devolución sin registrar.'}`
  }

  return (
    <div style={{ background: C.fondo, minHeight: '100vh', color: C.tinta }}>
      <PageHeader title="Ajustes de inventario" />
      <div className="p-4 max-w-5xl mx-auto flex flex-col gap-4">
        {vista === 'pendientes' && (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {[
              ['Por aprobar', String(pendientes.length), grupos.length ? `De ${grupos.length} conteo${grupos.length === 1 ? '' : 's'}` : 'Nada pendiente', pendientes.length ? C.rojo : null],
              ['Faltante', $(valorDe(faltante)), `${faltante.length} producto${faltante.length === 1 ? '' : 's'}`],
              ['Sobrante', $(valorDe(sobrante)), `${sobrante.length} producto${sobrante.length === 1 ? '' : 's'}`],
              ['Neto del mes', (netoMes < 0 ? '−' : '') + $(Math.abs(netoMes)), 'Ajustes aprobados este mes'],
            ].map(([et, va, sub, color]) => (
              <div key={et} className={tarjeta + ' flex flex-col gap-0.5'}>
                <span className="text-[12.5px] font-bold" style={{ color: C.gris }}>{et}</span>
                <span className="font-extrabold text-[24px] tabular-nums leading-tight" style={{ ...titulo, color: color || C.tinta }}>{va}</span>
                <span className="text-[12.5px]" style={{ color: C.gris }}>{sub}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-1 bg-white rounded-full p-1 self-start" role="tablist">
          {[['pendientes', 'Por aprobar'], ['historial', 'Historial']].map(([v, t]) => (
            <button key={v} role="tab" aria-selected={vista === v} onClick={() => setVista(v)} className="px-4 min-h-[38px] rounded-full text-[13.5px] font-bold"
              style={vista === v ? { background: C.tinta, color: '#fff' } : { color: C.gris }}>{t}</button>
          ))}
        </div>
        {error && <div className="rounded-2xl px-3.5 py-3 text-[14px] font-bold" style={{ background: C.rojoF, color: C.rojo }}>{error}</div>}

        {cargando ? <p className="text-sm py-10 text-center" style={{ color: C.gris }}>Cargando…</p>
          : grupos.length === 0 ? <div className={tarjeta + ' text-center py-8'}><b>{vista === 'pendientes' ? 'Nada por aprobar.' : 'Todavía no hay ajustes resueltos.'}</b><p className="text-[14px]" style={{ color: C.gris }}>{vista === 'pendientes' ? 'Las diferencias de los conteos aparecen aquí.' : ''}</p></div>
            : grupos.map(g => (
              <section key={g.clave} className={tarjeta + ' flex flex-col'}>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
                  <h3 className="font-extrabold text-[17px]" style={titulo}>Conteo del {fechaCorta(g.fecha)}{g.quien ? ` · ${g.quien}` : ''}</h3>
                  {vista === 'pendientes' && g.items.length > 1 && (rechazoGrupo === g.clave ? (
                    <span className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
                      <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Motivo del rechazo (opcional)" className={campo + ' sm:w-64'} style={{ borderColor: C.linea }} />
                      <button onClick={() => { setRechazoGrupo(null); setNota('') }} className="px-3 min-h-[40px] rounded-xl text-[13px] font-bold" style={{ background: C.suave }}>Cancelar</button>
                      <button onClick={() => grupoEntero(g.items, 'rechazar', nota)} disabled={procesando === 'grupo'} className="px-3 min-h-[40px] rounded-xl text-[13px] font-bold disabled:opacity-50" style={{ background: C.suave }}>Rechazar las {g.items.length}</button>
                    </span>
                  ) : (
                    <span className="flex gap-2">
                      <button onClick={() => { setRechazoGrupo(g.clave); setNota('') }} className="px-3 min-h-[40px] rounded-xl text-[13px] font-bold" style={{ background: C.suave }}>Rechazar todo</button>
                      <button onClick={() => grupoEntero(g.items, 'aprobar')} disabled={procesando === 'grupo'} className="px-4 min-h-[40px] rounded-xl text-[13px] font-bold text-white disabled:opacity-50" style={{ background: C.rojo }}>{procesando === 'grupo' ? 'Guardando…' : `Aprobar las ${g.items.length}`}</button>
                    </span>
                  ))}
                </div>
                {g.items.map((d, i) => {
                  const falta = d.diferencia < 0
                  const valor = Math.abs(d.diferencia) * costo(d.sku, d)
                  const modo = abierto?.id === d.id ? abierto.modo : null
                  const texto = cadena(d)
                  return (
                    <div key={d.id} className="py-3 flex flex-col gap-2" style={{ borderTop: `1px solid ${C.linea}` }}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0"><b className="block leading-tight">{nombre(d.sku)}</b><span className="text-[13px]" style={{ color: C.gris }}>Contó {d.cantidad_fisica} · esperaba {d.cantidad_sistema}</span></span>
                        <span className="flex flex-wrap items-center gap-2 justify-end">
                          {pill(`${falta ? 'Faltan' : 'Sobran'} ${Math.abs(d.diferencia)}${valor ? ` · ${$(valor)}` : ''}`, falta ? C.rojo : C.ambar, falta ? C.rojoF : C.ambarF)}
                          {vista === 'pendientes' && !modo && <>
                            <button onClick={() => aprobarUna(d)} disabled={!!procesando} className="px-3 min-h-[36px] rounded-xl text-[13px] font-bold disabled:opacity-50" style={{ background: C.verdeF, color: C.verde }}>{procesando === d.id ? '…' : 'Aprobar'}</button>
                            <button onClick={() => { setAbierto({ id: d.id, modo: 'corregir' }); setCantidadCorregida(String(d.cantidad_fisica)); setNota('') }} className="px-3 min-h-[36px] rounded-xl text-[13px] font-bold" style={{ background: C.suave }}>Corregir</button>
                            <button onClick={() => { setAbierto({ id: d.id, modo: 'rechazar' }); setNota('') }} className="px-3 min-h-[36px] rounded-xl text-[13px] font-bold" style={{ background: C.suave }}>Rechazar</button>
                          </>}
                          {vista === 'historial' && (d.estado === 'aprobado' ? pill('Aprobado', C.verde, C.verdeF) : pill('Rechazado', C.gris, C.suave))}
                        </span>
                      </div>
                      {texto && <p className="text-[12.5px] rounded-xl px-3 py-2" style={{ background: C.fondo, color: C.gris }}>{texto}</p>}
                      {vista === 'historial' && d.cantidad_corregida != null && d.cantidad_corregida !== d.cantidad_fisica && <p className="text-[12.5px]" style={{ color: C.verde }}>Se corrigió a {d.cantidad_corregida}{d.motivo_ajuste ? ` · ${d.motivo_ajuste}` : ''}</p>}
                      {vista === 'historial' && d.motivo_rechazo && <p className="text-[12.5px]" style={{ color: C.gris }}>Motivo: {d.motivo_rechazo}</p>}
                      {modo === 'corregir' && (
                        <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: C.fondo }}>
                          <label className="text-[12.5px] font-bold" style={{ color: C.gris }}>Cantidad real que queda en bodega
                            <input type="number" min="0" value={cantidadCorregida} onChange={e => setCantidadCorregida(e.target.value)} className={campo + ' font-bold mt-1'} style={{ borderColor: C.linea }} />
                          </label>
                          <input value={nota} onChange={e => setNota(e.target.value)} placeholder={parseFloat(cantidadCorregida) !== d.cantidad_fisica ? 'Por qué se corrige (obligatorio)' : 'Nota (opcional)'} className={campo} style={{ borderColor: C.linea }} />
                          <div className="flex gap-2">
                            <button onClick={() => setAbierto(null)} className="flex-1 min-h-[42px] rounded-xl font-bold bg-white">Cancelar</button>
                            <button onClick={() => confirmarCorreccion(d)} disabled={procesando === d.id} className="flex-1 min-h-[42px] rounded-xl font-bold disabled:opacity-50" style={{ background: C.verdeF, color: C.verde }}>{procesando === d.id ? 'Guardando…' : 'Aprobar con esta cantidad'}</button>
                          </div>
                        </div>
                      )}
                      {modo === 'rechazar' && (
                        <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: C.fondo }}>
                          <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Motivo del rechazo (opcional)" className={campo} style={{ borderColor: C.linea }} />
                          <div className="flex gap-2">
                            <button onClick={() => setAbierto(null)} className="flex-1 min-h-[42px] rounded-xl font-bold bg-white">Cancelar</button>
                            <button onClick={() => confirmarRechazo(d)} disabled={procesando === d.id} className="flex-1 min-h-[42px] rounded-xl font-bold disabled:opacity-50" style={{ background: C.suave }}>{procesando === d.id ? 'Guardando…' : 'Rechazar diferencia'}</button>
                          </div>
                        </div>
                      )}
                      <button onClick={() => abrirHistorial(d)} className="self-start text-[12.5px] font-bold underline" style={{ color: C.gris }}>{verHistorial === d.id ? 'Ocultar historial' : 'Ver historial'}</button>
                      {verHistorial === d.id && (auditPor[d.id] || []).map(a => (
                        <p key={a.id} className="text-[12px]" style={{ color: C.gris }}>{new Date(a.created_at).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {a.usuario} · {a.accion}{a.detalle ? ` · ${a.detalle}` : ''}</p>
                      ))}
                    </div>
                  )
                })}
              </section>
            ))}
      </div>
    </div>
  )
}
