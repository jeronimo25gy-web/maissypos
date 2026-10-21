'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { MODELOS_NEGOCIO } from '@/components/Sidebar'
import { C, Pill, Tarjeta, H2, Nota, Boton, campo, campoEstilo, Campo, Aviso } from '../gastos/ui'

// Datos legales de la empresa activa (salen en facturas, tickets,
// comprobantes y reportes), logo y modelos de negocio.
const REGIMENES = ['Responsable de IVA', 'No responsable de IVA', 'Régimen simple de tributación', 'Persona natural']
const DESCRIPCION_MODELO = { distribucion: 'Rutas, despacho, liquidación, Mi ruta, mostrador y domicilios', produccion: 'Planta, lotes de cocción, fórmulas y costos de producción' }
const nitLimpio = (n) => String(n || '').replace(/\D/g, '')

// Dígito de verificación del NIT (DIAN, módulo 11).
export function digitoVerificacion(nit) {
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]
  const d = nitLimpio(nit).split('').reverse()
  if (!d.length) return ''
  const s = d.reduce((acc, x, i) => acc + Number(x) * pesos[i], 0) % 11
  return String(s > 1 ? 11 - s : s)
}

export default function Empresa() {
  const [e, setE] = useState(null)
  const [otras, setOtras] = useState([])
  const [form, setForm] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const cargar = useCallback(async () => {
    const [{ data }, { data: todas }] = await Promise.all([
      supabase.from('empresas').select('*').eq('id', getEmpresaId()).maybeSingle(),
      supabase.from('empresas').select('id, nombre, nit').eq('activo', true),
    ])
    setE(data); setOtras((todas || []).filter(x => x.id !== data?.id))
  }, [])
  useEffect(() => { cargar() }, [cargar])
  if (!e) return <Nota>Cargando…</Nota>

  const nitRepetido = e.nit && otras.find(o => nitLimpio(o.nit) === nitLimpio(e.nit))
  const dvCalculado = digitoVerificacion(e.nit)
  const guardar = async () => {
    if (!form.nombre.trim()) { alert('Escriba el nombre comercial.'); return }
    setGuardando(true)
    const { error } = await supabase.from('empresas').update({
      nombre: form.nombre.trim(), razon_social: form.razon_social?.trim() || null, nit: nitLimpio(form.nit) || null, dv: form.dv?.trim() || (nitLimpio(form.nit) ? digitoVerificacion(form.nit) : null),
      regimen: form.regimen || null, direccion: form.direccion?.trim() || null, ciudad: form.ciudad?.trim() || null, telefono: form.telefono?.trim() || null, email: form.email?.trim() || null,
    }).eq('id', e.id)
    setGuardando(false)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    setForm(null); cargar()
  }
  const subirLogo = async (file) => {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) { alert('El logo debe ser PNG, JPG, WEBP o SVG.'); return }
    setSubiendo(true)
    const path = `${e.id}-${Date.now()}.${file.name.split('.').pop()}`
    const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true })
    if (error) { setSubiendo(false); alert('No se pudo subir el logo: ' + error.message); return }
    const { data: pub } = supabase.storage.from('logos').getPublicUrl(path)
    await supabase.from('empresas').update({ logo_url: pub.publicUrl }).eq('id', e.id)
    setSubiendo(false); cargar()
  }
  const alternarModelo = async (m) => {
    const actuales = e.modelos || []
    const nuevos = actuales.includes(m) ? actuales.filter(x => x !== m) : [...actuales, m]
    if (!nuevos.length) { alert('La empresa debe tener al menos un modelo de negocio.'); return }
    if (!confirm(actuales.includes(m) ? `¿Quitar ${MODELOS_NEGOCIO.find(x => x.id === m)?.nombre}? Sus módulos dejan de aparecer en el menú.` : `¿Activar ${MODELOS_NEGOCIO.find(x => x.id === m)?.nombre}?`)) return
    const { error } = await supabase.from('empresas').update({ modelos: nuevos }).eq('id', e.id)
    if (error) { alert('Error: ' + error.message); return }
    window.location.reload()
  }
  const Dato = ({ r, children, rojo }) => <div className="flex justify-between gap-3 py-2 text-sm" style={{ borderBottom: `1px solid ${C.linea}` }}><span style={{ color: C.gris }}>{r}</span><b className="text-right" style={rojo ? { color: C.rojo } : {}}>{children}</b></div>

  return (
    <div className="flex flex-col gap-4">
      {nitRepetido && <Aviso><b style={{ color: C.tinta }}>{e.nombre} tiene el mismo NIT que {nitRepetido.nombre} ({e.nit}).</b> Cada empresa debe tener su propio NIT; una S.A.S. tiene NIT de sociedad con dígito de verificación. Corríjalo para que facturas, cotizaciones y comprobantes salgan con el dato correcto.</Aviso>}
      <Tarjeta>
        <div className="flex justify-between gap-2 items-center flex-wrap"><H2>Datos legales</H2>{!form && <Boton onClick={() => setForm({ ...e })}>Editar</Boton>}</div>
        <div className="flex gap-3.5 items-center flex-wrap">
          {e.logo_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={e.logo_url} alt={`Logo de ${e.nombre}`} className="w-16 h-16 rounded-[14px] object-contain bg-white" style={{ border: `1px solid ${C.linea}` }} />
            : <div className="w-16 h-16 rounded-[14px] grid place-items-center font-extrabold text-2xl text-white" style={{ background: C.rojo }}>{e.nombre?.[0]}</div>}
          <span className="flex flex-col gap-1"><b>Logo</b><span className="text-[13px]" style={{ color: C.gris }}>Sale en facturas, tickets, comprobantes de nómina y reportes</span>
            <label className="text-[13px] font-bold cursor-pointer w-max">{subiendo ? 'Subiendo…' : 'Cambiar logo'}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={ev => { subirLogo(ev.target.files?.[0]); ev.target.value = '' }} /></label></span>
        </div>
        {form ? (
          <div className="flex flex-col gap-3">
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
              <Campo etiqueta="Nombre comercial"><input value={form.nombre || ''} onChange={ev => setForm({ ...form, nombre: ev.target.value })} className={campo} style={campoEstilo} /></Campo>
              <Campo etiqueta="Razón social"><input value={form.razon_social || ''} onChange={ev => setForm({ ...form, razon_social: ev.target.value })} placeholder="Distri Maissy S.A.S." className={campo} style={campoEstilo} /></Campo>
              <Campo etiqueta="NIT (sin dígito de verificación)"><input inputMode="numeric" value={form.nit || ''} onChange={ev => setForm({ ...form, nit: ev.target.value.replace(/\D/g, ''), dv: '' })} className={campo} style={campoEstilo} /></Campo>
              <Campo etiqueta="Dígito de verificación"><input inputMode="numeric" value={form.dv || digitoVerificacion(form.nit)} onChange={ev => setForm({ ...form, dv: ev.target.value.replace(/\D/g, '').slice(0, 1) })} className={campo} style={campoEstilo} /></Campo>
              <Campo etiqueta="Régimen tributario"><select value={form.regimen || ''} onChange={ev => setForm({ ...form, regimen: ev.target.value })} className={campo} style={campoEstilo}><option value="">Por definir</option>{REGIMENES.map(r => <option key={r}>{r}</option>)}</select></Campo>
              <Campo etiqueta="Dirección"><input value={form.direccion || ''} onChange={ev => setForm({ ...form, direccion: ev.target.value })} className={campo} style={campoEstilo} /></Campo>
              <Campo etiqueta="Ciudad"><input value={form.ciudad || ''} onChange={ev => setForm({ ...form, ciudad: ev.target.value })} className={campo} style={campoEstilo} /></Campo>
              <Campo etiqueta="Teléfono"><input inputMode="tel" value={form.telefono || ''} onChange={ev => setForm({ ...form, telefono: ev.target.value })} className={campo} style={campoEstilo} /></Campo>
              <Campo etiqueta="Correo"><input inputMode="email" value={form.email || ''} onChange={ev => setForm({ ...form, email: ev.target.value })} className={campo} style={campoEstilo} /></Campo>
            </div>
            <Nota>El dígito de verificación se calcula solo con el NIT (método de la DIAN); revíselo contra el RUT.</Nota>
            <div className="flex gap-2 justify-end"><Boton onClick={() => setForm(null)}>Cancelar</Boton><Boton tono="rojo" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar datos'}</Boton></div>
          </div>
        ) : (
          <div>
            <Dato r="Nombre comercial">{e.nombre}</Dato>
            <Dato r="Razón social">{e.razon_social || 'Sin registrar'}</Dato>
            <Dato r="NIT" rojo={!!nitRepetido}>{e.nit ? `${e.nit}-${e.dv || dvCalculado}${!e.dv ? ' (dígito calculado)' : ''}` : 'Sin registrar'}</Dato>
            <Dato r="Régimen tributario">{e.regimen || 'Por definir'}</Dato>
            <Dato r="Dirección">{[e.direccion, e.ciudad].filter(Boolean).join(' · ') || '—'}</Dato>
            <Dato r="Teléfono">{e.telefono || '—'}</Dato>
            <Dato r="Correo">{e.email || '—'}</Dato>
          </div>
        )}
      </Tarjeta>
      <Tarjeta>
        <H2>Modelos de negocio</H2>
        <Nota>Definen qué módulos usa la empresa. Es la base para ofrecer MaissyPOS a otros negocios.</Nota>
        {MODELOS_NEGOCIO.map((m, i) => {
          const activo = (e.modelos || []).includes(m.id)
          return (
            <div key={m.id} className="grid gap-2.5 items-center pt-2.5" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', borderTop: i ? `1px solid ${C.linea}` : 0 }}>
              <span className="min-w-0"><b>{m.nombre}</b><span className="block text-[13px]" style={{ color: C.gris }}>{DESCRIPCION_MODELO[m.id] || ''}</span></span>
              <span className="flex gap-2 items-center"><Pill tono={activo ? 'verde' : 'gris'}>{activo ? 'Activo' : 'No aplica'}</Pill><button type="button" onClick={() => alternarModelo(m.id)} className="text-[13px] font-bold">{activo ? 'Quitar' : 'Activar'}</button></span>
            </div>
          )
        })}
      </Tarjeta>
    </div>
  )
}
