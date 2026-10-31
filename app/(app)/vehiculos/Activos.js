'use client'
import { useState, useEffect, useCallback, Fragment } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { valorActual, estadoVence } from '@/lib/vehiculos'
import InputDinero from '@/components/InputDinero'
import { C, $, Pill, Kpi, Kpis, Tarjeta, H2, Nota, Boton, campo, campoEstilo, Campo, Segmento, Tabla, td } from '../gastos/ui'
import { fechaLarga, BotonArchivo, SubirFotos } from './comunes'
import CampoFecha from '@/components/CampoFecha'

// Activos fijos de la empresa: congeladores, hidrolavadora, cargadores,
// equipos de planta, tecnología. Ubicación, responsable, serial, garantía,
// mantenimiento, factura y valor actual estimado (depreciación en línea recta
// como referencia de gestión; la contable la lleva el contador). Cada
// traslado, reparación o baja queda en su historial.
const CATEGORIAS = ['Refrigeración', 'Equipos de planta', 'Herramientas', 'Aseo', 'Tecnología', 'Muebles y enseres', 'Otro']
const ESTADO = { en_uso: ['En uso', 'verde'], reparacion: ['En reparación', 'ambar'], baja: ['Dado de baja', 'gris'] }
const TIPO_EVENTO = { mantenimiento: 'Mantenimiento', reparacion: 'Reparación', traslado: 'Traslado', baja: 'Baja', nota: 'Nota' }
const vacio = { nombre: '', categoria: 'Refrigeración', marca: '', serial: '', ubicacion: '', responsable: '', fecha_compra: '', valor_compra: '', vida_util_anios: '5', garantia_hasta: '', proximo_mantenimiento: '', notas: '', factura: [], foto: [] }

export default function Activos({ usuario, nuevoRef }) {
  const hoy = obtenerFechaActual()
  const [d, setD] = useState(null)
  const [sel, setSel] = useState(null)
  const [form, setForm] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [verBajas, setVerBajas] = useState(false)
  const cargar = useCallback(async () => {
    const id = getEmpresaId()
    const [{ data: activos }, { data: eventos }] = await Promise.all([
      supabase.from('activos').select('*').eq('empresa_id', id).order('categoria').order('nombre'),
      supabase.from('activos_eventos').select('*').eq('empresa_id', id).order('fecha', { ascending: false }).order('created_at', { ascending: false }),
    ])
    setD({ activos: activos || [], eventos: eventos || [] })
  }, [])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { if (nuevoRef) nuevoRef.current = () => { setForm({ ...vacio }); setSel(null) } }, [nuevoRef])
  if (!d) return <Nota>Cargando activos…</Nota>

  const vigentes = d.activos.filter(a => a.estado !== 'baja')
  const lista = d.activos.filter(a => (verBajas || a.estado !== 'baja') && (!busqueda || [a.nombre, a.serial, a.ubicacion, a.responsable, a.marca].filter(Boolean).join(' ').toLowerCase().includes(busqueda.toLowerCase())))
  const va = (a) => valorActual(a.valor_compra, a.fecha_compra, a.vida_util_anios, hoy)
  const activo = d.activos.find(a => a.id === sel)
  const mantProx = vigentes.filter(a => a.proximo_mantenimiento && estadoVence(a.proximo_mantenimiento, hoy, 15).tono !== 'verde')

  return (
    <div className="flex flex-col gap-4">
      <Kpis>
        <Kpi rotulo="Activos registrados" valor={vigentes.length} nota={`${vigentes.filter(a => a.estado === 'reparacion').length} en reparación`} />
        <Kpi rotulo="Valor de compra" valor={$(vigentes.reduce((s, a) => s + Number(a.valor_compra || 0), 0))} />
        <Kpi rotulo="Valor actual estimado" valor={$(vigentes.reduce((s, a) => s + (va(a) ?? 0), 0))} />
        <Kpi rotulo="Mantenimiento próximo" valor={mantProx.length} rojo={mantProx.length > 0} />
      </Kpis>
      {form && <FormActivo form={form} setForm={setForm} recargar={cargar} alGuardar={setSel} />}
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: activo ? 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))' : '1fr' }}>
        <Tarjeta className={activo ? 'columna-scroll' : ''}>
          <div className="flex justify-between gap-2 items-center flex-wrap">
            <H2>Activos fijos</H2>
            <span className="flex gap-3 items-center flex-wrap">
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre, serial o responsable" aria-label="Buscar" className={campo} style={{ ...campoEstilo, width: 240 }} />
              <label className="flex gap-2 items-center text-sm cursor-pointer"><input type="checkbox" checked={verBajas} onChange={e => setVerBajas(e.target.checked)} className="w-[18px] h-[18px]" style={{ accentColor: C.tinta }} />Incluir dados de baja</label>
            </span>
          </div>
          {lista.length === 0 ? <Nota>Sin activos registrados</Nota> : (
            <Tabla columnas={['Activo', { t: 'Ubicación', izq: true }, { t: 'Responsable', izq: true }, 'Valor actual', 'Estado']} min={640}>
              {[...new Set(lista.map(a => a.categoria))].map(c => (
                <Fragment key={c}>
                  <tr><td colSpan={5} className="text-[12px] font-extrabold uppercase tracking-wider" style={{ background: C.fondo, color: C.gris, padding: '6px 8px' }}>{c}</td></tr>
                  {lista.filter(a => a.categoria === c).map(a => (
                    <tr key={a.id} onClick={() => { setSel(a.id); setForm(null) }} className="cursor-pointer" style={{ background: sel === a.id ? C.fondo : undefined, opacity: a.estado === 'baja' ? 0.55 : 1 }}>
                      <td style={td(true)}><b>{a.nombre}</b><span className="block text-[12.5px]" style={{ color: C.gris }}>{[a.marca, a.serial && `Serial ${a.serial}`, a.fecha_compra && `Compra ${fechaLarga(a.fecha_compra)}`].filter(Boolean).join(' · ')}</span></td>
                      <td style={td(true)}>{a.ubicacion || '—'}</td>
                      <td style={td(true)}>{a.responsable || '—'}</td>
                      <td style={td()}>{va(a) != null ? $(va(a)) : '—'}</td>
                      <td style={td()}><Pill tono={ESTADO[a.estado][1]}>{ESTADO[a.estado][0]}</Pill></td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </Tabla>
          )}
        </Tarjeta>
        {activo && <FichaActivo a={activo} eventos={d.eventos.filter(e => e.activo_id === activo.id)} usuario={usuario} recargar={cargar} editar={() => setForm({ ...vacio, ...activo, valor_compra: activo.valor_compra ?? '', vida_util_anios: activo.vida_util_anios ?? '5', fecha_compra: activo.fecha_compra || '', garantia_hasta: activo.garantia_hasta || '', proximo_mantenimiento: activo.proximo_mantenimiento || '', factura: activo.factura_url ? [activo.factura_url] : [], foto: activo.foto_url ? [activo.foto_url] : [] })} cerrar={() => setSel(null)} valor={va(activo)} />}
      </div>
    </div>
  )
}

function FormActivo({ form, setForm, recargar, alGuardar }) {
  const [guardando, setGuardando] = useState(false)
  const guardar = async () => {
    if (!form.nombre.trim()) { alert('Escriba el nombre del activo.'); return }
    setGuardando(true)
    const datos = {
      nombre: form.nombre.trim(), categoria: form.categoria, marca: form.marca?.trim() || null, serial: form.serial?.trim() || null, ubicacion: form.ubicacion?.trim() || null, responsable: form.responsable?.trim() || null,
      fecha_compra: form.fecha_compra || null, valor_compra: Number(form.valor_compra) || null, vida_util_anios: Number(form.vida_util_anios) || null, garantia_hasta: form.garantia_hasta || null,
      proximo_mantenimiento: form.proximo_mantenimiento || null, notas: form.notas?.trim() || null, factura_url: form.factura?.[0] || null, foto_url: form.foto?.[0] || null,
    }
    const res = form.id ? await supabase.from('activos').update(datos).eq('id', form.id).select('id').single() : await supabase.from('activos').insert({ ...datos, empresa_id: getEmpresaId() }).select('id').single()
    setGuardando(false)
    if (res.error) { alert('No se pudo guardar: ' + res.error.message); return }
    setForm(null); alGuardar(res.data.id); recargar()
  }
  return (
    <Tarjeta>
      <div className="flex justify-between gap-2 items-center"><H2>{form.id ? `Editar ${form.nombre}` : 'Nuevo activo'}</H2><Boton onClick={() => setForm(null)}>Cancelar</Boton></div>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Campo etiqueta="Nombre"><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Congelador horizontal 300 L" className={campo} style={campoEstilo} /></Campo>
        <Campo etiqueta="Categoría"><select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} className={campo} style={campoEstilo}>{[...new Set([...CATEGORIAS, form.categoria])].map(c => <option key={c}>{c}</option>)}</select></Campo>
        <Campo etiqueta="Marca y referencia"><input value={form.marca || ''} onChange={e => setForm({ ...form, marca: e.target.value })} className={campo} style={campoEstilo} /></Campo>
        <Campo etiqueta="Serial"><input value={form.serial || ''} onChange={e => setForm({ ...form, serial: e.target.value })} className={campo} style={campoEstilo} /></Campo>
        {!form.id && <Campo etiqueta="Ubicación"><input value={form.ubicacion || ''} onChange={e => setForm({ ...form, ubicacion: e.target.value })} placeholder="Bodega, Punto de Venta 1, van LGU437" className={campo} style={campoEstilo} /></Campo>}
        {!form.id && <Campo etiqueta="Responsable"><input value={form.responsable || ''} onChange={e => setForm({ ...form, responsable: e.target.value })} className={campo} style={campoEstilo} /></Campo>}
        <Campo etiqueta="Fecha de compra"><CampoFecha value={form.fecha_compra || ''} onChange={e => setForm({ ...form, fecha_compra: e.target.value })} className={campo} style={campoEstilo} /></Campo>
        <Campo etiqueta="Valor de compra"><InputDinero value={form.valor_compra} onChange={e => setForm({ ...form, valor_compra: e.target.value })} placeholder="$" className={campo} style={campoEstilo} /></Campo>
        <Campo etiqueta="Vida útil (años)"><input inputMode="numeric" value={form.vida_util_anios} onChange={e => setForm({ ...form, vida_util_anios: e.target.value.replace(/\D/g, '') })} className={campo} style={campoEstilo} /></Campo>
        <Campo etiqueta="Garantía hasta"><CampoFecha value={form.garantia_hasta || ''} onChange={e => setForm({ ...form, garantia_hasta: e.target.value })} className={campo} style={campoEstilo} /></Campo>
        <Campo etiqueta="Próximo mantenimiento"><CampoFecha value={form.proximo_mantenimiento || ''} onChange={e => setForm({ ...form, proximo_mantenimiento: e.target.value })} className={campo} style={campoEstilo} /></Campo>
      </div>
      <Campo etiqueta="Notas"><input value={form.notas || ''} onChange={e => setForm({ ...form, notas: e.target.value })} placeholder="Limpieza y descongelado cada 3 meses" className={campo} style={campoEstilo} /></Campo>
      <div className="flex gap-2 flex-wrap items-center justify-between">
        <span className="flex gap-2 flex-wrap"><SubirFotos valor={form.factura} onCambio={x => setForm({ ...form, factura: x })} carpeta="activos" texto="Adjuntar factura" multiple={false} /><SubirFotos valor={form.foto} onCambio={x => setForm({ ...form, foto: x })} carpeta="activos" texto="Foto del activo" multiple={false} /></span>
        <Boton tono="rojo" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar activo'}</Boton>
      </div>
    </Tarjeta>
  )
}

function FichaActivo({ a, eventos, usuario, recargar, editar, cerrar, valor }) {
  const hoy = obtenerFechaActual()
  const [ev, setEv] = useState(null)
  const guardarEvento = async () => {
    if (ev.tipo === 'traslado' && !ev.hacia.trim() && !ev.responsable.trim()) { alert('Escriba la nueva ubicación o el nuevo responsable.'); return }
    if (ev.tipo === 'baja' && !ev.detalle.trim()) { alert('Escriba el motivo de la baja.'); return }
    if (!['traslado', 'baja'].includes(ev.tipo) && !ev.detalle.trim()) { alert('Escriba el detalle.'); return }
    const empresaId = getEmpresaId()
    const desde = ev.tipo === 'traslado' ? [a.ubicacion, a.responsable].filter(Boolean).join(' · ') : null
    const hacia = ev.tipo === 'traslado' ? [ev.hacia || a.ubicacion, ev.responsable || a.responsable].filter(Boolean).join(' · ') : null
    const { error } = await supabase.from('activos_eventos').insert({ empresa_id: empresaId, activo_id: a.id, tipo: ev.tipo, fecha: ev.fecha, detalle: ev.detalle?.trim() || null, costo: Number(ev.costo) || null, desde, hacia, archivo_url: ev.archivo?.[0] || null, registrado_por: usuario.nombre })
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    const cambios = ev.tipo === 'traslado' ? { ubicacion: ev.hacia?.trim() || a.ubicacion, responsable: ev.responsable?.trim() || a.responsable }
      : ev.tipo === 'baja' ? { estado: 'baja', baja_motivo: ev.detalle.trim() }
      : ev.tipo === 'reparacion' ? { estado: ev.terminada ? 'en_uso' : 'reparacion' }
      : ev.tipo === 'mantenimiento' && ev.proximo ? { proximo_mantenimiento: ev.proximo } : null
    if (cambios) await supabase.from('activos').update(cambios).eq('id', a.id)
    setEv(null); recargar()
  }
  const Dato = ({ r, children }) => <div className="flex justify-between gap-3 py-[7px] text-sm" style={{ borderBottom: `1px solid ${C.linea}` }}><span style={{ color: C.gris }}>{r}</span><b className="text-right">{children}</b></div>
  const g = a.garantia_hasta ? estadoVence(a.garantia_hasta, hoy, 30) : null
  const m = a.proximo_mantenimiento ? estadoVence(a.proximo_mantenimiento, hoy, 15) : null
  return (
    <Tarjeta className="columna-scroll">
      <div className="flex justify-between gap-2 items-start">
        <span className="min-w-0"><span className="text-[13px]" style={{ color: C.gris }}>{a.categoria}</span><H2>{a.nombre}</H2></span>
        <button type="button" onClick={cerrar} className="text-[13px] font-bold shrink-0" style={{ color: C.gris }}>Cerrar</button>
      </div>
      <div className="flex gap-1.5 flex-wrap"><Pill tono={ESTADO[a.estado][1]}>{ESTADO[a.estado][0]}</Pill>{a.serial && <Pill>Serial {a.serial}</Pill>}</div>
      <div>
        <Dato r="Ubicación">{a.ubicacion || '—'}</Dato>
        <Dato r="Responsable">{a.responsable || '—'}</Dato>
        <Dato r="Marca y referencia">{a.marca || '—'}</Dato>
        <Dato r="Fecha de compra">{fechaLarga(a.fecha_compra)}</Dato>
        <Dato r="Valor de compra">{a.valor_compra ? $(a.valor_compra) : '—'}</Dato>
        <Dato r="Valor actual estimado">{valor != null ? `${$(valor)} · vida útil ${a.vida_util_anios} años` : '—'}</Dato>
        <Dato r="Garantía">{g ? <span style={{ color: g.tono === 'verde' ? C.verde : g.tono === 'rojo' ? C.gris : C.ambar }}>{g.tono === 'rojo' ? `Venció el ${fechaLarga(a.garantia_hasta)}` : `Hasta ${fechaLarga(a.garantia_hasta)}`}</span> : '—'}</Dato>
        <Dato r="Próximo mantenimiento">{m ? <span style={{ color: m.tono === 'verde' ? C.tinta : m.tono === 'rojo' ? C.rojo : C.ambar }}>{fechaLarga(a.proximo_mantenimiento)}</span> : '—'}</Dato>
        {a.notas && <Dato r="Notas">{a.notas}</Dato>}
        {a.estado === 'baja' && <Dato r="Motivo de la baja">{a.baja_motivo}</Dato>}
      </div>
      <span className="flex gap-3 flex-wrap"><BotonArchivo ruta={a.factura_url} texto="Ver factura" /><BotonArchivo ruta={a.foto_url} texto="Ver foto" /></span>
      {a.estado !== 'baja' && !ev && (
        <div className="flex gap-2 flex-wrap">
          <Boton tono="rojo" onClick={editar}>Editar</Boton>
          {[['mantenimiento', '+ Mantenimiento'], ['reparacion', a.estado === 'reparacion' ? 'Registrar reparación' : 'Enviar a reparación'], ['traslado', 'Trasladar'], ['baja', 'Dar de baja']].map(([t, n]) => (
            <Boton key={t} onClick={() => setEv({ tipo: t, fecha: hoy, detalle: '', costo: '', hacia: '', responsable: '', proximo: '', terminada: a.estado === 'reparacion', archivo: [] })}>{n}</Boton>
          ))}
        </div>
      )}
      {ev && (
        <div className="rounded-[14px] p-3 flex flex-col gap-2.5" style={{ background: C.fondo }}>
          <b>{TIPO_EVENTO[ev.tipo]}</b>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <Campo etiqueta="Fecha"><CampoFecha value={ev.fecha} onChange={e => setEv({ ...ev, fecha: e.target.value })} className={campo} style={campoEstilo} /></Campo>
            {ev.tipo === 'traslado' ? (<>
              <Campo etiqueta="Nueva ubicación"><input value={ev.hacia} onChange={e => setEv({ ...ev, hacia: e.target.value })} placeholder={a.ubicacion || ''} className={campo} style={campoEstilo} /></Campo>
              <Campo etiqueta="Nuevo responsable"><input value={ev.responsable} onChange={e => setEv({ ...ev, responsable: e.target.value })} placeholder={a.responsable || ''} className={campo} style={campoEstilo} /></Campo>
            </>) : ev.tipo !== 'baja' && <Campo etiqueta="Costo"><InputDinero value={ev.costo} onChange={e => setEv({ ...ev, costo: e.target.value })} placeholder="$" className={campo} style={campoEstilo} /></Campo>}
            {ev.tipo === 'mantenimiento' && <Campo etiqueta="Próximo mantenimiento"><CampoFecha value={ev.proximo} onChange={e => setEv({ ...ev, proximo: e.target.value })} className={campo} style={campoEstilo} /></Campo>}
          </div>
          <Campo etiqueta={ev.tipo === 'baja' ? 'Motivo de la baja' : ev.tipo === 'traslado' ? 'Nota (opcional)' : 'Qué se hizo'}><input value={ev.detalle} onChange={e => setEv({ ...ev, detalle: e.target.value })} className={campo} style={campoEstilo} /></Campo>
          {ev.tipo === 'reparacion' && a.estado === 'reparacion' && <Segmento etiqueta="Estado" opciones={[[true, 'Volvió a funcionar'], [false, 'Sigue en reparación']]} valor={ev.terminada} onCambio={x => setEv({ ...ev, terminada: x })} />}
          <div className="flex gap-2 flex-wrap items-center justify-between"><SubirFotos valor={ev.archivo} onCambio={x => setEv({ ...ev, archivo: x })} carpeta="activos" texto="Adjuntar factura o foto" multiple={false} /><span className="flex gap-2"><Boton tono="blanco" onClick={() => setEv(null)}>Cancelar</Boton><Boton tono="tinta" onClick={guardarEvento}>Guardar</Boton></span></div>
        </div>
      )}
      <div>
        <h3 className="text-[15px] font-extrabold mb-1">Historial</h3>
        {eventos.length === 0 ? <Nota>Sin movimientos registrados.</Nota> : eventos.map(e => (
          <div key={e.id} className="grid gap-2 py-1.5" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', borderBottom: `1px solid ${C.linea}` }}>
            <span className="min-w-0"><b>{TIPO_EVENTO[e.tipo]}</b><span className="block text-[13px]" style={{ color: C.gris }}>{fechaLarga(e.fecha)}{e.tipo === 'traslado' ? ` · de ${e.desde || '—'} a ${e.hacia}` : ''}{e.detalle ? ` · ${e.detalle}` : ''} · {e.registrado_por}</span><BotonArchivo ruta={e.archivo_url} texto="Ver soporte" /></span>
            {e.costo ? <b className="tabular-nums">{$(e.costo)}</b> : <span />}
          </div>
        ))}
      </div>
    </Tarjeta>
  )
}
