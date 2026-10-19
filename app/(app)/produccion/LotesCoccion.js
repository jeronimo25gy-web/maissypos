'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { registrosDe, telasPorBulto, empacado, estandar, fmtHora, fmtNum, duracion, TEXTURAS } from '@/lib/planta'

// Lo que registra la planta, visto por el admin: cada lote de cocción con sus
// mediciones y los estándares que van saliendo. Regla: lo que no se midió
// dice "sin dato"; ningún valor por defecto.
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', linea: '#E3E1D8', suave: '#EFEDE6', rojo: '#C41230', ambar: '#8A5A00', ambarF: '#FFF4CC', verde: '#2E5E3A', verdeF: '#E6F0E8' }
const corto = (p) => (p?.nombre || '').replace(/^Arepa (de Maíz )?/i, '')
const mediana = (l) => { if (!l.length) return null; const s = [...l].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const promedio = (l) => l.length ? l.reduce((s, v) => s + v, 0) / l.length : null
const minutos = (a, b) => a && b ? (new Date(b) - new Date(a)) / 60000 : null

function medirLote(e, c) {
  const regs = (t) => registrosDe(e, c.id, t)
  const suma = (t) => regs(t).reduce((s, r) => s + Number(r.cantidad || 0), 0)
  const abs = (c.testigos || []).filter(t => t.kg > 0).map(t => (t.kg - 1) * 100)
  const mermas = regs('merma').map(r => { const p = r.pesos_individuales || []; const fin = p[2] || p[1]; return p[0] && fin ? (1 - fin / p[0]) * 100 : null }).filter(v => v != null)
  const rend = telasPorBulto(e, c)
  const masa = suma('bola')
  const merma = promedio(mermas)
  const kgEmp = rend?.kg || null
  const crudoEmp = kgEmp && merma != null ? kgEmp / (1 - merma / 100) : null
  const desecho = suma('desecho')
  return {
    coccion: minutos(c.hora_montada, c.hora_apagado), reposo: minutos(c.hora_apagado, c.hora_sacada),
    absorcion: promedio(abs), absorciones: abs, masa: masa || null, bolas: regs('bola').length, merma, nMermas: mermas.length,
    rend, crudoEmp, desecho, reproceso: suma('reproceso'), aceite: regs('aceite').length,
    sinExplicar: masa && crudoEmp != null ? masa - crudoEmp - desecho : null,
  }
}

export default function LotesCoccion({ usuario }) {
  const router = useRouter()
  const [e, setE] = useState(null)
  const [abierto, setAbierto] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [manual, setManual] = useState({})

  const cargar = async () => {
    const empresaId = getEmpresaId()
    const desde = new Date(Date.now() - 45 * 86400000).toLocaleDateString('en-CA')
    const [tq, prods, forms, est, cochs] = await Promise.all([
      supabase.from('tanques').select('*').eq('empresa_id', empresaId).order('orden'),
      supabase.from('productos').select('id, sku, nombre, presentacion, peso_estandar_g, tipo, consumo_por_cochada').eq('empresa_id', empresaId),
      supabase.from('formulas').select('id, producto_id').eq('empresa_id', empresaId).eq('activo', true),
      supabase.from('produccion_estandares').select('*').eq('empresa_id', empresaId),
      supabase.from('produccion_cochadas').select('*').eq('empresa_id', empresaId).eq('anulada', false).not('hora_montada', 'is', null).gte('fecha', desde).order('hora_montada', { ascending: false }),
    ])
    const ids = (cochs.data || []).map(c => c.id)
    const { data: regs } = ids.length ? await supabase.from('produccion_muestras_peso').select('*').in('cochada_id', ids).eq('anulado', false) : { data: [] }
    const conFormula = new Set((forms.data || []).map(f => f.producto_id))
    setE({
      tanques: tq.data || [], estandares: est.data || [],
      referencias: (prods.data || []).filter(p => p.tipo === 'terminado' && conFormula.has(p.id)).sort((a, b) => a.sku.localeCompare(b.sku)),
      maices: (prods.data || []).filter(p => p.consumo_por_cochada),
      cochadas: Object.fromEntries((cochs.data || []).map(c => [c.id, c])),
      lista: cochs.data || [],
      registros: Object.fromEntries((regs || []).map(r => [r.id, r])),
    })
  }
  useEffect(() => { cargar() }, [])

  if (!e) return <p className="text-center text-gray-400 py-10">Cargando…</p>

  const medidos = e.lista.map(c => ({ c, m: medirLote(e, c) }))
  const cerrados = medidos.filter(x => x.c.estado === 'cerrado')
  const nombreTanque = (id) => e.tanques.find(t => t.id === id)?.nombre || 'Lote'

  // Estándares: lo medido (con cuántos datos) contra lo fijado.
  const filas = []
  const fila = (clave, nombre, valores, unidad, dec, extra = {}) => {
    const fijo = estandar(e, clave, extra)
    filas.push({ clave, nombre, medido: valores.length ? (clave === 'absorcion_pct' || clave.startsWith('merma') || clave === 'peso_crudo_g' ? promedio(valores) : mediana(valores)) : null, n: valores.length, unidad, dec, fijo, extra })
  }
  // Cada maíz (blanco, amarillo) rinde distinto: su propio estándar.
  const maicesUsados = [...new Set(e.lista.map(c => c.materia_prima_id))]
  if (maicesUsados.length > 1) maicesUsados.forEach(mid => fila('telas_por_bulto', `Telas por bulto · ${e.maices.find(m => m.id === mid)?.nombre || 'maíz'}`, cerrados.filter(x => x.c.materia_prima_id === mid).map(x => x.m.rend?.telas).filter(v => v > 0), '', 0, { productoId: mid }))
  else fila('telas_por_bulto', 'Telas por bulto', cerrados.map(x => x.m.rend?.telas).filter(v => v > 0), '', 0)
  e.tanques.forEach(t => fila('tiempo_coccion_min', `Tiempo de cocción · ${t.nombre}`, medidos.filter(x => x.c.tanque_id === t.id).map(x => x.m.coccion).filter(v => v > 0), 'min', 0, { tanqueId: t.id }))
  fila('absorcion_pct', 'Absorción del maíz', medidos.flatMap(x => x.m.absorciones), '%', 0)
  e.referencias.forEach(p => {
    const regsRef = Object.values(e.registros).filter(r => r.producto_id === p.id)
    fila('peso_crudo_g', `Peso crudo · ${corto(p)}`, regsRef.filter(r => r.tipo === 'crudo').flatMap(r => (r.pesos_individuales || []).map(Number)), 'g', 1, { productoId: p.id })
    fila('merma_pct', `Merma · ${corto(p)}`, regsRef.filter(r => r.tipo === 'merma').map(r => { const q = r.pesos_individuales || []; const fin = q[2] || q[1]; return q[0] && fin ? (1 - fin / q[0]) * 100 : null }).filter(v => v != null), '%', 1, { productoId: p.id })
  })
  const caidas = []
  Object.values(e.registros).filter(r => r.tipo === 'llego_ref').forEach(l => {
    const cambio = Object.values(e.registros).filter(r => r.tipo === 'cambio_ref' && r.cochada_id === l.cochada_id && r.producto_id === l.producto_id && r.hora <= l.hora).sort((a, b) => b.hora.localeCompare(a.hora))[0]
    if (cambio) caidas.push(minutos(cambio.hora, l.hora))
  })
  fila('tiempo_caida_min', 'Tiempo de caída (troqueladora → empaque)', caidas, 'min', 0)
  const visibles = filas.filter(f => f.n > 0 || f.fijo)

  const fijar = async (f, valor) => {
    if (valor == null || !isFinite(valor)) return
    setGuardando(true)
    const empresaId = getEmpresaId()
    const datos = { empresa_id: empresaId, clave: f.clave, tanque_id: f.extra.tanqueId || null, producto_id: f.extra.productoId || null, valor: Math.round(valor * 100) / 100, estado: 'fijo', actualizado_por: usuario.nombre, updated_at: new Date().toISOString() }
    const { error } = f.fijo
      ? await supabase.from('produccion_estandares').update(datos).eq('id', f.fijo.id)
      : await supabase.from('produccion_estandares').insert(datos)
    setGuardando(false)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    cargar()
  }
  // Datos que no salen de la medición diaria: dosis de conservante por tanque, capacidad del atomizador, peso del bulto.
  const manuales = [
    { clave: 'conservante_g_bulto', nombre: 'Conservante por bulto', unidad: 'g', extra: {} },
    { clave: 'atomizador_ml', nombre: 'Capacidad del atomizador de aceite', unidad: 'ml', extra: {} },
    { clave: 'peso_bulto_kg', nombre: 'Peso real del bulto (con báscula)', unidad: 'kg', extra: {} },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-2xl p-4 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <p className="font-black text-gray-900">Control de producción</p>
          <p className="text-xs text-gray-500">La planta registra cada lote de cocción desde la tablet. Aquí ves lo medido y fijas los estándares.</p>
        </div>
        <button onClick={() => router.push('/planta')} className="rounded-xl px-4 min-h-[44px] font-bold text-white" style={{ background: C.rojo }}>Abrir pantalla de planta</button>
      </div>

      <div className="bg-white rounded-2xl p-4">
        <p className="font-black text-gray-900 mb-2">Lotes de cocción · últimos 45 días</p>
        {e.lista.length === 0 && <p className="text-sm text-gray-500">Todavía no hay lotes registrados desde la planta.</p>}
        <div className="flex flex-col">
          {medidos.map(({ c, m }) => (
            <div key={c.id} className="border-t py-3" style={{ borderColor: C.linea }}>
              <button type="button" onClick={() => setAbierto(abierto === c.id ? null : c.id)} className="w-full text-left flex items-center gap-3 flex-wrap">
                <span className="flex-1 min-w-[200px]"><b>{nombreTanque(c.tanque_id)} · {fmtNum(c.cantidad, Number(c.cantidad) % 1 ? 1 : 0)} bultos</b><br />
                  <span className="text-xs text-gray-500">Montado {new Date(c.hora_montada).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Bogota' })} {fmtHora(c.hora_montada)}{c.registrado_por ? ` · ${c.registrado_por}` : ''}</span></span>
                <span className="text-sm font-bold tabular-nums">{m.rend ? `${fmtNum(m.rend.telas, 0)} Telas/bulto` : 'Sin paquetes'}</span>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={c.estado === 'abierto' ? { background: C.ambarF, color: C.ambar } : { background: C.verdeF, color: C.verde }}>{c.estado === 'abierto' ? 'Abierto' : 'Cerrado'}</span>
              </button>
              {abierto === c.id && <DetalleLote e={e} c={c} m={m} />}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4">
        <p className="font-black text-gray-900">Estándares de la planta</p>
        <p className="text-xs text-gray-500 mb-3">Lo medido sale de los lotes de arriba. “Fijar” lo guarda como estándar; Costos y la planta usan el fijado.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500"><th className="py-2 pr-3">Estándar</th><th className="py-2 pr-3">Medido</th><th className="py-2 pr-3">Fijado</th><th className="py-2"></th></tr></thead>
            <tbody>
              {visibles.length === 0 && <tr><td colSpan={4} className="py-3 text-gray-500">Todo por medir. Los estándares aparecen cuando la planta registre lotes.</td></tr>}
              {visibles.map(f => (
                <tr key={f.nombre} className="border-t" style={{ borderColor: C.linea }}>
                  <td className="py-2 pr-3 font-bold">{f.nombre}</td>
                  <td className="py-2 pr-3 tabular-nums">{f.medido != null ? `${fmtNum(f.medido, f.dec)} ${f.unidad}` : '—'} <span className="text-xs text-gray-500">{f.n ? `· ${f.n} ${f.n === 1 ? 'dato' : 'datos'}` : ''}</span></td>
                  <td className="py-2 pr-3 tabular-nums">{f.fijo ? `${fmtNum(f.fijo.valor, f.dec)} ${f.unidad}` : <span className="text-gray-400">Por medir</span>}</td>
                  <td className="py-2 text-right">{f.medido != null && <button disabled={guardando} onClick={() => fijar(f, f.medido)} className="rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-40" style={{ background: C.verdeF, color: C.verde }}>Fijar</button>}</td>
                </tr>
              ))}
              {filas.length > 0 && <tr><td colSpan={4} className="pt-3 text-xs text-gray-500">La fórmula dice 236 Telas por bulto; nunca se ha medido.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="font-black text-gray-900 mt-5 mb-2 text-sm">Datos que se ponen a mano</p>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {manuales.map(f => {
            const fijo = estandar(e, f.clave, f.extra)
            const k = f.clave + (f.extra.tanqueId || '')
            return (
              <div key={k} className="rounded-xl p-3 flex flex-col gap-2" style={{ background: C.fondo }}>
                <span className="text-xs font-bold text-gray-600">{f.nombre}</span>
                <div className="flex gap-2">
                  <input inputMode="decimal" placeholder={fijo ? String(fijo.valor) : 'Sin dato'} value={manual[k] ?? ''} onChange={ev => setManual({ ...manual, [k]: ev.target.value })}
                    className="flex-1 min-w-0 h-10 rounded-lg border-2 px-3 font-bold bg-white" style={{ borderColor: C.linea }} />
                  <span className="self-center text-xs text-gray-500">{f.unidad}</span>
                  <button disabled={guardando || !manual[k]} onClick={() => { fijar({ ...f, fijo }, Number(String(manual[k]).replace(',', '.'))); setManual({ ...manual, [k]: '' }) }}
                    className="rounded-lg px-3 text-xs font-bold disabled:opacity-40" style={{ background: C.suave }}>Guardar</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function DetalleLote({ e, c, m }) {
  const emp = empacado(e, c)
  const fila = (k, v) => <div className="flex justify-between gap-3 py-1.5 border-t text-sm" style={{ borderColor: C.linea }}><span className="text-gray-600">{k}</span><span className="font-bold tabular-nums text-right">{v ?? <span className="font-normal text-gray-400">Sin dato</span>}</span></div>
  const textura = TEXTURAS.find(t => t.n === c.textura)
  return (
    <div className="mt-3 grid gap-4 md:grid-cols-2">
      <div>
        {fila('Cocción', m.coccion != null ? duracion(c.hora_montada, c.hora_apagado) : null)}
        {fila('Reposo en el tanque', m.reposo != null ? duracion(c.hora_apagado, c.hora_sacada) : null)}
        {fila('Agua', c.agua_l != null ? `${fmtNum(c.agua_l, 0)} L` : null)}
        {fila('Conservante', c.conservante_g != null ? `${fmtNum(c.conservante_g, 0)} g` : null)}
        {fila('Textura al sacar', textura ? `${textura.n} · ${textura.nombre}` : null)}
        {fila('Absorción', m.absorcion != null ? `${fmtNum(m.absorcion, 0)}%` : null)}
        {fila('Masa (bolas pesadas)', m.masa ? `${fmtNum(m.masa)} kg · ${m.bolas} bolas` : null)}
        {fila('Merma horno + enfriamiento', m.merma != null ? `${fmtNum(m.merma)}% · ${m.nMermas} ${m.nMermas === 1 ? 'medición' : 'mediciones'}` : null)}
      </div>
      <div>
        {Object.entries(emp).filter(([, n]) => n).map(([pid, n]) => fila(corto(e.referencias.find(p => p.id === pid)), `${n} paquetes`))}
        {fila('Kilos empacados', m.rend ? `${fmtNum(m.rend.kg)} kg` : null)}
        {fila('Telas por bulto', m.rend ? fmtNum(m.rend.telas, 0) : null)}
        {fila('Empacado en crudo', m.crudoEmp != null ? `${fmtNum(m.crudoEmp)} kg` : null)}
        {fila('Reproceso', m.reproceso ? `${fmtNum(m.reproceso)} kg` : '0 kg')}
        {fila('Desecho', m.desecho ? `${fmtNum(m.desecho)} kg` : '0 kg')}
        {fila('Masa sin explicar', m.sinExplicar != null ? `${fmtNum(m.sinExplicar)} kg (${fmtNum(m.sinExplicar / m.masa * 100)}%)` : null)}
        {fila('Atomizador llenado', `${m.aceite} ${m.aceite === 1 ? 'vez' : 'veces'}`)}
      </div>
    </div>
  )
}
