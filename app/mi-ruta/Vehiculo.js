'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { obtenerFechaActual } from '@/lib/supabase-helpers'
import { subirSoporte } from '@/lib/soportes'
import { anotarEnCurso } from '@/lib/borrador-ruta'
import { CHECKLIST } from '@/lib/vehiculos'
import InputDinero from '@/components/InputDinero'

// Mi ruta: preoperacional del vehículo antes de salir (reemplaza el FR-SST-001
// en papel) y registro de tanqueos. Todo viene "Bien" y el conductor solo marca
// lo que tiene novedad, con detalle y foto. Frenos, llantas y luces con
// novedad le avisan al admin de inmediato.
const TINTA = '#1C1B19', GRIS = '#5A5750', FONDO = '#F3F1EA', LINEA = '#E3E1D8', SUAVE = '#EFEDE6', ROJO = '#C41230'
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const input = 'w-full min-h-[48px] rounded-xl border-2 px-3 text-[16px] bg-white outline-none'
const miles = (n) => Math.round(Number(n || 0)).toLocaleString('es-CO')

function Encabezado({ texto, sub, onVolver }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={onVolver} className="w-11 h-11 rounded-xl bg-white flex items-center justify-center shrink-0" aria-label="Volver">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={TINTA} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
      </button>
      <div className="min-w-0"><p className="font-extrabold text-[22px] leading-tight" style={titulo}>{texto}</p>{sub && <p className="text-[13px]" style={{ color: GRIS }}>{sub}</p>}</div>
    </div>
  )
}

export function Preoperacional({ vehiculo, vendedor, usuario, ultimoKm, documentos, onListo, onVolver }) {
  const items = CHECKLIST[vehiculo.clase] || CHECKLIST.carro
  const [km, setKm] = useState('')
  const [estado, setEstado] = useState({}) // clave -> { detalle, fotos[] } si tiene novedad
  const [subiendo, setSubiendo] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const kmNum = Number(km) || 0
  const avisoKm = kmNum && ultimoKm && kmNum < ultimoKm ? `Es menor que el último registrado (${miles(ultimoKm)} km). Revíselo.` : kmNum && ultimoKm && kmNum - ultimoKm > 1500 ? `Son ${miles(kmNum - ultimoKm)} km más que el último registro. Revíselo.` : null

  const foto = async (k, file) => {
    if (!file) return
    setSubiendo(k)
    try { const ruta = await subirSoporte(file, 'vehiculos'); setEstado(e => ({ ...e, [k]: { ...e[k], fotos: [...(e[k]?.fotos || []), ruta] } })) }
    catch (e) { alert('No se pudo subir la foto: ' + e.message) }
    setSubiendo(null)
  }
  const guardar = async () => {
    if (!kmNum) { alert('Escriba el kilometraje del tablero.'); return }
    if (kmNum < (ultimoKm || 0) && !confirm(`El kilometraje es menor que el último registrado (${miles(ultimoKm)} km). ¿Guardar así?`)) return
    const sinDetalle = Object.entries(estado).find(([, v]) => !v.detalle?.trim())
    if (sinDetalle) { alert('Escriba qué pasa en cada novedad.'); return }
    setGuardando(true)
    try {
      const empresaId = getEmpresaId(), fecha = obtenerFechaActual()
      const { data: p, error } = await supabase.from('vehiculos_preoperacional').insert({
        empresa_id: empresaId, vehiculo_id: vehiculo.id, fecha, vendedor_id: vendedor.id, conductor: usuario.nombre, km: kmNum,
        items: Object.fromEntries(items.map(([k]) => [k, estado[k] ? 'novedad' : 'bien'])), novedades: Object.keys(estado).length,
      }).select().single()
      if (error) throw new Error(error.code === '23505' ? 'El preoperacional de hoy ya está registrado para este vehículo.' : error.message)
      const novs = Object.entries(estado).map(([k, v]) => ({
        empresa_id: empresaId, vehiculo_id: vehiculo.id, preoperacional_id: p.id, fecha, item: k, detalle: v.detalle.trim(), fotos: v.fotos || [],
        critica: !!items.find(x => x[0] === k)?.[2], reportada_por: usuario.nombre,
      }))
      if (novs.length) {
        await supabase.from('vehiculos_novedades').insert(novs)
        const criticas = novs.filter(n => n.critica)
        await supabase.from('alertas_admin').insert({
          empresa_id: empresaId, tipo: criticas.length ? 'vehiculo_critico' : 'vehiculo_novedad', referencia_tipo: 'vehiculo', referencia_id: vehiculo.id,
          mensaje: `${vehiculo.placa}: ${novs.map(n => `${items.find(x => x[0] === n.item)?.[1]} (${n.detalle})`).join(' · ')}. Reportado por ${usuario.nombre} en el preoperacional.`,
        })
      }
      onListo()
    } catch (e) { alert('No se pudo guardar: ' + e.message) }
    setGuardando(false)
  }
  const criticas = Object.keys(estado).filter(k => items.find(x => x[0] === k)?.[2])

  return (
    <div className="max-w-md mx-auto px-4 pt-4 flex flex-col gap-3">
      <Encabezado texto="Antes de salir" sub={`${vehiculo.placa} · ${[vehiculo.marca, vehiculo.modelo].filter(Boolean).join(' ')}`} onVolver={onVolver} />
      {documentos.filter(d => d.tono !== 'verde').map((d, i) => (
        <div key={i} className="rounded-2xl p-3.5 text-sm" style={{ background: d.tono === 'rojo' ? '#FBE9E9' : '#FFF4CC', color: d.tono === 'rojo' ? ROJO : '#8A5A00' }}><b style={{ color: TINTA }}>{d.nombre}:</b> {d.texto}. {d.tono === 'rojo' ? 'Avísele al administrador hoy.' : 'Renuévela a tiempo.'}</div>
      ))}
      <div className="bg-white rounded-2xl p-4 flex flex-col gap-2">
        <label className="text-[14px] font-bold" htmlFor="km">Kilometraje del tablero</label>
        <InputDinero entero id="km" value={km} onChange={e => setKm(e.target.value)} placeholder="0" className={input + ' font-extrabold text-[24px]'} style={{ borderColor: LINEA }} />
        {ultimoKm ? <p className="text-[13px]" style={{ color: GRIS }}>Último registro: {miles(ultimoKm)} km</p> : null}
        {avisoKm && <p className="text-[13px] font-bold" style={{ color: ROJO }}>{avisoKm}</p>}
      </div>
      <div className="bg-white rounded-2xl p-4 flex flex-col">
        <p className="text-[13px] mb-1" style={{ color: GRIS }}>Revise cada punto. Toque Novedad solo si algo está mal.</p>
        {items.map(([k, nombre, critico], i) => {
          const nov = !!estado[k]
          return (
            <div key={k} className="flex flex-col gap-2 py-2.5" style={{ borderTop: i ? `1px solid ${LINEA}` : 0 }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15px] min-w-0">{nombre}{critico && <span className="text-[12px]" style={{ color: GRIS }}> · crítico</span>}</span>
                <div className="flex gap-1 rounded-full p-1 shrink-0" style={{ background: FONDO }}>
                  {[['bien', 'Bien'], ['novedad', 'Novedad']].map(([v, t]) => {
                    const activo = (v === 'novedad') === nov
                    return <button key={v} type="button" aria-pressed={activo} onClick={() => setEstado(e => { const n = { ...e }; if (v === 'novedad') n[k] = n[k] || { detalle: '', fotos: [] }; else delete n[k]; return n })}
                      className="rounded-full min-h-[38px] px-3.5 text-[14px] font-bold" style={activo ? { background: '#fff', color: v === 'novedad' ? ROJO : TINTA, boxShadow: `inset 0 0 0 2px ${v === 'novedad' ? ROJO : TINTA}` } : { color: GRIS }}>{t}</button>
                  })}
                </div>
              </div>
              {nov && (
                <div className="rounded-xl p-2.5 flex flex-col gap-2" style={{ background: '#FBE9E9' }}>
                  <input value={estado[k].detalle} onChange={e => setEstado(s => ({ ...s, [k]: { ...s[k], detalle: e.target.value } }))} placeholder="¿Qué pasa?" className={input} style={{ borderColor: LINEA }} />
                  <label className="min-h-[44px] rounded-xl text-[14px] font-bold flex items-center justify-center cursor-pointer bg-white">
                    {subiendo === k ? 'Subiendo…' : estado[k].fotos?.length ? `${estado[k].fotos.length} ${estado[k].fotos.length === 1 ? 'foto' : 'fotos'} · agregar otra` : 'Tomar foto'}
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { foto(k, e.target.files?.[0]); e.target.value = '' }} />
                  </label>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {criticas.length > 0 && <div className="rounded-2xl p-3.5 text-sm" style={{ background: '#FBE9E9', color: ROJO }}><b>Novedad en {criticas.map(k => items.find(x => x[0] === k)[1].toLowerCase()).join(', ')}.</b> El administrador recibe el aviso al guardar. No salga hasta que le confirme.</div>}
      <button onClick={guardar} disabled={guardando} className="min-h-[56px] rounded-2xl text-white font-bold text-[17px] bg-brand disabled:opacity-50">{guardando ? 'Guardando…' : Object.keys(estado).length ? 'Guardar y reportar novedades' : 'Todo bien, salir a ruta'}</button>
    </div>
  )
}

export function Tanqueo({ vehiculo, vendedor, usuario, despachoId, ultimoKm, onListo, onVolver }) {
  const [f, setF] = useState({ valor: '', galones: '', km: '', lleno: true, foto: null })
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const foto = async (file) => {
    if (!file) return
    setSubiendo(true)
    try { setF(x => ({ ...x, foto: null })); const ruta = await subirSoporte(file, 'gastos'); setF(x => ({ ...x, foto: ruta })) } catch (e) { alert('No se pudo subir la foto: ' + e.message) }
    setSubiendo(false)
  }
  const guardar = async () => {
    const valor = Number(f.valor), galones = parseFloat(String(f.galones).replace(',', '.')) || null, km = Number(f.km) || null
    if (!valor) { alert('Escriba el valor del tanqueo.'); return }
    if (!km) { alert('Escriba el kilometraje del tablero al tanquear.'); return }
    setGuardando(true)
    try {
      const empresaId = getEmpresaId()
      const { data: t, error } = await supabase.from('vehiculos_tanqueos').insert({
        empresa_id: empresaId, vehiculo_id: vehiculo.id, fecha: obtenerFechaActual(), km, galones, valor, tanque_lleno: f.lleno, vendedor_id: vendedor.id, foto_url: f.foto, registrado_por: usuario.nombre,
      }).select().single()
      if (error) throw new Error(error.message)
      // Llega solo a Cerrar como gasto de gasolina (no se anota dos veces).
      if (despachoId) await anotarEnCurso({ despachoId, vendedorId: vendedor.id, usuarioNombre: usuario.nombre, agregar: { gastos: [{ categoria: 'Gasolina', concepto: `Tanqueo ${vehiculo.placa}${galones ? ` · ${String(galones).replace('.', ',')} gal` : ''} · ${miles(km)} km`, valor: String(valor), foto: f.foto, tanqueo_id: t.id }] } }).catch(() => {})
      onListo()
    } catch (e) { alert('No se pudo guardar: ' + e.message) }
    setGuardando(false)
  }
  return (
    <div className="max-w-md mx-auto px-4 pt-4 flex flex-col gap-3">
      <Encabezado texto="Registrar tanqueo" sub={vehiculo.placa} onVolver={onVolver} />
      <div className="bg-white rounded-2xl p-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1"><span className="text-[14px] font-bold">Valor pagado</span><InputDinero value={f.valor} onChange={e => setF({ ...f, valor: e.target.value })} placeholder="$" className={input + ' font-extrabold text-[22px]'} style={{ borderColor: LINEA }} /></label>
        <label className="flex flex-col gap-1"><span className="text-[14px] font-bold">Galones</span><input inputMode="decimal" value={f.galones} onChange={e => setF({ ...f, galones: e.target.value.replace(/[^\d.,]/g, '') })} placeholder="Del recibo" className={input} style={{ borderColor: LINEA }} /></label>
        <label className="flex flex-col gap-1"><span className="text-[14px] font-bold">Kilometraje del tablero</span><InputDinero entero value={f.km} onChange={e => setF({ ...f, km: e.target.value })} placeholder={ultimoKm ? `Último: ${miles(ultimoKm)}` : '0'} className={input} style={{ borderColor: LINEA }} /></label>
        <div className="flex gap-1 rounded-full p-1 w-max" style={{ background: FONDO }}>
          {[[true, 'Tanque lleno'], [false, 'Solo una parte']].map(([v, t]) => <button key={t} type="button" aria-pressed={f.lleno === v} onClick={() => setF({ ...f, lleno: v })} className="rounded-full min-h-[40px] px-4 text-[14px] font-bold" style={f.lleno === v ? { background: '#fff', boxShadow: `inset 0 0 0 2px ${TINTA}` } : { color: GRIS }}>{t}</button>)}
        </div>
        <label className="min-h-[48px] rounded-xl text-[15px] font-bold flex items-center justify-center cursor-pointer" style={f.foto ? { background: '#E6F0E8', color: '#2E5E3A' } : { background: SUAVE }}>
          {subiendo ? 'Subiendo…' : f.foto ? 'Recibo cargado' : 'Foto del recibo'}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { foto(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        <p className="text-[13px]" style={{ color: GRIS }}>Queda anotado como gasto de gasolina en Cerrar; no lo vuelva a escribir allá.</p>
      </div>
      <button onClick={guardar} disabled={guardando || subiendo} className="min-h-[56px] rounded-2xl text-white font-bold text-[17px] bg-brand disabled:opacity-50">{guardando ? 'Guardando…' : 'Registrar tanqueo'}</button>
    </div>
  )
}
