'use client'
// Cargas base de todas las rutas en una sola hoja, como la planilla de
// despacho: productos en renglones, rutas en columnas, por día de la semana.
// Se edita aquí mismo (queda en cargas_ruta, lo mismo que Maestros > Rutas) y
// es lo que Despacho propone al abrir cada ruta.
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { grupoDespacho } from '@/lib/orden-productos'
import { puedeVerModulo } from '@/lib/permisos'
import { PageHeader } from '@/components/ui'

const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: 'var(--hoja)', linea: '#E3E1D8', suave: '#EFEDE6', verde: '#2E5E3A', verdeF: '#E6F0E8', rojo: 'var(--rojo)' }
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const tarjeta = 'bg-white rounded-[18px] p-3.5 min-w-0'
const DIAS = [[1, 'Lunes'], [2, 'Martes'], [3, 'Miércoles'], [4, 'Jueves'], [5, 'Viernes'], [6, 'Sábado']]
const corto = (nombre) => {
  const n = String(nombre || '')
  const m = n.match(/RESIDENCIAL\s+(\d+)/i); if (m) return 'R' + m[1]
  const p = n.match(/PUNTO DE VENTA\s+(\d+)/i); if (p) return 'PdV' + p[1]
  return n.length > 10 ? n.slice(0, 9) + '…' : n
}
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

export default function CargasBase() {
  const router = useRouter()
  const [listo, setListo] = useState(false)
  const [dia, setDia] = useState(() => { const d = new Date().getDay(); return d === 0 ? 1 : d })
  const [rutas, setRutas] = useState([])
  const [productos, setProductos] = useState([])
  const [cargas, setCargas] = useState({}) // `${ruta}|${dia}|${sku}` -> cantidad
  const [editando, setEditando] = useState({}) // misma clave -> texto mientras se escribe
  const [guardando, setGuardando] = useState({})
  const [verTodos, setVerTodos] = useState(false)
  const [rutaMovil, setRutaMovil] = useState('')

  useEffect(() => {
    const u = localStorage.getItem('maissy_usuario')
    if (!u) { router.push('/entrar'); return }
    const parsed = JSON.parse(u)
    if (!puedeVerModulo(parsed, 'despacho', ['admin', 'auxiliar'])) { router.push('/kiosco'); return }
    const empresaId = getEmpresaId()
    Promise.all([
      supabase.from('rutas').select('id, nombre, tipo').eq('estado', true).eq('empresa_id', empresaId).order('nombre'),
      supabase.from('productos').select('sku, nombre, orden_despacho, categoria').eq('estado', true).neq('tipo', 'materia_prima').eq('empresa_id', empresaId)
        .order('orden_despacho', { ascending: true, nullsFirst: false }).order('nombre'),
      supabase.from('cargas_ruta').select('ruta_id, sku, dia_semana, cantidad').eq('empresa_id', empresaId),
    ]).then(([{ data: r }, { data: p }, { data: c }]) => {
      // Primero las rutas residenciales y luego los puntos de venta, como la planilla.
      const lista = (r || []).sort((a, b) => (a.tipo === 'punto_venta') - (b.tipo === 'punto_venta') || a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))
      setRutas(lista)
      setRutaMovil(lista[0]?.id || '')
      setProductos((p || []).filter(x => !/^BOL-/.test(x.sku)))
      setCargas(Object.fromEntries((c || []).map(x => [`${x.ruta_id}|${x.dia_semana}|${x.sku}`, num(x.cantidad)])))
      setListo(true)
    })
  }, [router])

  const valor = (ruta, sku) => cargas[`${ruta}|${dia}|${sku}`] || 0
  const rutasDelDia = useMemo(() => rutas.filter(r => productos.some(p => (cargas[`${r.id}|${dia}|${p.sku}`] || 0) > 0)), [rutas, productos, cargas, dia])
  const columnas = verTodos ? rutas : (rutasDelDia.length ? rutasDelDia : rutas)
  const filas = useMemo(() => verTodos ? productos : productos.filter(p => columnas.some(r => (cargas[`${r.id}|${dia}|${p.sku}`] || 0) > 0)), [verTodos, productos, columnas, cargas, dia])
  const grupos = useMemo(() => {
    const out = []
    filas.forEach(p => { const g = grupoDespacho(p); if (!out.length || out[out.length - 1].nombre !== g) out.push({ nombre: g, items: [] }); out[out.length - 1].items.push(p) })
    return out
  }, [filas])
  const totalRuta = (ruta) => filas.reduce((s, p) => s + valor(ruta, p.sku), 0)
  const totalProducto = (sku) => columnas.reduce((s, r) => s + valor(r.id, sku), 0)

  const guardar = async (ruta, sku, texto) => {
    const clave = `${ruta}|${dia}|${sku}`
    const nuevo = num(String(texto).replace(',', '.'))
    setEditando(e => { const x = { ...e }; delete x[clave]; return x })
    if (nuevo === (cargas[clave] || 0)) return
    const antes = cargas[clave] || 0
    setCargas(c => ({ ...c, [clave]: nuevo }))
    setGuardando(g => ({ ...g, [clave]: true }))
    const { error } = await supabase.from('cargas_ruta').upsert({ empresa_id: getEmpresaId(), ruta_id: ruta, sku, dia_semana: dia, cantidad: nuevo }, { onConflict: 'empresa_id,ruta_id,sku,dia_semana' })
    setGuardando(g => { const x = { ...g }; delete x[clave]; return x })
    if (error) { setCargas(c => ({ ...c, [clave]: antes })); alert('No se guardó la carga: ' + error.message) }
  }

  const celda = (ruta, sku) => {
    const clave = `${ruta}|${dia}|${sku}`
    const v = valor(ruta, sku)
    return (
      <input inputMode="decimal" aria-label={`Carga ${corto(rutas.find(r => r.id === ruta)?.nombre)} ${productos.find(p => p.sku === sku)?.nombre}`}
        value={editando[clave] ?? (v ? String(v) : '')} placeholder="—"
        onFocus={e => { setEditando(x => ({ ...x, [clave]: v ? String(v) : '' })); e.target.select() }}
        onChange={e => setEditando(x => ({ ...x, [clave]: e.target.value.replace(/[^0-9.,]/g, '') }))}
        onBlur={e => guardar(ruta, sku, e.target.value)}
        className="w-full min-w-0 h-[34px] text-center rounded-lg font-bold tabular-nums bg-transparent outline-none border border-transparent hover:border-[#E3E1D8] focus:border-[#1C1B19] focus:bg-white"
        style={{ color: v ? C.tinta : C.gris, opacity: guardando[clave] ? 0.5 : 1 }} />
    )
  }

  const diaNombre = DIAS.find(d => d[0] === dia)?.[1]

  return (
    <div className="min-h-screen" style={{ background: C.fondo }}>
      <PageHeader buscar="Despacho" title="Cargas base" subtitle={diaNombre} onBack={() => router.push('/despacho')} />
      <div className="p-4 max-w-6xl mx-auto flex flex-col gap-3">
        <div className={tarjeta + ' flex flex-wrap items-center gap-2 justify-between'}>
          <div className="flex gap-1 rounded-xl p-1 flex-wrap" style={{ background: C.suave }} role="group" aria-label="Día">
            {DIAS.map(([n, t]) => (
              <button key={n} type="button" aria-pressed={dia === n} onClick={() => setDia(n)} className="rounded-lg min-h-[34px] px-3 text-[13px] font-bold"
                style={dia === n ? { background: '#fff', color: C.tinta, boxShadow: `inset 0 0 0 1.5px ${C.tinta}` } : { color: C.gris }}>
                <span className="sm:hidden">{t.slice(0, 3)}</span><span className="hidden sm:inline">{t}</span>
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[13px] font-bold" style={{ color: C.gris }}>
            <input type="checkbox" checked={verTodos} onChange={e => setVerTodos(e.target.checked)} />
            Mostrar todos los productos y rutas
          </label>
        </div>

        {!listo ? <div className={tarjeta}><p style={{ color: C.gris }}>Cargando…</p></div> : (
          <>
            {/* Computador: la planilla completa */}
            <div className={tarjeta + ' hidden md:block p-0 overflow-hidden'}>
              <table className="w-full border-collapse text-[14px]">
                <thead>
                  <tr style={{ borderBottom: `1.5px solid ${C.tinta}` }}>
                    <th className="text-left px-3.5 py-2.5 font-extrabold" style={titulo}>Producto</th>
                    {columnas.map(r => <th key={r.id} title={r.nombre} className="px-1 py-2.5 font-extrabold text-center w-[78px]" style={titulo}>{corto(r.nombre)}</th>)}
                    <th className="px-3 py-2.5 font-extrabold text-right w-[80px]" style={titulo}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.length === 0 && <tr><td colSpan={columnas.length + 2} className="px-3.5 py-6 text-center" style={{ color: C.gris }}>No hay cargas para el {diaNombre?.toLowerCase()}. Active «Mostrar todos» para escribirlas.</td></tr>}
                  {grupos.map(g => [
                    <tr key={'g' + g.nombre}><td colSpan={columnas.length + 2} className="px-3.5 pt-3 pb-1 text-[11.5px] font-extrabold uppercase tracking-wider" style={{ color: C.gris }}>{g.nombre}</td></tr>,
                    ...g.items.map(p => (
                      <tr key={p.sku} style={{ borderTop: `1px solid ${C.suave}` }}>
                        <td className="px-3.5 py-0.5"><span className="font-bold">{p.nombre}</span> <span className="text-[12px]" style={{ color: C.gris }}>{p.sku}</span></td>
                        {columnas.map(r => <td key={r.id} className="px-1 py-0.5">{celda(r.id, p.sku)}</td>)}
                        <td className="px-3 py-0.5 text-right font-extrabold tabular-nums">{totalProducto(p.sku) || '—'}</td>
                      </tr>
                    )),
                  ])}
                </tbody>
                {grupos.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: `1.5px solid ${C.tinta}` }}>
                      <td className="px-3.5 py-2.5 font-extrabold" style={titulo}>Unidades</td>
                      {columnas.map(r => <td key={r.id} className="px-1 py-2.5 text-center font-extrabold tabular-nums">{totalRuta(r.id) || '—'}</td>)}
                      <td className="px-3 py-2.5 text-right font-extrabold tabular-nums">{columnas.reduce((s, r) => s + totalRuta(r.id), 0)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Celular: una ruta a la vez */}
            <div className="md:hidden flex flex-col gap-3">
              <div className="flex gap-1.5 flex-wrap">
                {columnas.map(r => (
                  <button key={r.id} type="button" onClick={() => setRutaMovil(r.id)} aria-pressed={rutaMovil === r.id} className="px-3.5 min-h-[38px] rounded-full text-[13.5px] font-bold"
                    style={rutaMovil === r.id ? { background: C.tinta, color: '#fff' } : { background: '#fff', color: C.tinta }}>{corto(r.nombre)} · {totalRuta(r.id)}</button>
                ))}
              </div>
              {columnas.some(r => r.id === rutaMovil) ? (
                <div className={tarjeta + ' flex flex-col'}>
                  <b className="text-[16px] pb-1" style={titulo}>{rutas.find(r => r.id === rutaMovil)?.nombre}</b>
                  {grupos.map(g => (
                    <div key={g.nombre} className="flex flex-col">
                      <span className="pt-3 pb-1 text-[11.5px] font-extrabold uppercase tracking-wider" style={{ color: C.gris }}>{g.nombre}</span>
                      {g.items.map(p => (
                        <div key={p.sku} className="grid grid-cols-[minmax(0,1fr)_80px] items-center gap-2 py-1" style={{ borderTop: `1px solid ${C.suave}` }}>
                          <span className="font-bold text-[14px] min-w-0">{p.nombre}</span>
                          {celda(rutaMovil, p.sku)}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : <div className={tarjeta}><p style={{ color: C.gris }}>Escoja una ruta.</p></div>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
