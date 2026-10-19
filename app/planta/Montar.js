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
  const [bultos, setBultos] = useState(tanques[0] ? Number(tanques[0].capacidad_bultos) : 1)
  const [compraId, setCompraId] = useState(estado.compras?.[0]?.id || '')
  const [agua, setAgua] = useState('')
  const dosis = (t) => estandar(estado, 'conservante_g', { tanqueId: t?.id })?.valor
  const [conservante, setConservante] = useState(dosis(tanques[0]) ?? '')
  const [testigos, setTestigos] = useState(POSICIONES)
  const [error, setError] = useState('')

  const escogerTanque = (t) => {
    setTanqueId(t.id)
    setBultos(Number(t.capacidad_bultos))
    const d = dosis(t)
    if (d != null) setConservante(d)
  }

  const empezar = () => {
    if (!estado.maiz) { setError('No hay materia prima de maíz marcada para descontar por lote.'); return }
    if (!tanque) { setError('Escoge el tanque.'); return }
    if (!(bultos > 0)) { setError('¿Cuántos bultos se pusieron?'); return }
    const empresaId = getEmpresaId()
    const fecha = obtenerFechaActual()
    const id = nuevoId()
    const num = (v) => v === '' || v == null ? null : Number(String(v).replace(',', '.'))
    onRegistrar([
      { op: 'insert', tabla: 'produccion_cochadas', datos: {
        id, empresa_id: empresaId, fecha, materia_prima_id: estado.maiz.id, cantidad: bultos,
        registrado_por: usuario.nombre, estado: 'abierto', tanque_id: tanque.id, compra_maiz_id: compraId || null,
        hora_montada: ahora(), agua_l: num(agua), conservante_g: num(conservante),
        testigos: testigos.length ? testigos.map(pos => ({ pos, kg: null })) : null, anulada: false,
      } },
      { op: 'insert', tabla: 'inventario_mov', datos: {
        id: nuevoId(), empresa_id: empresaId, sku: estado.maiz.sku, cantidad: bultos, fecha, tipo_movimiento: 'salida',
        referencia: `Cochada: ${estado.maiz.nombre} puesto en produccion · ${tanque.nombre}`,
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

      <Etiqueta extra="De las compras de maíz">Lote de maíz</Etiqueta>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {(estado.compras || []).slice(0, 4).map(c => (
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
            <Campo value={bultos} onChange={e => setBultos(Number(e.target.value.replace(',', '.')) || 0)} className="text-center" aria-label="Bultos" />
            <Boton className="!px-0 w-16 text-2xl" grande onClick={() => setBultos(b => b + 0.5)} aria-label="Medio bulto más">+</Boton>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Etiqueta extra="Por medir">Agua</Etiqueta>
          <Campo unidad="litros" placeholder="0" value={agua} onChange={e => setAgua(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Etiqueta extra={dosis(tanque) != null ? 'Dosis del tanque' : 'Dosis por definir'}>Conservante</Etiqueta>
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
