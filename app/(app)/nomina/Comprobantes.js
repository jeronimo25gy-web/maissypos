'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getEmpresaId } from '@/lib/empresa'
import { generarYCompartirPDF } from '@/lib/compartir'
import { nombreQuincena, nombreMesQ, textoRango, NOMBRE_TIPO, tipoEmpleado } from '@/lib/nomina'
import { C, $, fechaCorta, Tarjeta, H2, Nota, Boton, campoEstilo } from '../gastos/ui'

// Comprobantes de pago de nómina: lista por quincena y la hoja de cada
// empleado (PDF para WhatsApp o impresión).
const fechaLarga = (f) => f ? new Date(String(f).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
const n = (x) => Number(x || 0)

// Devengos y deducciones de un pago; los pagos anteriores al detalle se arman con sus columnas.
export function desglosePago(p) {
  if (p.detalle?.devengos) return p.detalle
  const devengos = [{ concepto: 'Salario', valor: n(p.salario_base) }]
  if (n(p.comision)) devengos.push({ concepto: 'Comisión', valor: n(p.comision) })
  const deducciones = [
    { concepto: 'Salud', valor: n(p.deduccion_salud) }, { concepto: 'Pensión', valor: n(p.deduccion_pension) },
    ...(p.detalle_descuentos || []).map(d => ({ concepto: d.tipo, valor: n(d.valor) })),
  ]
  return { devengos, deducciones, prestamos: [], total_devengado: devengos.reduce((s, d) => s + d.valor, 0), total_deducciones: deducciones.reduce((s, d) => s + d.valor, 0) }
}

// Concepto con su fecha entre paréntesis al final: "Descuadre (2026-10-14)" → ["Descuadre", "14 de octubre"].
const partir = (c) => {
  const m = String(c).match(/^(.*) \((\d{4}-\d{2}-\d{2})\)$/)
  return m ? [m[1], new Date(m[2] + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })] : String(c).includes(' · ') ? String(c).split(' · ') : [c, null]
}

export default function Comprobantes({ base, periodo }) {
  const { empleados } = base
  const [mes, setMes] = useState(periodo.mes)
  const [pagos, setPagos] = useState(null)
  const [empresa, setEmpresa] = useState(null)
  const [cuentas, setCuentas] = useState({})
  const [rutas, setRutas] = useState({})
  const [abierto, setAbierto] = useState(null)
  const [compartiendo, setCompartiendo] = useState(false)

  const cargar = useCallback(async () => {
    const id = getEmpresaId()
    const [{ data: ps }, { data: emp }, { data: cue }, { data: vend }] = await Promise.all([
      supabase.from('nomina_pagos').select('*').eq('empresa_id', id).eq('periodo', mes).order('quincena', { ascending: false, nullsFirst: false }).order('created_at'),
      supabase.from('empresas').select('nombre, nit, direccion, ciudad, telefono, logo_url').eq('id', id).maybeSingle(),
      supabase.from('cuentas').select('id, nombre').eq('empresa_id', id),
      supabase.from('vendedores').select('id, rutas(nombre)').eq('empresa_id', id),
    ])
    setPagos(ps || [])
    setEmpresa(emp)
    setCuentas(Object.fromEntries((cue || []).map(c => [c.id, c.nombre])))
    setRutas(Object.fromEntries((vend || []).map(v => [v.id, v.rutas?.nombre ? v.rutas.nombre.replace(/^RUTA\s+/i, '').replace(/\b(\w)(\w*)/g, (_, x, y) => x + y.toLowerCase()) : null])))
  }, [mes])
  useEffect(() => { cargar() }, [cargar])

  const empleado = (id) => empleados.find(e => e.id === id) || {}
  const grupos = {}
  ;(pagos || []).forEach(p => { const k = p.quincena || 0; (grupos[k] = grupos[k] || []).push(p) })

  if (abierto) {
    const e = empleado(abierto.empleado_id)
    const compartir = async () => {
      setCompartiendo(true)
      try { await generarYCompartirPDF('comprobante-nomina', `Comprobante de nómina - ${e.nombre || ''} - ${periodoDe(abierto, e)}`) }
      finally { setCompartiendo(false) }
    }
    return (
      <div className="flex flex-col gap-3">
        <div className="flex gap-2 flex-wrap">
          <Boton onClick={() => setAbierto(null)}>Volver</Boton>
          <Boton tono="rojo" onClick={compartir} disabled={compartiendo}>{compartiendo ? 'Generando PDF…' : 'Compartir PDF'}</Boton>
          <Boton onClick={() => window.print()}>Imprimir</Boton>
        </div>
        <style>{`@media print { body * { visibility: hidden } #comprobante-nomina, #comprobante-nomina * { visibility: visible } #comprobante-nomina { position: absolute; left: 0; top: 0; width: 100% !important; min-width: 0 !important; box-shadow: none !important; border-radius: 0 !important } @page { size: letter; margin: 12mm } }`}</style>
        <div className="overflow-x-auto">
          <Hoja pago={abierto} e={e} empresa={empresa} cuenta={cuentas[abierto.cuenta_id]} ruta={rutas[e.vendedor_id]} />
        </div>
      </div>
    )
  }

  const mesesOpc = (() => { const out = []; const [y, m] = periodo.mes.split('-').map(Number); for (let i = 0; i < 6; i++) { const d = new Date(y, m - 1 - i, 1); out.push(d.toLocaleDateString('en-CA').slice(0, 7)) } return out })()
  return (
    <div className="flex flex-col gap-4">
      <select value={mes} onChange={e => setMes(e.target.value)} aria-label="Mes" className="h-10 rounded-xl px-3 text-sm font-bold bg-white w-max" style={campoEstilo}>
        {mesesOpc.map(m => <option key={m} value={m}>{nombreQuincena(m).replace(/^\w/, c => c.toUpperCase())}</option>)}
      </select>
      {!pagos ? <Nota>Cargando…</Nota> : pagos.length === 0 ? <Tarjeta><Nota>Sin pagos de nómina en {nombreQuincena(mes)}.</Nota></Tarjeta> : (
        Object.keys(grupos).sort((a, b) => b - a).map(k => (
          <Tarjeta key={k}>
            <div className="flex justify-between items-center gap-2 flex-wrap">
              <H2>Comprobantes · {Number(k) ? nombreMesQ(mes, Number(k)).toLowerCase() : nombreQuincena(mes)}</H2>
              <b className="tabular-nums">{$(grupos[k].reduce((s, p) => s + n(p.neto_a_pagar), 0))}</b>
            </div>
            {grupos[k].map((p, i) => {
              const e = empleado(p.empleado_id)
              return (
                <div key={p.id} className="grid gap-2.5 items-center pt-2.5" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', borderTop: i ? `1px solid ${C.linea}` : 0 }}>
                  <span className="min-w-0"><b>{e.nombre || 'Empleado'}</b><span className="block text-[13px]" style={{ color: C.gris }}>{e.cargo || NOMBRE_TIPO[tipoEmpleado(e)]} · pagado {fechaCorta(p.fecha_pago)}{cuentas[p.cuenta_id] ? ` · ${cuentas[p.cuenta_id]}` : ''}</span></span>
                  <span className="flex gap-2.5 items-center"><b className="tabular-nums">{$(p.neto_a_pagar)}</b><Boton onClick={() => setAbierto(p)}>Ver</Boton></span>
                </div>
              )
            })}
          </Tarjeta>
        ))
      )}
    </div>
  )
}

// Periodo de un pago: el guardado al pagar o, en pagos anteriores, el del empleado.
const periodoDe = (p, e) => p.detalle?.desde ? textoRango(p.detalle.desde, p.detalle.hasta) : nombreQuincena(p.periodo, p.quincena, e)

// Hoja del comprobante. Estilos en línea para que el PDF salga igual a la pantalla.
const T = { tinta: '#1C1B19', gris: '#5A5750', fondo: 'var(--hoja)', linea: '#E3E1D8', suave: '#EFEDE6', rojo: 'var(--rojo)', amarillo: 'var(--acento)', verde: '#2E5E3A' }
const fuenteTitulo = 'var(--font-titulo), Georgia, serif'
const rotulo = { fontSize: 11.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: T.gris }

function Hoja({ pago, e, empresa, cuenta, ruta }) {
  const d = desglosePago(pago)
  const totalDev = d.total_devengado ?? d.totalDevengado ?? 0
  const totalDed = d.total_deducciones ?? d.totalDeducciones ?? 0
  const numero = `${pago.periodo}-${pago.quincena || 'M'}-${String(pago.id).slice(0, 4).toUpperCase()}`
  // La cuota de un préstamo muestra el saldo que queda debajo del concepto.
  const saldoDe = (c) => {
    const m = String(c).match(/^Cuota préstamo (\d+) de (\d+)/)
    const x = m && (d.prestamos || []).find(y => String(y.numero) === m[1] && String(y.num_cuotas) === m[2])
    return x ? `Saldo pendiente ${$(x.saldo_despues)}` : null
  }
  const Fila = ({ c, v, signo }) => { const saldo = saldoDe(c); const [a, b] = saldo ? [String(c).split(' · ')[0], saldo] : partir(c); return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: `1px solid ${T.linea}` }}>
      <span>{a}{b && <span style={{ display: 'block', color: T.gris, fontSize: 12 }}>{b}</span>}</span><b style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{signo}{$(v)}</b>
    </div>
  ) }
  const Columna = ({ titulo: t, lista, signo, total, rotuloTotal }) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...rotulo, fontSize: 12, display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: `1.5px solid ${T.tinta}` }}><span>{t}</span><span>Valor</span></div>
      {lista.map((x, i) => <Fila key={i} c={x.concepto} v={x.valor} signo={signo} />)}
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 9, fontWeight: 800 }}><span>{rotuloTotal}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{signo}{$(total)}</span></div>
    </div>
  )
  const datos = [['Empleado', e.nombre], ['Cédula', e.documento || '—'], ['Cargo', e.cargo || '—'], ['Salario mensual', $(e.salario_base)], ['Días liquidados', d.dias ?? (pago.quincena ? 15 : 30)], ...(ruta ? [['Ruta', ruta]] : [])]
  return (
    <article id="comprobante-nomina" style={{ background: '#fff', color: T.tinta, width: 780, maxWidth: '100%', minWidth: 600, margin: '0 auto', borderRadius: 6, boxShadow: `0 1px 0 ${T.linea}, 0 18px 40px rgba(28,27,25,.10)`, padding: '30px 30px 22px', display: 'flex', flexDirection: 'column', gap: 18, position: 'relative', overflow: 'hidden', fontFamily: 'var(--font-texto), system-ui, sans-serif', fontSize: 14, lineHeight: 1.4 }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, background: T.rojo }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {empresa?.logo_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={empresa.logo_url} alt="" crossOrigin="anonymous" style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 12 }} />
            : <div style={{ width: 52, height: 52, borderRadius: 12, border: `2px solid ${T.rojo}`, color: T.rojo, display: 'grid', placeItems: 'center', fontFamily: fuenteTitulo, fontWeight: 800, fontSize: 22 }}>{(empresa?.nombre || 'M')[0]}</div>}
          <div>
            <div style={{ fontFamily: fuenteTitulo, fontSize: 20, fontWeight: 800 }}>{empresa?.nombre}</div>
            <div style={{ fontSize: 12.5, color: T.gris }}>{[empresa?.nit && `NIT ${empresa.nit}`, empresa?.direccion, empresa?.ciudad, empresa?.telefono && `Tel. ${empresa.telefono}`].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ ...rotulo, fontSize: 12.5, letterSpacing: '.08em' }}>Comprobante de pago de nómina</div>
          <div style={{ fontFamily: fuenteTitulo, fontSize: 20, fontWeight: 800 }}>{periodoDe(pago, e).replace(/^\w/, c => c.toUpperCase())}</div>
          <div style={{ fontSize: 12.5, color: T.gris }}>{pago.quincena ? (pago.quincena === 1 ? 'Primera quincena' : 'Segunda quincena') : 'Pago mensual'} · N.º {numero}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px 18px', border: `1px solid ${T.linea}`, borderRadius: 10, padding: '12px 14px' }}>
        {datos.map(([r, v]) => <div key={r}><div style={rotulo}>{r}</div><div style={{ fontWeight: 700 }}>{v}</div></div>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
        <Columna titulo="Devengado" lista={d.devengos} signo="" total={totalDev} rotuloTotal="Total devengado" />
        <Columna titulo="Deducciones" lista={d.deducciones} signo="−" total={totalDed} rotuloTotal="Total deducciones" />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, border: `2px solid ${T.tinta}`, borderRadius: 10, padding: '14px 18px' }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: T.gris }}>Neto a pagar</div>
          <div style={{ fontSize: 12.5, color: T.gris }}>Pagado el {fechaLarga(pago.fecha_pago)}{cuenta ? ` · ${cuenta}` : ''}</div>
        </div>
        <div style={{ fontFamily: fuenteTitulo, fontSize: 32, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{$(pago.neto_a_pagar)}</div>
      </div>


      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 36, marginTop: 26 }}>
        <div style={{ borderTop: `1px solid ${T.tinta}`, paddingTop: 6, fontSize: 12, textAlign: 'center', color: T.gris }}>Firma del empleador</div>
        <div style={{ borderTop: `1px solid ${T.tinta}`, paddingTop: 6, fontSize: 12, textAlign: 'center', color: T.gris }}>Recibí conforme · {e.nombre}{e.documento ? ` · C.C. ${e.documento}` : ''}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11.5, color: T.gris, borderTop: `1px dashed ${T.linea}`, paddingTop: 10 }}>
        <span>Generado por MaissyPOS</span><span>Los aportes de seguridad social se pagan por planilla PILA</span>
      </div>
    </article>
  )
}
