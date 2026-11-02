'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { calcularStockPorSku } from '@/lib/inventario-helpers'
import { corto } from '@/lib/produccion-admin'
import { C, titulo, Pill } from './Paneles'

// Borrador: calcula el lote con las cargas de Maestros. Suma lo que llevan las
// rutas de Arepas y las de Distri (por el producto equivalente), resta lo que hay
// en bodega y lo pasa a bultos. Solo lee: no guarda el plan.
const DIAS = [[1, 'Lun'], [2, 'Mar'], [3, 'Mié'], [4, 'Jue'], [5, 'Vie'], [6, 'Sáb'], [0, 'Dom']]
const COLCHONES = [0, 5, 10]
const tarjeta = 'bg-white rounded-[18px] p-4'
const num = (n) => Math.round(n).toLocaleString('es-CO')
const columnas = { gridTemplateColumns: 'minmax(0,1fr) 58px 58px 58px 58px' }
const mediosBultos = (n) => Math.ceil(n * 2) / 2
const textoBultos = (n) => `${n.toLocaleString('es-CO')} ${n === 1 ? 'bulto' : 'bultos'}`
const esAmarilla = (p) => /amarill/i.test(p.nombre)

function tanquesPara(bultos, tanques) {
  const libres = tanques.filter(t => t.activo !== false && Number(t.capacidad_bultos) > 0).sort((a, b) => a.capacidad_bultos - b.capacidad_bultos)
  const usados = []
  let falta = bultos
  while (falta > 0 && libres.length) {
    const i = libres.findIndex(t => Number(t.capacidad_bultos) >= falta)
    const [t] = libres.splice(i >= 0 ? i : libres.length - 1, 1)
    usados.push(t.nombre)
    falta -= Number(t.capacidad_bultos)
  }
  return usados
}

async function cargasDe(empresaId, skus, dias) {
  if (!skus.length) return {}
  const [{ data: cargas }, { data: rutas }] = await Promise.all([
    supabase.from('cargas_ruta').select('sku, cantidad, ruta_id').eq('empresa_id', empresaId).in('dia_semana', dias).in('sku', skus),
    supabase.from('rutas').select('id').eq('empresa_id', empresaId).eq('estado', true),
  ])
  const activas = new Set((rutas || []).map(r => r.id))
  const total = {}
  ;(cargas || []).filter(c => activas.has(c.ruta_id)).forEach(c => { total[c.sku] = (total[c.sku] || 0) + Number(c.cantidad || 0) })
  return total
}

export default function PlanSugerido({ e }) {
  const manana = new Date(new Date(obtenerFechaActual() + 'T12:00:00').getTime() + 864e5).getDay()
  const [dias, setDias] = useState([manana])
  const [colchon, setColchon] = useState(0)
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')

  const refs = e.referencias.filter(p => !/kilo de masa/i.test(p.nombre))
  const tela = refs.find(p => /tela/i.test(p.nombre) && !/mini|amarill/i.test(p.nombre))
  const kgBulto = e.telasFormula && tela?.peso_estandar_g ? e.telasFormula * Number(tela.peso_estandar_g) / 1000 : null

  useEffect(() => {
    let vivo = true
    const empresaId = getEmpresaId()
    setDatos(null); setError('')
    ;(async () => {
      const { data: equivalentes, error: err } = await supabase.from('productos').select('sku, empresa_id, producto_espejo_id').in('producto_espejo_id', refs.map(p => p.id)).neq('empresa_id', empresaId)
      if (err) throw new Error(err.message)
      const otras = [...new Set((equivalentes || []).map(x => x.empresa_id))]
      const [propias, stockPropio, ...externas] = await Promise.all([
        dias.length ? cargasDe(empresaId, refs.map(p => p.sku), dias) : {},
        calcularStockPorSku({ empresaId }),
        ...otras.map(async id => ({
          id,
          cargas: dias.length ? await cargasDe(id, equivalentes.filter(x => x.empresa_id === id).map(x => x.sku), dias) : {},
          stock: await calcularStockPorSku({ empresaId: id }),
        })),
      ])
      const porEspejo = {}
      ;(equivalentes || []).forEach(x => {
        const o = externas.find(y => y.id === x.empresa_id)
        const f = (porEspejo[x.producto_espejo_id] = porEspejo[x.producto_espejo_id] || { cargas: 0, stock: 0 })
        f.cargas += o?.cargas[x.sku] || 0
        f.stock += Math.max(0, Number(o?.stock[x.sku]?.stockActual) || 0)
      })
      if (vivo) setDatos({ propias, stockPropio, porEspejo, conEquivalente: otras.length > 0 })
    })().catch(err => vivo && setError(err.message))
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias])

  const elegir = (n) => setDias(l => l.includes(n) ? l.filter(x => x !== n) : [...l, n])

  const filas = datos ? refs.map(p => {
    const propias = datos.propias[p.sku] || 0
    const otras = datos.porEspejo[p.id]?.cargas || 0
    const carga = propias + otras
    const necesita = Math.ceil(carga * (1 + colchon / 100))
    const bodega = Math.max(0, Number(datos.stockPropio[p.sku]?.stockActual) || 0) + (datos.porEspejo[p.id]?.stock || 0)
    const falta = Math.max(0, necesita - bodega)
    return { p, propias, otras, necesita, bodega, falta, kg: falta * Number(p.peso_estandar_g || 0) / 1000 }
  }).filter(f => f.necesita > 0 || f.bodega > 0) : []

  const kgDe = (l) => l.reduce((s, f) => s + f.kg, 0)
  const blanco = filas.filter(f => !esAmarilla(f.p)), amarillo = filas.filter(f => esAmarilla(f.p))
  const bultosBlanco = kgBulto ? mediosBultos(kgDe(blanco) / kgBulto) : 0
  const bultosAmarillo = kgBulto ? mediosBultos(kgDe(amarillo) / kgBulto) : 0
  const bultos = bultosBlanco + bultosAmarillo
  const tanques = tanquesPara(bultos, e.tanques)
  const paquetes = filas.reduce((s, f) => s + f.falta, 0)

  return (
    <div className="flex flex-col gap-3 max-w-4xl">
      <div className={tarjeta + ' flex items-center gap-3 flex-wrap justify-between'}>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold" style={{ color: C.gris }}>Despacho del</span>
          <div className="flex gap-1 rounded-full p-1 flex-wrap" style={{ background: C.suave }} role="group" aria-label="Días de despacho">
            {DIAS.map(([n, t]) => {
              const si = dias.includes(n)
              return <button key={n} type="button" aria-pressed={si} onClick={() => elegir(n)} className="rounded-full min-h-[36px] px-3 text-[13.5px] font-bold" style={si ? { background: C.tinta, color: '#fff' } : { color: C.gris }}>{t}</button>
            })}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold" style={{ color: C.gris }}>Colchón</span>
          <div className="flex gap-1 rounded-full p-1" style={{ background: C.suave }} role="group" aria-label="Colchón">
            {COLCHONES.map(n => <button key={n} type="button" aria-pressed={colchon === n} onClick={() => setColchon(n)} className="rounded-full min-h-[36px] px-3 text-[13.5px] font-bold" style={colchon === n ? { background: C.tinta, color: '#fff' } : { color: C.gris }}>{n}%</button>)}
          </div>
        </div>
      </div>

      {error ? <div className={tarjeta}><b style={{ color: C.rojo }}>No se pudo calcular: {error}</b></div> : !datos ? <p className="text-sm py-6 text-center" style={{ color: C.gris }}>Calculando…</p> : (
        <>
          <div className={tarjeta + ' grid gap-4'} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <div>
              <span className="block text-[14px] font-bold" style={{ color: C.gris }}>Montar hoy</span>
              <b className="block text-[34px] leading-10 font-extrabold tabular-nums" style={titulo}>{textoBultos(bultos)}</b>
              <span className="block text-[14px]" style={{ color: C.gris }}>{tanques.join(' + ') || 'Sin tanque'}</span>
            </div>
            <div>
              <span className="block text-[14px] font-bold" style={{ color: C.gris }}>Por maíz</span>
              <b className="block text-[20px] leading-7 tabular-nums">Blanco {bultosBlanco.toLocaleString('es-CO')}</b>
              <b className="block text-[20px] leading-7 tabular-nums">Amarillo {bultosAmarillo.toLocaleString('es-CO')}</b>
            </div>
            <div>
              <span className="block text-[14px] font-bold" style={{ color: C.gris }}>Paquetes por hacer</span>
              <b className="block text-[34px] leading-10 font-extrabold tabular-nums" style={titulo}>{num(paquetes)}</b>
              <span className="block text-[14px] tabular-nums" style={{ color: C.gris }}>{num(kgDe(filas))} kg</span>
            </div>
          </div>

          <div className={tarjeta + ' flex flex-col'}>
            <div className="grid gap-1.5 pb-2 text-[12.5px] font-bold text-right" style={{ ...columnas, color: C.gris }}>
              <span className="text-left">Referencia</span><span>Arepas</span><span>Distri</span><span>Bodega</span><span>Hacer</span>
            </div>
            {filas.length === 0 ? <p className="text-sm py-3" style={{ color: C.gris }}>Sin cargas para ese día</p> : filas.map(f => (
              <div key={f.p.id} className="grid gap-1.5 py-2.5 items-center text-right tabular-nums" style={{ ...columnas, borderTop: `1px solid ${C.linea}` }}>
                <b className="text-left text-[14.5px] leading-tight">{corto(f.p)}</b>
                <span>{num(f.propias)}</span><span>{num(f.otras)}</span><span>{num(f.bodega)}</span>
                <b className="text-[17px]">{num(f.falta)}</b>
              </div>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Pill tono="ambar">Borrador: no guarda el plan</Pill>
            {!kgBulto && <Pill tono="rojo">Falta el rendimiento de la Tela</Pill>}
            {!datos.conEquivalente && <Pill tono="ambar">Sin cargas de Distri</Pill>}
          </div>
        </>
      )}
    </div>
  )
}
