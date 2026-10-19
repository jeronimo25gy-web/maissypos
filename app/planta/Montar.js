'use client'
import { useState } from 'react'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { nuevoId, ahora, estandar, fmtNum } from '@/lib/planta'
import { C, titulo, Boton, Opcion, Campo, Etiqueta, Tarjeta } from './ui'

const POSICIONES = ['abajo', 'medio', 'arriba']
const nombrePos = { abajo: 'Abajo', medio: 'Medio', arriba: 'Arriba' }

// Montar un lote de cocción: tanque, maíz, bultos, agua, conservante y bolsas
// testigo. Al empezar se guarda la hora y sale el maíz del inventario.
export default function Montar({ estado, usuario, onRegistrar, onCancelar }) {
  const tanques = estado.tanques || []
  const [tanqueId, setTanqueId] = useState(tanques[0]?.id || '')
  const tanque = tanques.find(t => t.id === tanqueId)
  // Bultos como texto para poder escribir decimales ("1,3"); con báscula, en kilos.
  const [bultosTxt, setBultosTxt] = useState(tanques[0] ? String(Number(tanques[0].capacidad_bultos)) : '1')
  const [kilos, setKilos] = useState('')
  const pesoBulto = Number(estandar(estado, 'peso_bulto_kg')?.valor) || 50
  const leer = (v) => Number(String(v ?? '').replace(',', '.'))
  const bultos = leer(kilos) > 0 ? Math.round(leer(kilos) / pesoBulto * 100) / 100 : leer(bultosTxt)
  const setBultos = (fn) => { setKilos(''); setBultosTxt(b => { const n = typeof fn === 'function' ? fn(leer(b) || 0) : fn; return String(Math.round(n * 100) / 100).replace('.', ',') }) }
  const maices = estado.maices?.length ? estado.maices : (estado.maiz ? [estado.maiz] : [])
  const maizDe = (t) => maices.find(m => m.id === t?.materia_prima_id) || maices[0] || null
  const [maizId, setMaizId] = useState(maizDe(tanques[0])?.id || '')
  const maiz = maices.find(m => m.id === maizId) || null
  const comprasDe = (m) => (estado.compras || []).filter(c => !c.sku || c.sku === m?.sku)
  const [compraId, setCompraId] = useState(comprasDe(maizDe(tanques[0]))[0]?.id || '')
  const [agua, setAgua] = useState('')
  // Conservante: gramos por bulto (dato de planta) × bultos, salvo que lo cambien a mano.
  const porBulto = Number(estandar(estado, 'conservante_g_bulto')?.valor) || null
  const [conservanteManual, setConservante] = useState(null)
  const conservante = conservanteManual ?? (porBulto && bultos > 0 ? String(Math.round(porBulto * bultos)) : '')
  const [testigos, setTestigos] = useState(POSICIONES)
  const [error, setError] = useState('')

  const escogerTanque = (t) => {
    setTanqueId(t.id)
    setBultos(Number(t.capacidad_bultos))
    escogerMaiz(maizDe(t))
  }

  function escogerMaiz(m) {
    if (!m) return
    setMaizId(m.id)
    setCompraId(comprasDe(m)[0]?.id || '')
  }

  const empezar = () => {
    if (!maiz) { setError('No hay materia prima de maíz marcada para descontar por lote.'); return }
    if (!tanque) { setError('Escoge el tanque.'); return }
    if (!(bultos > 0)) { setError('¿Cuántos bultos se pusieron? Se puede con decimales, por ejemplo 1,3.'); return }
    const empresaId = getEmpresaId()
    const fecha = obtenerFechaActual()
    const id = nuevoId()
    const num = (v) => v === '' || v == null ? null : Number(String(v).replace(',', '.'))
    onRegistrar([
      { op: 'insert', tabla: 'produccion_cochadas', datos: {
        id, empresa_id: empresaId, fecha, materia_prima_id: maiz.id, cantidad: bultos,
        registrado_por: usuario.nombre, estado: 'abierto', tanque_id: tanque.id, compra_maiz_id: compraId || null,
        hora_montada: ahora(), agua_l: num(agua), conservante_g: num(conservante), maiz_kg: leer(kilos) > 0 ? leer(kilos) : null,
        testigos: testigos.length ? testigos.map(pos => ({ pos, kg: null })) : null, anulada: false,
      } },
      { op: 'insert', tabla: 'inventario_mov', datos: {
        id: nuevoId(), empresa_id: empresaId, sku: maiz.sku, cantidad: bultos, fecha, tipo_movimiento: 'salida',
        referencia: `Cochada: ${maiz.nombre} puesto en produccion · ${tanque.nombre}`,
      } },
    ], id)
  }

  return (
    <Tarjeta>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-2xl font-extrabold" style={titulo}>Montar lote de cocción</h2>
        <Boton onClick={onCancelar}>Cancelar</Boton>
      </div>

      <Etiqueta>Tanque</Etiqueta>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        {tanques.map(t => (
          <Opcion key={t.id} sel={t.id === tanqueId} onClick={() => escogerTanque(t)}>
            <b className="text-lg" style={titulo}>{t.nombre}</b>
            <span className="text-[13px]" style={{ color: C.gris }}>{t.con_presion ? 'Con presión' : 'Tapa suelta'}</span>
          </Opcion>
        ))}
      </div>

      {maices.length > 1 && (
        <>
          <Etiqueta>Maíz</Etiqueta>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            {maices.map(m => <Opcion key={m.id} sel={m.id === maizId} onClick={() => escogerMaiz(m)}><b className="text-lg" style={titulo}>{m.nombre}</b></Opcion>)}
          </div>
        </>
      )}

      <Etiqueta extra="De las compras de maíz">Lote de maíz</Etiqueta>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {comprasDe(maiz).slice(0, 4).map(c => (
          <Opcion key={c.id} sel={c.id === compraId} onClick={() => setCompraId(c.id)}>
            <b style={titulo}>{c.proveedores?.nombre || 'Compra'} · {new Date(c.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}</b>
            <span className="text-[13px]" style={{ color: C.gris }}>{fmtNum(c.cantidad, 0)} bultos · 50 kg según el bulto, sin pesar</span>
          </Opcion>
        ))}
        <Opcion sel={!compraId} onClick={() => setCompraId('')}>
          <b style={titulo}>No sé / otro</b>
          <span className="text-[13px]" style={{ color: C.gris }}>Queda sin lote de maíz</span>
        </Opcion>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
        <div className="flex flex-col gap-2">
          <Etiqueta>Bultos puestos</Etiqueta>
          <div className="flex items-center gap-2">
            <Boton className="!px-0 w-16 text-2xl" grande onClick={() => setBultos(b => Math.max(0.5, b - 0.5))} aria-label="Medio bulto menos">−</Boton>
            <Campo value={leer(kilos) > 0 ? String(bultos).replace('.', ',') : bultosTxt} onChange={e => { setKilos(''); setBultosTxt(e.target.value) }} className="text-center" aria-label="Bultos" />
            <Boton className="!px-0 w-16 text-2xl" grande onClick={() => setBultos(b => b + 0.5)} aria-label="Medio bulto más">+</Boton>
          </div>
          <Campo unidad="kg" placeholder="O los kilos, si se pesó" value={kilos} onChange={e => setKilos(e.target.value)} className="!h-12 !text-lg" aria-label="Kilos de maíz" />
          {leer(kilos) > 0 && <span className="text-[13px]" style={{ color: C.gris }}>{kilos} kg ÷ {pesoBulto} kg{estandar(estado, 'peso_bulto_kg') ? '' : ' del bulto'} = {String(bultos).replace('.', ',')} bultos</span>}
        </div>
        <div className="flex flex-col gap-2">
          <Etiqueta extra="Por medir">Agua</Etiqueta>
          <Campo unidad="litros" placeholder="0" value={agua} onChange={e => setAgua(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Etiqueta extra={porBulto ? `${porBulto} g por bulto` : 'Dosis por definir'}>Conservante</Etiqueta>
          <Campo unidad="gramos" placeholder="0" value={conservante} onChange={e => setConservante(e.target.value)} />
        </div>
      </div>

      <Etiqueta extra="2 semanas de medición: las 3 · después: 1 en el medio">Bolsas testigo de 1 kg dentro del tanque</Etiqueta>
      <div className="flex gap-2 flex-wrap">
        {POSICIONES.map(p => {
          const sel = testigos.includes(p)
          return <button key={p} type="button" onClick={() => setTestigos(sel ? testigos.filter(x => x !== p) : POSICIONES.filter(x => x === p || testigos.includes(x)))}
            className="rounded-full min-h-[50px] px-5 font-bold"
            style={sel ? { background: '#fff', boxShadow: `inset 0 0 0 2.5px ${C.tinta}` } : { background: C.suave }}>{sel ? '✓ ' : ''}{nombrePos[p]}</button>
        })}
      </div>

      <p className="text-[13px]" style={{ color: C.gris }}>La hora de montada se guarda sola al tocar “Empezar cocción”. El maíz sale del inventario en ese momento.</p>
      {error && <p className="text-sm font-bold" style={{ color: C.rojo }}>{error}</p>}
      <div className="flex justify-end"><Boton tipo="rojo" grande onClick={empezar} className="min-w-[240px]">Empezar cocción</Boton></div>
    </Tarjeta>
  )
}
