'use client'
import { useState, useEffect } from 'react'
import { promoVigente } from '@/lib/promociones'
import { bancoDe, llaveDe, numeroLindo, logoRecortado } from '@/lib/cuenta-pago'

// Comprobante de venta (lo que antes se llamaba "Factura de venta"): no es
// factura electronica de la DIAN, es el documento de control que se le
// entrega o se le manda al cliente. Mismo look de Mi ruta, centrado arriba y
// abajo. Estilos en linea para que salga igual al imprimir y al compartir PDF.
// Sin rellenos: solo lineas y contornos, para no gastar tinta.
const C = { tinta: '#1C1B19', gris: '#5A5750', linea: '#E3E1D8', suave: '#F3F1EA', rojo: '#C41230', verde: '#2E5E3A', verdeF: '#E6F0E8', ambar: '#8A5A00', ambarF: '#FFF4CC' }
const TITULO = 'var(--font-titulo), Georgia, serif'
const TEXTO = 'var(--font-texto), "Segoe UI", system-ui, sans-serif'
const fmt = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
const conPuntos = (t) => (t || '').toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const telefono = (t) => { const d = (t || '').replace(/\D/g, ''); return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : t }
const PAGO = { efectivo: 'Efectivo', transferencia: 'Transferencia', fiado: 'Crédito', nomina: 'Descuento de nómina' }
const etiqueta = { fontSize: '11.5px', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.gris }

// Una linea del detalle, partida en promos y sueltas cuando la cuenta da
// exacto (las ventas guardan el total por producto, no cada promo).
const renglones = (d, nombre, promos) => {
  const cant = Number(d.cantidad) || 0
  const total = Number(d.subtotal ?? cant * Number(d.precio_unitario)) - Number(d.descuento || 0)
  const promo = promoVigente(promos, d.sku, null, '9999-12-31', { sinFecha: true })
  if (promo && cant >= promo.cantidad) {
    const paq = Math.floor(cant / promo.cantidad), sue = cant - paq * promo.cantidad
    const resto = total - paq * Number(promo.precio)
    const precioSuelta = sue > 0 ? resto / sue : 0
    if (sue === 0 ? Math.abs(resto) < 1 : resto > 0 && Math.abs(precioSuelta - Math.round(precioSuelta)) < 0.01) {
      const out = [{ cant: paq, nombre, promo: `${promo.nombre}`, nota: `${paq * promo.cantidad} unidades · ${promo.cantidad} por ${fmt(promo.precio)}`, precio: Number(promo.precio), total: paq * Number(promo.precio) }]
      if (sue > 0) out.push({ cant: sue, nombre, nota: 'Sueltas', precio: precioSuelta, total: resto })
      return out
    }
  }
  return [{ cant, nombre, precio: cant ? total / cant : 0, total, nota: Number(d.descuento) > 0 ? `Descuento ${fmt(d.descuento)}` : null }]
}

// partes: una venta mixta (Distri + Arepas) son dos ventas, una por empresa;
// el cliente recibe un solo comprobante con las dos partes.
export default function ComprobanteVenta({ venta: venta0, detalle, nombresPorSku, empresa: empresa0, cuenta, domicilio, credito, promos, partes: partesProp }) {
  const partes = (partesProp && partesProp.length ? partesProp : [{ venta: venta0, detalle, nombresPorSku, empresa: empresa0, cuenta, credito, promos }])
    .map(p => { const filas = p.detalle.flatMap(d => renglones(d, p.nombresPorSku[d.sku] || d.sku, p.promos || [])); return { ...p, filas, productos: filas.reduce((s, f) => s + f.total, 0) } })
  const mixta = partes.length > 1
  const venta = { ...partes[0].venta, total: partes.reduce((s, p) => s + Number(p.venta.total || 0), 0) }
  const empresa = partes[0].empresa
  const filas = partes.flatMap(p => mixta ? [{ titulo: p.empresa?.nombre }, ...p.filas] : p.filas)
  const productos = partes.reduce((s, p) => s + p.productos, 0)
  const valorDomicilio = Math.max(0, Math.round(Number(venta.total) - productos))
  const deudaTotal = partes.reduce((s, p) => s + (p.credito?.deudaTotal || 0), 0)
  const fechaPagoCredito = partes.map(p => p.credito?.fecha_pago).filter(Boolean).sort()[0]
  const cuentaPago = partes.map(p => p.cuenta).find(Boolean)
  // Cuenta para transferir (con numero): la de la transferencia o la del mostrador si es credito.
  const cuentaTransferir = partes.map(p => p.cuentaTransferir).find(Boolean)
  const [logo, setLogo] = useState(null)
  useEffect(() => { let vivo = true; logoRecortado(empresa?.logo_url).then(u => { if (vivo) setLogo(u) }); return () => { vivo = false } }, [empresa?.logo_url])
  const fecha = new Date(venta.created_at)
  const cuandoTxt = fecha.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
  const horaTxt = fecha.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit' })
  const pagado = venta.forma_pago !== 'fiado'
  const express = domicilio?.tipo === 'express'
  const direccionEntrega = domicilio ? [domicilio.direccion, domicilio.apto, domicilio.barrio].filter(Boolean).join(' · ') : venta.cliente_direccion
  const td = { padding: '11px 8px', borderBottom: `1px solid ${C.linea}`, verticalAlign: 'top' }
  const th = { ...etiqueta, textAlign: 'left', padding: '0 8px 8px', borderBottom: `1.5px solid ${C.tinta}` }
  const dato = (et, va, ancho) => va ? (
    <div style={{ gridColumn: ancho ? '1 / -1' : undefined }}><div style={etiqueta}>{et}</div><div style={{ fontWeight: 500 }}>{va}</div></div>
  ) : null

  return (
    <div style={{ fontFamily: TEXTO, color: C.tinta, fontSize: '15px', lineHeight: 1.45, display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '8px', paddingBottom: '18px', borderBottom: `1.5px solid ${C.tinta}` }}>
        {empresa?.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo || empresa.logo_url} alt={empresa.nombre} crossOrigin="anonymous" style={{ height: '96px', width: 'auto', maxWidth: '280px', objectFit: 'contain' }} />
        )}
        <div style={{ fontSize: '12.5px', color: C.gris, lineHeight: 1.5 }}>
          {partes.map((p, i) => <span key={i}>{i ? ' · ' : ''}<b style={{ color: C.tinta }}>{p.empresa?.nombre}</b>{!mixta && p.empresa?.nit ? ` · NIT ${conPuntos(p.empresa.nit)}` : ''}</span>)}{mixta && empresa?.nit ? ` · NIT ${conPuntos(empresa.nit)}` : ''}<br />
          {[empresa?.direccion, empresa?.ciudad].filter(Boolean).join(', ')}{empresa?.telefono ? ` · WhatsApp ${telefono(empresa.telefono)}` : ''}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', marginTop: '4px' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.rojo }}>Comprobante de venta</div>
          <div style={{ fontFamily: TITULO, fontWeight: 800, fontSize: mixta ? '20px' : '26px', lineHeight: 1.1 }}>{partes.map(p => `CV-${String(p.venta.numero || 0).padStart(8, '0')}`).join(' · ')}</div>
          <div style={{ fontSize: '13px', color: C.gris }}>{cuandoTxt.charAt(0).toUpperCase() + cuandoTxt.slice(1)} · {horaTxt}{venta.registrado_por ? <><br />Atendió: {venta.registrado_por}</> : null}</div>
        </div>
      </div>

      {(venta.cliente_nombre || venta.cliente_telefono || direccionEntrega || domicilio) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px 24px', border: `1px solid ${C.tinta}`, borderRadius: '12px', padding: '16px 18px' }}>
          {dato('Cliente', venta.cliente_nombre)}
          {dato('Teléfono', venta.cliente_telefono ? telefono(venta.cliente_telefono) : null)}
          {dato('Documento', venta.cliente_documento)}
          {domicilio
            ? dato('Entrega', <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, flexWrap: 'wrap' }}><span style={{ fontSize: '11.5px', fontWeight: 700, padding: '1px 8px', borderRadius: '999px', border: `1.5px solid ${C.tinta}` }}>{express ? 'Express' : 'Ruta'}</span>{direccionEntrega}</span>, true)
            : dato('Dirección', direccionEntrega, true)}
          {dato('Observaciones', [domicilio?.nota, express && domicilio?.domiciliario ? `Lo llevó ${domicilio.domiciliario}${domicilio.km ? ` (${domicilio.km} km)` : ''}` : null, !domicilio ? venta.observaciones : null].filter(Boolean).join(' · '), true)}
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
        <thead><tr>
          <th style={{ ...th, width: '52px' }}>Cant.</th><th style={th}>Producto</th><th style={{ ...th, textAlign: 'right' }}>Precio</th><th style={{ ...th, textAlign: 'right' }}>Total</th>
        </tr></thead>
        <tbody>
          {filas.map((f, i) => f.titulo ? (
            <tr key={i}><td colSpan={4} style={{ ...td, ...etiqueta, paddingTop: '14px', borderBottom: `1px solid ${C.linea}` }}>{f.titulo}</td></tr>
          ) : (
            <tr key={i}>
              <td style={{ ...td, fontWeight: 700 }}>{Number.isInteger(f.cant) ? f.cant : f.cant.toLocaleString('es-CO')}</td>
              <td style={td}>
                <b>{f.nombre}</b>
                {f.promo && <span style={{ display: 'inline-block', fontSize: '11px', fontWeight: 700, border: `1px solid ${C.tinta}`, padding: '0 7px', borderRadius: '999px', marginLeft: '6px' }}>{f.promo}</span>}
                {f.nota && <span style={{ display: 'block', color: C.gris, fontSize: '12.5px' }}>{f.nota}</span>}
              </td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(f.precio)}</td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(f.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '24px', alignItems: 'start' }}>
        <div style={{ border: `1px solid ${C.linea}`, borderRadius: '12px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px' }}>
          <div style={etiqueta}>Pago</div>
          <div><b>{PAGO[venta.forma_pago] || venta.forma_pago}</b>{venta.forma_pago === 'transferencia' && cuentaPago ? ` · ${cuentaPago.nombre}` : ''}{venta.forma_pago === 'fiado' && fechaPagoCredito ? ` · paga el ${new Date(fechaPagoCredito + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}` : ''}</div>
          {venta.forma_pago === 'efectivo' && Number(venta.valor_recibido) > Number(venta.total) && (
            <div style={{ color: C.gris }}>Recibido {fmt(venta.valor_recibido)} · vueltas {fmt(venta.valor_recibido - venta.total)}</div>
          )}
          {venta.forma_pago === 'fiado' && deudaTotal > 0 && (
            <div style={{ color: C.gris }}>Con esta compra debe en total <b style={{ color: C.tinta }}>{fmt(deudaTotal)}</b>{mixta ? ` (${partes.map(p => `${p.empresa?.nombre} ${fmt(p.credito?.deudaTotal || 0)}`).join(' · ')})` : ''}</div>
          )}
          {venta.estado === 'anulada' && <div style={{ color: '#8E1117', fontWeight: 700 }}>ANULADA{venta.motivo_anulacion ? ` · ${venta.motivo_anulacion}` : ''}</div>}
          <span style={{ alignSelf: 'flex-start', fontSize: '12px', fontWeight: 800, letterSpacing: '.06em', padding: '3px 10px', borderRadius: '999px', border: `1.5px solid ${C.tinta}` }}>{pagado ? 'PAGADO' : 'PENDIENTE'}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontVariantNumeric: 'tabular-nums', fontSize: '14px' }}>
          {mixta
            ? partes.map((p, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}><span style={{ color: C.gris }}>{p.empresa?.nombre}</span><span>{fmt(p.venta.total)}</span></div>)
            : <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}><span style={{ color: C.gris }}>Productos</span><span>{fmt(productos)}</span></div>}
          {!mixta && (valorDomicilio > 0 || domicilio) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}><span style={{ color: C.gris }}>{express ? `Domicilio express${domicilio?.km ? ` · ${domicilio.km} km` : ''}` : domicilio ? 'Domicilio con la ruta' : 'Domicilio'}</span><span>{fmt(valorDomicilio)}</span></div>
          )}
          <div style={{ marginTop: '6px', paddingTop: '10px', borderTop: `1.5px solid ${C.tinta}`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
            <span style={{ fontWeight: 700 }}>Total</span><b style={{ fontFamily: TITULO, fontWeight: 800, fontSize: '30px' }}>{fmt(venta.total)}</b>
          </div>
        </div>
      </div>

      {cuentaTransferir && (
        <div style={{ border: `2px solid ${C.tinta}`, borderRadius: '16px', padding: '14px 20px 16px' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: C.rojo, marginBottom: '6px' }}>Para transferir</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px 20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
              {bancoDe(cuentaTransferir) && <span style={{ fontSize: '13px', color: C.gris, fontWeight: 600 }}>{bancoDe(cuentaTransferir)}</span>}
              <span style={{ fontFamily: TITULO, fontWeight: 800, fontSize: '30px', letterSpacing: '.02em', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{numeroLindo(cuentaTransferir.numero)}</span>
              {cuentaTransferir.titular && <span style={{ fontSize: '13.5px' }}>Titular: <b>{cuentaTransferir.titular}</b></span>}
            </div>
            {llaveDe(cuentaTransferir) && (
              <div style={{ textAlign: 'center', border: `1.5px dashed ${C.tinta}`, borderRadius: '12px', padding: '10px 14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: C.gris }}>Llave Bre-B</div>
                <div style={{ fontFamily: TITULO, fontSize: '19px', fontWeight: 800 }}>{llaveDe(cuentaTransferir)}</div>
              </div>
            )}
          </div>
          <div style={{ fontSize: '12.5px', color: C.gris, marginTop: '6px' }}>{venta.forma_pago === 'fiado' ? 'Para pagar este crédito transfiere a esta cuenta y envía el comprobante por WhatsApp.' : 'La transferencia de esta compra se recibió en esta cuenta.'}</div>
        </div>
      )}

      <div style={{ borderTop: `1px dashed ${C.linea}`, paddingTop: '18px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '4px' }}>
        <div style={{ fontFamily: TITULO, fontWeight: 800, fontSize: '20px', color: C.rojo }}>Gracias por preferir Maissy</div>
        {empresa?.telefono && <div style={{ fontSize: '13.5px', color: C.gris }}>Pide por WhatsApp al {telefono(empresa.telefono)} y te lo llevamos.</div>}
        <div style={{ fontSize: '11.5px', color: C.gris, marginTop: '8px' }}>Documento de control, no es factura electrónica.<br />Hecho con MaissyPOS</div>
      </div>
    </div>
  )
}
