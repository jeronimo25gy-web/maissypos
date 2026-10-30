'use client'
import { useState, useEffect } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

// Formulario "Probarlo en mi negocio" de la pagina comercial: deja la solicitud
// en la consola de Plataforma para que el dueño apruebe la demo.
export const abrirPrueba = () => window.dispatchEvent(new Event('maissy:prueba'))
const C = { tinta: '#1C1B19', gris: '#5A5750', fondo: '#F3F1EA', linea: '#E3E1D8', rojo: '#C41230', verde: '#2E5E3A', verdeF: '#E6F0E8' }
const ACT = [['distribucion', 'Reparto por rutas'], ['produccion', 'Fabrico productos'], ['mostrador', 'Tienda o punto de venta']]
const vacio = { nombre: '', negocio: '', actividades: [], celular: '', ciudad: '', rutas: '', sitio: '' }

export default function PanelPrueba() {
  const [abierto, setAbierto] = useState(false)
  const [f, setF] = useState(vacio)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState(null)

  useEffect(() => {
    const abrir = () => setAbierto(true)
    const tecla = (e) => { if (e.key === 'Escape') setAbierto(false) }
    window.addEventListener('maissy:prueba', abrir)
    window.addEventListener('keydown', tecla)
    return () => { window.removeEventListener('maissy:prueba', abrir); window.removeEventListener('keydown', tecla) }
  }, [])
  useEffect(() => { document.body.style.overflow = abierto ? 'hidden' : ''; return () => { document.body.style.overflow = '' } }, [abierto])

  if (!abierto) return null
  const set = (k, v) => setF({ ...f, [k]: v })
  const alternar = (a) => set('actividades', f.actividades.includes(a) ? f.actividades.filter(x => x !== a) : [...f.actividades, a])
  const enviar = async (e) => {
    e.preventDefault()
    if (f.sitio) { setListo(f.nombre); return } // campo oculto: lo llenan los robots
    const cel = f.celular.replace(/\D/g, '')
    if (!f.nombre.trim() || !f.negocio.trim()) { setError('Escribe tu nombre y el de tu negocio.'); return }
    if (cel.length < 10) { setError('Escribe tu celular de 10 dígitos para escribirte por WhatsApp.'); return }
    if (!f.actividades.length) { setError('Escoge qué hace tu negocio.'); return }
    setEnviando(true); setError('')
    const { error: e1 } = await supabase.from('solicitudes_demo').insert({ nombre: f.nombre.trim(), negocio: f.negocio.trim(), actividades: f.actividades, celular: cel.slice(-10), ciudad: f.ciudad.trim() || null, rutas: f.rutas.trim() || null })
    setEnviando(false)
    if (e1) { setError('No se pudo enviar. Intenta de nuevo o escríbenos por WhatsApp.'); return }
    setListo(f.nombre.trim().split(' ')[0]); setF(vacio)
  }
  const campo = 'w-full min-h-[48px] rounded-[14px] bg-white px-3.5 text-[16px] font-medium outline-none'
  const borde = { boxShadow: `inset 0 0 0 1.5px ${C.linea}`, color: C.tinta }
  const etiqueta = 'flex flex-col gap-1.5 text-[13px] font-bold min-w-0'
  return (
    <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center" onClick={() => setAbierto(false)}
      style={{ background: 'rgba(243,241,234,.35)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
      <div role="dialog" aria-modal="true" aria-label="Probarlo en mi negocio" onClick={e => e.stopPropagation()}
        className="w-full md:max-w-[480px] max-h-[92vh] overflow-y-auto rounded-t-[28px] md:rounded-[28px] px-5 pt-4 md:p-7 flex flex-col gap-3"
        style={{ background: C.fondo, color: C.tinta, boxShadow: '0 16px 40px rgba(28,27,25,.18)', fontFamily: 'var(--font-texto), system-ui, sans-serif', paddingBottom: 'max(24px, calc(env(safe-area-inset-bottom, 0px) + 16px))' }}>
        <div className="flex items-center justify-between gap-3">
          <Image src="/maissypos-logo.png" width={130} height={48} alt="MaissyPOS" style={{ width: '130px', height: 'auto' }} />
          <button type="button" onClick={() => { setAbierto(false); setListo(null) }} aria-label="Cerrar" className="w-11 h-11 rounded-full flex items-center justify-center bg-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {listo ? (<>
          <h2 className="m-0 font-extrabold text-[26px] leading-tight" style={{ fontFamily: 'var(--font-titulo), Georgia, serif' }}>Listo, {listo}.</h2>
          <p className="m-0 rounded-2xl px-4 py-3 text-[15px] font-semibold" style={{ background: C.verdeF, color: C.verde }}>Recibimos tu solicitud. Te escribimos por WhatsApp con tu acceso.</p>
        </>) : (
          <form className="flex flex-col gap-3" onSubmit={enviar}>
            <h2 className="m-0 font-extrabold text-[26px] leading-tight" style={{ fontFamily: 'var(--font-titulo), Georgia, serif' }}>Pruébalo con tu negocio</h2>
            <label className={etiqueta} style={{ color: C.gris }}>Tu nombre<input autoComplete="name" value={f.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Nombre y apellido" className={campo} style={borde} /></label>
            <label className={etiqueta} style={{ color: C.gris }}>Nombre del negocio<input autoComplete="organization" value={f.negocio} onChange={e => set('negocio', e.target.value)} className={campo} style={borde} /></label>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-bold" style={{ color: C.gris }}>¿Qué hace tu negocio?</span>
              <div className="flex flex-wrap gap-1.5">
                {ACT.map(([id, t]) => { const a = f.actividades.includes(id); return <button key={id} type="button" aria-pressed={a} onClick={() => alternar(id)} className="rounded-full min-h-[40px] px-3.5 text-[14px] font-bold bg-white" style={a ? { color: C.tinta, boxShadow: `inset 0 0 0 2px ${C.tinta}` } : { color: C.gris }}>{t}</button> })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <label className={etiqueta} style={{ color: C.gris }}>Celular (WhatsApp)<input type="tel" inputMode="numeric" autoComplete="tel" value={f.celular} onChange={e => set('celular', e.target.value)} placeholder="300 000 0000" className={campo} style={borde} /></label>
              <label className={etiqueta} style={{ color: C.gris }}>Ciudad<input autoComplete="address-level2" value={f.ciudad} onChange={e => set('ciudad', e.target.value)} className={campo} style={borde} /></label>
            </div>
            {f.actividades.includes('distribucion') && <label className={etiqueta} style={{ color: C.gris }}>¿Cuántas rutas o vendedores tienes?<input inputMode="numeric" value={f.rutas} onChange={e => set('rutas', e.target.value)} className={campo} style={borde} /></label>}
            <input type="text" tabIndex={-1} aria-hidden="true" autoComplete="off" value={f.sitio} onChange={e => set('sitio', e.target.value)} className="absolute w-px h-px opacity-0 pointer-events-none" />
            {error && <p className="m-0 text-[13.5px] font-semibold pl-2.5" style={{ color: C.rojo, borderLeft: `3px solid ${C.rojo}` }} role="alert">{error}</p>}
            <button type="submit" disabled={enviando} className="min-h-[52px] rounded-2xl text-white font-extrabold text-[16px] disabled:opacity-60" style={{ background: C.rojo }}>{enviando ? 'Enviando…' : 'Pedir mi prueba'}</button>
          </form>
        )}
      </div>
    </div>
  )
}
