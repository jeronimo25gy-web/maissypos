'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { inicioDelRol } from '@/lib/navegacion'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { puedeVerModulo } from '@/lib/permisos'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { calcularStockPorSku } from '@/lib/inventario-helpers'
import { grupoDespacho } from '@/lib/orden-productos'
import { crearAlertaAdmin } from '@/lib/alertas-admin'
import { invalidarPendientes } from '@/lib/pendientes'
import { PageHeader } from '@/components/ui'

// Conteo fisico del dia, a ciegas: quien cuenta no ve lo que espera el
// sistema. Nada arranca en 0 (un producto saltado no puede volverse un
// faltante falso); se puede guardar a medias en este equipo y se termina
// cuando todo esta contado. Las diferencias esperan aprobacion en Ajustes.
// El conteo inicial (arranque con datos reales) queda como punto de partida.
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: 'var(--hoja)', linea: '#E3E1D8', suave: '#EFEDE6', rojo: 'var(--rojo)', rojoF: 'var(--rojo-suave)', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8', amarillo: 'var(--acento)' }
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const $ = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
const clave = (t) => (t || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const tarjeta = 'bg-white rounded-[18px] p-3.5 min-w-0'

// Conteo físico. Vive como pestaña de Inventario (embebido); quien solo tiene
// permiso de contar entra por /conteo.
export default function Conteo({ embebido, alVolver, alGuardar }) {
  const [usuario, setUsuario] = useState(null)
  const [productos, setProductos] = useState([])
  const [conteos, setConteos] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [descuadres, setDescuadres] = useState([])
  const [coinciden, setCoinciden] = useState(0)
  const [yaExiste, setYaExiste] = useState(false)
  const [reiniciando, setReiniciando] = useState(false)
  const [confirmarReinicio, setConfirmarReinicio] = useState(false)
  const [divergenciasPropias, setDivergenciasPropias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busca, setBusca] = useState('')
  const [inicial, setInicial] = useState(false)
  const [huboConteo, setHuboConteo] = useState(true)
  const [aviso, setAviso] = useState('')
  const router = useRouter()
  const fecha = obtenerFechaActual()
  const claveBorrador = () => `conteo_borrador_${getEmpresaId()}_${fecha}`
  const listo = useRef(false)

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/entrar'); return }
    const parsed = JSON.parse(u)
    if (!embebido && !puedeVerModulo(parsed, 'conteo', ['admin', 'auxiliar'])) { router.push('/despacho'); return }
    setUsuario(parsed)
    cargarProductos()
    cargarDivergenciasPropias(parsed.nombre)
  }, [])

  // Lo contado se guarda en este equipo mientras se cuenta.
  useEffect(() => {
    if (!listo.current || yaExiste) return
    try { localStorage.setItem(claveBorrador(), JSON.stringify(conteos)) } catch {}
  }, [conteos])

  const puedeReiniciar = (u) => !!u?.gerencia

  const cargarDivergenciasPropias = async (nombre) => {
    const { data } = await supabase.from('divergencias_inventario')
      .select('id, estado, fecha, motivo_rechazo')
      .eq('empresa_id', getEmpresaId())
      .eq('registrado_por', nombre)
      .in('estado', ['pendiente', 'rechazado'])
      .order('created_at', { ascending: false })
      .limit(10)
    setDivergenciasPropias(data || [])
  }

  const cargarProductos = async () => {
    setCargando(true)
    const empresaId = getEmpresaId()
    const [{ data }, { data: conteoHoy }, { count: anteriores }] = await Promise.all([
      supabase.from('productos').select('*').eq('estado', true).eq('empresa_id', empresaId).order('orden_despacho', { ascending: true, nullsFirst: false }).order('nombre'),
      supabase.from('conteo_fisico').select('sku, cantidad_fisica').eq('empresa_id', empresaId).eq('fecha', fecha).order('created_at', { ascending: true }),
      supabase.from('conteo_fisico').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    ])
    setHuboConteo((anteriores || 0) > 0)
    // Sin ningun conteo anterior (arranque o despues de la limpieza), el admin cuenta el inicial.
    try { if (!anteriores && JSON.parse(localStorage.getItem('maissy_usuario') || '{}').rol === 'admin') setInicial(true) } catch {}
    if (data) {
      // Las bolsas de reparto no se cuentan: se controlan por lo que sale con cada despacho.
      // El Kilo de Masa tampoco: se hace y se anota al venderlo.
      setProductos(data.filter(p => !(/^BOL-/.test(p.sku || '') || p.categoria === 'Insumos de reparto' || /kilo de masa/i.test(p.nombre))))
      const previos = {}
      ;(conteoHoy || []).forEach(c => { previos[c.sku] = c.cantidad_fisica })
      const existe = (conteoHoy || []).length > 0
      setYaExiste(existe)
      let borrador = {}
      if (!existe) { try { borrador = JSON.parse(localStorage.getItem(claveBorrador()) || '{}') } catch {} }
      const initial = {}
      data.forEach(p => { initial[p.sku] = p.sku in previos ? String(previos[p.sku]) : (borrador[p.sku] ?? '') })
      setConteos(initial)
    }
    setCargando(false)
    listo.current = true
  }

  const reiniciarConteo = async () => {
    setReiniciando(true)
    const { error } = await supabase.from('conteo_fisico').delete().eq('empresa_id', getEmpresaId()).eq('fecha', fecha)
    setReiniciando(false)
    setConfirmarReinicio(false)
    if (error) { setAviso('No se pudo reiniciar: ' + error.message); return }
    setYaExiste(false)
    cargarProductos()
  }

  const guardarConteo = async () => {
    if (yaExiste) return
    const vacios = productos.filter(p => conteos[p.sku] === '' || conteos[p.sku] == null)
    if (vacios.length > 0) { setAviso(`Faltan ${vacios.length} productos por contar. Si no hay existencias, seleccione “No hay”.`); return }
    setAviso('')
    setGuardando(true)
    const empresaId = getEmpresaId()
    const stockPorSku = inicial ? {} : await calcularStockPorSku()

    const infoPorSku = {}
    const registros = productos.map(p => {
      const fisica = parseFloat(conteos[p.sku])
      const info = stockPorSku[p.sku]
      // Conteo inicial: lo contado es el punto de partida, sin diferencias.
      const sistema = inicial ? fisica : (info?.stockActual ?? fisica)
      infoPorSku[p.sku] = info
      return { empresa_id: p.empresa_id, fecha, sku: p.sku, cantidad_sistema: sistema, cantidad_fisica: fisica, diferencia: fisica - sistema, completado: true, usuario: usuario.nombre, inicial }
    })
    const { error } = await supabase.from('conteo_fisico').insert(registros)
    if (error) {
      setAviso(error.code === '23505' ? 'El conteo de hoy ya fue registrado (por ti u otra persona). No se puede duplicar.' : 'Error al guardar: ' + error.message)
      setGuardando(false)
      cargarProductos()
      return
    }
    try { localStorage.removeItem(claveBorrador()) } catch {}

    const productosMap = Object.fromEntries(productos.map(p => [p.sku, p]))
    const costo = (sku) => Number(productosMap[sku]?.costo_compra || productosMap[sku]?.precio_venta || 0)
    const descuadresRows = registros.filter(r => r.diferencia !== 0)
    const desgloseDe = (sku) => {
      const info = infoPorSku[sku]
      return info ? { conteo_anterior: info.cantidadConteo, fecha_conteo: info.fechaConteo, entradas: info.comprado || 0, devuelto: info.devuelto || 0, despachado: info.despachado || 0, salidas: info.salida || 0, costo: costo(sku) } : { costo: costo(sku) }
    }

    if (descuadresRows.length > 0) {
      const { data: divergenciasCreadas, error: errDiv } = await supabase.from('divergencias_inventario').insert(descuadresRows.map(r => ({
        empresa_id: empresaId, fecha, sku: r.sku, cantidad_sistema: r.cantidad_sistema, cantidad_fisica: r.cantidad_fisica,
        diferencia: r.diferencia, estado: 'pendiente', registrado_por: usuario.nombre, desglose: desgloseDe(r.sku),
      }))).select()
      if (errDiv) {
        setAviso('El conteo se guardó, pero no se pudieron registrar las diferencias para aprobación: ' + errDiv.message)
      } else if (divergenciasCreadas) {
        await supabase.from('audit_ajustes_inventario').insert(divergenciasCreadas.map(d => ({
          empresa_id: empresaId, divergencia_id: d.id, accion: 'creada', usuario: usuario.nombre,
          detalle: `Diferencia de ${d.diferencia > 0 ? '+' : ''}${d.diferencia} en ${productosMap[d.sku]?.nombre || d.sku}`,
        })))
      }
      await crearAlertaAdmin({
        empresaId, tipo: 'descuadre_conteo', referenciaTipo: 'conteo_fisico',
        mensaje: `El conteo del ${fecha} no coincide con el inventario en ${descuadresRows.length} producto${descuadresRows.length > 1 ? 's' : ''}, pendiente de aprobación: ` +
          descuadresRows.map(r => `${productosMap[r.sku]?.nombre || r.sku}: físico ${r.cantidad_fisica}, sistema ${r.cantidad_sistema} (dif. ${r.diferencia > 0 ? '+' : ''}${r.diferencia})`).join('; '),
      })
    }
    invalidarPendientes()
    setCoinciden(registros.length - descuadresRows.length)
    setDescuadres(descuadresRows.map(r => ({ ...r, nombre: productosMap[r.sku]?.nombre || r.sku, valor: Math.abs(r.diferencia) * costo(r.sku) })))
    setYaExiste(true)
    setGuardado(true)
    alGuardar?.()
    setGuardando(false)
  }

  const categorias = [...new Set(productos.map(grupoDespacho))]
  const q = clave(busca.trim())
  const visibles = productos.filter(p => !q || clave(`${p.nombre} ${p.sku}`).includes(q))
  const filaDe = {}
  categorias.flatMap(cat => visibles.filter(p => grupoDespacho(p) === cat)).forEach((p, i) => { filaDe[p.sku] = i })
  const navegarGrilla = (e, fila) => {
    const ir = (f) => { const el = document.querySelector(`[data-grilla="conteo"][data-fila="${f}"]`); if (el) { e.preventDefault(); el.focus() } }
    if (e.key === 'Enter' || e.key === 'ArrowDown') ir(fila + 1)
    else if (e.key === 'ArrowUp') ir(fila - 1)
  }
  const contados = productos.filter(p => conteos[p.sku] !== '' && conteos[p.sku] != null).length
  const faltan = productos.length - contados

  if (guardado) {
    const faltantes = descuadres.filter(d => d.diferencia < 0), sobrantes = descuadres.filter(d => d.diferencia > 0)
    return (
      <div className={`p-4 flex items-start sm:items-center justify-center ${embebido ? '' : 'min-h-screen'}`} style={{ background: C.fondo, color: C.tinta }}>
        <div className="w-full max-w-lg flex flex-col gap-3">
          <div className={tarjeta + ' flex flex-col gap-2.5'}>
            <h2 className="font-extrabold text-[24px]" style={titulo}>{inicial ? 'Conteo inicial guardado' : 'Conteo guardado'}</h2>
            {inicial ? null : (
              <>
                <div className="flex flex-wrap gap-2">
                  <span className="text-[12px] font-bold px-2.5 py-0.5 rounded-full" style={{ background: C.verdeF, color: C.verde }}>{coinciden} coinciden</span>
                  {faltantes.length > 0 && <span className="text-[12px] font-bold px-2.5 py-0.5 rounded-full" style={{ background: C.rojoF, color: C.rojo }}>{faltantes.length} faltan</span>}
                  {sobrantes.length > 0 && <span className="text-[12px] font-bold px-2.5 py-0.5 rounded-full" style={{ background: C.ambarF, color: C.ambar }}>{sobrantes.length} sobran</span>}
                </div>
                <p className="text-[14px]" style={{ color: C.gris }}>{descuadres.length ? 'Las diferencias quedan esperando aprobación de un administrador. Hasta entonces no cambian el inventario.' : 'Todo coincide con el inventario.'}</p>
              </>
            )}
          </div>
          {!inicial && descuadres.length > 0 && (
            <div className={tarjeta + ' flex flex-col'}>
              {descuadres.map((d, i) => (
                <div key={d.sku} className="flex justify-between items-center gap-3 py-2.5" style={{ borderTop: i ? `1px solid ${C.linea}` : 0 }}>
                  <span className="min-w-0"><b className="block leading-tight">{d.nombre}</b><span className="text-[13px]" style={{ color: C.gris }}>Contaste {d.cantidad_fisica} · el sistema esperaba {d.cantidad_sistema}</span></span>
                  <span className="text-[12px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap" style={d.diferencia < 0 ? { background: C.rojoF, color: C.rojo } : { background: C.ambarF, color: C.ambar }}>
                    {d.diferencia < 0 ? `Faltan ${Math.abs(d.diferencia)}` : `Sobran ${d.diferencia}`}{d.valor ? ` · ${$(d.valor)}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => alVolver ? alVolver() : router.push(inicioDelRol())} className="min-h-[50px] rounded-2xl font-bold text-white" style={{ background: 'var(--primario)' }}>Volver al inicio</button>
        </div>
      </div>
    )
  }

  if (!usuario || cargando) return null

  return (
    <div style={{ background: C.fondo, minHeight: embebido ? 0 : '100vh', color: C.tinta }}>
      {!embebido && <PageHeader title="Conteo de inventario" subtitle={new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })} />}
      <div className={embebido ? 'flex flex-col gap-3' : 'p-4 max-w-5xl mx-auto flex flex-col gap-3'}>
        {divergenciasPropias.length > 0 && (
          <div className="rounded-2xl px-3.5 py-3 text-[14px]" style={{ background: C.ambarF, color: C.ambar }}>
            <b>Tienes diferencias de conteo sin resolver.</b>
            {divergenciasPropias.slice(0, 4).map(d => <span key={d.id} className="block text-[13px]">{d.fecha}: {d.estado === 'pendiente' ? 'esperando aprobación.' : `rechazada${d.motivo_rechazo ? ' · ' + d.motivo_rechazo : ''}.`}</span>)}
          </div>
        )}
        {aviso && <div className="rounded-2xl px-3.5 py-3 text-[14px] font-bold" style={{ background: C.rojoF, color: C.rojo }}>{aviso}</div>}

        {yaExiste ? (
          <div className={tarjeta + ' text-center py-8 flex flex-col items-center gap-2'}>
            <h2 className="font-extrabold text-[20px]" style={titulo}>El conteo de hoy ya está guardado</h2>
            <p className="text-[14px]" style={{ color: C.gris }}>Solo Gerencia lo puede reabrir</p>
            {puedeReiniciar(usuario) && (confirmarReinicio ? (
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                <span className="w-full text-[13.5px]" style={{ color: C.gris }}>Se borra el conteo de hoy. Las diferencias ya aprobadas o rechazadas no cambian.</span>
                <button onClick={() => setConfirmarReinicio(false)} className="px-4 min-h-[42px] rounded-xl font-bold" style={{ background: C.suave }}>Cancelar</button>
                <button onClick={reiniciarConteo} disabled={reiniciando} className="px-4 min-h-[42px] rounded-xl font-bold text-white disabled:opacity-50" style={{ background: 'var(--primario)' }}>{reiniciando ? 'Reiniciando…' : 'Sí, reiniciar'}</button>
              </div>
            ) : <button onClick={() => setConfirmarReinicio(true)} className="mt-2 px-4 min-h-[42px] rounded-xl font-bold" style={{ background: C.suave }}>Reiniciar conteo del día</button>)}
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
            <div className={tarjeta + ' flex flex-col'}>
              <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar producto…" aria-label="Buscar producto"
                className="w-full rounded-xl px-3 min-h-[44px] text-[15px] bg-white border outline-none focus:border-[#1C1B19] mb-1" style={{ borderColor: C.linea }} />
              {categorias.map(cat => {
                const lista = visibles.filter(p => grupoDespacho(p) === cat)
                if (!lista.length) return null
                return (
                  <div key={cat}>
                    <p className="pt-3 pb-1 text-[11.5px] font-extrabold uppercase tracking-wider" style={{ color: C.gris }}>{cat}</p>
                    {lista.map((p, i) => {
                      const v = conteos[p.sku]
                      const vacio = v === '' || v == null
                      return (
                        <div key={p.sku} className="flex items-center gap-2 py-2" style={{ borderTop: i ? `1px solid ${C.linea}` : 0 }}>
                          <span className="flex-1 min-w-0 leading-tight"><b className="block text-[14.5px]">{p.nombre}</b><span className="text-[12px]" style={{ color: C.gris }}>{p.presentacion || p.sku}</span></span>
                          <button type="button" onClick={() => setConteos(prev => ({ ...prev, [p.sku]: '0' }))} className="px-2.5 min-h-[42px] rounded-xl text-[12.5px] font-bold shrink-0" style={{ background: C.suave, color: C.gris }}>No hay</button>
                          <input type="text" inputMode="decimal" value={v ?? ''} placeholder="—" data-grilla="conteo" data-fila={filaDe[p.sku]} aria-label={`Cantidad de ${p.nombre}`}
                            onFocus={e => e.target.select()} onKeyDown={e => navegarGrilla(e, filaDe[p.sku])}
                            onChange={e => { const val = e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''); setConteos(prev => ({ ...prev, [p.sku]: val })) }}
                            className="w-[76px] h-[42px] text-center rounded-xl font-extrabold text-[18px] bg-white border-[1.5px] outline-none focus:border-[#1C1B19] shrink-0"
                            style={{ ...titulo, borderColor: C.linea, borderStyle: vacio ? 'dashed' : 'solid' }} />
                        </div>
                      )
                    })}
                  </div>
                )
              })}
              {q && visibles.length === 0 && <p className="text-[14px] py-4" style={{ color: C.gris }}>Sin coincidencias</p>}
            </div>

            <aside className="lg:sticky lg:top-24 flex flex-col gap-2">
              <div className={tarjeta + ' flex flex-col gap-2.5'}>
                <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: C.gris }}>Avance</span>
                <span className="font-extrabold text-[26px] tabular-nums" style={titulo}>{contados} de {productos.length}</span>
                <div className="h-2.5 rounded-full overflow-hidden" style={{ background: C.suave }} role="img" aria-label={`${contados} de ${productos.length} contados`}>
                  <div className="h-full rounded-full" style={{ width: `${productos.length ? (contados / productos.length) * 100 : 0}%`, background: C.amarillo }} />
                </div>
                <span className="text-[13px]" style={{ color: C.gris }}>{faltan ? `Faltan ${faltan} productos. Lo contado se guarda en este equipo: puedes seguir más tarde.` : 'Todo contado.'}</span>
                {usuario.rol === 'admin' && (
                  <label className="flex items-start gap-2 text-[13.5px] rounded-xl p-2.5" style={{ background: inicial ? C.ambarF : C.fondo }}>
                    <input type="checkbox" checked={inicial} onChange={e => setInicial(e.target.checked)} className="w-4 h-4 mt-0.5 accent-[#1C1B19]" />
                    <span><b>Es el conteo inicial</b><span className="block text-[12px]" style={{ color: C.gris }}>{huboConteo ? 'Lo contado reemplaza lo que espera el sistema, sin diferencias por aprobar. Úsalo solo al arrancar con datos reales.' : 'Primer conteo: lo contado queda como punto de partida.'}</span></span>
                  </label>
                )}
                <button onClick={guardarConteo} disabled={guardando || faltan > 0} className="min-h-[50px] rounded-2xl font-bold text-white disabled:opacity-45" style={{ background: 'var(--primario)' }}>
                  {guardando ? 'Guardando…' : inicial ? 'Guardar conteo inicial' : 'Terminar conteo'}
                </button>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}
