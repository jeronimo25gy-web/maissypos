'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { subirSoporte, leerDocumentoConductor } from '@/lib/soportes'
import { estadoVence } from '@/lib/vehiculos'
import { C, Pill, Kpi, Kpis, Tarjeta, H2, Nota, Boton, campo, campoEstilo, Campo, Tabla, td } from '../gastos/ui'
import { fechaLarga, VerFotos } from './comunes'
import CampoFecha from '@/components/CampoFecha'

// Conductores: licencia de conducción (frente y reverso) y carné de
// manipulación de alimentos, con categoría y vencimiento. El sistema lee la
// fecha desde la foto y avisa a los 60 y 30 días; en Mi ruta se le muestra al
// mismo conductor. La de servicio público (C1, C2, C3) vence más rápido.
const TIPOS = { licencia: 'Licencia de conducción', cma: 'Carné de manipulación de alimentos' }

export default function Conductores({ flota, recargar }) {
  const hoy = obtenerFechaActual()
  const [form, setForm] = useState(null)
  const vehiculoDe = (vid) => flota.vehiculos.find(v => v.conductor_id === vid)
  // Primero los que tienen vehículo asignado.
  const conductores = flota.vendedores.filter(v => v.estado).sort((a, b) => Number(!!flota.vehiculos.find(x => x.conductor_id === b.id)) - Number(!!flota.vehiculos.find(x => x.conductor_id === a.id)))
  const doc = (vid, tipo) => flota.docsCond.find(d => d.vendedor_id === vid && d.tipo === tipo)
  const estados = conductores.filter(c => vehiculoDe(c.id)).flatMap(c => ['licencia', 'cma'].map(t => { const d = doc(c.id, t); return d?.vence ? estadoVence(d.vence, hoy, 60).tono : 'gris' }))

  return (
    <div className="flex flex-col gap-4">
      <Kpis>
        <Kpi rotulo="Conductores" valor={conductores.length} nota={`${conductores.filter(c => vehiculoDe(c.id)).length} con vehículo asignado`} />
        <Kpi rotulo="Vencidos" valor={estados.filter(t => t === 'rojo').length} rojo={estados.includes('rojo')} />
        <Kpi rotulo="Por vencer" valor={estados.filter(t => t === 'ambar').length} rojo={estados.includes('ambar')} />
        <Kpi rotulo="Sin registrar" valor={estados.filter(t => t === 'gris').length} rojo={estados.includes('gris')} />
      </Kpis>
      {form && <FormDocumento form={form} setForm={setForm} recargar={recargar} />}
      <Tarjeta>
        <H2>Licencias y carnés</H2>
        <Tabla columnas={['Conductor', { t: 'Licencia', izq: true }, { t: 'Carné de manipulación', izq: true }]} min={620}>
          {conductores.map(c => (
            <tr key={c.id}>
              <td style={td(true)}><b>{c.nombre}</b><span className="block text-[12.5px]" style={{ color: C.gris }}>{vehiculoDe(c.id)?.placa || 'Sin vehículo asignado'}</span></td>
              {['licencia', 'cma'].map(t => {
                const d = doc(c.id, t), e = d?.vence ? estadoVence(d.vence, hoy, 60) : null
                return (
                  <td key={t} style={td(true)}>
                    {d ? (
                      <span className="flex flex-col gap-1 items-start">
                        <Pill tono={e?.tono || 'gris'}>{e ? (e.tono === 'verde' ? `Vence ${fechaLarga(d.vence)}` : e.texto) : 'Sin fecha'}</Pill>
                        <span className="text-[12.5px]" style={{ color: C.gris }}>{[d.categoria && `Categoría ${d.categoria}`, d.numero && `N.º ${d.numero}`].filter(Boolean).join(' · ')}</span>
                        <span className="flex gap-3"><VerFotos fotos={d.fotos} /><button type="button" onClick={() => setForm({ ...d, nombre: c.nombre, nuevas: [] })} className="text-[13px] font-bold">Actualizar</button></span>
                      </span>
                    ) : <Boton tono="blanco" onClick={() => setForm({ vendedor_id: c.id, nombre: c.nombre, tipo: t, categoria: '', numero: '', vence: '', fotos: [], nuevas: [] })}>Registrar</Boton>}
                  </td>
                )
              })}
            </tr>
          ))}
        </Tabla>
      </Tarjeta>
    </div>
  )
}

function FormDocumento({ form, setForm, recargar }) {
  const [leyendo, setLeyendo] = useState(false)
  const [lectura, setLectura] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const leer = async () => {
    if (!form.nuevas.length) { alert(form.tipo === 'licencia' ? 'Seleccione las fotos del frente y del reverso.' : 'Seleccione la foto del carné.'); return }
    setLeyendo(true)
    try {
      const l = await leerDocumentoConductor(form.nuevas, form.tipo)
      setLectura(l)
      setForm(f => ({ ...f, categoria: l.categoria || f.categoria, numero: l.numero || f.numero, vence: l.vence || f.vence }))
    } catch (e) { alert(e.message + '. Escriba los datos a mano.') }
    setLeyendo(false)
  }
  const guardar = async () => {
    if (!form.vence) { alert('Escriba la fecha de vencimiento.'); return }
    setGuardando(true)
    try {
      const subidas = []
      for (const f of form.nuevas) subidas.push(await subirSoporte(f, 'conductores'))
      const datos = { empresa_id: getEmpresaId(), vendedor_id: form.vendedor_id, tipo: form.tipo, categoria: form.categoria?.trim().toUpperCase() || null, numero: form.numero?.trim() || null, vence: form.vence, fotos: subidas.length ? subidas : form.fotos || [] }
      const { error } = await supabase.from('conductores_documentos').upsert(datos, { onConflict: 'vendedor_id,tipo' })
      if (error) throw new Error(error.message)
      setForm(null); recargar()
    } catch (e) { alert('No se pudo guardar: ' + e.message) }
    setGuardando(false)
  }
  return (
    <Tarjeta>
      <div className="flex justify-between gap-2 items-center"><H2>{TIPOS[form.tipo]} · {form.nombre}</H2><Boton onClick={() => setForm(null)}>Cancelar</Boton></div>
      <div className="flex gap-2 flex-wrap items-center">
        <label className="rounded-xl min-h-[42px] px-4 text-sm font-bold flex items-center cursor-pointer" style={form.nuevas.length ? { background: C.verdeF, color: C.verde } : { background: C.suave }}>
          {form.nuevas.length ? `${form.nuevas.length} ${form.nuevas.length === 1 ? 'foto' : 'fotos'} seleccionadas` : form.tipo === 'licencia' ? 'Fotos del frente y del reverso' : 'Foto del carné'}
          <input type="file" accept="image/*" multiple={form.tipo === 'licencia'} className="hidden" onChange={e => { setForm({ ...form, nuevas: [...(e.target.files || [])].slice(0, 2) }); setLectura(null); e.target.value = '' }} />
        </label>
        <Boton tono="tinta" onClick={leer} disabled={leyendo || !form.nuevas.length}>{leyendo ? 'Leyendo…' : 'Leer datos de la foto'}</Boton>
      </div>
      {lectura && (
        <div className="rounded-[14px] p-3 text-sm" style={{ background: C.fondo }}>
          Leído: <b>{lectura.nombre || 'sin nombre'}</b>{lectura.categoria ? ` · categoría ${lectura.categoria}` : ''}{lectura.vence ? ` · vence ${fechaLarga(lectura.vence)}` : ''}{lectura.servicio === 'publico' ? ' · servicio público' : lectura.servicio === 'particular' ? ' · servicio particular' : ''}.
          {lectura.nombre && form.nombre && !lectura.nombre.toLowerCase().includes(form.nombre.split(' ')[0].toLowerCase()) && <span style={{ color: C.rojo }}> El nombre no coincide con {form.nombre}; revise que sea el documento correcto.</span>}
          {lectura.observacion && <span style={{ color: C.ambar }}> {lectura.observacion}</span>}
          <span className="block mt-1" style={{ color: C.gris }}>Revise los datos antes de guardar.</span>
        </div>
      )}
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        {form.tipo === 'licencia' && <Campo etiqueta="Categoría"><input value={form.categoria || ''} onChange={e => setForm({ ...form, categoria: e.target.value })} placeholder="B1, C1" className={campo} style={campoEstilo} /></Campo>}
        <Campo etiqueta="Número"><input value={form.numero || ''} onChange={e => setForm({ ...form, numero: e.target.value })} className={campo} style={campoEstilo} /></Campo>
        <Campo etiqueta="Vence"><CampoFecha value={form.vence || ''} onChange={e => setForm({ ...form, vence: e.target.value })} className={campo} style={campoEstilo} /></Campo>
      </div>
      <div className="flex justify-end"><Boton tono="rojo" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton></div>
    </Tarjeta>
  )
}
