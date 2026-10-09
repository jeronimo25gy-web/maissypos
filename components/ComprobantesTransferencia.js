'use client'
import { useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import InputDinero from '@/components/InputDinero'

// Transferencias de una liquidacion, comprobante por comprobante.
// Politica: solo lo 'verificada' (un admin ya lo vio en el banco) cuenta como
// plata entregada; lo 'por_verificar' queda como deuda del vendedor con fecha
// limite acordada. 'recibida' / 'descontada' ya se resolvieron despues
// (Cartera / Nomina) y no se tocan desde aqui.

const ESTADOS_RESUELTOS = ['recibida', 'descontada']

export const comprobanteDesdeFila = (f) => ({
  key: f.id, id: f.id, estadoOriginal: f.estado,
  valor: String(f.valor), referencia: f.referencia || '', banco: f.banco || '', fecha_comprobante: f.fecha_comprobante || '',
  destino: f.destino || '', cuenta_maissy: f.cuenta_maissy, cuenta_id: f.cuenta_id || null,
  estado: f.estado, fecha_limite: f.fecha_limite || '', origen: f.origen || 'manual',
})

export const comprobanteEditable = (c, esAdmin) =>
  !c.legado && !ESTADOS_RESUELTOS.includes(c.estadoOriginal) && (esAdmin || c.estadoOriginal !== 'verificada')

export const totalesComprobantes = (lista) => lista.reduce((t, c) => {
  const v = parseFloat(c.valor) || 0
  if (c.estado === 'verificada') t.verificadas += v
  else t.porVerificar += v
  return t
}, { verificadas: 0, porVerificar: 0 })

const fmt = (v) => `$${Math.round(v || 0).toLocaleString('es-CO')}`
let contador = 0
const nuevaKey = () => `n${Date.now()}${contador++}`

// Pago de credito que el cliente hizo por transferencia: su comprobante entra
// a Transferencias (por verificar) apenas se marca, para que el pago no sume a
// lo que el vendedor debe entregar sin la plata que lo respalda.
export const REF_PAGO_CREDITO = 'Pago crédito: '
export const comprobanteDePago = (nombreCliente, valor) => ({
  key: nuevaKey(), valor: String(valor || ''), referencia: REF_PAGO_CREDITO + (nombreCliente || ''),
  estado: 'por_verificar', fecha_limite: '', origen: 'manual',
})

// Mantiene el comprobante ligado a un pago de credito (forma 'transferencia')
// al dia con el pago: lo crea, le actualiza valor/cliente o lo quita si el
// pago vuelve a efectivo. Devuelve el pago con su compKey.
export const sincronizarPagoTransferencia = (pagoAntes, pago, nombreCliente, comprobantes, setComprobantes) => {
  if (pago.forma === 'transferencia') {
    if (pago.compKey && comprobantes.some(c => c.key === pago.compKey)) {
      setComprobantes(prev => prev.map(c => c.key === pago.compKey
        ? { ...c, valor: String(pago.valor || ''), referencia: REF_PAGO_CREDITO + (nombreCliente || '') } : c))
      return pago
    }
    const c = comprobanteDePago(nombreCliente, pago.valor)
    setComprobantes(prev => [...prev, c])
    return { ...pago, compKey: c.key }
  }
  if (pagoAntes?.compKey) setComprobantes(prev => prev.filter(c => c.key !== pagoAntes.compKey))
  return { ...pago, compKey: null }
}

// Al reabrir una liquidacion guardada: liga cada pago con el comprobante que
// se le creo (misma referencia y valor) para mostrarlo como "Transferencia".
export const ligarPagosConComprobantes = (pagos, comprobantes) => {
  const usados = new Set()
  return pagos.map(p => {
    const c = comprobantes.find(x => !usados.has(x.key) && x.referencia === REF_PAGO_CREDITO + (p.nombreCliente || '') && Number(x.valor) === Number(p.valor))
    if (!c) return { ...p, forma: 'efectivo' }
    usados.add(c.key)
    return { ...p, forma: 'transferencia', compKey: c.key }
  })
}

// Reduce la foto antes de mandarla (los pantallazos del celular pesan varios MB).
export const reducirImagen = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    const max = 1600
    const escala = Math.min(1, max / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * escala)
    canvas.height = Math.round(img.height * escala)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(url)
    resolve(canvas.toDataURL('image/jpeg', 0.82).split(',')[1])
  }
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo abrir la imagen')) }
  img.src = url
})

export default function ComprobantesTransferencia({ comprobantes, setComprobantes, esAdmin, fechaLiquidacion, oscuro = false }) {
  const inputRef = useRef(null)
  const [leyendo, setLeyendo] = useState(0)
  const [mensajes, setMensajes] = useState([])
  const [rapido, setRapido] = useState(null)

  const actualizar = (key, campos) => setComprobantes(prev => prev.map(c => c.key === key ? { ...c, ...campos } : c))
  const quitar = (key) => setComprobantes(prev => prev.filter(c => c.key !== key))
  // A mano: se escriben varios valores seguidos ("45.000 20.000 15.000") y
  // se crea una linea por cada uno, con una sola fecha limite para todas.
  const agregarManual = () => {
    const valores = (rapido?.texto || '').split(/[\s,;]+/).map(t => t.replace(/\D/g, '')).filter(t => Number(t) > 0)
    const estado = esAdmin && rapido?.estado === 'verificada' ? 'verificada' : 'por_verificar'
    const nuevas = (valores.length ? valores : ['']).map(v => ({
      key: nuevaKey(), valor: v, referencia: '', estado, fecha_limite: estado === 'por_verificar' ? (rapido?.fecha_limite || '') : '', origen: 'manual',
    }))
    setComprobantes(prev => [...prev, ...nuevas])
    setRapido(null)
  }

  const leerFotos = async (files) => {
    const lista = Array.from(files || [])
    if (lista.length === 0) return
    setMensajes([])
    setLeyendo(lista.length)
    const { data: { session } } = await supabase.auth.getSession()
    const empresaId = getEmpresaId()
    const leerUna = async (file) => {
      try {
        const imagen = await reducirImagen(file)
        const res = await fetch('/api/leer-comprobante', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ imagen, media_type: 'image/jpeg', empresa_id: empresaId }),
        })
        const json = await res.json()
        if (!res.ok) { setMensajes(m => [...m, `${file.name}: ${json.error}`]); return }
        const l = json.lectura
        if (!l.es_comprobante || !l.valor) {
          setMensajes(m => [...m, `${file.name}: no parece un comprobante de transferencia exitosa${l.observacion ? ` (${l.observacion})` : ''}`])
          return
        }
        setComprobantes(prev => [...prev, {
          key: nuevaKey(), origen: 'foto', valor: String(l.valor), referencia: l.referencia || '', banco: l.banco || '',
          fecha_comprobante: l.fecha || '', destino: [l.destino_numero, l.destino_nombre].filter(Boolean).join(' · '),
          cuenta_maissy: json.coincidencia === 'numero' || json.coincidencia === 'nombre' ? true : json.coincidencia === 'ninguna' ? false : null,
          coincidencia: json.coincidencia, cuenta_id: json.cuenta_id, cuenta_nombre: json.cuenta_nombre,
          repetida: json.repetida, observacion: l.observacion,
          estado: 'por_verificar', fecha_limite: '',
        }])
      } catch (e) {
        setMensajes(m => [...m, `${file.name}: ${e.message}`])
      } finally {
        setLeyendo(n => n - 1)
      }
    }
    // De a 3 a la vez para no saturar.
    for (let i = 0; i < lista.length; i += 3) await Promise.all(lista.slice(i, i + 3).map(leerUna))
    if (inputRef.current) inputRef.current.value = ''
  }

  const { verificadas, porVerificar } = totalesComprobantes(comprobantes)
  const refsRepetidas = (() => {
    const cuenta = {}
    comprobantes.forEach(c => { const r = (c.referencia || '').trim(); if (r.length >= 4) cuenta[r] = (cuenta[r] || 0) + 1 })
    return new Set(Object.keys(cuenta).filter(r => cuenta[r] > 1))
  })()

  const card = oscuro ? 'bg-gray-800 rounded-2xl p-5 mb-6' : 'bg-white rounded-xl shadow-sm p-4 mb-3'
  const fila = oscuro ? 'bg-gray-700 rounded-xl p-3 mb-2' : 'border border-gray-200 rounded-lg p-3 mb-2'
  const input = oscuro
    ? 'min-w-0 bg-gray-800 text-white border border-gray-600 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-brand'
    : 'min-w-0 border border-gray-200 rounded-lg px-2 py-2 text-sm text-gray-800 focus:outline-none focus:border-brand'
  const titulo = oscuro ? 'text-white font-black text-lg' : 'text-sm font-black text-gray-700'
  const sutil = oscuro ? 'text-gray-400' : 'text-gray-500'

  return (
    <div className={card}>
      <div className="flex justify-between items-center gap-2 mb-3">
        <label className={titulo}>Transferencias</label>
        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={leyendo > 0}
            className="text-xs bg-secondary text-white px-3 py-1.5 rounded-lg font-bold disabled:opacity-50">
            {leyendo > 0 ? `Leyendo ${leyendo}...` : '📷 Leer comprobantes'}
          </button>
          <button type="button" onClick={() => setRapido(rapido ? null : { texto: '', fecha_limite: '', estado: esAdmin ? 'verificada' : 'por_verificar' })} className={`text-xs px-3 py-1.5 rounded-lg font-bold ${oscuro ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>+ A mano</button>
        </div>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => leerFotos(e.target.files)} />
      </div>

      {rapido && (
        <div className={`${fila} space-y-2`}>
          <input type="text" inputMode="numeric" autoFocus placeholder="Valores separados por espacio. Ej: 45.000 20.000 15.000"
            value={rapido.texto} onChange={e => setRapido({ ...rapido, texto: e.target.value })} className={`${input} w-full`} />
          {esAdmin && (
            <div className="flex gap-2">
              {[{ id: 'verificada', t: '✅ Ya llegaron' }, { id: 'por_verificar', t: '⏳ Por verificar' }].map(o => (
                <button key={o.id} type="button" onClick={() => setRapido({ ...rapido, estado: o.id })}
                  className={`flex-1 text-xs font-bold py-1.5 rounded-lg ${rapido.estado === o.id ? (o.id === 'verificada' ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white') : oscuro ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                  {o.t}
                </button>
              ))}
            </div>
          )}
          {(!esAdmin || rapido.estado === 'por_verificar') && (
            <div className="flex items-center gap-2">
              <span className={`text-xs ${sutil} shrink-0`}>Fecha límite para todas:</span>
              <input type="date" value={rapido.fecha_limite} onChange={e => setRapido({ ...rapido, fecha_limite: e.target.value })} className={`${input} flex-1`} />
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setRapido(null)} className={`flex-1 text-xs font-bold py-2 rounded-lg ${oscuro ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>Cancelar</button>
            <button type="button" onClick={agregarManual} className="flex-1 text-xs font-bold py-2 rounded-lg bg-brand text-white">
              {(() => { const n = (rapido.texto || '').split(/[\s,;]+/).filter(t => Number(t.replace(/\D/g, '')) > 0).length; return n > 1 ? `Agregar ${n}` : 'Agregar' })()}
            </button>
          </div>
        </div>
      )}

      {mensajes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 mb-2">
          {mensajes.map((m, i) => <p key={i} className="text-xs text-amber-800">{m}</p>)}
        </div>
      )}

      {comprobantes.length === 0 && <p className={`text-xs ${sutil} mb-2`}>Sin transferencias. Toma foto de los comprobantes o agrégalos a mano.</p>}

      {comprobantes.map(c => {
        const editable = comprobanteEditable(c, esAdmin)
        const avisos = []
        if (c.coincidencia === 'numero') avisos.push({ ok: true, t: `Cuenta Maissy: ${c.cuenta_nombre}` })
        if (c.coincidencia === 'nombre') avisos.push({ ok: true, t: `Titular coincide con ${c.cuenta_nombre} (sin número para confirmar)` })
        if (c.coincidencia === 'ninguna') avisos.push({ ok: false, t: 'No coincide con ninguna cuenta de Maissy' })
        if (c.coincidencia === 'sin_datos') avisos.push({ ok: false, t: 'Las cuentas no tienen número/llave en Maestros: no se pudo validar el destino' })
        if (c.repetida) avisos.push({ ok: false, t: `Ya reportada antes (${c.repetida.fecha}${c.repetida.vendedor ? `, ${c.repetida.vendedor}` : ''})` })
        if (refsRepetidas.has((c.referencia || '').trim())) avisos.push({ ok: false, t: 'Referencia repetida en esta liquidación' })
        if (c.fecha_comprobante && fechaLiquidacion && c.fecha_comprobante !== fechaLiquidacion) avisos.push({ ok: false, t: `Fecha del comprobante: ${c.fecha_comprobante}` })
        if (c.observacion) avisos.push({ ok: false, t: c.observacion })
        return (
          <div key={c.key} className={fila}>
            <div className="flex gap-2 items-center">
              <InputDinero placeholder="Valor" value={c.valor} disabled={!editable}
                onChange={e => actualizar(c.key, { valor: e.target.value })} className={`${input} w-28 shrink-0 font-bold disabled:opacity-60`} />
              <input type="text" placeholder="Referencia (opcional)" value={c.referencia} disabled={!editable}
                onChange={e => actualizar(c.key, { referencia: e.target.value })} className={`${input} flex-1 disabled:opacity-60`} />
              {editable && <button type="button" onClick={() => quitar(c.key)} className="text-brand text-sm px-1 shrink-0">✕</button>}
            </div>
            {(c.banco || c.destino) && <p className={`text-[11px] mt-1 ${sutil}`}>{[c.banco, c.destino && `→ ${c.destino}`].filter(Boolean).join(' ')}</p>}
            {avisos.map((a, i) => <p key={i} className={`text-[11px] font-bold mt-0.5 ${a.ok ? 'text-emerald-600' : 'text-amber-600'}`}>{a.ok ? '✓' : '⚠'} {a.t}</p>)}

            {ESTADOS_RESUELTOS.includes(c.estadoOriginal) || c.legado ? (
              <p className={`text-xs font-bold mt-2 ${sutil}`}>
                {c.legado ? 'Registrada antes como total (cuenta como entregada)' : c.estadoOriginal === 'recibida' ? '✓ Llegó después (confirmada en Cartera)' : 'Descontada en nómina'}
              </p>
            ) : (
              <div className="mt-2">
                <div className="flex gap-2">
                  <button type="button" disabled={!esAdmin} onClick={() => actualizar(c.key, { estado: 'verificada' })}
                    className={`flex-1 text-xs font-bold py-1.5 rounded-lg disabled:opacity-40 ${c.estado === 'verificada' ? 'bg-emerald-600 text-white' : oscuro ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                    ✅ Ya llegó
                  </button>
                  <button type="button" disabled={!editable} onClick={() => actualizar(c.key, { estado: 'por_verificar' })}
                    className={`flex-1 text-xs font-bold py-1.5 rounded-lg ${c.estado === 'por_verificar' ? 'bg-amber-500 text-white' : oscuro ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                    ⏳ Por verificar
                  </button>
                </div>
                {c.estado === 'por_verificar' && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-xs ${sutil} shrink-0`}>Fecha límite acordada:</span>
                    <input type="date" value={c.fecha_limite} disabled={!editable} onChange={e => actualizar(c.key, { fecha_limite: e.target.value })}
                      className={`${input} flex-1 ${!c.fecha_limite ? 'border-amber-400' : ''}`} />
                  </div>
                )}
                {!esAdmin && <p className={`text-[11px] mt-1 ${sutil}`}>Solo un administrador puede marcarla como "Ya llegó" después de verla en el banco.</p>}
              </div>
            )}
          </div>
        )
      })}

      {comprobantes.length > 0 && (
        <div className={`text-xs mt-2 space-y-0.5 ${sutil}`}>
          <p>✅ Verificadas: <span className="font-bold">{fmt(verificadas)}</span> — cuentan como plata entregada</p>
          {porVerificar > 0 && <p>⏳ Por verificar: <span className="font-bold text-amber-600">{fmt(porVerificar)}</span> — quedan como deuda del vendedor; si no llegan a la fecha límite se le descuentan en nómina</p>}
        </div>
      )}
    </div>
  )
}
