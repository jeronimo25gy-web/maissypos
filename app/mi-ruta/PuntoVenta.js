'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import InputDinero from '@/components/InputDinero'
import { subirSoporte, leerComprobante } from '@/lib/soportes'

// Inicio de un punto de venta (carro parqueado): no hay rutero ni cliente por
// cliente. En el dia solo se anota lo que no se puede deducir al cerrar: las
// transferencias (con foto) y los fiados a conocidos. Queda en el borrador
// "en curso" del despacho y llega solo al cierre (Cerrar mi ruta).
const TINTA = '#1C1B19', GRIS = '#5A5750', LINEA = '#E3E1D8', ROJO = '#C41230', SUAVE = '#EFEDE6'
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const fmt = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
const input = 'w-full rounded-xl px-3 min-h-[48px] text-[16px] bg-white border outline-none focus:border-[#1C1B19]'
let cont = 0
const nuevaKey = () => `p${Date.now()}${cont++}`

export default function PuntoVenta({ vendedor, usuario, carro, onCerrar }) {
  const empresaId = getEmpresaId()
  const [despacho, setDespacho] = useState(null)
  const [borrador, setBorrador] = useState(null) // { estado, datos }
  const [hoja, setHoja] = useState(null) // 'transferencia' | 'fiado'
  const [form, setForm] = useState({})
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState('')

  const cargar = async () => {
    if (!carro.despachoId) { setDespacho(null); setBorrador(null); return }
    const [{ data: d }, { data: b }] = await Promise.all([
      supabase.from('despachos_encab').select('id, fecha').eq('id', carro.despachoId).eq('empresa_id', empresaId).maybeSingle(),
      supabase.from('liquidaciones_borrador').select('estado, datos').eq('despacho_id', carro.despachoId).eq('empresa_id', empresaId).maybeSingle(),
    ])
    setDespacho(d || null)
    setBorrador(b || null)
  }
  useEffect(() => { cargar() }, [carro.despachoId])

  const enCarro = carro.productos.reduce((s, p) => s + Math.max(0, p.quedan) * (p.precio || 0), 0)
  const unidades = carro.productos.reduce((s, p) => s + Math.max(0, p.quedan), 0)
  const transf = borrador?.datos?.comprobantes || []
  const fiados = borrador?.datos?.fiados || []
  const cerrado = borrador && borrador.estado !== 'en_curso'

  const abrir = (tipo) => { setError(''); setForm(tipo === 'fiado' ? { nombre: '', valor: '', fecha_pago: '' } : { valor: '' }); setHoja(tipo) }

  // Agrega al borrador en curso (lo crea si no existe). Si ya se envio el
  // cierre, no se toca: lo corrige el encargado en Liquidacion.
  const anotar = async (campo, item) => {
    const { data: b } = await supabase.from('liquidaciones_borrador').select('id, estado, datos').eq('despacho_id', despacho.id).eq('empresa_id', empresaId).maybeSingle()
    if (b && b.estado !== 'en_curso') throw new Error('Ya cerraste este día. Si falta algo, corrígelo desde Cerrar.')
    const datos = { ...(b?.datos || {}) }
    datos[campo] = [...(datos[campo] || []), item]
    const fila = { empresa_id: empresaId, despacho_id: despacho.id, vendedor_id: vendedor.id, fecha: despacho.fecha, datos, estado: 'en_curso', enviado_por: usuario?.nombre || null }
    const { error: e } = b
      ? await supabase.from('liquidaciones_borrador').update({ datos }).eq('id', b.id).eq('empresa_id', empresaId)
      : await supabase.from('liquidaciones_borrador').insert(fila)
    if (e) throw new Error(e.message)
    await cargar()
  }

  const guardarTransferencia = async (file) => {
    setTrabajando(true); setError('')
    try {
      let comp = { key: nuevaKey(), valor: form.valor, referencia: 'Punto de venta', estado: 'por_verificar', fecha_limite: '', origen: 'manual', hora: new Date().toISOString() }
      if (file) {
        const [lectura, foto] = await Promise.all([leerComprobante(file), subirSoporte(file, 'transferencias').catch(() => null)])
        comp = { ...comp, ...lectura, foto, valor: lectura.valor }
      }
      if (!(parseFloat(comp.valor) > 0)) throw new Error('Escribe el valor o toma la foto del comprobante')
      await anotar('comprobantes', comp)
      setHoja(null)
    } catch (e) { setError(e.message) }
    setTrabajando(false)
  }

  const guardarFiado = async () => {
    if (!form.nombre.trim() || !(parseFloat(form.valor) > 0)) { setError('Escribe el nombre y el valor'); return }
    setTrabajando(true); setError('')
    try { await anotar('fiados', { nombre: form.nombre.trim(), valor: form.valor, fecha_pago: form.fecha_pago || '', hora: new Date().toISOString() }); setHoja(null) }
    catch (e) { setError(e.message) }
    setTrabajando(false)
  }

  const hora = (iso) => iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) : ''
  const accion = 'bg-white rounded-2xl p-3.5 flex items-center gap-3 text-left min-h-[64px] disabled:opacity-50'

  return (
    <>
      <div className="bg-white rounded-[20px] p-[18px] flex flex-col gap-1" style={{ boxShadow: '0 6px 18px rgba(28,27,25,.08)' }}>
        <span className="text-[13px] font-bold uppercase tracking-wider" style={{ color: GRIS }}>En el carro ahora</span>
        <span className="font-extrabold text-[34px] tracking-tight tabular-nums" style={titulo}>{fmt(enCarro)}</span>
        <span className="text-sm" style={{ color: GRIS }}>{carro.despachoId ? `${unidades.toLocaleString('es-CO')} unidades · ${carro.productos.length} productos` : 'Todavía no te han despachado'}</span>
      </div>

      <button disabled={!despacho || cerrado} onClick={() => abrir('transferencia')} className={accion}>
        <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-lg font-extrabold" style={{ background: '#FFF4CC' }} aria-hidden="true">⇄</span>
        <span><b className="block text-[16px]">Transferencia recibida</b><span className="text-[13px]" style={{ color: GRIS }}>Foto del pantallazo o el valor</span></span>
      </button>
      <button disabled={!despacho || cerrado} onClick={() => abrir('fiado')} className={accion}>
        <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-lg font-extrabold" style={{ background: '#FBE9E9', color: ROJO }} aria-hidden="true">$</span>
        <span><b className="block text-[16px]">Fiado a un conocido</b><span className="text-[13px]" style={{ color: GRIS }}>Nombre y valor</span></span>
      </button>

      {(transf.length > 0 || fiados.length > 0) && (
        <div className="bg-white rounded-2xl p-3.5 flex flex-col">
          <span className="text-[13px] font-bold mb-1" style={{ color: GRIS }}>Hoy van</span>
          {transf.map((t, i) => (
            <div key={t.key || i} className="flex justify-between gap-3 py-1.5 text-[14px]" style={{ borderTop: i ? `1px solid ${LINEA}` : 0 }}>
              <span className="min-w-0 truncate">{[t.banco || 'Transferencia', hora(t.hora)].filter(Boolean).join(' · ')}{t.foto ? ' · con foto' : ''}</span><b className="tabular-nums">{fmt(t.valor)}</b>
            </div>
          ))}
          {fiados.map((f, i) => (
            <div key={'f' + i} className="flex justify-between gap-3 py-1.5 text-[14px]" style={{ borderTop: `1px solid ${LINEA}` }}>
              <span className="min-w-0 truncate">Fiado · {f.nombre}</span><b className="tabular-nums">{fmt(f.valor)}</b>
            </div>
          ))}
        </div>
      )}

      <button onClick={onCerrar} className="min-h-[56px] rounded-2xl text-white font-bold text-[17px]" style={{ background: TINTA }}>
        {cerrado ? 'Ver mi cierre' : 'Cerrar el día'}
      </button>

      {hoja && (
        <div className="fixed inset-0 z-40 flex items-end justify-center" style={{ background: 'rgba(28,27,25,.45)' }} onClick={() => !trabajando && setHoja(null)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl p-5 flex flex-col gap-3" style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3 className="font-extrabold text-[20px]" style={titulo}>{hoja === 'fiado' ? 'Fiado a un conocido' : 'Transferencia recibida'}</h3>
            {hoja === 'transferencia' ? (
              <>
                <label className="min-h-[56px] rounded-2xl font-bold text-[16px] flex items-center justify-center cursor-pointer text-white" style={{ background: TINTA, opacity: trabajando ? 0.6 : 1 }}>
                  {trabajando ? 'Leyendo la foto…' : 'Tomar foto del comprobante'}
                  <input type="file" accept="image/*" capture="environment" className="hidden" disabled={trabajando} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) guardarTransferencia(f) }} />
                </label>
                <p className="text-center text-[13px]" style={{ color: GRIS }}>o anota solo el valor</p>
                <div className="flex gap-2">
                  <InputDinero value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} placeholder="$0" className={input + ' flex-1 font-bold text-center'} style={{ borderColor: LINEA }} />
                  <button disabled={trabajando} onClick={() => guardarTransferencia(null)} className="px-5 rounded-xl font-bold disabled:opacity-50" style={{ background: SUAVE }}>Anotar</button>
                </div>
              </>
            ) : (
              <>
                <input autoFocus placeholder="¿A quién? (ej. Don Mario, celador)" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className={input} style={{ borderColor: LINEA }} />
                <InputDinero value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} placeholder="Valor" className={input + ' font-bold'} style={{ borderColor: LINEA }} />
                <label className="flex items-center gap-2 text-[14px]" style={{ color: GRIS }}>Paga el
                  <input type="date" value={form.fecha_pago} onChange={e => setForm({ ...form, fecha_pago: e.target.value })} className={input + ' flex-1'} style={{ borderColor: LINEA }} />
                </label>
                <button disabled={trabajando} onClick={guardarFiado} className="min-h-[54px] rounded-2xl font-bold text-white disabled:opacity-50" style={{ background: ROJO }}>{trabajando ? 'Guardando…' : 'Anotar fiado'}</button>
              </>
            )}
            {error && <p className="text-[14px]" style={{ color: ROJO }}>{error}</p>}
            <button disabled={trabajando} onClick={() => setHoja(null)} className="min-h-[46px] rounded-2xl font-bold" style={{ background: SUAVE }}>Cancelar</button>
          </div>
        </div>
      )}
    </>
  )
}
