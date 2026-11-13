'use client'
import { useState, useEffect } from 'react'
import { getEmpresaId } from '@/lib/empresa'
import {
  nuevoId, ahora, lotesAbiertos, referencias, registrosDe, empacado, enBodega, planDeHoy, rangoPaquete, estadoPeso,
  cajasDe, telasPorBulto, unidadesPaquete, fmtNum, MOTIVOS_REPROCESO,
} from '@/lib/planta'
import { P, fuenteTitulo, BotonP, Rotulo, Hoja, Teclado, Casilla, Tecla, numP, cortoRef } from './ui'

// Pantalla de abajo: un monitor con teclado y mouse que hace de pantalla y de
// registro a la vez. Arriba, en grande, lo que está bajando, el peso del paquete
// y lo que sigue. En el centro un contador por referencia. Abajo, bodega,
// reproceso y desecho, y cerrar el lote. Con el teclado: Espacio suma una caja de lo que
// baja, flechas +1 y −1, D bolsa dañada, L ya llegó, P pesar caja.

const esTroquelable = (p) => !/kilo de masa/i.test(p.nombre)
const bolsasDe = (p) => [p.bolsa_id, ...(p.bolsas_otras || [])].filter(Boolean)
const CLAVE_BOLSAS = 'maissy_planta_bolsas'
const leerBolsas = () => { try { return JSON.parse(localStorage.getItem(CLAVE_BOLSAS) || '{}') } catch { return {} } }
const g = (n) => Number(n).toLocaleString('es-CO')
const nombreTanque = (t) => (t?.nombre || 'Lote').replace(/\s*bultos?$/i, '')
const nombreBolsa = (n) => { const x = (n || 'Bolsa').replace(/^bolsa\s+/i, '').toLowerCase(); return x[0].toUpperCase() + x.slice(1) }
const COLOR_PESO = { bien: P.verde, bajo: P.rojoTxt, alto: P.amarillo }
const PALABRA_PESO = { bien: 'Bien', bajo: 'Liviano', alto: 'Pesado' }
const suma = (l) => l.reduce((s, r) => s + Number(r.cantidad || 0), 0)

export default function Abajo(props) {
  const { estado } = props
  const lotes = lotesAbiertos(estado).filter(c => c.hora_sacada || registrosDe(estado, c.id, 'cambio_ref').length)
  const info = lotes.map(c => ({ c, r: referencias(estado, c) }))
  const bajandoUltimo = info.filter(x => x.r.bajando).sort((a, b) => b.r.bajando.hora.localeCompare(a.r.bajando.hora))[0]
  const sigueUltimo = info.filter(x => x.r.sigue).sort((a, b) => b.r.sigue.hora.localeCompare(a.r.sigue.hora))[0] || null
  const [fijo, setFijo] = useState(null)
  const c = lotes.find(x => x.id === fijo) || bajandoUltimo?.c || info[0]?.c || null

  if (!c) return (
    <div className="rounded-[28px] px-6 py-24 text-center flex flex-col gap-2" style={{ background: P.panel }}>
      <b className="text-[clamp(40px,4vw,64px)]" style={{ fontFamily: fuenteTitulo, color: P.gris }}>Todavía no baja nada</b>
      <span className="text-[24px]" style={{ color: P.tenue }}>Cuando arriba saquen un tanque y escojan la referencia, aparece aquí.</span>
    </div>
  )
  return <Empaque {...props} c={c} lotes={lotes} sigueUltimo={sigueUltimo} onLote={setFijo} />
}

function Empaque({ estado, usuario, puesto, accion, medir, teclado, c, lotes, sigueUltimo, onLote }) {
  const tanqueDe = (x) => nombreTanque(estado.tanques.find(t => t.id === x?.tanque_id))
  const r = referencias(estado, c)
  const pBaja = estado.referencias.find(p => p.id === r.bajando?.producto_id)
  const sigue = sigueUltimo?.r.sigue || null
  const pSigue = estado.referencias.find(p => p.id === sigue?.producto_id)
  const plan = planDeHoy(estado, pBaja?.id)
  const rango = pBaja && rangoPaquete(estado, pBaja)

  const [elegidas, setElegidas] = useState(leerBolsas)
  const bolsaDe = (p) => { const l = bolsasDe(p); return l.includes(elegidas[p.id]) ? elegidas[p.id] : l[0] || null }
  const elegirBolsa = (p, id) => { const n = { ...elegidas, [p.id]: id }; setElegidas(n); try { localStorage.setItem(CLAVE_BOLSAS, JSON.stringify(n)) } catch {} }
  const [extra, setExtra] = useState([]) // referencias que se agregaron a mano
  const [hoja, setHoja] = useState(null) // { tipo: 'otras' | 'bolsa' | 'corregir' | 'pesar' | 'merma' | 'cerrar', p }

  const reg = (tipo, datos, lote = c) => ({ op: 'insert', tabla: 'produccion_muestras_peso', datos: {
    id: nuevoId(), empresa_id: getEmpresaId(), cochada_id: lote.id, tipo, hora: ahora(), puesto,
    registrado_por: usuario.nombre, anulado: false, ...datos,
  } })
  const anular = (op) => ({ op: 'update', tabla: 'produccion_muestras_peso', id: op.datos.id, datos: { anulado: true } })

  const emp = empacado(estado, c)
  const bod = enBodega(estado, c)
  const porPasar = Object.entries(emp).reduce((s, [pid, n]) => s + Math.max(0, n - (bod[pid] || 0)), 0)
  const enBod = Object.values(bod).reduce((s, n) => s + n, 0)
  const danadas = registrosDe(estado, c.id, 'bolsa_danada')
  const danadasDe = (p) => suma(danadas.filter(x => x.producto_id === p.id))
  const enPlan = new Map(plan.filas.map((f, i) => [f.producto_id, { ...f, n: i + 1 }]))
  const refs = estado.referencias.filter(esTroquelable)
  const visibles = new Set([pBaja?.id, pSigue?.id, ...plan.filas.map(f => f.producto_id), ...Object.keys(emp).filter(id => emp[id]), ...extra].filter(Boolean))
  const orden = refs.filter(p => visibles.has(p.id))
    .sort((a, b) => (enPlan.get(a.id)?.n ?? 99) - (enPlan.get(b.id)?.n ?? 99) || a.sku.localeCompare(b.sku))
  const ocultas = refs.filter(p => !visibles.has(p.id))
  const cajas = medir && pBaja ? cajasDe(estado, c, pBaja) : null
  const ultimaCaja = cajas?.pesadas[cajas.pesadas.length - 1]
  const estUltima = ultimaCaja && estadoPeso(estado, pBaja, Number(ultimaCaja.peso_promedio_g))
  const rend = medir ? telasPorBulto(estado, c) : null

  const sumar = (p, n) => {
    if (!p || (emp[p.id] || 0) + n < 0) return
    const bolsa = bolsaDe(p)
    const op = reg('empaque', { producto_id: p.id, cantidad: n, ...(bolsa ? { bolsa_id: bolsa } : {}) })
    accion(op, { texto: `${cortoRef(p)} ${n > 0 ? '+' : '−'}${Math.abs(n)}`, deshacer: anular(op) })
  }
  const caja = (p) => p && sumar(p, Number(p.paquetes_por_caja) || 10)
  const danada = (p) => {
    if (!p) return
    const bolsa = bolsaDe(p)
    const op = reg('bolsa_danada', { producto_id: p.id, cantidad: 1, ...(bolsa ? { bolsa_id: bolsa } : {}) })
    accion(op, { texto: `Bolsa dañada · ${nombreBolsa(estado.bolsas?.[bolsa])}`, deshacer: anular(op) })
  }
  const llego = () => {
    if (!sigue) return
    const op = reg('llego_ref', { producto_id: sigue.producto_id }, sigueUltimo.c)
    onLote(null)
    accion(op, { texto: `Llegó ${cortoRef(pSigue)}`, deshacer: anular(op) })
  }
  const pasar = () => accion({ op: 'rpc', rpc: 'produccion_pasar_a_bodega', args: { p_cochada_id: c.id, p_usuario: usuario.nombre } }, { texto: `${porPasar} paquetes pasaron a bodega` })

  // Atajos del teclado: solo cuando no hay una hoja abierta.
  useEffect(() => {
    if (!teclado || hoja) return
    const f = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || /input|textarea/i.test(e.target?.tagName || '')) return
      const k = e.key.toLowerCase()
      if (k === ' ') { e.preventDefault(); caja(pBaja) }
      else if (k === 'arrowup' || k === '+') { e.preventDefault(); sumar(pBaja, 1) }
      else if (k === 'arrowdown' || k === '-') { e.preventDefault(); sumar(pBaja, -1) }
      else if (k === 'd') danada(pBaja)
      else if (k === 'l') llego()
      else if (k === 'p' && cajas?.faltan > 0) setHoja({ tipo: 'pesar' })
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  })

  const tecla = (t, oscura) => teclado ? <Tecla oscura={oscura}>{t}</Tecla> : null
  const cerrarHoja = () => setHoja(null)

  return (
    <div className="flex flex-col gap-4 pb-[130px]">
      {lotes.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap" role="radiogroup" aria-label="Lote que se empaca">
          <Rotulo className="mr-1">Empacando</Rotulo>
          {lotes.map(x => {
            const si = x.id === c.id
            return <button key={x.id} type="button" role="radio" aria-checked={si} onClick={() => onLote(x.id)} className="rounded-full min-h-[52px] px-5 text-[18px] font-extrabold cursor-pointer hover:brightness-110"
              style={si ? { background: P.amarillo, color: P.fondo } : { background: P.panel2, color: P.texto }}>{tanqueDe(x)}</button>
          })}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="rounded-[28px] p-6 flex flex-col gap-2 min-w-0" style={{ background: P.panel }} aria-label="Bajando ahora">
          <Rotulo>Bajando ahora · {tanqueDe(c)}</Rotulo>
          <b className={`${pBaja ? 'text-[clamp(60px,6.5vw,128px)]' : 'text-[clamp(36px,3vw,56px)]'} leading-[.95]`} style={{ fontFamily: fuenteTitulo, color: pBaja ? P.amarillo : P.gris }}>{pBaja ? cortoRef(pBaja) : 'Esperando la primera referencia'}</b>
          {rango && <>
            <Rotulo className="mt-2">Cada paquete debe pesar{unidadesPaquete(pBaja) ? ` · ${unidadesPaquete(pBaja)} arepas` : ''}</Rotulo>
            <b className="text-[clamp(44px,4.6vw,92px)] leading-none tabular-nums" style={{ fontFamily: fuenteTitulo }}>{g(rango.min)} a {g(rango.max)} g</b>
          </>}
          {cajas && ultimaCaja && <b className="text-[22px] mt-1" style={{ color: COLOR_PESO[estUltima] || P.gris }}>Última caja {g(Math.round(ultimaCaja.peso_promedio_g))} g · {PALABRA_PESO[estUltima] || ''}</b>}
        </section>

        {sigue ? (
          <section className="rounded-[28px] p-6 flex flex-col gap-3 min-w-0" style={{ background: P.amarillo, color: P.fondo }} aria-label="Sigue">
            <Rotulo color={P.fondo}>Sigue · llega en unos {sigue.faltan} min</Rotulo>
            <b className="text-[clamp(44px,4vw,80px)] leading-none" style={{ fontFamily: fuenteTitulo }}>{cortoRef(pSigue)}</b>
            <span className="text-[22px] font-extrabold">Alisten bolsas{rangoPaquete(estado, pSigue) ? ` · paquete ${g(rangoPaquete(estado, pSigue).min)} a ${g(rangoPaquete(estado, pSigue).max)} g` : ''}</span>
            <BotonP alto={84} className="mt-auto" style={{ background: P.fondo, color: P.texto }} onClick={llego}>Ya llegó {cortoRef(pSigue)}{tecla('L')}</BotonP>
          </section>
        ) : (
          <section className="rounded-[28px] p-6 flex flex-col gap-2 min-w-0" style={{ background: P.panel }} aria-label="Sigue">
            <Rotulo>Sigue</Rotulo>
            {plan.sigue
              ? <><b className="text-[clamp(36px,3.4vw,64px)] leading-none" style={{ fontFamily: fuenteTitulo }}>{cortoRef(plan.sigue.producto)}</b><span className="text-[22px] font-bold" style={{ color: P.gris }}>En el plan · {g(plan.sigue.paquetes)} paquetes</span></>
              : <b className="text-[28px]" style={{ color: P.tenue }}>Sin cambio programado</b>}
          </section>
        )}
      </div>

      {cajas && cajas.faltan > 0 && (
        <div className="rounded-[20px] p-4 flex items-center gap-4 flex-wrap" style={{ background: P.panel, boxShadow: `inset 0 0 0 3px ${P.amarillo}` }}>
          <b className="flex-1 min-w-[220px] text-[24px]">Caja {cajas.pesadas.length + 1} de {cortoRef(pBaja)} llena: pese 3 paquetes</b>
          <BotonP tono="amarillo" alto={76} className="min-w-[200px]" onClick={() => setHoja({ tipo: 'pesar' })}>Pesar{tecla('P', true)}</BotonP>
        </div>
      )}

      <section className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 330px), 1fr))' }} aria-label="Paquetes de este lote">
        {orden.map(p => {
          const total = emp[p.id] || 0
          const porCaja = Number(p.paquetes_por_caja) || null
          const nCajas = porCaja ? Math.floor(total / porCaja) : 0
          const sueltos = porCaja ? total - nCajas * porCaja : 0
          const baja = p.id === pBaja?.id
          const f = enPlan.get(p.id)
          const nDan = danadasDe(p)
          return (
            <article key={p.id} className="rounded-[22px] p-4 flex flex-col gap-3 min-w-0" style={{ background: P.panel, boxShadow: baja ? `inset 0 0 0 4px ${P.amarillo}` : 'none' }}>
              <div className="flex items-start justify-between gap-2">
                <b className="text-[24px] leading-tight min-w-0" style={{ fontFamily: fuenteTitulo }}>{cortoRef(p)}</b>
                {baja ? <span className="rounded-full px-3 py-1 text-[15px] font-extrabold shrink-0" style={{ background: P.amarillo, color: P.fondo }}>Bajando</span>
                  : f?.listo ? <span className="text-[16px] font-extrabold shrink-0" style={{ color: P.verde }}>Listo</span> : null}
              </div>
              {bolsasDe(p).length > 1 && (
                <button type="button" onClick={() => setHoja({ tipo: 'bolsa', p })} className="rounded-[14px] min-h-[48px] px-4 text-left flex items-center justify-between gap-2 cursor-pointer hover:brightness-125" style={{ background: P.panel2 }}>
                  <span className="min-w-0 truncate text-[17px] font-bold"><span style={{ color: P.gris }}>Bolsa </span>{nombreBolsa(estado.bolsas?.[bolsaDe(p)])}</span>
                  <span className="text-[15px] font-extrabold shrink-0" style={{ color: P.gris }}>Cambiar</span>
                </button>
              )}
              <button type="button" onClick={() => setHoja({ tipo: 'corregir', p })} className="flex items-baseline justify-between gap-2 flex-wrap text-left cursor-pointer" aria-label={`Corregir paquetes de ${cortoRef(p)}`}>
                <span className="text-[60px] leading-none font-extrabold tabular-nums" style={{ fontFamily: fuenteTitulo }}>{g(total)}</span>
                <span className="text-[18px] font-bold tabular-nums" style={{ color: P.gris }}>
                  {porCaja && total > 0 ? `${nCajas} ${nCajas === 1 ? 'caja' : 'cajas'}${sueltos ? ` + ${sueltos}` : ''}` : ''}
                  {f ? `${porCaja && total > 0 ? ' · ' : ''}plan ${g(f.paquetes)}` : ''}
                </span>
              </button>
              <div className="grid gap-2" style={{ gridTemplateColumns: '76px 76px minmax(0,1fr)' }}>
                <BotonP alto={76} className="!px-0 text-[26px]" onClick={() => sumar(p, -1)} aria-label={`Restar 1 de ${cortoRef(p)}`}>−1</BotonP>
                <BotonP alto={76} className="!px-0 text-[26px]" onClick={() => sumar(p, 1)} aria-label={`Sumar 1 a ${cortoRef(p)}`}>+1</BotonP>
                <BotonP tono={baja ? 'amarillo' : 'blanco'} alto={76} className="!px-2 text-[24px]" onClick={() => caja(p)} aria-label={porCaja ? `Sumar una caja de ${porCaja} a ${cortoRef(p)}` : `Sumar 10 a ${cortoRef(p)}`}>
                  {porCaja ? `Caja ${porCaja}` : '+10'}{baja && tecla('Espacio', true)}
                </BotonP>
              </div>
              <button type="button" onClick={() => danada(p)} className="rounded-[14px] min-h-[48px] px-4 flex items-center justify-between gap-2 cursor-pointer hover:brightness-125" style={{ background: 'transparent', boxShadow: `inset 0 0 0 2px ${P.linea}`, color: P.gris }}>
                <span className="text-[17px] font-extrabold">Bolsa dañada{baja && tecla('D')}</span>
                <b className="text-[20px] tabular-nums" style={{ color: nDan ? P.texto : P.tenue }}>{nDan}</b>
              </button>
            </article>
          )
        })}
        {ocultas.length > 0 && (
          <button type="button" onClick={() => setHoja({ tipo: 'otras' })} className="rounded-[22px] min-h-[120px] self-start text-[22px] font-extrabold cursor-pointer hover:brightness-125" style={{ background: 'transparent', color: P.gris, boxShadow: `inset 0 0 0 3px ${P.linea}` }}>Otra referencia</button>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30" style={{ background: P.fondo, borderTop: `2px solid ${P.linea}`, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="max-w-[1800px] mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="flex-1 min-w-[200px] flex gap-7 flex-wrap">
            <span><Rotulo>Por pasar a bodega</Rotulo><b className="text-[32px] leading-none tabular-nums" style={{ fontFamily: fuenteTitulo }}>{g(porPasar)}</b></span>
            <span><Rotulo>En bodega</Rotulo><b className="text-[32px] leading-none tabular-nums" style={{ fontFamily: fuenteTitulo, color: P.gris }}>{g(enBod)}</b></span>
            <span><Rotulo>Bolsas dañadas</Rotulo><b className="text-[32px] leading-none tabular-nums" style={{ fontFamily: fuenteTitulo, color: P.gris }}>{g(suma(danadas))}</b></span>
            {rend && <span><Rotulo>Telas por bulto</Rotulo><b className="text-[32px] leading-none tabular-nums" style={{ fontFamily: fuenteTitulo, color: P.gris }}>{fmtNum(rend.telas, 0)}</b></span>}
          </span>
          <BotonP alto={76} className="min-w-[240px]" onClick={() => setHoja({ tipo: 'merma' })}>Reproceso y desecho</BotonP>
          <BotonP tono="blanco" alto={76} className="min-w-[210px]" disabled={!porPasar} onClick={pasar}>Pasar a bodega</BotonP>
          <BotonP tono="rojo" alto={76} className="min-w-[180px]" onClick={() => setHoja({ tipo: 'cerrar' })}>Cerrar lote</BotonP>
        </div>
      </div>

      {hoja?.tipo === 'otras' && (
        <Hoja titulo="Otra referencia" onCancelar={cerrarHoja}>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))' }}>
            {ocultas.map(p => <BotonP key={p.id} alto={96} onClick={() => { setExtra([...extra, p.id]); cerrarHoja() }}>{cortoRef(p)}</BotonP>)}
          </div>
        </Hoja>
      )}
      {hoja?.tipo === 'bolsa' && (
        <Hoja titulo={`Bolsa de ${cortoRef(hoja.p)}`} onCancelar={cerrarHoja}>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))' }}>
            {bolsasDe(hoja.p).map(id => (
              <BotonP key={id} tono={bolsaDe(hoja.p) === id ? 'amarillo' : 'oscuro'} alto={96} onClick={() => { elegirBolsa(hoja.p, id); cerrarHoja() }}>{nombreBolsa(estado.bolsas?.[id])}</BotonP>
            ))}
          </div>
        </Hoja>
      )}
      {hoja?.tipo === 'corregir' && <Corregir p={hoja.p} total={emp[hoja.p.id] || 0} onCancelar={cerrarHoja}
        onListo={(n) => { const d = n - (emp[hoja.p.id] || 0); if (d) sumar(hoja.p, d); cerrarHoja() }} />}
      {hoja?.tipo === 'pesar' && pBaja && <Pesar estado={estado} p={pBaja} caja={cajas.pesadas.length + 1} onCancelar={cerrarHoja}
        onListo={(ps) => {
          const op = reg('paquete', { producto_id: pBaja.id, pesos_individuales: ps, peso_promedio_g: ps.reduce((s, v) => s + v, 0) / ps.length, peso_estandar_g: Number(pBaja.peso_estandar_g) || null })
          accion(op, { texto: `Caja ${cajas.pesadas.length + 1} pesada`, deshacer: anular(op) })
          cerrarHoja()
        }} />}
      {hoja?.tipo === 'merma' && <Merma estado={estado} c={c} titulo="Reproceso y desecho" boton="Guardar" onCancelar={cerrarHoja}
        onListo={(kg, motivo) => {
          const ops = [
            ...(numP(kg.reproceso) > 0 ? [reg('reproceso', { cantidad: numP(kg.reproceso), motivo })] : []),
            ...(numP(kg.desecho) > 0 ? [reg('desecho', { cantidad: numP(kg.desecho) })] : []),
          ]
          if (ops.length) accion(ops, { texto: 'Reproceso y desecho anotados', deshacer: ops.map(anular) })
          cerrarHoja()
        }} />}
      {hoja?.tipo === 'cerrar' && <Merma estado={estado} c={c} titulo={`Cerrar ${tanqueDe(c)}`} boton="Cerrar lote" cierre onCancelar={cerrarHoja}
        onListo={(kg, motivo) => {
          accion([
            reg('reproceso', { cantidad: numP(kg.reproceso) || 0, motivo: numP(kg.reproceso) > 0 ? motivo : null }),
            reg('desecho', { cantidad: numP(kg.desecho) || 0 }),
            { op: 'rpc', rpc: 'produccion_pasar_a_bodega', args: { p_cochada_id: c.id, p_usuario: usuario.nombre } },
            { op: 'update', tabla: 'produccion_cochadas', id: c.id, datos: { estado: 'cerrado', cerrado_at: ahora(), cerrado_por: usuario.nombre } },
          ], { texto: `${tanqueDe(c)} cerrado` })
          cerrarHoja(); onLote(null)
        }} />}
    </div>
  )
}

// --- Corregir el conteo: se escribe cuántos hay y se guarda la diferencia ---------

function Corregir({ p, total, onCancelar, onListo }) {
  const [v, setV] = useState(String(total))
  const listo = v !== '' && numP(v) !== total
  return (
    <Hoja titulo={`Paquetes de ${cortoRef(p)}`} onCancelar={onCancelar}>
      <div className="grid gap-5 md:grid-cols-2 items-start">
        <div className="flex flex-col gap-3">
          <Casilla rotulo={`Había ${g(total)}. ¿Cuántos hay?`} valor={v} unidad="paq." activa />
          <BotonP tono="rojo" alto={96} disabled={!listo} onClick={() => onListo(Math.round(numP(v)))}>Guardar</BotonP>
        </div>
        <Teclado valor={v} onCambio={setV} decimales={false} onEnter={() => listo && onListo(Math.round(numP(v)))} />
      </div>
    </Hoja>
  )
}

// --- Pesar 3 paquetes de una caja: escribe, Enter, pasa al siguiente ---------------

function Pesar({ estado, p, caja, onCancelar, onListo }) {
  const [pesos, setPesos] = useState(['', '', ''])
  const [i, setI] = useState(0)
  const rango = rangoPaquete(estado, p)
  const est = (v) => estadoPeso(estado, p, numP(v))
  const completos = pesos.every(v => numP(v) > 0)
  const enter = () => {
    if (!(numP(pesos[i]) > 0)) return
    if (i < 2) setI(i + 1); else if (completos) onListo(pesos.map(numP))
  }
  return (
    <Hoja titulo={`Caja ${caja} de ${cortoRef(p)}`} onCancelar={onCancelar}>
      {rango && <span className="text-[26px] font-extrabold tabular-nums">Debe pesar {g(rango.min)} a {g(rango.max)} g</span>}
      <div className="grid grid-cols-3 gap-2.5">
        {pesos.map((v, j) => (
          <div key={j} className="flex flex-col gap-1.5">
            <Casilla rotulo={`Paquete ${j + 1}`} valor={v} unidad="g" activa={i === j} tono={COLOR_PESO[est(v)]} onClick={() => setI(j)} />
            <b className="text-[19px] text-center" style={{ color: COLOR_PESO[est(v)] || P.tenue }}>{PALABRA_PESO[est(v)] || ' '}</b>
          </div>
        ))}
      </div>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start">
        <Teclado valor={pesos[i]} decimales={false} onEnter={enter} onCambio={(v) => setPesos(pesos.map((x, j) => j === i ? v : x))} />
        <div className="flex flex-col gap-2.5">
          {i < 2 && <BotonP alto={96} disabled={!(numP(pesos[i]) > 0)} onClick={() => setI(i + 1)}>Siguiente paquete <Tecla>Enter</Tecla></BotonP>}
          <BotonP tono="rojo" alto={96} disabled={!completos} onClick={() => onListo(pesos.map(numP))}>Guardar caja</BotonP>
        </div>
      </div>
    </Hoja>
  )
}

// --- Reproceso (vuelve al molino) y desecho (se bota) -------------------------------
// Se pesan cuando se llenan y al cerrar el lote. Al cerrar, 0 dice que no hubo.

function Merma({ estado, c, titulo, boton, cierre, onCancelar, onListo }) {
  const [kg, setKg] = useState({ reproceso: '', desecho: '' })
  const [activa, setActiva] = useState('reproceso')
  const [motivo, setMotivo] = useState(MOTIVOS_REPROCESO[0])
  const antes = { reproceso: suma(registrosDe(estado, c.id, 'reproceso')), desecho: suma(registrosDe(estado, c.id, 'desecho')) }
  const emp = empacado(estado, c)
  const nombre = (id) => cortoRef(estado.referencias.find(p => p.id === id))
  const listo = cierre ? kg.reproceso !== '' && kg.desecho !== '' : numP(kg.reproceso) > 0 || numP(kg.desecho) > 0
  const enter = () => { if (activa === 'reproceso') setActiva('desecho'); else if (listo) onListo(kg, motivo) }
  const nota = (t) => antes[t] ? `Ya anotado en este lote: ${fmtNum(antes[t])} kg` : null
  return (
    <Hoja titulo={titulo} onCancelar={onCancelar}>
      {cierre && (
        <div className="rounded-[20px] p-4 flex gap-x-8 gap-y-2 flex-wrap" style={{ background: P.panel }}>
          {Object.entries(emp).filter(([, n]) => n > 0).map(([id, n]) => (
            <span key={id} className="flex flex-col"><span className="text-[17px] font-bold" style={{ color: P.gris }}>{nombre(id)}</span><b className="text-[32px] leading-none tabular-nums" style={{ fontFamily: fuenteTitulo }}>{g(n)}</b></span>
          ))}
          {!Object.values(emp).some(n => n > 0) && <b className="text-[22px]" style={{ color: P.gris }}>No se contaron paquetes en este lote</b>}
        </div>
      )}
      <Rotulo>{cierre ? 'Pese el reproceso y el desecho · si no hay, escriba 0' : 'Pese y anote antes de desocupar'}</Rotulo>
      <div className="grid gap-5 md:grid-cols-2 items-start">
        <div className="flex flex-col gap-2.5">
          <Casilla rotulo="Reproceso · vuelve al molino" valor={kg.reproceso} unidad="kg" activa={activa === 'reproceso'} onClick={() => setActiva('reproceso')} />
          {nota('reproceso') && <span className="text-[16px] font-bold -mt-1" style={{ color: P.gris }}>{nota('reproceso')}</span>}
          {numP(kg.reproceso) > 0 && <>
            <Rotulo className="mt-1">Motivo principal</Rotulo>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Motivo principal del reproceso">
              {MOTIVOS_REPROCESO.map(m => <button key={m} type="button" role="radio" aria-checked={m === motivo} onClick={() => setMotivo(m)} className="rounded-[16px] min-h-[60px] text-[20px] font-extrabold cursor-pointer hover:brightness-110"
                style={m === motivo ? { background: P.amarillo, color: P.fondo } : { background: P.panel2, color: P.texto }}>{m}</button>)}
            </div>
          </>}
          <Casilla rotulo="Desecho · arepa que se bota" valor={kg.desecho} unidad="kg" activa={activa === 'desecho'} onClick={() => setActiva('desecho')} />
          {nota('desecho') && <span className="text-[16px] font-bold -mt-1" style={{ color: P.gris }}>{nota('desecho')}</span>}
          <span className="text-[16px] font-bold" style={{ color: P.tenue }}>Las bolsas dañadas no se pesan: se anotan con su botón en cada referencia.</span>
        </div>
        <Teclado valor={kg[activa]} onEnter={enter} onCambio={(v) => setKg({ ...kg, [activa]: v })} />
      </div>
      {cierre && !c.hora_sacada && <b className="text-[19px]" style={{ color: P.amarillo }}>Arriba no marcaron la hora en que se sacó. El lote se cierra igual.</b>}
      <div className="flex gap-3 justify-end flex-wrap">
        <BotonP alto={88} onClick={onCancelar}>{cierre ? 'No, seguir empacando' : 'Cancelar'}</BotonP>
        <BotonP tono="rojo" alto={88} className="min-w-[260px]" disabled={!listo} onClick={() => onListo(kg, motivo)}>{boton}</BotonP>
      </div>
    </Hoja>
  )
}
