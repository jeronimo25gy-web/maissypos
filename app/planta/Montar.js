'use client'
import { useState } from 'react'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { nuevoId, ahora, estandar, lotesAbiertos, fmtHora } from '@/lib/planta'
import { C, titulo, Boton, Etiqueta, Tarjeta } from './ui'

const POSICIONES = ['abajo', 'medio', 'arriba']
const nombrePos = { abajo: 'Abajo', medio: 'Medio', arriba: 'Arriba' }
const COLOR_MAIZ = (m) => /amarill/i.test(m?.nombre || '') ? '#F2B21B' : '#D9D2BF'
const leer = (v) => Number(String(v ?? '').replace(',', '.'))
const texto = (n) => String(Math.round(n * 100) / 100).replace('.', ',')

// Montar lotes de cocción: se escogen uno o varios tanques libres y en cada uno
// su maíz (blanco o amarillo, nunca los dos juntos) y los bultos. Cada tanque
// queda como su propio lote. El maíz sale del inventario por tipo, el más viejo
// primero, así que no se escoge compra. Al empezar se guarda la hora.
export default function Montar({ estado, usuario, onRegistrar, onCancelar }) {
  const tanques = estado.tanques || []
  const ocupados = new Map(lotesAbiertos(estado).filter(c => !c.hora_sacada).map(c => [c.tanque_id, c]))
  const maices = estado.maices?.length ? estado.maices : (estado.maiz ? [estado.maiz] : [])
  const maizDe = (t) => maices.find(m => m.id === t?.materia_prima_id) || maices[0] || null
  const porBulto = Number(estandar(estado, 'conservante_g_bulto')?.valor) || null
  // tanqueId -> { maizId, bultos (texto, admite "1,5"), agua }
  const [sel, setSel] = useState({})
  const [testigos, setTestigos] = useState(POSICIONES)
  const [error, setError] = useState('')

  const alternar = (t) => setSel(s => {
    const n = { ...s }
    if (n[t.id]) delete n[t.id]; else n[t.id] = { maizId: maizDe(t)?.id || '', bultos: texto(Number(t.capacidad_bultos)), agua: '' }
    return n
  })
  const cambiar = (id, datos) => setSel(s => ({ ...s, [id]: { ...s[id], ...datos } }))
  const sumar = (id, d) => cambiar(id, { bultos: texto(Math.max(0, (leer(sel[id].bultos) || 0) + d)) })

  const elegidos = tanques.filter(t => sel[t.id])
  const total = (filtro) => elegidos.filter(filtro).reduce((s, t) => s + (leer(sel[t.id].bultos) || 0), 0)
  const resumenMaiz = maices.map(m => ({ m, b: total(t => sel[t.id].maizId === m.id) })).filter(x => x.b > 0)
  const totalBultos = total(() => true)

  const empezar = () => {
    if (!elegidos.length) { setError('Escoge al menos un tanque.'); return }
    const malo = elegidos.find(t => !(leer(sel[t.id].bultos) > 0))
    if (malo) { setError(`Indique los bultos del ${malo.nombre}. Admite decimales, por ejemplo 1,5.`); return }
    if (elegidos.some(t => !maices.find(m => m.id === sel[t.id].maizId))) { setError('Escoge el maíz de cada tanque.'); return }
    const empresaId = getEmpresaId()
    const fecha = obtenerFechaActual()
    const hora = ahora()
    const ops = []
    let primero = null
    for (const t of elegidos) {
      const { maizId, bultos, agua } = sel[t.id]
      const maiz = maices.find(m => m.id === maizId)
      const b = leer(bultos)
      const id = nuevoId()
      primero = primero || id
      ops.push(
        { op: 'insert', tabla: 'produccion_cochadas', datos: {
          id, empresa_id: empresaId, fecha, materia_prima_id: maiz.id, cantidad: b,
          registrado_por: usuario.nombre, estado: 'abierto', tanque_id: t.id,
          hora_montada: hora, agua_l: leer(agua) > 0 ? leer(agua) : null, conservante_g: porBulto ? Math.round(porBulto * b) : null, maiz_kg: null,
          testigos: testigos.length ? testigos.map(pos => ({ pos, kg: null })) : null, anulada: false,
        } },
        { op: 'insert', tabla: 'inventario_mov', datos: {
          id: nuevoId(), empresa_id: empresaId, sku: maiz.sku, cantidad: b, fecha, tipo_movimiento: 'salida',
          referencia: `Cochada: ${maiz.nombre} puesto en produccion · ${t.nombre}`,
        } },
      )
    }
    onRegistrar(ops, elegidos.length === 1 ? primero : null)
  }

  return (
    <Tarjeta>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-2xl font-extrabold" style={titulo}>Montar lotes de cocción</h2>
        <Boton onClick={onCancelar}>Cancelar</Boton>
      </div>
      <p className="text-sm" style={{ color: C.gris }}>Escoge los tanques que vas a montar. Cada tanque lleva un solo maíz y sus bultos; se puede con decimales, por ejemplo 1,5.</p>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))' }}>
        {tanques.map(t => {
          const oc = ocupados.get(t.id)
          if (oc) return (
            <div key={t.id} className="rounded-2xl p-4 flex flex-col gap-1" style={{ background: C.fondo, boxShadow: `inset 0 0 0 1.5px ${C.linea}` }}>
              <b className="text-xl" style={titulo}>{t.nombre}</b>
              <span className="text-[13px]" style={{ color: C.gris }}>{oc.hora_apagado ? 'Reposando' : 'Cocinando'} desde las {fmtHora(oc.hora_montada)}. Se libera cuando se saca.</span>
            </div>
          )
          const s = sel[t.id]
          const b = s ? leer(s.bultos) || 0 : 0
          const cap = Number(t.capacidad_bultos) || 0
          const maiz = s && maices.find(m => m.id === s.maizId)
          return (
            <div key={t.id} className="rounded-2xl p-4 flex flex-col gap-3" style={s ? { background: '#fff', boxShadow: `inset 0 0 0 2.5px ${C.tinta}` } : { background: C.suave }}>
              <button type="button" onClick={() => alternar(t)} aria-pressed={!!s} className="flex justify-between gap-3 items-start text-left">
                <span><b className="text-xl" style={titulo}>{t.nombre}</b><br />
                  <span className="text-[13px] tabular-nums" style={{ color: C.gris }}>{s ? `${texto(b)} de ${cap} bultos${porBulto ? ` · ${Math.round(porBulto * b).toLocaleString('es-CO')} g de conservante` : ''}` : `${t.con_presion ? 'Con presión' : 'Tapa suelta'} · caben ${cap}`}</span></span>
                <span className="w-8 h-8 rounded-[10px] shrink-0 flex items-center justify-center" style={s ? { background: C.tinta } : { background: '#fff', boxShadow: `inset 0 0 0 2px ${C.linea}` }} aria-hidden="true">{s && <i className="w-3 h-3 rounded-[3px] bg-white" />}</span>
              </button>
              {s && (
                <>
                  {maices.length > 1 && (
                    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={`Maíz del ${t.nombre}`}>
                      {maices.map(m => (
                        <button key={m.id} type="button" role="radio" aria-checked={s.maizId === m.id} onClick={() => cambiar(t.id, { maizId: m.id })}
                          className="min-h-[52px] rounded-2xl font-bold flex items-center justify-center gap-2"
                          style={s.maizId === m.id ? { background: '#fff', boxShadow: `inset 0 0 0 2.5px ${C.tinta}` } : { background: C.fondo }}>
                          <i className="w-3.5 h-3.5 rounded" style={{ background: COLOR_MAIZ(m) }} />{m.nombre.replace(/^Maíz /i, '')}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="h-3.5 rounded-full overflow-hidden flex" style={{ background: C.suave }} role="img" aria-label={`${texto(b)} de ${cap} bultos`}>
                    <i className="block h-full" style={{ width: `${cap ? Math.min(100, b / cap * 100) : 0}%`, background: COLOR_MAIZ(maiz) }} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Boton className="!px-0 w-16 text-2xl shrink-0" grande onClick={() => sumar(t.id, -0.5)} aria-label="Medio bulto menos">−</Boton>
                    <input inputMode="decimal" value={s.bultos} onChange={e => cambiar(t.id, { bultos: e.target.value })} aria-label={`Bultos en el ${t.nombre}`}
                      className="flex-1 min-w-0 h-16 rounded-2xl border-2 bg-white text-center text-[26px] font-extrabold" style={{ borderColor: C.linea, ...titulo }} />
                    <Boton className="!px-0 w-16 text-2xl shrink-0" grande onClick={() => sumar(t.id, 0.5)} aria-label="Medio bulto más">+</Boton>
                  </div>
                  {b > cap && cap > 0 && <div className="rounded-xl px-3 py-2 text-sm font-bold" style={{ background: C.ambarF, color: C.ambar }}>Pasa la capacidad del tanque por {texto(b - cap)} bultos.</div>}
                  <label className="flex items-center gap-2 text-sm"><span className="font-bold" style={{ color: C.gris }}>Agua · por medir</span>
                    <input inputMode="decimal" placeholder="litros" value={s.agua} onChange={e => cambiar(t.id, { agua: e.target.value })}
                      className="flex-1 min-w-0 h-12 rounded-xl border-2 bg-white px-3 text-lg font-bold" style={{ borderColor: C.linea }} /></label>
                </>
              )}
            </div>
          )
        })}
      </div>

      <Etiqueta extra="2 semanas de medición: las 3 · después: 1 en el medio">Bolsas testigo de 1 kg en cada tanque</Etiqueta>
      <div className="flex gap-2 flex-wrap">
        {POSICIONES.map(p => {
          const on = testigos.includes(p)
          return <button key={p} type="button" onClick={() => setTestigos(on ? testigos.filter(x => x !== p) : POSICIONES.filter(x => x === p || testigos.includes(x)))}
            className="rounded-full min-h-[50px] px-5 font-bold"
            style={on ? { background: '#fff', boxShadow: `inset 0 0 0 2.5px ${C.tinta}` } : { background: C.suave }}>{nombrePos[p]}</button>
        })}
      </div>

      {error && <p className="text-sm font-bold" style={{ color: C.rojo }}>{error}</p>}
      <div className="rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap" style={{ background: C.tinta, color: '#fff' }}>
        <span className="flex-1 min-w-[200px]">
          <b className="text-xl" style={titulo}>{elegidos.length ? `${texto(totalBultos)} bultos en ${elegidos.length} ${elegidos.length === 1 ? 'tanque' : 'tanques'}` : 'Escoge un tanque libre'}</b><br />
          <span className="text-[13px]" style={{ color: '#CFCBC0' }}>{elegidos.length ? `${resumenMaiz.map(x => `${texto(x.b)} ${x.m.nombre.replace(/^Maíz /i, '').toLowerCase()}`).join(' · ')}${porBulto ? ` · ${Math.round(porBulto * totalBultos).toLocaleString('es-CO')} g de conservante` : ''} · la hora y el maíz salen al empezar` : 'Seleccione un tanque disponible.'}</span>
        </span>
        <Boton tipo="rojo" grande disabled={!elegidos.length} onClick={empezar} className="min-w-[240px]">{elegidos.length > 1 ? `Empezar cocción de ${elegidos.length} tanques` : 'Empezar cocción'}</Boton>
      </div>
    </Tarjeta>
  )
}
