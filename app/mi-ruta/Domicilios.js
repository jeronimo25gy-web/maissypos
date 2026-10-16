'use client'
import { useState } from 'react'

// Burbuja de domicilios en Mi ruta: flota sobre el rutero con cuantos hay por
// entregar, avisa cuando entra uno nuevo y abre la lista desde abajo. Cada
// domicilio se entrega con ticket (Vender precargado) o se marca que no se pudo.
const TINTA = '#1C1B19', GRIS = '#5A5750', FONDO = '#F3F1EA', ROJO = '#C41230'
const titulo = { fontFamily: 'var(--font-titulo), Georgia, serif' }
const fmt = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO')
const PAGO = { efectivo: 'Efectivo', transferencia: 'Transferencia', credito: 'Crédito' }
const MOTIVOS = ['No estaba', 'No contestó', 'Canceló', 'No me alcanzó el producto', 'Otro']
const direccionDe = (d) => [d.edificio, d.apto, d.direccion, d.barrio].filter(Boolean).filter(t => !d.nombre_cliente.includes(t)).join(' · ')
const mapa = (d) => 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' +
  encodeURIComponent([d.direccion ? d.direccion.replace(/\s*#\s*/, ' #') : d.edificio, d.barrio, 'Medellín, Antioquia'].filter(Boolean).join(', '))
const soloDigitos = (t) => (t || '').replace(/\D/g, '')
const cuando = (d) => d.hora_limite ? `Antes ${d.hora_limite.slice(0, 5)}` : 'Cuando pases'

export default function BurbujaDomicilios({ domicilios, aviso, onCerrarAviso, onEntregar, onNoSePudo }) {
  const [abierta, setAbierta] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const [noSePudo, setNoSePudo] = useState(null) // { motivo, otro }
  const [guardando, setGuardando] = useState(false)

  if (domicilios.length === 0 && !abierta) return null
  const cerrar = () => { setAbierta(false); setDetalle(null); setNoSePudo(null) }

  const confirmarNoSePudo = async () => {
    const motivo = noSePudo.motivo === 'Otro' ? noSePudo.otro.trim() || 'Otro' : noSePudo.motivo
    if (!motivo) return
    setGuardando(true)
    await onNoSePudo(detalle, motivo)
    setGuardando(false)
    setDetalle(null); setNoSePudo(null)
  }

  return (
    <>
      {aviso && !abierta && (
        <button onClick={() => { onCerrarAviso(); setAbierta(true); setDetalle(aviso) }}
          className="fixed left-4 bottom-[96px] z-20 text-left rounded-2xl px-4 py-3 flex flex-col gap-0.5 text-white"
          style={{ right: 96, background: TINTA, boxShadow: '0 10px 24px rgba(28,27,25,.25)', marginBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#F2B21B' }}>Nuevo domicilio · {new Date(aviso.created_at).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}</span>
          <span className="font-bold text-[15px] truncate">{aviso.nombre_cliente}{aviso.apto ? ` · ${aviso.apto}` : ''}</span>
          <span className="text-[13px] opacity-85 truncate">{(aviso.domicilios_detalle || []).map(x => `${x.cantidad} ${x.nombre || x.sku}`).join(' + ')} · {cuando(aviso).toLowerCase()}</span>
        </button>
      )}

      {!abierta && (
        <button onClick={() => setAbierta(true)} aria-label={`Domicilios: ${domicilios.length} por entregar`}
          className="fixed right-4 bottom-[96px] z-20 w-16 h-16 rounded-full text-white flex items-center justify-center"
          style={{ background: ROJO, boxShadow: '0 10px 24px rgba(196,18,48,.4)', marginBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0M15 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0M9 17h6M3 13l2-5h6l2 5M13 9h4l3 4v4h-1" /></svg>
          <span className="absolute -top-0.5 -right-0.5 min-w-6 h-6 px-1.5 rounded-full font-extrabold text-sm flex items-center justify-center" style={{ background: '#F2B21B', color: TINTA, border: `2px solid ${FONDO}` }}>{domicilios.length}</span>
        </button>
      )}

      {abierta && (
        <div className="fixed inset-0 z-30 flex items-end justify-center" style={{ background: 'rgba(28,27,25,.45)' }} onClick={cerrar}>
          <div role="dialog" aria-modal="true" aria-label="Domicilios" onClick={e => e.stopPropagation()}
            className="w-full max-w-md rounded-t-3xl px-3.5 pt-2.5 flex flex-col gap-2.5 max-h-[92vh] overflow-y-auto"
            style={{ background: FONDO, paddingBottom: 'calc(18px + env(safe-area-inset-bottom, 0px))' }}>
            <div className="w-11 h-1.5 rounded-full self-center" style={{ background: '#D6D3C8' }} />

            {!detalle ? (
              <>
                <div className="flex items-end justify-between px-0.5">
                  <div>
                    <p className="font-extrabold text-2xl" style={titulo}>Domicilios</p>
                    <p className="text-sm" style={{ color: GRIS }}>{domicilios.length} por entregar</p>
                  </div>
                  <button onClick={cerrar} aria-label="Cerrar" className="w-11 h-11 rounded-xl bg-white text-xl font-bold">×</button>
                </div>
                {domicilios.length === 0 && <p className="text-center py-8" style={{ color: GRIS }}>No tienes domicilios pendientes.</p>}
                {domicilios.map((d, i) => (
                  <div key={d.id} className="bg-white rounded-2xl p-3.5 flex flex-col gap-2" style={i === 0 ? { outline: `2px solid ${ROJO}` } : undefined}>
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-base">{d.nombre_cliente}</p>
                        <p className="text-[13px]" style={{ color: GRIS }}>{direccionDe(d)}</p>
                      </div>
                      <span className="text-xs font-bold px-2.5 py-1.5 rounded-full whitespace-nowrap" style={d.hora_limite ? { color: '#8E1117', background: '#FBE9E9' } : { color: GRIS, background: FONDO }}>{cuando(d)}</span>
                    </div>
                    <p className="text-sm">{(d.domicilios_detalle || []).map(x => `${x.cantidad} ${x.nombre || x.sku}`).join(' · ')}</p>
                    <div className="flex justify-between items-center">
                      <span className="text-[13px]" style={{ color: GRIS }}>Paga {PAGO[d.forma_pago]?.toLowerCase()}{d.fecha && d.fecha < new Date().toLocaleDateString('en-CA') ? ' · de un día anterior' : ''}</span>
                      <span className="font-extrabold text-lg tabular-nums" style={titulo}>{fmt(d.total)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <a href={mapa(d)} target="_blank" rel="noreferrer" className="min-h-[44px] rounded-xl font-bold text-sm flex items-center justify-center" style={{ background: FONDO }}>Cómo llegar</a>
                      <button onClick={() => setDetalle(d)} className="min-h-[44px] rounded-xl font-bold text-sm text-white" style={{ background: i === 0 ? ROJO : TINTA }}>Abrir y entregar</button>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <>
                <div className="flex items-center gap-2.5">
                  <button onClick={() => { setDetalle(null); setNoSePudo(null) }} aria-label="Volver a domicilios" className="w-11 h-11 rounded-xl bg-white flex items-center justify-center shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
                  </button>
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: ROJO }}>Domicilio · {cuando(detalle).toLowerCase()}</p>
                    <p className="font-extrabold text-xl truncate" style={titulo}>{detalle.nombre_cliente}</p>
                  </div>
                </div>
                <dl className="bg-white rounded-2xl p-3.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                  <dt style={{ color: GRIS }}>Dirección</dt><dd className="font-bold">{[detalle.direccion, detalle.apto].filter(Boolean).join(', ') || '—'}</dd>
                  {detalle.edificio && <><dt style={{ color: GRIS }}>Edificio</dt><dd className="font-bold">{detalle.edificio}</dd></>}
                  <dt style={{ color: GRIS }}>Barrio</dt><dd className="font-bold">{detalle.barrio || '—'}</dd>
                  <dt style={{ color: GRIS }}>Teléfono</dt><dd className="font-bold tabular-nums">{detalle.telefono || '—'}</dd>
                  {detalle.nota && <><dt style={{ color: GRIS }}>Nota</dt><dd className="font-bold">{detalle.nota}</dd></>}
                  {detalle.tomado_por && <><dt style={{ color: GRIS }}>Tomó el pedido</dt><dd className="font-bold">{detalle.tomado_por}</dd></>}
                </dl>
                <div className="bg-white rounded-2xl p-3.5 flex flex-col gap-1.5">
                  <p className="text-[13px] font-bold" style={{ color: GRIS }}>Pedido</p>
                  {(detalle.domicilios_detalle || []).map(x => (
                    <div key={x.sku} className="flex justify-between text-[15px]"><span>{x.cantidad} {x.nombre || x.sku}</span><b className="tabular-nums">{fmt(x.subtotal)}</b></div>
                  ))}
                  <div className="border-t border-dashed pt-2 mt-1 flex justify-between items-baseline" style={{ borderColor: '#D6D3C8' }}>
                    <span className="font-bold">Total</span><span className="font-extrabold text-2xl tabular-nums" style={titulo}>{fmt(detalle.total)}</span>
                  </div>
                  <p className="text-[13px]" style={{ color: GRIS }}>Paga {PAGO[detalle.forma_pago]?.toLowerCase()}{detalle.forma_pago === 'transferencia' ? ' · el ticket la deja por verificar' : ''}</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {detalle.telefono ? <a href={`tel:${soloDigitos(detalle.telefono)}`} className="min-h-[48px] rounded-xl bg-white font-bold text-sm flex items-center justify-center">Llamar</a> : <span />}
                  {detalle.telefono ? <a href={`https://wa.me/57${soloDigitos(detalle.telefono).slice(-10)}`} target="_blank" rel="noreferrer" className="min-h-[48px] rounded-xl bg-white font-bold text-sm flex items-center justify-center">WhatsApp</a> : <span />}
                  <a href={mapa(detalle)} target="_blank" rel="noreferrer" className="min-h-[48px] rounded-xl bg-white font-bold text-sm flex items-center justify-center">Cómo llegar</a>
                </div>

                {!noSePudo ? (
                  <>
                    <button onClick={() => { const d = detalle; cerrar(); onEntregar(d) }} className="min-h-[56px] rounded-2xl px-4 flex items-center justify-between text-white font-bold text-[17px]" style={{ background: '#2E5E3A' }}>
                      <span className="tabular-nums">Entregar · {fmt(detalle.total)}</span><span>Generar ticket</span>
                    </button>
                    <p className="text-[13px] text-center -mt-1" style={{ color: GRIS }}>Si el cliente cambia algo, lo ajustas en la pantalla de vender antes del ticket.</p>
                    <button onClick={() => setNoSePudo({ motivo: '', otro: '' })} className="min-h-[48px] rounded-2xl font-bold text-sm" style={{ background: '#FBE9E9', color: '#8E1117' }}>No se pudo entregar</button>
                  </>
                ) : (
                  <div className="bg-white rounded-2xl p-3.5 flex flex-col gap-2">
                    <p className="font-bold">¿Por qué no se pudo?</p>
                    <div className="grid grid-cols-2 gap-2">
                      {MOTIVOS.map(m => (
                        <button key={m} type="button" onClick={() => setNoSePudo({ ...noSePudo, motivo: m })} aria-pressed={noSePudo.motivo === m}
                          className="min-h-[44px] rounded-xl font-bold text-sm" style={noSePudo.motivo === m ? { background: TINTA, color: '#fff' } : { background: FONDO }}>{m}</button>
                      ))}
                    </div>
                    {noSePudo.motivo === 'Otro' && <input value={noSePudo.otro} onChange={e => setNoSePudo({ ...noSePudo, otro: e.target.value })} placeholder="Cuéntale al admin qué pasó" className="border-2 rounded-xl px-3 min-h-[48px]" style={{ borderColor: '#E3E1D8' }} />}
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => setNoSePudo(null)} className="min-h-[48px] rounded-xl font-bold border-2" style={{ borderColor: '#E3E1D8' }}>Volver</button>
                      <button onClick={confirmarNoSePudo} disabled={!noSePudo.motivo || guardando} className="min-h-[48px] rounded-xl font-bold text-white disabled:opacity-40" style={{ background: ROJO }}>{guardando ? 'Guardando...' : 'Avisar al admin'}</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
